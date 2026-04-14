import type { RuleRecord } from '@ansimtrack/shared-types'

import earthquakeRules from '../../../../data/rules/earthquake_rules.json'
import fireRules from '../../../../data/rules/fire_rules.json'

export const fireRuleCatalog = fireRules as RuleRecord[]
export const earthquakeRuleCatalog = earthquakeRules as RuleRecord[]
export const liveRuleCatalog = [
  ...fireRuleCatalog,
  ...earthquakeRuleCatalog,
] as RuleRecord[]
