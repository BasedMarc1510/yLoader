import { spawn } from 'child_process'
import { createRequire } from 'module'
import fs from 'fs'
import http from 'http'
import net from 'net'
import os from 'os'
import path from 'path'
import process from 'process'
import { fileURLToPath } from 'url'
import { loadEnvFile } from './load-env.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')
const IS_WINDOWS = process.platform === 'win32'
const NPM_CMD = IS_WINDOWS ? 'cmd.exe' : 'npm'
const CLI_ARGS = new Set(process.argv.slice(2))
const CLEAR_RUNTIME_STATE = CLI_ARGS.has('--clear')
const require = createRequire(import.meta.url)
const ELECTRON_BINARY = require('electron')
const ELECTRON_INSTALL_SCRIPT = path.join(ROOT_DIR, 'node_modules', 'electron', 'install.js')
const YTDLP_BINARY_NAME = IS_WINDOWS ? 'yt-dlp.exe' : 'yt-dlp'
const FFMPEG_BINARY_NAME = IS_WINDOWS ? 'ffmpeg.exe' : 'ffmpeg'
const FFPROBE_BINARY_NAME = IS_WINDOWS ? 'ffprobe.exe' : 'ffprobe'
const ROOT_ENV = loadEnvFile(path.join(ROOT_DIR, '.env'))

function info(message) {
  process.stdout.write(`[electron-dev] ${message}\n`)
}

function fail(message) {
  process.stderr.write(`[electron-dev] ERROR: ${message}\n`)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function npmArgs(args) {
  return IS_WINDOWS ? ['/d', '/s', '/c', 'npm', ...args] : args
}

function streamWithPrefix(stream, prefix, target) {
  if (!stream) return
  let buffer = ''

  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    buffer += chunk
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''
    for (const line of lines) {
      target.write(`[${prefix}] ${line}\n`)
    }
  })

  stream.on('end', () => {
    if (buffer.trim()) {
      target.write(`[${prefix}] ${buffer}\n`)
    }
  })
}

function resolveElectronUserDataDir() {
  if (IS_WINDOWS) {
    const appData = String(process.env.APPDATA || '').trim() || path.join(os.homedir(), 'AppData', 'Roaming')
    return path.join(appData, 'yLoader')
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'yLoader')
  }

  const xdgConfigHome = String(process.env.XDG_CONFIG_HOME || '').trim() || path.join(os.homedir(), '.config')
  return path.join(xdgConfigHome, 'yLoader')
}

function removeDirectoryIfExists(directoryPath, label) {
  const target = String(directoryPath || '').trim()
  if (!target || !fs.existsSync(target)) return false

  fs.rmSync(target, { recursive: true, force: true })
  info(`Cleared ${label}: ${target}`)
  return true
}

function prependToPath(envObj, entryPath) {
  if (!entryPath) return

  const key = Object.keys(envObj).find((item) => item.toLowerCase() === 'path') || 'PATH'
  const current = String(envObj[key] || '')
  const next = current ? `${entryPath}${path.delimiter}${current}` : entryPath
  envObj[key] = next
  if (key !== 'PATH') envObj.PATH = next
  if (IS_WINDOWS && key !== 'Path') envObj.Path = next
}

function buildSharedServiceEnv() {
  const env = { ...ROOT_ENV, ...process.env }
  const toolsRoot = path.join(ROOT_DIR, '.tools')
  const ytdlpPath = path.join(toolsRoot, 'yt-dlp-bin', YTDLP_BINARY_NAME)
  const ffmpegBinDir = path.join(toolsRoot, 'ffmpeg-bin', `${process.platform}-${process.arch}`, 'bin')
  const ffmpegPath = path.join(ffmpegBinDir, FFMPEG_BINARY_NAME)
  const ffprobePath = path.join(ffmpegBinDir, FFPROBE_BINARY_NAME)

  env.YT_DLP_PATH = ytdlpPath
  env.YT_DLP_UPDATE_METHOD = 'self'
  env.YT_DLP_MANAGED_BY_YLOADER = '1'
  env.FFMPEG_PATH = ffmpegPath
  env.FFPROBE_PATH = ffprobePath
  env.FFMPEG_MANAGED_BY_YLOADER = '1'
  env.YLOADER_RUNTIME_TARGET = 'electron'
  env.YLOADER_ALLOW_BROWSER_COOKIE_IMPORT = '1'
  prependToPath(env, ffmpegBinDir)

  return env
}

function spawnServiceWithPrefix(command, args, options = {}) {
  const {
    cwd = ROOT_DIR,
    env = process.env,
    stdoutPrefix = 'service',
    stderrPrefix = stdoutPrefix,
  } = options

  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  streamWithPrefix(child.stdout, stdoutPrefix, process.stdout)
  streamWithPrefix(child.stderr, stderrPrefix, process.stderr)

  return child
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnServiceWithPrefix(command, args, options)
    child.on('error', (error) => reject(error))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}.`))
    })
  })
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
      // not ready yet
    }

    // eslint-disable-next-line no-await-in-loop
    await delay(1000)
  }

  return false
}

function requestHttpText(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    let settled = false

    const finalize = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    let request = null
    try {
      request = http.get(url, {
        timeout: timeoutMs,
        headers: {
          Accept: 'application/json',
        },
      }, (response) => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          body += chunk
        })
        response.on('end', () => {
          finalize({
            ok: true,
            statusCode: Number(response.statusCode || 0),
            body,
          })
        })
      })
    } catch {
      finalize({ ok: false, statusCode: 0, body: '' })
      return
    }

    request.on('timeout', () => {
      request.destroy(new Error('Request timed out'))
    })

    request.on('error', () => {
      finalize({ ok: false, statusCode: 0, body: '' })
    })
  })
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

function isPortInUse(port, host = '127.0.0.1', timeoutMs = 450) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let settled = false

    const finalize = (value) => {
      if (settled) return
      settled = true
      try {
        socket.destroy()
      } catch {
        // ignore teardown races
      }
      resolve(Boolean(value))
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finalize(true))
    socket.once('timeout', () => finalize(false))
    socket.once('error', () => finalize(false))
    socket.connect(port, host)
  })
}

async function ensureElectronBinary() {
  if (fs.existsSync(ELECTRON_BINARY)) return

  if (!fs.existsSync(ELECTRON_INSTALL_SCRIPT)) {
    throw new Error(
      `Electron binary is missing at ${ELECTRON_BINARY}, and install script was not found at ${ELECTRON_INSTALL_SCRIPT}. Run npm install to restore Electron.`
    )
  }

  info('Electron binary is missing. Attempting to restore it with electron/install.js...')

  await runCommand(process.execPath, [ELECTRON_INSTALL_SCRIPT], {
    cwd: ROOT_DIR,
    env: process.env,
    stdoutPrefix: 'electron:install',
    stderrPrefix: 'electron:install',
  })

  if (!fs.existsSync(ELECTRON_BINARY)) {
    throw new Error(
      `Electron install completed but binary is still missing at ${ELECTRON_BINARY}. Run npm rebuild electron and try again.`
    )
  }
}

async function main() {
  const backendHealthUrl = 'http://127.0.0.1:4000/health'
  const frontendUrl = 'http://127.0.0.1:5173'
  const managedChildren = []

  let shuttingDown = false
  let electron = null
  let electronSpawned = false
  let electronExitHandled = false

  const registerManagedChild = (child, label) => {
    managedChildren.push({ child, label })

    child.on('exit', (code, signal) => {
      if (shuttingDown) return
      fail(`${label} exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'none'}).`)
      shutdown(code && code > 0 ? code : 1)
    })
  }

  const shutdown = (exitCode) => {
    if (shuttingDown) return
    shuttingDown = true
    process.exitCode = exitCode

    if (electron && electron.exitCode === null) {
      try {
        electron.kill('SIGTERM')
      } catch {
        // ignore shutdown races
      }
    }

    for (const entry of managedChildren) {
      const child = entry?.child
      if (!child || child.exitCode !== null) continue
      try {
        child.kill('SIGTERM')
      } catch {
        // ignore shutdown races
      }
    }

    setTimeout(() => process.exit(exitCode), 300)
  }

  const finalizeElectronExit = (code, signal) => {
    if (electronExitHandled) return
    electronExitHandled = true

    const rawCode = Number.isInteger(code) ? Number(code) : 0
    const signedCode = rawCode > 0x7fffffff ? rawCode - 0x100000000 : rawCode
    info(`Electron process exited (code=${code ?? 'null'}, signal=${signal ?? 'none'}).`)

    // Electron can report code=1 for normal window-close in dev.
    // On Windows, code can also be reported as unsigned -1 (4294967295).
    // Also treat graceful termination signals as clean shutdown.
    if (
      signedCode === 0
      || signedCode === 1
      || signedCode === -1
      || signal === 'SIGTERM'
      || signal === 'SIGINT'
    ) {
      info('Electron window closed.')
      shutdown(0)
      return
    }

    shutdown(signedCode > 0 ? signedCode : 1)
  }

  process.on('SIGINT', () => shutdown(0))
  process.on('SIGTERM', () => shutdown(0))

  if (CLEAR_RUNTIME_STATE) {
    info('Clear mode enabled. Verifying no existing local services are running...')
    const backendRunning = await isYLoaderBackendRunning(backendHealthUrl, 1500)
    if (backendRunning) {
      throw new Error('Cannot clear runtime state while local yLoader backend service is running. Stop it first and re-run start:electron:clear.')
    }

    const frontendPortBusy = await isPortInUse(5173)
    if (frontendPortBusy) {
      info('Detected a process on :5173. Continuing clear because only the yLoader backend blocks runtime reset.')
    }

    const clearedAny = [
      removeDirectoryIfExists(path.join(ROOT_DIR, 'backend-data'), 'backend settings and updater state'),
      removeDirectoryIfExists(path.join(ROOT_DIR, '.tools'), 'local yt-dlp/ffmpeg cache'),
      removeDirectoryIfExists(resolveElectronUserDataDir(), 'Electron user data'),
    ].some(Boolean)

    if (!clearedAny) {
      info('Clear mode: no existing runtime state was found to remove.')
    }
  }

  await ensureElectronBinary()

  const backendAlreadyRunning = await waitForHttp(backendHealthUrl, 1500, {
    accept: (response) => response.ok,
  })
  const frontendAlreadyRunning = await waitForHttp(frontendUrl, 1500, {
    accept: (response) => response.ok || response.status < 500,
  })

  if (!backendAlreadyRunning && !frontendAlreadyRunning) {
    info('Starting shared web stack (backend + frontend)...')
    const stack = spawn(process.execPath, ['scripts/start.mjs'], {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        YLOADER_RUNTIME_TARGET: 'electron',
        YLOADER_ALLOW_BROWSER_COOKIE_IMPORT: '1',
      },
      stdio: 'inherit',
    })
    registerManagedChild(stack, 'Web stack')
  } else {
    info('Detected existing local services. Preparing environment and starting only missing services...')
    await runCommand(process.execPath, ['scripts/start.mjs', '--prepare-only'], {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        YLOADER_RUNTIME_TARGET: 'electron',
        YLOADER_ALLOW_BROWSER_COOKIE_IMPORT: '1',
      },
      stdoutPrefix: 'prepare',
      stderrPrefix: 'prepare',
    })

    const sharedServiceEnv = buildSharedServiceEnv()

    if (backendAlreadyRunning) {
      info('Reusing existing backend on :4000.')
    } else {
      info('Starting backend only...')
      const backend = spawnServiceWithPrefix(NPM_CMD, npmArgs(['run', 'start', '--prefix', 'backend']), {
        cwd: ROOT_DIR,
        env: sharedServiceEnv,
        stdoutPrefix: 'backend',
        stderrPrefix: 'backend',
      })
      registerManagedChild(backend, 'Backend')
    }

    if (frontendAlreadyRunning) {
      info('Reusing existing frontend on :5173.')
    } else {
      info('Starting frontend only...')
      const frontend = spawnServiceWithPrefix(NPM_CMD, npmArgs(['run', 'dev', '--prefix', 'frontend']), {
        cwd: ROOT_DIR,
        env: process.env,
        stdoutPrefix: 'frontend',
        stderrPrefix: 'frontend',
      })
      registerManagedChild(frontend, 'Frontend')
    }
  }

  info('Waiting for backend and frontend ports...')
  const backendReady = await waitForHttp(backendHealthUrl, 180000, {
    accept: (response) => response.ok,
  })
  const frontendReady = await waitForHttp(frontendUrl, 180000, {
    accept: (response) => response.ok || response.status < 500,
  })

  if (!backendReady || !frontendReady) {
    fail('Timed out waiting for backend/frontend readiness.')
    shutdown(1)
    return
  }

  info('Launching Electron window...')

  const electronEnv = {
    ...process.env,
    ELECTRON_RENDERER_URL: 'http://127.0.0.1:5173',
    ELECTRON_API_BASE: 'http://127.0.0.1:4000',
    ELECTRON_BACKEND_MANAGED_EXTERNAL: '1',
  }

  electron = spawn(ELECTRON_BINARY, ['.'], {
    cwd: ROOT_DIR,
    env: electronEnv,
    stdio: 'inherit',
  })

  electron.on('spawn', () => {
    electronSpawned = true
  })

  electron.on('error', (error) => {
    if (shuttingDown) return
    fail(`Electron failed to start: ${error.message || String(error)}`)
    shutdown(1)
  })

  electron.on('exit', (code, signal) => {
    finalizeElectronExit(code, signal)
  })

  electron.on('close', (code, signal) => {
    finalizeElectronExit(code, signal)
  })
}

main().catch((error) => {
  fail(error.message || String(error))
  process.exit(1)
})
