import { describe, expect, it } from 'vitest'

import { demoScenarios } from './mock-session'
import { demoRunbookSteps, prerecordedBackupSessions } from './demo-runbook'

describe('demoRunbookSteps', () => {
  it('uses unique step ids and maps known scenarios only', () => {
    const ids = new Set<string>()
    const scenarioIds = new Set(demoScenarios.map((scenario) => scenario.id))

    for (const step of demoRunbookSteps) {
      expect(ids.has(step.id)).toBe(false)
      ids.add(step.id)

      if (step.scenarioId) {
        expect(scenarioIds.has(step.scenarioId)).toBe(true)
      }
    }
  })
})

describe('prerecordedBackupSessions', () => {
  it('maps each backup session to an existing demo scenario', () => {
    const scenarioIds = new Set(demoScenarios.map((scenario) => scenario.id))

    for (const session of prerecordedBackupSessions) {
      expect(scenarioIds.has(session.scenarioId)).toBe(true)
    }
  })
})
