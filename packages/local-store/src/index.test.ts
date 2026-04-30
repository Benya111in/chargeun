import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  LocalJobCancelledError,
  LocalLatestJobQueue,
  appendSessionLog,
  clearLocalRuntime,
  ensureLocalRuntimePaths,
  exportSessionSnapshot,
  loadSessionLog,
  sqliteSchemaSql,
} from './index'

describe('ensureLocalRuntimePaths', () => {
  it('creates runtime directories and writes the sqlite schema', async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), 'slowlearner-store-'))
    const paths = await ensureLocalRuntimePaths(baseDir)

    expect(paths.cacheDir).toContain(baseDir)
    expect(paths.schemaPath).toContain('sqlite-schema.sql')
    expect(sqliteSchemaSql).toContain('CREATE TABLE IF NOT EXISTS sessions')

    await clearLocalRuntime(paths)
  })
})

describe('session logging and export', () => {
  it('persists session logs and export bundles', async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), 'slowlearner-store-'))
    const paths = await ensureLocalRuntimePaths(baseDir)

    await appendSessionLog(paths, {
      selectedTrack: 'easy',
      session: {
        id: 'session-1',
        sourceType: 'monitor',
        platform: 'mac',
        startedAt: 1_000,
        hasAudio: true,
        displayName: 'demo',
      },
      voiceEnabled: true,
    })

    const logs = await loadSessionLog(paths)
    expect(logs).toHaveLength(1)
    expect(logs[0]?.selectedTrack).toBe('easy')

    const exportPath = await exportSessionSnapshot(paths, {
      createdAt: 2_000,
      session: logs[0]!,
    })

    expect(exportPath).toContain(paths.exportDir)

    await clearLocalRuntime(paths)
  })
})

describe('LocalLatestJobQueue', () => {
  it('keeps only the latest pending job of the same kind', async () => {
    const queue = new LocalLatestJobQueue(3)
    const execution: string[] = []

    const first = queue.enqueue({
      kind: 'ocr',
      run: async () => {
        execution.push('first')
        return 'first'
      },
    })

    queue.enqueue({
      kind: 'ocr',
      run: async () => {
        execution.push('second')
        return 'second'
      },
    })

    const third = queue.enqueue({
      kind: 'export',
      run: async () => {
        execution.push('third')
        return 'third'
      },
    })

    const firstResult = await first.promise
    const thirdResult = await third.promise

    expect(firstResult).toBe('first')
    expect(thirdResult).toBe('third')
    expect(queue.getPendingKinds()).toHaveLength(0)
    expect(execution.includes('third')).toBe(true)
  })

  it('rejects superseded pending latest-only jobs', async () => {
    const queue = new LocalLatestJobQueue(3)
    let releaseFirstJob!: () => void

    const first = queue.enqueue({
      kind: 'ocr',
      run: () =>
        new Promise<string>((resolve) => {
          releaseFirstJob = () => resolve('first')
        }),
    })

    const second = queue.enqueue({
      kind: 'asr',
      run: async () => 'second',
    })

    const third = queue.enqueue({
      kind: 'asr',
      run: async () => 'third',
    })

    await expect(second.promise).rejects.toBeInstanceOf(LocalJobCancelledError)

    releaseFirstJob()

    await expect(first.promise).resolves.toBe('first')
    await expect(third.promise).resolves.toBe('third')
  })
})
