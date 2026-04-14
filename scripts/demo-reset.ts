import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const main = async () => {
  const root = process.cwd()
  const demoDir = path.join(root, 'data', 'demo')
  const cacheDir = path.join(root, 'files', 'cache')
  const exportDir = path.join(root, 'files', 'export')
  const demoStateFile = path.join(demoDir, 'last-session.json')

  await rm(cacheDir, { recursive: true, force: true })
  await rm(exportDir, { recursive: true, force: true })
  await mkdir(cacheDir, { recursive: true })
  await mkdir(exportDir, { recursive: true })
  await mkdir(demoDir, { recursive: true })

  await writeFile(
    demoStateFile,
    `${JSON.stringify(
      {
        demoMode: 'live-priority',
        resetAt: Date.now(),
        selectedBackupSessionId: null,
        selectedScenarioId: 'grounded-fire',
        note: 'Demo state reset for AnsimTrack Live',
      },
      null,
      2,
    )}\n`,
  )

  console.log('Demo cache and export state were reset.')
}

void main()
