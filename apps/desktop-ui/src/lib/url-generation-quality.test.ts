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
    expect(report.passed).toBe(true)
    expect(report.score).toBe(100)
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
