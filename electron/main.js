const { app, BrowserWindow, shell, ipcMain, screen, session, dialog, Menu } = require('electron')
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
const ELECTRON_API_BASE = String(process.env.ELECTRON_API_BASE || 'http://127.0.0.1:4000').trim() || 'http://127.0.0.1:4000'
const DOWNLOAD_SETTINGS_CACHE_TTL_MS = 1500
const DOWNLOAD_SETTINGS_REQUEST_TIMEOUT_MS = 2000
const DOWNLOAD_LOCATION_MODE_OPTIONS = new Set(['all', 'separate'])
const AUDIO_FILE_EXTENSIONS = new Set(['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.opus'])
const VIDEO_FILE_EXTENSIONS = new Set(['.mp4', '.webm', '.mkv'])
const THUMBNAIL_FILE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

function appendDisabledChromiumFeatures(featureNames = []) {
  const existing = String(app.commandLine.getSwitchValue('disable-features') || '')
  const merged = new Set(existing.split(',').map((entry) => entry.trim()).filter(Boolean))

  for (const featureName of featureNames) {
    const normalized = String(featureName || '').trim()
    if (!normalized) continue
    merged.add(normalized)
  }

  if (merged.size === 0) return
  app.commandLine.appendSwitch('disable-features', Array.from(merged).join(','))
}

// Prevent Chromium overlay scrollbars from forcing native thin bars in Electron.
appendDisabledChromiumFeatures(['OverlayScrollbar', 'OverlayScrollbars'])

let ELECTRON_API_ORIGIN = ''
try {
  ELECTRON_API_ORIGIN = new URL(ELECTRON_API_BASE).origin
} catch {
  ELECTRON_API_ORIGIN = ''
}

app.setName(APP_NAME)
if (IS_WINDOWS) {
  app.setAppUserModelId(APP_ID)
}

const APP_DATA_BASE_DIR = app.getPath('appData')
const APP_USER_DATA_DIR = path.join(APP_DATA_BASE_DIR, 'yLoader')
const APP_SESSION_DATA_DIR = path.join(APP_USER_DATA_DIR, 'session-data')
const APP_DEFAULT_DOWNLOADS_DIR = app.getPath('downloads')

// Ensure Chromium cache/session paths always point to a writable user profile location.
fs.mkdirSync(APP_USER_DATA_DIR, { recursive: true })
fs.mkdirSync(APP_SESSION_DATA_DIR, { recursive: true })
app.setPath('userData', APP_USER_DATA_DIR)
app.setPath('sessionData', APP_SESSION_DATA_DIR)
process.env.ELECTRON_DEFAULT_DOWNLOADS_PATH = APP_DEFAULT_DOWNLOADS_DIR

let mainWindow = null
let backendProcess = null
let shuttingDown = false
let windowStateSaveTimer = null
let windowIpcRegistered = false
let updaterIpcRegistered = false
let updaterConfigured = false
let isInstallingUpdate = false
let downloadsIpcRegistered = false
let downloadInterceptionRegistered = false
let cachedDownloadSettings = null
let cachedDownloadSettingsFetchedAt = 0

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

function getSystemDownloadsDir() {
  const configured = String(APP_DEFAULT_DOWNLOADS_DIR || '').trim()
  if (configured) return configured

  try {
    return app.getPath('downloads')
  } catch {
    return path.join(app.getPath('home'), 'Downloads')
  }
}

function sanitizeDownloadFilename(value) {
  const sanitized = String(value || '')
    .replace(/\u0000/g, '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!sanitized || sanitized === '.' || sanitized === '..') return 'download'
  return sanitized
}

function normalizeDownloadDirectoryPath(value, fallbackPath) {
  const fallback = String(fallbackPath || '').trim()
  const raw = String(value || '')
    .replace(/\u0000/g, '')
    .trim()

  if (!raw) return fallback

  try {
    return path.resolve(raw)
  } catch {
    return fallback
  }
}

function inspectDownloadDirectory(directoryPath, { createIfMissing = false } = {}) {
  const resolvedPath = normalizeDownloadDirectoryPath(directoryPath, '')
  if (!resolvedPath) {
    return {
      path: '',
      exists: false,
      isDirectory: false,
      writable: false,
      valid: false,
    }
  }

  try {
    const stat = fs.statSync(resolvedPath)
    if (!stat.isDirectory()) {
      return {
        path: resolvedPath,
        exists: true,
        isDirectory: false,
        writable: false,
        valid: false,
      }
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      if (!createIfMissing) {
        return {
          path: resolvedPath,
          exists: false,
          isDirectory: false,
          writable: false,
          valid: false,
        }
      }

      try {
        fs.mkdirSync(resolvedPath, { recursive: true })
      } catch {
        return {
          path: resolvedPath,
          exists: false,
          isDirectory: false,
          writable: false,
          valid: false,
        }
      }

      try {
        const createdStat = fs.statSync(resolvedPath)
        if (!createdStat.isDirectory()) {
          return {
            path: resolvedPath,
            exists: true,
            isDirectory: false,
            writable: false,
            valid: false,
          }
        }
      } catch {
        return {
          path: resolvedPath,
          exists: false,
          isDirectory: false,
          writable: false,
          valid: false,
        }
      }
    } else {
      return {
        path: resolvedPath,
        exists: false,
        isDirectory: false,
        writable: false,
        valid: false,
      }
    }
  }

  let writable = false
  try {
    fs.accessSync(resolvedPath, fs.constants.W_OK)
    writable = true
  } catch {
    writable = false
  }

  return {
    path: resolvedPath,
    exists: true,
    isDirectory: true,
    writable,
    valid: writable,
  }
}

function inspectFilePath(filePath) {
  const resolvedPath = normalizeDownloadDirectoryPath(filePath, '')
  if (!resolvedPath) {
    return {
      path: '',
      exists: false,
      isFile: false,
      readable: false,
      valid: false,
    }
  }

  let stat
  try {
    stat = fs.statSync(resolvedPath)
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {
        path: resolvedPath,
        exists: false,
        isFile: false,
        readable: false,
        valid: false,
      }
    }
    return {
      path: resolvedPath,
      exists: false,
      isFile: false,
      readable: false,
      valid: false,
    }
  }

  if (!stat.isFile()) {
    return {
      path: resolvedPath,
      exists: true,
      isFile: false,
      readable: false,
      valid: false,
    }
  }

  let readable = false
  try {
    fs.accessSync(resolvedPath, fs.constants.R_OK)
    readable = true
  } catch {
    readable = false
  }

  return {
    path: resolvedPath,
    exists: true,
    isFile: true,
    readable,
    valid: readable,
  }
}

function resolvePreferredDownloadDirectory(preferredDirectoryPath) {
  const preferred = inspectDownloadDirectory(preferredDirectoryPath, { createIfMissing: true })
  if (preferred.valid && preferred.path) return preferred.path

  const fallbackPath = getSystemDownloadsDir()
  const fallback = inspectDownloadDirectory(fallbackPath, { createIfMissing: true })
  if (fallback.path) return fallback.path

  return fallbackPath
}

function createDefaultDownloadSettings() {
  const defaultPath = getSystemDownloadsDir()
  return {
    downloadLocationMode: 'all',
    globalDownloadPath: defaultPath,
    globalAlwaysAsk: true,
    audioDownloadPath: defaultPath,
    videoDownloadPath: defaultPath,
    thumbnailDownloadPath: defaultPath,
    audioAlwaysAsk: true,
    videoAlwaysAsk: true,
    thumbnailAlwaysAsk: true,
  }
}

function normalizeDownloadSettings(value) {
  const input = (value && typeof value === 'object') ? value : {}
  const defaults = createDefaultDownloadSettings()
  const modeRaw = String(input.downloadLocationMode || '').trim().toLowerCase()

  return {
    downloadLocationMode: DOWNLOAD_LOCATION_MODE_OPTIONS.has(modeRaw)
      ? modeRaw
      : defaults.downloadLocationMode,
    globalDownloadPath: normalizeDownloadDirectoryPath(
      input.globalDownloadPath,
      defaults.globalDownloadPath
    ),
    globalAlwaysAsk: input.globalAlwaysAsk !== undefined
      ? Boolean(input.globalAlwaysAsk)
      : defaults.globalAlwaysAsk,
    audioDownloadPath: normalizeDownloadDirectoryPath(
      input.audioDownloadPath,
      defaults.audioDownloadPath
    ),
    videoDownloadPath: normalizeDownloadDirectoryPath(
      input.videoDownloadPath,
      defaults.videoDownloadPath
    ),
    thumbnailDownloadPath: normalizeDownloadDirectoryPath(
      input.thumbnailDownloadPath,
      defaults.thumbnailDownloadPath
    ),
    audioAlwaysAsk: input.audioAlwaysAsk !== undefined
      ? Boolean(input.audioAlwaysAsk)
      : defaults.audioAlwaysAsk,
    videoAlwaysAsk: input.videoAlwaysAsk !== undefined
      ? Boolean(input.videoAlwaysAsk)
      : defaults.videoAlwaysAsk,
    thumbnailAlwaysAsk: input.thumbnailAlwaysAsk !== undefined
      ? Boolean(input.thumbnailAlwaysAsk)
      : defaults.thumbnailAlwaysAsk,
  }
}

async function syncDownloadSettingsFromBackend({ force = false } = {}) {
  const now = Date.now()

  if (!cachedDownloadSettings) {
    cachedDownloadSettings = createDefaultDownloadSettings()
    cachedDownloadSettingsFetchedAt = now
  }

  if (!force && (now - cachedDownloadSettingsFetchedAt) < DOWNLOAD_SETTINGS_CACHE_TTL_MS) {
    return cachedDownloadSettings
  }

  if (typeof fetch !== 'function') {
    cachedDownloadSettingsFetchedAt = now
    return cachedDownloadSettings
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timeout = setTimeout(() => {
    try {
      controller?.abort()
    } catch {
      // ignore abort races
    }
  }, DOWNLOAD_SETTINGS_REQUEST_TIMEOUT_MS)
  timeout.unref?.()

  try {
    const response = await fetch(`${ELECTRON_API_BASE}/api/download/settings`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller?.signal,
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    cachedDownloadSettings = normalizeDownloadSettings(data)
    cachedDownloadSettingsFetchedAt = Date.now()
    return cachedDownloadSettings
  } catch {
    cachedDownloadSettingsFetchedAt = Date.now()
    return cachedDownloadSettings
  } finally {
    clearTimeout(timeout)
  }
}

function classifyManagedDownloadType(downloadUrl, fallbackFilename = '') {
  const rawUrl = String(downloadUrl || '').trim()
  if (!rawUrl) return null

  let parsedUrl
  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    return null
  }

  if (ELECTRON_API_ORIGIN && parsedUrl.origin !== ELECTRON_API_ORIGIN) {
    return null
  }

  const pathname = String(parsedUrl.pathname || '')
  const isFileDownload = pathname.startsWith('/api/download/file/')
  const isThumbnailProxy = pathname.startsWith('/api/proxy-image')
  if (!isFileDownload && !isThumbnailProxy) return null
  if (isThumbnailProxy) return 'thumbnail'

  let filename = String(fallbackFilename || '').trim()
  if (!filename) {
    let decodedPath = pathname
    try {
      decodedPath = decodeURIComponent(pathname)
    } catch {
      decodedPath = pathname
    }
    filename = path.basename(decodedPath)
  }

  const ext = path.extname(filename).toLowerCase()
  if (THUMBNAIL_FILE_EXTENSIONS.has(ext)) return 'thumbnail'
  if (AUDIO_FILE_EXTENSIONS.has(ext)) return 'audio'
  if (VIDEO_FILE_EXTENSIONS.has(ext)) return 'video'

  return 'video'
}

function resolveDownloadTargetSettings(downloadType) {
  const defaults = createDefaultDownloadSettings()
  const settings = normalizeDownloadSettings(cachedDownloadSettings || defaults)

  if (settings.downloadLocationMode !== 'separate') {
    return {
      directoryPath: settings.globalDownloadPath,
      alwaysAsk: settings.globalAlwaysAsk,
    }
  }

  if (downloadType === 'audio') {
    return {
      directoryPath: settings.audioDownloadPath,
      alwaysAsk: settings.audioAlwaysAsk,
    }
  }

  if (downloadType === 'thumbnail') {
    return {
      directoryPath: settings.thumbnailDownloadPath,
      alwaysAsk: settings.thumbnailAlwaysAsk,
    }
  }

  return {
    directoryPath: settings.videoDownloadPath,
    alwaysAsk: settings.videoAlwaysAsk,
  }
}

function buildUniqueDownloadPath(directoryPath, filename) {
  const safeFilename = sanitizeDownloadFilename(filename)
  const parsed = path.parse(safeFilename)
  const ext = parsed.ext || ''
  const baseName = parsed.name || 'download'
  let candidate = path.join(directoryPath, `${baseName}${ext}`)
  let index = 1

  while (fs.existsSync(candidate) && index < 1000) {
    candidate = path.join(directoryPath, `${baseName} (${index})${ext}`)
    index += 1
  }

  return candidate
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

function buildEditableFieldContextMenu(editFlags = {}) {
  const flags = (editFlags && typeof editFlags === 'object') ? editFlags : {}
  const canUse = (key) => Boolean(flags[key])

  const historyItems = []
  if (canUse('canUndo')) historyItems.push({ role: 'undo' })
  if (canUse('canRedo')) historyItems.push({ role: 'redo' })

  const clipboardItems = []
  if (canUse('canCut')) clipboardItems.push({ role: 'cut' })
  if (canUse('canCopy')) clipboardItems.push({ role: 'copy' })
  if (canUse('canPaste')) clipboardItems.push({ role: 'paste' })
  if (canUse('canDelete')) clipboardItems.push({ role: 'delete' })

  const selectionItems = []
  if (canUse('canSelectAll')) selectionItems.push({ role: 'selectAll' })

  const template = []
  if (historyItems.length > 0) template.push(...historyItems)
  if (historyItems.length > 0 && clipboardItems.length > 0) template.push({ type: 'separator' })
  if (clipboardItems.length > 0) template.push(...clipboardItems)
  if ((historyItems.length > 0 || clipboardItems.length > 0) && selectionItems.length > 0) {
    template.push({ type: 'separator' })
  }
  if (selectionItems.length > 0) template.push(...selectionItems)

  if (template.length === 0) return null
  return Menu.buildFromTemplate(template)
}

function registerEditableFieldContextMenu(windowInstance) {
  if (!windowInstance || windowInstance.isDestroyed()) return

  windowInstance.webContents.on('context-menu', (event, params) => {
    if (!params?.isEditable) return

    const menu = buildEditableFieldContextMenu(params.editFlags)
    if (!menu) return

    event.preventDefault()
    menu.popup({ window: windowInstance })
  })
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

function registerDownloadsIpcHandlers() {
  if (downloadsIpcRegistered) return
  downloadsIpcRegistered = true

  ipcMain.handle('downloads:pick-directory', async (_event, payload = {}) => {
    const initialPath = String(payload?.initialPath || '').trim()
    const defaultPath = normalizeDownloadDirectoryPath(initialPath, getSystemDownloadsDir())
    const ownerWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined

    const result = await dialog.showOpenDialog(ownerWindow, {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath,
    })

    if (result.canceled || !Array.isArray(result.filePaths) || !result.filePaths[0]) {
      return { canceled: true, path: '' }
    }

    return {
      canceled: false,
      path: String(result.filePaths[0] || ''),
    }
  })

  ipcMain.handle('downloads:pick-file', async (_event, payload = {}) => {
    const initialPath = String(payload?.initialPath || '').trim()
    const defaultPath = normalizeDownloadDirectoryPath(initialPath, getSystemDownloadsDir())
    const ownerWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined

    const result = await dialog.showOpenDialog(ownerWindow, {
      properties: ['openFile'],
      defaultPath,
      filters: [
        { name: 'Cookie Files', extensions: ['txt', 'cookies'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })

    if (result.canceled || !Array.isArray(result.filePaths) || !result.filePaths[0]) {
      return { canceled: true, path: '' }
    }

    return {
      canceled: false,
      path: String(result.filePaths[0] || ''),
    }
  })

  ipcMain.handle('downloads:settings-updated', async () => {
    await syncDownloadSettingsFromBackend({ force: true })
    return true
  })

  ipcMain.handle('downloads:validate-directory', async (_event, payload = {}) => {
    const inputPath = String(payload?.path || '').trim()
    const inspection = inspectDownloadDirectory(inputPath, { createIfMissing: false })

    return {
      path: inspection.path,
      exists: Boolean(inspection.exists),
      isDirectory: Boolean(inspection.isDirectory),
      writable: Boolean(inspection.writable),
      valid: Boolean(inspection.valid),
    }
  })

  ipcMain.handle('downloads:validate-file', async (_event, payload = {}) => {
    const inputPath = String(payload?.path || '').trim()
    const inspection = inspectFilePath(inputPath)

    return {
      path: inspection.path,
      exists: Boolean(inspection.exists),
      isFile: Boolean(inspection.isFile),
      readable: Boolean(inspection.readable),
      valid: Boolean(inspection.valid),
    }
  })
}

function registerDownloadInterception() {
  if (downloadInterceptionRegistered) return
  downloadInterceptionRegistered = true

  session.defaultSession.on('will-download', (event, item, webContents) => {
    const downloadType = classifyManagedDownloadType(item?.getURL?.(), item?.getFilename?.())
    if (!downloadType) return

    // Refresh in background so manual edits from other windows are picked up quickly.
    syncDownloadSettingsFromBackend().catch(() => {
      // ignore transient backend errors and keep cached settings
    })

    const target = resolveDownloadTargetSettings(downloadType)
    const preferredDirectoryPath = normalizeDownloadDirectoryPath(target.directoryPath, getSystemDownloadsDir()) || getSystemDownloadsDir()
    const resolvedDirectoryPath = resolvePreferredDownloadDirectory(preferredDirectoryPath)
    const safeFilename = sanitizeDownloadFilename(item?.getFilename?.() || 'download')
    const defaultSavePath = path.join(resolvedDirectoryPath, safeFilename)

    if (target.alwaysAsk) {
      let ownerWindow = null
      try {
        ownerWindow = webContents ? BrowserWindow.fromWebContents(webContents) : null
      } catch {
        ownerWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
      }

      const chosenPath = dialog.showSaveDialogSync(ownerWindow || undefined, {
        defaultPath: defaultSavePath,
      })

      if (!chosenPath) {
        event.preventDefault()
        return
      }

      item.setSavePath(chosenPath)
      return
    }

    item.setSavePath(buildUniqueDownloadPath(resolvedDirectoryPath, safeFilename))
  })
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
    SYSTEM_DOWNLOADS_DIR: getSystemDownloadsDir(),
    YLOADER_RUNTIME_TARGET: 'electron',
    YLOADER_ALLOW_BROWSER_COOKIE_IMPORT: '1',
  }

  // Prevent stale externally configured tool paths from overriding bundled binaries.
  delete env.YT_DLP_PATH
  delete env.YT_DLP_UPDATE_METHOD
  delete env.YT_DLP_MANAGED_BY_YLOADER
  delete env.FFMPEG_PATH
  delete env.FFPROBE_PATH
  delete env.FFMPEG_MANAGED_BY_YLOADER

  const toolsRoot = resolveToolsRootPath()
  const ytdlpPath = resolveBundledYtDlpPath(toolsRoot)
  if (isRegularFile(ytdlpPath)) {
    env.YT_DLP_PATH = ytdlpPath
    env.YT_DLP_UPDATE_METHOD = 'self'
    env.YT_DLP_MANAGED_BY_YLOADER = '1'
  }

  const ffmpegBinDir = resolveBundledFfmpegBinDir(toolsRoot)
  const ffmpegPath = path.join(ffmpegBinDir, FFMPEG_BINARY_NAME)
  const ffprobePath = path.join(ffmpegBinDir, FFPROBE_BINARY_NAME)

  if (isRegularFile(ffmpegPath)) {
    env.FFMPEG_PATH = ffmpegPath
    env.FFMPEG_MANAGED_BY_YLOADER = '1'
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

  registerEditableFieldContextMenu(mainWindow)

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
    registerDownloadsIpcHandlers()
    registerDownloadInterception()
    configureAutoUpdater()
    startBackendProcessIfNeeded()
    syncDownloadSettingsFromBackend({ force: true }).catch(() => {
      // ignore startup backend race; defaults stay active until refresh succeeds
    })
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