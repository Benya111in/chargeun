import { spawn } from 'node:child_process'

const pythonCommand = process.env.GENERATOR_PYTHON_BIN?.trim() || 'python3'
const installAttempts = [
  ['-m', 'pip', 'install', '--user', '--upgrade', 'yt-dlp'],
  [
    '-m',
    'pip',
    'install',
    '--break-system-packages',
    '--user',
    '--upgrade',
    'yt-dlp',
  ],
  ['-m', 'pip', 'install', '--break-system-packages', '--upgrade', 'yt-dlp'],
]

async function main() {
  if (await hasYtDlp()) {
    console.log('yt-dlp runtime is ready.')
    return
  }

  console.log('yt-dlp is missing. Installing yt-dlp for the generator runtime.')

  let lastError = ''
  for (const args of installAttempts) {
    const result = await runCommand(pythonCommand, args, {
      inheritOutput: true,
      timeoutMs: 4 * 60 * 1000,
    })

    if (result.ok && (await hasYtDlp())) {
      console.log('yt-dlp runtime install completed.')
      return
    }

    lastError = result.stderr || result.error || `exit ${result.code}`
  }

  throw new Error(
    [
      `Could not install yt-dlp for ${pythonCommand}.`,
      'Render Native Node services need Python pip access, or the service must run with the repository Dockerfile.',
      lastError,
    ]
      .filter(Boolean)
      .join('\n'),
  )
}

async function hasYtDlp() {
  const result = await runCommand(
    pythonCommand,
    ['-m', 'yt_dlp', '--version'],
    {
      timeoutMs: 30_000,
    },
  )

  return result.ok
}

function runCommand(
  command: string,
  args: string[],
  options: {
    inheritOutput?: boolean
    timeoutMs: number
  },
) {
  return new Promise<{
    code: number | null
    error?: string
    ok: boolean
    stderr: string
  }>((resolve) => {
    const child = spawn(command, args, {
      stdio: options.inheritOutput ? 'inherit' : ['ignore', 'ignore', 'pipe'],
    })
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      resolve({
        code: null,
        error: `${command} ${args.slice(0, 3).join(' ')} timed out.`,
        ok: false,
        stderr: '',
      })
    }, options.timeoutMs)
    let settled = false
    let stderr = ''

    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr = `${stderr}${String(chunk)}`.slice(-4000)
      })
    }

    child.on('error', (error) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeout)
      resolve({
        code: null,
        error: error.message,
        ok: false,
        stderr,
      })
    })

    child.on('close', (code) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeout)
      resolve({
        code,
        ok: code === 0,
        stderr,
      })
    })
  })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
