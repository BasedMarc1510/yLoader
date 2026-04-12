import { spawn } from 'child_process'
import fs from 'fs'
import net from 'net'
import path from 'path'
import process from 'process'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { fileURLToPath } from 'url'

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
const IS_WINDOWS = process.platform === 'win32'
const NPM_CMD = IS_WINDOWS ? 'cmd.exe' : 'npm'
const YTDLP_URLS = {
  win32: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
  linuxX64: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux',
  linuxArm64: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64',
  darwin: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos',
}
const DEFAULT_YTDLP_CANDIDATES = IS_WINDOWS
  ? ['yt-dlp.exe', 'yt-dlp']
  : ['yt-dlp', '/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp']

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

function canRun(command, args = []) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
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
  const explicitYtDlpPath = String(process.env.YT_DLP_PATH || '').trim()
  const candidates = explicitYtDlpPath
    ? [explicitYtDlpPath, ...DEFAULT_YTDLP_CANDIDATES]
    : DEFAULT_YTDLP_CANDIDATES

  for (const candidate of candidates) {
    try {
      const { stdout } = await runCommand(candidate, ['--version'], { captureOutput: true })
      const normalizedVersion = stdout.trim()
      info(`yt-dlp: using existing binary at ${candidate}${normalizedVersion ? ` (version ${normalizedVersion})` : ''}.`)
      return { ytDlpPath: candidate, suggestedUpdateMethod: 'disabled' }
    } catch {
      // try next candidate
    }
  }

  const asset = getYtDlpAsset()
  fs.mkdirSync(LOCAL_YTDLP_DIR, { recursive: true })

  const ytDlpPath = path.join(LOCAL_YTDLP_DIR, asset.fileName)
  if (!fs.existsSync(ytDlpPath)) {
    info(`yt-dlp: downloading binary for ${process.platform} because no existing installation was found...`)
    await downloadFile(asset.url, ytDlpPath)
  } else {
    info('yt-dlp: local binary already present.')
  }

  if (!IS_WINDOWS) {
    fs.chmodSync(ytDlpPath, 0o755)
  }

  const { stdout } = await runCommand(ytDlpPath, ['--version'], { captureOutput: true })
  info(`yt-dlp: ready (version ${stdout.trim()}).`)

  return { ytDlpPath, suggestedUpdateMethod: 'self' }
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

  await ensurePortFree(4000, 'backend')
  await ensurePortFree(5173, 'frontend')

  await ensureNodeDependencies(BACKEND_DIR, 'backend')
  await ensureNodeDependencies(FRONTEND_DIR, 'frontend')

  const { ytDlpPath, suggestedUpdateMethod } = await ensureLocalYtDlp()

  const hasFfmpeg = await canRun('ffmpeg', ['-version'])
  if (!hasFfmpeg) {
    warn('ffmpeg is not installed. Media merging/conversion features may be limited.')
  }

  const sharedEnv = sanitizeEnv({
    ...process.env,
    DB_PATH: path.join(BACKEND_DATA_DIR, 'metadata.db'),
    DOWNLOAD_DIR: DOWNLOADS_DIR,
  })

  sharedEnv.YT_DLP_PATH = ytDlpPath
  if (!sharedEnv.YT_DLP_UPDATE_METHOD && suggestedUpdateMethod) {
    sharedEnv.YT_DLP_UPDATE_METHOD = suggestedUpdateMethod
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
