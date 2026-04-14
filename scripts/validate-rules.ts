import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { ruleRecordSchema } from '../packages/shared-types/src/index.ts'

const main = async () => {
  const root = process.cwd()
  const files = [
    path.join(root, 'data', 'rules', 'fire_rules.json'),
    path.join(root, 'data', 'rules', 'earthquake_rules.json'),
  ]

  for (const file of files) {
    const raw = await readFile(file, 'utf8')
    const parsed = JSON.parse(raw)
    const result = ruleRecordSchema.array().safeParse(parsed)

    if (!result.success) {
      console.error(`Rule validation failed for ${path.basename(file)}`)
      console.error(result.error.format())
      process.exit(1)
    }

    console.log(`${path.basename(file)}: ${result.data.length} rules validated`)
  }
}

void main()
