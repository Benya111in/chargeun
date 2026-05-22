import { createReadStream, existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { generatePracticeFromUrl } from '../api/generate-practice-from-url'

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const generatedDir = join(rootDir, 'apps/desktop-ui/public/generated')
const defaultPollMs = 5_000

type WorkerJob = {
  id: string
  sourceUrl: string
}

void main()

let apiBase = ''
let workerToken = ''

async function main() {
  await loadEnvFile('.env')
  await loadEnvFile('.env.local')

  apiBase = normalizeApiBase(
    process.env.WORKER_API_BASE || 'https://chargeun.onrender.com',
  )
  workerToken =
    process.env.GENERATOR_WORKER_TOKEN?.trim() ||
    firstConfiguredCode(process.env.GENERATOR_ACCESS_CODES) ||
    firstConfiguredCode(process.env.BETA_ACCESS_CODES) ||
    ''
  const pollMs = Number(process.env.LOCAL_WORKER_POLL_MS || defaultPollMs)
  const runOnce = process.env.LOCAL_WORKER_ONCE === '1'

  if (!process.env.PUBLIC_GENERATOR_API_BASE) {
    process.env.PUBLIC_GENERATOR_API_BASE = apiBase
  }

  if (!workerToken) {
    throw new Error(
      'GENERATOR_WORKER_TOKEN 또는 GENERATOR_ACCESS_CODES가 필요합니다.',
    )
  }

  console.log(`Local ingest worker polling ${apiBase}`)

  while (true) {
    const job = await fetchNextJob()

    if (job) {
      await processJob(job)
    } else if (runOnce) {
      break
    }

    await wait(pollMs)
  }
}

async function processJob(job: WorkerJob) {
  console.log(`Starting ${job.id}`)

  try {
    const generated = await generatePracticeFromUrl(job.sourceUrl)
    const record = generated.record

    if (record.id !== job.id) {
      throw new Error(
        `Generated record id mismatch. job=${job.id}, record=${record.id}`,
      )
    }
    if (!record.customScenario) {
      throw new Error('customScenario 생성 결과가 없습니다.')
    }
    await writeFile(
      join(generatedDir, job.id, 'scenario.json'),
      JSON.stringify(record.customScenario, null, 2),
    )

    await uploadGeneratedFiles(job.id)
    await postWorkerJson(`/api/worker/jobs/${job.id}/complete`, {
      record,
    })

    console.log(`Completed ${job.id}`)
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : '로컬 worker가 생성 작업을 실패했습니다.'
    await postWorkerJson(`/api/worker/jobs/${job.id}/fail`, { message }).catch(
      () => undefined,
    )
    console.error(`Failed ${job.id}: ${message}`)
  }
}

async function fetchNextJob(): Promise<WorkerJob | null> {
  const response = await fetch(`${apiBase}/api/worker/jobs/next`, {
    headers: {
      'x-worker-token': workerToken,
    },
  })

  const payload = (await response.json().catch(() => ({}))) as {
    job?: WorkerJob | null
    message?: string
  }

  if (!response.ok) {
    throw new Error(
      payload.message || `Worker queue request failed: ${response.status}`,
    )
  }

  return payload.job ?? null
}

async function uploadGeneratedFiles(jobId: string) {
  const jobDir = join(generatedDir, jobId)
  const files = await readdir(jobDir)
  const uploadable = files.filter(isUploadableGeneratedFile)

  if (!uploadable.includes('scenario.json')) {
    throw new Error('scenario.json 생성 파일이 없습니다.')
  }

  if (!uploadable.includes('source.mp4')) {
    throw new Error('source.mp4 생성 파일이 없습니다.')
  }

  for (const fileName of uploadable) {
    await uploadGeneratedFile(jobId, join(jobDir, fileName))
  }
}

async function uploadGeneratedFile(jobId: string, filePath: string) {
  if (!existsSync(filePath)) {
    return
  }

  const fileName = basename(filePath)
  const response = await fetch(
    `${apiBase}/api/worker/jobs/${encodeURIComponent(
      jobId,
    )}/assets/${encodeURIComponent(fileName)}`,
    {
      body: createReadStream(filePath),
      duplex: 'half',
      headers: {
        'content-type': contentTypeForFile(fileName),
        'x-worker-token': workerToken,
      },
      method: 'PUT',
    } as RequestInit & { duplex: 'half' },
  )

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string
    }
    throw new Error(
      payload.message || `${fileName} 업로드 실패: ${response.status}`,
    )
  }
}

async function postWorkerJson(pathname: string, body: Record<string, unknown>) {
  const response = await fetch(`${apiBase}${pathname}`, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      'x-worker-token': workerToken,
    },
    method: 'POST',
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string
    }
    throw new Error(payload.message || `Worker POST failed: ${response.status}`)
  }
}

function isUploadableGeneratedFile(fileName: string) {
  return (
    fileName === 'scenario.json' ||
    fileName === 'source.mp4' ||
    fileName === 'source.info.json' ||
    /^source\.[a-z0-9-]+(?:-orig)?\.vtt$/iu.test(fileName) ||
    /^visual-caption-frame-\d{2}\.jpg$/u.test(fileName)
  )
}

function contentTypeForFile(fileName: string) {
  if (fileName.endsWith('.json')) {
    return 'application/json; charset=utf-8'
  }
  if (fileName.endsWith('.jpg')) {
    return 'image/jpeg'
  }
  if (fileName.endsWith('.mp4')) {
    return 'video/mp4'
  }
  if (fileName.endsWith('.vtt')) {
    return 'text/vtt; charset=utf-8'
  }

  return 'application/octet-stream'
}

function normalizeApiBase(input: string) {
  return input.trim().replace(/\/+$/u, '')
}

function firstConfiguredCode(input: string | undefined) {
  return input
    ?.split(',')
    .map((code) => code.trim())
    .find(Boolean)
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function loadEnvFile(fileName: string) {
  const filePath = join(rootDir, fileName)

  try {
    const text = await readFile(filePath, 'utf8')

    for (const line of text.split(/\r?\n/u)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }

      const equalsIndex = trimmed.indexOf('=')
      if (equalsIndex <= 0) {
        continue
      }

      const key = trimmed.slice(0, equalsIndex).trim()
      const rawValue = trimmed.slice(equalsIndex + 1).trim()
      const value = rawValue.replace(/^['"`]|['"`]$/gu, '')

      if (key && process.env[key] === undefined) {
        process.env[key] = value
      }
    }
  } catch {
    // Local env files are optional.
  }
}
