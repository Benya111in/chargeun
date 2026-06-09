import { describe, expect, it } from 'vitest'

import { __testGeneratePracticeFromUrl } from '../../../../api/generate-practice-from-url'

const stormSafetyVtt = `WEBVTT

00:00:02.869 --> 00:00:04.430
여름철 호우 태풍 시 이것만은 꼭 지켜주세요

00:00:04.440 --> 00:00:07.039
지켜주세요
산행이나<00:00:04.950><c> 캠핑</c><00:00:05.040><c>은</c><00:00:05.580><c> 절대</c><00:00:06.120><c> 안돼요</c>

00:00:07.049 --> 00:00:09.169
산행이나 캠핑은 절대 안돼요
갑자기<00:00:07.500><c> 비가</c><00:00:07.799><c> 쏟아질</c><00:00:08.189><c> 경우엔</c><00:00:08.670><c> 즉시</c>

00:00:09.179 --> 00:00:11.629
갑자기 비가 쏟아질 경우엔 즉시
안전한<00:00:09.840><c> 곳으로</c><00:00:10.139><c> 대피</c><00:00:10.500><c>합니다</c>

00:00:11.639 --> 00:00:13.910
침수 위험이 있는 낮은 다리는 절대 건너지

00:00:13.920 --> 00:00:16.640
말고 통행 중 고립되었다면 119

00:00:16.650 --> 00:00:18.109
119에 신고합니다

00:00:18.119 --> 00:00:20.300
신고합니다
배수로<00:00:18.510><c>나</c><00:00:18.810><c> 물꼬는</c><00:00:19.080><c> 미리</c><00:00:19.500><c> 점검하고</c>

00:00:20.310 --> 00:00:22.429
배수로나 물꼬는 미리 점검하고 비가 많이 올 땐 물꼬 점검을 나가지 않습니다

00:00:25.609 --> 00:00:31.270
안전수칙 또 챙겨주세요
`

const typhoonPreparednessVtt = `WEBVTT

00:00:00.719 --> 00:00:07.599
펭수와 함께하는 국민행동요령 태풍

00:00:16.630 --> 00:00:32.079
부탁해 오늘은 기다리던 휴가 쇼핑도 하고 뭐라고 휴가에 태풍이 온다고

00:00:32.079 --> 00:00:39.640
태풍이 한반도를 향해 북상하고 있습니다 외출을 자제하시고 태풍 이렇게 대비하세요

00:00:39.640 --> 00:00:45.920
실내에서는 문과 창문을 닫고 창문 가까이 접근하지 않도록 합니다

00:00:45.920 --> 00:00:52.120
부득이하게 외출을 해야 할 때는 건물에 간판이나 위험 시설물 주변을 피해 주세요

00:00:52.120 --> 00:00:57.600
집 주변 침수피해가 없도록 배수구가 막힌 곳이 없는지 점검합니다

00:00:57.600 --> 00:01:03.559
하천 주차 차량은 옮겨두고 운전을 해야 할 경우

00:01:03.559 --> 00:01:14.400
서행운전을 해야 합니다 농촌에서는 물꼬 점검을 나가지 않는 것이 좋으며 시설물을 단단히 묶고 배수로를 정비하여 피해를 예방합니다

00:01:14.400 --> 00:01:23.190
바닷가 주변 주민은 안전한 곳으로 대피하고 선박 등은 단단하게 묶어 두어야 합니다

00:01:27.799 --> 00:01:40.120
태풍피해 없이 휴가를 보낼 수 있었다
`

const typhoonIntroOnlyVtt = `WEBVTT

00:00:00.000 --> 00:00:06.000
태풍이 한반도를 향해 북상하고 있습니다
`

const longUnknownCaptionVtt = `WEBVTT

00:00:00.000 --> 00:01:12.000
재난안전 영상을 보고 있어요. 먼저 안내 방송을 듣고 주변을 살펴요. 다음에는 선생님이나 보호자와 함께 움직여요. 혼자 급하게 뛰지 말고 안전한 곳에서 기다려요.
`

const directAudioTyphoonCues = [
  {
    endMs: 7_590,
    startMs: 720,
    text: '펭수와 함께하는 국민행동요령 태풍',
  },
  {
    endMs: 32_080,
    startMs: 16_630,
    text: '부탁해 오늘은 기다리던 휴가 쇼핑도 하고 뭐라고 휴가에 태풍이 온다고',
  },
  {
    endMs: 39_640,
    startMs: 32_080,
    text: '태풍이 한반도를 향해 북상하고 있습니다 외출을 자제하시고 태풍 이렇게 대비하세요',
  },
  {
    endMs: 45_920,
    startMs: 39_640,
    text: '실내에서는 문과 창문을 닫고 창문 가까이 접근하지 않도록 합니다',
  },
  {
    endMs: 53_120,
    startMs: 45_920,
    text: '부득이하게 외출을 해야 할 때는 건물에 간판이나 위험 시설물 주변을 피해 주세요',
  },
  {
    endMs: 57_600,
    startMs: 53_120,
    text: '집 주변 침수피해가 없도록 배수구가 막힌 곳이 없는지 점검합니다',
  },
  {
    endMs: 63_560,
    startMs: 57_600,
    text: '하천 주차 차량은 옮겨두고 운전을 해야 할 경우 서행운전을 해야 합니다',
  },
  {
    endMs: 74_400,
    startMs: 63_560,
    text: '농촌에서는 물꼬 점검을 나가지 않는 것이 좋으며 시설물을 단단히 묶고 배수로를 정비하여 피해를 예방합니다',
  },
  {
    endMs: 83_190,
    startMs: 74_400,
    text: '바닷가 주변 주민은 안전한 곳으로 대피하고 선박 등은 단단하게 묶어 두어야 합니다',
  },
  {
    endMs: 100_120,
    startMs: 87_800,
    text: '태풍피해 없이 휴가를 보낼 수 있었다',
  },
]

const currentTyphoonBehaviorCues = [
  {
    endMs: 7_200,
    startMs: 0,
    text: '우리의 안전은 우리 손으로 민방위가 지켜갑니다',
  },
  {
    endMs: 18_160,
    startMs: 12_800,
    text: '매년 여름이면 어김없이 찾아와 삶의 터전을 마구 핥히고 가는 자연재난',
  },
  {
    endMs: 26_640,
    startMs: 18_160,
    text: '바로 태풍입니다. 태풍은 바람도 바람이지만 대부분 집중호우를 몰고와 피해를 더 키우기 마련인데요',
  },
  {
    endMs: 29_920,
    startMs: 26_640,
    text: '어떻게 대처해야 할까요?',
  },
  {
    endMs: 45_480,
    startMs: 39_280,
    text: '태풍이 발생하면 실내에서는 문과 창문을 닫고 외출을 하지 말며',
  },
  {
    endMs: 54_480,
    startMs: 45_480,
    text: '수시로 기상상황을 확인합니다. 물에 자주 잠기는 곳이나 산사태가 일어날 수 있는 위험한 곳을 피하고',
  },
  {
    endMs: 58_960,
    startMs: 54_480,
    text: '개울가나 하천변, 해안가 같은 곳은 침수될 수 있고',
  },
  {
    endMs: 67_280,
    startMs: 58_960,
    text: '급류에 휩쓸릴 수도 있어 가까이 가지 않습니다. 큰 바람이 불면 공사자재가 넘어지거나 날릴 수 있으니까',
  },
  {
    endMs: 75_520,
    startMs: 67_280,
    text: '공사장 근처에 가까이 가지 않고요. 산이나 계곡을 찾은 등산객은 신속하게 안전한 곳으로 대피합니다',
  },
  {
    endMs: 83_160,
    startMs: 75_520,
    text: '또 농촌에서는 논뚝이나 물고를 점검하기 위해 무리하게 나서는 일이 없도록 해야 합니다',
  },
]

const directAudioHeatwaveCues = [
  {
    endMs: 6_900,
    startMs: 0,
    text: '펭수와 함께하는 재난 대비 국민 행동 요령 폭염',
  },
  {
    endMs: 13_900,
    startMs: 6_900,
    text: '폭염과 맞서 싸우는 비밀 요원이 폭염에 대해 알려줍니다',
  },
  {
    endMs: 20_900,
    startMs: 13_900,
    text: '폭염은 열사병과 열경련을 일으킬 수 있는 자연재난입니다',
  },
  {
    endMs: 28_900,
    startMs: 20_900,
    text: '체감온도 33도 이상이면 폭염주의보 35도 이상이면 폭염경보입니다',
  },
  {
    endMs: 32_900,
    startMs: 28_900,
    text: '폭염 대비 작전이 시작됩니다',
  },
  {
    endMs: 38_900,
    startMs: 32_900,
    text: 'TV나 라디오를 통해 수시로 기상 상황을 파악합니다',
  },
  {
    endMs: 43_900,
    startMs: 38_900,
    text: '폭염이 발생한 날에는 가급적 야외활동을 자제합니다',
  },
  {
    endMs: 51_900,
    startMs: 43_900,
    text: '생존전략 2. 외출할 때는 가벼운 옷차림으로 체온을 낮추고 물을 자주 마실 것',
  },
  {
    endMs: 56_900,
    startMs: 51_900,
    text: '갈증을 느끼지 않아도 충분한 수분을 유지하는 것이 필요하기 때문이다',
  },
  {
    endMs: 64_900,
    startMs: 56_900,
    text: '생존전략 3. 야외활동 중에는 그늘에서 자주 휴식하며 건강상태를 체크할 것',
  },
  {
    endMs: 72_900,
    startMs: 64_900,
    text: '열사병 증상이 있다면 시원한 곳에서 휴식을 취하고 심하면 병원에서 진료를 받자',
  },
]

const directAudioWildfireCues = [
  {
    endMs: 3_200,
    startMs: 0,
    text: '다행이와 함께하는 산불 국민행동요량?',
  },
  {
    endMs: 6_960,
    startMs: 3_200,
    text: '평소에는 산림 근처에서 소각 행위를 하지 말고',
  },
  {
    endMs: 12_500,
    startMs: 6_960,
    text: '화목보일러 사용 후에는 불씨가 완전히 꺼졌는지 끝까지 꼭 확인해주세요',
  },
  {
    endMs: 16_200,
    startMs: 12_500,
    text: '산에 갈 때는 라이터와 담배를 절대 가져가지 마세요',
  },
  {
    endMs: 21_200,
    startMs: 16_200,
    text: '산불이 발생하면 대피 안내를 확인하고 주변의 상황을 즉시 알려주세요',
  },
  {
    endMs: 29_100,
    startMs: 21_200,
    text: '대피할 때는 산과 떨어진 도로를 이용해 산불 확산 구역을 피해 이동하고 가능하면 신속히 대피해주세요',
  },
  {
    endMs: 32_400,
    startMs: 29_100,
    text: '대피가 어려운 경우에는 주변 낙엽을 제거하고',
  },
  {
    endMs: 35_100,
    startMs: 32_400,
    text: '낮은 자세로 엎드려 몸을 보호해야 합니다',
  },
  {
    endMs: 39_540,
    startMs: 35_100,
    text: '실수로 낸 산불도 처벌 대상이 되니 꼭 명심해주세요',
  },
]

describe('URL practice generation quality gate', () => {
  it('splits short caption-heavy disaster videos by learning topic', () => {
    const cues = __testGeneratePracticeFromUrl.parseVtt(stormSafetyVtt)
    const hazard = __testGeneratePracticeFromUrl.detectHazard(
      `호우 태풍\n${cues.map((cue) => cue.text).join('\n')}`,
    )
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues,
      hazard,
      jobId: 'generated-test-storm',
      sourceTitle: '호우·태풍 안전예방수칙',
      sourceUrl: 'https://www.youtube.com/watch?v=IiVsojHcoEo',
      videoSrc: '/generated/generated-test-storm/source.mp4',
    })
    const report = __testGeneratePracticeFromUrl.auditGeneratedScenario(
      scenario,
      cues,
    )

    expect(scenario.segments).toHaveLength(7)
    expect(scenario.segments.map((segment) => segment.learnerPrompt)).toEqual([
      '비와 태풍 안전수칙을 배워요.',
      '비와 태풍이 올 수 있어요.',
      '비가 갑자기 많이 와요.',
      '물이 찬 낮은 곳이 있어요.',
      '혼자 움직이기 어려워요.',
      '물이 불어난 곳은 위험해요.',
      '안전수칙을 다시 기억해요.',
    ])
    expect(report.issues).toEqual([])
    expect(report.passed).toBe(true)
    expect(report.score).toBe(100)
    expect(report.analysisDepth.segmentationEvidence).toContain('audio-asr')
    expect(report.analysisDepth.frameBoundaryPrecisionMs).toBe(10)
  })

  it('keeps direct-audio ASR boundaries between signage, drain, and river topics', () => {
    const hazard = __testGeneratePracticeFromUrl.detectHazard('태풍')
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues: directAudioTyphoonCues,
      hazard,
      jobId: 'generated-test-direct-audio-typhoon',
      sourceTitle: '태풍 대비법',
      sourceUrl: 'https://www.youtube.com/watch?v=oWu95ZitpTI',
      videoSrc: '/generated/generated-test-direct-audio-typhoon/source.mp4',
    })
    const report = __testGeneratePracticeFromUrl.auditGeneratedScenario(
      scenario,
      directAudioTyphoonCues,
    )
    const signage = scenario.segments.find((segment) =>
      segment.sourceTopicKeys?.includes('outdoor_signage'),
    )!
    const drain = scenario.segments.find((segment) =>
      segment.sourceTopicKeys?.includes('home_drain'),
    )!
    const river = scenario.segments.find((segment) =>
      segment.sourceTopicKeys?.includes('river_car_drive'),
    )!

    expect(signage.endMs).toBeLessThanOrEqual(53_120)
    expect(drain.startMs).toBeGreaterThanOrEqual(53_120)
    expect(drain.endMs).toBeLessThanOrEqual(57_600)
    expect(river.startMs).toBeGreaterThanOrEqual(57_600)
    expect(drain.teacherGuide.script).not.toMatch(/하천|차량/u)
    expect(report.passed).toBe(true)
  })

  it('keeps a longer typhoon guidance video split into one-decision scenes', () => {
    const cues = __testGeneratePracticeFromUrl.parseVtt(typhoonPreparednessVtt)
    const hazard = __testGeneratePracticeFromUrl.detectHazard(
      `태풍\n${cues.map((cue) => cue.text).join('\n')}`,
    )
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues,
      hazard,
      jobId: 'generated-test-typhoon',
      sourceTitle: '태풍 대비법',
      sourceUrl: 'https://www.youtube.com/watch?v=oWu95ZitpTI',
      videoSrc: '/generated/generated-test-typhoon/source.mp4',
    })
    const report = __testGeneratePracticeFromUrl.auditGeneratedScenario(
      scenario,
      cues,
    )

    expect(scenario.generatedTopicLabel).toBe('태풍 영상 학습')
    expect(scenario.segments.map((segment) => segment.learnerPrompt)).toEqual([
      '태풍 안전수칙을 배워요.',
      '태풍 소식을 확인하고 있어요.',
      '태풍이 가까이 오고 있어요.',
      '집 안에 있어요.',
      '밖에는 떨어질 수 있는 물건이 있어요.',
      '집 주변에 물이 찰 수 있어요.',
      '하천 근처와 도로가 위험할 수 있어요.',
      '논둑이나 물꼬를 보러 나가면 위험해요.',
      '바닷가는 위험할 수 있어요.',
      '태풍 안전수칙을 다시 기억해요.',
    ])
    expect(
      scenario.segments.flatMap((segment) => segment.actionReasons),
    ).not.toContain('문을 닫으면 위험한 연기가 덜 퍼져요.')
    expect(report.passed).toBe(true)
    expect(report.issues).toHaveLength(0)
    expect(report.analysisDepth.expandedCueCount).toBeGreaterThanOrEqual(
      cues.length,
    )
    const actionSegments = scenario.segments.filter(
      (segment) => segment.practiceMode === 'action',
    )
    expect(actionSegments.map((segment) => segment.checkQuestion)).not.toContain(
      '무엇을 기억할까요?',
    )
    expect(
      actionSegments.flatMap((segment) =>
        segment.answerOptions.map((option) => option.label),
      ),
    ).not.toEqual(expect.arrayContaining(['안전', '태풍']))
  })

  it('keeps grounded intro-only LLM segments out of validated teach-back tracks', () => {
    const cues = __testGeneratePracticeFromUrl.parseVtt(typhoonIntroOnlyVtt)
    const hazard = __testGeneratePracticeFromUrl.detectHazard('태풍')
    const evidenceReport =
      __testGeneratePracticeFromUrl.buildGenerationEvidenceReport({
        cues,
        rawCues: cues,
        sceneCutCandidatesMs: [],
        videoProbe: { durationMs: 6_000, frameRate: null },
      })
    const scenario = __testGeneratePracticeFromUrl.buildScenarioFromLlmPlan({
      cues,
      evidenceReport,
      hazard,
      jobId: 'generated-test-intro-grounding',
      plan: {
        hazardType: 'typhoon',
        note: '태풍 설명 장면입니다.',
        segments: [
          {
            actionReasons: [],
            actionSteps: [],
            answerOptions: [
              {
                correct: true,
                feedback: '태풍 소식을 확인해요.',
                kind: 'signal',
                label: '태풍 소식',
              },
              {
                correct: false,
                feedback: '행동 장면에서 다시 확인해요.',
                kind: 'signal',
                label: '아무 소식 없음',
              },
            ],
            checkQuestion: '',
            doNot: '',
            endMs: 6_000,
            learnerExplanation: '태풍 소식이 나왔어요.',
            learnerPrompt: '태풍 소식을 들어요.',
            learnerSequence: [
              { kind: 'situation', text: '태풍 소식이 나왔어요.' },
            ],
            practiceMode: 'intro',
            requiredLearnerKeywords: ['태풍'],
            sourceTopicKeys: ['typhoon_warning'],
            startMs: 0,
            teacherGuide: {
              correction: '다음 행동 장면에서 확인합니다.',
              observe: '태풍 소식을 듣는지 봅니다.',
              prompt: '무슨 소식이 나왔나요?',
              script: '태풍이 한반도를 향해 북상하고 있습니다.',
            },
          },
        ],
        title: '태풍 대비법',
      },
      sourceTitle: '태풍 대비법',
      sourceUrl: 'https://www.youtube.com/watch?v=oWu95ZitpTI',
      videoPlaybackKind: 'file',
      videoSrc: '/generated/generated-test-intro-grounding/source.mp4',
    })
    const segment = scenario.segments[0]!

    expect(segment.practiceMode).toBe('intro')
    expect(segment.teachBack).toBeNull()
    expect(segment.structuredExplanation.segment.status).toBe('needs_review')
    expect(segment.structuredExplanation.tracks.action).toBeUndefined()
    expect(segment.structuredExplanation.tracks.teachBack).toBeUndefined()
  })

  it('publishes source-evidence fallback when no official RAG rule matches', () => {
    const cues = [
      {
        endMs: 5_000,
        startMs: 0,
        text: '안전수칙을 다시 기억해요. 초록 가방을 챙겨요.',
      },
    ]
    const hazard = __testGeneratePracticeFromUrl.detectHazard('대설')
    const evidenceReport =
      __testGeneratePracticeFromUrl.buildGenerationEvidenceReport({
        cues,
        rawCues: cues,
        sceneCutCandidatesMs: [],
        videoProbe: { durationMs: 5_000, frameRate: null },
      })
    const scenario = __testGeneratePracticeFromUrl.buildScenarioFromLlmPlan({
      cues,
      evidenceReport,
      hazard,
      jobId: 'generated-test-source-evidence-fallback',
      plan: {
        hazardType: 'heavy_snow',
        note: '공식 RAG에 없는 표현도 직접 근거로 공개합니다.',
        segments: [
          {
            actionReasons: ['영상에서 직접 말한 준비 행동이에요.'],
            actionSteps: ['초록 가방을 챙겨요'],
            answerOptions: [],
            checkQuestion: '',
            doNot: '혼자 급하게 움직이지 않아요.',
            endMs: 5_000,
            learnerExplanation: '초록 가방을 챙겨요',
            learnerPrompt: '준비할 물건이 있어요.',
            learnerSequence: [
              { kind: 'situation', text: '준비할 물건이 있어요.' },
              { kind: 'action', text: '초록 가방을 챙겨요' },
            ],
            practiceMode: 'action',
            requiredLearnerKeywords: ['초록 가방'],
            sourceTopicKeys: ['outro_review'],
            startMs: 0,
            teacherGuide: {
              correction: '영상에서 나온 준비 행동을 다시 짚어 줍니다.',
              observe: '초록 가방을 고르는지 봅니다.',
              prompt: '무엇을 챙겨야 하나요?',
              script: '안전수칙을 다시 기억해요. 초록 가방을 챙겨요.',
            },
          },
        ],
        title: '직접 근거 fallback 테스트',
      },
      sourceTitle: '직접 근거 fallback 테스트',
      sourceUrl: 'https://example.com/source-evidence-only',
      videoPlaybackKind: 'file',
      videoSrc: '/generated/generated-test-source-evidence-fallback/source.mp4',
    })
    const segment = scenario.segments[0]!
    const report = __testGeneratePracticeFromUrl.validateGeneratedScenarioForPublish(
      scenario,
      cues,
      evidenceReport,
    )

    expect(segment.practiceMode).toBe('action')
    expect(segment.segment.officialRuleIds).toEqual([
      'SOURCE_EVIDENCE_HEAVY_SNOW',
    ])
    expect(segment.structuredExplanation.segment.status).toBe('validated')
    expect(segment.teachBack).not.toBeNull()
    expect(report.passed).toBe(true)
    expect(report.groundingPassed).toBe(true)
  })

  it('repairs missing learner keywords before giving up on generation', () => {
    const cues = __testGeneratePracticeFromUrl.parseVtt(typhoonPreparednessVtt)
    const hazard = __testGeneratePracticeFromUrl.detectHazard('태풍')
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues,
      hazard,
      jobId: 'generated-test-keyword-repair',
      sourceTitle: '태풍 대비법',
      sourceUrl: 'https://www.youtube.com/watch?v=oWu95ZitpTI',
      videoSrc: '/generated/generated-test-keyword-repair/source.mp4',
    })
    const target = scenario.segments.find(
      (segment) => segment.practiceMode === 'action',
    )!
    target.requiredLearnerKeywords = ['우비']

    const failedReport =
      __testGeneratePracticeFromUrl.validateGeneratedScenarioForPublish(
        scenario,
        cues,
        scenario.generationEvidenceReport,
      )

    expect(failedReport.issues.map((issue) => issue.code)).toContain(
      'missing_required_keyword',
    )

    const repaired = __testGeneratePracticeFromUrl.repairScenarioForQuality({
      hazard,
      jobId: 'generated-test-keyword-repair',
      report: failedReport,
      scenario,
      sourceTitle: '태풍 대비법',
      sourceUrl: 'https://www.youtube.com/watch?v=oWu95ZitpTI',
    })
    const repairedReport =
      __testGeneratePracticeFromUrl.validateGeneratedScenarioForPublish(
        repaired.scenario,
        cues,
        repaired.scenario.generationEvidenceReport,
      )

    expect(repaired.changed).toBe(true)
    expect(repairedReport.passed).toBe(true)
  })

  it('blocks generic teach-back questions that are detached from actions', () => {
    const cues = __testGeneratePracticeFromUrl.parseVtt(typhoonPreparednessVtt)
    const hazard = __testGeneratePracticeFromUrl.detectHazard('태풍')
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues,
      hazard,
      jobId: 'generated-test-low-quality-teach-back',
      sourceTitle: '태풍 대비법',
      sourceUrl: 'https://www.youtube.com/watch?v=oWu95ZitpTI',
      videoSrc: '/generated/generated-test-low-quality-teach-back/source.mp4',
    })
    const target = scenario.segments.find(
      (segment) => segment.practiceMode === 'action',
    )!
    target.checkQuestion = '무엇이 중요할까요?'
    target.answerOptions = [
      {
        ...target.answerOptions[0]!,
        correct: true,
        label: '안전',
      },
      {
        ...target.answerOptions[1]!,
        correct: false,
        label: '태풍',
      },
    ]

    const report =
      __testGeneratePracticeFromUrl.validateGeneratedScenarioForPublish(
        scenario,
        cues,
        scenario.generationEvidenceReport,
      )

    expect(report.passed).toBe(false)
    expect(report.issues.map((issue) => issue.code)).toContain(
      'low_quality_teach_back',
    )
  })

  it('splits long caption blocks even when topic keywords are unknown', () => {
    const cues = __testGeneratePracticeFromUrl.parseVtt(longUnknownCaptionVtt)
    const hazard = __testGeneratePracticeFromUrl.detectHazard(
      cues.map((cue) => cue.text).join('\n'),
    )
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues,
      hazard,
      jobId: 'generated-test-long-caption',
      sourceTitle: '새 재난안전 영상',
      sourceUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
      videoSrc: '/generated/generated-test-long-caption/source.mp4',
    })
    const report = __testGeneratePracticeFromUrl.auditGeneratedScenario(
      scenario,
      cues,
    )

    expect(scenario.generatedTopicLabel).toBe('재난안전 영상 학습')
    expect(scenario.segments.length).toBeGreaterThan(1)
    expect(
      scenario.segments.every(
        (segment) => segment.endMs - segment.startMs <= 30_000,
      ),
    ).toBe(true)
    expect(report.issues.map((issue) => issue.code)).not.toContain(
      'segment_too_long',
    )
  })

  it('blocks outputs that collapse multiple audio topics into too few scenes', () => {
    const cues = __testGeneratePracticeFromUrl.parseVtt(stormSafetyVtt)
    const hazard = __testGeneratePracticeFromUrl.detectHazard('호우 태풍')
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues,
      hazard,
      jobId: 'generated-test-storm',
      sourceTitle: '호우·태풍 안전예방수칙',
      sourceUrl: 'https://www.youtube.com/watch?v=IiVsojHcoEo',
      videoSrc: '/generated/generated-test-storm/source.mp4',
    })
    const collapsedScenario = {
      ...scenario,
      segments: scenario.segments.slice(0, 2),
    }
    const report = __testGeneratePracticeFromUrl.auditGeneratedScenario(
      collapsedScenario,
      cues,
    )

    expect(report.passed).toBe(false)
    expect(report.issues.map((issue) => issue.code)).toContain(
      'too_few_segments_for_audio_topics',
    )
  })

  it('blocks outputs that skip meaningful spoken guidance between scenes', () => {
    const cues = __testGeneratePracticeFromUrl.parseVtt(typhoonPreparednessVtt)
    const hazard = __testGeneratePracticeFromUrl.detectHazard('태풍')
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues,
      hazard,
      jobId: 'generated-test-typhoon-gap',
      sourceTitle: '태풍 대비법',
      sourceUrl: 'https://www.youtube.com/watch?v=oWu95ZitpTI',
      videoSrc: '/generated/generated-test-typhoon-gap/source.mp4',
    })
    const gappedScenario = {
      ...scenario,
      segments: scenario.segments.filter(
        (segment) => !segment.learnerPrompt.includes('집 주변'),
      ),
    }
    const report = __testGeneratePracticeFromUrl.auditGeneratedScenario(
      gappedScenario,
      cues,
    )

    expect(report.passed).toBe(false)
    expect(report.issues.map((issue) => issue.code)).toContain(
      'uncovered_audio_cue',
    )
  })

  it('blocks action scenes that mix two source decision topics', () => {
    const hazard = __testGeneratePracticeFromUrl.detectHazard('태풍')
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues: directAudioTyphoonCues,
      hazard,
      jobId: 'generated-test-mixed-action-topic',
      sourceTitle: '태풍 대비법',
      sourceUrl: 'https://www.youtube.com/watch?v=oWu95ZitpTI',
      videoSrc: '/generated/generated-test-mixed-action-topic/source.mp4',
    })
    const drainIndex = scenario.segments.findIndex((segment) =>
      segment.sourceTopicKeys?.includes('home_drain'),
    )
    const riverSegment = scenario.segments.find((segment) =>
      segment.sourceTopicKeys?.includes('river_car_drive'),
    )!
    const mixedScenario = structuredClone(scenario)
    const mixedSegment = mixedScenario.segments[drainIndex]!
    mixedSegment.endMs = riverSegment.endMs
    mixedSegment.sourceTopicKeys = ['home_drain', 'river_car_drive']
    mixedSegment.teacherGuide.script = `${mixedSegment.teacherGuide.script} ${riverSegment.teacherGuide.script}`
    const report = __testGeneratePracticeFromUrl.auditGeneratedScenario(
      mixedScenario,
      directAudioTyphoonCues,
    )

    expect(report.passed).toBe(false)
    expect(report.sourceCoveragePassed).toBe(false)
    expect(report.issues.map((issue) => issue.code)).toContain(
      'mixed_action_topic_segment',
    )
  })

  it('repairs mixed action topic scenes by splitting them before publish', () => {
    const hazard = __testGeneratePracticeFromUrl.detectHazard('태풍')
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues: directAudioTyphoonCues,
      hazard,
      jobId: 'generated-test-mixed-action-topic-repair',
      sourceTitle: '태풍 대비법',
      sourceUrl: 'https://www.youtube.com/watch?v=oWu95ZitpTI',
      videoSrc: '/generated/generated-test-mixed-action-topic-repair/source.mp4',
    })
    const drainIndex = scenario.segments.findIndex((segment) =>
      segment.sourceTopicKeys?.includes('home_drain'),
    )
    const riverSegment = scenario.segments.find((segment) =>
      segment.sourceTopicKeys?.includes('river_car_drive'),
    )!
    const mixedScenario = structuredClone(scenario)
    const mixedSegment = mixedScenario.segments[drainIndex]!
    mixedSegment.endMs = riverSegment.endMs
    mixedSegment.sourceTopicKeys = ['home_drain', 'river_car_drive']
    mixedSegment.narration = [
      ...mixedSegment.narration,
      ...riverSegment.narration,
    ]
    mixedSegment.teacherGuide.script = `${mixedSegment.teacherGuide.script} ${riverSegment.teacherGuide.script}`
    const failedReport = __testGeneratePracticeFromUrl.auditGeneratedScenario(
      mixedScenario,
      directAudioTyphoonCues,
    )

    const repaired = __testGeneratePracticeFromUrl.repairScenarioForQuality({
      hazard,
      jobId: 'generated-test-mixed-action-topic-repair',
      report: failedReport,
      scenario: mixedScenario,
      sourceTitle: '태풍 대비법',
      sourceUrl: 'https://www.youtube.com/watch?v=oWu95ZitpTI',
    })
    const repairedReport =
      __testGeneratePracticeFromUrl.validateGeneratedScenarioForPublish(
        repaired.scenario,
        directAudioTyphoonCues,
        repaired.scenario.generationEvidenceReport,
      )

    expect(repaired.changed).toBe(true)
    expect(
      repaired.scenario.segments.some(
        (segment) =>
          segment.practiceMode === 'action' &&
          (segment.sourceTopicKeys?.length ?? 0) > 1,
      ),
    ).toBe(false)
    expect(repairedReport.issues.map((issue) => issue.code)).not.toContain(
      'mixed_action_topic_segment',
    )
    expect(repairedReport.passed).toBe(true)
  })

  it('does not split one completed audio sentence just because visual OCR has another topic', () => {
    const cues = [
      {
        endMs: 4_400,
        startMs: 0,
        text: '여름철 호우나 태풍 시 이것만은 꼭 지켜주세요.',
      },
      {
        endMs: 7_000,
        startMs: 4_400,
        text: '산행이나 캠핑은 절대 안 돼요.',
      },
    ]
    const hazard = __testGeneratePracticeFromUrl.detectHazard('호우 태풍')
    const evidenceReport =
      __testGeneratePracticeFromUrl.buildGenerationEvidenceReport({
        cues,
        rawCues: cues,
        sceneCutCandidatesMs: [],
        videoProbe: { durationMs: 7_000, frameRate: null },
        visualCaptionEvidence: {
          boundaries: [],
          frames: [
            {
              confidence: 0.96,
              hasLearningCaption: true,
              index: 0,
              normalizedCaption:
                '재해유형별 인명피해 분석 결과 1위 하천급류 2위 산사태 3위 건물침수',
              tsMs: 5_700,
              visibleCaption:
                '재해유형별 인명피해 분석 결과 1위 하천급류 2위 산사태 3위 건물침수',
            },
            {
              confidence: 0.96,
              hasLearningCaption: true,
              index: 1,
              normalizedCaption: '집중호우 시 산행·캠핑 금지',
              tsMs: 6_750,
              visibleCaption: '집중호우 시 산행·캠핑 금지',
            },
          ],
          warnings: [],
        },
      })
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues,
      evidenceReport,
      hazard,
      jobId: 'generated-test-keep-audio-sentence',
      sourceTitle: '호우 태풍 행동요령',
      sourceUrl: 'https://www.youtube.com/watch?v=IiVsojHcoEo',
      videoSrc: '/generated/generated-test-keep-audio-sentence/source.mp4',
    })
    const report = __testGeneratePracticeFromUrl.auditGeneratedScenario(
      scenario,
      cues,
      evidenceReport,
    )
    const actionSegment = scenario.segments.find(
      (segment) => segment.practiceMode === 'action',
    )!

    expect(actionSegment.startMs).toBe(4_400)
    expect(actionSegment.endMs).toBe(7_000)
    expect(actionSegment.narration).toEqual([
      {
        endMs: 7_000,
        source: 'audio',
        startMs: 4_400,
        text: '산행이나 캠핑은 절대 안 돼요.',
      },
    ])
    expect(actionSegment.sourceTopicKeys).toEqual(['outdoor_activity'])
    expect(report.issues.map((issue) => issue.code)).not.toContain(
      'mixed_action_topic_segment',
    )
    expect(report.passed).toBe(true)
  })

  it('keeps learner cards tied to direct narration when OCR contains a different topic', () => {
    const cues = [
      {
        endMs: 4_400,
        startMs: 0,
        text: '여름철 호우나 태풍 시 이것만은 꼭 지켜주세요.',
      },
      {
        endMs: 7_000,
        startMs: 4_400,
        text: '산행이나 캠핑은 절대 안 돼요.',
      },
      {
        endMs: 11_300,
        startMs: 7_000,
        text: '갑자기 비가 쏟아질 경우에는 즉시 안전한 곳으로 대피합니다.',
      },
    ]
    const hazard = __testGeneratePracticeFromUrl.detectHazard('호우 태풍')
    const evidenceReport =
      __testGeneratePracticeFromUrl.buildGenerationEvidenceReport({
        cues,
        rawCues: cues,
        sceneCutCandidatesMs: [],
        videoProbe: { durationMs: 11_300, frameRate: null },
        visualCaptionEvidence: {
          boundaries: [],
          frames: [
            {
              confidence: 0.96,
              hasLearningCaption: true,
              index: 0,
              normalizedCaption:
                '재해유형별 인명피해 분석 결과 1위 하천급류 2위 산사태 3위 건물침수',
              tsMs: 5_700,
              visibleCaption:
                '재해유형별 인명피해 분석 결과 1위 하천급류 2위 산사태 3위 건물침수',
            },
            {
              confidence: 0.96,
              hasLearningCaption: true,
              index: 1,
              normalizedCaption: '집중호우 시 산행·캠핑 금지',
              tsMs: 6_750,
              visibleCaption: '집중호우 시 산행·캠핑 금지',
            },
            {
              confidence: 0.96,
              hasLearningCaption: true,
              index: 2,
              normalizedCaption:
                '재해유형별 인명피해 분석 결과 1위 하천급류 2위 산사태 3위 건물침수',
              tsMs: 9_150,
              visibleCaption:
                '재해유형별 인명피해 분석 결과 1위 하천급류 2위 산사태 3위 건물침수',
            },
          ],
          warnings: [],
        },
      })
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues,
      evidenceReport,
      hazard,
      jobId: 'generated-test-narration-card-evidence',
      sourceTitle: '호우 태풍 행동요령',
      sourceUrl: 'https://www.youtube.com/watch?v=IiVsojHcoEo',
      videoSrc: '/generated/generated-test-narration-card-evidence/source.mp4',
    })
    const report = __testGeneratePracticeFromUrl.auditGeneratedScenario(
      scenario,
      cues,
      evidenceReport,
    )
    const outdoorSegment = scenario.segments.find((segment) =>
      segment.sourceTopicKeys?.includes('outdoor_activity'),
    )!
    const evacuationSegment = scenario.segments.find((segment) =>
      segment.sourceTopicKeys?.includes('evacuate_to_safe_place'),
    )!
    const outdoorCorrectOption = outdoorSegment.answerOptions.find(
      (option) => option.correct,
    )
    const evacuationCorrectOption = evacuationSegment.answerOptions.find(
      (option) => option.correct,
    )

    expect(outdoorSegment.actionSteps).toEqual([
      '산행과 캠핑은 멈추고 안전한 곳에 있어요',
    ])
    expect(outdoorSegment.checkQuestion).toBe('태풍 때 무엇을 멈출까요?')
    expect(outdoorCorrectOption?.label).toBe('산행과 캠핑')
    expect(outdoorSegment.structuredExplanation.tracks.doNot?.text).toBe(
      '산이나 캠핑장에 가지 않아요.',
    )
    expect(
      [
        outdoorSegment.learnerExplanation,
        ...outdoorSegment.actionSteps,
        outdoorSegment.checkQuestion,
        outdoorCorrectOption?.label,
        outdoorSegment.structuredExplanation.tracks.doNot?.text,
      ].join(' '),
    ).toMatch(/캠핑/u)
    expect(outdoorSegment.teacherGuide.script).not.toMatch(
      /개울가|하천\s*변|해안가/u,
    )
    expect(evacuationSegment.actionSteps).toEqual(['안전한 곳으로 가요'])
    expect(evacuationSegment.checkQuestion).toBe('어디로 갈까요?')
    expect(evacuationCorrectOption?.label).toBe('안전한 곳')
    expect(evacuationSegment.learnerPrompt).toBe('비가 갑자기 많이 와요.')
    expect(evacuationSegment.actionSteps).not.toEqual(outdoorSegment.actionSteps)
    expect(report.passed).toBe(true)

    const hiddenKeywordScenario = structuredClone(scenario)
    const hiddenOutdoorSegment = hiddenKeywordScenario.segments.find((segment) =>
      segment.sourceTopicKeys?.includes('outdoor_activity'),
    )!
    hiddenOutdoorSegment.learnerExplanation = '안전한 실내에 있어요'
    hiddenOutdoorSegment.label = '안전한 실내에 있어요'
    hiddenOutdoorSegment.description = '안전한 실내에 있어요'
    hiddenOutdoorSegment.actionSteps = ['안전한 실내에 있어요']
    hiddenOutdoorSegment.learnerSequence = [
      { kind: 'situation', text: hiddenOutdoorSegment.learnerPrompt },
      { kind: 'action', text: '안전한 실내에 있어요' },
    ]
    hiddenOutdoorSegment.checkQuestion = '어디에 있을까요?'
    hiddenOutdoorSegment.answerOptions = [
      {
        ...hiddenOutdoorSegment.answerOptions[0]!,
        correct: true,
        label: '실내',
      },
      {
        ...hiddenOutdoorSegment.answerOptions[1]!,
        correct: false,
        label: '밖',
      },
    ]
    hiddenOutdoorSegment.structuredExplanation.tracks.action = {
      cards: [
        {
          label: '안전한 실내에 있어요',
          officialRuleIds: ['KR_TY_04'],
          order: 1,
        },
      ],
    }
    hiddenOutdoorSegment.structuredExplanation.tracks.doNot = {
      officialRuleIds: ['KR_TY_04'],
      text: '비바람 속에서 논이나 물길을 보러 가지 않습니다.',
    }
    hiddenOutdoorSegment.explanation.doNot =
      '비바람 속에서 논이나 물길을 보러 가지 않습니다.'
    const hiddenKeywordReport =
      __testGeneratePracticeFromUrl.validateGeneratedScenarioForPublish(
        hiddenKeywordScenario,
        cues,
        evidenceReport,
      )

    expect(hiddenKeywordReport.passed).toBe(false)
    expect(hiddenKeywordReport.issues.map((issue) => issue.code)).toContain(
      'missing_required_keyword_in_ui',
    )
  })

  it('keeps continuation narration together even when the safety topic changes', () => {
    const cues = [
      {
        endMs: 14_800,
        startMs: 11_300,
        text: '침수 위험이 있는 낮은 다리는 절대 건너지 말고',
      },
      {
        endMs: 18_100,
        startMs: 14_800,
        text: '통행 중 고립되었다면 119에 신고합니다.',
      },
    ]
    const hazard = __testGeneratePracticeFromUrl.detectHazard('호우 태풍')
    const evidenceReport =
      __testGeneratePracticeFromUrl.buildGenerationEvidenceReport({
        cues,
        rawCues: cues,
        sceneCutCandidatesMs: [],
        videoProbe: { durationMs: 18_100, frameRate: null },
        visualCaptionEvidence: {
          boundaries: [
            {
              afterCaption:
                '낮은 다리·침수된 도로 출입 금지 / 고립 시 건너지 말고 119 신고·도움 요청',
              beforeCaption: '낮은 다리·침수된 도로 출입 금지',
              changeType: 'new_topic',
              confidence: 0.96,
              reason: '119 신고 안내 자막이 이어집니다.',
              recommendedBoundaryMs: 14_800,
              timeMs: 16_000,
            },
          ],
          frames: [],
          warnings: [],
        },
      })
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues,
      evidenceReport,
      hazard,
      jobId: 'generated-test-keep-continuation-sentence',
      sourceTitle: '호우 태풍 행동요령',
      sourceUrl: 'https://www.youtube.com/watch?v=IiVsojHcoEo',
      videoSrc: '/generated/generated-test-keep-continuation-sentence/source.mp4',
    })
    const report = __testGeneratePracticeFromUrl.auditGeneratedScenario(
      scenario,
      cues,
      evidenceReport,
    )
    const actionSegment = scenario.segments.find(
      (segment) => segment.practiceMode === 'action',
    )!

    expect(scenario.segments).toHaveLength(1)
    expect(actionSegment.startMs).toBe(11_300)
    expect(actionSegment.endMs).toBe(18_100)
    expect(actionSegment.narration.map((cue) => cue.text)).toEqual([
      '침수 위험이 있는 낮은 다리는 절대 건너지 말고',
      '통행 중 고립되었다면 119에 신고합니다.',
    ])
    expect(actionSegment.sourceTopicKeys).toEqual([
      'stay_away_from_low_water',
      'call_119',
    ])
    expect(report.issues.map((issue) => issue.code)).not.toContain(
      'mixed_action_topic_segment',
    )
    expect(report.issues.map((issue) => issue.code)).not.toContain(
      'incomplete_audio_fragment',
    )
    expect(report.passed).toBe(true)
  })

  it('does not invent a drain-waterway topic from the word 점검 alone', () => {
    expect(
      __testGeneratePracticeFromUrl.topicKeyForCueText(
        '공사현장의 낙하물 방지망을 설치하고 시설물을 미리 점검해요.',
      ),
    ).toBeNull()
    expect(
      __testGeneratePracticeFromUrl.topicKeyForCueText(
        '배수로나 물꼬는 미리 점검하고 비가 올 때는 나가지 않아요.',
      ),
    ).toBe('drain_waterway')
  })

  it('uses safety-action topic precedence when ASR text contains misleading nouns', () => {
    expect(
      __testGeneratePracticeFromUrl.topicKeyForCueText(
        '농촌에서는 문과 창문을 닫고 창문 가까이 접근하지 않도록 합니다.',
      ),
    ).toBe('indoor_window')
    expect(
      __testGeneratePracticeFromUrl.topicKeyForCueText(
        '태풍이 한반도를 향해 북상하고 있습니다 외출을 자제하시고 태풍 이렇게 대비하세요.',
      ),
    ).toBe('typhoon_warning')
    expect(
      __testGeneratePracticeFromUrl.topicKeyForCueText(
        '체감온도 33도 이상의 기온이 이틀 이상 지속되면 폭염주의보 35도 이상이면 폭염경보',
      ),
    ).toBe('heatwave_cool')
    expect(
      __testGeneratePracticeFromUrl.topicKeyForCueText('폭염경보'),
    ).toBe('heatwave_cool')
  })

  it('keeps typhoon water-area guidance from borrowing vehicle quizzes', () => {
    const hazard = __testGeneratePracticeFromUrl.detectHazard('태풍')
    const evidenceReport =
      __testGeneratePracticeFromUrl.buildGenerationEvidenceReport({
        cues: currentTyphoonBehaviorCues,
        rawCues: currentTyphoonBehaviorCues,
        sceneCutCandidatesMs: [],
        videoProbe: { durationMs: 85_000, frameRate: null },
        visualCaptionEvidence: {
          boundaries: [
            {
              afterCaption:
                '태풍 발생시 문·창문을 닫고, 외출하지 않고, 기상상황 수시 확인',
              beforeCaption: '자연재난 행동요령: 태풍 발생 시',
              changeType: 'new_topic',
              confidence: 0.95,
              reason: '실내 행동 자막이 새로 표시됨.',
              recommendedBoundaryMs: 45_480,
              timeMs: 41_000,
            },
            {
              afterCaption: '개울가, 하천 변, 해안가 등 침수 위험지역은 가지 않기',
              beforeCaption: '산사태 위험지역은 안전한 곳으로 대피',
              changeType: 'new_topic',
              confidence: 0.96,
              reason: '침수 위험지역 접근 금지 자막으로 변경됨.',
              recommendedBoundaryMs: 54_480,
              timeMs: 54_230,
            },
            {
              afterCaption: '산, 계곡, 비탈면에 가지 않기',
              beforeCaption:
                '개울가, 하천 변, 해안가 등 침수 위험지역은 가지 않기',
              changeType: 'new_topic',
              confidence: 0.95,
              reason: '실제 화면 자막이 물가 회피에서 산·계곡 회피로 변경됨.',
              recommendedBoundaryMs: 62_810,
              timeMs: 60_380,
            },
            {
              afterCaption: '공사장 근처에 가지 않기',
              beforeCaption: '산, 계곡, 비탈면에 가지 않기',
              changeType: 'new_topic',
              confidence: 0.96,
              reason: '공사장 근처 접근 금지 자막으로 변경됨.',
              recommendedBoundaryMs: 67_280,
              timeMs: 67_530,
            },
          ],
          frames: [],
          warnings: [],
        },
      })
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues: currentTyphoonBehaviorCues,
      evidenceReport,
      hazard,
      jobId: 'generated-test-current-typhoon',
      sourceTitle: '태풍 발생 시 자연재난 행동요령',
      sourceUrl: 'https://www.youtube.com/watch?v=XS6DvHI7ZYU',
      videoSrc: '/generated/generated-test-current-typhoon/source.mp4',
    })
    const report = __testGeneratePracticeFromUrl.auditGeneratedScenario(
      scenario,
      currentTyphoonBehaviorCues,
      evidenceReport,
    )
    const waterSegment = scenario.segments.find((segment) =>
      segment.sourceTopicKeys?.includes('water_area_avoid'),
    )
    const constructionActionSegments = scenario.segments.filter(
      (segment) =>
        segment.practiceMode === 'action' &&
        segment.sourceTopicKeys?.includes('construction_wind_avoid'),
    )

    expect(report.passed).toBe(true)
    expect(scenario.segments.map((segment) => segment.checkQuestion)).not.toContain(
      '차를 어디에서 옮길까요?',
    )
    expect(waterSegment?.checkQuestion).toBe('어디에 가지 말아야 할까요?')
    expect(waterSegment?.answerOptions.find((option) => option.correct)?.label).toBe(
      '개울가, 하천 변, 해안가',
    )
    expect(constructionActionSegments).toHaveLength(1)
    expect(constructionActionSegments[0]?.checkQuestion).toBe(
      '어디에 가지 말아야 할까요?',
    )
  })

  it('prepares evidence cues with visual-caption boundaries instead of raw scene-cut fragments', () => {
    const preparedCues = __testGeneratePracticeFromUrl.prepareEvidenceCues(
      currentTyphoonBehaviorCues,
      [45_480, 54_480, 62_810, 67_280],
    )

    expect(preparedCues).toHaveLength(13)
    expect(preparedCues.map((cue) => cue.text)).toEqual(
      expect.arrayContaining([
        '수시로 기상상황을 확인합니다.',
        '물에 자주 잠기는 곳이나 산사태가 일어날 수 있는 위험한 곳을 피하고',
        '급류에 휩쓸릴 수도 있어 가까이 가지 않습니다.',
        '큰 바람이 불면 공사자재가 넘어지거나 날릴 수 있으니까',
      ]),
    )
    expect(
      preparedCues.some(
        (cue) =>
          cue.text === '피하고' ||
          cue.endMs - cue.startMs < 1_200,
      ),
    ).toBe(false)
  })

  it('does not add generated pause points that cut source audio mid-sentence', () => {
    expect(
      __testGeneratePracticeFromUrl.buildGeneratedPauseMs({
        endMs: 29_790,
        sceneCutCandidatesMs: [27_690, 29_300, 32_100],
        startMs: 16_040,
      }),
    ).toBeUndefined()
    expect(
      __testGeneratePracticeFromUrl.buildGeneratedPauseMs({
        endMs: 29_790,
        sceneCutCandidatesMs: [24_000, 32_100],
        startMs: 16_040,
      }),
    ).toBeUndefined()
  })

  it('aligns visual caption changes to the nearest completed direct-audio sentence', () => {
    const cues = __testGeneratePracticeFromUrl.parseVtt(typhoonPreparednessVtt)

    expect(
      __testGeneratePracticeFromUrl.alignVisualCaptionBoundaryToAudioSentence(
        46_400,
        cues,
        100_000,
      ),
    ).toBe(45_920)
  })

  it('uses the visual caption time when an intro title changes into the first action caption', () => {
    const rawCues = [
      {
        endMs: 7_540,
        startMs: 0,
        text: '다행히와 함께하는 태풍, 호우, 국민행동요령, 침수도로, 지하차도, 교량, 하천 등',
      },
      {
        endMs: 10_940,
        startMs: 7_540,
        text: '급류에 휩쓸릴 수 있는 지역은 접근하면 안 돼요.',
      },
    ]
    const boundaries =
      __testGeneratePracticeFromUrl.inferVisualCaptionBoundariesFromFrames({
        durationMs: 12_000,
        frames: [
          {
            confidence: 0.97,
            hasLearningCaption: true,
            index: 0,
            normalizedCaption:
              '다행이 와 함께하는 / 태풍, 호우 국민행동요령',
            tsMs: 250,
            visibleCaption: '다행이 와 함께하는 태풍, 호우 국민행동요령',
          },
          {
            confidence: 0.96,
            hasLearningCaption: true,
            index: 1,
            normalizedCaption:
              '침수도로 / 지하차도 / 교량, 하천 / 급류에 휩쓸릴 수 있는 지역은 접근 금지',
            tsMs: 6_000,
            visibleCaption:
              '침수도로 지하차도 교량, 하천 급류에 휩쓸릴 수 있는 지역은 접근 금지',
          },
        ],
        rawCues,
      })
    const cues = __testGeneratePracticeFromUrl.prepareEvidenceCues(
      rawCues,
      [boundaries[0]!.recommendedBoundaryMs],
    )

    expect(boundaries[0]?.recommendedBoundaryMs).toBe(6_000)
    expect(cues.map((cue) => [cue.startMs, cue.endMs])).toEqual([
      [0, 6_000],
      [6_000, 7_540],
      [7_540, 10_940],
    ])
  })

  it('keeps intro title separate from the first learning topic when OCR times out', () => {
    const rawCues = [
      {
        endMs: 7_540,
        startMs: 0,
        text: '다행히와 함께하는 태풍, 호우, 국민행동요령, 침수도로, 지하차도, 교량, 하천 등',
      },
      {
        endMs: 10_940,
        startMs: 7_540,
        text: '급류에 휩쓸릴 수 있는 지역은 접근하면 안 돼요.',
      },
    ]
    const preparedCues = __testGeneratePracticeFromUrl.prepareEvidenceCues(
      rawCues,
      [],
    )
    const hazard = __testGeneratePracticeFromUrl.detectHazard('호우 태풍')
    const evidenceReport =
      __testGeneratePracticeFromUrl.buildGenerationEvidenceReport({
        cues: preparedCues,
        rawCues,
        sceneCutCandidatesMs: [],
        videoProbe: { durationMs: 10_940, frameRate: null },
      })
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues: preparedCues,
      evidenceReport,
      hazard,
      jobId: 'generated-test-intro-asr-split',
      sourceTitle: '호우 태풍 행동요령',
      sourceUrl: 'https://www.youtube.com/watch?v=IiVsojHcoEo',
      videoSrc: '/generated/generated-test-intro-asr-split/source.mp4',
    })
    const introSegment = scenario.segments[0]!
    const firstActionSegment = scenario.segments.find(
      (segment) => segment.practiceMode === 'action',
    )!

    expect(preparedCues.map((cue) => [cue.startMs, cue.endMs])).toEqual([
      [0, 5_880],
      [5_880, 7_540],
      [7_540, 10_940],
    ])
    expect(introSegment.practiceMode).toBe('intro')
    expect(introSegment.teacherGuide.script).not.toMatch(/침수도로|하천/u)
    expect(firstActionSegment.startMs).toBe(5_880)
    expect(firstActionSegment.sourceTopicKeys).toContain('water_area_avoid')
    expect(firstActionSegment.teacherGuide.script).toMatch(/침수도로|하천|급류/u)
  })

  it('aligns OCR-timeout intro fallback to a nearby scene cut instead of a fixed ratio', () => {
    const rawCues = [
      {
        endMs: 7_540,
        startMs: 0,
        text: '다행히와 함께하는 태풍, 호우, 국민행동요령, 침수도로, 지하차도, 교량, 하천 등',
      },
      {
        endMs: 10_940,
        startMs: 7_540,
        text: '급류에 휩쓸릴 수 있는 지역은 접근하면 안 돼요.',
      },
    ]
    const sceneCutCandidatesMs = [3_570, 5_540, 6_670, 8_210, 10_880]
    const preparedCues = __testGeneratePracticeFromUrl.prepareEvidenceCues(
      rawCues,
      [],
      sceneCutCandidatesMs,
    )
    const hazard = __testGeneratePracticeFromUrl.detectHazard('호우 태풍')
    const evidenceReport =
      __testGeneratePracticeFromUrl.buildGenerationEvidenceReport({
        cues: preparedCues,
        rawCues,
        sceneCutCandidatesMs,
        videoProbe: { durationMs: 10_940, frameRate: null },
      })
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues: preparedCues,
      evidenceReport,
      hazard,
      jobId: 'generated-test-intro-scene-cut-fallback',
      sourceTitle: '호우 태풍 행동요령',
      sourceUrl: 'https://www.youtube.com/watch?v=IiVsojHcoEo',
      videoSrc: '/generated/generated-test-intro-scene-cut-fallback/source.mp4',
    })
    const firstActionSegment = scenario.segments.find(
      (segment) => segment.practiceMode === 'action',
    )!

    expect(preparedCues.map((cue) => [cue.startMs, cue.endMs])).toEqual([
      [0, 5_540],
      [5_540, 7_540],
      [7_540, 10_940],
    ])
    expect(firstActionSegment.startMs).toBe(5_540)
    expect(firstActionSegment.sourceTopicKeys).toContain('water_area_avoid')
  })

  it('does not split repeated water-area captions when OCR mislabels them as a new topic', () => {
    const rawCues = [
      {
        endMs: 7_540,
        startMs: 0,
        text: '다행히와 함께하는 태풍, 호우, 군민행동요령, 침수도로, 지하처도, 교량, 하천, 태양가 등',
      },
      {
        endMs: 10_940,
        startMs: 7_540,
        text: '급류에 휩쓸릴 수 있는 지역은 접근하면 안 돼요.',
      },
    ]
    const visualCaptionBoundaries = [
      {
        afterCaption:
          '침수도로, 지하차도, 교량·하천 등 급류에 휩쓸릴 수 있는 지역은 접근 금지',
        beforeCaption: '다행이와 함께하는 태풍, 호우 국민행동요령',
        changeType: 'new_topic' as const,
        confidence: 0.98,
        reason: '제목에서 첫 행동 자막으로 전환됨.',
        recommendedBoundaryMs: 6_000,
        timeMs: 6_000,
      },
      {
        afterCaption:
          '침수도로, 지하차도, 교량·하천, 해안가 등 급류에 휩쓸릴 수 있는 지역은 접근 금지',
        beforeCaption:
          '침수도로, 지하차도, 교량·하천 등 급류에 휩쓸릴 수 있는 지역은 접근 금지',
        changeType: 'new_topic' as const,
        confidence: 0.99,
        reason: '같은 급류 위험지역 자막이 완성되는 중간 변화입니다.',
        recommendedBoundaryMs: 7_540,
        timeMs: 7_290,
      },
    ]
    const hardBoundaries = visualCaptionBoundaries
      .filter((boundary) =>
        __testGeneratePracticeFromUrl.isReliableVisualCaptionBoundary(boundary),
      )
      .map((boundary) => boundary.recommendedBoundaryMs)
    const preparedCues = __testGeneratePracticeFromUrl.prepareEvidenceCues(
      rawCues,
      hardBoundaries,
    )
    const hazard = __testGeneratePracticeFromUrl.detectHazard('호우 태풍')
    const evidenceReport =
      __testGeneratePracticeFromUrl.buildGenerationEvidenceReport({
        cues: preparedCues,
        rawCues,
        sceneCutCandidatesMs: [],
        videoProbe: { durationMs: 10_940, frameRate: null },
        visualCaptionEvidence: {
          boundaries: visualCaptionBoundaries,
          frames: [],
          warnings: [],
        },
      })
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues: preparedCues,
      evidenceReport,
      hazard,
      jobId: 'generated-test-same-topic-water-boundary',
      sourceTitle: '호우 태풍 행동요령',
      sourceUrl: 'https://www.youtube.com/watch?v=hsgJ7ZnqVDc',
      videoSrc: '/generated/generated-test-same-topic-water-boundary/source.mp4',
    })
    const report = __testGeneratePracticeFromUrl.auditGeneratedScenario(
      scenario,
      preparedCues,
      evidenceReport,
    )
    const waterSegments = scenario.segments.filter((segment) =>
      segment.sourceTopicKeys?.includes('water_area_avoid'),
    )

    expect(hardBoundaries).toEqual([6_000])
    expect(waterSegments).toHaveLength(1)
    expect(waterSegments[0]?.startMs).toBe(6_000)
    expect(waterSegments[0]?.endMs).toBe(10_940)
    expect(waterSegments[0]?.actionSteps).toEqual([
      '침수도로, 지하차도, 교량, 하천에서 멀어져요',
    ])
    expect(waterSegments[0]?.answerOptions.find((option) => option.correct)?.label).toBe(
      '침수도로, 지하차도, 교량',
    )
    expect(waterSegments[0]?.teacherGuide.script).toMatch(/침수도로|급류/u)
    expect(report.passed).toBe(true)
  })

  it('keeps outro narration separate from the last action topic when OCR times out', () => {
    const rawCues = [
      {
        endMs: 39_000,
        startMs: 33_000,
        text: '부득이하게 밖에 있으면 유리창과 간판 같은 위험한 물건 근처에는 가지 않습니다.',
      },
      {
        endMs: 41_000,
        startMs: 39_000,
        text: '우리 모두 함께 대비해요.',
      },
    ]
    const preparedCues = __testGeneratePracticeFromUrl.prepareEvidenceCues(
      rawCues,
      [],
    )
    const hazard = __testGeneratePracticeFromUrl.detectHazard('호우 태풍')
    const evidenceReport =
      __testGeneratePracticeFromUrl.buildGenerationEvidenceReport({
        cues: preparedCues,
        rawCues,
        sceneCutCandidatesMs: [],
        videoProbe: { durationMs: 41_000, frameRate: null },
      })
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues: preparedCues,
      evidenceReport,
      hazard,
      jobId: 'generated-test-outro-asr-split',
      sourceTitle: '호우 태풍 행동요령',
      sourceUrl: 'https://www.youtube.com/watch?v=IiVsojHcoEo',
      videoSrc: '/generated/generated-test-outro-asr-split/source.mp4',
    })
    const actionSegment = scenario.segments.find((segment) =>
      segment.sourceTopicKeys?.includes('outdoor_signage'),
    )!
    const outroSegment = scenario.segments.at(-1)!
    const report = __testGeneratePracticeFromUrl.auditGeneratedScenario(
      scenario,
      preparedCues,
      evidenceReport,
    )

    expect(actionSegment.practiceMode).toBe('action')
    expect(actionSegment.endMs).toBeGreaterThanOrEqual(38_900)
    expect(actionSegment.endMs).toBeLessThanOrEqual(39_000)
    expect(outroSegment.practiceMode).toBe('intro')
    expect(outroSegment.startMs).toBe(39_000)
    expect(outroSegment.sourceTopicKeys).toEqual(['outro_review'])
    expect(outroSegment.teacherGuide.script).toMatch(/함께 대비/u)
    expect(report.passed).toBe(true)
  })

  it('does not split heatwave narration before the direct-audio sentence is complete', () => {
    const hazard = __testGeneratePracticeFromUrl.detectHazard('폭염')
    const heatIllnessBoundary =
      __testGeneratePracticeFromUrl.alignVisualCaptionBoundaryToAudioSentence(
        66_920,
        directAudioHeatwaveCues,
        88_655,
      )
    const visualCaptionBoundaries = [
      {
        afterCaption: '폭염 대비 작전 ①',
        beforeCaption: '폭염 이렇게 대비하세요',
        changeType: 'new_topic' as const,
        confidence: 0.9,
        reason: '기상 상황 확인 작전이 시작됩니다.',
        recommendedBoundaryMs: 38_900,
        timeMs: 35_880,
      },
      {
        afterCaption: '폭염 대비 작전 ②',
        beforeCaption: '폭염 발생 시 가급적 야외 활동 자제하기',
        changeType: 'new_topic' as const,
        confidence: 0.91,
        reason: '물 마시기 작전으로 바뀝니다.',
        recommendedBoundaryMs: 43_900,
        timeMs: 46_990,
      },
      {
        afterCaption: '외출 시 옷차림을 가볍게 하고, 물 자주 마시기',
        beforeCaption: '폭염 대비 작전 ②',
        changeType: 'same_topic' as const,
        confidence: 0.88,
        reason: '같은 물 마시기 작전의 설명이 이어집니다.',
        recommendedBoundaryMs: 51_900,
        timeMs: 51_000,
      },
      {
        afterCaption: '폭염 대비 작전 ③',
        beforeCaption: '외출 시 옷차림을 가볍게 하고, 물 자주 마시기',
        changeType: 'new_topic' as const,
        confidence: 0.92,
        reason: '휴식 작전으로 바뀝니다.',
        recommendedBoundaryMs: 64_900,
        timeMs: 60_470,
      },
      {
        afterCaption: '열사병 증상이 있다면 병원 진료받기',
        beforeCaption: '그늘에서 자주 휴식하며 건강 상태 확인하기',
        changeType: 'new_topic' as const,
        confidence: 0.98,
        reason: '열사병 증상 대처로 바뀝니다.',
        recommendedBoundaryMs: heatIllnessBoundary,
        timeMs: 66_920,
      },
    ]
    const boundaryMs = visualCaptionBoundaries.map(
      (boundary) => boundary.recommendedBoundaryMs,
    )
    const preparedCues = __testGeneratePracticeFromUrl.prepareEvidenceCues(
      directAudioHeatwaveCues,
      boundaryMs,
    )
    const evidenceReport =
      __testGeneratePracticeFromUrl.buildGenerationEvidenceReport({
        cues: preparedCues,
        rawCues: directAudioHeatwaveCues,
        sceneCutCandidatesMs: [],
        videoProbe: { durationMs: 88_655, frameRate: null },
        visualCaptionEvidence: {
          boundaries: visualCaptionBoundaries,
          frames: [],
          warnings: [],
        },
      })
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues: preparedCues,
      evidenceReport,
      frameCutsMs: boundaryMs,
      hazard,
      jobId: 'generated-test-heatwave-audio-complete',
      sourceTitle: '폭염 대비법',
      sourceUrl: 'https://www.youtube.com/watch?v=XtwfBT4uFzs',
      videoSrc: '/generated/generated-test-heatwave-audio-complete/source.mp4',
    })
    const initialReport = __testGeneratePracticeFromUrl.auditGeneratedScenario(
      scenario,
      preparedCues,
      evidenceReport,
    )
    const repaired = __testGeneratePracticeFromUrl.repairScenarioForQuality({
      hazard,
      jobId: 'generated-test-heatwave-audio-complete',
      report: initialReport,
      scenario,
      sourceTitle: '폭염 대비법',
      sourceUrl: 'https://www.youtube.com/watch?v=XtwfBT4uFzs',
    })
    const repairedReport =
      __testGeneratePracticeFromUrl.validateGeneratedScenarioForPublish(
        repaired.scenario,
        preparedCues,
        evidenceReport,
      )

    expect(heatIllnessBoundary).toBe(72_900)
    expect(preparedCues.map((cue) => cue.text)).toContain(
      '열사병 증상이 있다면 시원한 곳에서 휴식을 취하고 심하면 병원에서 진료를 받자',
    )
    expect(
      scenario.segments.some((segment) =>
        segment.narration.some(
          (cue) =>
            cue.text.endsWith('휴식을') || cue.text.startsWith('취하고'),
        ),
      ),
    ).toBe(false)
    expect(initialReport.passed).toBe(false)
    expect(initialReport.issues.map((issue) => issue.code)).toContain(
      'repeated_action_scene',
    )
    expect(repaired.changed).toBe(true)
    expect(
      repaired.scenario.segments.filter(
        (segment) =>
          segment.practiceMode === 'action' &&
          segment.sourceTopicKeys?.includes('heatwave_water'),
      ),
    ).toHaveLength(1)
    expect(repairedReport.passed).toBe(true)
    expect(repairedReport.issues).toHaveLength(0)
  })

  it('blocks mid-sentence audio fragments and repeated action scenes', () => {
    const hazard = __testGeneratePracticeFromUrl.detectHazard('폭염')
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues: directAudioHeatwaveCues,
      hazard,
      jobId: 'generated-test-block-bad-heatwave',
      sourceTitle: '폭염 대비법',
      sourceUrl: 'https://www.youtube.com/watch?v=XtwfBT4uFzs',
      videoSrc: '/generated/generated-test-block-bad-heatwave/source.mp4',
    })
    const brokenScenario = structuredClone(scenario)
    const waterIndex = brokenScenario.segments.findIndex((segment) =>
      segment.sourceTopicKeys?.includes('heatwave_water'),
    )
    const heatIllnessSegment = brokenScenario.segments.find((segment) =>
      segment.teacherGuide.script.includes('열사병 증상'),
    )!

    brokenScenario.segments.splice(
      waterIndex + 1,
      0,
      structuredClone({
        ...brokenScenario.segments[waterIndex]!,
        id: `${brokenScenario.segments[waterIndex]!.id}-duplicate`,
        startMs: brokenScenario.segments[waterIndex]!.endMs,
        endMs: brokenScenario.segments[waterIndex]!.endMs + 2_000,
      }),
    )
    heatIllnessSegment.narration = [
      {
        endMs: 66_920,
        source: 'audio',
        startMs: 64_900,
        text: '열사병 증상이 있다면 시원한 곳에서 휴식을',
      },
    ]
    heatIllnessSegment.teacherGuide.script =
      '열사병 증상이 있다면 시원한 곳에서 휴식을'

    const report = __testGeneratePracticeFromUrl.auditGeneratedScenario(
      brokenScenario,
      directAudioHeatwaveCues,
    )

    expect(report.passed).toBe(false)
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'incomplete_audio_fragment',
        'repeated_action_scene',
      ]),
    )
  })

  it('infers missing visual caption boundaries from consecutive OCR frames', () => {
    expect(
      __testGeneratePracticeFromUrl
        .inferVisualCaptionBoundariesFromFrames({
          durationMs: 85_000,
          frames: [
            {
              confidence: 0.96,
              hasLearningCaption: true,
              index: 0,
              normalizedCaption:
                '자연재난 행동요령 / 태풍 발생 시 / 개울가, 하천 변, 해안가 등 침수 위험지역은 가지 않기',
              tsMs: 58_500,
              visibleCaption:
                '자연재난 행동요령 태풍 발생 시 개울가, 하천 변, 해안가 등 침수 위험지역은 가지 않기',
            },
            {
              confidence: 0.95,
              hasLearningCaption: true,
              index: 1,
              normalizedCaption:
                '자연재난 행동요령 / 태풍 발생 시 / 산, 계곡, 비탈면에 가지 않기',
              tsMs: 60_380,
              visibleCaption:
                '자연재난 행동요령 태풍 발생 시 산, 계곡, 비탈면에 가지 않기',
            },
          ],
          rawCues: currentTyphoonBehaviorCues,
        })
        .map((boundary) => boundary.recommendedBoundaryMs),
    ).toContain(62_820)
  })

  it('uses concrete mountain place quiz instead of generic movement quiz', () => {
    expect(
      __testGeneratePracticeFromUrl.optionForAction(
        '산, 계곡, 비탈면에 가지 않아요',
      ),
    ).toEqual({
      kind: 'place',
      label: '산, 계곡, 비탈면',
      prompt: '어디에 가지 말아야 할까요?',
    })
  })

  it('compiles generated action scenes into the same positive-card shape as the golden samples', () => {
    const hazard = __testGeneratePracticeFromUrl.detectHazard('태풍')
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues: currentTyphoonBehaviorCues,
      hazard,
      jobId: 'generated-test-golden-card-contract',
      sourceTitle: '태풍 발생 시 자연재난 행동요령',
      sourceUrl: 'https://www.youtube.com/watch?v=XS6DvHI7ZYU',
      videoSrc: '/generated/generated-test-golden-card-contract/source.mp4',
    })
    const actionSegments = scenario.segments.filter(
      (segment) => segment.practiceMode === 'action',
    )

    expect(actionSegments.length).toBeGreaterThan(0)
    for (const segment of actionSegments) {
      expect(segment.learnerSequence[0]?.kind).toBe('situation')
      expect(
        segment.learnerSequence
          .filter((step) => step.kind === 'action')
          .map((step) => step.text),
      ).toEqual(segment.actionSteps)
      expect(segment.actionSteps.join(' ')).not.toMatch(
        /않아요|않습니다|말아요|말고|피해요|금지|하지|만지지|무리해서/u,
      )
      expect(segment.checkQuestion).not.toMatch(/무엇이 중요|무엇을 기억/u)
      expect(segment.answerOptions.filter((option) => option.correct)).toHaveLength(
        1,
      )
    }
  })

  it('keeps wildfire generated teach-back questions tied to concrete actions', () => {
    const hazard = __testGeneratePracticeFromUrl.detectHazard(
      directAudioWildfireCues.map((cue) => cue.text).join(' '),
    )
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues: directAudioWildfireCues,
      hazard,
      jobId: 'generated-test-wildfire-teach-back',
      sourceTitle: '산불 국민행동요령',
      sourceUrl: 'https://www.youtube.com/watch?v=ijHFJBQZAg4',
      videoSrc: '/generated/generated-test-wildfire-teach-back/source.mp4',
    })
    const report = __testGeneratePracticeFromUrl.auditGeneratedScenario(
      scenario,
      directAudioWildfireCues,
    )
    const actionSegments = scenario.segments.filter(
      (segment) => segment.practiceMode === 'action',
    )
    const prompts = actionSegments.map((segment) => segment.checkQuestion)
    const correctLabels = actionSegments.map(
      (segment) => segment.answerOptions.find((option) => option.correct)?.label,
    )

    expect(hazard.label).toBe('화재')
    expect(__testGeneratePracticeFromUrl.topicKeyForCueText('산림 근처 소각 행위 금지')).toBe(
      'wildfire_burn_ban',
    )
    expect(__testGeneratePracticeFromUrl.topicKeyForCueText('화목보일러 사용 후 불씨 확인')).toBe(
      'wildfire_ember_check',
    )
    expect(__testGeneratePracticeFromUrl.topicKeyForCueText('산에서는 라이터, 담배 절대 금지')).toBe(
      'wildfire_lighter_ban',
    )
    expect(report.issues.filter((issue) => issue.severity === 'blocker')).toEqual(
      [],
    )
    expect(report.passed).toBe(true)
    expect(report.issues.map((issue) => issue.code)).not.toContain(
      'low_quality_teach_back',
    )
    expect(prompts).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^무엇을 (멈출|확인)할까요\?$/u),
        '무엇을 두고 가야 할까요?',
        '어디로 대피할까요?',
      ]),
    )
    expect(correctLabels).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^(소각|불씨)$/u),
        '라이터와 담배',
        '산과 떨어진 도로',
      ]),
    )
  })

  it('keeps earthquake generated topics split instead of merging all after-shaking checks', () => {
    const topicFor = __testGeneratePracticeFromUrl.topicKeyForCueText

    expect(topicFor('옷장 문 주변을 보고 보관함 문을 천천히 열어요.')).toBe(
      'earthquake_return_door',
    )
    expect(topicFor('가스 냄새나 새는 소리가 나면 어른에게 말해요.')).toBe(
      'earthquake_gas',
    )
    expect(topicFor('정전이면 손전등을 쓰고 전선에서 떨어져요.')).toBe(
      'earthquake_electric',
    )
    expect(topicFor('수도관 고장이 보이면 수도꼭지 물은 기다려요.')).toBe(
      'earthquake_water',
    )
    expect(topicFor('안전디딤돌 앱에서 지진 대피소를 찾아요.')).toBe(
      'earthquake_open_space',
    )
  })

  it('blocks a scenario that merges a high-confidence visual caption topic change', () => {
    const cues = __testGeneratePracticeFromUrl.parseVtt(typhoonPreparednessVtt)
    const hazard = __testGeneratePracticeFromUrl.detectHazard('태풍')
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues,
      hazard,
      jobId: 'generated-test-visual-caption',
      sourceTitle: '태풍 대비법',
      sourceUrl: 'https://www.youtube.com/watch?v=oWu95ZitpTI',
      videoSrc: '/generated/generated-test-visual-caption/source.mp4',
    })
    const evidenceReport =
      __testGeneratePracticeFromUrl.buildGenerationEvidenceReport({
        cues,
        rawCues: cues,
        sceneCutCandidatesMs: [],
        videoProbe: { durationMs: 100_000, frameRate: null },
        visualCaptionEvidence: {
          boundaries: [
            {
              afterCaption: '밖에서는 간판 주변을 피해요',
              beforeCaption: '집 안에서는 문과 창문을 닫아요',
              changeType: 'new_topic',
              confidence: 0.92,
              reason: '화면 자막이 실내 행동에서 외출 행동으로 바뀌었습니다.',
              recommendedBoundaryMs: 49_000,
              timeMs: 46_400,
            },
          ],
          frames: [],
          warnings: [],
        },
      })
    const mergedScenario = {
      ...scenario,
      segments: [
        {
          ...scenario.segments[0],
          endMs: 60_000,
        },
        ...scenario.segments.slice(2),
      ],
    }
    const report = __testGeneratePracticeFromUrl.auditGeneratedScenario(
      mergedScenario,
      cues,
      evidenceReport,
    )

    expect(report.passed).toBe(false)
    expect(report.issues.map((issue) => issue.code)).toContain(
      'visual_caption_boundary_merged',
    )
  })

  it('does not regroup cues across exact visual caption split boundaries', () => {
    const hazard = __testGeneratePracticeFromUrl.detectHazard('폭염')
    const evidenceReport =
      __testGeneratePracticeFromUrl.buildGenerationEvidenceReport({
        cues: directAudioHeatwaveCues,
        rawCues: directAudioHeatwaveCues,
        sceneCutCandidatesMs: [],
        videoProbe: { durationMs: 45_000, frameRate: null },
        visualCaptionEvidence: {
          boundaries: [
            {
              afterCaption: '펭수와 함께하는 재난대비 국민행동요령 / 폭염',
              beforeCaption: '펭수와 함께하는 재난대비 국민행동요령',
              changeType: 'new_topic',
              confidence: 0.88,
              reason: '제목에 재난 유형이 추가됩니다.',
              recommendedBoundaryMs: 6_900,
              timeMs: 6_650,
            },
            {
              afterCaption: '폭염 대비 작전 ①',
              beforeCaption: '폭염경보: 체감온도 35°C 이상 이틀 이상 지속',
              changeType: 'new_topic',
              confidence: 0.9,
              reason: '경보 설명에서 첫 행동 작전 화면으로 바뀝니다.',
              recommendedBoundaryMs: 32_900,
              timeMs: 32_650,
            },
            {
              afterCaption: '폭염 대비 작전 ①: 폭염 발생 시 가급적 야외 활동 자제하기',
              beforeCaption: '폭염 대비 작전 ①: TV, 라디오 등을 통해 기상 상황을 파악하기',
              changeType: 'new_topic',
              confidence: 0.93,
              reason: '기상 상황 확인에서 야외 활동 자제로 바뀝니다.',
              recommendedBoundaryMs: 43_900,
              timeMs: 41_000,
            },
          ],
          frames: [],
          warnings: [],
        },
      })
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues: directAudioHeatwaveCues,
      evidenceReport,
      hazard,
      jobId: 'generated-test-heatwave-visual-boundaries',
      sourceTitle: '폭염 대비법',
      sourceUrl: 'https://www.youtube.com/watch?v=XtwfBT4uFzs',
      videoSrc: '/generated/generated-test-heatwave-visual-boundaries/source.mp4',
    })
    const report = __testGeneratePracticeFromUrl.auditGeneratedScenario(
      scenario,
      directAudioHeatwaveCues,
      evidenceReport,
    )

    for (const boundaryMs of [6_900, 32_900, 43_900]) {
      expect(
        scenario.segments.some(
          (segment) =>
            segment.startMs < boundaryMs - 900 &&
            segment.endMs > boundaryMs + 900,
        ),
      ).toBe(false)
    }
    expect(report.issues.map((issue) => issue.code)).not.toContain(
      'visual_caption_boundary_merged',
    )
    expect(
      scenario.segments
        .filter((segment) => segment.practiceMode === 'action')
        .map((segment) => segment.checkQuestion),
    ).not.toEqual(
      expect.arrayContaining([
        '더울 때 무엇을 할까요?',
        '먼저 어떻게 할까요?',
      ]),
    )
    expect(report.issues.map((issue) => issue.code)).not.toContain(
      'low_quality_teach_back',
    )
  })

  it('uses OCR learning captions as segment evidence when ASR loses a key word', () => {
    const cues = [
      {
        endMs: 64_900,
        startMs: 56_900,
        text: '생존전략 3. 야외활동 중에는 근육에서 자주 휴식하며 건강상태를 체크할 것',
      },
    ]
    const hazard = __testGeneratePracticeFromUrl.detectHazard('폭염')
    const evidenceReport =
      __testGeneratePracticeFromUrl.buildGenerationEvidenceReport({
        cues,
        rawCues: cues,
        sceneCutCandidatesMs: [],
        videoProbe: { durationMs: 80_000, frameRate: null },
        visualCaptionEvidence: {
          boundaries: [],
          frames: [
            {
              confidence: 0.96,
              hasLearningCaption: true,
              index: 0,
              normalizedCaption:
                '폭염 대비 작전 ③ / 그늘에서 자주 휴식하며 건강 상태 확인하기',
              tsMs: 63_500,
              visibleCaption:
                '폭염 대비 작전 ③ 그늘에서 자주 휴식하며 건강 상태 확인하기',
            },
          ],
          warnings: [],
        },
      })
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues,
      evidenceReport,
      hazard,
      jobId: 'generated-test-heatwave-ocr-keyword',
      sourceTitle: '폭염 대비법',
      sourceUrl: 'https://www.youtube.com/watch?v=XtwfBT4uFzs',
      videoSrc: '/generated/generated-test-heatwave-ocr-keyword/source.mp4',
    })
    const report = __testGeneratePracticeFromUrl.auditGeneratedScenario(
      scenario,
      cues,
      evidenceReport,
    )

    expect(scenario.segments[0]?.teacherGuide.script).toContain('그늘')
    expect(scenario.segments[0]?.actionSteps.join(' ')).toContain('그늘')
    expect(report.issues.map((issue) => issue.code)).not.toContain(
      'missing_required_keyword',
    )
  })

  it('keeps sewer manhole and falling-object scenes separate when adjacent OCR changes', () => {
    const hazard = __testGeneratePracticeFromUrl.detectHazard('태풍 호우')
    const cues = [
      {
        endMs: 33_000,
        startMs: 29_000,
        text: '맨홀 근처 등의 곳을 접근하지 마세요.',
      },
      {
        endMs: 39_000,
        startMs: 33_000,
        text: '유리창, 건물 간판 등 낙하물이 떨어질 수 있는 장소는 피하고 건물 안으로 이동해요.',
      },
    ]
    const evidenceReport =
      __testGeneratePracticeFromUrl.buildGenerationEvidenceReport({
        cues,
        rawCues: cues,
        sceneCutCandidatesMs: [],
        videoProbe: { durationMs: 41_000, frameRate: null },
        visualCaptionEvidence: {
          boundaries: [
            {
              afterCaption: '유리창, 건물 간판 등',
              beforeCaption:
                '추락 / 휩쓸림 사고 예방을 위해 / 하수도, 맨홀 근처 등 접근 금지',
              changeType: 'new_topic',
              confidence: 0.95,
              reason: '하수도·맨홀 접근 금지에서 유리창·간판 낙하물 위험으로 바뀝니다.',
              recommendedBoundaryMs: 33_000,
              timeMs: 33_250,
            },
          ],
          frames: [
            {
              confidence: 0.97,
              hasLearningCaption: true,
              index: 0,
              normalizedCaption:
                '추락 / 휩쓸림 사고 예방을 위해 / 하수도, 맨홀 근처 등 접근 금지',
              tsMs: 32_380,
              visibleCaption:
                '추락 휩쓸림 사고 예방을 위해 하수도, 맨홀 근처 등 접근 금지',
            },
            {
              confidence: 0.97,
              hasLearningCaption: true,
              index: 1,
              normalizedCaption: '유리창, 건물 간판 등',
              tsMs: 33_250,
              visibleCaption: '유리창, 건물 간판 등',
            },
            {
              confidence: 0.97,
              hasLearningCaption: true,
              index: 2,
              normalizedCaption:
                '유리창, 건물 간판 등 / 낙하물이 떨어질 수 있는 장소를 피하고 / 건물 안으로 이동',
              tsMs: 36_000,
              visibleCaption:
                '유리창, 건물 간판 등 낙하물이 떨어질 수 있는 장소를 피하고 건물 안으로 이동',
            },
          ],
          warnings: [],
        },
      })
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues,
      evidenceReport,
      frameCutsMs: [33_000],
      hazard,
      jobId: 'generated-test-manhole-signage',
      sourceTitle: '태풍 호우 행동요령',
      sourceUrl: 'https://www.youtube.com/watch?v=hsgJ7ZnqVDc',
      videoSrc: '/generated/generated-test-manhole-signage/source.mp4',
    })
    const report = __testGeneratePracticeFromUrl.auditGeneratedScenario(
      scenario,
      cues,
      evidenceReport,
    )
    const manhole = scenario.segments[0]!
    const signage = scenario.segments[1]!

    expect(manhole.sourceTopicKeys).toEqual(['sewer_manhole_avoid'])
    expect(manhole.actionSteps.join(' ')).toContain('맨홀')
    expect(manhole.actionSteps.join(' ')).not.toContain('간판')
    expect(manhole.requiredLearnerKeywords).toEqual(
      expect.arrayContaining(['맨홀', '하수도']),
    )
    expect(signage.practiceMode).toBe('action')
    expect(signage.sourceTopicKeys).toEqual(['outdoor_signage'])
    expect(signage.actionSteps.join(' ')).toContain('간판')
    expect(report.passed).toBe(true)
  })

  it('blocks action scenes without an explicit reason track', () => {
    const cues = __testGeneratePracticeFromUrl.parseVtt(stormSafetyVtt)
    const hazard = __testGeneratePracticeFromUrl.detectHazard('호우 태풍')
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues,
      hazard,
      jobId: 'generated-test-missing-reason',
      sourceTitle: '호우·태풍 안전예방수칙',
      sourceUrl: 'https://www.youtube.com/watch?v=IiVsojHcoEo',
      videoSrc: '/generated/generated-test-missing-reason/source.mp4',
    })
    const firstActionIndex = scenario.segments.findIndex(
      (segment) => segment.practiceMode === 'action',
    )
    const missingReasonScenario = {
      ...scenario,
      segments: scenario.segments.map((segment, index) =>
        index === firstActionIndex
          ? {
              ...segment,
              actionReasons: [],
            }
          : segment,
      ),
    }
    const report =
      __testGeneratePracticeFromUrl.validateGeneratedScenarioForPublish(
        missingReasonScenario,
        cues,
      )

    expect(report.passed).toBe(false)
    expect(report.issues.map((issue) => issue.code)).toContain(
      'missing_action_reason',
    )
  })

  it('blocks scenes that drop required source keywords from learner and teacher text', () => {
    const cues = __testGeneratePracticeFromUrl.parseVtt(stormSafetyVtt)
    const hazard = __testGeneratePracticeFromUrl.detectHazard('호우 태풍')
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues,
      hazard,
      jobId: 'generated-test-missing-keyword',
      sourceTitle: '호우·태풍 안전예방수칙',
      sourceUrl: 'https://www.youtube.com/watch?v=IiVsojHcoEo',
      videoSrc: '/generated/generated-test-missing-keyword/source.mp4',
    })
    const missingKeywordScenario = {
      ...scenario,
      segments: scenario.segments.map((segment, index) =>
        index === 0
          ? {
              ...segment,
              requiredLearnerKeywords: ['반드시남아야할단어'],
            }
          : segment,
      ),
    }
    const report =
      __testGeneratePracticeFromUrl.validateGeneratedScenarioForPublish(
        missingKeywordScenario,
        cues,
      )

    expect(report.passed).toBe(false)
    expect(report.issues.map((issue) => issue.code)).toContain(
      'missing_required_keyword',
    )
  })

  it('allows source-backed action scenes even when official RAG does not match', () => {
    const cues = __testGeneratePracticeFromUrl.parseVtt(stormSafetyVtt)
    const hazard = __testGeneratePracticeFromUrl.detectHazard('호우 태풍')
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues,
      hazard,
      jobId: 'generated-test-ungrounded',
      sourceTitle: '호우·태풍 안전예방수칙',
      sourceUrl: 'https://www.youtube.com/watch?v=IiVsojHcoEo',
      videoSrc: '/generated/generated-test-ungrounded/source.mp4',
    })
    const firstActionIndex = scenario.segments.findIndex(
      (segment) => segment.practiceMode === 'action',
    )
    const ungroundedScenario = {
      ...scenario,
      segments: scenario.segments.map((segment, index) =>
        index === firstActionIndex
          ? {
              ...segment,
              segment: {
                ...segment.segment,
                officialRuleIds: [],
              },
              structuredExplanation: {
                ...segment.structuredExplanation,
                segment: {
                  ...segment.structuredExplanation.segment,
                  status: 'needs_review' as const,
                },
                validation: {
                  ...segment.structuredExplanation.validation,
                  hasGroundedAction: false,
                },
              },
            }
          : segment,
      ),
    }
    const report =
      __testGeneratePracticeFromUrl.validateGeneratedScenarioForPublish(
        ungroundedScenario,
        cues,
      )

    expect(report.passed).toBe(true)
    expect(report.groundingPassed).toBe(true)
    expect(report.issues.map((issue) => issue.code)).not.toContain(
      'ungrounded_action',
    )
  })

  it('uses RAG as contradiction guard without erasing concrete flood narration keywords', () => {
    const cues = [
      {
        endMs: 6_000,
        startMs: 0,
        text: '여름철 홍수시 안전하게 대비해요. 안전한 티비가 알려주는 국민행동요령',
      },
      {
        endMs: 12_220,
        startMs: 6_700,
        text: '비가 오기 전 기상정보를 수시로 확인하고 사전에 대피 장소를 알아두면 좋아요.',
      },
      {
        endMs: 15_700,
        startMs: 12_230,
        text: '그리고 배수로 점검 물고 점검을 수시로 해주세요.',
      },
      {
        endMs: 23_480,
        startMs: 15_780,
        text: '하천변에 주차를 해놓은 차량은 사전에 이동하고 침수가 예상되는 집은 대피하기 전 전기와 가스 차단 필수',
      },
      {
        endMs: 30_440,
        startMs: 24_340,
        text: '비가 내리면 저지대 비탈면 산지 그리고 전신주 근처는 되도록이면 피하기',
      },
      {
        endMs: 39_740,
        startMs: 30_520,
        text: '비가 그치고 침수된 집에 복귀시 반드시 전기와 가스 안전점검을 실시하고 수돗물 오염 여부를 확인하는 등 안전을 확인하는 것이 좋아요.',
      },
      {
        endMs: 44_040,
        startMs: 39_940,
        text: '여름철 홍수시 행동요령 알아두면 안전합니다.',
      },
    ]
    const hazard = __testGeneratePracticeFromUrl.detectHazard('홍수 호우')
    const evidenceReport =
      __testGeneratePracticeFromUrl.buildGenerationEvidenceReport({
        cues,
        rawCues: cues,
        sceneCutCandidatesMs: [],
        videoProbe: { durationMs: 44_040, frameRate: null },
      })
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues,
      evidenceReport,
      hazard,
      jobId: 'generated-test-flood-source-keywords',
      sourceTitle: '홍수 국민행동요령',
      sourceUrl: 'https://www.youtube.com/watch?v=test-flood',
      videoSrc: '/generated/generated-test-flood-source-keywords/source.mp4',
    })
    const report = __testGeneratePracticeFromUrl.auditGeneratedScenario(
      scenario,
      cues,
      evidenceReport,
    )
    const actionText = scenario.segments
      .flatMap((segment) => segment.actionSteps)
      .join(' ')
    const riverCarSegment = scenario.segments.find((segment) =>
      segment.actionSteps.includes('하천변 차량을 미리 옮겨요'),
    )
    const lowlandSegment = scenario.segments.find((segment) =>
      segment.actionSteps.includes('낮은 곳, 비탈면, 산지에서 멀어져요'),
    )

    expect(scenario.segments[0]?.sourceTopicKeys).toEqual(['intro_weather'])
    expect(scenario.segments[0]?.learnerPrompt).toBe('홍수 안전수칙을 배워요.')
    expect(
      __testGeneratePracticeFromUrl.topicKeyForCueText(
        '하천변에 주차한 차량은 이동하고 전기와 가스 차단 필수',
      ),
    ).toBe('flood_river_car_utilities')
    expect(
      __testGeneratePracticeFromUrl.topicKeyForCueText(
        '침수된 집에 복귀시 전기와 가스 안전점검을 실시하고 수돗물 오염 여부를 확인',
      ),
    ).toBe('flood_home_return_check')
    expect(actionText).toContain('기상정보를 확인해요')
    expect(actionText).toContain('대피 장소를 알아둬요')
    expect(actionText).toContain('배수로와 물꼬를 미리 확인해요')
    expect(actionText).toContain('하천변 차량을 미리 옮겨요')
    expect(actionText).toContain('전기와 가스를 꺼요')
    expect(actionText).toContain('전신주 근처에서 멀어져요')
    expect(actionText).toContain('수돗물이 오염됐는지 확인해요')
    expect(riverCarSegment?.checkQuestion).toBe('무엇을 미리 옮길까요?')
    expect(riverCarSegment?.segment.officialRuleIds[0]).toBe(
      'SOURCE_EVIDENCE_HEAVY_RAIN',
    )
    expect(riverCarSegment?.structuredExplanation.tracks.action?.cards[0]?.label).toBe(
      '하천변 차량을 미리 옮겨요',
    )
    expect(
      riverCarSegment?.answerOptions.find((option) => option.correct)?.label,
    ).toBe('하천변 차량')
    expect(lowlandSegment?.checkQuestion).toBe('어디에서 멀어질까요?')
    expect(
      lowlandSegment?.answerOptions.find((option) => option.correct)?.label,
    ).toBe('낮은 곳, 비탈면, 산지')
    expect(actionText).not.toContain('가스 냄새를 어른에게 말해요')
    expect(actionText).not.toContain('논둑과 물꼬에서 떨어져 있어요')
    expect(report.passed).toBe(true)
  })

  it('preserves concrete heavy-snow OCR and narration keywords without falling back to flood cards', () => {
    const cues = [
      {
        endMs: 2_720,
        startMs: 0,
        text: '다행이와 함께하는 대설 국민행동요령',
      },
      {
        endMs: 6_720,
        startMs: 2_720,
        text: '눈이 쌓이면 외출을 자제하고 대중교통을 이용하세요',
      },
      {
        endMs: 10_360,
        startMs: 6_720,
        text: '사고예방을 위해 내 집 앞 눈을 치워요',
      },
      {
        endMs: 13_160,
        startMs: 10_360,
        text: '자전거와 전동 킥보드는 이용 금지',
      },
      {
        endMs: 16_640,
        startMs: 13_160,
        text: '주간에 2인 이상 안전 확보 후 제설작업을 실시하세요',
      },
      {
        endMs: 24_440,
        startMs: 16_640,
        text: '지붕 올라가기, 심야제설 등 무리한 작업 금지. 가로수 노후시설 등 붕괴 위험시설 접근 금지',
      },
      {
        endMs: 27_520,
        startMs: 24_440,
        text: '이상 징후 발견 시 대피 후 신고하세요',
      },
      {
        endMs: 32_480,
        startMs: 27_560,
        text: '차량 운행 시 타이어의 스노우체인, 스프레이 체인을 꼭 장착하세요',
      },
      {
        endMs: 39_200,
        startMs: 32_480,
        text: '눈이 쌓이거나 결빈 도로에서는 안전거리 유지와 서행은 필수. 급제동, 급가속, 급핸들 조작 금지',
      },
      {
        endMs: 42_840,
        startMs: 39_200,
        text: '대설 우리 모두 함께 대비해요',
      },
    ]
    const visualBoundaries = [
      2_720,
      6_720,
      10_360,
      13_160,
      16_640,
      24_440,
      27_520,
      32_480,
      39_200,
    ].map((boundaryMs) => ({
      afterCaption: 'after',
      beforeCaption: 'before',
      changeType: 'new_topic' as const,
      confidence: 0.95,
      reason: 'test boundary',
      recommendedBoundaryMs: boundaryMs,
      timeMs: boundaryMs,
    }))
    const hazard = __testGeneratePracticeFromUrl.detectHazard('대설 눈길')
    const evidenceReport =
      __testGeneratePracticeFromUrl.buildGenerationEvidenceReport({
        cues,
        rawCues: cues,
        sceneCutCandidatesMs: [],
        videoProbe: { durationMs: 42_840, frameRate: null },
        visualCaptionEvidence: {
          boundaries: visualBoundaries,
          frames: [],
          warnings: [],
        },
      })
    const scenario = __testGeneratePracticeFromUrl.buildScenario({
      cues,
      evidenceReport,
      hazard,
      jobId: 'generated-test-heavy-snow-source-keywords',
      sourceTitle: '대설 국민행동요령',
      sourceUrl: 'https://www.youtube.com/watch?v=V2OrcdTwPH0',
      videoSrc: '/generated/generated-test-heavy-snow-source-keywords/source.mp4',
    })
    const report = __testGeneratePracticeFromUrl.auditGeneratedScenario(
      scenario,
      cues,
      evidenceReport,
    )
    const uiText = scenario.segments
      .flatMap((segment) => [
        segment.description,
        segment.label,
        segment.learnerExplanation,
        segment.learnerPrompt,
        ...segment.learnerSequence.map((step) => step.text),
        ...segment.actionSteps,
        segment.structuredExplanation.tracks.doNot?.text ?? '',
        segment.checkQuestion,
        ...segment.answerOptions.map((option) => option.label),
      ])
      .join(' ')

    expect(
      __testGeneratePracticeFromUrl.topicKeyForCueText(
        '차량 운행 시 타이어의 스노우체인, 스프레이 체인을 꼭 장착하세요',
      ),
    ).toBe('heavy_snow_drive')
    expect(
      __testGeneratePracticeFromUrl.topicKeyForCueText(
        '눈이 쌓이거나 결빈 도로에서는 안전거리 유지와 서행은 필수',
      ),
    ).toBe('heavy_snow_drive')
    expect(uiText).toContain('대중교통')
    expect(uiText).toContain('내 집 앞 눈')
    expect(uiText).toContain('전동 킥보드')
    expect(uiText).toContain('2인 이상')
    expect(uiText).toContain('가로수')
    expect(uiText).toContain('119')
    expect(uiText).toContain('스노우체인')
    expect(uiText).toContain('안전거리')
    expect(uiText).toContain('서행')
    expect(uiText).toContain('급제동')
    expect(uiText).toContain('부드럽게')
    expect(uiText).not.toContain('하천')
    expect(uiText).not.toContain('태풍')
    expect(uiText).not.toContain('비바람')
    expect(report.passed).toBe(true)
  })

  it('aligns URL generation hazard support with shared seasonal hazards', () => {
    expect(
      __testGeneratePracticeFromUrl.detectHazard('폭염 온열질환').hazard,
    ).toBe('heatwave')
    expect(__testGeneratePracticeFromUrl.detectHazard('한파 추위').hazard).toBe(
      'coldwave',
    )
    expect(__testGeneratePracticeFromUrl.detectHazard('대설 눈길').hazard).toBe(
      'heavy_snow',
    )
  })

  it('canonicalizes equivalent YouTube URLs to the same generated practice id', () => {
    const canonical = __testGeneratePracticeFromUrl.buildGeneratedPracticeId(
      'https://www.youtube.com/watch?v=V2OrcdTwPH0',
    )
    const shared = __testGeneratePracticeFromUrl.buildGeneratedPracticeId(
      'https://youtu.be/V2OrcdTwPH0?si=XXr8YUgrNi_OaOkH',
    )
    const shorts = __testGeneratePracticeFromUrl.buildGeneratedPracticeId(
      'https://www.youtube.com/shorts/V2OrcdTwPH0?feature=share',
    )

    expect(shared).toEqual(canonical)
    expect(shorts).toEqual(canonical)
    expect(canonical.sourceUrl).toBe(
      'https://www.youtube.com/watch?v=V2OrcdTwPH0',
    )
  })
})
