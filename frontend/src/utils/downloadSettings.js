const AUDIO_CONTAINER_OPTIONS = new Set(['mp3', 'm4a', 'wav', 'ogg', 'flac', 'opus'])
const VIDEO_CONTAINER_OPTIONS = new Set(['mp4', 'webm', 'mkv'])
const CONCURRENT_DOWNLOAD_OPTIONS = new Set([1, 2, 3, 4, 5, 6, 7, 8])
const STAGGER_DOWNLOAD_OPTIONS = new Set([0, 100, 150, 250, 500, 1000])
const AUDIO_BITRATE_THRESHOLD_OPTIONS = new Set([0, 96, 128, 160, 192, 256, 320])
const VIDEO_HEIGHT_THRESHOLD_OPTIONS = new Set([0, 360, 480, 720, 1080, 1440, 2160])
const DOWNLOAD_LOCATION_MODE_OPTIONS = new Set(['all', 'separate'])
const DOWNLOAD_FILENAME_PATTERN_MAX_LENGTH = 180
const DOWNLOAD_FILENAME_PATTERN_DEFAULT = '{title}'
const DOWNLOAD_FILENAME_PATTERN_TOKEN_REGEX = /\{(title|artist|uploader|service|type|id|date|time|datetime)\}/gi

export const DOWNLOAD_FILENAME_PATTERN_TOKENS = Object.freeze([
  '{title}',
  '{artist}',
  '{uploader}',
  '{service}',
  '{type}',
  '{id}',
  '{date}',
  '{time}',
  '{datetime}',
])

function getRuntimeDownloadsPath() {
  if (typeof window === 'undefined') return ''
  const runtimePath = String(window?.yloaderRuntime?.downloadsPath || '').trim()
  return runtimePath
}

function normalizeDownloadPath(value, fallbackPath) {
  const fallback = String(fallbackPath || '').trim()
  const raw = String(value || '')
    .replace(/\u0000/g, '')
    .trim()
  return raw || fallback
}

function normalizeDownloadFilenamePattern(value, fallbackPattern = DOWNLOAD_FILENAME_PATTERN_DEFAULT) {
  const fallback = String(fallbackPattern || DOWNLOAD_FILENAME_PATTERN_DEFAULT)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DOWNLOAD_FILENAME_PATTERN_MAX_LENGTH)

  const raw = String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DOWNLOAD_FILENAME_PATTERN_MAX_LENGTH)

  return raw || fallback || DOWNLOAD_FILENAME_PATTERN_DEFAULT
}

function sanitizeFilenamePart(value, maxLen = 120) {
  const sanitized = String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
    .replace(/[. ]+$/g, '')

  if (!sanitized || sanitized === '.' || sanitized === '..') return ''
  return sanitized
}

function padDateTimeSegment(value) {
  const numeric = Number(value)
  const normalized = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0
  return String(normalized).padStart(2, '0')
}

function extractSourceId(rawUrl) {
  const sourceUrl = String(rawUrl || '').trim()
  if (!sourceUrl) return ''

  try {
    const parsed = new URL(sourceUrl)
    const hostname = String(parsed.hostname || '').trim().toLowerCase()

    if (hostname.includes('youtube.com')) {
      const youtubeId = String(parsed.searchParams.get('v') || '').trim()
      if (youtubeId) return sanitizeFilenamePart(youtubeId, 80)
    }

    if (hostname.includes('youtu.be')) {
      const segment = String(parsed.pathname || '').split('/').filter(Boolean)[0] || ''
      if (segment) return sanitizeFilenamePart(segment, 80)
    }

    const paramCandidates = ['id', 'video_id', 'track', 'song']
    for (const key of paramCandidates) {
      const candidate = String(parsed.searchParams.get(key) || '').trim()
      if (candidate) return sanitizeFilenamePart(candidate, 80)
    }

    const lastSegment = String(parsed.pathname || '')
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .pop() || ''

    return sanitizeFilenamePart(lastSegment, 80)
  } catch {
    return ''
  }
}

function resolveFilenamePatternFieldName(downloadType = 'video') {
  const normalizedType = String(downloadType || '').trim().toLowerCase()
  if (normalizedType === 'audio') return 'audioFilenamePattern'
  if (normalizedType === 'thumbnail') return 'thumbnailFilenamePattern'
  return 'videoFilenamePattern'
}

function buildFilenameTemplateValues({
  title,
  artist,
  uploader,
  service,
  downloadType,
  sourceUrl,
}) {
  const now = new Date()
  const date = `${now.getFullYear()}-${padDateTimeSegment(now.getMonth() + 1)}-${padDateTimeSegment(now.getDate())}`
  const time = `${padDateTimeSegment(now.getHours())}-${padDateTimeSegment(now.getMinutes())}-${padDateTimeSegment(now.getSeconds())}`

  return {
    title: sanitizeFilenamePart(title, 120),
    artist: sanitizeFilenamePart(artist, 120),
    uploader: sanitizeFilenamePart(uploader, 120),
    service: sanitizeFilenamePart(service, 80),
    type: sanitizeFilenamePart(downloadType, 40),
    id: extractSourceId(sourceUrl),
    date,
    time,
    datetime: `${date}_${time}`,
  }
}

export function resolveDownloadFilenamePattern({
  settings,
  downloadType = 'video',
  title = '',
  artist = '',
  uploader = '',
  service = '',
  sourceUrl = '',
  fallbackBaseName = 'download',
}) {
  const fieldName = resolveFilenamePatternFieldName(downloadType)
  const patternFallback = DOWNLOAD_SETTINGS_DEFAULTS[fieldName] || DOWNLOAD_FILENAME_PATTERN_DEFAULT
  const pattern = normalizeDownloadFilenamePattern(settings?.[fieldName], patternFallback)
  const values = buildFilenameTemplateValues({
    title,
    artist,
    uploader,
    service,
    downloadType,
    sourceUrl,
  })

  const replaced = pattern.replace(DOWNLOAD_FILENAME_PATTERN_TOKEN_REGEX, (_match, tokenName) => {
    const key = String(tokenName || '').trim().toLowerCase()
    return values[key] || ''
  })

  const resolved = sanitizeFilenamePart(replaced, 120)
  if (resolved) return resolved

  const fallbackTitle = sanitizeFilenamePart(title, 120)
  if (fallbackTitle) return fallbackTitle

  return sanitizeFilenamePart(fallbackBaseName, 120) || 'download'
}

const RUNTIME_DOWNLOADS_PATH = getRuntimeDownloadsPath()

export const DOWNLOAD_SETTINGS_DEFAULTS = Object.freeze({
  maxConcurrentDownloads: 3,
  staggerDownloadsMs: 150,
  defaultAudioContainer: 'mp3',
  defaultVideoContainer: 'mp4',
  defaultEmbedCoverArt: true,
  maxAudioBitrateKbps: 0,
  maxVideoHeight: 0,
  audioFilenamePattern: DOWNLOAD_FILENAME_PATTERN_DEFAULT,
  videoFilenamePattern: DOWNLOAD_FILENAME_PATTERN_DEFAULT,
  thumbnailFilenamePattern: DOWNLOAD_FILENAME_PATTERN_DEFAULT,
  downloadLocationMode: 'all',
  globalDownloadPath: RUNTIME_DOWNLOADS_PATH,
  globalAlwaysAsk: true,
  audioDownloadPath: RUNTIME_DOWNLOADS_PATH,
  videoDownloadPath: RUNTIME_DOWNLOADS_PATH,
  thumbnailDownloadPath: RUNTIME_DOWNLOADS_PATH,
  audioAlwaysAsk: true,
  videoAlwaysAsk: true,
  thumbnailAlwaysAsk: true,
})

export const DOWNLOAD_CONCURRENCY_OPTIONS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8])
export const DOWNLOAD_STAGGER_OPTIONS = Object.freeze([0, 100, 150, 250, 500, 1000])
export const DOWNLOAD_AUDIO_BITRATE_OPTIONS = Object.freeze([0, 320, 256, 192, 160, 128, 96])
export const DOWNLOAD_VIDEO_QUALITY_OPTIONS = Object.freeze([0, 2160, 1440, 1080, 720, 480, 360])

export function normalizeDownloadSettings(value) {
  const input = (value && typeof value === 'object') ? value : {}

  const maxConcurrentRaw = Number(input.maxConcurrentDownloads)
  const staggerRaw = Number(input.staggerDownloadsMs)
  const defaultAudioContainer = String(input.defaultAudioContainer || '').trim().toLowerCase()
  const defaultVideoContainer = String(input.defaultVideoContainer || '').trim().toLowerCase()
  const maxAudioBitrateRaw = Number(input.maxAudioBitrateKbps)
  const maxVideoHeightRaw = Number(input.maxVideoHeight)
  const audioFilenamePattern = normalizeDownloadFilenamePattern(
    input.audioFilenamePattern,
    DOWNLOAD_SETTINGS_DEFAULTS.audioFilenamePattern
  )
  const videoFilenamePattern = normalizeDownloadFilenamePattern(
    input.videoFilenamePattern,
    DOWNLOAD_SETTINGS_DEFAULTS.videoFilenamePattern
  )
  const thumbnailFilenamePattern = normalizeDownloadFilenamePattern(
    input.thumbnailFilenamePattern,
    DOWNLOAD_SETTINGS_DEFAULTS.thumbnailFilenamePattern
  )
  const downloadLocationModeRaw = String(input.downloadLocationMode || '').trim().toLowerCase()

  const globalDownloadPath = normalizeDownloadPath(
    input.globalDownloadPath,
    DOWNLOAD_SETTINGS_DEFAULTS.globalDownloadPath
  )
  const audioDownloadPath = normalizeDownloadPath(
    input.audioDownloadPath,
    DOWNLOAD_SETTINGS_DEFAULTS.audioDownloadPath || globalDownloadPath
  )
  const videoDownloadPath = normalizeDownloadPath(
    input.videoDownloadPath,
    DOWNLOAD_SETTINGS_DEFAULTS.videoDownloadPath || globalDownloadPath
  )
  const thumbnailDownloadPath = normalizeDownloadPath(
    input.thumbnailDownloadPath,
    DOWNLOAD_SETTINGS_DEFAULTS.thumbnailDownloadPath || globalDownloadPath
  )

  return {
    maxConcurrentDownloads: CONCURRENT_DOWNLOAD_OPTIONS.has(maxConcurrentRaw)
      ? maxConcurrentRaw
      : DOWNLOAD_SETTINGS_DEFAULTS.maxConcurrentDownloads,
    staggerDownloadsMs: STAGGER_DOWNLOAD_OPTIONS.has(staggerRaw)
      ? staggerRaw
      : DOWNLOAD_SETTINGS_DEFAULTS.staggerDownloadsMs,
    defaultAudioContainer: AUDIO_CONTAINER_OPTIONS.has(defaultAudioContainer)
      ? defaultAudioContainer
      : DOWNLOAD_SETTINGS_DEFAULTS.defaultAudioContainer,
    defaultVideoContainer: VIDEO_CONTAINER_OPTIONS.has(defaultVideoContainer)
      ? defaultVideoContainer
      : DOWNLOAD_SETTINGS_DEFAULTS.defaultVideoContainer,
    defaultEmbedCoverArt: input.defaultEmbedCoverArt !== undefined
      ? Boolean(input.defaultEmbedCoverArt)
      : DOWNLOAD_SETTINGS_DEFAULTS.defaultEmbedCoverArt,
    maxAudioBitrateKbps: AUDIO_BITRATE_THRESHOLD_OPTIONS.has(maxAudioBitrateRaw)
      ? maxAudioBitrateRaw
      : DOWNLOAD_SETTINGS_DEFAULTS.maxAudioBitrateKbps,
    maxVideoHeight: VIDEO_HEIGHT_THRESHOLD_OPTIONS.has(maxVideoHeightRaw)
      ? maxVideoHeightRaw
      : DOWNLOAD_SETTINGS_DEFAULTS.maxVideoHeight,
    audioFilenamePattern,
    videoFilenamePattern,
    thumbnailFilenamePattern,
    downloadLocationMode: DOWNLOAD_LOCATION_MODE_OPTIONS.has(downloadLocationModeRaw)
      ? downloadLocationModeRaw
      : DOWNLOAD_SETTINGS_DEFAULTS.downloadLocationMode,
    globalDownloadPath,
    globalAlwaysAsk: input.globalAlwaysAsk !== undefined
      ? Boolean(input.globalAlwaysAsk)
      : DOWNLOAD_SETTINGS_DEFAULTS.globalAlwaysAsk,
    audioDownloadPath,
    videoDownloadPath,
    thumbnailDownloadPath,
    audioAlwaysAsk: input.audioAlwaysAsk !== undefined
      ? Boolean(input.audioAlwaysAsk)
      : DOWNLOAD_SETTINGS_DEFAULTS.audioAlwaysAsk,
    videoAlwaysAsk: input.videoAlwaysAsk !== undefined
      ? Boolean(input.videoAlwaysAsk)
      : DOWNLOAD_SETTINGS_DEFAULTS.videoAlwaysAsk,
    thumbnailAlwaysAsk: input.thumbnailAlwaysAsk !== undefined
      ? Boolean(input.thumbnailAlwaysAsk)
      : DOWNLOAD_SETTINGS_DEFAULTS.thumbnailAlwaysAsk,
  }
}

export function resolveDownloadTargetSettings(settings, downloadType = 'video') {
  const normalized = normalizeDownloadSettings(settings)

  if (String(normalized.downloadLocationMode || 'all') !== 'separate') {
    return {
      directoryPath: String(normalized.globalDownloadPath || '').trim(),
      alwaysAsk: Boolean(normalized.globalAlwaysAsk),
    }
  }

  if (downloadType === 'audio') {
    return {
      directoryPath: String(normalized.audioDownloadPath || '').trim(),
      alwaysAsk: Boolean(normalized.audioAlwaysAsk),
    }
  }

  if (downloadType === 'thumbnail') {
    return {
      directoryPath: String(normalized.thumbnailDownloadPath || '').trim(),
      alwaysAsk: Boolean(normalized.thumbnailAlwaysAsk),
    }
  }

  return {
    directoryPath: String(normalized.videoDownloadPath || '').trim(),
    alwaysAsk: Boolean(normalized.videoAlwaysAsk),
  }
}
