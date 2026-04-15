const { app, BrowserWindow, shell, ipcMain, screen } = require('electron')
const { autoUpdater } = require('electron-updater')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const IS_WINDOWS = process.platform === 'win32'
const IS_MAC = process.platform === 'darwin'
const YTDLP_BINARY_NAME = IS_WINDOWS ? 'yt-dlp.exe' : 'yt-dlp'
const FFMPEG_BINARY_NAME = IS_WINDOWS ? 'ffmpeg.exe' : 'ffmpeg'
const FFPROBE_BINARY_NAME = IS_WINDOWS ? 'ffprobe.exe' : 'ffprobe'
const WINDOW_STATE_FILE_NAME = 'window-state.json'
const WINDOW_STATE_SAVE_DEBOUNCE_MS = 250
const DEFAULT_WINDOW_WIDTH = 1320
const DEFAULT_WINDOW_HEIGHT = 860
const MIN_WINDOW_WIDTH = 1024
const MIN_WINDOW_HEIGHT = 700
const STARTUP_UPDATE_CHECK_DELAY_MS = 3000
const APP_NAME = 'yLoader'
const APP_ID = 'com.yloader.app'
const APP_UPDATER_EVENT_CHANNEL = 'app-updater:event'
const APP_REPOSITORY_URL = 'https://github.com/BasedMarc1510/yLoader'

app.setName(APP_NAME)
if (IS_WINDOWS) {
  app.setAppUserModelId(APP_ID)
}

const APP_DATA_BASE_DIR = app.getPath('appData')
const APP_USER_DATA_DIR = path.join(APP_DATA_BASE_DIR, 'yLoader')
const APP_SESSION_DATA_DIR = path.join(APP_USER_DATA_DIR, 'session-data')

// Ensure Chromium cache/session paths always point to a writable user profile location.
fs.mkdirSync(APP_USER_DATA_DIR, { recursive: true })
fs.mkdirSync(APP_SESSION_DATA_DIR, { recursive: true })
app.setPath('userData', APP_USER_DATA_DIR)
app.setPath('sessionData', APP_SESSION_DATA_DIR)

let mainWindow = null
let backendProcess = null
let shuttingDown = false
let windowStateSaveTimer = null
let windowIpcRegistered = false
let updaterIpcRegistered = false
let updaterConfigured = false
let isInstallingUpdate = false

const UPDATE_PROGRESS_EMPTY = Object.freeze({
  percent: 0,
  bytesPerSecond: 0,
  transferred: 0,
  total: 0,
})

const updateState = {
  phase: 'idle',
  currentVersion: app.getVersion(),
  availableVersion: '',
  downloadedVersion: '',
  progress: { ...UPDATE_PROGRESS_EMPTY },
  error: '',
  canCheckForUpdates: false,
  canAutoUpdate: false,
  manualDownloadOnly: false,
  releasePageUrl: `${APP_REPOSITORY_URL}/releases`,
  closeBlocked: false,
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return

    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }

    mainWindow.focus()
  })
}

function log(message) {
  process.stdout.write(`[electron] ${message}\n`)
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

function isFiniteNumber(value) {
  return Number.isFinite(Number(value))
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function createEmptyUpdateProgress() {
  return { ...UPDATE_PROGRESS_EMPTY }
}

function ensureVersionTag(version) {
  const normalized = String(version || '').trim()
  if (!normalized) return ''
  return normalized.startsWith('v') ? normalized : `v${normalized}`
}

function buildReleasePageUrl(version = '') {
  const tag = ensureVersionTag(version)
  if (!tag) return `${APP_REPOSITORY_URL}/releases`
  return `${APP_REPOSITORY_URL}/releases/tag/${encodeURIComponent(tag)}`
}

function resolveReleaseVersion(info) {
  const raw = String(info?.version || info?.tag || info?.releaseName || '').trim()
  return raw || ''
}

function normalizeUpdateProgress(progress) {
  const percent = Number(progress?.percent)
  const bytesPerSecond = Number(progress?.bytesPerSecond)
  const transferred = Number(progress?.transferred)
  const total = Number(progress?.total)

  return {
    percent: Number.isFinite(percent) ? clamp(percent, 0, 100) : 0,
    bytesPerSecond: Number.isFinite(bytesPerSecond) ? Math.max(0, Math.round(bytesPerSecond)) : 0,
    transferred: Number.isFinite(transferred) ? Math.max(0, Math.round(transferred)) : 0,
    total: Number.isFinite(total) ? Math.max(0, Math.round(total)) : 0,
  }
}

function getUpdateStateSnapshot() {
  return {
    ...updateState,
    progress: { ...updateState.progress },
  }
}

function setUpdateState(patch = {}) {
  if (!patch || typeof patch !== 'object') return

  if (patch.progress && typeof patch.progress === 'object') {
    updateState.progress = { ...patch.progress }
  }

  const next = { ...patch }
  delete next.progress
  Object.assign(updateState, next)
}

function emitUpdaterEvent(type, payload = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return

  try {
    mainWindow.webContents.send(APP_UPDATER_EVENT_CHANNEL, {
      type,
      payload,
      state: getUpdateStateSnapshot(),
    })
  } catch {
    // ignore temporary dispatch errors during navigation
  }
}

function isUpdateDownloadInProgress() {
  return updateState.phase === 'downloading' && !isInstallingUpdate
}

function notifyCloseBlockedWhileDownloading() {
  setUpdateState({ closeBlocked: true })
  emitUpdaterEvent('close-blocked', { reason: 'download-in-progress' })
}

async function checkForAppUpdates(source = 'manual') {
  if (!updateState.canCheckForUpdates) {
    return { ok: false, reason: 'unsupported' }
  }

  if (isUpdateDownloadInProgress()) {
    notifyCloseBlockedWhileDownloading()
    return { ok: false, reason: 'download-in-progress' }
  }

  if (updateState.phase === 'checking') {
    return { ok: true, reason: 'already-checking' }
  }

  try {
    await autoUpdater.checkForUpdates()
    return { ok: true, source }
  } catch (error) {
    const message = String(error?.message || error || 'Unknown updater error')
    setUpdateState({
      phase: 'error',
      error: message,
      closeBlocked: false,
    })
    emitUpdaterEvent('error', { message, source })
    return { ok: false, error: message }
  }
}

async function downloadAppUpdate() {
  if (!updateState.canCheckForUpdates) {
    return { ok: false, reason: 'unsupported' }
  }

  if (updateState.manualDownloadOnly) {
    if (updateState.phase !== 'update-available') {
      return { ok: false, reason: 'no-update-available' }
    }

    const version = updateState.availableVersion || updateState.downloadedVersion || ''
    const releasePageUrl = buildReleasePageUrl(version)

    setUpdateState({
      releasePageUrl,
      error: '',
      closeBlocked: false,
    })

    try {
      await shell.openExternal(releasePageUrl)
      emitUpdaterEvent('manual-download-opened', { url: releasePageUrl, version })
      return { ok: true, manual: true, url: releasePageUrl }
    } catch (error) {
      const message = String(error?.message || error || 'Failed to open release page')
      setUpdateState({
        phase: 'error',
        error: message,
        closeBlocked: false,
      })
      emitUpdaterEvent('error', { message, source: 'manual-download-open' })
      return { ok: false, error: message }
    }
  }

  if (updateState.phase === 'downloading') {
    return { ok: true, reason: 'already-downloading' }
  }

  if (updateState.phase !== 'update-available') {
    return { ok: false, reason: 'no-update-available' }
  }

  setUpdateState({
    phase: 'downloading',
    error: '',
    closeBlocked: false,
    progress: createEmptyUpdateProgress(),
  })

  try {
    await autoUpdater.downloadUpdate()
    return { ok: true }
  } catch (error) {
    const message = String(error?.message || error || 'Unknown updater error')
    setUpdateState({
      phase: 'error',
      error: message,
      closeBlocked: false,
    })
    emitUpdaterEvent('error', { message, source: 'download' })
    return { ok: false, error: message }
  }
}

function quitAndInstallAppUpdate() {
  if (!updateState.canAutoUpdate) {
    return { ok: false, reason: 'unsupported' }
  }

  if (updateState.phase !== 'downloaded') {
    return { ok: false, reason: 'update-not-downloaded' }
  }

  isInstallingUpdate = true
  setUpdateState({ closeBlocked: false })

  setImmediate(() => {
    try {
      autoUpdater.quitAndInstall()
    } catch (error) {
      isInstallingUpdate = false
      const message = String(error?.message || error || 'Unknown updater error')
      setUpdateState({
        phase: 'error',
        error: message,
        closeBlocked: false,
      })
      emitUpdaterEvent('error', { message, source: 'quit-and-install' })
    }
  })

  return { ok: true }
}

function configureAutoUpdater() {
  if (updaterConfigured) return
  updaterConfigured = true

  const canCheckForUpdates = app.isPackaged
  const manualDownloadOnly = app.isPackaged && IS_MAC
  const canAutoUpdate = canCheckForUpdates && !manualDownloadOnly

  setUpdateState({
    phase: 'idle',
    currentVersion: app.getVersion(),
    availableVersion: '',
    downloadedVersion: '',
    progress: createEmptyUpdateProgress(),
    error: '',
    canCheckForUpdates,
    canAutoUpdate,
    manualDownloadOnly,
    releasePageUrl: buildReleasePageUrl(),
    closeBlocked: false,
  })

  if (!canCheckForUpdates) return

  // Best-practice updater defaults for explicit, user-driven downloads.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = true

  autoUpdater.on('checking-for-update', () => {
    setUpdateState({
      phase: 'checking',
      error: '',
      closeBlocked: false,
    })
    emitUpdaterEvent('checking-for-update')
  })

  autoUpdater.on('update-available', (info) => {
    const version = resolveReleaseVersion(info)
    setUpdateState({
      phase: 'update-available',
      availableVersion: version,
      downloadedVersion: '',
      progress: createEmptyUpdateProgress(),
      error: '',
      releasePageUrl: buildReleasePageUrl(version),
      closeBlocked: false,
    })
    emitUpdaterEvent('update-available', { version })
  })

  autoUpdater.on('update-not-available', () => {
    setUpdateState({
      phase: 'up-to-date',
      availableVersion: '',
      downloadedVersion: '',
      progress: createEmptyUpdateProgress(),
      error: '',
      releasePageUrl: buildReleasePageUrl(),
      closeBlocked: false,
    })
    emitUpdaterEvent('update-not-available')
  })

  autoUpdater.on('download-progress', (progressPayload) => {
    const progress = normalizeUpdateProgress(progressPayload)
    setUpdateState({
      phase: 'downloading',
      progress,
      error: '',
      closeBlocked: false,
    })
    emitUpdaterEvent('download-progress', progress)
  })

  autoUpdater.on('update-downloaded', (info) => {
    const version = resolveReleaseVersion(info) || updateState.availableVersion
    const doneProgress = {
      ...updateState.progress,
      percent: 100,
      transferred: updateState.progress.total > 0 ? updateState.progress.total : updateState.progress.transferred,
    }

    setUpdateState({
      phase: 'downloaded',
      downloadedVersion: version,
      progress: doneProgress,
      error: '',
      releasePageUrl: buildReleasePageUrl(version),
      closeBlocked: false,
    })
    emitUpdaterEvent('update-downloaded', { version })
  })

  autoUpdater.on('error', (error) => {
    const message = String(error?.message || error || 'Unknown updater error')
    setUpdateState({
      phase: 'error',
      error: message,
      closeBlocked: false,
    })
    emitUpdaterEvent('error', { message })
  })
}

function scheduleStartupUpdateCheck() {
  if (!updateState.canCheckForUpdates) return

  setTimeout(() => {
    checkForAppUpdates('startup').catch(() => {
      // event handlers already publish failures
    })
  }, STARTUP_UPDATE_CHECK_DELAY_MS)
}

function getWindowStatePath() {
  return path.join(app.getPath('userData'), WINDOW_STATE_FILE_NAME)
}

function getPrimaryWorkArea() {
  return screen.getPrimaryDisplay().workArea
}

function getDefaultWindowBounds() {
  const workArea = getPrimaryWorkArea()
  const width = clamp(DEFAULT_WINDOW_WIDTH, MIN_WINDOW_WIDTH, workArea.width)
  const height = clamp(DEFAULT_WINDOW_HEIGHT, MIN_WINDOW_HEIGHT, workArea.height)
  const x = Math.round(workArea.x + (workArea.width - width) / 2)
  const y = Math.round(workArea.y + (workArea.height - height) / 2)

  return { x, y, width, height }
}

function getRectIntersectionArea(a, b) {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  if (x2 <= x1 || y2 <= y1) return 0
  return (x2 - x1) * (y2 - y1)
}

function normalizeWindowBounds(rawBounds) {
  if (!rawBounds || typeof rawBounds !== 'object') {
    return getDefaultWindowBounds()
  }

  const displays = screen.getAllDisplays()
  const workAreas = displays.map((display) => display.workArea)
  const fallbackArea = getPrimaryWorkArea()

  const widthInput = isFiniteNumber(rawBounds.width) ? Number(rawBounds.width) : DEFAULT_WINDOW_WIDTH
  const heightInput = isFiniteNumber(rawBounds.height) ? Number(rawBounds.height) : DEFAULT_WINDOW_HEIGHT
  const xInput = isFiniteNumber(rawBounds.x) ? Number(rawBounds.x) : fallbackArea.x
  const yInput = isFiniteNumber(rawBounds.y) ? Number(rawBounds.y) : fallbackArea.y

  const boundedSize = {
    width: Math.round(Math.max(MIN_WINDOW_WIDTH, widthInput)),
    height: Math.round(Math.max(MIN_WINDOW_HEIGHT, heightInput)),
  }

  const candidateRect = {
    x: Math.round(xInput),
    y: Math.round(yInput),
    width: boundedSize.width,
    height: boundedSize.height,
  }

  let targetArea = fallbackArea
  let bestArea = 0
  for (const area of workAreas) {
    const overlap = getRectIntersectionArea(candidateRect, area)
    if (overlap > bestArea) {
      bestArea = overlap
      targetArea = area
    }
  }

  const width = clamp(candidateRect.width, MIN_WINDOW_WIDTH, targetArea.width)
  const height = clamp(candidateRect.height, MIN_WINDOW_HEIGHT, targetArea.height)

  // If the previous display is gone and overlap is tiny, re-center on primary display.
  if (bestArea < 10000) {
    const centered = getDefaultWindowBounds()
    return {
      x: centered.x,
      y: centered.y,
      width,
      height,
    }
  }

  const x = clamp(candidateRect.x, targetArea.x, targetArea.x + targetArea.width - width)
  const y = clamp(candidateRect.y, targetArea.y, targetArea.y + targetArea.height - height)

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  }
}

function readWindowState() {
  const fallback = {
    bounds: getDefaultWindowBounds(),
    isMaximized: false,
  }

  const statePath = getWindowStatePath()
  if (!fs.existsSync(statePath)) return fallback

  try {
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    return {
      bounds: normalizeWindowBounds(raw?.bounds),
      isMaximized: Boolean(raw?.isMaximized),
    }
  } catch {
    return fallback
  }
}

function getWindowStatePayload() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return {
      isMaximized: false,
      isFullScreen: false,
    }
  }

  return {
    isMaximized: mainWindow.isMaximized(),
    isFullScreen: mainWindow.isFullScreen(),
  }
}

function writeWindowStateNow() {
  if (!mainWindow || mainWindow.isDestroyed()) return

  try {
    const isMaximized = mainWindow.isMaximized()
    const bounds = isMaximized ? mainWindow.getNormalBounds() : mainWindow.getBounds()
    const statePath = getWindowStatePath()

    fs.mkdirSync(path.dirname(statePath), { recursive: true })
    fs.writeFileSync(statePath, JSON.stringify({
      bounds: {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      },
      isMaximized,
    }, null, 2))
  } catch {
    // ignore persistence errors
  }
}

function scheduleWindowStateSave() {
  if (windowStateSaveTimer) {
    clearTimeout(windowStateSaveTimer)
  }

  windowStateSaveTimer = setTimeout(() => {
    windowStateSaveTimer = null
    writeWindowStateNow()
  }, WINDOW_STATE_SAVE_DEBOUNCE_MS)
}

function emitWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  try {
    mainWindow.webContents.send('window:state-changed', getWindowStatePayload())
  } catch {
    // ignore temporary dispatch errors during navigation
  }
}

function registerWindowIpcHandlers() {
  if (windowIpcRegistered) return
  windowIpcRegistered = true

  ipcMain.handle('window:minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize()
    }
    return true
  })

  ipcMain.handle('window:maximize-toggle', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow.maximize()
      }
    }
    return getWindowStatePayload()
  })

  ipcMain.handle('window:close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close()
    }
    return true
  })

  ipcMain.handle('window:get-state', () => getWindowStatePayload())
}

function registerUpdaterIpcHandlers() {
  if (updaterIpcRegistered) return
  updaterIpcRegistered = true

  // Renderer sync: read the latest updater snapshot after mount/reload.
  ipcMain.handle('app-updater:get-state', () => getUpdateStateSnapshot())

  // Renderer action: manually check GitHub releases for a newer app build.
  ipcMain.handle('app-updater:check-for-updates', async () => checkForAppUpdates('manual'))

  // Renderer action: begin update download only after explicit user confirmation.
  ipcMain.handle('app-updater:download-update', async () => downloadAppUpdate())

  // Renderer action: restart process and hand over install to electron-updater.
  ipcMain.handle('app-updater:quit-and-install', () => quitAndInstallAppUpdate())
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

function resolveFrontendIndexPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'frontend', 'dist', 'index.html')
  }

  return path.join(app.getAppPath(), 'frontend', 'dist', 'index.html')
}

function resolveWindowIconPath() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'frontend', 'dist', 'favicon-96x96.png')
    : path.join(app.getAppPath(), 'frontend', 'public', 'favicon-96x96.png')

  return fs.existsSync(iconPath) ? iconPath : undefined
}

function resolveBackendEntryPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend', 'server.js')
  }

  return path.join(app.getAppPath(), 'backend', 'server.js')
}

function resolveToolsRootPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'tools')
  }

  return path.join(app.getAppPath(), '.tools')
}

function isRegularFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return false
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

function resolveBundledYtDlpPath(toolsRoot) {
  const candidates = [
    path.join(toolsRoot, 'yt-dlp-bin', YTDLP_BINARY_NAME),
    path.join(toolsRoot, 'yt-dlp-bin', 'yt-dlp.exe'),
    path.join(toolsRoot, 'yt-dlp-bin', 'yt-dlp'),
  ]

  for (const candidate of candidates) {
    if (isRegularFile(candidate)) return candidate
  }

  return ''
}

function resolveBundledFfmpegBinDir(toolsRoot) {
  const ffmpegRoot = path.join(toolsRoot, 'ffmpeg-bin')
  const preferredBinDir = path.join(ffmpegRoot, `${process.platform}-${process.arch}`, 'bin')
  if (isRegularFile(path.join(preferredBinDir, FFMPEG_BINARY_NAME))) {
    return preferredBinDir
  }

  if (!fs.existsSync(ffmpegRoot)) return ''

  const entries = fs.readdirSync(ffmpegRoot, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const candidateBinDir = path.join(ffmpegRoot, entry.name, 'bin')
    if (isRegularFile(path.join(candidateBinDir, FFMPEG_BINARY_NAME))) {
      return candidateBinDir
    }
  }

  return ''
}

function stopBackendProcess() {
  if (!backendProcess || backendProcess.exitCode !== null) return
  try {
    backendProcess.kill('SIGTERM')
  } catch {
    // ignore shutdown races
  }
}

function createRuntimeDirectories() {
  const dataRoot = path.join(app.getPath('userData'), 'runtime')
  const backendDataDir = path.join(dataRoot, 'backend-data')
  const downloadsDir = path.join(dataRoot, 'downloads')

  fs.mkdirSync(backendDataDir, { recursive: true })
  fs.mkdirSync(downloadsDir, { recursive: true })

  return {
    backendDataDir,
    downloadsDir,
  }
}

function buildBackendEnv() {
  const { backendDataDir, downloadsDir } = createRuntimeDirectories()
  const env = {
    ...process.env,
    PORT: '4000',
    DB_PATH: path.join(backendDataDir, 'metadata.db'),
    DOWNLOAD_DIR: downloadsDir,
  }

  // Prevent stale externally configured tool paths from overriding bundled binaries.
  delete env.YT_DLP_PATH
  delete env.YT_DLP_UPDATE_METHOD
  delete env.FFMPEG_PATH
  delete env.FFPROBE_PATH

  const toolsRoot = resolveToolsRootPath()
  const ytdlpPath = resolveBundledYtDlpPath(toolsRoot)
  if (isRegularFile(ytdlpPath)) {
    env.YT_DLP_PATH = ytdlpPath
    env.YT_DLP_UPDATE_METHOD = 'self'
  }

  const ffmpegBinDir = resolveBundledFfmpegBinDir(toolsRoot)
  const ffmpegPath = path.join(ffmpegBinDir, FFMPEG_BINARY_NAME)
  const ffprobePath = path.join(ffmpegBinDir, FFPROBE_BINARY_NAME)

  if (isRegularFile(ffmpegPath)) {
    env.FFMPEG_PATH = ffmpegPath
    prependToPath(env, ffmpegBinDir)
  }
  if (isRegularFile(ffprobePath)) {
    env.FFPROBE_PATH = ffprobePath
  }

  return env
}

function startBackendProcessIfNeeded() {
  if (String(process.env.ELECTRON_BACKEND_MANAGED_EXTERNAL || '') === '1') {
    log('Using externally managed backend process (dev wrapper mode).')
    return
  }

  const backendEntry = resolveBackendEntryPath()
  if (!fs.existsSync(backendEntry)) {
    log(`Backend entry not found: ${backendEntry}`)
    return
  }

  const backendEnv = buildBackendEnv()
  backendEnv.ELECTRON_RUN_AS_NODE = '1'
  delete backendEnv.ELECTRON_RENDERER_URL
  delete backendEnv.ELECTRON_API_BASE

  backendProcess = spawn(process.execPath, [backendEntry], {
    cwd: path.dirname(backendEntry),
    env: backendEnv,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  streamWithPrefix(backendProcess.stdout, 'backend', process.stdout)
  streamWithPrefix(backendProcess.stderr, 'backend', process.stderr)

  backendProcess.on('exit', (code, signal) => {
    if (shuttingDown) return
    log(`Backend exited (code=${code ?? 'null'}, signal=${signal ?? 'none'}).`)
  })
}

function createMainWindow() {
  const windowState = readWindowState()
  const windowIconPath = resolveWindowIconPath()

  mainWindow = new BrowserWindow({
    x: windowState.bounds.x,
    y: windowState.bounds.y,
    width: windowState.bounds.width,
    height: windowState.bounds.height,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    show: false,
    autoHideMenuBar: true,
    title: APP_NAME,
    ...(windowIconPath ? { icon: windowIconPath } : {}),
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    backgroundColor: '#181818',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.on('move', () => {
    scheduleWindowStateSave()
  })

  mainWindow.on('resize', () => {
    scheduleWindowStateSave()
  })

  mainWindow.on('maximize', () => {
    scheduleWindowStateSave()
    emitWindowState()
  })

  mainWindow.on('unmaximize', () => {
    scheduleWindowStateSave()
    emitWindowState()
  })

  mainWindow.on('enter-full-screen', () => {
    emitWindowState()
  })

  mainWindow.on('leave-full-screen', () => {
    emitWindowState()
  })

  mainWindow.on('close', (event) => {
    if (!isUpdateDownloadInProgress()) return
    event.preventDefault()
    notifyCloseBlockedWhileDownloading()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return
    mainWindow.show()
    emitWindowState()
    emitUpdaterEvent('state-sync')
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = String(process.env.ELECTRON_RENDERER_URL || '').trim()
  if (devUrl) {
    mainWindow.loadURL(devUrl)
    if (windowState.isMaximized) {
      mainWindow.maximize()
    }
    return
  }

  const indexPath = resolveFrontendIndexPath()
  if (fs.existsSync(indexPath)) {
    mainWindow.loadFile(indexPath)
    if (windowState.isMaximized) {
      mainWindow.maximize()
    }
    return
  }

  const fallbackHtml = encodeURIComponent('<h1>yLoader frontend build missing</h1><p>Run npm run build --prefix frontend.</p>')
  mainWindow.loadURL(`data:text/html,${fallbackHtml}`)

  if (windowState.isMaximized) {
    mainWindow.maximize()
  }
}

if (hasSingleInstanceLock) {
  app.whenReady().then(() => {
    registerWindowIpcHandlers()
    registerUpdaterIpcHandlers()
    configureAutoUpdater()
    startBackendProcessIfNeeded()
    createMainWindow()
    scheduleStartupUpdateCheck()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow()
      }
    })
  })
}

app.on('before-quit', (event) => {
  if (isUpdateDownloadInProgress()) {
    event.preventDefault()
    notifyCloseBlockedWhileDownloading()
    return
  }

  shuttingDown = true
  if (windowStateSaveTimer) {
    clearTimeout(windowStateSaveTimer)
    windowStateSaveTimer = null
  }
  writeWindowStateNow()
  stopBackendProcess()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})