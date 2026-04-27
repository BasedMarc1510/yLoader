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
const FRONTEND_VITE_CLI = path.join(FRONTEND_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
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
const SKIP_TOOLS = CLI_ARGS.has('--skip-tools')
const DEFAULT_BACKEND_PORT = 4000
const DEFAULT_FRONTEND_PORT = 5173

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

function parsePortValue(rawValue) {
  const normalized = String(rawValue ?? '').trim()
  if (!normalized) return NaN
  if (!/^\d+$/.test(normalized)) return NaN

  const parsed = Number.parseInt(normalized, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return NaN
  return parsed
}

function resolveRuntimePort(envName, fallbackPort, serviceName) {
  const rawValue = process.env[envName]
  if (rawValue === undefined) {
    return {
      port: fallbackPort,
      explicit: false,
    }
  }

  const parsed = parsePortValue(rawValue)
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid ${envName} value for ${serviceName}: "${String(rawValue)}". Expected an integer between 1 and 65535.`)
  }

  return {
    port: parsed,
    explicit: true,
  }
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
  const hostsToCheck = [
    { host: undefined, label: 'default' },
    { host: '127.0.0.1', label: 'IPv4' },
    { host: '::1', label: 'IPv6' },
  ]

  for (const entry of hostsToCheck) {
    const result = await new Promise((resolve, reject) => {
      const tester = net.createServer()

      tester.once('error', (error) => {
        if (error && error.code === 'EADDRINUSE') {
          resolve({ available: false })
          return
        }

        // Some hosts (especially ::1 on specific runners) may be unavailable.
        if (error && error.code === 'EADDRNOTAVAIL') {
          resolve({ available: true })
          return
        }

        reject(error)
      })

      tester.once('listening', () => {
        tester.close(() => resolve({ available: true }))
      })

      if (entry.host) {
        tester.listen(port, entry.host)
      } else {
        tester.listen(port)
      }
    })

    if (!result.available) {
      throw new Error(`Port ${port} is already in use (${entry.label}). Stop the existing process before starting ${serviceName}.`)
    }
  }
}

async function findAvailablePort(startPort, serviceName) {
  const maxAttempts = 200

  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = startPort + offset
    if (candidate > 65535) break

    try {
      // eslint-disable-next-line no-await-in-loop
      await ensurePortFree(candidate, serviceName)
      return candidate
    } catch (error) {
      const message = String(error?.message || '')
      if (!message.includes('already in use')) {
        throw error
      }
    }
  }

  throw new Error(`Could not find a free port for ${serviceName} starting from ${startPort}.`)
}

function getDeclaredPackageNames(projectDir) {
  const packageJsonPath = path.join(projectDir, 'package.json')
  const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  const dependencyNames = Object.keys(manifest.dependencies || {})
  const devDependencyNames = Object.keys(manifest.devDependencies || {})

  return [...new Set([...dependencyNames, ...devDependencyNames])]
}

function getMissingDeclaredPackages(projectDir) {
  const nodeModulesDir = path.join(projectDir, 'node_modules')
  if (!fs.existsSync(nodeModulesDir)) {
    return getDeclaredPackageNames(projectDir)
  }

  return getDeclaredPackageNames(projectDir).filter((packageName) => {
    const packagePath = path.join(nodeModulesDir, ...packageName.split('/'), 'package.json')
    return !fs.existsSync(packagePath)
  })
}

async function ensureNodeDependencies(projectDir, label) {
  const missingPackages = getMissingDeclaredPackages(projectDir)
  if (missingPackages.length === 0) {
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

  if (missingPackages.length > 0) {
    const preview = missingPackages.slice(0, 4).join(', ')
    const suffix = missingPackages.length > 4 ? ` (+${missingPackages.length - 4} more)` : ''
    info(`${label}: refreshing dependencies because packages are missing (${preview}${suffix}).`)
  }

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

async function requestHttpText(url, timeoutMs = 1500) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  timeout.unref?.()

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    })

    return {
      ok: true,
      statusCode: Number(response.status || 0),
      body: await response.text(),
    }
  } catch {
    return { ok: false, statusCode: 0, body: '' }
  } finally {
    clearTimeout(timeout)
  }
}

async function isYLoaderBackendRunning(healthUrl, timeoutMs = 1500) {
  const probe = await requestHttpText(healthUrl, timeoutMs)
  if (!probe.ok || !probe.body) return false

  try {
    const payload = JSON.parse(probe.body)
    const checks = payload?.checks

    return Boolean(
      payload
      && typeof payload.status === 'string'
      && checks
      && typeof checks === 'object'
      && typeof checks.db === 'boolean'
      && typeof checks.ytDlp === 'boolean'
    )
  } catch {
    return false
  }
}

async function waitForHttp(url, timeoutMs, options = {}) {
  const { accept } = options
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(url)
      const isAccepted = typeof accept === 'function'
        ? Boolean(accept(response))
        : (response.ok || response.status < 500)

      if (isAccepted) {
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

function startService(name, cwd, command, args, env) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  streamWithPrefix(child.stdout, name, process.stdout)
  streamWithPrefix(child.stderr, name, process.stderr)

  return child
}

function waitForChildExit(child, timeoutMs = 2500) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) {
      resolve()
      return
    }

    const timeout = setTimeout(resolve, timeoutMs)
    timeout.unref?.()

    child.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}

async function terminateServiceProcess(service) {
  const child = service?.proc
  if (!child || child.exitCode !== null) return

  if (IS_WINDOWS && child.pid) {
    try {
      await runCommand('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        captureOutput: true,
      })
    } catch {
      try {
        child.kill('SIGTERM')
      } catch {
        // ignore termination errors
      }
    }

    await waitForChildExit(child, 1800)
    return
  }

  try {
    child.kill('SIGTERM')
  } catch {
    // ignore termination errors
  }

  await waitForChildExit(child, 1800)

  if (child.exitCode === null) {
    try {
      child.kill('SIGKILL')
    } catch {
      // ignore termination errors
    }
    await waitForChildExit(child, 1200)
  }
}

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 18) {
    throw new Error(`Node.js 18 or newer is required (current: ${process.versions.node}).`)
  }

  if (SKIP_TOOLS && !PREPARE_ONLY) {
    throw new Error('--skip-tools can only be used together with --prepare-only.')
  }

  info('Preparing local development stack...')

  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true })
  fs.mkdirSync(BACKEND_DATA_DIR, { recursive: true })
  fs.mkdirSync(LOCAL_TOOLS_DIR, { recursive: true })

  const backendPortConfig = resolveRuntimePort('YLOADER_BACKEND_PORT', DEFAULT_BACKEND_PORT, 'backend')
  const frontendPortConfig = resolveRuntimePort('YLOADER_FRONTEND_PORT', DEFAULT_FRONTEND_PORT, 'frontend')
  let backendPort = backendPortConfig.port
  let frontendPort = frontendPortConfig.port
  let backendHealthUrl = `http://127.0.0.1:${backendPort}/health`
  let frontendUrl = `http://127.0.0.1:${frontendPort}`
  let backendAlreadyRunning = false
  let frontendAlreadyRunning = false

  if (!PREPARE_ONLY) {
    backendAlreadyRunning = await isYLoaderBackendRunning(backendHealthUrl, 1500)
    frontendAlreadyRunning = await waitForHttp(frontendUrl, 1500, {
      accept: (response) => response.ok || response.status < 500,
    })

    if (!backendAlreadyRunning) {
      if (backendPortConfig.explicit) {
        await ensurePortFree(backendPort, 'backend')
      } else {
        backendPort = await findAvailablePort(backendPort, 'backend')
        backendHealthUrl = `http://127.0.0.1:${backendPort}/health`
        if (backendPort !== backendPortConfig.port) {
          info(`Backend port ${backendPortConfig.port} is occupied. Using ${backendPort} instead.`)
        }
      }
    }

    if (!frontendAlreadyRunning) {
      if (frontendPortConfig.explicit) {
        await ensurePortFree(frontendPort, 'frontend')
      } else {
        frontendPort = await findAvailablePort(frontendPort, 'frontend')
        frontendUrl = `http://127.0.0.1:${frontendPort}`
        if (frontendPort !== frontendPortConfig.port) {
          info(`Frontend port ${frontendPortConfig.port} is occupied. Using ${frontendPort} instead.`)
        }
      }
    }
  }

  await ensureNodeDependencies(BACKEND_DIR, 'backend')
  await ensureNodeDependencies(FRONTEND_DIR, 'frontend')

  let ytDlpPath = ''
  let suggestedUpdateMethod = 'self'
  let ffmpegSetup = null

  if (!SKIP_TOOLS) {
    const ytDlp = await ensureLocalYtDlp()
    ytDlpPath = ytDlp.ytDlpPath
    suggestedUpdateMethod = ytDlp.suggestedUpdateMethod || 'self'
    ffmpegSetup = await ensureLocalFfmpeg()
  }

  const sharedEnv = sanitizeEnv({
    ...ROOT_ENV,
    ...process.env,
    DB_PATH: path.join(BACKEND_DATA_DIR, 'metadata.db'),
    DOWNLOAD_DIR: DOWNLOADS_DIR,
  })

  sharedEnv.PORT = String(backendPort)
  sharedEnv.YLOADER_BACKEND_PORT = String(backendPort)
  sharedEnv.YLOADER_FRONTEND_PORT = String(frontendPort)

  const runtimeTarget = String(sharedEnv.YLOADER_RUNTIME_TARGET || '').trim().toLowerCase()
  if (runtimeTarget === 'electron') {
    sharedEnv.YLOADER_RUNTIME_TARGET = 'electron'
    sharedEnv.YLOADER_ALLOW_BROWSER_COOKIE_IMPORT = '1'
  } else {
    sharedEnv.YLOADER_RUNTIME_TARGET = 'server'
    // Local web dev runs on the same machine as the browser profile, so allow
    // yt-dlp browser cookie import here too. Docker/runtime-packaged server
    // builds still control this independently via their own environment.
    sharedEnv.YLOADER_ALLOW_BROWSER_COOKIE_IMPORT = '1'
  }

  if (!SKIP_TOOLS) {
    sharedEnv.YT_DLP_PATH = ytDlpPath
    sharedEnv.YT_DLP_UPDATE_METHOD = suggestedUpdateMethod
    sharedEnv.YT_DLP_MANAGED_BY_YLOADER = '1'
    sharedEnv.FFMPEG_PATH = ffmpegSetup.ffmpegPath
    sharedEnv.FFMPEG_MANAGED_BY_YLOADER = '1'
    if (ffmpegSetup.ffprobePath) {
      sharedEnv.FFPROBE_PATH = ffmpegSetup.ffprobePath
    }
    prependToPath(sharedEnv, ffmpegSetup.pathEntry)
  }

  if (PREPARE_ONLY) {
    if (SKIP_TOOLS) {
      info('Preparation completed. Local dependencies are ready (tool bootstrap skipped).')
    } else {
      info('Preparation completed. Local dependencies and tool binaries are ready.')
    }
    return
  }

  if (backendAlreadyRunning && frontendAlreadyRunning) {
    info('Local stack is already running. Reusing existing backend and frontend.')
  } else if (backendAlreadyRunning || frontendAlreadyRunning) {
    info('Detected existing local services. Starting only missing services...')
  } else {
    info('Starting backend and frontend...')
  }

  if (!fs.existsSync(FRONTEND_VITE_CLI)) {
    throw new Error(`Frontend dev runner not found at ${FRONTEND_VITE_CLI}. Run dependency installation first.`)
  }

  const children = []

  if (backendAlreadyRunning) {
    info(`Reusing existing backend on :${backendPort}.`)
  } else {
    const backend = startService('backend', BACKEND_DIR, process.execPath, ['server.js'], sharedEnv)
    children.push({ name: 'backend', proc: backend })
  }

  if (frontendAlreadyRunning) {
    info(`Reusing existing frontend on :${frontendPort}.`)
  } else {
    const frontend = startService('frontend', FRONTEND_DIR, process.execPath, [FRONTEND_VITE_CLI, '--port', String(frontendPort)], sanitizeEnv({
      ...sharedEnv,
      VITE_BACKEND_URL: `http://localhost:${backendPort}`,
    }))
    children.push({ name: 'frontend', proc: frontend })
  }

  let shuttingDown = false
  let shutdownPromise = null

  const shutdown = async (exitCode) => {
    if (shuttingDown && shutdownPromise) return shutdownPromise
    shuttingDown = true

    shutdownPromise = (async () => {
      info('Stopping services...')

      const forceExitTimer = setTimeout(() => process.exit(exitCode), 6000)
      forceExitTimer.unref?.()

      await Promise.all(children.map((child) => terminateServiceProcess(child)))

      clearTimeout(forceExitTimer)
      process.exit(exitCode)
    })()

    return shutdownPromise
  }

  for (const child of children) {
    child.proc.on('exit', (code, signal) => {
      if (shuttingDown) return
      fail(`${child.name} exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'none'}).`)
      void shutdown(code && code > 0 ? code : 1)
    })
  }

  process.on('SIGINT', () => {
    void shutdown(0)
  })
  process.on('SIGTERM', () => {
    void shutdown(0)
  })

  info('Waiting for services to become reachable...')
  const backendReady = await waitForHttp(backendHealthUrl, 90000, {
    accept: (response) => response.ok,
  })
  const frontendReady = await waitForHttp(frontendUrl, 90000, {
    accept: (response) => response.ok || response.status < 500,
  })

  if (!backendReady) {
    warn('Backend health endpoint did not become ready in time.')
  }
  if (!frontendReady) {
    warn('Frontend did not become ready in time.')
  }

  process.stdout.write('\n')
  info('Local stack is running.')
  process.stdout.write(`  Frontend: http://localhost:${frontendPort}\n`)
  process.stdout.write(`  Backend : http://localhost:${backendPort}\n`)
  process.stdout.write(`  Health  : http://localhost:${backendPort}/health\n`)
  if (children.length > 0) {
    process.stdout.write('  Stop    : Ctrl+C\n\n')
  } else {
    process.stdout.write('\n')
  }
}

main().catch((error) => {
  fail(error.message || String(error))
  process.exit(1)
})
