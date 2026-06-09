#!/usr/bin/env node

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const __filename = fileURLToPath(import.meta.url)
const outputDir = path.resolve(path.dirname(__filename), '..')
const repoRoot = path.resolve(outputDir, '..', '..')
const posterUrl = pathToFileURL(path.join(outputDir, 'poster.html')).href
const runtimeNodeModules = path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules')
const require = createRequire(import.meta.url)
const execFileAsync = promisify(execFile)

async function importPackage(name) {
  const resolved = require.resolve(name, {
    paths: [
      path.join(repoRoot, 'apps', 'desktop-ui', 'node_modules'),
      path.join(repoRoot, 'node_modules'),
      runtimeNodeModules,
    ],
  })
  return import(pathToFileURL(resolved).href)
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function render(chromium, sharp) {
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
  })
  const page = await browser.newPage()
  await page.goto(`${posterUrl}?mode=digital`, { waitUntil: 'load' })
  await page.emulateMedia({ media: 'print' })
  const digitalPdfPath = path.join(outputDir, 'poster-a1-digital.pdf')
  await page.pdf({
    path: digitalPdfPath,
    width: '594mm',
    height: '841mm',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    preferCSSPageSize: false,
  })
  await page.goto(`${posterUrl}?mode=print`, { waitUntil: 'load' })
  await page.emulateMedia({ media: 'print' })
  await page.pdf({
    path: path.join(outputDir, 'poster-a1-print-bleed.pdf'),
    width: '600mm',
    height: '847mm',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    preferCSSPageSize: false,
  })
  await browser.close()

  const pngBase = path.join(outputDir, 'poster-a1-300ppi')
  const pngPath = path.join(outputDir, 'poster-a1-300ppi.png')
  const cairoOutputPath = path.join(outputDir, 'poster-a1-300ppi-1.png')
  await fs.rm(pngPath, { force: true })
  await fs.rm(cairoOutputPath, { force: true })
  await execFileAsync('/opt/homebrew/bin/pdftocairo', ['-png', '-r', '300', digitalPdfPath, pngBase])
  const rasterSourcePath = await exists(cairoOutputPath) ? cairoOutputPath : pngPath
  const resizedPngPath = path.join(outputDir, 'poster-a1-300ppi-resized.png')
  await fs.rm(resizedPngPath, { force: true })
  await sharp(rasterSourcePath)
    .resize(7016, 9933, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toFile(resizedPngPath)
  await fs.rename(resizedPngPath, pngPath)
  await fs.rm(cairoOutputPath, { force: true })
  await sharp(pngPath)
    .resize(1200, 1699, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(outputDir, 'poster-preview-screen.png'))
}

async function imageMeta(sharp, filePath) {
  const meta = await sharp(filePath).metadata()
  const stat = await fs.stat(filePath)
  return { path: filePath, width: meta.width, height: meta.height, format: meta.format, bytes: stat.size }
}

async function writeManifest(sharp) {
  const files = [
    'poster-a1-digital.pdf',
    'poster-a1-print-bleed.pdf',
    'poster-a1-300ppi.png',
    'poster-preview-screen.png',
  ]
  const outputs = []
  for (const name of files) {
    const filePath = path.join(outputDir, name)
    if (await exists(filePath)) {
      const stat = await fs.stat(filePath)
      outputs.push({ name, path: filePath, bytes: stat.size })
    }
  }
  const images = []
  for (const name of ['poster-a1-300ppi.png', 'poster-preview-screen.png']) {
    const filePath = path.join(outputDir, name)
    if (await exists(filePath)) images.push(await imageMeta(sharp, filePath))
  }
  await fs.writeFile(
    path.join(outputDir, 'asset-manifest.json'),
    `${JSON.stringify({
      createdAt: new Date().toISOString(),
      posterSpec: {
        digital: { widthMm: 594, heightMm: 841 },
        printBleed: { widthMm: 600, heightMm: 847, bleedMm: 3 },
        png: { widthPx: 7016, heightPx: 9933, targetPpi: 300 },
      },
      screenshots: [],
      outputs,
      images,
      notes: [
        'Poster art is rebuilt with code-native HTML/CSS shapes and gradients; no generated concept image is used as a background.',
        'The mint/cyan cinematic infographic reference is used only as visual direction for layout, depth, ribbons, panels, and icon language.',
        'No link slot or screenshot capture is included in this version.',
      ],
    }, null, 2)}\n`,
  )
}

async function main() {
  const playwrightModule = await importPackage('playwright')
  const playwright = playwrightModule.default || playwrightModule
  const sharpModule = await importPackage('sharp')
  const sharp = sharpModule.default || sharpModule
  await render(playwright.chromium, sharp)
  await writeManifest(sharp)
  console.log(`Poster v9 outputs written to ${outputDir}`)
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error))
  process.exit(1)
})
