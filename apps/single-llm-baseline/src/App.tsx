import { useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  HelpCircle,
  PauseCircle,
  Play,
  RotateCcw,
  TriangleAlert,
} from 'lucide-react'

type PracticeStage = 'ready' | 'playback' | 'explanation' | 'rest'

type AnswerOption = {
  correct: boolean
  feedback: string
  id: string
  label: string
}

type BaselineSegment = {
  action: string
  avoid: string
  checkQuestion: string
  description: string
  endMs: number
  id: string
  learnerExplanation: string
  learnerPrompt: string
  reason: string
  sequence: Array<{ kind: 'situation' | 'action'; text: string }>
  startMs: number
  title: string
  options: AnswerOption[]
}

const videoSrc = '/demo-video/fire-original-single-llm-baseline.mp4'

const baselineSegments: BaselineSegment[] = [
  {
    action: '',
    avoid: '',
    checkQuestion: '이 장면은 무엇을 알려줄까요?',
    description: '화재 안전 영상이 시작돼요.',
    endMs: 8600,
    id: 'intro-mixed',
    learnerExplanation: '화재가 나면 빨리 밖으로 나가요.',
    learnerPrompt: '화재 장면을 보고 있어요.',
    reason: '',
    sequence: [
      { kind: 'situation', text: '아파트에서 불이 났어요.' },
      { kind: 'action', text: '바로 밖으로 나가요.' },
    ],
    startMs: 0,
    title: '화재가 났을 때',
    options: [
      {
        correct: true,
        feedback: '맞아요. 안전이 중요해요.',
        id: 'safe',
        label: '안전',
      },
      {
        correct: false,
        feedback: '빠르게만 생각하면 놓치는 것이 있어요.',
        id: 'fast',
        label: '빠르게',
      },
    ],
  },
  {
    action: '몸을 낮추고 이동해요.',
    avoid: '연기를 마시지 말아요.',
    checkQuestion: '어떻게 해야 할까요?',
    description: '연기가 많이 날 수 있어요.',
    endMs: 17_800,
    id: 'smoke-generic',
    learnerExplanation: '몸을 낮추고 이동해요.',
    learnerPrompt: '연기가 보이는 장면이에요.',
    reason: '연기는 몸에 나빠요.',
    sequence: [
      { kind: 'situation', text: '연기가 많이 나요.' },
      { kind: 'action', text: '몸을 낮추고 이동해요.' },
    ],
    startMs: 8600,
    title: '연기가 나요',
    options: [
      {
        correct: true,
        feedback: '맞아요. 이동해야 해요.',
        id: 'move',
        label: '이동해요',
      },
      {
        correct: false,
        feedback: '기다리면 위험할 수 있어요.',
        id: 'wait',
        label: '기다려요',
      },
    ],
  },
  {
    action: '문을 열고 나가요.',
    avoid: '방 안에 있지 말아요.',
    checkQuestion: '문이 있으면 무엇을 할까요?',
    description: '문이 보이면 열 수 있어요.',
    endMs: 26_800,
    id: 'door-unsafe',
    learnerExplanation: '문을 열고 나가요.',
    learnerPrompt: '문이 보이는 장면이에요.',
    reason: '나가야 안전해요.',
    sequence: [
      { kind: 'situation', text: '문이 보여요.' },
      { kind: 'action', text: '문을 열고 나가요.' },
    ],
    startMs: 17_800,
    title: '문을 열어요',
    options: [
      {
        correct: true,
        feedback: '맞아요. 문을 열어요.',
        id: 'open',
        label: '열어요',
      },
      {
        correct: false,
        feedback: '만지기만 하면 안 돼요.',
        id: 'touch',
        label: '만져요',
      },
    ],
  },
  {
    action: '계단으로 내려가요.',
    avoid: '엘리베이터를 타지 말아요.',
    checkQuestion: '어디로 가야 할까요?',
    description: '밖으로 나가야 해요.',
    endMs: 35_500,
    id: 'stairs-thin',
    learnerExplanation: '계단으로 내려가요.',
    learnerPrompt: '대피하는 장면이에요.',
    reason: '엘리베이터는 멈출 수 있어요.',
    sequence: [
      { kind: 'situation', text: '대피해야 해요.' },
      { kind: 'action', text: '계단으로 가요.' },
    ],
    startMs: 26_800,
    title: '계단으로 가요',
    options: [
      {
        correct: true,
        feedback: '맞아요. 계단으로 가요.',
        id: 'stairs',
        label: '계단',
      },
      {
        correct: false,
        feedback: '엘리베이터는 위험할 수 있어요.',
        id: 'elevator',
        label: '엘리베이터',
      },
    ],
  },
  {
    action: '119에 전화해요.',
    avoid: '혼자 해결하지 말아요.',
    checkQuestion: '어디에 전화할까요?',
    description: '도움이 필요해요.',
    endMs: 44_200,
    id: 'call-early',
    learnerExplanation: '119에 전화해요.',
    learnerPrompt: '도움이 필요한 장면이에요.',
    reason: '소방관이 도와줘요.',
    sequence: [
      { kind: 'situation', text: '도움이 필요해요.' },
      { kind: 'action', text: '119에 전화해요.' },
    ],
    startMs: 35_500,
    title: '신고해요',
    options: [
      {
        correct: true,
        feedback: '맞아요. 119에 전화해요.',
        id: '119',
        label: '119',
      },
      {
        correct: false,
        feedback: '친구보다 119나 어른 도움을 먼저 불러요.',
        id: 'friend',
        label: '친구',
      },
    ],
  },
  {
    action: '안전한 곳으로 가요.',
    avoid: '다시 들어가지 말아요.',
    checkQuestion: '무엇이 중요할까요?',
    description: '안전이 중요해요.',
    endMs: 52_000,
    id: 'generic-safety',
    learnerExplanation: '안전한 곳으로 가요.',
    learnerPrompt: '안전한 곳을 생각해요.',
    reason: '안전해야 해요.',
    sequence: [
      { kind: 'situation', text: '위험할 수 있어요.' },
      { kind: 'action', text: '안전하게 해요.' },
    ],
    startMs: 44_200,
    title: '안전이 중요해요',
    options: [
      {
        correct: true,
        feedback: '맞아요. 안전이 중요해요.',
        id: 'safety',
        label: '안전',
      },
      {
        correct: false,
        feedback: '조심도 필요하지만 답은 안전이에요.',
        id: 'care',
        label: '조심',
      },
    ],
  },
  {
    action: '배운 것을 기억해요.',
    avoid: '위험한 곳에 가지 말아요.',
    checkQuestion: '마지막으로 무엇을 할까요?',
    description: '영상이 끝나요.',
    endMs: 60_000,
    id: 'outro-mixed',
    learnerExplanation: '배운 것을 기억해요.',
    learnerPrompt: '마무리 장면이에요.',
    reason: '기억하면 도움이 돼요.',
    sequence: [
      { kind: 'situation', text: '화재 연습이 끝나요.' },
      { kind: 'action', text: '배운 것을 기억해요.' },
    ],
    startMs: 52_000,
    title: '마무리해요',
    options: [
      {
        correct: true,
        feedback: '맞아요. 기억해요.',
        id: 'remember',
        label: '기억해요',
      },
      {
        correct: false,
        feedback: '끝나는 것만 고르면 부족해요.',
        id: 'finish',
        label: '끝나요',
      },
    ],
  },
]

function App() {
  const [segmentIndex, setSegmentIndex] = useState(0)
  const [stage, setStage] = useState<PracticeStage>('ready')
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const segment = baselineSegments[segmentIndex]
  const selectedAnswer = segment.options.find(
    (option) => option.id === selectedAnswerId,
  )

  const currentStatus = useMemo(() => {
    if (stage === 'playback') return '보고 있어요'
    if (stage === 'explanation') return '이제 연습해요'
    if (stage === 'rest') return '쉬는 중이에요'
    return '준비됐어요'
  }, [stage])

  function loadSegment(index: number) {
    const nextSegment = baselineSegments[index]
    setSelectedAnswerId(null)
    setStage('ready')
    const video = videoRef.current
    if (video) {
      video.pause()
      video.currentTime = nextSegment.startMs / 1000
    }
    setSegmentIndex(index)
  }

  function playSegment(index = segmentIndex) {
    const nextSegment = baselineSegments[index]
    const video = videoRef.current

    setSegmentIndex(index)
    setSelectedAnswerId(null)
    setStage('playback')

    if (!video) {
      window.setTimeout(() => setStage('explanation'), 700)
      return
    }

    const startSec = nextSegment.startMs / 1000
    if (Number.isFinite(startSec)) {
      video.currentTime = startSec
    }

    video.muted = false
    const playPromise = video.play()
    if (playPromise) {
      void playPromise.catch(() => {
        video.muted = true
        void video.play().catch(() => {
          setStage('ready')
        })
      })
    }
  }

  function nextSegment() {
    const nextIndex = Math.min(segmentIndex + 1, baselineSegments.length - 1)
    playSegment(nextIndex)
  }

  function replaySegment() {
    playSegment(segmentIndex)
  }

  return (
    <main className="practice-page baseline-practice-page">
      <div className="practice-container">
        <div className="practice-stack">
          <PracticeBrandStrip />
          <section className="safety-banner baseline-banner">
            <strong>단일 LLM 비교군</strong>
            같은 화재 원본 영상에 출력 형식만 알려주고 한 번에 받은 결과입니다.
          </section>

          <div className="practice-layout">
            <section className="practice-left-column">
              <section className="practice-media-shell">
                <div
                  className="practice-media-frame"
                  onMouseDown={() => {
                    if (stage === 'ready') {
                      playSegment(segmentIndex)
                    }
                  }}
                  onPointerDown={() => {
                    if (stage === 'ready') {
                      playSegment(segmentIndex)
                    }
                  }}
                >
                  <video
                    className="baseline-video"
                    onEnded={() => setStage('explanation')}
                    onLoadedMetadata={(event) => {
                      event.currentTarget.currentTime = segment.startMs / 1000
                    }}
                    onTimeUpdate={(event) => {
                      if (
                        stage === 'playback' &&
                        event.currentTarget.currentTime >= segment.endMs / 1000
                      ) {
                        event.currentTarget.pause()
                        setStage('explanation')
                      }
                    }}
                    playsInline
                    preload="auto"
                    ref={videoRef}
                    src={videoSrc}
                  />
                  <div className="practice-video-shade" />

                  <div className="practice-video-topbar">
                    <div className="practice-video-meta">단일 LLM 화재 결과</div>
                    <div className="practice-video-meta">
                      {segmentIndex + 1} / {baselineSegments.length}
                    </div>
                  </div>

                  {stage === 'ready' ? (
                    <button
                      aria-label="영상 시작하기"
                      className="practice-start-overlay"
                      onClick={(event) => {
                        event.stopPropagation()
                        if (event.detail === 0) {
                          playSegment(segmentIndex)
                        }
                      }}
                      onMouseDown={(event) => {
                        event.stopPropagation()
                        playSegment(segmentIndex)
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        playSegment(segmentIndex)
                      }}
                      type="button"
                    >
                      <span className="practice-start-pill">
                        <Play className="size-6" />
                        시작하기
                      </span>
                    </button>
                  ) : null}
                </div>
              </section>

              <div className="practice-step-nav">
                {baselineSegments.map((item, index) => (
                  <button
                    aria-current={index === segmentIndex ? 'step' : undefined}
                    className={[
                      'practice-step-button',
                      index < segmentIndex
                        ? 'is-complete'
                        : index === segmentIndex
                          ? 'is-current'
                          : 'is-upcoming',
                    ].join(' ')}
                    key={item.id}
                    onClick={() => loadSegment(index)}
                    type="button"
                  >
                    <span>{index + 1}</span>
                    <span className="practice-step-status" aria-hidden="true">
                      {index < segmentIndex ? (
                        <CheckCircle2 size={14} />
                      ) : (
                        <span className="practice-step-dot" />
                      )}
                    </span>
                  </button>
                ))}
              </div>

              <section className="practice-hero-card">
                <div className="practice-hero-topline">
                  <span className="practice-status-pill">{currentStatus}</span>
                  <p className="practice-hero-prompt">
                    {stage === 'explanation'
                      ? segment.learnerPrompt
                      : '영상을 보고 멈추면 같이 연습해요.'}
                  </p>
                </div>
                <h1 className="practice-hero-title">
                  {stage === 'explanation'
                    ? segment.learnerExplanation
                    : '영상을 보고 멈추면 같이 연습해요.'}
                </h1>
              </section>
            </section>

            <PracticePanel
              isFinalSegment={segmentIndex === baselineSegments.length - 1}
              onNext={nextSegment}
              onReplay={replaySegment}
              onRest={() => setStage('rest')}
              onStart={() => playSegment(segmentIndex)}
              segment={segment}
              selectedAnswer={selectedAnswer}
              selectedAnswerId={selectedAnswerId}
              setSelectedAnswerId={setSelectedAnswerId}
              stage={stage}
            />
          </div>
        </div>
      </div>
    </main>
  )
}

function PracticeBrandStrip() {
  return (
    <section className="practice-brand-strip" aria-label="프로젝트 이름">
      <p className="practice-brand-line">
        <span>차근차근</span>
        <span className="practice-brand-red">재난 안전</span>
        <span>AI 도우미</span>
      </p>
    </section>
  )
}

function PracticePanel({
  isFinalSegment,
  onNext,
  onReplay,
  onRest,
  onStart,
  segment,
  selectedAnswer,
  selectedAnswerId,
  setSelectedAnswerId,
  stage,
}: {
  isFinalSegment: boolean
  onNext: () => void
  onReplay: () => void
  onRest: () => void
  onStart: () => void
  segment: BaselineSegment
  selectedAnswer?: AnswerOption
  selectedAnswerId: string | null
  setSelectedAnswerId: (value: string) => void
  stage: PracticeStage
}) {
  if (stage === 'rest') {
    return (
      <section className="practice-panel">
        <h2 className="practice-panel-title">쉬기</h2>
        <p className="practice-muted-copy">준비되면 같은 장면을 다시 볼 수 있어요.</p>
        <button className="practice-action-button" onClick={onReplay} type="button">
          <Play size={16} />
          다시 보기
        </button>
      </section>
    )
  }

  if (stage !== 'explanation') {
    return (
      <section className="practice-panel">
        <h2 className="practice-panel-title">장면을 본 뒤 연습해요</h2>
        <div className="practice-action-row">
          {stage === 'playback' ? (
            <button className="practice-action-button" onClick={onReplay} type="button">
              <Play size={16} />
              다시 보기
            </button>
          ) : null}
          <button className="practice-action-button" onClick={onRest} type="button">
            <PauseCircle size={16} />
            쉬기
          </button>
          {stage === 'ready' ? (
            <button
              className="practice-action-button is-primary next-ready-attention"
              onClick={onStart}
              type="button"
            >
              <span className="practice-cta-chip">이제 눌러요</span>
              영상 시작하기
            </button>
          ) : null}
        </div>
      </section>
    )
  }

  return (
    <section className="practice-panel">
      <section className="practice-section">
        <h2 className="practice-section-header">
          <span className="practice-section-icon">1</span>
          순서대로 읽어봐요
        </h2>
        <ol className="practice-sequence-list">
          {segment.sequence.map((step, index) => (
            <li key={`${segment.id}-${index}`}>
              <div
                className={[
                  'practice-sequence-row',
                  step.kind === 'situation' ? 'is-situation' : 'is-action',
                ].join(' ')}
              >
                <div className="practice-row-label">
                  <span>{index + 1}번</span>
                  <span
                    className={[
                      'practice-row-badge',
                      step.kind === 'situation' ? 'is-situation' : 'is-action',
                    ].join(' ')}
                  >
                    {step.kind === 'situation' ? '상황' : '해야 할 일'}
                  </span>
                </div>
                <p className="practice-row-text">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="practice-callout-stack">
        {segment.avoid ? <DoNotCard text={segment.avoid} /> : null}
        {segment.reason ? <ReasonCard text={segment.reason} /> : null}
      </div>

      <section className={['practice-question-card', !selectedAnswer && 'question-attention'].filter(Boolean).join(' ')}>
        <div className="practice-question-topline">
          <h2 className="practice-question-title">{segment.checkQuestion}</h2>
          <span className="practice-question-chip">
            {selectedAnswer ? '답을 골랐어요' : '여기를 골라요'}
          </span>
        </div>
        <div className="practice-answer-grid">
          {segment.options.map((option, optionIndex) => (
            <button
              className={[
                'practice-answer-button',
                selectedAnswerId === option.id
                  ? option.correct
                    ? 'is-correct'
                    : 'is-wrong'
                  : '',
              ].join(' ')}
              key={option.id}
              onClick={() => setSelectedAnswerId(option.id)}
              type="button"
            >
              <span className="practice-answer-marker">
                {String.fromCharCode(65 + optionIndex)}
              </span>
              <span>{option.label}</span>
              {selectedAnswerId === option.id ? (
                option.correct ? (
                  <CheckCircle2 size={20} />
                ) : (
                  <HelpCircle size={20} />
                )
              ) : null}
            </button>
          ))}
        </div>
        {selectedAnswer ? (
          <p
            className={[
              'practice-feedback',
              selectedAnswer.correct ? 'is-correct' : 'is-hint',
            ].join(' ')}
          >
            {selectedAnswer.correct ? <CheckCircle2 size={20} /> : <HelpCircle size={20} />}
            {selectedAnswer.feedback}
          </p>
        ) : (
          <p className="practice-muted-copy">답을 하나 고르면 다음으로 갈 수 있어요.</p>
        )}
      </section>

      <div className="practice-action-row">
        <button className="practice-action-button" onClick={onReplay} type="button">
          <RotateCcw size={16} />이 장면 다시 보기
        </button>
        <button className="practice-action-button" onClick={onRest} type="button">
          <PauseCircle size={16} />
          쉬기
        </button>
        {isFinalSegment ? (
          <button
            className="practice-action-button is-primary next-ready-attention"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            type="button"
          >
            <span className="practice-cta-chip">비교 끝</span>
            처음으로 보기
          </button>
        ) : (
          <button
            className={[
              'practice-action-button is-primary',
              selectedAnswer && 'next-ready-attention',
              !selectedAnswer && 'is-disabled',
            ]
              .filter(Boolean)
              .join(' ')}
            disabled={!selectedAnswer}
            onClick={onNext}
            type="button"
          >
            {selectedAnswer ? <span className="practice-cta-chip">이제 눌러요</span> : null}
            {selectedAnswer ? '다음 장면 보기' : '답을 고르면 다음으로 가요'}
          </button>
        )}
      </div>
    </section>
  )
}

function DoNotCard({ text }: { text: string }) {
  return (
    <div className="practice-callout is-warning">
      <div className="practice-callout-title">
        <TriangleAlert size={16} />
        하지 말아요
      </div>
      <p className="practice-callout-text">{text}</p>
    </div>
  )
}

function ReasonCard({ text }: { text: string }) {
  return (
    <div className="practice-callout is-reason">
      <h2 className="practice-callout-title">왜 이렇게 해야 할까요?</h2>
      <p className="practice-callout-text">{text}</p>
    </div>
  )
}

export default App
