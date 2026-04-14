# data/rules

This directory holds grounded disaster rule data used for safety-gated track generation.

Schema fields in each rule object:

- `rule_id`
- `hazard`
- `phase`
- `when`
- `action`
- `do_not`
- `why`
- `caregiver`
- `report_script`
- `source_title`
- `source_url`
- `updated_at`

Maintenance rules:

- Keep additions grounded in official Korean public guidance.
- Update `docs/RULES_CHANGELOG.md` whenever a rule changes.
- Keep `source_title`, `source_url`, and `updated_at` current for every rule.
- Avoid adding uncited behavioral advice or model-generated embellishment.
