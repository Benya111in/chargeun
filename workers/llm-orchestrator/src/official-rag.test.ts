import { describe, expect, it } from 'vitest'

import type { OfficialSourceChunk } from '@ansimtrack/shared-types'

import { retrieveOfficialSources } from './official-rag'

const chunks: OfficialSourceChunk[] = [
  {
    audience: 'learner',
    canonicalUrl: 'https://example.test/fire',
    chunkId: 'fire-door-stair',
    easyKo: '문을 닫고 계단으로 가요.',
    hazard: 'fire',
    heading: '문 닫고 계단 대피',
    keywords: ['문닫기', '계단', '엘리베이터'],
    paraphraseKo: '현관문을 닫고 계단으로 대피한다.',
    phase: 'door_control',
    reviewStatus: 'approved',
    ruleIds: ['KR_FIRE_04', 'KR_FIRE_03'],
    sourceId: 'safetv-fire',
    updatedAt: '2026-05-20',
  },
  {
    audience: 'learner',
    canonicalUrl: 'https://example.test/earthquake',
    chunkId: 'earthquake-table',
    easyKo: '책상 아래에서 머리를 지켜요.',
    hazard: 'earthquake',
    heading: '흔들릴 때 보호',
    keywords: ['흔들림', '책상', '머리보호'],
    paraphraseKo: '탁자 아래에서 몸과 머리를 보호한다.',
    phase: 'during_shaking',
    reviewStatus: 'approved',
    ruleIds: ['KR_EQ_03'],
    sourceId: 'safekorea-earthquake',
    updatedAt: '2026-05-20',
  },
]

describe('retrieveOfficialSources', () => {
  it('prioritizes linked rule ids and matching hazard', () => {
    const result = retrieveOfficialSources(chunks, {
      hazard: 'fire',
      phase: 'door_control',
      queryText: '현관문 계단 대피',
      ruleIds: ['KR_FIRE_04'],
    })

    expect(result.matches[0]?.chunk.chunkId).toBe('fire-door-stair')
    expect(result.matches[0]?.matchedRuleIds).toContain('KR_FIRE_04')
  })

  it('does not return chunks for unrelated hazards', () => {
    const result = retrieveOfficialSources(chunks, {
      hazard: 'earthquake',
      phase: 'during_shaking',
      queryText: '현관문 계단',
      ruleIds: ['KR_FIRE_04'],
    })

    expect(result.matches.map((match) => match.chunk.chunkId)).not.toContain(
      'fire-door-stair',
    )
  })

  it('returns no match for unknown hazards', () => {
    expect(
      retrieveOfficialSources(chunks, {
        hazard: 'unknown',
        queryText: '계단',
        ruleIds: ['KR_FIRE_03'],
      }).matches,
    ).toEqual([])
  })

  it('prefers learner chunks over caregiver chunks when both match', () => {
    const result = retrieveOfficialSources(
      [
        {
          audience: 'learner',
          canonicalUrl: 'https://example.test/fire-actions',
          chunkId: 'fire-stair-learner',
          easyKo: '계단으로 가요.',
          hazard: 'fire',
          heading: '화재 계단 대피',
          keywords: ['계단'],
          paraphraseKo: '화재 때는 계단으로 대피한다.',
          phase: 'stair_evacuation',
          reviewStatus: 'approved',
          ruleIds: ['KR_FIRE_03'],
          sourceId: 'safekorea-fire',
          updatedAt: '2026-05-20',
        },
        {
          audience: 'caregiver',
          canonicalUrl: 'https://example.test/guide',
          chunkId: 'fire-stair-caregiver',
          easyKo: '계단과 출구를 짧게 반복해서 알려요.',
          hazard: 'fire',
          heading: '지원자 안내',
          keywords: ['계단', '출구', '반복'],
          paraphraseKo: '지원자는 계단과 출구를 반복 안내한다.',
          phase: 'stair_evacuation',
          reviewStatus: 'approved',
          ruleIds: ['KR_FIRE_03'],
          sourceId: 'koddi-guide',
          updatedAt: '2026-05-20',
        },
      ],
      {
        hazard: 'fire',
        phase: 'stair_evacuation',
        queryText: '계단 출구',
        ruleIds: ['KR_FIRE_03'],
      },
    )

    expect(result.matches[0]?.chunk.chunkId).toBe('fire-stair-learner')
  })
})
