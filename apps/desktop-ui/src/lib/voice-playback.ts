import { useCallback, useMemo, useState } from 'react'

export type VoicePlaybackState = {
  available: boolean
  notice: string
  speaking: boolean
}

export const defaultVoicePlaybackState: VoicePlaybackState = {
  available:
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined',
  notice: '버튼 intent 기준으로 현재 세그먼트를 다시 읽어 줄 수 있습니다.',
  speaking: false,
}

export function useVoicePlayback() {
  const [state, setState] = useState(defaultVoicePlaybackState)

  const available = useMemo(
    () =>
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof SpeechSynthesisUtterance !== 'undefined',
    [],
  )

  const speak = useCallback(
    (text: string) => {
      if (!available) {
        setState({
          available: false,
          notice: '이 환경에서는 음성 재생이 없어 텍스트만 보여 줍니다.',
          speaking: false,
        })
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
        setState({
          available: true,
          notice: '현재 세그먼트 설명을 음성으로 읽는 중입니다.',
          speaking: true,
        })
      }

      utterance.onend = () => {
        setState({
          available: true,
          notice:
            '음성 재생이 끝났습니다. 다른 intent를 눌러 다시 들을 수 있습니다.',
          speaking: false,
        })
      }

      utterance.onerror = () => {
        setState({
          available: true,
          notice: '음성 재생에 실패해 텍스트 카드만 유지합니다.',
          speaking: false,
        })
      }

      synthesis.speak(utterance)
    },
    [available],
  )

  const stop = useCallback(() => {
    if (!available) {
      return
    }

    window.speechSynthesis.cancel()
    setState({
      available: true,
      notice: '음성 재생을 중지했습니다.',
      speaking: false,
    })
  }, [available])

  return {
    speak,
    state,
    stop,
  }
}

export function pickPreferredVoice(voices: SpeechSynthesisVoice[]) {
  return (
    voices.find((voice) => voice.lang.toLowerCase().startsWith('ko')) ??
    voices.find((voice) => voice.default) ??
    voices[0] ??
    null
  )
}
