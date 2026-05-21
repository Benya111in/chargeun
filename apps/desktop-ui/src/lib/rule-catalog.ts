import type {
  OfficialSourceChunk,
  OfficialSourceRecord,
  RuleRecord,
} from '@ansimtrack/shared-types'

import officialChunks from '../../../../data/official_sources/official_chunks.json'
import officialSources from '../../../../data/official_sources/official_sources.json'
import earthquakeRules from '../../../../data/rules/earthquake_rules.json'
import fireRules from '../../../../data/rules/fire_rules.json'
import seasonalRules from '../../../../data/rules/seasonal_rules.json'

export const fireRuleCatalog = fireRules as RuleRecord[]
export const earthquakeRuleCatalog = earthquakeRules as RuleRecord[]
export const seasonalRuleCatalog = seasonalRules as RuleRecord[]
export const liveRuleCatalog = [
  ...fireRuleCatalog,
  ...earthquakeRuleCatalog,
  ...seasonalRuleCatalog,
] as RuleRecord[]
export const officialSourceCatalog = officialSources as OfficialSourceRecord[]
export const officialChunkCatalog = officialChunks as OfficialSourceChunk[]
