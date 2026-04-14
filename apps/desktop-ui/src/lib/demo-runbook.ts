import type { VoiceIntent } from '@ansimtrack/shared-types'

import prerecordedSessionsData from '../../../../data/demo/prerecorded_sessions.json'
import runbookData from '../../../../data/demo/runbook.json'

export type DemoTrackKey =
  | 'basic'
  | 'easy'
  | 'action'
  | 'reason'
  | 'caregiver'
  | 'report'

export type DemoRunbookStep = {
  cue: string
  id: string
  panicMode?: boolean
  preferredTrack?: DemoTrackKey
  recommendedIntent?: VoiceIntent
  scenarioId?: string
  showEvidence?: boolean
  timeWindow: string
  title: string
}

export type PrerecordedBackupSession = {
  id: string
  note: string
  panicMode?: boolean
  preferredTrack?: DemoTrackKey
  scenarioId: string
  showEvidence?: boolean
  title: string
  trigger: string
}

export const demoRunbookSteps = runbookData as DemoRunbookStep[]
export const prerecordedBackupSessions =
  prerecordedSessionsData as PrerecordedBackupSession[]
