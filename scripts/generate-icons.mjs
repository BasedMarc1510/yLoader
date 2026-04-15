import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import process from 'process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')
const FRONTEND_PUBLIC_DIR = path.join(ROOT_DIR, 'frontend', 'public')
const BUILD_ICONS_DIR = path.join(ROOT_DIR, 'build', 'icons')
const TMP_DIR = path.join(ROOT_DIR, '.electron-build', '.icon-gen')

const PNG_SIZES = [16, 24, 32, 48, 64, 96, 128, 180, 192, 256, 512, 1024]

function info(message) {
  process.stdout.write(`[icons] ${message}\n`)
}

function fail(message) {
  process.stderr.write(`[icons] ERROR: ${message}\n`)
}

function runMagick(args) {
  const result = spawnSync('magick', args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim()
    const stdout = String(result.stdout || '').trim()
    const details = stderr || stdout || `exit code ${result.status}`
    throw new Error(`magick ${args.join(' ')} failed: ${details}`)
  }
}

function ensureMagickAvailable() {
  const result = spawnSync('magick', ['-version'], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    throw new Error('ImageMagick (magick) is not available in PATH.')
  }
}

function pickSourceSvg() {
  const argIndex = process.argv.indexOf('--source')
  if (argIndex >= 0 && process.argv[argIndex + 1]) {
    const candidate = path.resolve(ROOT_DIR, process.argv[argIndex + 1])
    if (!fs.existsSync(candidate)) {
      throw new Error(`Icon source not found: ${candidate}`)
    }
    return candidate
  }

  const preferred = path.join(FRONTEND_PUBLIC_DIR, 'yloader-icon.svg')
  const fallback = path.join(FRONTEND_PUBLIC_DIR, 'favicon.svg')

  if (fs.existsSync(preferred)) return preferred
  if (fs.existsSync(fallback)) return fallback

  throw new Error('No SVG icon source found. Expected frontend/public/yloader-icon.svg or frontend/public/favicon.svg.')
}

function renderPng(sourceSvgPath, size, outPath) {
  const center = Math.floor(size / 2)
  const basePath = `${outPath}.base.png`

  runMagick([
    sourceSvgPath,
    '-background', 'none',
    '-alpha', 'on',
    '-colorspace', 'sRGB',
    '-resize', `${size}x${size}`,
    '-gravity', 'center',
    '-extent', `${size}x${size}`,
    basePath,
  ])

  // Force transparent corners for round logos while preserving inner white details.
  runMagick([
    basePath,
    '(',
    '-size', `${size}x${size}`,
    'xc:none',
    '-fill', 'white',
    '-draw', `circle ${center},${center} ${center},0`,
    ')',
    '-alpha', 'off',
    '-compose', 'copyopacity',
    '-composite',
    outPath,
  ])

  fs.rmSync(basePath, { force: true })
}

function copyFile(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.copyFileSync(sourcePath, targetPath)
}

function main() {
  ensureMagickAvailable()

  const sourceSvgPath = pickSourceSvg()
  info(`Using source SVG: ${path.relative(ROOT_DIR, sourceSvgPath)}`)

  fs.mkdirSync(TMP_DIR, { recursive: true })
  fs.mkdirSync(BUILD_ICONS_DIR, { recursive: true })

  const rendered = new Map()

  for (const size of PNG_SIZES) {
    const outPath = path.join(TMP_DIR, `icon-${size}.png`)
    renderPng(sourceSvgPath, size, outPath)
    rendered.set(size, outPath)
  }

  // Keep both SVG references aligned for web usage.
  const faviconSvgPath = path.join(FRONTEND_PUBLIC_DIR, 'favicon.svg')
  const yloaderSvgPath = path.join(FRONTEND_PUBLIC_DIR, 'yloader-icon.svg')
  copyFile(sourceSvgPath, faviconSvgPath)
  copyFile(sourceSvgPath, yloaderSvgPath)

  // Web icon assets.
  copyFile(rendered.get(96), path.join(FRONTEND_PUBLIC_DIR, 'favicon-96x96.png'))
  copyFile(rendered.get(180), path.join(FRONTEND_PUBLIC_DIR, 'apple-touch-icon.png'))
  copyFile(rendered.get(192), path.join(FRONTEND_PUBLIC_DIR, 'web-app-manifest-192x192.png'))
  copyFile(rendered.get(512), path.join(FRONTEND_PUBLIC_DIR, 'web-app-manifest-512x512.png'))

  runMagick([
    rendered.get(512),
    '-background', 'none',
    '-define', 'icon:auto-resize=48,32,16',
    path.join(FRONTEND_PUBLIC_DIR, 'favicon.ico'),
  ])

  // Electron app icons.
  copyFile(rendered.get(512), path.join(BUILD_ICONS_DIR, 'icon-512.png'))
  copyFile(rendered.get(1024), path.join(BUILD_ICONS_DIR, 'icon.png'))

  runMagick([
    rendered.get(1024),
    '-background', 'none',
    '-define', 'icon:auto-resize=256,128,64,48,32,24,16',
    path.join(BUILD_ICONS_DIR, 'icon.ico'),
  ])

  runMagick([
    path.join(BUILD_ICONS_DIR, 'icon.png'),
    path.join(BUILD_ICONS_DIR, 'icon.icns'),
  ])

  info('Generated web and Electron icon assets.')
}

try {
  main()
} catch (error) {
  fail(error && error.message ? error.message : String(error))
  process.exit(1)
}
