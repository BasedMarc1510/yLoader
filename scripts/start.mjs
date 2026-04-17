import { spawn } from 'child_process'
import fs from 'fs'
import net from 'net'
import path from 'path'
import process from 'process'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { fileURLToPath } from 'url'
import { loadEnvFile } from './load-env.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')
const BACKEND_DIR = path.join(ROOT_DIR, 'backend')
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend')
const DOWNLOADS_DIR = path.join(ROOT_DIR, 'downloads')
const BACKEND_DATA_DIR = path.join(ROOT_DIR, 'backend-data')
const LOCAL_TOOLS_DIR = path.join(ROOT_DIR, '.tools')
const LOCAL_YTDLP_DIR = path.join(LOCAL_TOOLS_DIR, 'yt-dlp-bin')
const LOCAL_NPM_CACHE_DIR = path.join(LOCAL_TOOLS_DIR, 'npm-cache')
const LOCAL_FFMPEG_DIR = path.join(LOCAL_TOOLS_DIR, 'ffmpeg-bin')
const ROOT_ENV = loadEnvFile(path.join(ROOT_DIR, '.env'))
const IS_WINDOWS = process.platform === 'win32'
const NPM_CMD = IS_WINDOWS ? 'cmd.exe' : 'npm'
const FFMPEG_BINARY_NAME = IS_WINDOWS ? 'ffmpeg.exe' : 'ffmpeg'
const FFPROBE_BINARY_NAME = IS_WINDOWS ? 'ffprobe.exe' : 'ffprobe'
const YTDLP_URLS = {
  win32: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
  linuxX64: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux',
  linuxArm64: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64',
  darwin: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos',
}
const FFMPEG_RELEASE_SOURCE = Object.freeze({ owner: 'eugeneware', repo: 'ffmpeg-static' })
const FFMPEG_RELEASE_ASSET_MAP = Object.freeze({
  win32: Object.freeze({ x64: 'win32-x64' }),
  linux: Object.freeze({ x64: 'linux-x64', arm64: 'linux-arm64' }),
  darwin: Object.freeze({ x64: 'darwin-x64', arm64: 'darwin-arm64' }),
})
const DEFAULT_YTDLP_CANDIDATES = IS_WINDOWS
  ? ['yt-dlp.exe', 'yt-dlp']
  : ['yt-dlp', '/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp']
const CLI_ARGS = new Set(process.argv.slice(2))
const PREPARE_ONLY = CLI_ARGS.has('--prepare-only')

function info(message) {
  process.stdout.write(`[yloader] ${message}\n`)
}

function warn(message) {
  process.stdout.write(`[yloader] WARN: ${message}\n`)
}

function fail(message) {
  process.stderr.write(`[yloader] ERROR: ${message}\n`)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function streamWithPrefix(stream, prefix, target) {
  let buffer = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    buffer += chunk
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      target.write(`[${prefix}] ${line}\n`)
    }
  })
  stream.on('end', () => {
    if (buffer.trim().length > 0) {
      target.write(`[${prefix}] ${buffer}\n`)
    }
  })
}

function runCommand(command, args, options = {}) {
  const {
    cwd = ROOT_DIR,
    env = process.env,
    prefix = 'setup',
    captureOutput = false,
  } = options

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })

    let stdout = ''
    let stderr = ''

    child.on('error', (error) => {
      reject(error)
    })

    if (captureOutput) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })
    } else {
      streamWithPrefix(child.stdout, prefix, process.stdout)
      streamWithPrefix(child.stderr, prefix, process.stderr)
    }

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        const output = (stderr || stdout || '').trim()
        const tail = output
          ? `\n${output.split(/\r?\n/).slice(-8).join('\n')}`
          : ''
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}.${tail}`))
      }
    })
  })
}

function npmArgs(args) {
  return IS_WINDOWS ? ['/d', '/s', '/c', 'npm', ...args] : args
}

function sanitizeEnv(rawEnv) {
  const sanitized = {}
  for (const [key, value] of Object.entries(rawEnv || {})) {
    if (!key || key.startsWith('=') || key.includes('\0')) continue
    if (value === undefined || value === null) continue
    sanitized[key] = String(value)
  }
  return sanitized
}

function prependToPath(envObj, entryPath) {
  if (!entryPath) return

  const pathKey = Object.keys(envObj).find((k) => k.toLowerCase() === 'path') || 'PATH'
  const current = String(envObj[pathKey] || '')
  const nextValue = current ? `${entryPath}${path.delimiter}${current}` : entryPath

  envObj[pathKey] = nextValue
  if (pathKey !== 'PATH') envObj.PATH = nextValue
  if (IS_WINDOWS && pathKey !== 'Path') envObj.Path = nextValue
}

function findFileByBasename(rootDir, candidateNames) {
  const expected = new Set(candidateNames.map((n) => String(n).toLowerCase()))
  const stack = [rootDir]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue

    let entries = []
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (expected.has(entry.name.toLowerCase())) {
        return fullPath
      }
    }
  }

  return ''
}

async function extractArchive(archivePath, destinationPath, archiveType) {
  fs.mkdirSync(destinationPath, { recursive: true })

  if (archiveType === 'zip') {
    try {
      await runCommand('tar', ['-xf', archivePath, '-C', destinationPath], { prefix: 'ffmpeg:extract' })
      return
    } catch {
      // continue to fallbacks
    }

    try {
      await runCommand('unzip', ['-o', archivePath, '-d', destinationPath], { prefix: 'ffmpeg:extract' })
      return
    } catch {
      // continue to fallbacks
    }

    try {
      await runCommand('python3', ['-c', 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', archivePath, destinationPath], {
        prefix: 'ffmpeg:extract',
      })
      return
    } catch {
      // continue to error
    }

    throw new Error('Could not extract zip archive (requires tar, unzip, or python3).')
  }

  if (archiveType === 'tar.xz') {
    try {
      await runCommand('tar', ['-xJf', archivePath, '-C', destinationPath], { prefix: 'ffmpeg:extract' })
      return
    } catch {
      await runCommand('tar', ['-xf', archivePath, '-C', destinationPath], { prefix: 'ffmpeg:extract' })
      return
    }
  }

  throw new Error(`Unsupported archive type: ${archiveType}`)
}

async function ensurePortFree(port, serviceName) {
  await new Promise((resolve, reject) => {
    const tester = net.createServer()

    tester.once('error', (error) => {
      if (error && error.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use. Stop the existing process before starting ${serviceName}.`))
        return
      }
      reject(error)
    })

    tester.once('listening', () => {
      tester.close(() => resolve())
    })

    tester.listen(port, '127.0.0.1')
  })
}

async function ensureNodeDependencies(projectDir, label) {
  const nodeModules = path.join(projectDir, 'node_modules')
  if (fs.existsSync(nodeModules)) {
    info(`${label}: dependencies already installed.`)
    return
  }

  const lockFile = path.join(projectDir, 'package-lock.json')
  const installArgs = fs.existsSync(lockFile)
    ? ['ci', '--no-audit', '--no-fund']
    : ['install', '--no-audit', '--no-fund']
  const installEnv = sanitizeEnv({
    ...process.env,
    npm_config_cache: LOCAL_NPM_CACHE_DIR,
    NPM_CONFIG_CACHE: LOCAL_NPM_CACHE_DIR,
  })

  fs.mkdirSync(LOCAL_NPM_CACHE_DIR, { recursive: true })

  info(`${label}: installing dependencies (${installArgs[0]})...`)
  await runCommand(NPM_CMD, npmArgs(installArgs), {
    cwd: projectDir,
    env: installEnv,
    prefix: `${label}:install`,
  })
}

function getYtDlpAsset() {
  if (process.platform === 'win32') {
    return { url: YTDLP_URLS.win32, fileName: 'yt-dlp.exe' }
  }

  if (process.platform === 'darwin') {
    return { url: YTDLP_URLS.darwin, fileName: 'yt-dlp' }
  }

  if (process.platform === 'linux') {
    if (process.arch === 'x64') {
      return { url: YTDLP_URLS.linuxX64, fileName: 'yt-dlp' }
    }
    if (process.arch === 'arm64') {
      return { url: YTDLP_URLS.linuxArm64, fileName: 'yt-dlp' }
    }
    throw new Error(`Unsupported Linux architecture for automatic yt-dlp binary download: ${process.arch}`)
  }

  throw new Error(`Unsupported platform for automatic yt-dlp binary download: ${process.platform}`)
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`Download failed with HTTP ${response.status}`)
  }

  const tmpPath = `${destinationPath}.tmp`

  try {
    await pipeline(
      Readable.fromWeb(response.body),
      fs.createWriteStream(tmpPath)
    )
    fs.renameSync(tmpPath, destinationPath)
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
    } catch {
      // ignore cleanup errors
    }
    throw err
  }
}

async function ensureLocalYtDlp() {
  info('yt-dlp: project-local mode enabled (.tools/yt-dlp-bin).')

  const asset = getYtDlpAsset()
  fs.mkdirSync(LOCAL_YTDLP_DIR, { recursive: true })

  const ytDlpPath = path.join(LOCAL_YTDLP_DIR, asset.fileName)

  if (fs.existsSync(ytDlpPath)) {
    try {
      const { stdout } = await runCommand(ytDlpPath, ['--version'], { captureOutput: true })
      info(`yt-dlp: using local cached binary (version ${stdout.trim()}).`)
      return { ytDlpPath, suggestedUpdateMethod: 'self' }
    } catch {
      warn('yt-dlp: local cached binary is invalid, re-downloading...')
    }
  }

  info(`yt-dlp: downloading binary for ${process.platform}/${process.arch}...`)
  await downloadFile(asset.url, ytDlpPath)

  if (!IS_WINDOWS) {
    fs.chmodSync(ytDlpPath, 0o755)
  }

  const { stdout } = await runCommand(ytDlpPath, ['--version'], { captureOutput: true })
  info(`yt-dlp: ready (version ${stdout.trim()}).`)

  return { ytDlpPath, suggestedUpdateMethod: 'self' }
}

function getLocalFfmpegPaths() {
  const platformDir = path.join(LOCAL_FFMPEG_DIR, `${process.platform}-${process.arch}`)
  const binDir = path.join(platformDir, 'bin')

  return {
    platformDir,
    binDir,
    ffmpegPath: path.join(binDir, FFMPEG_BINARY_NAME),
    ffprobePath: path.join(binDir, FFPROBE_BINARY_NAME),
  }
}

function getGitHubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'yLoader-bootstrap',
  }

  const token = String(process.env.GITHUB_API_TOKEN || '').trim()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  return headers
}

async function fetchLatestGitHubRelease(owner, repo) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
    headers: getGitHubHeaders(),
  })
  if (!response.ok) {
    throw new Error(`GitHub releases API returned ${response.status} for ${owner}/${repo}`)
  }
  const payload = await response.json()
  if (!payload || typeof payload !== 'object') {
    throw new Error(`GitHub releases API returned an invalid payload for ${owner}/${repo}`)
  }
  return payload
}

function getFfmpegAssetKey(platform = process.platform, arch = process.arch) {
  const byPlatform = FFMPEG_RELEASE_ASSET_MAP[platform]
  if (!byPlatform) return ''
  return byPlatform[arch] || ''
}

async function getFfmpegAssetsFromLatestRelease() {
  const assetKey = getFfmpegAssetKey(process.platform, process.arch)
  if (!assetKey) {
    throw new Error(`Unsupported platform/architecture for ffmpeg bootstrap: ${process.platform}/${process.arch}`)
  }

  const release = await fetchLatestGitHubRelease(FFMPEG_RELEASE_SOURCE.owner, FFMPEG_RELEASE_SOURCE.repo)
  const assets = Array.isArray(release?.assets) ? release.assets : []
  const ffmpegAssetName = `ffmpeg-${assetKey}`
  const ffprobeAssetName = `ffprobe-${assetKey}`
  const ffmpegAsset = assets.find((entry) => String(entry?.name || '').trim() === ffmpegAssetName)
  const ffprobeAsset = assets.find((entry) => String(entry?.name || '').trim() === ffprobeAssetName)

  if (!ffmpegAsset || !ffprobeAsset) {
    throw new Error(`Release ${release?.tag_name || 'latest'} is missing ${ffmpegAssetName} or ${ffprobeAssetName}`)
  }

  return {
    releaseTag: String(release?.tag_name || '').trim(),
    releaseName: String(release?.name || '').trim(),
    ffmpegAssetName,
    ffprobeAssetName,
    ffmpegUrl: String(ffmpegAsset?.browser_download_url || '').trim(),
    ffprobeUrl: String(ffprobeAsset?.browser_download_url || '').trim(),
  }
}

function getFfmpegReleaseMetadataPath(localPaths) {
  return path.join(localPaths.binDir, '.yloader-ffmpeg-release.json')
}

function writeFfmpegReleaseMetadata(localPaths, metadata) {
  const metadataPath = getFfmpegReleaseMetadataPath(localPaths)
  const payload = {
    releaseTag: String(metadata?.releaseTag || '').trim(),
    releaseName: String(metadata?.releaseName || '').trim(),
    ffmpegAssetName: String(metadata?.ffmpegAssetName || '').trim(),
    ffprobeAssetName: String(metadata?.ffprobeAssetName || '').trim(),
    installedAt: Date.now(),
  }

  fs.writeFileSync(metadataPath, JSON.stringify(payload, null, 2))
}

async function ensureLocalFfmpeg() {
  info('ffmpeg: project-local mode enabled (.tools/ffmpeg-bin).')

  const localPaths = getLocalFfmpegPaths()
  fs.mkdirSync(localPaths.binDir, { recursive: true })

  const hasCachedFfmpeg = fs.existsSync(localPaths.ffmpegPath)
  const hasCachedFfprobe = fs.existsSync(localPaths.ffprobePath)

  if (hasCachedFfmpeg && hasCachedFfprobe) {
    try {
      const { stdout } = await runCommand(localPaths.ffmpegPath, ['-version'], { captureOutput: true })
      const firstLine = String(stdout || '').split(/\r?\n/).find(Boolean) || 'ffmpeg'
      info(`ffmpeg: using local cached binaries (${firstLine}).`)
      return {
        ffmpegPath: localPaths.ffmpegPath,
        ffprobePath: localPaths.ffprobePath,
        pathEntry: localPaths.binDir,
      }
    } catch {
      warn('ffmpeg: local cached binaries are invalid, re-downloading...')
    }
  }

  const releaseAssets = await getFfmpegAssetsFromLatestRelease()
  const ffmpegTmpPath = `${localPaths.ffmpegPath}.tmp`
  const ffprobeTmpPath = `${localPaths.ffprobePath}.tmp`

  try {
    info(`ffmpeg: downloading ${releaseAssets.ffmpegAssetName} from GitHub releases...`)
    await downloadFile(releaseAssets.ffmpegUrl, ffmpegTmpPath)

    info(`ffmpeg: downloading ${releaseAssets.ffprobeAssetName} from GitHub releases...`)
    await downloadFile(releaseAssets.ffprobeUrl, ffprobeTmpPath)

    if (!IS_WINDOWS) {
      fs.chmodSync(ffmpegTmpPath, 0o755)
      fs.chmodSync(ffprobeTmpPath, 0o755)
    }

    if (fs.existsSync(localPaths.ffmpegPath)) {
      fs.unlinkSync(localPaths.ffmpegPath)
    }
    if (fs.existsSync(localPaths.ffprobePath)) {
      fs.unlinkSync(localPaths.ffprobePath)
    }

    fs.renameSync(ffmpegTmpPath, localPaths.ffmpegPath)
    fs.renameSync(ffprobeTmpPath, localPaths.ffprobePath)

    writeFfmpegReleaseMetadata(localPaths, releaseAssets)

    const { stdout } = await runCommand(localPaths.ffmpegPath, ['-version'], { captureOutput: true })
    const firstLine = String(stdout || '').split(/\r?\n/).find(Boolean) || 'ffmpeg'
    info(`ffmpeg: ready (${firstLine}).`)

    return {
      ffmpegPath: localPaths.ffmpegPath,
      ffprobePath: localPaths.ffprobePath,
      pathEntry: localPaths.binDir,
    }
  } catch (err) {
    try {
      if (fs.existsSync(ffmpegTmpPath)) fs.unlinkSync(ffmpegTmpPath)
    } catch {
      // ignore cleanup errors
    }

    try {
      if (fs.existsSync(ffprobeTmpPath)) fs.unlinkSync(ffprobeTmpPath)
    } catch {
      // ignore cleanup errors
    }

    throw new Error(`ffmpeg bootstrap failed on ${process.platform}/${process.arch}. ${err?.message || err}`)
  }
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(url)
      if (response.ok || response.status < 500) {
        return true
      }
    } catch {
      // service not ready yet
    }

    // eslint-disable-next-line no-await-in-loop
    await delay(1000)
  }

  return false
}

function startService(name, cwd, args, env) {
  const child = spawn(NPM_CMD, npmArgs(args), {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  streamWithPrefix(child.stdout, name, process.stdout)
  streamWithPrefix(child.stderr, name, process.stderr)

  return child
}

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 18) {
    throw new Error(`Node.js 18 or newer is required (current: ${process.versions.node}).`)
  }

  info('Preparing local development stack...')

  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true })
  fs.mkdirSync(BACKEND_DATA_DIR, { recursive: true })
  fs.mkdirSync(LOCAL_TOOLS_DIR, { recursive: true })

  if (!PREPARE_ONLY) {
    await ensurePortFree(4000, 'backend')
    await ensurePortFree(5173, 'frontend')
  }

  await ensureNodeDependencies(BACKEND_DIR, 'backend')
  await ensureNodeDependencies(FRONTEND_DIR, 'frontend')

  const { ytDlpPath, suggestedUpdateMethod } = await ensureLocalYtDlp()
  const ffmpegSetup = await ensureLocalFfmpeg()

  const sharedEnv = sanitizeEnv({
    ...ROOT_ENV,
    ...process.env,
    DB_PATH: path.join(BACKEND_DATA_DIR, 'metadata.db'),
    DOWNLOAD_DIR: DOWNLOADS_DIR,
  })

  const runtimeTarget = String(sharedEnv.YLOADER_RUNTIME_TARGET || '').trim().toLowerCase()
  if (runtimeTarget === 'electron') {
    sharedEnv.YLOADER_RUNTIME_TARGET = 'electron'
    sharedEnv.YLOADER_ALLOW_BROWSER_COOKIE_IMPORT = '1'
  } else {
    sharedEnv.YLOADER_RUNTIME_TARGET = 'server'
    sharedEnv.YLOADER_ALLOW_BROWSER_COOKIE_IMPORT = '0'
  }

  sharedEnv.YT_DLP_PATH = ytDlpPath
  sharedEnv.YT_DLP_UPDATE_METHOD = suggestedUpdateMethod || 'self'
  sharedEnv.YT_DLP_MANAGED_BY_YLOADER = '1'
  sharedEnv.FFMPEG_PATH = ffmpegSetup.ffmpegPath
  sharedEnv.FFMPEG_MANAGED_BY_YLOADER = '1'
  if (ffmpegSetup.ffprobePath) {
    sharedEnv.FFPROBE_PATH = ffmpegSetup.ffprobePath
  }
  prependToPath(sharedEnv, ffmpegSetup.pathEntry)

  if (PREPARE_ONLY) {
    info('Preparation completed. Local dependencies and tool binaries are ready.')
    return
  }

  info('Starting backend and frontend...')

  const backend = startService('backend', BACKEND_DIR, ['start'], sharedEnv)
  const frontend = startService('frontend', FRONTEND_DIR, ['run', 'dev'], sanitizeEnv({
    ...sharedEnv,
    VITE_BACKEND_URL: 'http://localhost:4000',
  }))

  const children = [
    { name: 'backend', proc: backend },
    { name: 'frontend', proc: frontend },
  ]

  let shuttingDown = false
  const shutdown = (exitCode) => {
    if (shuttingDown) return
    shuttingDown = true

    info('Stopping services...')
    for (const child of children) {
      if (child.proc.exitCode === null) {
        try {
          child.proc.kill('SIGTERM')
        } catch {
          // ignore termination errors
        }
      }
    }

    setTimeout(() => process.exit(exitCode), 300)
  }

  for (const child of children) {
    child.proc.on('exit', (code, signal) => {
      if (shuttingDown) return
      fail(`${child.name} exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'none'}).`)
      shutdown(code && code > 0 ? code : 1)
    })
  }

  process.on('SIGINT', () => shutdown(0))
  process.on('SIGTERM', () => shutdown(0))

  info('Waiting for services to become reachable...')
  const backendReady = await waitForHttp('http://127.0.0.1:4000/health', 90000)
  const frontendReady = await waitForHttp('http://127.0.0.1:5173', 90000)

  if (!backendReady) {
    warn('Backend health endpoint did not become ready in time.')
  }
  if (!frontendReady) {
    warn('Frontend did not become ready in time.')
  }

  process.stdout.write('\n')
  info('Local stack is running.')
  process.stdout.write('  Frontend: http://localhost:5173\n')
  process.stdout.write('  Backend : http://localhost:4000\n')
  process.stdout.write('  Health  : http://localhost:4000/health\n')
  process.stdout.write('  Stop    : Ctrl+C\n\n')
}

main().catch((error) => {
  fail(error.message || String(error))
  process.exit(1)
})
