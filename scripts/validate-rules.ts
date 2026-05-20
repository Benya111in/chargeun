import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  officialSourceChunkSchema,
  officialSourceRecordSchema,
  ruleRecordSchema,
} from '../packages/shared-types/src/index.ts'

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

  const sourceFile = path.join(
    root,
    'data',
    'official_sources',
    'official_sources.json',
  )
  const chunkFile = path.join(
    root,
    'data',
    'official_sources',
    'official_chunks.json',
  )
  const officialSources = officialSourceRecordSchema
    .array()
    .parse(JSON.parse(await readFile(sourceFile, 'utf8')))
  const officialChunks = officialSourceChunkSchema
    .array()
    .parse(JSON.parse(await readFile(chunkFile, 'utf8')))
  const sourceIds = new Set(officialSources.map((source) => source.sourceId))
  const ruleIds = new Set<string>()

  for (const file of files) {
    const rules = ruleRecordSchema
      .array()
      .parse(JSON.parse(await readFile(file, 'utf8')))

    for (const rule of rules) {
      ruleIds.add(rule.rule_id)
    }
  }

  for (const chunk of officialChunks) {
    if (!sourceIds.has(chunk.sourceId)) {
      throw new Error(
        `Official chunk ${chunk.chunkId} references missing source ${chunk.sourceId}`,
      )
    }

    for (const ruleId of chunk.ruleIds) {
      if (!ruleIds.has(ruleId)) {
        throw new Error(
          `Official chunk ${chunk.chunkId} references missing rule ${ruleId}`,
        )
      }
    }
  }

  console.log(`${officialSources.length} official sources validated`)
  console.log(`${officialChunks.length} official source chunks validated`)
}

void main()
