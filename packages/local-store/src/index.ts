import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type {
  CaptureSession,
  PerceptionPacket,
  Segment,
  SegmentExplanation,
} from '@ansimtrack/shared-types'

export const sqliteSchemaSql = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  platform TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  has_audio INTEGER NOT NULL,
  display_name TEXT
);

CREATE TABLE IF NOT EXISTS perception_packets (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  t_start_ms INTEGER NOT NULL,
  t_end_ms INTEGER NOT NULL,
  asr_text TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  hazard TEXT NOT NULL,
  phase TEXT NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  confidence REAL NOT NULL,
  official_rule_ids TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS segment_explanations (
  segment_id TEXT PRIMARY KEY,
  safety_mode TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);
`.trim()

export type LocalRuntimePaths = {
  baseDir: string
  cacheDir: string
  exportDir: string
  logsDir: string
  schemaPath: string
}

export type SessionLogEntry = {
  endedAt?: number
  selectedSourceId?: string
  selectedTrack?: string
  session: CaptureSession
  voiceEnabled?: boolean
}

export type SessionSnapshot = {
  createdAt: number
  explanation?: SegmentExplanation
  packet?: PerceptionPacket
  segment?: Segment
  session: SessionLogEntry
}

export type LocalJobKind =
  | 'frame-sampling'
  | 'asr'
  | 'ocr'
  | 'orchestration'
  | 'tracking-refresh'
  | 'export'

type QueueItem<T> = {
  jobId: string
  kind: LocalJobKind
  latestOnly: boolean
  run: () => Promise<T>
}

export class LocalLatestJobQueue {
  private active = false
  private pending: QueueItem<unknown>[] = []

  constructor(private readonly depthLimit = 4) {}

  enqueue<T>(input: {
    kind: LocalJobKind
    latestOnly?: boolean
    run: () => Promise<T>
  }) {
    const item: QueueItem<T> = {
      jobId: `${input.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: input.kind,
      latestOnly: input.latestOnly ?? true,
      run: input.run,
    }

    if (item.latestOnly) {
      this.pending = this.pending.filter(
        (pendingJob) => pendingJob.kind !== item.kind,
      )
    }

    this.pending.push(item)
    if (this.pending.length > this.depthLimit) {
      this.pending = this.pending.slice(-this.depthLimit)
    }

    const promise = new Promise<T>((resolve, reject) => {
      const wrapped: QueueItem<T> = {
        ...item,
        run: async () => {
          try {
            const result = await item.run()
            resolve(result)
            return result
          } catch (error) {
            reject(error)
            throw error
          }
        },
      }

      this.pending[this.pending.length - 1] = wrapped
      this.drain()
    })

    return {
      jobId: item.jobId,
      promise,
      queuedDepth: this.pending.length,
    }
  }

  getPendingKinds() {
    return this.pending.map((item) => item.kind)
  }

  private async drain() {
    if (this.active) {
      return
    }

    this.active = true

    while (this.pending.length > 0) {
      const next = this.pending.shift()
      if (!next) {
        break
      }

      try {
        await next.run()
      } catch {
        // Errors are surfaced through the enqueue promise.
      }
    }

    this.active = false
  }
}

export async function ensureLocalRuntimePaths(
  baseDir = path.resolve(process.cwd(), '.slowlearner'),
): Promise<LocalRuntimePaths> {
  const cacheDir = path.join(baseDir, 'cache')
  const exportDir = path.join(baseDir, 'export')
  const logsDir = path.join(baseDir, 'logs')
  const schemaPath = path.join(baseDir, 'sqlite-schema.sql')

  await Promise.all([
    mkdir(cacheDir, { recursive: true }),
    mkdir(exportDir, { recursive: true }),
    mkdir(logsDir, { recursive: true }),
  ])
  await writeFile(schemaPath, sqliteSchemaSql, 'utf8')

  return {
    baseDir,
    cacheDir,
    exportDir,
    logsDir,
    schemaPath,
  }
}

export async function appendSessionLog(
  paths: LocalRuntimePaths,
  entry: SessionLogEntry,
) {
  const logPath = path.join(paths.logsDir, 'sessions.jsonl')
  await mkdir(path.dirname(logPath), { recursive: true })
  await appendLine(logPath, JSON.stringify(entry))
  return logPath
}

export async function exportSessionSnapshot(
  paths: LocalRuntimePaths,
  snapshot: SessionSnapshot,
) {
  const exportPath = path.join(
    paths.exportDir,
    `${snapshot.session.session.id}-${snapshot.createdAt}.json`,
  )

  await writeFile(exportPath, JSON.stringify(snapshot, null, 2), 'utf8')
  return exportPath
}

export async function loadSessionLog(paths: LocalRuntimePaths) {
  const logPath = path.join(paths.logsDir, 'sessions.jsonl')
  try {
    const content = await readFile(logPath, 'utf8')
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SessionLogEntry)
  } catch {
    return []
  }
}

export async function clearLocalRuntime(paths: LocalRuntimePaths) {
  await rm(paths.baseDir, { force: true, recursive: true })
}

async function appendLine(filePath: string, line: string) {
  let current = ''

  try {
    current = await readFile(filePath, 'utf8')
  } catch {
    current = ''
  }

  const next = current ? `${current.trimEnd()}\n${line}\n` : `${line}\n`
  await writeFile(filePath, next, 'utf8')
}
