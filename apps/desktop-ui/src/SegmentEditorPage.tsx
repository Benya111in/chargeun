import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  Circle,
  Clock,
  FileJson,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  ScissorsLineDashed,
  Trash2,
} from 'lucide-react'

import type {
  PracticeAnswerOption,
  TheaterSegment,
  TheaterShow,
} from './lib/demo-theater-content'
import {
  acceptedGeneratedQualityContractVersion,
  acceptedGeneratedPipelineVersion,
  type GeneratedScenarioRecord,
  toGeneratedTheaterShow,
} from './lib/generated-scenario'
import { appHref, getAppRoute, publicAssetSrc } from './lib/routes'
import { getGeneratorApiConfig } from './lib/url-generator-api'

const generatedQualityVersion = 'quality-v1'
const defaultEditableGeneratedId = 'generated-9ba70c1d4459'
const editorDraftStoragePrefix = 'ansimtrack.guardian-segment-editor.v1'

type EditableAnswerOption = Pick<
  PracticeAnswerOption,
  'correct' | 'feedback' | 'id' | 'kind' | 'label' | 'role'
>

type EditableSegment = {
  actionReasons: string[]
  actionSteps: string[]
  answerOptions: EditableAnswerOption[]
  checkQuestion: string
  endMs: number
  id: string
  learnerExplanation: string
  learnerPrompt: string
  safetyWarnings: string[]
  startMs: number
  teacherScript: string
}

type EditableScenario = {
  id: string
  sourceTitle: string
  topicLabel: string
  videoSrc: string
  segments: EditableSegment[]
}

type SaveState = 'idle' | 'saved' | 'dirty'

export default function SegmentEditorPage() {
  const scenarioId = getEditorScenarioIdFromPath()
  const [scenario, setScenario] = useState<TheaterShow | null>(null)
  const [draft, setDraft] = useState<EditableScenario | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [isPlaying, setIsPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    let isActive = true
    setIsLoading(true)
    setLoadError('')

    loadGeneratedScenarioForEditing(scenarioId)
      .then((loadedScenario) => {
        if (!isActive) {
          return
        }
        if (!loadedScenario) {
          setScenario(null)
          setDraft(null)
          setLoadError('생성된 세그먼트를 찾지 못했습니다.')
          return
        }

        const nextDraft =
          loadEditorDraft(loadedScenario.id) ?? toEditableScenario(loadedScenario)
        setScenario(loadedScenario)
        setDraft(nextDraft)
        setSavedSnapshot(JSON.stringify(nextDraft))
        setSelectedIndex(0)
        setSaveState(loadEditorDraft(loadedScenario.id) ? 'saved' : 'idle')
      })
      .catch((error) => {
        if (isActive) {
          setScenario(null)
          setDraft(null)
          setLoadError(error instanceof Error ? error.message : '불러오기 실패')
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [scenarioId])

  const durationMs = useMemo(() => {
    if (!draft?.segments.length) {
      return 1
    }

    return Math.max(...draft.segments.map((segment) => segment.endMs), 1)
  }, [draft])
  const selectedSegment = draft?.segments[selectedIndex] ?? null
  const dirty =
    draft && savedSnapshot ? JSON.stringify(draft) !== savedSnapshot : false

  useEffect(() => {
    if (dirty && saveState !== 'dirty') {
      setSaveState('dirty')
    }
  }, [dirty, saveState])

  const updateSelectedSegment = (
    updater: (segment: EditableSegment) => EditableSegment,
  ) => {
    setDraft((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        segments: current.segments.map((segment, index) =>
          index === selectedIndex ? updater(segment) : segment,
        ),
      }
    })
  }

  const updateSelectedTime = (field: 'endMs' | 'startMs', valueMs: number) => {
    setDraft((current) => {
      if (!current) {
        return current
      }

      return updateSegmentTime(current, selectedIndex, field, valueMs)
    })
  }

  const saveDraft = () => {
    if (!draft) {
      return
    }

    window.localStorage.setItem(editorDraftStorageKey(draft.id), JSON.stringify(draft))
    setSavedSnapshot(JSON.stringify(draft))
    setSaveState('saved')
  }

  const resetDraft = () => {
    if (!scenario) {
      return
    }

    window.localStorage.removeItem(editorDraftStorageKey(scenario.id))
    const baseDraft = toEditableScenario(scenario)
    setDraft(baseDraft)
    setSavedSnapshot(JSON.stringify(baseDraft))
    setSelectedIndex(0)
    setSaveState('idle')
  }

  const getCurrentVideoMs = () => {
    if (!videoRef.current) {
      return selectedSegment?.startMs ?? 0
    }

    return Math.round(videoRef.current.currentTime * 10) * 100
  }

  const seekVideoTo = (timeMs: number) => {
    if (!videoRef.current) {
      return
    }

    videoRef.current.currentTime = Math.max(0, timeMs) / 1000
  }

  const setSelectedBoundaryToCurrentTime = (field: 'endMs' | 'startMs') => {
    updateSelectedTime(field, getCurrentVideoMs())
  }

  const previewSelectedSegment = async () => {
    if (!selectedSegment || !videoRef.current) {
      return
    }

    const video = videoRef.current
    video.currentTime = selectedSegment.startMs / 1000
    try {
      await video.play()
      setIsPlaying(true)
    } catch {
      setIsPlaying(false)
    }
  }

  const splitSelectedAtCurrentTime = () => {
    if (!draft) {
      return
    }

    const segment = draft.segments[selectedIndex]
    if (!segment) {
      return
    }

    const minDurationMs = 900
    const splitAt = clamp(
      getCurrentVideoMs(),
      segment.startMs + minDurationMs,
      segment.endMs - minDurationMs,
    )

    if (splitAt <= segment.startMs || splitAt >= segment.endMs) {
      return
    }

    const firstSegment = {
      ...segment,
      endMs: splitAt,
    }
    const secondSegment = {
      ...segment,
      id: `${segment.id}-split-${Date.now()}`,
      learnerPrompt: segment.learnerPrompt
        ? `${segment.learnerPrompt} 검수`
        : '새 세그먼트 문구',
      startMs: splitAt,
    }
    const segments = [...draft.segments]
    segments.splice(selectedIndex, 1, firstSegment, secondSegment)
    setDraft({ ...draft, segments })
    setSelectedIndex(selectedIndex + 1)
  }

  const deleteSelectedSegment = () => {
    if (!draft || draft.segments.length <= 1) {
      return
    }

    const deletedSegment = draft.segments[selectedIndex]
    if (!deletedSegment) {
      return
    }

    const segments = draft.segments
      .filter((_, index) => index !== selectedIndex)
      .map((segment) => ({ ...segment }))
    const nextSegment = segments[selectedIndex]
    const previousSegment = segments[selectedIndex - 1]

    if (nextSegment) {
      nextSegment.startMs = deletedSegment.startMs
    } else if (previousSegment) {
      previousSegment.endMs = deletedSegment.endMs
    }

    const nextSelectedIndex = Math.max(0, Math.min(selectedIndex, segments.length - 1))
    setDraft({ ...draft, segments })
    setSelectedIndex(nextSelectedIndex)
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video || !selectedSegment) {
      return
    }

    const handleTimeUpdate = () => {
      if (video.currentTime * 1000 >= selectedSegment.endMs) {
        video.pause()
        video.currentTime = selectedSegment.endMs / 1000
        setIsPlaying(false)
      }
    }

    video.addEventListener('timeupdate', handleTimeUpdate)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
    }
  }, [selectedSegment])

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f8f7] px-4 text-[#13211c]">
        <section className="rounded-md border border-[#d8e2df] bg-white p-6">
          <p className="text-lg font-semibold">보호자 검수 화면을 여는 중입니다.</p>
        </section>
      </main>
    )
  }

  if (!draft || !scenario || loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f8f7] px-4 text-[#13211c]">
        <section className="max-w-lg rounded-md border border-[#d8e2df] bg-white p-6">
          <h1 className="text-2xl font-semibold">세그먼트를 불러오지 못했습니다.</h1>
          <p className="mt-3 text-sm leading-6 text-[#5c6d67]">
            {loadError || '생성 결과가 published 상태인지 확인해 주세요.'}
          </p>
          <a className="link-button mt-5" href={appHref('/url-generator')}>
            URL 생성 화면으로 가기
          </a>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f4f8f7] text-[#13211c]">
      <header className="sticky top-0 z-20 border-b border-[#d8e2df] bg-white/92 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <a
              className="inline-flex items-center gap-1 text-sm font-semibold text-[#5b6d66] transition hover:text-[#13211c]"
              href={appHref(`/scenario/${draft.id}`)}
            >
              <ChevronLeft className="size-4" />
              학습 화면
            </a>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
              보호자 세그먼트 검수
            </h1>
            <p className="mt-1 truncate text-sm text-[#62736c]">
              {draft.topicLabel} · {draft.sourceTitle}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge saveState={saveState} dirty={dirty} />
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-[#cfded9] bg-white px-3 text-sm font-bold transition hover:border-[#13211c]/40"
              onClick={resetDraft}
              type="button"
            >
              <RotateCcw className="size-4" />
              초기화
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[#13211c] px-4 text-sm font-bold text-white transition hover:bg-[#20372f]"
              onClick={saveDraft}
              type="button"
            >
              <Save className="size-4" />
              저장
            </button>
          </div>
        </div>
      </header>

      <section
        className="mx-auto grid max-w-[1500px] gap-3 px-4 py-4 lg:grid-cols-[260px_minmax(0,1fr)_360px] 2xl:grid-cols-[310px_minmax(0,1fr)_410px]"
        data-testid="guardian-editor-page"
      >
        <aside className="rounded-md border border-[#d8e2df] bg-white lg:sticky lg:top-[92px] lg:max-h-[calc(100vh-112px)]">
          <div className="border-b border-[#e2e9e6] px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6b7d76]">
              세그먼트
            </p>
            <p className="mt-1 text-sm text-[#5d6d66]">
              {draft.segments.length}개 장면
            </p>
          </div>
          <div className="max-h-[42vh] overflow-auto p-2 lg:max-h-[calc(100vh-184px)]">
            {draft.segments.map((segment, index) => (
              <button
                className={[
                  'mb-2 w-full rounded-md border p-3 text-left transition',
                  index === selectedIndex
                    ? 'border-[#13211c] bg-[#eef8f4] shadow-[0_8px_24px_rgba(19,33,28,0.08)]'
                    : 'border-[#e1e9e6] bg-white hover:border-[#a8bbb3]',
                ].join(' ')}
                key={segment.id}
                onClick={() => setSelectedIndex(index)}
                type="button"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-sm font-black">
                    <Circle
                      className={[
                        'size-3',
                        segment.actionSteps.length ? 'fill-[#22a06b]' : 'fill-[#9db2aa]',
                      ].join(' ')}
                    />
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="rounded bg-[#eef2f0] px-2 py-1 text-xs font-bold text-[#5c6d67]">
                    {formatMs(segment.startMs)} - {formatMs(segment.endMs)}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5">
                  {segment.learnerPrompt || '문구 없음'}
                </p>
                <p className="mt-2 text-xs text-[#697a73]">
                  {segment.actionSteps.length
                    ? `해야 할 일 ${segment.actionSteps.length}개`
                    : '설명 장면'}
                </p>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 space-y-3">
          <div className="rounded-md border border-[#d8e2df] bg-[#101a17] p-3 text-white">
            <video
              className="aspect-video w-full rounded bg-black object-contain"
              controls
              onPause={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              ref={videoRef}
              src={publicAssetSrc(draft.videoSrc)}
            />
            <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <p className="text-sm font-bold">
                  {selectedIndex + 1}번 장면 · {formatMs(selectedSegment?.startMs ?? 0)} -{' '}
                  {formatMs(selectedSegment?.endMs ?? 0)}
                </p>
                <p className="mt-1 text-xs text-white/62">
                  {selectedSegment?.teacherScript || selectedSegment?.learnerPrompt}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-3 text-sm font-bold text-[#13211c] transition hover:bg-[#dff2ec]"
                  onClick={previewSelectedSegment}
                  type="button"
                >
                  {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                  선택 구간 보기
                </button>
                <button
                  className="inline-flex h-10 items-center rounded-md border border-white/18 px-3 text-sm font-bold text-white transition hover:bg-white/10"
                  onClick={() => setSelectedBoundaryToCurrentTime('startMs')}
                  type="button"
                >
                  현재=시작
                </button>
                <button
                  className="inline-flex h-10 items-center rounded-md border border-white/18 px-3 text-sm font-bold text-white transition hover:bg-white/10"
                  onClick={() => setSelectedBoundaryToCurrentTime('endMs')}
                  type="button"
                >
                  현재=끝
                </button>
              </div>
            </div>
          </div>

          <Timeline
            durationMs={durationMs}
            onSelect={setSelectedIndex}
            onSeek={seekVideoTo}
            selectedIndex={selectedIndex}
            segments={draft.segments}
          />

          {selectedSegment ? (
            <TimeEditor
              durationMs={durationMs}
              onChange={updateSelectedTime}
              onDelete={deleteSelectedSegment}
              onSplit={splitSelectedAtCurrentTime}
              segment={selectedSegment}
              segmentCount={draft.segments.length}
            />
          ) : null}
        </section>

        {selectedSegment ? (
          <Inspector
            onUpdateArray={(field, values) =>
              updateSelectedSegment((segment) => ({ ...segment, [field]: values }))
            }
            onUpdateField={(field, value) =>
              updateSelectedSegment((segment) => ({ ...segment, [field]: value }))
            }
            segment={selectedSegment}
          />
        ) : null}
      </section>
    </main>
  )
}

function StatusBadge({ dirty, saveState }: { dirty: boolean; saveState: SaveState }) {
  if (saveState === 'saved' && !dirty) {
    return (
      <span className="inline-flex h-10 items-center gap-2 rounded-md border border-[#b9d8cc] bg-[#e9f7f1] px-3 text-sm font-bold text-[#146c47]">
        <Check className="size-4" />
        저장됨
      </span>
    )
  }

  if (dirty) {
    return (
      <span className="inline-flex h-10 items-center gap-2 rounded-md border border-[#f0d4a8] bg-[#fff7e8] px-3 text-sm font-bold text-[#885a13]">
        <Clock className="size-4" />
        수정 중
      </span>
    )
  }

  return (
    <span className="inline-flex h-10 items-center gap-2 rounded-md border border-[#d8e2df] bg-white px-3 text-sm font-bold text-[#60736b]">
      <FileJson className="size-4" />
      초안 없음
    </span>
  )
}

function Timeline({
  durationMs,
  onSelect,
  onSeek,
  selectedIndex,
  segments,
}: {
  durationMs: number
  onSelect: (index: number) => void
  onSeek: (timeMs: number) => void
  selectedIndex: number
  segments: EditableSegment[]
}) {
  return (
    <section className="rounded-md border border-[#d8e2df] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 text-base font-black">
          <ScissorsLineDashed className="size-5" />
          타임라인
        </h2>
        <span className="text-xs font-bold text-[#60736b]">
          전체 {formatMs(durationMs)}
        </span>
      </div>
      <div className="relative h-20 rounded-md border border-[#dfe8e4] bg-[#f5f8f7] p-2">
        {segments.map((segment, index) => {
          const left = `${Math.max(0, (segment.startMs / durationMs) * 100)}%`
          const width = `${Math.max(1.2, ((segment.endMs - segment.startMs) / durationMs) * 100)}%`

          return (
            <button
              className={[
                'absolute top-2 h-16 rounded border px-2 text-left text-[11px] font-bold transition',
                index === selectedIndex
                  ? 'z-10 border-[#13211c] bg-[#13211c] text-white'
                  : 'border-[#bcd2c9] bg-[#dff2ec] text-[#204037] hover:bg-[#cde9df]',
              ].join(' ')}
              key={segment.id}
              onClick={() => {
                onSelect(index)
                onSeek(segment.startMs)
              }}
              style={{ left, width }}
              type="button"
            >
              <span className="block truncate">{index + 1}</span>
              <span className="block truncate opacity-80">{segment.learnerPrompt}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function TimeEditor({
  durationMs,
  onChange,
  onDelete,
  onSplit,
  segment,
  segmentCount,
}: {
  durationMs: number
  onChange: (field: 'endMs' | 'startMs', valueMs: number) => void
  onDelete: () => void
  onSplit: () => void
  segment: EditableSegment
  segmentCount: number
}) {
  return (
    <section className="rounded-md border border-[#d8e2df] bg-white p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <TimeControl
          durationMs={durationMs}
          label="시작"
          onChange={(valueMs) => onChange('startMs', valueMs)}
          valueMs={segment.startMs}
        />
        <TimeControl
          durationMs={durationMs}
          label="끝"
          onChange={(valueMs) => onChange('endMs', valueMs)}
          valueMs={segment.endMs}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#e2e9e6] pt-3">
        <button
          className="inline-flex h-10 items-center gap-2 rounded-md border border-[#cfded9] bg-white px-3 text-sm font-black transition hover:border-[#13211c]/40"
          onClick={onSplit}
          type="button"
        >
          <ScissorsLineDashed className="size-4" />
          현재 위치에서 분할
        </button>
        <button
          className="inline-flex h-10 items-center gap-2 rounded-md border border-[#ead1d1] bg-white px-3 text-sm font-black text-[#a23c3c] transition hover:bg-[#fff1f1] disabled:cursor-not-allowed disabled:opacity-40"
          disabled={segmentCount <= 1}
          onClick={onDelete}
          type="button"
        >
          <Trash2 className="size-4" />
          선택 구간 삭제
        </button>
        <p className="text-xs font-semibold text-[#6b7d76]">
          시작/끝을 바꾸면 앞뒤 세그먼트 경계도 함께 맞춰집니다.
        </p>
      </div>
    </section>
  )
}

function TimeControl({
  durationMs,
  label,
  onChange,
  valueMs,
}: {
  durationMs: number
  label: string
  onChange: (valueMs: number) => void
  valueMs: number
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.12em] text-[#60736b]">
        {label}
      </span>
      <div className="mt-2 flex items-center gap-2">
        <button
          className="h-9 rounded-md border border-[#d8e2df] bg-white px-2 text-sm font-black hover:border-[#13211c]/40"
          onClick={() => onChange(valueMs - 500)}
          type="button"
        >
          -0.5
        </button>
        <input
          className="h-9 w-24 rounded-md border border-[#cfded9] px-2 text-sm font-bold"
          min={0}
          onChange={(event) => onChange(secondsToMs(event.target.value))}
          step={0.1}
          type="number"
          value={(valueMs / 1000).toFixed(1)}
        />
        <button
          className="h-9 rounded-md border border-[#d8e2df] bg-white px-2 text-sm font-black hover:border-[#13211c]/40"
          onClick={() => onChange(valueMs + 500)}
          type="button"
        >
          +0.5
        </button>
      </div>
      <input
        className="mt-3 w-full accent-[#13211c]"
        max={durationMs}
        min={0}
        onChange={(event) => onChange(Number(event.target.value))}
        step={100}
        type="range"
        value={valueMs}
      />
    </label>
  )
}

function Inspector({
  onUpdateArray,
  onUpdateField,
  segment,
}: {
  onUpdateArray: (
    field: 'actionReasons' | 'actionSteps' | 'safetyWarnings',
    values: string[],
  ) => void
  onUpdateField: (
    field:
      | 'answerOptions'
      | 'checkQuestion'
      | 'learnerExplanation'
      | 'learnerPrompt'
      | 'teacherScript',
    value: EditableAnswerOption[] | string,
  ) => void
  segment: EditableSegment
}) {
  return (
    <aside className="rounded-md border border-[#d8e2df] bg-white lg:sticky lg:top-[92px] lg:max-h-[calc(100vh-112px)]">
      <div className="border-b border-[#e2e9e6] px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6b7d76]">
          편집 패널
        </p>
        <h2 className="mt-1 text-lg font-black">학습자 문구</h2>
      </div>
      <div className="max-h-[60vh] space-y-5 overflow-auto p-4 lg:max-h-[calc(100vh-184px)]">
        <TextField
          label="상황 카드"
          onChange={(value) => onUpdateField('learnerPrompt', value)}
          value={segment.learnerPrompt}
        />
        <TextAreaField
          label="설명 문구"
          onChange={(value) => onUpdateField('learnerExplanation', value)}
          value={segment.learnerExplanation}
        />
        <EditableList
          label="해야 할 일"
          onChange={(values) => onUpdateArray('actionSteps', values)}
          values={segment.actionSteps}
        />
        <EditableList
          label="이유"
          onChange={(values) => onUpdateArray('actionReasons', values)}
          values={segment.actionReasons}
        />
        <EditableList
          label="하지 말아요"
          onChange={(values) => onUpdateArray('safetyWarnings', values)}
          values={segment.safetyWarnings}
        />
        <TextField
          label="확인 질문"
          onChange={(value) => onUpdateField('checkQuestion', value)}
          value={segment.checkQuestion}
        />
        <AnswerOptionEditor
          onChange={(values) => onUpdateField('answerOptions', values)}
          options={segment.answerOptions}
        />
        <TextAreaField
          label="진행자 설명"
          onChange={(value) => onUpdateField('teacherScript', value)}
          value={segment.teacherScript}
        />
      </div>
    </aside>
  )
}

function TextField({
  label,
  onChange,
  value,
}: {
  label: string
  onChange: (value: string) => void
  value: string
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.12em] text-[#60736b]">
        {label}
      </span>
      <input
        className="mt-2 h-10 w-full rounded-md border border-[#cfded9] px-3 text-sm font-semibold text-[#13211c]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  )
}

function TextAreaField({
  label,
  onChange,
  value,
}: {
  label: string
  onChange: (value: string) => void
  value: string
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.12em] text-[#60736b]">
        {label}
      </span>
      <textarea
        className="mt-2 min-h-24 w-full resize-y rounded-md border border-[#cfded9] px-3 py-2 text-sm font-semibold leading-6 text-[#13211c]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  )
}

function EditableList({
  label,
  onChange,
  values,
}: {
  label: string
  onChange: (values: string[]) => void
  values: string[]
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[#60736b]">
          {label}
        </p>
        <button
          className="inline-flex h-8 items-center gap-1 rounded-md border border-[#cfded9] bg-white px-2 text-xs font-black hover:border-[#13211c]/40"
          onClick={() => onChange([...values, ''])}
          type="button"
        >
          <Plus className="size-3.5" />
          추가
        </button>
      </div>
      <div className="space-y-2">
        {values.length === 0 ? (
          <p className="rounded-md border border-dashed border-[#cfded9] px-3 py-2 text-sm text-[#6b7d76]">
            없음
          </p>
        ) : null}
        {values.map((value, index) => (
          <div className="flex items-center gap-2" key={`${label}-${index}`}>
            <input
              className="h-10 min-w-0 flex-1 rounded-md border border-[#cfded9] px-3 text-sm font-semibold"
              onChange={(event) =>
                onChange(values.map((item, itemIndex) =>
                  itemIndex === index ? event.target.value : item,
                ))
              }
              value={value}
            />
            <button
              className="inline-flex size-10 items-center justify-center rounded-md border border-[#ead1d1] text-[#a23c3c] hover:bg-[#fff1f1]"
              onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
              type="button"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

function AnswerOptionEditor({
  onChange,
  options,
}: {
  onChange: (options: EditableAnswerOption[]) => void
  options: EditableAnswerOption[]
}) {
  return (
    <section>
      <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#60736b]">
        선택지
      </p>
      <div className="space-y-2">
        {options.map((option) => (
          <div
            className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-md border border-[#dbe6e2] p-2"
            key={option.id}
          >
            <input
              checked={option.correct}
              name="correct-answer"
              onChange={() =>
                onChange(
                  options.map((candidate) => ({
                    ...candidate,
                    correct: candidate.id === option.id,
                  })),
                )
              }
              type="radio"
            />
            <input
              className="h-9 min-w-0 rounded-md border border-[#cfded9] px-2 text-sm font-semibold"
              onChange={(event) =>
                onChange(
                  options.map((candidate) =>
                    candidate.id === option.id
                      ? { ...candidate, label: event.target.value }
                      : candidate,
                  ),
                )
              }
              value={option.label}
            />
          </div>
        ))}
      </div>
    </section>
  )
}

function getEditorScenarioIdFromPath() {
  const pathname = getAppRoute()

  if (pathname.startsWith('/guardian-editor/')) {
    return decodeURIComponent(pathname.replace('/guardian-editor/', ''))
  }

  return defaultEditableGeneratedId
}

function toEditableScenario(scenario: TheaterShow): EditableScenario {
  return {
    id: scenario.id,
    segments: scenario.segments.map(toEditableSegment),
    sourceTitle: scenario.generatedSourceTitle ?? scenario.title,
    topicLabel: scenario.generatedTopicLabel ?? scenario.title,
    videoSrc: scenario.videoSrc,
  }
}

function toEditableSegment(segment: TheaterSegment): EditableSegment {
  return {
    actionReasons: [...segment.actionReasons],
    actionSteps: [...segment.actionSteps],
    answerOptions: segment.answerOptions.map((option) => ({
      correct: option.correct,
      feedback: option.feedback,
      id: option.id,
      kind: option.kind,
      label: option.label,
      role: option.role,
    })),
    checkQuestion: segment.checkQuestion,
    endMs: segment.endMs,
    id: segment.id,
    learnerExplanation: segment.learnerExplanation,
    learnerPrompt: segment.learnerPrompt,
    safetyWarnings: [...segment.safetyWarnings],
    startMs: segment.startMs,
    teacherScript: segment.teacherGuide.script,
  }
}

function updateSegmentTime(
  scenario: EditableScenario,
  index: number,
  field: 'endMs' | 'startMs',
  rawValueMs: number,
) {
  const segments = scenario.segments.map((segment) => ({ ...segment }))
  const segment = segments[index]
  if (!segment) {
    return scenario
  }

  const minDurationMs = 700
  const durationMs = Math.max(...segments.map((candidate) => candidate.endMs), 1)
  const valueMs = clamp(Math.round(rawValueMs / 100) * 100, 0, durationMs)

  if (field === 'startMs') {
    segment.startMs = clamp(valueMs, 0, segment.endMs - minDurationMs)
    if (segments[index - 1]) {
      segments[index - 1]!.endMs = segment.startMs
    }
  } else {
    segment.endMs = clamp(valueMs, segment.startMs + minDurationMs, durationMs)
    if (segments[index + 1]) {
      segments[index + 1]!.startMs = segment.endMs
    }
  }

  return { ...scenario, segments }
}

function loadEditorDraft(id: string) {
  try {
    const raw = window.localStorage.getItem(editorDraftStorageKey(id))
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as EditableScenario
    if (!Array.isArray(parsed.segments)) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function editorDraftStorageKey(id: string) {
  return `${editorDraftStoragePrefix}:${id}`
}

async function loadGeneratedScenarioForEditing(id: string) {
  const config = getGeneratorApiConfig()
  const apiBase = config.apiBase.replace(/\/+$/u, '')
  const response = await fetchGeneratedScenarioAsset(id, apiBase)

  if (!response) {
    return null
  }

  const customScenario = response.scenario
  customScenario.videoSrc = response.sourceVideoUrl
  const record: GeneratedScenarioRecord = {
    baseScenarioId: 'local-generated-video',
    createdAt: new Date().toISOString(),
    customScenario,
    id,
    matchBasis: 'metadata',
    sourceTitle: customScenario.generatedSourceTitle,
    sourceUrl: customScenario.generatedSourceUrl ?? '',
    thumbnailUrl: customScenario.generatedThumbnailUrl,
    topicLabel: customScenario.generatedTopicLabel ?? '재난안전 영상 학습',
    version: 1,
  }

  return toGeneratedTheaterShow(record)
}

async function fetchGeneratedScenarioAsset(id: string, apiBase: string) {
  const encodedId = encodeURIComponent(id)
  const qualityScenarioPath = `/generated/${encodedId}/${generatedQualityVersion}/scenario.json`
  const qualityVideoPath = `/generated/${encodedId}/${generatedQualityVersion}/source.mp4`
  const generatedAssetBase = normalizeGeneratedAssetBase(
    import.meta.env.VITE_GENERATED_ASSET_BASE,
  )
  const urls = [
    generatedAssetBase
      ? buildScenarioAssetCandidate(
          `${generatedAssetBase}${qualityScenarioPath}`,
          `${generatedAssetBase}${qualityVideoPath}`,
          'canonical',
        )
      : null,
    apiBase
      ? buildScenarioAssetCandidate(
          `${apiBase}${qualityScenarioPath}`,
          `${apiBase}${qualityVideoPath}`,
          'remote',
        )
      : null,
    buildScenarioAssetCandidate(
      publicAssetSrc(qualityScenarioPath),
      publicAssetSrc(qualityVideoPath),
      'static',
    ),
  ].filter((item): item is ScenarioAssetCandidate => item !== null)

  for (const candidate of urls) {
    const assetUrl = new URL(
      candidate.url,
      typeof window === 'undefined' ? undefined : window.location.origin,
    )
    assetUrl.searchParams.set('v', String(Date.now()))

    try {
      const response = await fetch(assetUrl.toString(), { cache: 'no-store' })
      if (!response.ok) {
        continue
      }
      const scenario = (await response.json()) as TheaterShow
      if (!isPublishableGeneratedScenarioAsset(scenario)) {
        continue
      }

      return {
        scenario,
        source: candidate.source,
        sourceVideoUrl: candidate.sourceVideoUrl,
      }
    } catch {
      continue
    }
  }

  return null
}

type ScenarioAssetCandidate = {
  source: 'canonical' | 'remote' | 'static'
  sourceVideoUrl: string
  url: string
}

function buildScenarioAssetCandidate(
  url: string,
  sourceVideoUrl: string,
  source: ScenarioAssetCandidate['source'],
): ScenarioAssetCandidate {
  return {
    source,
    sourceVideoUrl,
    url,
  }
}

function isPublishableGeneratedScenarioAsset(scenario: TheaterShow) {
  const candidate = scenario as TheaterShow & {
    generatedArtifactManifest?: {
      files?: unknown
      qualityVersion?: string
    }
    generationPipelineTrace?: {
      agentRuns?: unknown
      pipelineVersion?: string
      qualityContractVersion?: string
    }
    generationQualityReport?: {
      groundingPassed?: boolean
      passed?: boolean
      qualityContractVersion?: string
      sourceCoveragePassed?: boolean
      uiPlaybackPassed?: boolean
    }
  }

  return (
    candidate.generationQualityReport?.passed === true &&
    candidate.generationQualityReport.qualityContractVersion ===
      acceptedGeneratedQualityContractVersion &&
    candidate.generationQualityReport.groundingPassed === true &&
    candidate.generationQualityReport.sourceCoveragePassed === true &&
    candidate.generationQualityReport.uiPlaybackPassed === true &&
    candidate.generationPipelineTrace?.pipelineVersion ===
      acceptedGeneratedPipelineVersion &&
    candidate.generationPipelineTrace.qualityContractVersion ===
      acceptedGeneratedQualityContractVersion &&
    Array.isArray(candidate.generationPipelineTrace.agentRuns) &&
    candidate.generatedArtifactManifest?.qualityVersion ===
      generatedQualityVersion &&
    generatedManifestContains(candidate.generatedArtifactManifest, 'scenario.json') &&
    generatedManifestContains(candidate.generatedArtifactManifest, 'source.mp4') &&
    generatedManifestContains(candidate.generatedArtifactManifest, 'quality-report.json') &&
    generatedManifestContains(candidate.generatedArtifactManifest, 'pipeline-trace.json') &&
    generatedManifestContains(candidate.generatedArtifactManifest, 'evidence-packet.json') &&
    generatedManifestContains(candidate.generatedArtifactManifest, 'scene-graph.json')
  )
}

function generatedManifestContains(
  manifest: { files?: unknown } | undefined,
  name: string,
) {
  return (
    Array.isArray(manifest?.files) &&
    manifest.files.some(
      (file) =>
        Boolean(file) &&
        typeof file === 'object' &&
        (file as { name?: unknown }).name === name,
    )
  )
}

function normalizeGeneratedAssetBase(input: unknown) {
  if (typeof input !== 'string') {
    return ''
  }

  return input.trim().replace(/\/+$/u, '')
}

function formatMs(ms: number) {
  const totalSeconds = Math.max(0, ms) / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds - minutes * 60

  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`
}

function secondsToMs(value: string) {
  const numeric = Number(value)

  return Number.isFinite(numeric) ? numeric * 1000 : 0
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
