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

const longUnknownCaptionVtt = `WEBVTT

00:00:00.000 --> 00:01:12.000
재난안전 영상을 보고 있어요. 먼저 안내 방송을 듣고 주변을 살펴요. 다음에는 선생님이나 보호자와 함께 움직여요. 혼자 급하게 뛰지 말고 안전한 곳에서 기다려요.
`

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
    expect(report.analysisDepth.segmentationEvidence).toContain('audio-caption')
    expect(report.analysisDepth.frameBoundaryPrecisionMs).toBe(10)
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
      '농촌에서는 미리 준비해야 해요.',
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
})
