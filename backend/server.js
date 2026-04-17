import express from 'express'
import { execFile, spawn } from 'child_process'
import os from 'os'
import path from 'path'
import { URL as NodeURL } from 'url'
import fs from 'fs'
import crypto from 'crypto'
import { EventEmitter } from 'events'
import {
  GENERIC_SERVICE_KEY,
  normalizeServiceKey,
  resolveServiceKey,
} from '../shared/services/serviceCatalog.js'
import {
  classifyYtDlpError,
  YT_DLP_ERROR_CODES,
} from '../shared/errors/ytDlpErrorCatalog.js'
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const sqlite3 = require("sqlite3").verbose();

const DB_PATH = process.env.DB_PATH || '/app/data/metadata.db';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error(`Failed to connect to ${DB_PATH}:`, err.message);
  else console.log(`Connected to ${DB_PATH}`);
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id TEXT,
    title TEXT,
    duration INTEGER,
    timestamp TEXT,
    download_type TEXT,
    format_id TEXT,
    filename TEXT,
    service TEXT,
    source_url TEXT
  )`);
  // Try to add column if missing (for existing DBs)
  db.run(`ALTER TABLE downloads ADD COLUMN service TEXT`, (err) => {
    // ignore error if column exists
  });
  db.run(`ALTER TABLE downloads ADD COLUMN source_url TEXT`, (err) => {
    // ignore error if column exists
  });
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);
});

const app = express()
const PORT = process.env.PORT || 4000

function getDefaultSystemDownloadsDir() {
  const configured = String(process.env.SYSTEM_DOWNLOADS_DIR || '').trim()
  if (configured) {
    try {
      return path.resolve(configured)
    } catch {
      // ignore invalid configured path and fall back
    }
  }

  const homeDir = String(os.homedir() || '').trim()
  if (homeDir) {
    return path.join(homeDir, 'Downloads')
  }

  return path.resolve('./downloads')
}

const DEFAULT_SYSTEM_DOWNLOADS_DIR = getDefaultSystemDownloadsDir()

const ALLOWED_AUDIO_CONTAINERS = new Set(['mp3', 'm4a', 'wav', 'ogg', 'flac', 'opus'])
const ALLOWED_VIDEO_CONTAINERS = new Set(['mp4', 'webm', 'mkv'])
const ALLOWED_IMAGE_CONTAINERS = new Set(['jpg', 'png', 'webp'])
const FORMAT_ID_REGEX = /^[A-Za-z0-9_.,:+\-\/=~*]+$/
const MAX_PROXY_IMAGE_SIZE_BYTES = 15 * 1024 * 1024
const TAB_STATE_SETTINGS_KEY = 'ui.tabs.state.v1'
const AUTO_DOWNLOAD_SETTINGS_KEY = 'ui.autoDownload.settings.v1'
const DOWNLOAD_SETTINGS_KEY = 'ui.download.settings.v1'
const TOOL_UPDATER_SETTINGS_KEY = 'tools.updater.settings.v1'
const YT_DLP_COOKIE_SETTINGS_KEY = 'ytDlp.cookies.settings.v1'
const MAX_PERSISTED_TABS = 30
const AUTO_DOWNLOAD_BITRATE_OPTIONS = new Set([0, 96, 128, 160, 192, 256, 320])
const AUTO_DOWNLOAD_VIDEO_HEIGHT_OPTIONS = new Set([0, 360, 480, 720, 1080, 1440, 2160])
const DOWNLOAD_CONCURRENT_OPTIONS = new Set([1, 2, 3, 4, 5, 6, 7, 8])
const DOWNLOAD_STAGGER_OPTIONS = new Set([0, 100, 150, 250, 500, 1000])
const DOWNLOAD_BITRATE_OPTIONS = new Set([0, 96, 128, 160, 192, 256, 320])
const DOWNLOAD_VIDEO_HEIGHT_OPTIONS = new Set([0, 360, 480, 720, 1080, 1440, 2160])
const DOWNLOAD_LOCATION_MODE_OPTIONS = new Set(['all', 'separate'])
const META_FORMATS_CACHE_TTL_MS = 3 * 60 * 1000
const META_FORMATS_CACHE_MAX_ENTRIES = 150
const SEARCH_PROVIDER_OPTIONS = new Set(['youtube', 'youtubemusic', 'spotify', 'soundcloud'])
const SEARCH_QUERY_MAX_LENGTH = 300
const SEARCH_PAGE_SIZE = 10
const SEARCH_OFFSET_MAX = 500
const YT_DLP_COOKIE_SUPPORTED_BROWSERS = Object.freeze(['brave', 'chrome', 'chromium', 'edge', 'firefox', 'opera', 'safari', 'vivaldi', 'whale'])
const YT_DLP_COOKIE_CHROMIUM_BROWSERS = new Set(['brave', 'chrome', 'chromium', 'edge', 'opera', 'vivaldi', 'whale'])
const YT_DLP_COOKIE_SUPPORTED_KEYRINGS = Object.freeze(['basictext', 'gnomekeyring', 'kwallet', 'kwallet5', 'kwallet6'])
const YT_DLP_COOKIE_SPEC_REGEX = /^(?<name>[^+:]+)(?:\s*\+\s*(?<keyring>[^:]+))?(?:\s*:\s*(?!:)(?<profile>.+?))?(?:\s*::\s*(?<container>.+))?$/
const DEFAULT_AUTO_DOWNLOAD_SETTINGS = Object.freeze({
  useMetadata: true,
  embedCoverArt: true,
  maxAudioBitrateKbps: 0,
  maxVideoHeight: 0,
})
const DEFAULT_DOWNLOAD_SETTINGS = Object.freeze({
  maxConcurrentDownloads: 3,
  staggerDownloadsMs: 150,
  defaultAudioContainer: 'mp3',
  defaultVideoContainer: 'mp4',
  defaultEmbedCoverArt: true,
  maxAudioBitrateKbps: 0,
  maxVideoHeight: 0,
  downloadLocationMode: 'all',
  globalDownloadPath: DEFAULT_SYSTEM_DOWNLOADS_DIR,
  globalAlwaysAsk: true,
  audioDownloadPath: DEFAULT_SYSTEM_DOWNLOADS_DIR,
  videoDownloadPath: DEFAULT_SYSTEM_DOWNLOADS_DIR,
  thumbnailDownloadPath: DEFAULT_SYSTEM_DOWNLOADS_DIR,
  audioAlwaysAsk: true,
  videoAlwaysAsk: true,
  thumbnailAlwaysAsk: true,
})
const DEFAULT_TOOL_UPDATER_SETTINGS = Object.freeze({
  ytDlpAutoUpdate: true,
  ffmpegAutoUpdate: true,
})
const TOOL_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const TOOL_UPDATE_SCHEDULER_TICK_MS = 5 * 60 * 1000
const metaFormatsCache = new Map()
const ALLOWED_TAB_PATHS = new Set([
  '/',
  '/search',
  '/downloads',
  '/support',
  '/youtube-downloader',
  '/reddit-downloader',
  '/x-downloader',
  '/generic-downloader',
])
const YT_DLP_JS_RUNTIMES = String(process.env.YT_DLP_JS_RUNTIMES || 'node').trim() || 'node'
const YT_DLP_JS_RUNTIME_ARGS = ['--js-runtimes', YT_DLP_JS_RUNTIMES]
const YT_DLP_COOKIES_FILE_ENV = String(process.env.YT_DLP_COOKIES_FILE || '').trim()
const YT_DLP_COOKIES_FROM_BROWSER_ENV = String(process.env.YT_DLP_COOKIES_FROM_BROWSER || '').trim()
const YT_DLP_EXTRACTOR_ARGS = String(process.env.YT_DLP_EXTRACTOR_ARGS || '').trim()
const YLOADER_RUNTIME_TARGET = String(process.env.YLOADER_RUNTIME_TARGET || 'server').trim().toLowerCase() || 'server'
const YLOADER_ALLOW_BROWSER_COOKIE_IMPORT = (() => {
  const flag = String(process.env.YLOADER_ALLOW_BROWSER_COOKIE_IMPORT || '').trim().toLowerCase()
  if (flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on') return true
  if (flag === '0' || flag === 'false' || flag === 'no' || flag === 'off') return false
  return YLOADER_RUNTIME_TARGET === 'electron'
})()
const YT_DLP_LATEST_CACHE_TTL_MS = 10 * 60 * 1000
const FFMPEG_LATEST_CACHE_TTL_MS = 10 * 60 * 1000
let FFMPEG_BIN = String(process.env.FFMPEG_PATH || '').trim()
let FFPROBE_BIN = String(process.env.FFPROBE_PATH || '').trim()
const ytDlpLatestVersionCache = {
  version: '',
  fetchedAt: 0,
  releaseTag: '',
  releaseName: '',
  htmlUrl: '',
}
let ytDlpLatestVersionFetchPromise = null
const ffmpegLatestVersionCache = {
  version: '',
  fetchedAt: 0,
  releaseTag: '',
  releaseName: '',
  htmlUrl: '',
}
let ffmpegLatestVersionFetchPromise = null

const TOOL_ROOT_CANDIDATES = [
  path.resolve(process.cwd(), '..', 'tools'),
  path.resolve(process.cwd(), 'tools'),
  path.resolve(process.cwd(), '..', '.tools'),
  path.resolve(process.cwd(), '.tools'),
]

function isRegularFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return false
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

function looksLikeFilePath(target) {
  const value = String(target || '').trim()
  return value.includes('/') || value.includes('\\') || path.isAbsolute(value)
}

function getToolRoots() {
  const uniqueCandidates = [...new Set(TOOL_ROOT_CANDIDATES.map((candidate) => path.resolve(candidate)))]
  const roots = []

  for (const candidate of uniqueCandidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        roots.push(candidate)
      }
    } catch {
      // ignore unreadable candidates
    }
  }

  return roots
}

function findBundledYtDlpBinary() {
  const binaryCandidates = process.platform === 'win32'
    ? ['yt-dlp.exe', 'yt-dlp']
    : ['yt-dlp', 'yt-dlp.exe']

  for (const root of getToolRoots()) {
    for (const binaryName of binaryCandidates) {
      const candidate = path.join(root, 'yt-dlp-bin', binaryName)
      if (isRegularFile(candidate)) return candidate
    }
  }

  return ''
}

function findBundledFfmpegBinary(binaryName) {
  const platformArchDir = `${process.platform}-${process.arch}`

  for (const root of getToolRoots()) {
    const ffmpegRoot = path.join(root, 'ffmpeg-bin')
    const preferred = path.join(ffmpegRoot, platformArchDir, 'bin', binaryName)
    if (isRegularFile(preferred)) return preferred

    if (!fs.existsSync(ffmpegRoot)) continue

    try {
      const entries = fs.readdirSync(ffmpegRoot, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const candidate = path.join(ffmpegRoot, entry.name, 'bin', binaryName)
        if (isRegularFile(candidate)) return candidate
      }
    } catch {
      // ignore lookup errors and continue with next root
    }
  }

  return ''
}

// Basic CORS to allow browser access from other origins
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.use(express.json({ limit: '25mb' }))

function normalizeTabPath(value) {
  const raw = String(value || '').trim()
  return ALLOWED_TAB_PATHS.has(raw) ? raw : '/'
}

function normalizeTabSearch(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const prefixed = raw.startsWith('?') ? raw : `?${raw}`
  if (prefixed.length > 1024) return prefixed.slice(0, 1024)
  return prefixed
}

function normalizeTabTitle(value) {
  const raw = String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  return raw.slice(0, 180)
}

function createFallbackTab() {
  return {
    id: 'tab-home',
    path: '/',
    search: '',
    pageTitle: '',
  }
}

function normalizeAutoDownloadSettingsPayload(value) {
  const input = (value && typeof value === 'object') ? value : {}

  const useMetadata = input.useMetadata !== undefined
    ? Boolean(input.useMetadata)
    : DEFAULT_AUTO_DOWNLOAD_SETTINGS.useMetadata

  const embedCoverArt = input.embedCoverArt !== undefined
    ? Boolean(input.embedCoverArt)
    : DEFAULT_AUTO_DOWNLOAD_SETTINGS.embedCoverArt

  const bitrateRaw = Number(input.maxAudioBitrateKbps)
  const maxAudioBitrateKbps = AUTO_DOWNLOAD_BITRATE_OPTIONS.has(bitrateRaw)
    ? bitrateRaw
    : DEFAULT_AUTO_DOWNLOAD_SETTINGS.maxAudioBitrateKbps

  const heightRaw = Number(input.maxVideoHeight)
  const maxVideoHeight = AUTO_DOWNLOAD_VIDEO_HEIGHT_OPTIONS.has(heightRaw)
    ? heightRaw
    : DEFAULT_AUTO_DOWNLOAD_SETTINGS.maxVideoHeight

  return {
    useMetadata,
    embedCoverArt,
    maxAudioBitrateKbps,
    maxVideoHeight,
  }
}

function normalizeDownloadSettingsPayload(value) {
  const input = (value && typeof value === 'object') ? value : {}

  const maxConcurrentRaw = Number(input.maxConcurrentDownloads)
  const staggerRaw = Number(input.staggerDownloadsMs)
  const audioContainerRaw = normalizeAudioContainer(input.defaultAudioContainer)
  const videoContainerRaw = normalizeVideoContainer(input.defaultVideoContainer)
  const maxAudioBitrateRaw = Number(input.maxAudioBitrateKbps)
  const maxVideoHeightRaw = Number(input.maxVideoHeight)
  const downloadLocationModeRaw = String(input.downloadLocationMode || '').trim().toLowerCase()

  const globalDownloadPath = normalizeDownloadDirectoryPath(
    input.globalDownloadPath,
    DEFAULT_DOWNLOAD_SETTINGS.globalDownloadPath
  )
  const audioDownloadPath = normalizeDownloadDirectoryPath(
    input.audioDownloadPath,
    DEFAULT_DOWNLOAD_SETTINGS.audioDownloadPath
  )
  const videoDownloadPath = normalizeDownloadDirectoryPath(
    input.videoDownloadPath,
    DEFAULT_DOWNLOAD_SETTINGS.videoDownloadPath
  )
  const thumbnailDownloadPath = normalizeDownloadDirectoryPath(
    input.thumbnailDownloadPath,
    DEFAULT_DOWNLOAD_SETTINGS.thumbnailDownloadPath
  )

  return {
    maxConcurrentDownloads: DOWNLOAD_CONCURRENT_OPTIONS.has(maxConcurrentRaw)
      ? maxConcurrentRaw
      : DEFAULT_DOWNLOAD_SETTINGS.maxConcurrentDownloads,
    staggerDownloadsMs: DOWNLOAD_STAGGER_OPTIONS.has(staggerRaw)
      ? staggerRaw
      : DEFAULT_DOWNLOAD_SETTINGS.staggerDownloadsMs,
    defaultAudioContainer: audioContainerRaw || DEFAULT_DOWNLOAD_SETTINGS.defaultAudioContainer,
    defaultVideoContainer: videoContainerRaw || DEFAULT_DOWNLOAD_SETTINGS.defaultVideoContainer,
    defaultEmbedCoverArt: input.defaultEmbedCoverArt !== undefined
      ? Boolean(input.defaultEmbedCoverArt)
      : DEFAULT_DOWNLOAD_SETTINGS.defaultEmbedCoverArt,
    maxAudioBitrateKbps: DOWNLOAD_BITRATE_OPTIONS.has(maxAudioBitrateRaw)
      ? maxAudioBitrateRaw
      : DEFAULT_DOWNLOAD_SETTINGS.maxAudioBitrateKbps,
    maxVideoHeight: DOWNLOAD_VIDEO_HEIGHT_OPTIONS.has(maxVideoHeightRaw)
      ? maxVideoHeightRaw
      : DEFAULT_DOWNLOAD_SETTINGS.maxVideoHeight,
    downloadLocationMode: DOWNLOAD_LOCATION_MODE_OPTIONS.has(downloadLocationModeRaw)
      ? downloadLocationModeRaw
      : DEFAULT_DOWNLOAD_SETTINGS.downloadLocationMode,
    globalDownloadPath,
    globalAlwaysAsk: input.globalAlwaysAsk !== undefined
      ? Boolean(input.globalAlwaysAsk)
      : DEFAULT_DOWNLOAD_SETTINGS.globalAlwaysAsk,
    audioDownloadPath,
    videoDownloadPath,
    thumbnailDownloadPath,
    audioAlwaysAsk: input.audioAlwaysAsk !== undefined
      ? Boolean(input.audioAlwaysAsk)
      : DEFAULT_DOWNLOAD_SETTINGS.audioAlwaysAsk,
    videoAlwaysAsk: input.videoAlwaysAsk !== undefined
      ? Boolean(input.videoAlwaysAsk)
      : DEFAULT_DOWNLOAD_SETTINGS.videoAlwaysAsk,
    thumbnailAlwaysAsk: input.thumbnailAlwaysAsk !== undefined
      ? Boolean(input.thumbnailAlwaysAsk)
      : DEFAULT_DOWNLOAD_SETTINGS.thumbnailAlwaysAsk,
  }
}

function normalizeCookieSettingText(value, maxLength = 2048) {
  const raw = String(value || '')
    .replace(/\u0000/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
  if (!raw) return ''
  return raw.slice(0, maxLength)
}

function normalizeCookieBrowser(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return YT_DLP_COOKIE_SUPPORTED_BROWSERS.includes(normalized) ? normalized : ''
}

function normalizeCookieKeyring(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return YT_DLP_COOKIE_SUPPORTED_KEYRINGS.includes(normalized) ? normalized : ''
}

function parseCookiesFromBrowserSpec(rawSpec) {
  const spec = normalizeCookieSettingText(rawSpec, 4096)
  if (!spec) {
    return {
      valid: true,
      browserName: '',
      browserKeyring: '',
      browserProfile: '',
      browserContainer: '',
    }
  }

  const match = spec.match(YT_DLP_COOKIE_SPEC_REGEX)
  if (!match || !match.groups) {
    return {
      valid: false,
      browserName: '',
      browserKeyring: '',
      browserProfile: '',
      browserContainer: '',
    }
  }

  const browserName = normalizeCookieBrowser(match.groups.name)
  const browserKeyringRaw = normalizeCookieSettingText(match.groups.keyring || '', 128)
  const browserKeyring = normalizeCookieKeyring(browserKeyringRaw)
  const browserProfile = normalizeCookieSettingText(match.groups.profile || '', 1024)
  const browserContainer = normalizeCookieSettingText(match.groups.container || '', 256)

  if (!browserName) {
    return {
      valid: false,
      browserName: '',
      browserKeyring: '',
      browserProfile: '',
      browserContainer: '',
    }
  }

  if (browserKeyringRaw && !browserKeyring) {
    return {
      valid: false,
      browserName: '',
      browserKeyring: '',
      browserProfile: '',
      browserContainer: '',
    }
  }

  return {
    valid: true,
    browserName,
    browserKeyring,
    browserProfile,
    browserContainer,
  }
}

function getSupportedCookieBrowsersForCurrentPlatform() {
  if (process.platform === 'darwin') {
    return [...YT_DLP_COOKIE_SUPPORTED_BROWSERS]
  }
  return YT_DLP_COOKIE_SUPPORTED_BROWSERS.filter((browser) => browser !== 'safari')
}

function getYtDlpCookieCapabilities() {
  return {
    runtimeTarget: YLOADER_RUNTIME_TARGET,
    browserImportSupported: Boolean(YLOADER_ALLOW_BROWSER_COOKIE_IMPORT),
    supportedBrowsers: YLOADER_ALLOW_BROWSER_COOKIE_IMPORT
      ? getSupportedCookieBrowsersForCurrentPlatform()
      : [],
    supportedKeyrings: [...YT_DLP_COOKIE_SUPPORTED_KEYRINGS],
  }
}

function createDefaultYtDlpCookieSettings() {
  const parsed = parseCookiesFromBrowserSpec(YT_DLP_COOKIES_FROM_BROWSER_ENV)
  const browserEnabled = parsed.valid && Boolean(parsed.browserName)

  return {
    cookiesFileEnabled: Boolean(normalizeCookieSettingText(YT_DLP_COOKIES_FILE_ENV)),
    cookiesFilePath: normalizeCookieSettingText(YT_DLP_COOKIES_FILE_ENV),
    cookiesFromBrowserEnabled: browserEnabled,
    browserName: browserEnabled ? parsed.browserName : '',
    browserKeyring: browserEnabled ? parsed.browserKeyring : '',
    browserProfile: browserEnabled ? parsed.browserProfile : '',
    browserContainer: browserEnabled ? parsed.browserContainer : '',
  }
}

function normalizeYtDlpCookieSettingsPayload(value, { browserImportSupported = YLOADER_ALLOW_BROWSER_COOKIE_IMPORT } = {}) {
  const defaults = createDefaultYtDlpCookieSettings()
  const input = (value && typeof value === 'object') ? value : {}

  const cookiesFileEnabled = input.cookiesFileEnabled !== undefined
    ? Boolean(input.cookiesFileEnabled)
    : defaults.cookiesFileEnabled

  const cookiesFilePath = normalizeCookieSettingText(
    input.cookiesFilePath !== undefined ? input.cookiesFilePath : defaults.cookiesFilePath,
    4096,
  )

  let browserName = normalizeCookieBrowser(
    input.browserName !== undefined ? input.browserName : defaults.browserName
  )
  let browserKeyring = normalizeCookieKeyring(
    input.browserKeyring !== undefined ? input.browserKeyring : defaults.browserKeyring
  )
  let browserProfile = normalizeCookieSettingText(
    input.browserProfile !== undefined ? input.browserProfile : defaults.browserProfile,
    1024,
  )
  let browserContainer = normalizeCookieSettingText(
    input.browserContainer !== undefined ? input.browserContainer : defaults.browserContainer,
    256,
  )

  const browserEnabledFromInput = input.cookiesFromBrowserEnabled !== undefined
    ? Boolean(input.cookiesFromBrowserEnabled)
    : defaults.cookiesFromBrowserEnabled

  const supportedBrowsers = new Set(getSupportedCookieBrowsersForCurrentPlatform())
  if (!supportedBrowsers.has(browserName)) {
    browserName = ''
    browserKeyring = ''
    browserProfile = ''
    browserContainer = ''
  }

  if (!YT_DLP_COOKIE_CHROMIUM_BROWSERS.has(browserName)) {
    browserKeyring = ''
  }

  if (browserName !== 'firefox') {
    browserContainer = ''
  }

  const cookiesFromBrowserEnabled = Boolean(
    browserImportSupported
    && browserEnabledFromInput
    && browserName
  )

  return {
    cookiesFileEnabled,
    cookiesFilePath,
    cookiesFromBrowserEnabled,
    browserName,
    browserKeyring,
    browserProfile,
    browserContainer,
  }
}

function composeCookiesFromBrowserSpec(settings) {
  const browserName = normalizeCookieBrowser(settings?.browserName)
  if (!browserName) return ''

  let spec = browserName

  const keyring = normalizeCookieKeyring(settings?.browserKeyring)
  if (keyring && YT_DLP_COOKIE_CHROMIUM_BROWSERS.has(browserName)) {
    spec += `+${keyring}`
  }

  const profile = normalizeCookieSettingText(settings?.browserProfile, 1024)
  if (profile) {
    spec += `:${profile}`
  }

  const container = normalizeCookieSettingText(settings?.browserContainer, 256)
  if (browserName === 'firefox' && container) {
    spec += `::${container}`
  }

  return spec
}

function toPersistedYtDlpCookieSettings(settings) {
  return {
    cookiesFileEnabled: Boolean(settings?.cookiesFileEnabled),
    cookiesFilePath: normalizeCookieSettingText(settings?.cookiesFilePath, 4096),
    cookiesFromBrowserEnabled: Boolean(settings?.cookiesFromBrowserEnabled),
    browserName: normalizeCookieBrowser(settings?.browserName),
    browserKeyring: normalizeCookieKeyring(settings?.browserKeyring),
    browserProfile: normalizeCookieSettingText(settings?.browserProfile, 1024),
    browserContainer: normalizeCookieSettingText(settings?.browserContainer, 256),
  }
}

function validateYtDlpCookieSettings(settings, { browserImportSupported = YLOADER_ALLOW_BROWSER_COOKIE_IMPORT } = {}) {
  const normalized = normalizeYtDlpCookieSettingsPayload(settings, { browserImportSupported })
  if (normalized.cookiesFileEnabled && !normalizeCookieSettingText(normalized.cookiesFilePath, 4096)) {
    return 'Cookie file path is required when cookie file import is enabled'
  }

  if (normalized.cookiesFromBrowserEnabled) {
    if (!browserImportSupported) {
      return 'Browser cookie import is not supported in this runtime mode'
    }
    if (!normalized.browserName) {
      return 'Browser selection is required when browser cookie import is enabled'
    }
  }

  return ''
}

function attachYtDlpCookieCapabilities(settings) {
  const normalized = normalizeYtDlpCookieSettingsPayload(settings)
  return {
    ...normalized,
    ...getYtDlpCookieCapabilities(),
  }
}

function normalizeTabsStatePayload(value) {
  const inputTabs = Array.isArray(value?.tabs) ? value.tabs : []
  const normalizedTabs = []
  const seenIds = new Set()

  for (let i = 0; i < inputTabs.length && normalizedTabs.length < MAX_PERSISTED_TABS; i += 1) {
    const tab = inputTabs[i] || {}
    const rawId = String(tab.id || '').trim().slice(0, 80)
    const id = rawId || `tab-${i + 1}`
    if (seenIds.has(id)) continue
    seenIds.add(id)

    normalizedTabs.push({
      id,
      path: normalizeTabPath(tab.path),
      search: normalizeTabSearch(tab.search),
      pageTitle: normalizeTabTitle(tab.pageTitle),
    })
  }

  if (!normalizedTabs.length) {
    normalizedTabs.push(createFallbackTab())
  }

  const requestedActiveId = String(value?.activeTabId || '').trim()
  const activeTabId = normalizedTabs.some((tab) => tab.id === requestedActiveId)
    ? requestedActiveId
    : normalizedTabs[0].id

  return { tabs: normalizedTabs, activeTabId }
}

function readSettingValue(key) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT value FROM settings WHERE key = ?`, [key], (err, row) => {
      if (err) return reject(err)
      resolve(row?.value ?? null)
    })
  })
}

function writeSettingValue(key, value) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
      (err) => {
        if (err) return reject(err)
        resolve()
      }
    )
  })
}

function normalizeToolUpdaterSettingsPayload(value) {
  const input = value && typeof value === 'object' ? value : {}
  return {
    ytDlpAutoUpdate: input.ytDlpAutoUpdate !== undefined
      ? Boolean(input.ytDlpAutoUpdate)
      : DEFAULT_TOOL_UPDATER_SETTINGS.ytDlpAutoUpdate,
    ffmpegAutoUpdate: input.ffmpegAutoUpdate !== undefined
      ? Boolean(input.ffmpegAutoUpdate)
      : DEFAULT_TOOL_UPDATER_SETTINGS.ffmpegAutoUpdate,
  }
}

async function readToolUpdaterSettings() {
  const raw = await readSettingValue(TOOL_UPDATER_SETTINGS_KEY)
  if (!raw) {
    return { ...DEFAULT_TOOL_UPDATER_SETTINGS }
  }

  try {
    const parsed = JSON.parse(raw)
    return normalizeToolUpdaterSettingsPayload(parsed)
  } catch {
    return { ...DEFAULT_TOOL_UPDATER_SETTINGS }
  }
}

async function writeToolUpdaterSettings(nextValue) {
  const merged = normalizeToolUpdaterSettingsPayload(nextValue)
  await writeSettingValue(TOOL_UPDATER_SETTINGS_KEY, JSON.stringify(merged))
  return merged
}

async function readDownloadSettings() {
  let parsed = {}
  const raw = await readSettingValue(DOWNLOAD_SETTINGS_KEY)
  if (raw) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = {}
    }
  }

  return normalizeDownloadSettingsPayload(parsed)
}

async function readYtDlpCookieSettingsCore() {
  const defaults = createDefaultYtDlpCookieSettings()
  const raw = await readSettingValue(YT_DLP_COOKIE_SETTINGS_KEY)
  if (!raw) {
    return normalizeYtDlpCookieSettingsPayload(defaults)
  }

  try {
    const parsed = JSON.parse(raw)
    return normalizeYtDlpCookieSettingsPayload({ ...defaults, ...(parsed || {}) })
  } catch {
    return normalizeYtDlpCookieSettingsPayload(defaults)
  }
}

async function readYtDlpCookieSettings() {
  const normalized = await readYtDlpCookieSettingsCore()
  return attachYtDlpCookieCapabilities(normalized)
}

async function writeYtDlpCookieSettings(nextValue) {
  const normalized = normalizeYtDlpCookieSettingsPayload(nextValue)
  const persisted = toPersistedYtDlpCookieSettings(normalized)
  await writeSettingValue(YT_DLP_COOKIE_SETTINGS_KEY, JSON.stringify(persisted))
  return attachYtDlpCookieCapabilities(normalized)
}

app.get('/api/tabs/state', async (_req, res) => {
  try {
    const raw = await readSettingValue(TAB_STATE_SETTINGS_KEY)
    let parsed = {}
    if (raw) {
      try {
        parsed = JSON.parse(raw)
      } catch {
        parsed = {}
      }
    }
    const normalized = normalizeTabsStatePayload(parsed)
    return res.json(normalized)
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read tab state', details: String(err?.message || err) })
  }
})

app.put('/api/tabs/state', async (req, res) => {
  try {
    const normalized = normalizeTabsStatePayload(req.body || {})
    await writeSettingValue(TAB_STATE_SETTINGS_KEY, JSON.stringify(normalized))
    return res.json(normalized)
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save tab state', details: String(err?.message || err) })
  }
})

app.get('/api/auto-download/settings', async (_req, res) => {
  try {
    const raw = await readSettingValue(AUTO_DOWNLOAD_SETTINGS_KEY)
    let parsed = {}
    if (raw) {
      try {
        parsed = JSON.parse(raw)
      } catch {
        parsed = {}
      }
    }

    return res.json(normalizeAutoDownloadSettingsPayload(parsed))
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read auto-download settings', details: String(err?.message || err) })
  }
})

app.put('/api/auto-download/settings', async (req, res) => {
  try {
    let existing = { ...DEFAULT_AUTO_DOWNLOAD_SETTINGS }
    const raw = await readSettingValue(AUTO_DOWNLOAD_SETTINGS_KEY)
    if (raw) {
      try {
        existing = normalizeAutoDownloadSettingsPayload(JSON.parse(raw))
      } catch {
        existing = { ...DEFAULT_AUTO_DOWNLOAD_SETTINGS }
      }
    }

    const incoming = (req.body && typeof req.body === 'object') ? req.body : {}
    const normalized = normalizeAutoDownloadSettingsPayload({ ...existing, ...incoming })
    await writeSettingValue(AUTO_DOWNLOAD_SETTINGS_KEY, JSON.stringify(normalized))
    return res.json(normalized)
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save auto-download settings', details: String(err?.message || err) })
  }
})

app.get('/api/download/settings', async (_req, res) => {
  try {
    return res.json(await readDownloadSettings())
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read download settings', details: String(err?.message || err) })
  }
})

app.put('/api/download/settings', async (req, res) => {
  try {
    const existing = await readDownloadSettings()
    const incoming = (req.body && typeof req.body === 'object') ? req.body : {}
    const normalized = normalizeDownloadSettingsPayload({ ...existing, ...incoming })
    await writeSettingValue(DOWNLOAD_SETTINGS_KEY, JSON.stringify(normalized))
    return res.json(normalized)
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save download settings', details: String(err?.message || err) })
  }
})

app.get('/api/yt-dlp/cookies/settings', async (_req, res) => {
  try {
    const settings = await readYtDlpCookieSettings()
    return res.json(settings)
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read yt-dlp cookie settings', details: String(err?.message || err) })
  }
})

app.put('/api/yt-dlp/cookies/settings', async (req, res) => {
  try {
    const existing = await readYtDlpCookieSettingsCore()
    const incoming = (req.body && typeof req.body === 'object') ? req.body : {}
    const normalized = normalizeYtDlpCookieSettingsPayload({ ...existing, ...incoming })

    const validationError = validateYtDlpCookieSettings(normalized)
    if (validationError) {
      return res.status(400).json({ error: validationError })
    }

    const saved = await writeYtDlpCookieSettings(normalized)
    return res.json(saved)
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save yt-dlp cookie settings', details: String(err?.message || err) })
  }
})

// GET /api/search?q=...&from=youtube|youtubemusic|spotify|soundcloud&offset=0
app.get('/api/search', async (req, res) => {
  const query = String(req.query.q || req.query.query || '').trim()
  const provider = normalizeSearchProvider(req.query.from || req.query.service)
  const offset = normalizeSearchOffset(req.query.offset)
  const limit = SEARCH_PAGE_SIZE

  if (!query) {
    return res.status(400).json({ error: 'Missing query' })
  }

  if (query.length > SEARCH_QUERY_MAX_LENGTH) {
    return res.status(400).json({ error: `Query must be ${SEARCH_QUERY_MAX_LENGTH} characters or fewer` })
  }

  const fallbackService = provider === 'youtubemusic' ? 'youtube' : provider
  const searchTarget = buildYtDlpSearchTarget(provider, query, offset + limit)

  try {
    const args = await buildYtDlpNetworkArgs([
      '--dump-single-json',
      '--no-warnings',
      '--flat-playlist',
      '--playlist-start',
      String(offset + 1),
      '--playlist-end',
      String(offset + limit),
      '--quiet',
      searchTarget,
    ])

    const stdout = await runCmd(YT_DLP, args, {
      timeout: 90 * 1000,
      maxBuffer: 80 * 1024 * 1024,
    })

    const data = parseYtDlpJson(stdout)
    const rawEntries = Array.isArray(data?.entries) ? data.entries : []
    const entries = []

    for (const rawEntry of rawEntries) {
      if (!rawEntry || typeof rawEntry !== 'object') continue

      const sourceUrl = resolveSearchEntryUrl(rawEntry, provider)
      if (!isValidHttpUrl(sourceUrl)) continue

      const resolvedService = resolveServiceKey(fallbackService, sourceUrl)
      const durationRaw = Number(rawEntry?.duration)
      const duration = Number.isFinite(durationRaw) && durationRaw >= 0 ? durationRaw : null
      const title = String(rawEntry?.title || '').trim() || sourceUrl
      const uploader = String(rawEntry?.uploader || rawEntry?.channel || rawEntry?.artist || '').trim()
      const id = String(rawEntry?.id || sourceUrl).trim() || sourceUrl

      entries.push({
        id,
        title,
        uploader,
        url: sourceUrl,
        service: resolvedService,
        thumbnail: pickSearchEntryThumbnail(rawEntry),
        duration,
        durationString: formatDurationLabel(duration),
      })

      if (entries.length >= limit) break
    }

    return res.json({
      query,
      from: provider,
      offset,
      limit,
      hasMore: entries.length >= limit,
      entries,
    })
  } catch (err) {
    const details = extractCommandErrorDetails(err)
    const ytDlpError = buildYtDlpErrorPayload(details)
    return res.status(500).json({
      error: 'Failed to run search',
      details: ytDlpError.rawMessage || details,
      ytDlpError,
    })
  }
})

app.get('/api/downloads', (req, res) => {
  const { q, service } = req.query;
  let sql = `SELECT * FROM downloads WHERE 1=1`;
  const params = [];

  if (q) {
    sql += ` AND (title LIKE ? OR filename LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`);
  }
  if (service) {
    const normalizedService = normalizeServiceKey(service)
    if (!normalizedService) {
      return res.json([])
    }

    if (normalizedService === GENERIC_SERVICE_KEY) {
      // Keep legacy rows (stored as "other") visible in the Generic filter.
      sql += ` AND (service = ? OR service = ?)`;
      params.push(GENERIC_SERVICE_KEY, 'other');
    } else {
      sql += ` AND service = ?`;
      params.push(normalizedService);
    }
  }

  sql += ` ORDER BY timestamp DESC`;

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    // Check file existence for each row
    const result = rows.map(row => {
      const filePath = path.join(DOWNLOADS_DIR, row.filename || '');
      return {
        ...row,
        cached: fs.existsSync(filePath)
      };
    });

    res.json(result);
  });
});

app.delete('/api/downloads/:id', (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM downloads WHERE id = ?`, [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

app.get('/health', async (_req, res) => {
  const checks = {
    db: false,
    ytDlp: false,
    ffmpeg: HAS_FFMPEG,
  }

  checks.db = await checkDbHealth()
  checks.ytDlp = await checkYtDlpHealth()

  const healthy = checks.db && checks.ytDlp
  const status = healthy ? 'ok' : 'degraded'
  return res.status(healthy ? 200 : 503).json({ status, checks })
})

// Helper: run a command and return stdout as string
function runCmd(cmd, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    const { env: extraEnv, ...restOpts } = opts
    const options = {
      maxBuffer: 10 * 1024 * 1024,
      ...restOpts,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', ...(extraEnv || {}) },
    }
    execFile(cmd, args, options, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr?.toString?.() || ''
        return reject(err)
      }
      resolve(stdout?.toString?.() || '')
    })
  })
}

function extractCommandErrorDetails(err) {
  const stderr = String(err?.stderr || '').trim()
  if (stderr) return stderr
  return String(err?.message || err || '').trim()
}

function buildYtDlpErrorPayload(rawError, fallbackCode = YT_DLP_ERROR_CODES.UNKNOWN) {
  const classified = classifyYtDlpError(rawError, fallbackCode)
  return {
    source: 'yt-dlp',
    code: classified.code || fallbackCode,
    rawMessage: classified.rawMessage || '',
    normalizedMessage: classified.normalizedMessage || '',
  }
}

function parseClockToSeconds(value) {
  const raw = String(value || '').trim()
  if (!raw) return null

  const match = raw.match(/^(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)$/)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return null

  return (hours * 3600) + (minutes * 60) + seconds
}

function extractFfmpegProgressSeconds(textChunk) {
  const text = String(textChunk || '')
  if (!text) return null

  let bestSeconds = null

  for (const match of text.matchAll(/out_time_ms=(\d+)/g)) {
    const micros = Number(match[1])
    if (!Number.isFinite(micros) || micros < 0) continue
    const seconds = micros / 1000000
    bestSeconds = bestSeconds == null ? seconds : Math.max(bestSeconds, seconds)
  }

  for (const match of text.matchAll(/(?:out_time=|time=)(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/g)) {
    const seconds = parseClockToSeconds(match[1])
    if (!Number.isFinite(seconds) || seconds < 0) continue
    bestSeconds = bestSeconds == null ? seconds : Math.max(bestSeconds, seconds)
  }

  return bestSeconds
}

function runFfmpegWithProgress(ffmpegArgs, { durationSeconds = null, onProgress = null } = {}) {
  const args = Array.isArray(ffmpegArgs) ? [...ffmpegArgs] : []
  if (!FFMPEG_BIN) return Promise.reject(new Error('ffmpeg is not configured'))
  if (!args.length) return Promise.reject(new Error('Missing ffmpeg arguments'))

  const outputArg = args.pop()
  const runArgs = [...args, '-progress', 'pipe:1', '-nostats', outputArg]
  const hasDuration = Number.isFinite(durationSeconds) && durationSeconds > 0

  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, runArgs)
    let stderrTail = ''

    const sendProgress = (rawValue) => {
      if (typeof onProgress !== 'function') return
      const numeric = Number(rawValue)
      if (!Number.isFinite(numeric)) return
      onProgress(Math.max(0, Math.min(1, numeric)))
    }

    const handleChunk = (chunk) => {
      if (!hasDuration) return
      const seconds = extractFfmpegProgressSeconds(chunk)
      if (!Number.isFinite(seconds)) return
      sendProgress(seconds / durationSeconds)
    }

    proc.stdout.on('data', handleChunk)
    proc.stderr.on('data', (chunk) => {
      const text = String(chunk || '')
      stderrTail = `${stderrTail}${text}`.slice(-24000)
      handleChunk(text)
    })

    proc.on('error', (err) => {
      reject(err)
    })

    proc.on('close', (code) => {
      sendProgress(1)

      if (code === 0) {
        resolve()
        return
      }

      const tailLines = stderrTail
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(-3)
        .join(' ')

      const suffix = tailLines ? ` ${tailLines}` : ''
      reject(new Error(`ffmpeg exited with code ${code}.${suffix}`.trim()))
    })
  })
}

// ── Media cut helpers ──────────────────────────────────────────────────────

function normalizeCutSegments(segments = [], trimStart = 0, trimEnd = null) {
  const hasTrimEnd = typeof trimEnd === 'number' && trimEnd > trimStart
  const upper = hasTrimEnd ? trimEnd : Number.POSITIVE_INFINITY

  const sorted = [...(segments || [])]
    .filter(s => typeof s?.start === 'number' && typeof s?.end === 'number' && s.end > s.start)
    .map((s) => ({
      start: Math.max(trimStart, Math.min(s.start, upper - 1)),
      end: Math.max(trimStart + 1, Math.min(s.end, upper)),
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start)

  const merged = []
  for (const seg of sorted) {
    const prev = merged[merged.length - 1]
    if (!prev) {
      merged.push(seg)
      continue
    }
    if (seg.start <= prev.end) {
      prev.end = Math.max(prev.end, seg.end)
    } else {
      merged.push(seg)
    }
  }

  return merged
}

function invertCutSegments(segments = [], trimStart = 0, trimEnd = null) {
  if (trimEnd == null || trimEnd <= trimStart) return []
  const normalized = normalizeCutSegments(segments, trimStart, trimEnd)
  if (!normalized.length) return [{ start: trimStart, end: trimEnd }]

  const keep = []
  let cursor = trimStart
  for (const seg of normalized) {
    const start = Math.max(trimStart, seg.start)
    const end = Math.min(trimEnd, seg.end)
    if (end <= start) continue
    if (start > cursor) {
      keep.push({ start: cursor, end: start })
    }
    cursor = Math.max(cursor, end)
  }
  if (cursor < trimEnd) {
    keep.push({ start: cursor, end: trimEnd })
  }

  return keep
}

/** Compute keep segments from trim range + selected segments and mode. */
function computeMediaKeepSegments(cuts, mediaDuration) {
  if (!cuts || !cuts.enabled) return null

  const trimStart = typeof cuts.trimStart === 'number' ? Math.max(0, cuts.trimStart) : 0
  const trimEnd =
    cuts.trimEnd != null && cuts.trimEnd > 0
      ? (mediaDuration != null ? Math.min(cuts.trimEnd, mediaDuration) : cuts.trimEnd)
      : mediaDuration

  if (trimEnd == null || trimEnd <= trimStart) return null

  const mode = cuts.mode === 'keep' ? 'keep' : 'remove'
  const selectedSegments = Array.isArray(cuts.segments)
    ? cuts.segments
    : (Array.isArray(cuts.removals) ? cuts.removals : [])

  const normalizedSelected = normalizeCutSegments(selectedSegments, trimStart, trimEnd)

  let keepSegments = null
  if (mode === 'keep') {
    keepSegments = normalizedSelected.length
      ? normalizedSelected
      : [{ start: trimStart, end: trimEnd }]
  } else {
    keepSegments = invertCutSegments(normalizedSelected, trimStart, trimEnd)
  }

  // Treat full-length keep as no-op.
  if (
    keepSegments.length === 1 &&
    keepSegments[0].start === 0 &&
    mediaDuration != null &&
    Math.abs(keepSegments[0].end - mediaDuration) < 1
  ) {
    return null
  }

  return keepSegments.length ? keepSegments : null
}

/** FFmpeg audio codec args for a given file extension */
function getAudioCodecArgs(extWithDot) {
  switch ((extWithDot || '').replace('.', '').toLowerCase()) {
    case 'mp3':  return ['-c:a', 'libmp3lame', '-q:a', '2']
    case 'm4a':  return ['-c:a', 'aac', '-b:a', '192k']
    case 'ogg':  return ['-c:a', 'libvorbis', '-q:a', '6']
    case 'opus': return ['-c:a', 'libopus', '-b:a', '128k']
    case 'flac': return ['-c:a', 'flac']
    case 'wav':  return ['-c:a', 'pcm_s16le']
    default:     return []
  }
}

function getVideoCodecArgs(extWithDot, hasAudio = true) {
  switch ((extWithDot || '').replace('.', '').toLowerCase()) {
    case 'webm':
      return hasAudio
        ? ['-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-c:a', 'libopus', '-b:a', '160k']
        : ['-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0']
    case 'mkv':
      return hasAudio
        ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '192k']
        : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20']
    case 'mp4':
    default:
      return hasAudio
        ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart']
        : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart']
  }
}

function resolveFfprobeBinary() {
  if (FFPROBE_BIN) return FFPROBE_BIN
  if (!FFMPEG_BIN) return ''
  const siblingName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
  const siblingPath = path.join(path.dirname(FFMPEG_BIN), siblingName)
  if (fs.existsSync(siblingPath)) return siblingPath
  return siblingName
}

async function detectHasAudioStream(inputPath) {
  const ffprobe = resolveFfprobeBinary()
  if (!ffprobe) return true

  try {
    const output = await runCmd(
      ffprobe,
      ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', inputPath],
      { timeout: 5000, maxBuffer: 256 * 1024 }
    )
    return String(output || '').trim().length > 0
  } catch {
    return true
  }
}

async function getMediaDurationSeconds(inputPath) {
  const ffprobe = resolveFfprobeBinary()
  if (!ffprobe) return null

  try {
    const output = await runCmd(
      ffprobe,
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', inputPath],
      { timeout: 5000, maxBuffer: 256 * 1024 }
    )

    const parsed = Number(String(output || '').trim())
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  } catch {
    return null
  }
}

/** Build ffmpeg args to cut audio to the supplied keep segments */
function buildAudioCutFfmpegArgs(inputPath, outputPath, keepSegments, ext) {
  const codecArgs = getAudioCodecArgs(ext)
  if (keepSegments.length === 1) {
    const seg = keepSegments[0]
    return ['-y', '-i', inputPath, '-ss', String(seg.start), '-to', String(seg.end), ...codecArgs, outputPath]
  }
  const filterParts = keepSegments.map(
    (seg, i) => `[0:a]atrim=${seg.start}:${seg.end},asetpts=PTS-STARTPTS[a${i}]`
  )
  const concatInputs = keepSegments.map((_, i) => `[a${i}]`).join('')
  const filter = [...filterParts, `${concatInputs}concat=n=${keepSegments.length}:v=0:a=1[out]`].join(';')
  return ['-y', '-i', inputPath, '-filter_complex', filter, '-map', '[out]', ...codecArgs, outputPath]
}

function buildVideoCutFfmpegArgs(inputPath, outputPath, keepSegments, ext, hasAudio = true) {
  const codecArgs = getVideoCodecArgs(ext, hasAudio)
  if (keepSegments.length === 1) {
    const seg = keepSegments[0]
    const mapArgs = hasAudio
      ? ['-map', '0:v:0', '-map', '0:a:0']
      : ['-map', '0:v:0']

    return [
      '-y',
      '-i', inputPath,
      '-ss', String(seg.start),
      '-to', String(seg.end),
      ...mapArgs,
      ...codecArgs,
      outputPath,
    ]
  }

  if (hasAudio) {
    const filterParts = keepSegments.flatMap((seg, i) => ([
      `[0:v]trim=${seg.start}:${seg.end},setpts=PTS-STARTPTS[v${i}]`,
      `[0:a]atrim=${seg.start}:${seg.end},asetpts=PTS-STARTPTS[a${i}]`,
    ]))
    const vInputs = keepSegments.map((_, i) => `[v${i}]`).join('')
    const aInputs = keepSegments.map((_, i) => `[a${i}]`).join('')
    const filter = [...filterParts, `${vInputs}${aInputs}concat=n=${keepSegments.length}:v=1:a=1[outv][outa]`].join(';')

    return [
      '-y',
      '-i', inputPath,
      '-filter_complex', filter,
      '-map', '[outv]',
      '-map', '[outa]',
      ...codecArgs,
      outputPath,
    ]
  }

  const filterParts = keepSegments.map((seg, i) => `[0:v]trim=${seg.start}:${seg.end},setpts=PTS-STARTPTS[v${i}]`)
  const vInputs = keepSegments.map((_, i) => `[v${i}]`).join('')
  const filter = [...filterParts, `${vInputs}concat=n=${keepSegments.length}:v=1:a=0[outv]`].join(';')

  return [
    '-y',
    '-i', inputPath,
    '-filter_complex', filter,
    '-map', '[outv]',
    ...codecArgs,
    outputPath,
  ]
}

// ── End media cut helpers ─────────────────────────────────────────────────

function buildYtDlpCookieArgs(cookieSettings) {
  const settings = normalizeYtDlpCookieSettingsPayload(cookieSettings)
  const args = []

  const cookieFilePath = normalizeCookieSettingText(settings.cookiesFilePath, 4096)
  if (settings.cookiesFileEnabled && cookieFilePath) {
    args.push('--cookies', cookieFilePath)
  }

  if (settings.cookiesFromBrowserEnabled && YLOADER_ALLOW_BROWSER_COOKIE_IMPORT) {
    const browserSpec = composeCookiesFromBrowserSpec(settings)
    if (browserSpec) {
      args.push('--cookies-from-browser', browserSpec)
    }
  }

  return args
}

async function buildYtDlpNetworkArgs(baseArgs = []) {
  const args = [...YT_DLP_JS_RUNTIME_ARGS]

  try {
    const cookieSettings = await readYtDlpCookieSettingsCore()
    args.push(...buildYtDlpCookieArgs(cookieSettings))
  } catch {
    args.push(...buildYtDlpCookieArgs(createDefaultYtDlpCookieSettings()))
  }

  if (YT_DLP_EXTRACTOR_ARGS) {
    args.push('--extractor-args', YT_DLP_EXTRACTOR_ARGS)
  }

  args.push(...baseArgs)
  return args
}

// Helper: sanitize filenames
function sanitizeFilename(str, maxLen = 200) {
  const sanitized = String(str || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLen)
    .replace(/[. ]+$/g, '')

  if (!sanitized || sanitized === '.' || sanitized === '..') return ''
  return sanitized
}

function toAsciiFilename(value, fallback = 'download') {
  const ascii = String(value || '')
    .normalize('NFKD')
    .replace(/[\r\n]/g, '')
    .replace(/["\\]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return ascii || fallback
}

function encodeRfc5987Value(value) {
  return encodeURIComponent(String(value || ''))
    .replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
}

function buildAttachmentContentDisposition(filename, fallback = 'download') {
  const clean = String(filename || '').replace(/[\r\n]/g, '').trim() || fallback
  const ascii = toAsciiFilename(clean, fallback)
  const encoded = encodeRfc5987Value(clean)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

function normalizeAudioContainer(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return ALLOWED_AUDIO_CONTAINERS.has(normalized) ? normalized : ''
}

function normalizeVideoContainer(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return ALLOWED_VIDEO_CONTAINERS.has(normalized) ? normalized : ''
}

function normalizeImageContainer(value) {
  const normalized = String(value || '').trim().toLowerCase().replace('jpeg', 'jpg')
  return ALLOWED_IMAGE_CONTAINERS.has(normalized) ? normalized : ''
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

function sanitizeFormatId(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.length > 120) return ''
  return FORMAT_ID_REGEX.test(raw) ? raw : ''
}

function isValidHttpUrl(value) {
  const raw = String(value || '').trim()
  if (!raw || raw.length > 2048) return false
  try {
    const parsed = new NodeURL(raw)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function parseYtDlpJson(raw) {
  const input = String(raw || '').trim()
  if (!input) return {}

  try {
    return JSON.parse(input)
  } catch {
    const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(lines[i])
      } catch {
        // continue
      }
    }
    throw new Error('yt-dlp did not return valid JSON metadata')
  }
}

function normalizeSearchProvider(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (SEARCH_PROVIDER_OPTIONS.has(normalized)) return normalized
  return 'youtube'
}

function normalizeSearchOffset(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(SEARCH_OFFSET_MAX, parsed))
}

function buildYtDlpSearchTarget(provider, query, desiredWindowEnd) {
  const safeQuery = String(query || '').trim()
  const parsedWindowEnd = Number.parseInt(String(desiredWindowEnd ?? ''), 10)
  const boundedWindowEnd = Number.isFinite(parsedWindowEnd)
    ? Math.max(SEARCH_PAGE_SIZE, Math.min(SEARCH_OFFSET_MAX + SEARCH_PAGE_SIZE, parsedWindowEnd))
    : SEARCH_PAGE_SIZE
  const encoded = encodeURIComponent(safeQuery)

  if (provider === 'soundcloud') {
    return `scsearch${boundedWindowEnd}:${safeQuery}`
  }

  if (provider === 'spotify') {
    return `spsearch${boundedWindowEnd}:${safeQuery}`
  }

  if (provider === 'youtubemusic') {
    return `https://music.youtube.com/search?q=${encoded}&sp=EgIQAQ%253D%253D`
  }

  return `https://www.youtube.com/results?search_query=${encoded}&sp=EgIQAQ%253D%253D`
}

function pickSearchEntryThumbnail(entry) {
  const directThumbnail = String(entry?.thumbnail || '').trim()
  if (isValidHttpUrl(directThumbnail)) return directThumbnail

  const thumbnails = Array.isArray(entry?.thumbnails) ? entry.thumbnails : []
  for (const thumbnail of thumbnails) {
    const targetUrl = String(thumbnail?.url || '').trim()
    if (isValidHttpUrl(targetUrl)) return targetUrl
  }

  return ''
}

function resolveSearchEntryUrl(entry, provider) {
  const webpageUrl = String(entry?.webpage_url || '').trim()
  if (isValidHttpUrl(webpageUrl)) return webpageUrl

  const rawUrl = String(entry?.url || '').trim()
  if (isValidHttpUrl(rawUrl)) return rawUrl

  if (provider === 'soundcloud' && rawUrl) {
    const normalized = rawUrl.startsWith('/')
      ? `https://soundcloud.com${rawUrl}`
      : `https://soundcloud.com/${rawUrl.replace(/^\/+/, '')}`
    if (isValidHttpUrl(normalized)) return normalized
  }

  const entryId = String(entry?.id || '').trim()
  if (!entryId) return ''

  if (provider === 'youtube' || provider === 'youtubemusic') {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(entryId)}`
  }

  if (provider === 'spotify') {
    return `https://open.spotify.com/track/${encodeURIComponent(entryId)}`
  }

  return ''
}

function formatDurationLabel(durationSeconds) {
  const numeric = Number(durationSeconds)
  if (!Number.isFinite(numeric)) return null

  const total = Math.max(0, Math.round(numeric))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad2 = (value) => String(value).padStart(2, '0')

  if (h > 0) {
    return `${h}:${pad2(m)}:${pad2(s)}`
  }
  return `${pad2(m)}:${pad2(s)}`
}

function readCachedMetaFormats(url) {
  const key = String(url || '').trim()
  if (!key) return null

  const cached = metaFormatsCache.get(key)
  if (!cached) return null

  if (cached.expiresAt <= Date.now()) {
    metaFormatsCache.delete(key)
    return null
  }

  return cached.payload
}

function writeCachedMetaFormats(url, payload) {
  const key = String(url || '').trim()
  if (!key || !payload || typeof payload !== 'object') return

  const now = Date.now()
  metaFormatsCache.set(key, {
    expiresAt: now + META_FORMATS_CACHE_TTL_MS,
    payload,
  })

  for (const [cacheKey, entry] of metaFormatsCache.entries()) {
    if (entry.expiresAt > now) continue
    metaFormatsCache.delete(cacheKey)
  }

  while (metaFormatsCache.size > META_FORMATS_CACHE_MAX_ENTRIES) {
    const oldestKey = metaFormatsCache.keys().next().value
    if (!oldestKey) break
    metaFormatsCache.delete(oldestKey)
  }
}

const YT_DLP_HEALTH_CACHE_TTL_MS = 60 * 1000
let ytDlpHealthCache = {
  checkedAt: 0,
  ok: false,
}

async function checkYtDlpHealth() {
  const now = Date.now()
  if (ytDlpHealthCache.checkedAt > 0 && (now - ytDlpHealthCache.checkedAt) < YT_DLP_HEALTH_CACHE_TTL_MS) {
    return ytDlpHealthCache.ok
  }

  let ok = false
  try {
    const version = await runCmd(YT_DLP, ['--version'], { timeout: 30000, maxBuffer: 256 * 1024 })
    ok = Boolean((version || '').trim())
  } catch {
    ok = false
  }

  ytDlpHealthCache = {
    checkedAt: Date.now(),
    ok,
  }

  return ok
}

function checkDbHealth() {
  return new Promise((resolve) => {
    db.get('SELECT 1 AS ok', (err) => {
      resolve(!err)
    })
  })
}

let YT_DLP = String(process.env.YT_DLP_PATH || '').trim()
if (YT_DLP && looksLikeFilePath(YT_DLP) && !isRegularFile(YT_DLP)) {
  YT_DLP = ''
}

const bundledYtDlp = findBundledYtDlpBinary()
if (!YT_DLP && bundledYtDlp) {
  YT_DLP = bundledYtDlp
}

if (!YT_DLP) {
  if (process.platform === 'win32') {
    YT_DLP = 'yt-dlp.exe'
  } else {
    YT_DLP = fs.existsSync('/usr/local/bin/yt-dlp') ? '/usr/local/bin/yt-dlp' : 'yt-dlp'
  }
}

if (FFMPEG_BIN && looksLikeFilePath(FFMPEG_BIN) && !isRegularFile(FFMPEG_BIN)) {
  FFMPEG_BIN = ''
}
const bundledFfmpeg = findBundledFfmpegBinary(process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
if (!FFMPEG_BIN && bundledFfmpeg) {
  FFMPEG_BIN = bundledFfmpeg
}

if (FFPROBE_BIN && looksLikeFilePath(FFPROBE_BIN) && !isRegularFile(FFPROBE_BIN)) {
  FFPROBE_BIN = ''
}
const bundledFfprobe = findBundledFfmpegBinary(process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
if (!FFPROBE_BIN && bundledFfprobe) {
  FFPROBE_BIN = bundledFfprobe
}
if (!FFPROBE_BIN && isRegularFile(FFMPEG_BIN)) {
  const siblingName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
  const siblingPath = path.join(path.dirname(FFMPEG_BIN), siblingName)
  if (isRegularFile(siblingPath)) {
    FFPROBE_BIN = siblingPath
  }
}

const YT_PIP = process.env.YT_PIP_PATH || ''
const YT_DLP_UPDATE_METHOD = (process.env.YT_DLP_UPDATE_METHOD || (YT_PIP ? 'pip' : 'self')).toLowerCase()
const YT_DLP_MANAGED_BY_YLOADER = String(process.env.YT_DLP_MANAGED_BY_YLOADER || '').trim().toLowerCase()
const FFMPEG_MANAGED_BY_YLOADER = String(process.env.FFMPEG_MANAGED_BY_YLOADER || '').trim().toLowerCase()
const DISABLED_UPDATE_METHODS = new Set(['disabled', 'none', 'system'])
const YTDLP_PATH_MARKERS = [
  path.normalize(path.join('.tools', 'yt-dlp-bin')).toLowerCase(),
  path.normalize(path.join('tools', 'yt-dlp-bin')).toLowerCase(),
]
const FFMPEG_PATH_MARKERS = [
  path.normalize(path.join('.tools', 'ffmpeg-bin')).toLowerCase(),
  path.normalize(path.join('tools', 'ffmpeg-bin')).toLowerCase(),
]

function isProjectManagedYtDlpBinary() {
  if (YT_DLP_MANAGED_BY_YLOADER === '1' || YT_DLP_MANAGED_BY_YLOADER === 'true' || YT_DLP_MANAGED_BY_YLOADER === 'yes' || YT_DLP_MANAGED_BY_YLOADER === 'on') {
    return true
  }

  const normalizedBinaryPath = path.normalize(String(YT_DLP || '')).toLowerCase()
  return YTDLP_PATH_MARKERS.some((marker) => normalizedBinaryPath.includes(marker))
}

function getEffectiveYtDlpUpdateMethod() {
  if (isProjectManagedYtDlpBinary() && DISABLED_UPDATE_METHODS.has(YT_DLP_UPDATE_METHOD)) {
    return 'self'
  }
  return YT_DLP_UPDATE_METHOD
}

function isYtDlpUpdateDisabled() {
  return DISABLED_UPDATE_METHODS.has(getEffectiveYtDlpUpdateMethod())
}

function getYtDlpUpdateCommand() {
  const effectiveMethod = getEffectiveYtDlpUpdateMethod()

  if (isYtDlpUpdateDisabled()) {
    return null
  }

  if (effectiveMethod === 'pip') {
    if (!YT_PIP) {
      throw new Error('YT_DLP_UPDATE_METHOD is set to "pip" but YT_PIP_PATH is missing')
    }
    return {
      cmd: YT_PIP,
      args: ['install', '-U', '--no-cache-dir', 'yt-dlp'],
      label: 'pip',
    }
  }

  return {
    cmd: YT_DLP,
    args: ['-U'],
    label: 'binary self-update',
  }
}

// Check if yt-dlp is accessible at startup
try {
  execFile(YT_DLP, ['--version'], (err, stdout) => {
    if (err) {
      console.error('⚠️  yt-dlp not accessible at:', YT_DLP)
      console.error('⚠️  Error:', err.message)
      console.error('❌ yt-dlp is required for downloads and metadata endpoints')
    } else {
      console.log('✅ yt-dlp found at:', YT_DLP)
      console.log('   Version:', stdout.trim())
    }
  })
} catch (e) {
  console.error('❌ Failed to check yt-dlp:', e.message)
}

// Check if ffmpeg is available (required for merging)
let HAS_FFMPEG = false
if (!FFMPEG_BIN) {
  console.error('⚠️  FFMPEG_PATH is not configured - video/audio merging features are disabled!')
  HAS_FFMPEG = false
} else {
  try {
    execFile(FFMPEG_BIN, ['-version'], (err, stdout) => {
      if (err) {
        console.error(`⚠️  ffmpeg not found at "${FFMPEG_BIN}" - video/audio merging will fail!`)
        HAS_FFMPEG = false
      } else {
        const firstLine = stdout.split('\n')[0]
        console.log('✅ ffmpeg found:', firstLine)
        HAS_FFMPEG = true
      }
    })
  } catch (e) {
    console.error('⚠️  ffmpeg check failed:', e.message)
    HAS_FFMPEG = false
  }
}

console.log(`Using yt-dlp: ${YT_DLP}`)
console.log(`Using ffmpeg: ${FFMPEG_BIN || '(not configured)'}`)
if (FFPROBE_BIN) {
  console.log(`Using ffprobe: ${FFPROBE_BIN}`)
}
console.log(`Runtime target: ${YLOADER_RUNTIME_TARGET}`)
console.log(`yt-dlp browser cookie import support: ${YLOADER_ALLOW_BROWSER_COOKIE_IMPORT ? 'enabled' : 'disabled'}`)
console.log(`yt-dlp JS runtimes: ${YT_DLP_JS_RUNTIMES}`)
console.log(`yt-dlp update method: ${getEffectiveYtDlpUpdateMethod()}${getEffectiveYtDlpUpdateMethod() !== YT_DLP_UPDATE_METHOD ? ` (configured: ${YT_DLP_UPDATE_METHOD})` : ''}`)
if (YT_DLP_COOKIES_FILE_ENV) {
  console.log(`yt-dlp cookies file default from env: ${YT_DLP_COOKIES_FILE_ENV}`)
}
if (YT_DLP_COOKIES_FROM_BROWSER_ENV) {
  console.log(`yt-dlp browser cookies default from env: ${YT_DLP_COOKIES_FROM_BROWSER_ENV}`)
}

// Downloads directory and cache settings
const DOWNLOADS_DIR = path.resolve(process.env.DOWNLOAD_DIR || './downloads')
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours
const activeDownloads = new Map() // Track active downloads by hash
const downloadSlotEmitter = new EventEmitter()
let nextDownloadStartAtMs = 0

function notifyDownloadSlotsChanged() {
  downloadSlotEmitter.emit('changed')
}

function waitForMilliseconds(ms, isResponseClosed) {
  const delay = Math.max(0, Number(ms) || 0)
  if (delay <= 0) return Promise.resolve()

  return new Promise((resolve, reject) => {
    let interval = null
    const timer = setTimeout(() => {
      if (interval) clearInterval(interval)
      resolve()
    }, delay)

    if (typeof isResponseClosed !== 'function') return

    interval = setInterval(() => {
      if (!isResponseClosed()) return
      clearTimeout(timer)
      clearInterval(interval)
      reject(new Error('Client disconnected'))
    }, Math.min(250, delay))

    timer.unref?.()
    interval.unref?.()
  })
}

async function waitForDownloadSlot(limit, { isResponseClosed = null, onQueued = null } = {}) {
  const maxConcurrent = Math.max(1, Number(limit) || 1)
  let queuedNotified = false

  while (activeDownloads.size >= maxConcurrent) {
    if (typeof isResponseClosed === 'function' && isResponseClosed()) {
      throw new Error('Client disconnected')
    }

    if (!queuedNotified && typeof onQueued === 'function') {
      onQueued()
      queuedNotified = true
    }

    await new Promise((resolve) => {
      let settled = false

      const finish = () => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        downloadSlotEmitter.off('changed', finish)
        resolve()
      }

      const timeout = setTimeout(finish, 1000)
      timeout.unref?.()

      downloadSlotEmitter.once('changed', finish)
    })
  }
}

async function waitForDownloadStagger(staggerMs, isResponseClosed = null) {
  const stagger = Math.max(0, Number(staggerMs) || 0)
  if (stagger <= 0) return

  const now = Date.now()
  const waitMs = Math.max(0, nextDownloadStartAtMs - now)
  nextDownloadStartAtMs = Math.max(nextDownloadStartAtMs, now) + stagger

  if (waitMs <= 0) return
  await waitForMilliseconds(waitMs, isResponseClosed)
}

// Ensure downloads directory exists
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true })
}

// Cleanup old files on startup and periodically
function cleanupOldFiles() {
  try {
    const now = Date.now()
    const files = fs.readdirSync(DOWNLOADS_DIR)
    for (const file of files) {
      const filePath = path.join(DOWNLOADS_DIR, file)
      const stats = fs.statSync(filePath)
      if (now - stats.mtimeMs > CACHE_DURATION_MS) {
        fs.unlinkSync(filePath)
        console.log(`Cleaned up old file: ${file}`)
      }
    }
  } catch (err) {
    console.error('Cleanup error:', err)
  }
}
cleanupOldFiles()
setInterval(cleanupOldFiles, 60 * 60 * 1000) // Run every hour

// --- Auto-Update Logic ---
const UPDATE_STATE_FILE = path.join(path.dirname(DB_PATH), 'updater_state.json')

const TOOL_UPDATE_STATE_VERSION = 2
const TOOL_UPDATE_MAX_NOTIFICATIONS = 120
const GITHUB_API_TOKEN = String(process.env.GITHUB_API_TOKEN || '').trim()
const FFMPEG_RELEASE_SOURCE = Object.freeze({ owner: 'eugeneware', repo: 'ffmpeg-static' })
const FFMPEG_ASSET_PLATFORM_MAP = Object.freeze({
  win32: Object.freeze({ x64: 'win32-x64' }),
  linux: Object.freeze({ x64: 'linux-x64', arm64: 'linux-arm64' }),
  darwin: Object.freeze({ x64: 'darwin-x64', arm64: 'darwin-arm64' }),
})

let toolUpdateCyclePromise = null
let toolUpdateScheduler = null

function normalizeVersion(v) {
  const raw = String(v || '').trim().toLowerCase()
  if (!raw) return ''

  const cleaned = raw
    .replace(/^v(?=\d)/, '')
    .replace(/^b(?=\d)/, '')
    .replace(/[^0-9.]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\./, '')
    .replace(/\.$/, '')

  return cleaned || raw
}

function versionsAreDifferent(a, b) {
  const left = normalizeVersion(a)
  const right = normalizeVersion(b)
  if (!left && !right) return false
  if (left && right) return left !== right
  return String(a || '').trim().toLowerCase() !== String(b || '').trim().toLowerCase()
}

function createDefaultToolStatusState() {
  return {
    currentVersion: '',
    latestVersion: '',
    latestReleaseTag: '',
    latestReleaseName: '',
    latestHtmlUrl: '',
    latestCheckedAt: 0,
    latestFromCache: false,
    latestSource: 'none',
    latestError: '',
    updateAvailable: false,
    updateSupported: false,
    updateInProgress: false,
    lastUpdatedAt: 0,
    lastUpdatedFrom: '',
    lastUpdatedTo: '',
    lastError: '',
  }
}

function createDefaultToolUpdateState() {
  return {
    version: TOOL_UPDATE_STATE_VERSION,
    lastCycleAt: 0,
    nextCycleAt: 0,
    tools: {
      ytDlp: createDefaultToolStatusState(),
      ffmpeg: createDefaultToolStatusState(),
    },
    notifications: [],
  }
}

function sanitizeToolStatusState(raw) {
  const base = createDefaultToolStatusState()
  const input = raw && typeof raw === 'object' ? raw : {}
  return {
    ...base,
    ...input,
    latestCheckedAt: Number(input.latestCheckedAt || 0),
    lastUpdatedAt: Number(input.lastUpdatedAt || 0),
    latestFromCache: Boolean(input.latestFromCache),
    updateAvailable: Boolean(input.updateAvailable),
    updateSupported: Boolean(input.updateSupported),
    updateInProgress: Boolean(input.updateInProgress),
  }
}

function sanitizeToolUpdateState(raw) {
  const base = createDefaultToolUpdateState()
  const input = raw && typeof raw === 'object' ? raw : {}
  const toolsInput = input.tools && typeof input.tools === 'object' ? input.tools : {}
  const notificationsInput = Array.isArray(input.notifications) ? input.notifications : []

  return {
    ...base,
    version: TOOL_UPDATE_STATE_VERSION,
    lastCycleAt: Number(input.lastCycleAt || 0),
    nextCycleAt: Number(input.nextCycleAt || 0),
    tools: {
      ytDlp: sanitizeToolStatusState(toolsInput.ytDlp),
      ffmpeg: sanitizeToolStatusState(toolsInput.ffmpeg),
    },
    notifications: notificationsInput
      .map((entry) => {
        const item = entry && typeof entry === 'object' ? entry : null
        if (!item) return null
        return {
          id: String(item.id || '').trim() || crypto.randomUUID(),
          tool: String(item.tool || '').trim() || 'ytDlp',
          type: String(item.type || '').trim() || 'updated',
          version: String(item.version || '').trim(),
          message: String(item.message || '').trim(),
          createdAt: Number(item.createdAt || Date.now()),
          consumed: Boolean(item.consumed),
        }
      })
      .filter(Boolean)
      .slice(-TOOL_UPDATE_MAX_NOTIFICATIONS),
  }
}

function loadToolUpdateState() {
  try {
    if (!fs.existsSync(UPDATE_STATE_FILE)) {
      return createDefaultToolUpdateState()
    }

    const parsed = JSON.parse(fs.readFileSync(UPDATE_STATE_FILE, 'utf-8'))
    const migrated = sanitizeToolUpdateState(parsed)

    if (parsed?.notify_user && parsed?.new_version) {
      migrated.notifications.push({
        id: crypto.randomUUID(),
        tool: 'ytDlp',
        type: 'updated',
        version: String(parsed.new_version || '').trim(),
        message: '',
        createdAt: Date.now(),
        consumed: false,
      })
      migrated.notifications = migrated.notifications.slice(-TOOL_UPDATE_MAX_NOTIFICATIONS)
    }

    return migrated
  } catch (err) {
    console.warn('Failed to load updater state:', err?.message || err)
    return createDefaultToolUpdateState()
  }
}

const toolUpdateState = loadToolUpdateState()

function saveToolUpdateState() {
  try {
    fs.writeFileSync(UPDATE_STATE_FILE, JSON.stringify(toolUpdateState, null, 2))
  } catch (err) {
    console.warn('Failed to persist updater state:', err?.message || err)
  }
}

function getToolState(tool) {
  if (tool !== 'ytDlp' && tool !== 'ffmpeg') {
    throw new Error(`Unknown tool state key: ${tool}`)
  }
  return toolUpdateState.tools[tool]
}

function patchToolState(tool, patch) {
  const target = getToolState(tool)
  Object.assign(target, patch)
  saveToolUpdateState()
  return target
}

function queueToolNotification({ tool, type, version = '', message = '' }) {
  const normalizedTool = String(tool || '').trim()
  const normalizedType = String(type || '').trim()
  const normalizedVersion = String(version || '').trim()
  const normalizedMessage = String(message || '').trim()
  if (!normalizedTool || !normalizedType) return

  const alreadyQueued = toolUpdateState.notifications.some((entry) => (
    !entry.consumed
    && entry.tool === normalizedTool
    && entry.type === normalizedType
    && entry.version === normalizedVersion
  ))
  if (alreadyQueued) return

  toolUpdateState.notifications.push({
    id: crypto.randomUUID(),
    tool: normalizedTool,
    type: normalizedType,
    version: normalizedVersion,
    message: normalizedMessage,
    createdAt: Date.now(),
    consumed: false,
  })
  toolUpdateState.notifications = toolUpdateState.notifications.slice(-TOOL_UPDATE_MAX_NOTIFICATIONS)
  saveToolUpdateState()
}

function consumeToolNotifications(filterFn = null) {
  const pending = []
  const hasFilter = typeof filterFn === 'function'

  for (const notification of toolUpdateState.notifications) {
    if (notification.consumed) continue
    if (hasFilter && !filterFn(notification)) continue
    notification.consumed = true
    pending.push(notification)
  }

  if (pending.length) {
    saveToolUpdateState()
  }

  return pending
}

function getGitHubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'yLoader',
  }

  if (GITHUB_API_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_API_TOKEN}`
  }

  return headers
}

async function fetchLatestGitHubRelease(owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`
  const response = await fetch(url, { headers: getGitHubHeaders() })
  if (!response.ok) {
    throw new Error(`GitHub releases API returned ${response.status} for ${owner}/${repo}`)
  }

  const payload = await response.json()
  if (!payload || typeof payload !== 'object') {
    throw new Error(`GitHub releases API returned invalid payload for ${owner}/${repo}`)
  }

  return payload
}

function getYtDlpLatestCacheSnapshot() {
  const hasVersion = Boolean(ytDlpLatestVersionCache.version)
  return {
    latestVersion: hasVersion ? ytDlpLatestVersionCache.version : '',
    latestReleaseTag: hasVersion ? ytDlpLatestVersionCache.releaseTag : '',
    latestReleaseName: hasVersion ? ytDlpLatestVersionCache.releaseName : '',
    latestHtmlUrl: hasVersion ? ytDlpLatestVersionCache.htmlUrl : '',
    latestFromCache: hasVersion,
    latestCheckedAt: hasVersion ? ytDlpLatestVersionCache.fetchedAt : 0,
    latestSource: hasVersion ? 'cache' : 'none',
  }
}

function isYtDlpLatestCacheFresh(now = Date.now()) {
  if (!ytDlpLatestVersionCache.version || !ytDlpLatestVersionCache.fetchedAt) return false
  return (now - ytDlpLatestVersionCache.fetchedAt) < YT_DLP_LATEST_CACHE_TTL_MS
}

async function fetchLatestYtDlpVersionFromGitHub() {
  const release = await fetchLatestGitHubRelease('yt-dlp', 'yt-dlp')
  const releaseTag = String(release?.tag_name || '').trim()
  const releaseName = String(release?.name || '').trim()
  const fallbackVersion = releaseTag.replace(/^v/i, '')
  const latestVersion = fallbackVersion || releaseName

  if (!latestVersion) {
    throw new Error('GitHub release response did not include a yt-dlp version')
  }

  return {
    latestVersion,
    latestReleaseTag: releaseTag,
    latestReleaseName: releaseName,
    latestHtmlUrl: String(release?.html_url || '').trim(),
  }
}

async function getLatestYtDlpVersion({ forceRefresh = false } = {}) {
  const now = Date.now()

  if (!forceRefresh && isYtDlpLatestCacheFresh(now)) {
    return {
      latestVersion: ytDlpLatestVersionCache.version,
      latestReleaseTag: ytDlpLatestVersionCache.releaseTag,
      latestReleaseName: ytDlpLatestVersionCache.releaseName,
      latestHtmlUrl: ytDlpLatestVersionCache.htmlUrl,
      latestFromCache: true,
      latestCheckedAt: ytDlpLatestVersionCache.fetchedAt,
      latestSource: 'cache',
    }
  }

  if (!forceRefresh && ytDlpLatestVersionFetchPromise) {
    return ytDlpLatestVersionFetchPromise
  }

  const requestPromise = (async () => {
    const latestInfo = await fetchLatestYtDlpVersionFromGitHub()
    ytDlpLatestVersionCache.version = latestInfo.latestVersion
    ytDlpLatestVersionCache.releaseTag = latestInfo.latestReleaseTag
    ytDlpLatestVersionCache.releaseName = latestInfo.latestReleaseName
    ytDlpLatestVersionCache.htmlUrl = latestInfo.latestHtmlUrl
    ytDlpLatestVersionCache.fetchedAt = Date.now()

    return {
      ...latestInfo,
      latestFromCache: false,
      latestCheckedAt: ytDlpLatestVersionCache.fetchedAt,
      latestSource: 'network',
    }
  })()

  ytDlpLatestVersionFetchPromise = requestPromise

  try {
    return await requestPromise
  } finally {
    if (ytDlpLatestVersionFetchPromise === requestPromise) {
      ytDlpLatestVersionFetchPromise = null
    }
  }
}

function getFfmpegLatestCacheSnapshot() {
  const hasVersion = Boolean(ffmpegLatestVersionCache.version)
  return {
    latestVersion: hasVersion ? ffmpegLatestVersionCache.version : '',
    latestReleaseTag: hasVersion ? ffmpegLatestVersionCache.releaseTag : '',
    latestReleaseName: hasVersion ? ffmpegLatestVersionCache.releaseName : '',
    latestHtmlUrl: hasVersion ? ffmpegLatestVersionCache.htmlUrl : '',
    latestFromCache: hasVersion,
    latestCheckedAt: hasVersion ? ffmpegLatestVersionCache.fetchedAt : 0,
    latestSource: hasVersion ? 'cache' : 'none',
  }
}

function isFfmpegLatestCacheFresh(now = Date.now()) {
  if (!ffmpegLatestVersionCache.version || !ffmpegLatestVersionCache.fetchedAt) return false
  return (now - ffmpegLatestVersionCache.fetchedAt) < FFMPEG_LATEST_CACHE_TTL_MS
}

function getFfmpegAssetKey(platform = process.platform, arch = process.arch) {
  const byPlatform = FFMPEG_ASSET_PLATFORM_MAP[platform]
  if (!byPlatform) return ''
  return byPlatform[arch] || ''
}

function findReleaseAssetByName(release, name) {
  const assets = Array.isArray(release?.assets) ? release.assets : []
  return assets.find((asset) => String(asset?.name || '').trim() === name) || null
}

async function fetchLatestFfmpegReleaseInfo() {
  const release = await fetchLatestGitHubRelease(FFMPEG_RELEASE_SOURCE.owner, FFMPEG_RELEASE_SOURCE.repo)
  const assetKey = getFfmpegAssetKey(process.platform, process.arch)
  if (!assetKey) {
    throw new Error(`No ffmpeg release asset mapping for ${process.platform}/${process.arch}`)
  }

  const ffmpegAssetName = `ffmpeg-${assetKey}`
  const ffprobeAssetName = `ffprobe-${assetKey}`
  const ffmpegAsset = findReleaseAssetByName(release, ffmpegAssetName)
  const ffprobeAsset = findReleaseAssetByName(release, ffprobeAssetName)

  if (!ffmpegAsset || !ffprobeAsset) {
    throw new Error(`Release ${release?.tag_name || 'latest'} is missing ${ffmpegAssetName} or ${ffprobeAssetName}`)
  }

  const releaseTag = String(release?.tag_name || '').trim()
  const releaseName = String(release?.name || '').trim()
  const parsedTagVersion = releaseTag.replace(/^[^0-9]*/, '')
  const parsedNameVersion = releaseName.replace(/^[^0-9]*/, '')
  const latestVersion = parsedTagVersion || parsedNameVersion || releaseTag || releaseName

  return {
    latestVersion,
    latestReleaseTag: releaseTag,
    latestReleaseName: releaseName,
    latestHtmlUrl: String(release?.html_url || '').trim(),
    ffmpegAssetName,
    ffprobeAssetName,
    ffmpegAssetUrl: String(ffmpegAsset?.browser_download_url || '').trim(),
    ffprobeAssetUrl: String(ffprobeAsset?.browser_download_url || '').trim(),
  }
}

async function getLatestFfmpegVersion({ forceRefresh = false } = {}) {
  const now = Date.now()

  if (!forceRefresh && isFfmpegLatestCacheFresh(now)) {
    return {
      latestVersion: ffmpegLatestVersionCache.version,
      latestReleaseTag: ffmpegLatestVersionCache.releaseTag,
      latestReleaseName: ffmpegLatestVersionCache.releaseName,
      latestHtmlUrl: ffmpegLatestVersionCache.htmlUrl,
      latestFromCache: true,
      latestCheckedAt: ffmpegLatestVersionCache.fetchedAt,
      latestSource: 'cache',
      ffmpegAssetName: ffmpegLatestVersionCache.ffmpegAssetName || '',
      ffprobeAssetName: ffmpegLatestVersionCache.ffprobeAssetName || '',
      ffmpegAssetUrl: ffmpegLatestVersionCache.ffmpegAssetUrl || '',
      ffprobeAssetUrl: ffmpegLatestVersionCache.ffprobeAssetUrl || '',
    }
  }

  if (!forceRefresh && ffmpegLatestVersionFetchPromise) {
    return ffmpegLatestVersionFetchPromise
  }

  const requestPromise = (async () => {
    const latestInfo = await fetchLatestFfmpegReleaseInfo()
    ffmpegLatestVersionCache.version = latestInfo.latestVersion
    ffmpegLatestVersionCache.releaseTag = latestInfo.latestReleaseTag
    ffmpegLatestVersionCache.releaseName = latestInfo.latestReleaseName
    ffmpegLatestVersionCache.htmlUrl = latestInfo.latestHtmlUrl
    ffmpegLatestVersionCache.ffmpegAssetName = latestInfo.ffmpegAssetName
    ffmpegLatestVersionCache.ffprobeAssetName = latestInfo.ffprobeAssetName
    ffmpegLatestVersionCache.ffmpegAssetUrl = latestInfo.ffmpegAssetUrl
    ffmpegLatestVersionCache.ffprobeAssetUrl = latestInfo.ffprobeAssetUrl
    ffmpegLatestVersionCache.fetchedAt = Date.now()

    return {
      ...latestInfo,
      latestFromCache: false,
      latestCheckedAt: ffmpegLatestVersionCache.fetchedAt,
      latestSource: 'network',
    }
  })()

  ffmpegLatestVersionFetchPromise = requestPromise

  try {
    return await requestPromise
  } finally {
    if (ffmpegLatestVersionFetchPromise === requestPromise) {
      ffmpegLatestVersionFetchPromise = null
    }
  }
}

function getFfmpegMetadataPath(ffmpegPath = FFMPEG_BIN) {
  const binaryPath = String(ffmpegPath || '').trim()
  if (!binaryPath) return ''
  return path.join(path.dirname(binaryPath), '.yloader-ffmpeg-release.json')
}

function readFfmpegMetadata(ffmpegPath = FFMPEG_BIN) {
  const metadataPath = getFfmpegMetadataPath(ffmpegPath)
  if (!metadataPath || !fs.existsSync(metadataPath)) return null

  try {
    const parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
    if (!parsed || typeof parsed !== 'object') return null
    return {
      releaseTag: String(parsed.releaseTag || '').trim(),
      releaseName: String(parsed.releaseName || '').trim(),
      version: String(parsed.version || '').trim(),
      installedAt: Number(parsed.installedAt || 0),
      ffmpegAssetName: String(parsed.ffmpegAssetName || '').trim(),
      ffprobeAssetName: String(parsed.ffprobeAssetName || '').trim(),
    }
  } catch {
    return null
  }
}

function writeFfmpegMetadata(info, ffmpegPath = FFMPEG_BIN) {
  const metadataPath = getFfmpegMetadataPath(ffmpegPath)
  if (!metadataPath) return

  const payload = {
    releaseTag: String(info?.releaseTag || '').trim(),
    releaseName: String(info?.releaseName || '').trim(),
    version: String(info?.version || '').trim(),
    ffmpegAssetName: String(info?.ffmpegAssetName || '').trim(),
    ffprobeAssetName: String(info?.ffprobeAssetName || '').trim(),
    installedAt: Date.now(),
  }

  try {
    fs.writeFileSync(metadataPath, JSON.stringify(payload, null, 2))
  } catch (err) {
    console.warn('Failed to write ffmpeg release metadata:', err?.message || err)
  }
}

function parseBooleanQueryFlag(value) {
  const raw = String(value || '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

function getEffectiveFfprobeBinaryPath() {
  if (FFPROBE_BIN && isRegularFile(FFPROBE_BIN)) {
    return FFPROBE_BIN
  }

  if (!FFMPEG_BIN) return ''
  const fallbackName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
  const siblingPath = path.join(path.dirname(FFMPEG_BIN), fallbackName)
  if (isRegularFile(siblingPath)) {
    FFPROBE_BIN = siblingPath
    return siblingPath
  }

  return ''
}

async function refreshYtDlpUpdateStatus({ forceLatest = false, localOnly = false } = {}) {
  const updateSupported = !isYtDlpUpdateDisabled()
  const currentRaw = await runCmd(YT_DLP, ['--version'])
  const firstLine = String(currentRaw || '').split(/\r?\n/).find(Boolean) || ''
  const currentVersion = extractVersionToken(firstLine)

  let latestVersion = currentVersion
  let latestReleaseTag = ''
  let latestReleaseName = ''
  let latestHtmlUrl = ''
  let latestFromCache = false
  let latestCheckedAt = 0
  let latestSource = 'none'
  let latestError = ''

  if (localOnly) {
    const cached = getYtDlpLatestCacheSnapshot()
    if (cached.latestVersion) {
      latestVersion = cached.latestVersion
      latestReleaseTag = cached.latestReleaseTag
      latestReleaseName = cached.latestReleaseName
      latestHtmlUrl = cached.latestHtmlUrl
      latestFromCache = true
      latestCheckedAt = Number(cached.latestCheckedAt || 0)
      latestSource = cached.latestSource || 'cache'
    }
  } else {
    try {
      const latestInfo = await getLatestYtDlpVersion({ forceRefresh: forceLatest })
      latestVersion = latestInfo.latestVersion || currentVersion
      latestReleaseTag = latestInfo.latestReleaseTag || ''
      latestReleaseName = latestInfo.latestReleaseName || ''
      latestHtmlUrl = latestInfo.latestHtmlUrl || ''
      latestFromCache = Boolean(latestInfo.latestFromCache)
      latestCheckedAt = Number(latestInfo.latestCheckedAt || 0)
      latestSource = String(latestInfo.latestSource || 'none')
    } catch (err) {
      latestError = String(err?.message || err)
      const cached = getYtDlpLatestCacheSnapshot()
      if (cached.latestVersion) {
        latestVersion = cached.latestVersion
        latestReleaseTag = cached.latestReleaseTag
        latestReleaseName = cached.latestReleaseName
        latestHtmlUrl = cached.latestHtmlUrl
        latestFromCache = true
        latestCheckedAt = Number(cached.latestCheckedAt || 0)
        latestSource = 'cache-fallback'
      }
    }
  }

  const updateAvailable = Boolean(currentVersion && latestVersion && versionsAreDifferent(latestVersion, currentVersion))

  patchToolState('ytDlp', {
    currentVersion,
    latestVersion,
    latestReleaseTag,
    latestReleaseName,
    latestHtmlUrl,
    latestCheckedAt,
    latestFromCache,
    latestSource,
    latestError,
    updateAvailable,
    updateSupported,
    lastError: '',
  })

  return {
    currentVersion,
    latestVersion,
    latestReleaseTag,
    latestReleaseName,
    latestHtmlUrl,
    latestCheckedAt,
    latestFromCache,
    latestSource,
    latestError,
    updateAvailable,
    updateSupported,
  }
}

async function refreshFfmpegUpdateStatus({ forceLatest = false, localOnly = false } = {}) {
  const projectManaged = isProjectManagedFfmpegBinary()
  const updateSupported = Boolean(projectManaged && FFMPEG_BIN)
  const ffprobePath = getEffectiveFfprobeBinaryPath()

  const versionLine = await readBinaryVersionLine(FFMPEG_BIN)
  const currentVersion = extractVersionToken(versionLine)

  const ffprobeVersionLine = ffprobePath ? await readBinaryVersionLine(ffprobePath).catch(() => '') : ''
  const ffprobeVersion = extractVersionToken(ffprobeVersionLine)

  let latestVersion = currentVersion
  let latestReleaseTag = ''
  let latestReleaseName = ''
  let latestHtmlUrl = ''
  let latestFromCache = false
  let latestCheckedAt = 0
  let latestSource = 'none'
  let latestError = ''
  let ffmpegAssetName = ''
  let ffprobeAssetName = ''

  if (localOnly) {
    const cached = getFfmpegLatestCacheSnapshot()
    if (cached.latestVersion) {
      latestVersion = cached.latestVersion
      latestReleaseTag = cached.latestReleaseTag
      latestReleaseName = cached.latestReleaseName
      latestHtmlUrl = cached.latestHtmlUrl
      latestFromCache = true
      latestCheckedAt = Number(cached.latestCheckedAt || 0)
      latestSource = cached.latestSource || 'cache'
    }
  } else {
    try {
      const latestInfo = await getLatestFfmpegVersion({ forceRefresh: forceLatest })
      latestVersion = latestInfo.latestVersion || currentVersion
      latestReleaseTag = latestInfo.latestReleaseTag || ''
      latestReleaseName = latestInfo.latestReleaseName || ''
      latestHtmlUrl = latestInfo.latestHtmlUrl || ''
      latestFromCache = Boolean(latestInfo.latestFromCache)
      latestCheckedAt = Number(latestInfo.latestCheckedAt || 0)
      latestSource = String(latestInfo.latestSource || 'none')
      ffmpegAssetName = latestInfo.ffmpegAssetName || ''
      ffprobeAssetName = latestInfo.ffprobeAssetName || ''
    } catch (err) {
      latestError = String(err?.message || err)
      const cached = getFfmpegLatestCacheSnapshot()
      if (cached.latestVersion) {
        latestVersion = cached.latestVersion
        latestReleaseTag = cached.latestReleaseTag
        latestReleaseName = cached.latestReleaseName
        latestHtmlUrl = cached.latestHtmlUrl
        latestFromCache = true
        latestCheckedAt = Number(cached.latestCheckedAt || 0)
        latestSource = 'cache-fallback'
      }
    }
  }

  const installedMeta = readFfmpegMetadata(FFMPEG_BIN)
  let updateAvailable = false
  if (installedMeta?.releaseTag && latestReleaseTag) {
    updateAvailable = versionsAreDifferent(installedMeta.releaseTag, latestReleaseTag)
  } else if (currentVersion && latestVersion) {
    updateAvailable = versionsAreDifferent(currentVersion, latestVersion)
  }

  patchToolState('ffmpeg', {
    currentVersion,
    latestVersion,
    latestReleaseTag,
    latestReleaseName,
    latestHtmlUrl,
    latestCheckedAt,
    latestFromCache,
    latestSource,
    latestError,
    updateAvailable,
    updateSupported,
    ffmpegAssetName,
    ffprobeAssetName,
    ffprobeVersion,
    lastError: '',
  })

  return {
    currentVersion,
    latestVersion,
    latestReleaseTag,
    latestReleaseName,
    latestHtmlUrl,
    latestCheckedAt,
    latestFromCache,
    latestSource,
    latestError,
    updateAvailable,
    updateSupported,
    ffmpegAssetName,
    ffprobeAssetName,
    ffprobeVersion,
  }
}

async function downloadBinaryAsset(url, destinationPath) {
  const response = await fetch(url, { headers: getGitHubHeaders() })
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true })
  fs.writeFileSync(destinationPath, Buffer.from(arrayBuffer))
}

function replaceFileSafely(targetPath, tempPath) {
  const backupPath = `${targetPath}.bak`
  try {
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath)
    }
  } catch {
    // ignore stale backup cleanup errors
  }

  const hadTarget = fs.existsSync(targetPath)
  if (hadTarget) {
    fs.renameSync(targetPath, backupPath)
  }

  try {
    fs.renameSync(tempPath, targetPath)
    try {
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath)
      }
    } catch {
      // ignore backup cleanup failure
    }
  } catch (err) {
    if (hadTarget && fs.existsSync(backupPath) && !fs.existsSync(targetPath)) {
      try {
        fs.renameSync(backupPath, targetPath)
      } catch {
        // ignore restore failure
      }
    }
    throw err
  }
}

async function runYtDlpUpdate({ onLog = null } = {}) {
  const updateCmd = getYtDlpUpdateCommand()
  if (!updateCmd) {
    throw new Error(`Updates are managed externally for this yt-dlp installation (${YT_DLP_UPDATE_METHOD}).`)
  }

  const status = getToolState('ytDlp')
  if (status.updateInProgress) {
    throw new Error('yt-dlp update is already running')
  }

  patchToolState('ytDlp', { updateInProgress: true, lastError: '' })

  const log = (message) => {
    if (typeof onLog === 'function') {
      onLog(String(message || ''))
    }
  }

  try {
    const beforeRaw = await runCmd(YT_DLP, ['--version']).catch(() => '')
    const beforeVersion = extractVersionToken(String(beforeRaw || '').split(/\r?\n/).find(Boolean) || '')

    log(`Starting yt-dlp update via ${updateCmd.label}...`)
    const output = await runCmd(updateCmd.cmd, updateCmd.args, { maxBuffer: 10 * 1024 * 1024 })
    const outputLines = String(output || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    for (const line of outputLines.slice(-20)) {
      log(line)
    }

    const afterRaw = await runCmd(YT_DLP, ['--version']).catch(() => '')
    const afterVersion = extractVersionToken(String(afterRaw || '').split(/\r?\n/).find(Boolean) || '')

    const latestInfo = await getLatestYtDlpVersion({ forceRefresh: true }).catch(() => null)
    const latestVersion = latestInfo?.latestVersion || afterVersion
    const latestReleaseTag = latestInfo?.latestReleaseTag || ''
    const latestReleaseName = latestInfo?.latestReleaseName || ''
    const latestHtmlUrl = latestInfo?.latestHtmlUrl || ''
    const updateAvailable = Boolean(afterVersion && latestVersion && versionsAreDifferent(afterVersion, latestVersion))

    patchToolState('ytDlp', {
      currentVersion: afterVersion,
      latestVersion,
      latestReleaseTag,
      latestReleaseName,
      latestHtmlUrl,
      latestCheckedAt: Number(latestInfo?.latestCheckedAt || Date.now()),
      latestFromCache: Boolean(latestInfo?.latestFromCache),
      latestSource: String(latestInfo?.latestSource || 'network'),
      latestError: '',
      updateAvailable,
      lastUpdatedAt: Date.now(),
      lastUpdatedFrom: beforeVersion,
      lastUpdatedTo: afterVersion,
      lastError: '',
      updateInProgress: false,
    })

    if (beforeVersion && afterVersion && versionsAreDifferent(beforeVersion, afterVersion)) {
      queueToolNotification({ tool: 'ytDlp', type: 'updated', version: afterVersion })
    }

    return {
      beforeVersion,
      afterVersion,
      latestVersion,
      updated: Boolean(beforeVersion && afterVersion && versionsAreDifferent(beforeVersion, afterVersion)),
    }
  } catch (err) {
    patchToolState('ytDlp', {
      updateInProgress: false,
      lastError: String(err?.message || err),
    })
    throw err
  }
}

async function runFfmpegUpdate({ onLog = null } = {}) {
  if (!FFMPEG_BIN) {
    throw new Error('FFMPEG_PATH is not configured')
  }
  if (!isProjectManagedFfmpegBinary()) {
    throw new Error('Updates are managed externally for this ffmpeg installation')
  }

  const status = getToolState('ffmpeg')
  if (status.updateInProgress) {
    throw new Error('ffmpeg update is already running')
  }

  patchToolState('ffmpeg', { updateInProgress: true, lastError: '' })
  const log = (message) => {
    if (typeof onLog === 'function') {
      onLog(String(message || ''))
    }
  }

  const ffprobePath = getEffectiveFfprobeBinaryPath()
  const beforeVersionLine = await readBinaryVersionLine(FFMPEG_BIN).catch(() => '')
  const beforeVersion = extractVersionToken(beforeVersionLine)

  const tempDir = path.join(path.dirname(FFMPEG_BIN), `.ffmpeg-update-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`)

  try {
    const latestInfo = await getLatestFfmpegVersion({ forceRefresh: true })
    if (!latestInfo.ffmpegAssetUrl || !latestInfo.ffprobeAssetUrl) {
      throw new Error('Latest ffmpeg release does not include required assets for this platform')
    }

    fs.mkdirSync(tempDir, { recursive: true })
    const ffmpegTempPath = path.join(tempDir, path.basename(FFMPEG_BIN))
    const targetFfprobePath = ffprobePath || path.join(path.dirname(FFMPEG_BIN), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
    const ffprobeTempPath = path.join(tempDir, path.basename(targetFfprobePath))

    log(`Downloading ${latestInfo.ffmpegAssetName}...`)
    await downloadBinaryAsset(latestInfo.ffmpegAssetUrl, ffmpegTempPath)
    log(`Downloading ${latestInfo.ffprobeAssetName}...`)
    await downloadBinaryAsset(latestInfo.ffprobeAssetUrl, ffprobeTempPath)

    if (process.platform !== 'win32') {
      fs.chmodSync(ffmpegTempPath, 0o755)
      fs.chmodSync(ffprobeTempPath, 0o755)
    }

    log('Replacing ffmpeg binary...')
    replaceFileSafely(FFMPEG_BIN, ffmpegTempPath)
    log('Replacing ffprobe binary...')
    replaceFileSafely(targetFfprobePath, ffprobeTempPath)

    FFPROBE_BIN = targetFfprobePath

    const afterVersionLine = await readBinaryVersionLine(FFMPEG_BIN).catch(() => '')
    const afterVersion = extractVersionToken(afterVersionLine)

    writeFfmpegMetadata({
      releaseTag: latestInfo.latestReleaseTag,
      releaseName: latestInfo.latestReleaseName,
      version: latestInfo.latestVersion,
      ffmpegAssetName: latestInfo.ffmpegAssetName,
      ffprobeAssetName: latestInfo.ffprobeAssetName,
    }, FFMPEG_BIN)

    patchToolState('ffmpeg', {
      currentVersion: afterVersion,
      latestVersion: latestInfo.latestVersion,
      latestReleaseTag: latestInfo.latestReleaseTag,
      latestReleaseName: latestInfo.latestReleaseName,
      latestHtmlUrl: latestInfo.latestHtmlUrl,
      latestCheckedAt: Number(latestInfo.latestCheckedAt || Date.now()),
      latestFromCache: Boolean(latestInfo.latestFromCache),
      latestSource: String(latestInfo.latestSource || 'network'),
      latestError: '',
      updateAvailable: false,
      lastUpdatedAt: Date.now(),
      lastUpdatedFrom: beforeVersion,
      lastUpdatedTo: afterVersion,
      lastError: '',
      updateInProgress: false,
    })

    if (beforeVersion && afterVersion && versionsAreDifferent(beforeVersion, afterVersion)) {
      queueToolNotification({ tool: 'ffmpeg', type: 'updated', version: afterVersion })
    }

    return {
      beforeVersion,
      afterVersion,
      latestVersion: latestInfo.latestVersion,
      updated: Boolean(beforeVersion && afterVersion && versionsAreDifferent(beforeVersion, afterVersion)),
    }
  } catch (err) {
    patchToolState('ffmpeg', {
      updateInProgress: false,
      lastError: String(err?.message || err),
    })
    throw err
  } finally {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    } catch {
      // ignore cleanup errors
    }
  }
}

async function runToolUpdateCycle({ force = false } = {}) {
  if (toolUpdateCyclePromise) {
    return toolUpdateCyclePromise
  }

  toolUpdateCyclePromise = (async () => {
    const now = Date.now()
    if (!force && toolUpdateState.nextCycleAt && now < toolUpdateState.nextCycleAt) {
      return
    }

    const settings = await readToolUpdaterSettings().catch(() => ({ ...DEFAULT_TOOL_UPDATER_SETTINGS }))

    try {
      const ytStatus = await refreshYtDlpUpdateStatus({ forceLatest: true })
      if (ytStatus.updateAvailable && ytStatus.updateSupported && settings.ytDlpAutoUpdate) {
        queueToolNotification({ tool: 'ytDlp', type: 'installing', version: ytStatus.latestVersion })
        await runYtDlpUpdate()
      }
    } catch (err) {
      patchToolState('ytDlp', { lastError: String(err?.message || err) })
    }

    try {
      if (FFMPEG_BIN) {
        const ffmpegStatus = await refreshFfmpegUpdateStatus({ forceLatest: true })
        if (ffmpegStatus.updateAvailable && ffmpegStatus.updateSupported && settings.ffmpegAutoUpdate) {
          queueToolNotification({ tool: 'ffmpeg', type: 'installing', version: ffmpegStatus.latestVersion })
          await runFfmpegUpdate()
        }
      }
    } catch (err) {
      patchToolState('ffmpeg', { lastError: String(err?.message || err) })
    }

    toolUpdateState.lastCycleAt = Date.now()
    toolUpdateState.nextCycleAt = toolUpdateState.lastCycleAt + TOOL_UPDATE_CHECK_INTERVAL_MS
    saveToolUpdateState()
  })()

  try {
    await toolUpdateCyclePromise
  } finally {
    toolUpdateCyclePromise = null
  }
}

function startToolUpdateScheduler() {
  if (toolUpdateScheduler) return

  const runScheduledCheck = () => {
    runToolUpdateCycle({ force: false }).catch((err) => {
      console.warn('Scheduled tool update check failed:', err?.message || err)
    })
  }

  toolUpdateScheduler = setInterval(runScheduledCheck, TOOL_UPDATE_SCHEDULER_TICK_MS)
  toolUpdateScheduler.unref?.()

  runToolUpdateCycle({ force: true }).catch((err) => {
    console.warn('Initial tool update check failed:', err?.message || err)
  })
}

startToolUpdateScheduler()

function buildToolUpdateSummaryPayload(settings) {
  const normalizedSettings = normalizeToolUpdaterSettingsPayload(settings)
  const yt = getToolState('ytDlp')
  const ff = getToolState('ffmpeg')
  const pendingNotifications = toolUpdateState.notifications.filter((entry) => !entry.consumed).length

  return {
    lastCycleAt: Number(toolUpdateState.lastCycleAt || 0),
    nextCycleAt: Number(toolUpdateState.nextCycleAt || 0),
    pendingNotifications,
    anyUpdateAvailable: Boolean(yt.updateAvailable || ff.updateAvailable),
    anyUpdateInProgress: Boolean(yt.updateInProgress || ff.updateInProgress),
    ytDlp: {
      updateAvailable: Boolean(yt.updateAvailable),
      updateInProgress: Boolean(yt.updateInProgress),
      updateSupported: Boolean(yt.updateSupported),
      currentVersion: String(yt.currentVersion || ''),
      latestVersion: String(yt.latestVersion || ''),
      autoUpdateEnabled: Boolean(normalizedSettings.ytDlpAutoUpdate),
      lastUpdatedAt: Number(yt.lastUpdatedAt || 0),
      latestCheckedAt: Number(yt.latestCheckedAt || 0),
      lastError: String(yt.lastError || ''),
    },
    ffmpeg: {
      updateAvailable: Boolean(ff.updateAvailable),
      updateInProgress: Boolean(ff.updateInProgress),
      updateSupported: Boolean(ff.updateSupported),
      currentVersion: String(ff.currentVersion || ''),
      latestVersion: String(ff.latestVersion || ''),
      autoUpdateEnabled: Boolean(normalizedSettings.ffmpegAutoUpdate),
      lastUpdatedAt: Number(ff.lastUpdatedAt || 0),
      latestCheckedAt: Number(ff.latestCheckedAt || 0),
      lastError: String(ff.lastError || ''),
    },
  }
}

app.get('/api/tool-updates/settings', async (_req, res) => {
  try {
    const settings = await readToolUpdaterSettings()
    return res.json(settings)
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) })
  }
})

app.put('/api/tool-updates/settings', express.json({ limit: '200kb' }), async (req, res) => {
  try {
    const current = await readToolUpdaterSettings()
    const next = normalizeToolUpdaterSettingsPayload({
      ...current,
      ...(req?.body && typeof req.body === 'object' ? req.body : {}),
    })
    const saved = await writeToolUpdaterSettings(next)
    return res.json(saved)
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) })
  }
})

app.get('/api/tool-updates/summary', async (_req, res) => {
  try {
    await runToolUpdateCycle({ force: false })
    const settings = await readToolUpdaterSettings()
    return res.json(buildToolUpdateSummaryPayload(settings))
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) })
  }
})

app.post('/api/tool-updates/check', express.json({ limit: '100kb' }), async (req, res) => {
  const requestedTool = String(req?.body?.tool || '').trim()

  try {
    if (requestedTool === 'ytDlp') {
      await refreshYtDlpUpdateStatus({ forceLatest: true, localOnly: false })
    } else if (requestedTool === 'ffmpeg') {
      if (!FFMPEG_BIN) {
        return res.status(400).json({ error: 'FFMPEG_PATH is not configured' })
      }
      await refreshFfmpegUpdateStatus({ forceLatest: true, localOnly: false })
    } else {
      await runToolUpdateCycle({ force: true })
    }

    const settings = await readToolUpdaterSettings()
    return res.json(buildToolUpdateSummaryPayload(settings))
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) })
  }
})

app.get('/api/tool-updates/notifications', async (req, res) => {
  try {
    const peekOnly = parseBooleanQueryFlag(req?.query?.peek)
    const notifications = peekOnly
      ? toolUpdateState.notifications.filter((entry) => !entry.consumed)
      : consumeToolNotifications()

    return res.json({
      notifications: notifications
        .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
        .map((entry) => ({
          id: entry.id,
          tool: entry.tool,
          type: entry.type,
          version: entry.version,
          message: entry.message,
          createdAt: Number(entry.createdAt || 0),
        })),
    })
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) })
  }
})

// Legacy endpoint: keep behavior for old frontend versions.
app.get('/api/yt-dlp/update-notification', (_req, res) => {
  try {
    const pending = consumeToolNotifications((entry) => entry.tool === 'ytDlp' && entry.type === 'updated')
    if (!pending.length) {
      return res.json({ show: false })
    }

    const latest = pending.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))[0]
    return res.json({ show: true, version: latest.version || '' })
  } catch {
    return res.status(500).json({ error: 'Failed to check notification' })
  }
})

function extractVersionToken(rawValue) {
  const line = String(rawValue || '').trim()
  if (!line) return ''

  // ffmpeg/ffprobe commonly output: "ffmpeg version X ..."
  const match = line.match(/\bversion\s+([^\s]+)/i)
  if (match && match[1]) return match[1].trim()

  // yt-dlp --version commonly outputs only the version token.
  return line.split(/\s+/)[0] || line
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let idx = 0
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024
    idx += 1
  }
  const digits = idx === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[idx]}`
}

function resolveExistingPath(filePath) {
  const target = String(filePath || '').trim()
  if (!target) return ''
  try {
    return fs.realpathSync(target)
  } catch {
    return target
  }
}

function isProjectManagedFfmpegBinary() {
  if (FFMPEG_MANAGED_BY_YLOADER === '1' || FFMPEG_MANAGED_BY_YLOADER === 'true' || FFMPEG_MANAGED_BY_YLOADER === 'yes' || FFMPEG_MANAGED_BY_YLOADER === 'on') {
    return true
  }

  const normalizedBinaryPath = path.normalize(String(FFMPEG_BIN || '')).toLowerCase()
  return FFMPEG_PATH_MARKERS.some((marker) => normalizedBinaryPath.includes(marker))
}

function getFileSizeInfo(filePath) {
  const target = String(filePath || '').trim()
  if (!target) return { bytes: null, human: '', resolvedPath: '' }

  try {
    const resolvedPath = resolveExistingPath(target)
    if (!fs.existsSync(resolvedPath)) return { bytes: null, human: '', resolvedPath: '' }
    const stat = fs.statSync(resolvedPath)
    if (!stat.isFile()) return { bytes: null, human: '', resolvedPath: '' }
    return { bytes: stat.size, human: formatBytes(stat.size), resolvedPath }
  } catch {
    return { bytes: null, human: '', resolvedPath: '' }
  }
}

async function readBinaryVersionLine(binaryPath) {
  if (!binaryPath) return ''
  const raw = await runCmd(binaryPath, ['-version'], { timeout: 5000, maxBuffer: 512 * 1024 })
  return String(raw || '').split(/\r?\n/).find(Boolean) || ''
}

// GET /api/yt-dlp/status -> { currentVersion, latestVersion, outdated }
app.get('/api/yt-dlp/status', async (req, res) => {
  const ytDlpPath = YT_DLP
  const ytDlpFileSize = getFileSizeInfo(ytDlpPath)
  const localOnly = parseBooleanQueryFlag(req?.query?.localOnly)
  const forceLatest = parseBooleanQueryFlag(req?.query?.forceLatest)
  const settings = await readToolUpdaterSettings().catch(() => ({ ...DEFAULT_TOOL_UPDATER_SETTINGS }))
  const stateSnapshot = getToolState('ytDlp')

  try {
    const status = await refreshYtDlpUpdateStatus({ forceLatest, localOnly })
    const outdated = Boolean(status.updateAvailable)

    res.json({
      available: true,
      currentVersion: status.currentVersion || '',
      latestVersion: status.latestVersion || status.currentVersion || '',
      latestReleaseTag: status.latestReleaseTag || '',
      latestReleaseName: status.latestReleaseName || '',
      latestHtmlUrl: status.latestHtmlUrl || '',
      outdated,
      latestFromCache: Boolean(status.latestFromCache),
      latestCheckedAt: Number(status.latestCheckedAt || 0),
      latestSource: String(status.latestSource || 'none'),
      latestError: String(status.latestError || ''),
      platform: os.platform(),
      updateMethod: getEffectiveYtDlpUpdateMethod(),
      updateSupported: Boolean(status.updateSupported),
      updateInProgress: Boolean(stateSnapshot.updateInProgress),
      autoUpdateEnabled: Boolean(settings.ytDlpAutoUpdate),
      lastUpdatedAt: Number(stateSnapshot.lastUpdatedAt || 0),
      lastUpdatedFrom: String(stateSnapshot.lastUpdatedFrom || ''),
      lastUpdatedTo: String(stateSnapshot.lastUpdatedTo || ''),
      lastError: String(stateSnapshot.lastError || ''),
      binaryPath: ytDlpPath,
      binarySizeBytes: ytDlpFileSize.bytes,
      binarySizeHuman: ytDlpFileSize.human,
      error: '',
    })
  } catch (err) {
    res.json({
      available: false,
      currentVersion: '',
      latestVersion: '',
      latestReleaseTag: '',
      latestReleaseName: '',
      latestHtmlUrl: '',
      outdated: false,
      latestFromCache: false,
      latestCheckedAt: 0,
      latestSource: 'none',
      latestError: '',
      platform: os.platform(),
      updateMethod: getEffectiveYtDlpUpdateMethod(),
      updateSupported: !isYtDlpUpdateDisabled(),
      updateInProgress: Boolean(stateSnapshot.updateInProgress),
      autoUpdateEnabled: Boolean(settings.ytDlpAutoUpdate),
      lastUpdatedAt: Number(stateSnapshot.lastUpdatedAt || 0),
      lastUpdatedFrom: String(stateSnapshot.lastUpdatedFrom || ''),
      lastUpdatedTo: String(stateSnapshot.lastUpdatedTo || ''),
      lastError: String(stateSnapshot.lastError || ''),
      binaryPath: ytDlpPath,
      binarySizeBytes: ytDlpFileSize.bytes,
      binarySizeHuman: ytDlpFileSize.human,
      error: String(err?.message || err),
    })
  }
})

// GET /api/ffmpeg/status -> { available, version, path, ffprobeVersion }
app.get('/api/ffmpeg/status', async (req, res) => {
  const localOnly = parseBooleanQueryFlag(req?.query?.localOnly)
  const forceLatest = parseBooleanQueryFlag(req?.query?.forceLatest)
  const projectManaged = isProjectManagedFfmpegBinary()
  const settings = await readToolUpdaterSettings().catch(() => ({ ...DEFAULT_TOOL_UPDATER_SETTINGS }))
  const stateSnapshot = getToolState('ffmpeg')

  if (!FFMPEG_BIN) {
    return res.json({
      available: false,
      projectManaged,
      path: '',
      version: '',
      latestVersion: '',
      latestReleaseTag: '',
      latestReleaseName: '',
      latestHtmlUrl: '',
      outdated: false,
      latestFromCache: false,
      latestCheckedAt: 0,
      latestSource: 'none',
      latestError: '',
      updateSupported: false,
      updateInProgress: Boolean(stateSnapshot.updateInProgress),
      autoUpdateEnabled: Boolean(settings.ffmpegAutoUpdate),
      lastUpdatedAt: Number(stateSnapshot.lastUpdatedAt || 0),
      lastUpdatedFrom: String(stateSnapshot.lastUpdatedFrom || ''),
      lastUpdatedTo: String(stateSnapshot.lastUpdatedTo || ''),
      lastError: String(stateSnapshot.lastError || ''),
      fileSizeBytes: null,
      fileSizeHuman: '',
      ffprobePath: '',
      ffprobeVersion: '',
      ffprobeFileSizeBytes: null,
      ffprobeFileSizeHuman: '',
      ffmpegAssetName: '',
      ffprobeAssetName: '',
      error: 'FFMPEG_PATH is not configured',
    })
  }

  try {
    const status = await refreshFfmpegUpdateStatus({ forceLatest, localOnly })
    const ffmpegFileSize = getFileSizeInfo(FFMPEG_BIN)
    const ffmpegPath = ffmpegFileSize.resolvedPath || resolveExistingPath(FFMPEG_BIN) || String(FFMPEG_BIN || '')

    let ffprobePath = getEffectiveFfprobeBinaryPath()
    let ffprobeFileSize = { bytes: null, human: '', resolvedPath: '' }
    if (ffprobePath) {
      ffprobeFileSize = getFileSizeInfo(ffprobePath)
      ffprobePath = ffprobeFileSize.resolvedPath || resolveExistingPath(ffprobePath) || ffprobePath
    }

    return res.json({
      available: true,
      projectManaged,
      path: ffmpegPath,
      version: status.currentVersion || '',
      latestVersion: status.latestVersion || status.currentVersion || '',
      latestReleaseTag: status.latestReleaseTag || '',
      latestReleaseName: status.latestReleaseName || '',
      latestHtmlUrl: status.latestHtmlUrl || '',
      outdated: Boolean(status.updateAvailable),
      latestFromCache: Boolean(status.latestFromCache),
      latestCheckedAt: Number(status.latestCheckedAt || 0),
      latestSource: String(status.latestSource || 'none'),
      latestError: String(status.latestError || ''),
      updateSupported: Boolean(status.updateSupported),
      updateInProgress: Boolean(stateSnapshot.updateInProgress),
      autoUpdateEnabled: Boolean(settings.ffmpegAutoUpdate),
      lastUpdatedAt: Number(stateSnapshot.lastUpdatedAt || 0),
      lastUpdatedFrom: String(stateSnapshot.lastUpdatedFrom || ''),
      lastUpdatedTo: String(stateSnapshot.lastUpdatedTo || ''),
      lastError: String(stateSnapshot.lastError || ''),
      fileSizeBytes: ffmpegFileSize.bytes,
      fileSizeHuman: ffmpegFileSize.human,
      ffprobePath,
      ffprobeVersion: status.ffprobeVersion || '',
      ffprobeFileSizeBytes: ffprobeFileSize.bytes,
      ffprobeFileSizeHuman: ffprobeFileSize.human,
      ffmpegAssetName: String(status.ffmpegAssetName || stateSnapshot.ffmpegAssetName || ''),
      ffprobeAssetName: String(status.ffprobeAssetName || stateSnapshot.ffprobeAssetName || ''),
      error: '',
    })
  } catch (err) {
    return res.json({
      available: false,
      projectManaged,
      path: FFMPEG_BIN,
      version: '',
      latestVersion: '',
      latestReleaseTag: '',
      latestReleaseName: '',
      latestHtmlUrl: '',
      outdated: false,
      latestFromCache: false,
      latestCheckedAt: 0,
      latestSource: 'none',
      latestError: '',
      updateSupported: Boolean(projectManaged && FFMPEG_BIN),
      updateInProgress: Boolean(stateSnapshot.updateInProgress),
      autoUpdateEnabled: Boolean(settings.ffmpegAutoUpdate),
      lastUpdatedAt: Number(stateSnapshot.lastUpdatedAt || 0),
      lastUpdatedFrom: String(stateSnapshot.lastUpdatedFrom || ''),
      lastUpdatedTo: String(stateSnapshot.lastUpdatedTo || ''),
      lastError: String(stateSnapshot.lastError || ''),
      fileSizeBytes: null,
      fileSizeHuman: '',
      ffprobePath: FFPROBE_BIN,
      ffprobeVersion: '',
      ffprobeFileSizeBytes: null,
      ffprobeFileSizeHuman: '',
      ffmpegAssetName: String(stateSnapshot.ffmpegAssetName || ''),
      ffprobeAssetName: String(stateSnapshot.ffprobeAssetName || ''),
      error: String(err?.message || err),
    })
  }
})

// GET /api/meta/duration?url=...
// Returns { duration: number|null, durationString: string|null }
app.get('/api/meta/duration', async (req, res) => {
  const url = (req.query.url || '').toString().trim()
  if (!url) return res.status(400).json({ error: 'Missing url' })
  if (!isValidHttpUrl(url)) return res.status(400).json({ error: 'Invalid url' })

  try {
    const durationArgs = await buildYtDlpNetworkArgs(['--no-warnings', '--no-playlist', '--skip-download', '-O', '%(duration)s|%(duration_string)s', url])
    // Print seconds and formatted string separated by pipe to avoid JSON parsing overhead
    const out = await runCmd(
      YT_DLP,
      durationArgs,
      { timeout: 45000 }
    )
    const parts = (out || '').trim().split('|')
    const secRaw = parts.shift() || ''
    const strRaw = parts.join('|')
    const duration = secRaw ? Number(secRaw) : null

    const formattedDuration = formatDurationLabel(duration)

    // Prefer our robust formatting, fallback to yt-dlp string, then null
    const durationString = formattedDuration || (strRaw && strRaw.trim()) || null

    res.json({ duration: Number.isFinite(duration) ? duration : null, durationString })
  } catch (err) {
    const details = extractCommandErrorDetails(err)
    const ytDlpError = buildYtDlpErrorPayload(details)
    res.status(500).json({
      error: 'Failed to query duration',
      details: ytDlpError.rawMessage || details,
      ytDlpError,
    })
  }
})

// GET /api/meta/formats?url=...
// Returns available audio and video formats with quality info
app.get('/api/meta/formats', async (req, res) => {
  const url = (req.query.url || '').toString().trim()
  if (!url) return res.status(400).json({ error: 'Missing url' })
  if (!isValidHttpUrl(url)) return res.status(400).json({ error: 'Invalid url' })

  const cachedPayload = readCachedMetaFormats(url)
  if (cachedPayload) {
    return res.json(cachedPayload)
  }

  try {
    const formatArgs = await buildYtDlpNetworkArgs(['--no-warnings', '--no-playlist', '--skip-download', '--dump-json', url])
    // Get format list as JSON
    // Using --dump-json (same as -J) to retrieve full metadata including thumbnails
    const out = await runCmd(
      YT_DLP,
      formatArgs,
      { maxBuffer: 50 * 1024 * 1024, timeout: 60000 }
    )
    const data = parseYtDlpJson(out)

    const audioFormats = []
    const videoFormats = []
    const thumbnails = []

    // Parse audio formats
    if (data.formats) {
      data.formats.forEach(fmt => {
        if (fmt.vcodec === 'none' && fmt.acodec !== 'none') {
          // Audio only format
          audioFormats.push({
            formatId: fmt.format_id,
            ext: fmt.ext,
            abr: fmt.abr || fmt.tbr || 0,
            acodec: fmt.acodec,
            filesize: fmt.filesize || fmt.filesize_approx || 0,
          })
        } else if (fmt.vcodec !== 'none') {
          // Video format (include both video-only and muxed with audio)
          const width = fmt.width || 0
          const height = fmt.height || 0
          const resolution = fmt.resolution || (width && height ? `${width}x${height}` : null)
          videoFormats.push({
            formatId: fmt.format_id,
            ext: fmt.ext,
            resolution,
            width,
            height,
            vcodec: fmt.vcodec,
            acodec: fmt.acodec || 'none',
            filesize: fmt.filesize || fmt.filesize_approx || 0,
            fps: fmt.fps,
            requiresMerge: fmt.acodec === 'none',
          })
        }
      })
    }

    // Sort audio formats by bitrate (descending)
    audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0))

    // Sort video formats by resolution (descending)
    videoFormats.sort((a, b) => {
      const aHeight = Number(a.resolution?.includes('x') ? a.resolution.split('x')[1] : (a.height || 0)) || 0
      const bHeight = Number(b.resolution?.includes('x') ? b.resolution.split('x')[1] : (b.height || 0)) || 0
      return bHeight - aHeight
    })

    // Collect thumbnails if present (yt-dlp provides array with url/width/height/id/preference)
    if (Array.isArray(data.thumbnails)) {
      for (const t of data.thumbnails) {
        if (!t || !t.url) continue
        thumbnails.push({
          url: t.url,
          id: t.id || null,
          width: t.width || null,
          height: t.height || null,
          preference: typeof t.preference === 'number' ? t.preference : null,
        })
      }
    }

    // Sort thumbnails by (height then width) descending when dimensions known
    thumbnails.sort((a, b) => {
      const ah = a.height || 0
      const bh = b.height || 0
      if (bh !== ah) return bh - ah
      const aw = a.width || 0
      const bw = b.width || 0
      return bw - aw
    })

    const numericDuration = Number(data?.duration)
    const duration = Number.isFinite(numericDuration) ? numericDuration : null
    const rawDurationString = String(data?.duration_string || '').trim()
    const durationString = formatDurationLabel(duration) || rawDurationString || null

    const payload = {
      title: String(data?.title || '').trim(),
      author: String(data?.uploader || data?.channel || data?.creator || data?.uploader_id || '').trim(),
      extractor: String(data?.extractor_key || data?.extractor || '').trim(),
      thumbnail: String(data?.thumbnail || thumbnails?.[0]?.url || '').trim() || null,
      duration,
      durationString,
      audioFormats: audioFormats,
      videoFormats: videoFormats,
      thumbnails: thumbnails,
    }

    writeCachedMetaFormats(url, payload)

    res.json(payload)
  } catch (err) {
    console.error('Error fetching formats:', err)
    const details = extractCommandErrorDetails(err)
    const ytDlpError = buildYtDlpErrorPayload(details)
    res.status(500).json({
      error: 'Failed to query formats',
      details: ytDlpError.rawMessage || details,
      ytDlpError,
    })
  }
})

// GET /api/yt-dlp/update/stream -> SSE with live yt-dlp update output
app.get('/api/yt-dlp/update/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  let clientClosed = false
  req.on('close', () => {
    clientClosed = true
  })

  const send = (event, data) => {
    if (clientClosed || res.writableEnded) return
    if (event) res.write(`event: ${event}\n`)
    if (data !== undefined) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data)
      res.write(`data: ${payload}\n\n`)
    } else {
      res.write(`data: \n\n`)
    }
  }

  try {
    const status = getToolState('ytDlp')
    if (status.updateInProgress) {
      send('error', 'A yt-dlp update is already running.')
      send('end', 'failed')
      return res.end()
    }

    const preStatus = await refreshYtDlpUpdateStatus({ forceLatest: true, localOnly: false }).catch(() => null)
    if (preStatus?.updateAvailable) {
      queueToolNotification({ tool: 'ytDlp', type: 'installing', version: preStatus.latestVersion || '' })
    }

    await runYtDlpUpdate({
      onLog: (line) => send('message', line),
    })

    const postStatus = getToolState('ytDlp')
    send('message', `Update finished. yt-dlp version now: ${postStatus.currentVersion || 'unknown'}`)
    send('end', 'done')
  } catch (e) {
    send('error', String(e?.message || e))
    send('end', 'failed')
  } finally {
    if (!res.writableEnded) {
      res.end()
    }
  }
})

// GET /api/ffmpeg/update/stream -> SSE with ffmpeg update output
app.get('/api/ffmpeg/update/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  let clientClosed = false
  req.on('close', () => {
    clientClosed = true
  })

  const send = (event, data) => {
    if (clientClosed || res.writableEnded) return
    if (event) res.write(`event: ${event}\n`)
    if (data !== undefined) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data)
      res.write(`data: ${payload}\n\n`)
    } else {
      res.write('data: \n\n')
    }
  }

  try {
    const status = getToolState('ffmpeg')
    if (status.updateInProgress) {
      send('error', 'An ffmpeg update is already running.')
      send('end', 'failed')
      return res.end()
    }

    const preStatus = await refreshFfmpegUpdateStatus({ forceLatest: true, localOnly: false }).catch(() => null)
    if (preStatus?.updateAvailable) {
      queueToolNotification({ tool: 'ffmpeg', type: 'installing', version: preStatus.latestVersion || '' })
    }

    await runFfmpegUpdate({
      onLog: (line) => send('message', line),
    })

    const postStatus = getToolState('ffmpeg')
    send('message', `Update finished. ffmpeg version now: ${postStatus.currentVersion || 'unknown'}`)
    send('end', 'done')
  } catch (e) {
    send('error', String(e?.message || e))
    send('end', 'failed')
  } finally {
    if (!res.writableEnded) {
      res.end()
    }
  }
})

// GET /api/proxy-image?url=...&filename=...&format=...
// Proxies an external image to force same-origin download with a provided filename and optional format conversion
app.get('/api/proxy-image', async (req, res) => {
  try {
    const rawUrl = (req.query.url || '').toString()
    const targetFormatRaw = (req.query.format || '').toString().trim().toLowerCase()
    const targetFormat = targetFormatRaw ? normalizeImageContainer(targetFormatRaw) : ''

    if (!rawUrl) return res.status(400).json({ error: 'Missing url' })
    if (!isValidHttpUrl(rawUrl)) {
      return res.status(400).json({ error: 'Only http/https URLs are allowed' })
    }
    if (targetFormatRaw && !targetFormat) {
      return res.status(400).json({ error: 'Unsupported image format' })
    }

    const filenameRaw = (req.query.filename || '').toString().trim()

    // Determine target extension
    let extStr = targetFormat || ''
    if (!extStr && filenameRaw) {
      const parts = filenameRaw.split('.')
      if (parts.length > 1) extStr = normalizeImageContainer(parts[parts.length - 1])
    }
    if (!extStr) extStr = 'jpg'

    const safeFilenameRaw = filenameRaw
      ? filenameRaw.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').substring(0, 120).trim()
      : `thumbnail.${extStr}`

    // Ensure filename ends with correct extension
    const baseName = (safeFilenameRaw.replace(/\.[^/.]+$/, '') || 'thumbnail').trim()
    const finalFilename = `${baseName}.${extStr}`

    const imageTimeoutController = new AbortController()
    const imageTimeout = setTimeout(() => imageTimeoutController.abort(), 15000)
    let upstream
    try {
      upstream = await fetch(rawUrl, { signal: imageTimeoutController.signal })
    } finally {
      clearTimeout(imageTimeout)
    }

    if (!upstream.ok) {
      return res.status(502).json({ error: `Upstream error ${upstream.status}` })
    }

    const contentLength = Number(upstream.headers.get('content-length') || 0)
    if (Number.isFinite(contentLength) && contentLength > MAX_PROXY_IMAGE_SIZE_BYTES) {
      return res.status(413).json({ error: 'Image too large' })
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    const ab = await upstream.arrayBuffer()
    if (ab.byteLength > MAX_PROXY_IMAGE_SIZE_BYTES) {
      return res.status(413).json({ error: 'Image too large' })
    }
    const imageBuffer = Buffer.from(ab)

    // If no format conversion needed (or no ffmpeg), just pipe
    // We assume if targetFormat is provided, we SHOULD ensure it matches, unless same type
    let needConversion = false
    if (targetFormat && HAS_FFMPEG) {
      // Simple mime check
      if (targetFormat === 'jpg' && !contentType.includes('jpeg') && !contentType.includes('jpg')) needConversion = true
      else if (targetFormat === 'png' && !contentType.includes('png')) needConversion = true
      else if (targetFormat === 'webp' && !contentType.includes('webp')) needConversion = true
    }

    if (!needConversion) {
      res.setHeader('Content-Type', contentType)
      res.setHeader('Content-Disposition', buildAttachmentContentDisposition(finalFilename, 'thumbnail.jpg'))
      res.send(imageBuffer)
      return
    }

    // Perform conversion using ffmpeg
    const validationHash = crypto.randomBytes(4).toString('hex')
    const tempInput = path.join(os.tmpdir(), `yloader_thumb_in_${validationHash}`)
    const tempOutput = path.join(os.tmpdir(), `yloader_thumb_out_${validationHash}.${extStr}`)

    try {
      fs.writeFileSync(tempInput, imageBuffer)

      await runCmd(FFMPEG_BIN, ['-y', '-i', tempInput, tempOutput])

      if (fs.existsSync(tempOutput)) {
        const outData = fs.readFileSync(tempOutput)

        let outMime = 'application/octet-stream'
        if (extStr === 'jpg') outMime = 'image/jpeg'
        if (extStr === 'png') outMime = 'image/png'
        if (extStr === 'webp') outMime = 'image/webp'

        res.setHeader('Content-Type', outMime)
        res.setHeader('Content-Disposition', buildAttachmentContentDisposition(finalFilename, 'thumbnail.jpg'))
        res.send(outData)
      } else {
        throw new Error('Conversion output file missing')
      }
    } catch (binErr) {
      console.error('Image conversion failed:', binErr)
      // Fallback to original
      res.setHeader('Content-Type', contentType)
      res.setHeader('Content-Disposition', buildAttachmentContentDisposition(finalFilename, 'thumbnail.jpg'))
      res.send(imageBuffer)
    } finally {
      try { if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput) } catch { }
      try { if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput) } catch { }
    }

    // Log to DB
    try {
      const timestamp = new Date().toISOString()
      // Extract video ID from thumb url if possible
      const thumbIdMatch = rawUrl.match(/\/vi\/([^\/]+)\//)
      const videoId = thumbIdMatch ? thumbIdMatch[1] : null

      const service = resolveServiceKey(videoId ? 'youtube' : null, rawUrl)

      const pageUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : null
      const stmt = db.prepare(`INSERT INTO downloads (video_id, title, duration, timestamp, download_type, format_id, filename, service, source_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      stmt.run(videoId, filenameRaw || 'thumbnail', 0, timestamp, 'thumbnail', targetFormat || extStr || 'jpg', finalFilename, service, pageUrl)
      stmt.finalize()
    } catch (dbErr) {
      console.error('DB Insert Error (Proxy):', dbErr)
    }

  } catch (err) {
    res.status(500).json({ error: 'Failed to proxy image', details: String(err?.message || err) })
  }
})

// POST /api/download/stream -> SSE with live yt-dlp download progress
// Body: { url, type: 'audio' | 'video', format?, audioFormat?, videoFormat?, metadata?, cover?, cuts? }
app.post('/api/download/stream', async (req, res) => {
  const {
    url: rawUrl,
    type: rawType,
    format: rawContainer,
    audioFormat: rawAudioFormat,
    videoFormat: rawVideoFormat,
    metadata,
    cover,
    duration,
    service,
  } = req.body || {}

  const url = String(rawUrl || '').trim()
  const type = String(rawType || '').trim().toLowerCase()
  const container = String(rawContainer || '').trim().toLowerCase()
  const audioFormat = String(rawAudioFormat || '').trim()
  const videoFormat = String(rawVideoFormat || '').trim()
  const effectiveDownloadSettings = await readDownloadSettings().catch(() => ({ ...DEFAULT_DOWNLOAD_SETTINGS }))
  const maxAudioBitrateRaw = Number(effectiveDownloadSettings.maxAudioBitrateKbps)
  const maxVideoHeightRaw = Number(effectiveDownloadSettings.maxVideoHeight)
  const maxAudioBitrateKbps = DOWNLOAD_BITRATE_OPTIONS.has(maxAudioBitrateRaw)
    ? maxAudioBitrateRaw
    : DEFAULT_DOWNLOAD_SETTINGS.maxAudioBitrateKbps
  const maxVideoHeight = DOWNLOAD_VIDEO_HEIGHT_OPTIONS.has(maxVideoHeightRaw)
    ? maxVideoHeightRaw
    : DEFAULT_DOWNLOAD_SETTINGS.maxVideoHeight

  if (!url || !type) {
    return res.status(400).json({ error: 'Missing required fields: url, type' })
  }
  if (!isValidHttpUrl(url)) {
    return res.status(400).json({ error: 'Invalid url' })
  }
  if (type !== 'audio' && type !== 'video') {
    return res.status(400).json({ error: 'Invalid type. Must be audio or video' })
  }

  const requestedAudioContainer = type === 'audio'
    ? normalizeAudioContainer(container || effectiveDownloadSettings.defaultAudioContainer)
    : ''
  const requestedVideoContainer = type === 'video'
    ? normalizeVideoContainer(container || effectiveDownloadSettings.defaultVideoContainer)
    : ''
  if (type === 'audio' && !requestedAudioContainer) {
    return res.status(400).json({ error: 'Unsupported audio format' })
  }
  if (type === 'video' && !requestedVideoContainer) {
    return res.status(400).json({ error: 'Unsupported video format' })
  }

  const normalizedAudioFormatId = audioFormat === 'best' ? 'best' : sanitizeFormatId(audioFormat)
  const normalizedVideoFormatId = videoFormat === 'best' ? 'best' : sanitizeFormatId(videoFormat)
  if (audioFormat && audioFormat !== 'best' && !normalizedAudioFormatId) {
    return res.status(400).json({ error: 'Invalid audio format id' })
  }
  if (videoFormat && videoFormat !== 'best' && !normalizedVideoFormatId) {
    return res.status(400).json({ error: 'Invalid video format id' })
  }

  const coverConfig = (cover && typeof cover === 'object') ? cover : {}
  const coverEnabled = type === 'audio'
    ? (coverConfig.enabled !== undefined ? coverConfig.enabled !== false : Boolean(effectiveDownloadSettings.defaultEmbedCoverArt))
    : false
  const coverSource = coverConfig.source === 'upload' ? 'upload' : 'video'
  let coverUpload = null
  let coverUploadHash = null

  if (type === 'audio' && coverEnabled && coverSource === 'upload') {
    if (!HAS_FFMPEG) {
      return res.status(400).json({ error: 'ffmpeg is required to embed a custom cover image' })
    }
    const upload = coverConfig.upload || {}
    const dataUrl = upload.dataUrl || upload.data || ''
    if (!dataUrl) {
      return res.status(400).json({ error: 'Cover image is missing' })
    }
    const raw = String(dataUrl)
    const m = raw.match(/^data:([^;]+);base64,(.+)$/)
    const base64 = m ? m[2] : raw
    const mime = upload.type || (m ? m[1] : '') || 'image/jpeg'
    let buffer
    try {
      buffer = Buffer.from(base64, 'base64')
    } catch (e) {
      return res.status(400).json({ error: 'Cover image could not be decoded' })
    }
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: 'Cover image could not be decoded' })
    }
    const maxSize = 10 * 1024 * 1024
    if (buffer.length > maxSize) {
      return res.status(400).json({ error: 'Cover image is too large (max 10MB)' })
    }
    const ext = mime.includes('png') ? '.png' : (mime.includes('webp') ? '.webp' : '.jpg')
    const safeName = sanitizeFilename(upload.name || `cover${ext}`)
    coverUpload = { buffer, mime, ext, name: safeName }
    coverUploadHash = crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 12)
  }

  // Parse and validate cuts (new payload: req.body.cuts, legacy fallback: req.body.audioCuts/videoCuts).
  const legacyCuts = type === 'video' ? req.body.videoCuts : req.body.audioCuts
  const rawCuts = (req.body.cuts && typeof req.body.cuts === 'object')
    ? req.body.cuts
    : ((legacyCuts && typeof legacyCuts === 'object') ? legacyCuts : null)

  let cuts = null
  if (rawCuts?.enabled) {
    const trimStart = typeof rawCuts.trimStart === 'number' ? Math.max(0, rawCuts.trimStart) : 0
    const trimEnd = typeof rawCuts.trimEnd === 'number' ? Math.max(0, rawCuts.trimEnd) : null
    const mode = rawCuts.mode === 'keep' ? 'keep' : 'remove'

    const segmentCandidates = Array.isArray(rawCuts.segments)
      ? rawCuts.segments
      : (Array.isArray(rawCuts.removals) ? rawCuts.removals : [])

    const segments = segmentCandidates
      .filter(s => typeof s?.start === 'number' && typeof s?.end === 'number' && s.end > s.start)
      .map(s => ({ start: Math.max(0, s.start), end: Math.max(0, s.end) }))

    cuts = { enabled: true, mode, trimStart, trimEnd, segments }
  }

  // Setup SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  let responseClosed = false
  const safeEnd = () => {
    if (responseClosed) return
    responseClosed = true
    try { res.end() } catch { }
  }

  const send = (event, data) => {
    if (responseClosed) return false
    try {
      if (event) res.write(`event: ${event}\n`)
      if (data !== undefined) {
        const payload = typeof data === 'string' ? data : JSON.stringify(data)
        res.write(`data: ${payload}\n\n`)
      } else {
        res.write('data: \n\n')
      }
      return true
    } catch {
      responseClosed = true
      return false
    }
  }

  try {
    const maxConcurrentDownloads = Math.max(1, Number(effectiveDownloadSettings.maxConcurrentDownloads) || DEFAULT_DOWNLOAD_SETTINGS.maxConcurrentDownloads)
    const staggerDownloadsMs = Math.max(0, Number(effectiveDownloadSettings.staggerDownloadsMs) || 0)

    const downloadHash = crypto.createHash('sha256')
      .update(JSON.stringify({
        url,
        type,
        format: type === 'audio' ? requestedAudioContainer : requestedVideoContainer,
        audioFormat: normalizedAudioFormatId || '',
        videoFormat: normalizedVideoFormatId || '',
        maxAudioBitrateKbps,
        maxVideoHeight,
        videoTitle: req.body.videoTitle || null,
        metadata: metadata || null,
        cover: {
          enabled: coverEnabled,
          source: coverSource,
          upload: coverUploadHash || null,
        },
        cuts: cuts || null,
      }))
      .digest('hex')
      .substring(0, 16)

    // Determine file extension and format args
    let ext = 'mp3'
    let formatArgs = []

    if (type === 'audio') {
      const requestedExt = requestedAudioContainer || 'mp3'
      ext = requestedExt

      // Map 'ogg' to 'vorbis' for yt-dlp arguments
      let audioFormatArg = requestedExt
      if (requestedExt === 'ogg') audioFormatArg = 'vorbis'

      if (normalizedAudioFormatId && normalizedAudioFormatId !== 'best') {
        if (maxAudioBitrateKbps > 0) {
          const capSelector = `[abr<=${maxAudioBitrateKbps}]`
          formatArgs = ['-f', `${normalizedAudioFormatId}${capSelector}/bestaudio${capSelector}/${normalizedAudioFormatId}/bestaudio`]
        } else {
          formatArgs = ['-f', normalizedAudioFormatId]
        }
      } else {
        if (maxAudioBitrateKbps > 0) {
          const capSelector = `[abr<=${maxAudioBitrateKbps}]`
          formatArgs = ['-f', `bestaudio${capSelector}/bestaudio`]
        } else {
          formatArgs = ['-f', 'bestaudio']
        }
      }
      formatArgs.push('-x', '--audio-format', audioFormatArg)
      if (coverEnabled && coverSource === 'video') {
        formatArgs.push('--embed-thumbnail', '--convert-thumbnails', 'jpg', '--write-thumbnail')
      }
    } else if (type === 'video') {
      ext = requestedVideoContainer || 'mp4'

      if (!HAS_FFMPEG) {
        send('message', '⚠️ ffmpeg not detected. Falling back to "best" (single file).')
        if (maxVideoHeight > 0) {
          const capSelector = `[height<=${maxVideoHeight}]`
          formatArgs = ['-f', `best${capSelector}/best`]
        } else {
          formatArgs = ['-f', 'best']
        }
      } else {
        if (normalizedVideoFormatId && normalizedVideoFormatId !== 'best') {
          if (maxVideoHeight > 0) {
            const capSelector = `[height<=${maxVideoHeight}]`
            formatArgs = ['-f', `${normalizedVideoFormatId}${capSelector}+bestaudio/bestvideo${capSelector}+bestaudio/best${capSelector}/${normalizedVideoFormatId}+bestaudio/best`]
          } else {
            // Use specific video format + best audio, merge if needed
            formatArgs = ['-f', `${normalizedVideoFormatId}+bestaudio/best`]
          }
        } else {
          if (maxVideoHeight > 0) {
            const capSelector = `[height<=${maxVideoHeight}]`
            formatArgs = ['-f', `bestvideo${capSelector}+bestaudio/best${capSelector}/bestvideo+bestaudio/best`]
          } else {
            formatArgs = ['-f', 'bestvideo+bestaudio/best']
          }
        }
        formatArgs.push('--merge-output-format', ext)
      }
    }

    // Use metadata title if available, otherwise fallback to videoTitle passed in payload, or generic
    const targetTitle = metadata?.title || req.body.videoTitle || `download_${downloadHash}`
    const finalBaseFilename = sanitizeFilename(targetTitle) || `download_${downloadHash}`

    // Check if file already exists (cached) in FINAL destination
    const possibleExts = type === 'audio' ? ['mp3', 'm4a', 'opus', 'webm', 'ogg', 'wav', 'flac'] : ['mp4', 'webm', 'mkv']
    let existingFile = null
    for (const e of possibleExts) {
      const testPath = path.join(DOWNLOADS_DIR, `${finalBaseFilename}.${e}`)
      if (!fs.existsSync(testPath)) continue
      const metaPath = `${testPath}.ytdlp.json`
      try {
        if (fs.existsSync(metaPath)) {
          const metaRaw = fs.readFileSync(metaPath, 'utf-8')
          const meta = JSON.parse(metaRaw || '{}')
          if (meta && meta.downloadHash === downloadHash) {
            existingFile = `${finalBaseFilename}.${e}`
            break
          }
        }
      } catch (err) {
        console.warn('Cache metadata read failed:', err?.message || err)
      }
    }

    if (existingFile) {
      console.log(`File cached: ${existingFile}`)
      send('progress', { percent: 100, stage: 'cached' })
      send('complete', { filename: existingFile, url: `/api/download/file/${encodeURIComponent(existingFile)}` })
      safeEnd()
      return
    }

    // Check if download is already in progress
    if (activeDownloads.has(downloadHash)) {
      send('error', 'Download already in progress for this configuration')
      send('end', 'failed')
      safeEnd()
      return
    }

    await waitForDownloadSlot(maxConcurrentDownloads, {
      isResponseClosed: () => responseClosed,
      onQueued: () => {
        send('progress', { percent: 0, stage: 'queued' })
        send('info', `Waiting for a free download slot (${activeDownloads.size}/${maxConcurrentDownloads})...`)
      },
    })

    await waitForDownloadStagger(staggerDownloadsMs, () => responseClosed)

    if (responseClosed) return

    // Mark download as active
    activeDownloads.set(downloadHash, {
      startedAt: Date.now(),
      type,
    })
    notifyDownloadSlotsChanged()
    send('started', { downloadHash })

    // Create a temporary directory for this download to avoid naming conflicts and quoting issues
    const tempDirName = `temp_${downloadHash}`
    const tempDir = path.join(DOWNLOADS_DIR, tempDirName)
    try {
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }
    } catch (err) {
      console.error('Failed to create temp dir:', err)
      activeDownloads.delete(downloadHash)
      notifyDownloadSlotsChanged()
      send('error', 'Failed to create temporary directory')
      send('end', 'failed')
      safeEnd()
      return
    }

    send('info', `Starting ${type} download...`)

    // We use a generic name in the temp dir to avoid any yt-dlp output template parsing issues
    // We will rename it to the correct title after download
    const tempOutputTemplate = path.join(tempDir, 'content.%(ext)s')

    // Build yt-dlp command
    const args = await buildYtDlpNetworkArgs([
      ...formatArgs,
      '--no-playlist',
      '--progress',
      '--newline',
      '-o', tempOutputTemplate, // Download to temp dir with generic name
      url
    ])

    // Add metadata if provided (for audio)
    // Use --parse-metadata with meta_ prefix to set custom metadata values
    // and --embed-metadata to write them into the audio file
    if (type === 'audio' && metadata) {
      const hasMetadata = metadata.title || metadata.artist || metadata.album
      if (hasMetadata) {
        // Use parse-metadata to override the default metadata fields
        if (metadata.title) args.push('--parse-metadata', `${metadata.title}:%(meta_title)s`)
        if (metadata.artist) args.push('--parse-metadata', `${metadata.artist}:%(meta_artist)s`)
        if (metadata.album) args.push('--parse-metadata', `${metadata.album}:%(meta_album)s`)
        // embed-metadata is required to write the metadata into the file
        args.push('--embed-metadata')
      }
    }

    console.log('===============================================')
    console.log('Starting download:')
    console.log('  Target Title:', targetTitle)
    console.log('  Temp Dir:', tempDir)
    console.log('  Output template:', tempOutputTemplate)
    if (type === 'audio' && metadata) {
      console.log('  Metadata:')
      console.log('    Title:', metadata.title || '(none)')
      console.log('    Artist:', metadata.artist || '(none)')
      console.log('    Album:', metadata.album || '(none)')
    }
    console.log('===============================================')

    send('message', `Executing: yt-dlp ...`)

    // LocalHub-style: use configured yt-dlp path
    const child = spawn(YT_DLP, args)

    const knownDurationSeconds = Number.isFinite(Number(duration)) && Number(duration) > 0
      ? Number(duration)
      : null
    let maxDownloadPercent = 0
    let lastProgressPercent = -1
    let lastProgressStage = ''
    let errorOutput = []

    const emitProgress = (percent, stage, extra = null) => {
      const numeric = Number(percent)
      if (!Number.isFinite(numeric)) return

      const clamped = Math.max(0, Math.min(100, numeric))
      const rounded = Math.round(clamped * 10) / 10
      const monotonic = Math.max(lastProgressPercent, rounded)
      const nextStage = String(stage || lastProgressStage || 'downloading').trim() || 'downloading'
      const stageChanged = nextStage !== lastProgressStage

      if (!stageChanged && monotonic === lastProgressPercent) return

      lastProgressPercent = monotonic
      lastProgressStage = nextStage

      const payload = { percent: monotonic, stage: nextStage }
      if (extra && typeof extra === 'object') Object.assign(payload, extra)
      send('progress', payload)
    }

    const mapDownloadPercentToOverall = (downloadPercent) => {
      const bounded = Math.max(0, Math.min(100, Number(downloadPercent) || 0))
      return 5 + (bounded * 0.85)
    }

    emitProgress(1, 'initializing')

    // Parse yt-dlp output for progress. Some yt-dlp builds emit many updates in one
    // chunk with carriage returns, so we scan the whole chunk and take the highest %.
    const parseProgress = (textChunk) => {
      const text = String(textChunk || '')
      if (!text) return

      let nextPercent = null
      for (const match of text.matchAll(/\[download\][^\r\n]*?(\d+(?:[\.,]\d+)?)%/gi)) {
        const parsed = Number.parseFloat(String(match[1] || '').replace(',', '.'))
        if (!Number.isFinite(parsed)) continue
        nextPercent = nextPercent == null ? parsed : Math.max(nextPercent, parsed)
      }

      if (nextPercent != null) {
        maxDownloadPercent = Math.max(maxDownloadPercent, nextPercent)
        emitProgress(mapDownloadPercentToOverall(maxDownloadPercent), 'downloading', {
          downloadPercent: Math.max(0, Math.min(100, maxDownloadPercent)),
        })
      }

      // Also check for merge/post-processing
      if (text.includes('[Merger]') || text.includes('Merging formats')) {
        emitProgress(Math.max(lastProgressPercent, 91), 'merging')
      }

      if (text.includes('[ffmpeg]') || text.toLowerCase().includes('post-process')) {
        const ffmpegSeconds = extractFfmpegProgressSeconds(text)
        if (knownDurationSeconds && Number.isFinite(ffmpegSeconds)) {
          const ratio = Math.max(0, Math.min(1, ffmpegSeconds / knownDurationSeconds))
          emitProgress(90 + (ratio * 5), 'processing')
        } else {
          emitProgress(Math.max(lastProgressPercent, 94), 'processing')
        }
      }
    }

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      parseProgress(text)

      const lines = text.split(/\r?\n|\r/)
      for (const line of lines) {
        if (line.trim()) {
          send('message', line)
        }
      }
    })

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()

      // Ignore "Error in input stream" which often happens with pipe closure but isn't fatal if download finished
      if (text.includes('Error in input stream')) {
        return
      }

      parseProgress(text)

      const lines = text.split(/\r?\n|\r/)
      for (const line of lines) {
        if (line.trim()) {
          errorOutput.push(line.trim())
          if (errorOutput.length > 50) errorOutput.shift()
          console.error('yt-dlp stderr:', line)
          send('message', line)
        }
      }
    })

    child.on('error', (e) => {
      activeDownloads.delete(downloadHash)
      notifyDownloadSlotsChanged()
      console.error('yt-dlp spawn error:', e)
      // Attempt cleanup
      try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch { }
      const ytDlpError = buildYtDlpErrorPayload(`Failed to start yt-dlp: ${e?.message || e}`)
      send('error', {
        ...ytDlpError,
        message: ytDlpError.rawMessage || 'Failed to start yt-dlp',
      })
      send('end', 'failed')
      safeEnd()
    })

    child.on('close', async (code, signal) => {
      activeDownloads.delete(downloadHash)
      notifyDownloadSlotsChanged()
      console.log(`yt-dlp closed with code ${code}`)

      let finalFile = null

      // Check if we have a file in temp dir
      try {
        if (fs.existsSync(tempDir)) {
          const files = fs.readdirSync(tempDir)
          // Look for 'content.*' (mp3, mp4, etc)
          const contentFile = files.find(f => f.startsWith('content.') && ['.mp3', '.mp4', '.mkv', '.webm', '.m4a', '.ogg', '.wav', '.flac', '.opus'].includes(path.extname(f).toLowerCase()))

          if (contentFile) {
            const ext = path.extname(contentFile)
            let sourcePath = path.join(tempDir, contentFile)
            const parsedDuration = Number(duration)
            const mediaDuration = Number.isFinite(parsedDuration) ? parsedDuration : null
            const postProcessSteps = []

            const emitPostProcessProgress = (stepIndex, stepProgress, stage = 'processing') => {
              const totalSteps = Math.max(1, postProcessSteps.length)
              const boundedStepProgress = Math.max(0, Math.min(1, Number(stepProgress) || 0))
              const aggregate = (stepIndex + boundedStepProgress) / totalSteps
              emitProgress(90 + (aggregate * 9), stage)
            }

            // Apply media cuts (trim + remove/keep segments) if requested
            if ((type === 'audio' || type === 'video') && cuts?.enabled) {
              if (!HAS_FFMPEG) {
                send('message', '⚠️ ffmpeg required for media cutting – skipping cuts')
              } else {
                const keepSegments = computeMediaKeepSegments(cuts, mediaDuration)
                if (keepSegments) {
                  postProcessSteps.push(async (stepIndex) => {
                    const cutOutputPath = path.join(tempDir, `content_cut${ext}`)
                    try {
                      const ffArgs = type === 'audio'
                        ? buildAudioCutFfmpegArgs(sourcePath, cutOutputPath, keepSegments, ext)
                        : buildVideoCutFfmpegArgs(
                          sourcePath,
                          cutOutputPath,
                          keepSegments,
                          ext,
                          await detectHasAudioStream(sourcePath)
                        )

                      const segmentedDuration = keepSegments
                        .map((segment) => Math.max(0, Number(segment.end) - Number(segment.start)))
                        .reduce((sum, value) => sum + value, 0)

                      const ffmpegDuration = segmentedDuration > 0
                        ? segmentedDuration
                        : (mediaDuration || await getMediaDurationSeconds(sourcePath))

                      emitPostProcessProgress(stepIndex, 0)
                      await runFfmpegWithProgress(ffArgs, {
                        durationSeconds: ffmpegDuration,
                        onProgress: (progress) => emitPostProcessProgress(stepIndex, progress),
                      })

                      if (fs.existsSync(cutOutputPath)) {
                        sourcePath = cutOutputPath
                      }
                    } catch (cutErr) {
                      console.error('Media cut failed:', cutErr)
                      send('message', 'Media cutting failed, continuing with original file')
                    }
                  })
                }
              }
            }

            if (type === 'audio' && coverEnabled && coverSource === 'upload' && coverUpload) {
              postProcessSteps.push(async (stepIndex) => {
                try {
                  const coverPath = path.join(tempDir, `cover${coverUpload.ext}`)
                  fs.writeFileSync(coverPath, coverUpload.buffer)
                  const withCoverPath = path.join(tempDir, `content_cover${ext}`)
                  const coverDuration = mediaDuration || await getMediaDurationSeconds(sourcePath)

                  emitPostProcessProgress(stepIndex, 0)
                  await runFfmpegWithProgress([
                    '-y',
                    '-i', sourcePath,
                    '-i', coverPath,
                    '-map', '0:0',
                    '-map', '1:0',
                    '-c', 'copy',
                    '-map_metadata', '0',
                    '-id3v2_version', '3',
                    '-metadata:s:v', 'title=Album cover',
                    '-metadata:s:v', 'comment=Cover (front)',
                    withCoverPath,
                  ], {
                    durationSeconds: coverDuration,
                    onProgress: (progress) => emitPostProcessProgress(stepIndex, progress),
                  })

                  if (fs.existsSync(withCoverPath)) {
                    sourcePath = withCoverPath
                  }
                } catch (err) {
                  console.error('Failed to embed custom cover:', err)
                  send('message', 'Cover embedding failed, continuing without custom cover')
                }
              })
            }

            if (postProcessSteps.length > 0) {
              for (let stepIndex = 0; stepIndex < postProcessSteps.length; stepIndex += 1) {
                await postProcessSteps[stepIndex](stepIndex)
              }
              emitProgress(99, 'processing')
            }

            const destFilename = `${finalBaseFilename}${ext}`
            const destPath = path.join(DOWNLOADS_DIR, destFilename)

            // Move file to final destination
            console.log(`Moving ${sourcePath} to ${destPath}`)

            // If dest exists, delete it first (overwrite)
            if (fs.existsSync(destPath)) {
              fs.unlinkSync(destPath)
            }

            fs.renameSync(sourcePath, destPath)
            try {
              const metaPath = `${destPath}.ytdlp.json`
              const meta = {
                downloadHash,
                url,
                type,
                format: type === 'audio' ? requestedAudioContainer : requestedVideoContainer,
                audioFormat: normalizedAudioFormatId || '',
                videoFormat: normalizedVideoFormatId || '',
                maxAudioBitrateKbps,
                maxVideoHeight,
                videoTitle: req.body.videoTitle || null,
                metadata: metadata || null,
                cover: {
                  enabled: coverEnabled,
                  source: coverSource,
                  upload: coverUploadHash || null,
                },
                cuts: cuts || null,
              }
              fs.writeFileSync(metaPath, JSON.stringify(meta))
            } catch (err) {
              console.warn('Failed to write cache metadata:', err?.message || err)
            }
            finalFile = destFilename

            // Insert into DB
            try {
              const timestamp = new Date().toISOString()
              const videoId = (url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?]+)/) || [])[1] || null

              // Determine format_id
              const formatId = type === 'audio'
                ? (normalizedAudioFormatId || requestedAudioContainer || 'bestaudio')
                : (normalizedVideoFormatId || requestedVideoContainer || 'best')

              const svc = resolveServiceKey(service, url)

              const stmt = db.prepare(`INSERT INTO downloads (video_id, title, duration, timestamp, download_type, format_id, filename, service, source_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
              stmt.run(videoId, targetTitle, duration || 0, timestamp, type, formatId, finalFile, svc, url)
              stmt.finalize()
              console.log('Metadata saved to DB for:', finalFile)
            } catch (dbErr) {
              console.error('Failed to save metadata to DB:', dbErr)
            }
          }
        }
      } catch (err) {
        console.error('File move/cleanup error:', err)
      }

      // Always cleanup temp dir
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true })
        }
      } catch (err) {
        console.error('Failed to remove temp dir:', err)
      }

      if (finalFile) {
        console.log(`Download successful: ${finalFile}`)
        emitProgress(100, 'complete')
        send('complete', {
          filename: finalFile,
          url: `/api/download/file/${encodeURIComponent(finalFile)}`
        })
        send('end', 'done')
      } else {
        if (code === 0) {
          console.error('Download reported success but content file not found in temp dir')
          send('error', 'Download reported success but file not found')
          send('end', 'failed')
        } else {
          const rawErrorText = errorOutput.length > 0
            ? errorOutput.slice(-8).join('\n')
            : `yt-dlp exited with code ${code}${signal ? ` (signal ${signal})` : ''}`
          const ytDlpError = buildYtDlpErrorPayload(rawErrorText)
          send('error', {
            ...ytDlpError,
            message: ytDlpError.rawMessage || `yt-dlp exited with code ${code}`,
            exitCode: code,
            signal: signal || '',
          })
          send('end', 'failed')
        }
      }
      safeEnd()
    })

    // Keep yt-dlp alive even if the client drops the SSE connection.
    // Only mark response as closed when the response stream is actually gone.
    res.on('close', () => {
      if (responseClosed) return
      responseClosed = true
      if (!res.writableEnded) {
        console.log(`[${downloadHash}] Client disconnected (keeping download alive)`)
      }
      // activeDownloads.delete(downloadHash) // Don't delete yet, let it finish so it caches
    })
  } catch (e) {
    send('error', String(e?.message || e))
    send('end', 'failed')
    safeEnd()
  }
})

// GET /api/download/file/:filename -> Serve cached download file
app.get('/api/download/file/:filename', (req, res) => {
  try {
    let filename = ''
    try {
      filename = decodeURIComponent(req.params.filename)
    } catch {
      return res.status(400).json({ error: 'Invalid filename encoding' })
    }
    // Sanitize to prevent directory traversal
    const safeName = path.basename(filename)
    const filePath = path.join(DOWNLOADS_DIR, safeName)

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' })
    }

    // Update access time to keep file in cache
    fs.utimesSync(filePath, new Date(), new Date())

    // Serve file with proper headers
    const ext = path.extname(safeName).toLowerCase()
    const contentTypeMap = {
      '.mp3': 'audio/mpeg',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mkv': 'video/x-matroska',
      '.m4a': 'audio/mp4',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
      '.flac': 'audio/flac',
      '.opus': 'audio/opus',
    }
    const contentType = contentTypeMap[ext] || 'application/octet-stream'

    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', buildAttachmentContentDisposition(safeName, 'download'))
    res.setHeader('Cache-Control', 'public, max-age=86400') // 24 hours

    const stream = fs.createReadStream(filePath)
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to read file' })
      } else {
        res.destroy()
      }
    })
    stream.pipe(res)
  } catch (err) {
    res.status(500).json({ error: 'Failed to serve file', details: String(err?.message || err) })
  }
})

app.listen(PORT, () => {
  console.log(`yLoader backend listening on port ${PORT}`)
  console.log(`Downloads directory: ${DOWNLOADS_DIR}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...')
  process.exit(0)
})
