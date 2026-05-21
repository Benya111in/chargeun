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
        scenarioId: 'earthquake-protect-flow',
        topicLabel: '지진 대피 연습',
      },
    )
    expect(matchUrlToScenario('https://example.com/fire-safety')).toEqual({
      scenarioId: 'fire-grounded-flow',
      topicLabel: '화재 대피 연습',
    })
    expect(matchUrlToScenario('https://example.com/general')).toEqual({
      scenarioId: 'fire-grounded-flow',
      topicLabel: '재난안전 연습',
    })
  })

  it('rejects non-web URLs before generating a practice page', () => {
    expect(() => normalizeScenarioUrl('file:///Users/user/video.mp4')).toThrow(
      'http 또는 https 링크만 사용할 수 있습니다.',
    )
  })

  it('creates a generated scenario wrapper that the practice player can render', () => {
    const record = createGeneratedScenarioRecord(
      'https://www.youtube.com/watch?v=fire-training',
    )
    const scenario = toGeneratedTheaterShow(record)

    expect(record.id).toMatch(/^generated-/)
    expect(record.baseScenarioId).toBe('fire-grounded-flow')
    expect(scenario?.id).toBe(record.id)
    expect(scenario?.title).toBe('URL로 만든 연습')
    expect(scenario?.segments.length).toBeGreaterThan(0)
    expect(scenario?.practiceSequence).toBe(false)
  })
})
