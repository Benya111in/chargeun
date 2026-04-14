import { spawnSync } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

type EvalFixture = {
  clipId: string
  description: string
  sourceClipPlan?: SourceClipPlan | null
}

type SourceClipPlan = {
  notes: string
  outputRelativePath: string
  searchHints: string[]
  sourceId: string
}

type SourceVideo = {
  credit: string
  durationSeconds: number
  localPath: string
  notes: string
  sourceId: string
  title: string
  url: string
}

type ClipWindow = {
  clipId: string
  notes: string
  sourceEndMs: number | null
  sourceStartMs: number | null
}

const root = process.cwd()
const args = parseArgs(process.argv.slice(2))

const main = async () => {
  const fixtures = await loadJson<EvalFixture[]>(
    'data/eval/annotated_segments.json',
  )
  const sources = await loadJsonWithLocalFallback<SourceVideo[]>(
    'data/eval/source_videos.local.json',
    'data/eval/source_videos.example.json',
  )
  const clipWindows = await loadJsonWithLocalFallback<ClipWindow[]>(
    'data/eval/clip_windows.local.json',
    'data/eval/clip_windows.example.json',
  )

  const sourceById = new Map(sources.map((source) => [source.sourceId, source]))
  const clipWindowById = new Map(
    clipWindows.map((window) => [window.clipId, window]),
  )

  const plannedFixtures = fixtures.filter(
    (fixture) =>
      fixture.sourceClipPlan &&
      (!args.fixture || fixture.clipId === args.fixture),
  )

  if (plannedFixtures.length === 0) {
    throw new Error(
      args.fixture
        ? `No source clip plan found for fixture: ${args.fixture}`
        : 'No fixtures with source clip plans were found.',
    )
  }

  if (args.extract && !checkCommandAvailable('ffmpeg')) {
    throw new Error('ffmpeg is required for --extract mode but was not found.')
  }

  const results: ClipPlanResult[] = []

  for (const fixture of plannedFixtures) {
    const plan = fixture.sourceClipPlan!
    const source = sourceById.get(plan.sourceId) ?? null
    const clipWindow = clipWindowById.get(fixture.clipId) ?? null
    const outputPath = path.join(root, plan.outputRelativePath)
    const sourcePath = source?.localPath.trim() ?? ''
    const sourceExists = sourcePath ? await fileExists(sourcePath) : false
    const outputExists = await fileExists(outputPath)
    const windowReady =
      typeof clipWindow?.sourceStartMs === 'number' &&
      typeof clipWindow?.sourceEndMs === 'number' &&
      clipWindow.sourceEndMs > clipWindow.sourceStartMs

    let status: ClipPlanStatus

    if (!source) {
      status = 'source-not-found'
    } else if (!sourcePath || !sourceExists) {
      status = 'missing-source'
    } else if (!windowReady) {
      status = 'missing-window'
    } else if (outputExists && !args.force) {
      status = 'exists'
    } else {
      status = 'ready'
    }

    const ffmpegCommand =
      source && sourcePath && windowReady
        ? buildFfmpegCommand({
            endMs: clipWindow!.sourceEndMs!,
            outputPath,
            sourcePath,
            startMs: clipWindow!.sourceStartMs!,
          })
        : ''

    if (args.extract && status === 'ready') {
      await mkdir(path.dirname(outputPath), { recursive: true })
      const result = spawnSync(
        'ffmpeg',
        [
          '-y',
          '-ss',
          formatSeconds(clipWindow!.sourceStartMs!),
          '-t',
          formatSeconds(clipWindow!.sourceEndMs! - clipWindow!.sourceStartMs!),
          '-i',
          sourcePath,
          '-map',
          '0:v:0',
          '-map',
          '0:a?',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '23',
          '-c:a',
          'aac',
          '-movflags',
          '+faststart',
          outputPath,
        ],
        {
          cwd: root,
          encoding: 'utf8',
        },
      )

      results.push({
        clipWindow,
        ffmpegCommand,
        fixture,
        outputPath,
        source,
        sourcePath,
        status: result.status === 0 ? 'extracted' : 'failed',
        stderr: result.stderr?.trim() ?? '',
      })
      continue
    }

    results.push({
      clipWindow,
      ffmpegCommand,
      fixture,
      outputPath,
      source,
      sourcePath,
      status,
      stderr: '',
    })
  }

  printSummary(results)

  if (args.extract && results.some((result) => result.status === 'failed')) {
    process.exitCode = 1
  }
}

type ClipPlanStatus =
  | 'exists'
  | 'extracted'
  | 'failed'
  | 'missing-source'
  | 'missing-window'
  | 'ready'
  | 'source-not-found'

type ClipPlanResult = {
  clipWindow: ClipWindow | null
  ffmpegCommand: string
  fixture: EvalFixture
  outputPath: string
  source: SourceVideo | null
  sourcePath: string
  status: ClipPlanStatus
  stderr: string
}

async function loadJson<T>(relativeFile: string) {
  const file = path.join(root, relativeFile)
  return JSON.parse(await readFile(file, 'utf8')) as T
}

async function loadJsonWithLocalFallback<T>(
  localRelativeFile: string,
  exampleRelativeFile: string,
) {
  const localPath = path.join(root, localRelativeFile)
  if (await fileExists(localPath)) {
    return loadJson<T>(localRelativeFile)
  }

  return loadJson<T>(exampleRelativeFile)
}

async function fileExists(target: string) {
  try {
    await access(target, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function parseArgs(argv: string[]) {
  let extract = false
  let fixture: string | null = null
  let force = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--extract') {
      extract = true
      continue
    }

    if (arg === '--force') {
      force = true
      continue
    }

    if (arg === '--fixture') {
      fixture = argv[index + 1] ?? null
      index += 1
      continue
    }
  }

  return { extract, fixture, force }
}

function checkCommandAvailable(command: string) {
  const result = spawnSync(command, ['-version'], {
    cwd: root,
    encoding: 'utf8',
  })

  return result.status === 0
}

function printSummary(results: ClipPlanResult[]) {
  console.log(`# Eval Clip Intake (${args.extract ? 'extract' : 'plan'})`)
  console.log('')
  console.log(
    '- source catalog: `data/eval/source_videos.local.json` or fallback `data/eval/source_videos.example.json`',
  )
  console.log(
    '- clip windows: `data/eval/clip_windows.local.json` or fallback `data/eval/clip_windows.example.json`',
  )

  for (const result of results) {
    console.log('')
    console.log(
      `[${result.status}] ${result.fixture.clipId} - ${result.fixture.description}`,
    )
    console.log(
      `  source: ${result.source?.title ?? 'missing source record'} (${result.source?.credit ?? 'unknown'})`,
    )
    console.log(`  url: ${result.source?.url ?? 'n/a'}`)
    console.log(
      `  local source: ${result.sourcePath || '(set localPath in source_videos.local.json)'}`,
    )
    console.log(`  output: ${path.relative(root, result.outputPath)}`)
    console.log(
      `  hints: ${
        result.fixture.sourceClipPlan?.searchHints.join(', ') || 'none'
      }`,
    )
    console.log(
      `  notes: ${result.fixture.sourceClipPlan?.notes ?? result.clipWindow?.notes ?? 'none'}`,
    )

    if (result.clipWindow) {
      console.log(
        `  window: ${formatWindowValue(
          result.clipWindow.sourceStartMs,
        )} -> ${formatWindowValue(result.clipWindow.sourceEndMs)}`,
      )
    } else {
      console.log('  window: (missing clip window record)')
    }

    if (result.ffmpegCommand) {
      console.log(`  ffmpeg: ${result.ffmpegCommand}`)
    }

    if (result.stderr) {
      console.log(`  stderr: ${result.stderr}`)
    }
  }
}

function buildFfmpegCommand(input: {
  endMs: number
  outputPath: string
  sourcePath: string
  startMs: number
}) {
  return [
    'ffmpeg',
    '-y',
    '-ss',
    formatSeconds(input.startMs),
    '-t',
    formatSeconds(input.endMs - input.startMs),
    '-i',
    shellQuote(input.sourcePath),
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    shellQuote(input.outputPath),
  ].join(' ')
}

function formatSeconds(ms: number) {
  return (ms / 1000).toFixed(3)
}

function formatWindowValue(value: number | null) {
  return value === null ? 'unset' : `${formatSeconds(value)}s`
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
