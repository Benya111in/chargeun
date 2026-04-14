import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const main = async () => {
  const root = process.cwd()
  const cacheDir = path.join(root, 'files', 'cache')
  const exportDir = path.join(root, 'files', 'export')
  const demoStateFile = path.join(root, 'data', 'demo', 'last-session.json')

  await rm(cacheDir, { recursive: true, force: true })
  await rm(exportDir, { recursive: true, force: true })
  await mkdir(cacheDir, { recursive: true })
  await mkdir(exportDir, { recursive: true })

  await writeFile(
    demoStateFile,
    JSON.stringify(
      {
        resetAt: Date.now(),
        note: 'Demo state reset for AnsimTrack Live',
      },
      null,
      2,
    ),
  )

  console.log('Demo cache and export state were reset.')
}

void main()
