import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type { VoiceIntent } from '@ansimtrack/shared-types'

import {
  getVoiceRuntimeStatus,
  listenForVoiceIntent,
  listenToVoiceRuntimeEvents,
  speakVoiceReply,
  stopVoiceReply,
  type VoiceIntentRecognitionResult,
  type VoiceRuntimeEvent,
} from './desktop-bridge'

export type VoiceTtsMode = 'native' | 'browser' | 'text'
export type VoiceSttMode = 'native' | 'browser' | 'text'

export type VoiceRuntimeState = {
  available: boolean
  listening: boolean
  notice: string
  preferredVoiceName: string | null
  speaking: boolean
  sttMode: VoiceSttMode
  transcript: string
  ttsMode: VoiceTtsMode
}

type BrowserSpeechRecognitionInstance = EventTarget & {
  abort(): void
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  onresult:
    | ((event: {
        resultIndex: number
        results: ArrayLike<ArrayLike<{ transcript: string }>>
      }) => void)
    | null
  start(): void
  stop(): void
}

type BrowserSpeechRecognitionConstructor =
  new () => BrowserSpeechRecognitionInstance

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor
  }
}

const browserTtsAvailable =
  typeof window !== 'undefined' &&
  'speechSynthesis' in window &&
  typeof SpeechSynthesisUtterance !== 'undefined'

const browserSttAvailable =
  typeof window !== 'undefined' &&
  Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)

const defaultVoiceRuntimeState: VoiceRuntimeState = {
  available: browserTtsAvailable,
  listening: false,
  notice: '버튼 intent가 먼저입니다. 음성 입력은 지원 문장만 짧게 받습니다.',
  preferredVoiceName: null,
  speaking: false,
  sttMode: browserSttAvailable ? 'browser' : 'text',
  transcript: '',
  ttsMode: browserTtsAvailable ? 'browser' : 'text',
}

const intentPhraseCatalog: Array<[VoiceIntent, string[]]> = [
  ['repeat', ['다시 말해줘', '다시 설명해줘', '다시']],
  ['easy', ['더 쉽게 말해줘', '쉽게 말해줘', '쉽게']],
  ['why', ['왜 그래', '왜']],
  [
    'action',
    ['지금 뭐 해야 해', '지금 뭐 해야 해?', '지금 뭐해', '무엇을 해야 해'],
  ],
  [
    'report',
    ['119에 뭐라고 말해', '119에 뭐라고 말해?', '신고 뭐라고 해', '신고'],
  ],
]

export function useVoiceRuntime() {
  const [state, setState] = useState(defaultVoiceRuntimeState)
  const nativeRequestIdRef = useRef<number | null>(null)
  const browserRecognitionRef = useRef<BrowserSpeechRecognitionInstance | null>(
    null,
  )

  const preferredModes = useMemo(
    () => ({
      stt: state.sttMode,
      tts: state.ttsMode,
    }),
    [state.sttMode, state.ttsMode],
  )

  useEffect(() => {
    let isActive = true
    let unlistenVoiceEvents = () => {}

    void (async () => {
      const nativeStatus = await getVoiceRuntimeStatus()
      if (!isActive) {
        return
      }

      setState((current) => {
        const ttsMode: VoiceTtsMode = nativeStatus.nativeTtsAvailable
          ? 'native'
          : browserTtsAvailable
            ? 'browser'
            : 'text'
        const sttMode: VoiceSttMode = nativeStatus.nativeSttAvailable
          ? 'native'
          : browserSttAvailable
            ? 'browser'
            : 'text'

        return {
          ...current,
          available: ttsMode !== 'text',
          notice: buildVoiceRuntimeNotice({
            preferredVoiceName: nativeStatus.preferredVoiceName,
            sttMode,
            ttsMode,
          }),
          preferredVoiceName: nativeStatus.preferredVoiceName,
          sttMode,
          ttsMode,
        }
      })

      unlistenVoiceEvents = await listenToVoiceRuntimeEvents((event) => {
        handleVoiceRuntimeEvent(event, nativeRequestIdRef, setState)
      })
    })()

    return () => {
      isActive = false
      unlistenVoiceEvents()
      browserRecognitionRef.current?.abort()
      browserRecognitionRef.current = null
    }
  }, [])

  const speakWithBrowser = useCallback((text: string) => {
    if (!browserTtsAvailable) {
      setState((current) => ({
        ...current,
        available: false,
        notice: '이 환경에서는 음성 재생이 없어 텍스트 카드만 유지합니다.',
        speaking: false,
      }))
      return
    }

    const synthesis = window.speechSynthesis
    synthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    const preferredVoice = pickPreferredVoice(synthesis.getVoices())

    utterance.lang = preferredVoice?.lang ?? 'ko-KR'
    utterance.rate = 0.94
    utterance.pitch = 1
    utterance.voice = preferredVoice ?? null

    utterance.onstart = () => {
      setState((current) => ({
        ...current,
        available: true,
        notice: '브라우저 음성으로 현재 세그먼트를 읽는 중입니다.',
        preferredVoiceName: preferredVoice?.name ?? current.preferredVoiceName,
        speaking: true,
      }))
    }

    utterance.onend = () => {
      setState((current) => ({
        ...current,
        available: true,
        notice:
          '음성 재생이 끝났습니다. 다른 intent를 눌러 다시 들을 수 있습니다.',
        preferredVoiceName: preferredVoice?.name ?? current.preferredVoiceName,
        speaking: false,
      }))
    }

    utterance.onerror = () => {
      setState((current) => ({
        ...current,
        available: true,
        notice: '음성 재생에 실패해 텍스트 카드만 유지합니다.',
        preferredVoiceName: preferredVoice?.name ?? current.preferredVoiceName,
        speaking: false,
      }))
    }

    synthesis.speak(utterance)
  }, [])

  const speak = useCallback(
    async (text: string) => {
      if (preferredModes.tts === 'native') {
        try {
          const result = await speakVoiceReply({ text })
          nativeRequestIdRef.current = result.requestId
          setState((current) => ({
            ...current,
            available: true,
            notice: `${
              current.preferredVoiceName ?? 'macOS 기본 음성'
            }으로 현재 세그먼트를 읽는 중입니다.`,
            speaking: true,
          }))
          return
        } catch {
          if (browserTtsAvailable) {
            speakWithBrowser(text)
            return
          }

          setState((current) => ({
            ...current,
            available: false,
            notice: '네이티브 음성 재생에 실패해 텍스트 카드만 유지합니다.',
            speaking: false,
          }))
          return
        }
      }

      if (preferredModes.tts === 'browser') {
        speakWithBrowser(text)
        return
      }

      setState((current) => ({
        ...current,
        available: false,
        notice: '음성 엔진이 없어 텍스트 카드만 유지합니다.',
        speaking: false,
      }))
    },
    [preferredModes.tts, speakWithBrowser],
  )

  const stop = useCallback(async () => {
    browserRecognitionRef.current?.abort()
    browserRecognitionRef.current = null

    if (
      preferredModes.tts === 'native' &&
      nativeRequestIdRef.current !== null
    ) {
      try {
        await stopVoiceReply()
      } catch {
        // Ignore stop failures and keep local UI fallback.
      }

      nativeRequestIdRef.current = null
      setState((current) => ({
        ...current,
        notice: '네이티브 음성 재생을 중지했습니다.',
        speaking: false,
      }))
      return
    }

    if (browserTtsAvailable) {
      window.speechSynthesis.cancel()
    }

    setState((current) => ({
      ...current,
      listening: false,
      notice: '음성 재생을 중지했습니다.',
      speaking: false,
    }))
  }, [preferredModes.tts])

  const listenWithBrowser = useCallback(async () => {
    const Recognition =
      typeof window !== 'undefined'
        ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
        : undefined

    if (!Recognition) {
      return {
        message: '브라우저 음성 인식이 없습니다.',
        source: 'text',
        status: 'unavailable',
      } satisfies VoiceIntentRecognitionResult
    }

    return new Promise<VoiceIntentRecognitionResult>((resolve) => {
      const recognition = new Recognition()
      let settled = false
      let timeoutId: number | null = null

      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = 'ko-KR'
      recognition.maxAlternatives = 1
      browserRecognitionRef.current = recognition

      const finish = (result: VoiceIntentRecognitionResult) => {
        if (settled) {
          return
        }

        settled = true
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId)
        }
        browserRecognitionRef.current = null
        resolve(result)
      }

      recognition.onresult = (event) => {
        const transcript =
          event.results?.[event.resultIndex]?.[0]?.transcript?.trim() ?? ''
        const intent = classifyVoiceIntentFromText(transcript)

        finish({
          intent,
          message: intent
            ? null
            : '지원 문장과 맞지 않아 텍스트 명령 fallback으로 전환합니다.',
          source: 'browser-stt',
          status: intent ? 'recognized' : 'no-match',
          transcript,
        })
      }

      recognition.onerror = (event) => {
        finish({
          message: event.error,
          source: 'browser-stt',
          status: 'error',
        })
      }

      recognition.onend = () => {
        finish({
          message: '브라우저 음성 인식이 종료되었습니다.',
          source: 'browser-stt',
          status: 'timeout',
        })
      }

      timeoutId = window.setTimeout(() => {
        recognition.abort()
        finish({
          message: '음성 입력 시간이 지났습니다.',
          source: 'browser-stt',
          status: 'timeout',
        })
      }, 6_000)

      try {
        recognition.start()
      } catch {
        finish({
          message: '브라우저 음성 인식을 시작하지 못했습니다.',
          source: 'browser-stt',
          status: 'error',
        })
      }
    })
  }, [])

  const listen = useCallback(async () => {
    setState((current) => ({
      ...current,
      listening: true,
      notice:
        preferredModes.stt === 'native'
          ? '지원 문장을 듣는 중입니다. 짧게 말해 주세요.'
          : '브라우저 음성 인식을 시작했습니다. 짧게 말해 주세요.',
    }))

    let result: VoiceIntentRecognitionResult

    if (preferredModes.stt === 'native') {
      try {
        result = await listenForVoiceIntent({ timeoutMs: 6000 })
      } catch {
        result = browserSttAvailable
          ? await listenWithBrowser()
          : {
              message: '네이티브 음성 인식이 없어 텍스트 입력으로 전환합니다.',
              source: 'text',
              status: 'unavailable',
            }
      }
    } else if (preferredModes.stt === 'browser') {
      result = await listenWithBrowser()
    } else {
      result = {
        message: '음성 인식이 없어 텍스트 입력으로 전환합니다.',
        source: 'text',
        status: 'unavailable',
      }
    }

    const resolvedIntent =
      result.intent && isVoiceIntent(result.intent)
        ? result.intent
        : classifyVoiceIntentFromText(result.transcript ?? '')

    setState((current) => ({
      ...current,
      listening: false,
      notice: buildRecognitionNotice(result, Boolean(resolvedIntent)),
      transcript: result.transcript ?? '',
    }))

    if (result.status === 'recognized' && resolvedIntent) {
      return {
        ...result,
        intent: resolvedIntent,
      } satisfies VoiceIntentRecognitionResult & { intent: VoiceIntent }
    }

    return {
      ...result,
      intent: resolvedIntent,
      status:
        result.status === 'recognized' && !resolvedIntent
          ? 'no-match'
          : result.status,
    } satisfies VoiceIntentRecognitionResult
  }, [listenWithBrowser, preferredModes.stt])

  return {
    listen,
    speak,
    state,
    stop,
  }
}

function handleVoiceRuntimeEvent(
  event: VoiceRuntimeEvent,
  nativeRequestIdRef: MutableRefObject<number | null>,
  setState: Dispatch<SetStateAction<VoiceRuntimeState>>,
) {
  if (
    nativeRequestIdRef.current !== null &&
    event.requestId !== nativeRequestIdRef.current
  ) {
    return
  }

  if (event.type !== 'tts-started') {
    nativeRequestIdRef.current = null
  }

  switch (event.type) {
    case 'tts-started':
      setState((current) => ({
        ...current,
        speaking: true,
      }))
      return
    case 'tts-finished':
      setState((current) => ({
        ...current,
        notice:
          '네이티브 음성 재생이 끝났습니다. 다른 intent를 눌러 다시 들을 수 있습니다.',
        speaking: false,
      }))
      return
    case 'tts-stopped':
      setState((current) => ({
        ...current,
        notice: '네이티브 음성 재생을 중지했습니다.',
        speaking: false,
      }))
      return
    case 'tts-error':
      setState((current) => ({
        ...current,
        notice:
          event.message ??
          '네이티브 음성 재생에 실패해 텍스트 카드만 유지합니다.',
        speaking: false,
      }))
  }
}

function buildVoiceRuntimeNotice(input: {
  preferredVoiceName: string | null
  sttMode: VoiceSttMode
  ttsMode: VoiceTtsMode
}) {
  const ttsLabel =
    input.ttsMode === 'native'
      ? input.preferredVoiceName
        ? `macOS 음성(${input.preferredVoiceName})`
        : 'macOS 음성'
      : input.ttsMode === 'browser'
        ? '브라우저 음성'
        : '텍스트만'
  const sttLabel =
    input.sttMode === 'native'
      ? '네이티브 마이크 intent'
      : input.sttMode === 'browser'
        ? '브라우저 음성 인식'
        : '텍스트 fallback'

  return `${ttsLabel} 우선, ${sttLabel} 보조 경로로 동작합니다.`
}

function buildRecognitionNotice(
  result: VoiceIntentRecognitionResult,
  hasIntent: boolean,
) {
  if (result.status === 'recognized' && hasIntent) {
    return '지원 intent를 인식했습니다. 현재 세그먼트 기준으로 바로 다시 설명합니다.'
  }

  if (result.status === 'timeout') {
    return '음성 입력 시간이 지나 버튼이나 텍스트 명령으로 전환합니다.'
  }

  if (result.status === 'no-match') {
    return (
      result.message ??
      '지원 문장과 맞지 않아 텍스트 명령 fallback으로 전환합니다.'
    )
  }

  if (result.status === 'error') {
    return '음성 인식에 실패해 버튼 또는 텍스트 명령으로 전환합니다.'
  }

  return result.message ?? '음성 인식이 없어 텍스트 명령 fallback을 사용합니다.'
}

function isVoiceIntent(value: string): value is VoiceIntent {
  return ['repeat', 'easy', 'why', 'action', 'report'].includes(value)
}

export function classifyVoiceIntentFromText(input: string): VoiceIntent | null {
  const normalized = normalizeCommandText(input)
  if (!normalized) {
    return null
  }

  for (const [intent, phrases] of intentPhraseCatalog) {
    if (phrases.some((phrase) => normalizeCommandText(phrase) === normalized)) {
      return intent
    }
  }

  return null
}

function normalizeCommandText(input: string) {
  return input
    .toLowerCase()
    .replace(/[?!.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function pickPreferredVoice(voices: SpeechSynthesisVoice[]) {
  return (
    voices.find((voice) => voice.lang.toLowerCase().startsWith('ko')) ??
    voices.find((voice) => voice.default) ??
    voices[0] ??
    null
  )
}
