import { describe, expect, it } from 'vitest'

import {
  createGeneratedScenarioRecord,
  matchUrlToScenario,
  normalizeScenarioUrl,
  toGeneratedTheaterShow,
} from './generated-scenario'

describe('generated scenario URL flow', () => {
  it('matches disaster video URLs to the closest validated scenario', () => {
    expect(matchUrlToScenario('https://example.com/watch?v=earthquake')).toEqual(
      {
        matchBasis: 'url',
        scenarioId: 'earthquake-protect-flow',
        topicLabel: '지진 대피 연습',
      },
    )
    expect(matchUrlToScenario('https://example.com/fire-safety')).toEqual({
      matchBasis: 'url',
      scenarioId: 'fire-grounded-flow',
      topicLabel: '화재 대피 연습',
    })
    expect(matchUrlToScenario('https://example.com/general')).toBeNull()
    expect(
      matchUrlToScenario(
        'https://www.youtube.com/watch?v=yYwX3qqVMSE',
        '🚨 지진 발생 시 이렇게 행동하세요!',
      ),
    ).toEqual({
      matchBasis: 'metadata',
      scenarioId: 'earthquake-protect-flow',
      topicLabel: '지진 대피 연습',
    })
  })

  it('rejects non-web URLs before generating a practice page', () => {
    expect(() => normalizeScenarioUrl('file:///Users/user/video.mp4')).toThrow(
      'http 또는 https 링크만 사용할 수 있습니다.',
    )
  })

  it('accepts bare YouTube links and raw video IDs', () => {
    expect(normalizeScenarioUrl('youtube.com/watch?v=IiVsojHcoEo')).toBe(
      'https://youtube.com/watch?v=IiVsojHcoEo',
    )
    expect(normalizeScenarioUrl('IiVsojHcoEo')).toBe(
      'https://www.youtube.com/watch?v=IiVsojHcoEo',
    )
  })

  it('creates a generated scenario wrapper that the practice player can render', () => {
    const record = createGeneratedScenarioRecord(
      'https://www.youtube.com/watch?v=yYwX3qqVMSE',
      {
        thumbnailUrl: 'https://i.ytimg.com/vi/yYwX3qqVMSE/hqdefault.jpg',
        title: '🚨 지진 발생 시 이렇게 행동하세요!',
      },
    )
    const scenario = toGeneratedTheaterShow(record)

    expect(record.id).toMatch(/^generated-/)
    expect(record.baseScenarioId).toBe('earthquake-protect-flow')
    expect(record.matchBasis).toBe('metadata')
    expect(scenario?.id).toBe(record.id)
    expect(scenario?.title).toBe('URL로 만든 연습')
    expect(scenario?.generatedSourceTitle).toBe(
      '🚨 지진 발생 시 이렇게 행동하세요!',
    )
    expect(scenario?.segments.length).toBeGreaterThan(0)
    expect(scenario?.practiceSequence).toBe(false)
  })

  it('does not render generated scenarios made without real timing evidence', () => {
    const record = createGeneratedScenarioRecord(
      'https://www.youtube.com/watch?v=oWu95ZitpTI',
      {
        title: '태풍 대비법',
      },
    )

    expect(
      toGeneratedTheaterShow({
        ...record,
        customScenario: {
          accentClassName: 'bg-emerald-400',
          generationEvidenceReport: {
            warnings: [
              'YouTube가 서버의 자막 접근을 막아 제목과 공식 안전 주제 기준의 검토용 초안을 만들고, 영상은 YouTube 플레이어로 보여 줍니다.',
            ],
          },
          id: record.id,
          note: '',
          posterSrc: '',
          segments: [],
          title: '잘못 만든 연습',
          videoPlaybackKind: 'youtube',
          videoSrc: 'https://www.youtube.com/embed/oWu95ZitpTI',
        },
      }),
    ).toBeNull()
  })
})
