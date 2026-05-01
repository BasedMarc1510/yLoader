export const AUDIO_CONTAINER_VALUES = Object.freeze([
  'mp3',
  'm4a',
  'wav',
  'ogg',
  'flac',
  'opus',
])
export const VIDEO_CONTAINER_VALUES = Object.freeze(['mp4', 'webm', 'mkv'])
export const DOWNLOAD_CONCURRENCY_VALUES = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8])
export const DOWNLOAD_STAGGER_VALUES = Object.freeze([0, 100, 150, 250, 500, 1000])
export const DOWNLOAD_AUDIO_BITRATE_VALUES = Object.freeze([0, 96, 128, 160, 192, 256, 320])
export const DOWNLOAD_VIDEO_HEIGHT_VALUES = Object.freeze([0, 360, 480, 720, 1080, 1440, 2160])
export const DOWNLOAD_LOCATION_MODE_VALUES = Object.freeze(['all', 'separate'])
export const DOWNLOAD_FILENAME_PATTERN_DEFAULT = '{title}'
export const DOWNLOAD_FILENAME_PATTERN_MAX_LENGTH = 180
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
export const DOWNLOAD_FILENAME_PATTERN_TOKEN_REGEX =
  /\{(title|artist|uploader|service|type|id|date|time|datetime)\}/gi

const AUDIO_CONTAINER_SET = new Set(AUDIO_CONTAINER_VALUES)
const VIDEO_CONTAINER_SET = new Set(VIDEO_CONTAINER_VALUES)
const DOWNLOAD_CONCURRENCY_SET = new Set(DOWNLOAD_CONCURRENCY_VALUES)
const DOWNLOAD_STAGGER_SET = new Set(DOWNLOAD_STAGGER_VALUES)
const DOWNLOAD_AUDIO_BITRATE_SET = new Set(DOWNLOAD_AUDIO_BITRATE_VALUES)
const DOWNLOAD_VIDEO_HEIGHT_SET = new Set(DOWNLOAD_VIDEO_HEIGHT_VALUES)
const DOWNLOAD_LOCATION_MODE_SET = new Set(DOWNLOAD_LOCATION_MODE_VALUES)

export function defaultNormalizeDownloadPath(value, fallbackPath = '') {
  const fallback = String(fallbackPath || '').trim()
  const raw = String(value || '')
    .replace(/\u0000/g, '')
    .trim()
  return raw || fallback
}

export function sanitizeFilenamePart(value, maxLength = 120) {
  const sanitized = String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .replace(/[. ]+$/g, '')

  if (!sanitized || sanitized === '.' || sanitized === '..') return ''
  return sanitized
}

export function normalizeDownloadFilenamePattern(
  value,
  fallbackPattern = DOWNLOAD_FILENAME_PATTERN_DEFAULT,
) {
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

export function createDownloadSettingsDefaults(defaultPath = '') {
  const resolvedDefaultPath = String(defaultPath || '').trim()

  return Object.freeze({
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
    globalDownloadPath: resolvedDefaultPath,
    globalAlwaysAsk: true,
    audioDownloadPath: resolvedDefaultPath,
    videoDownloadPath: resolvedDefaultPath,
    thumbnailDownloadPath: resolvedDefaultPath,
    audioAlwaysAsk: true,
    videoAlwaysAsk: true,
    thumbnailAlwaysAsk: true,
  })
}

export function normalizeDownloadSettings(
  value,
  {
    defaultPath = '',
    normalizePath = defaultNormalizeDownloadPath,
  } = {},
) {
  const input = (value && typeof value === 'object') ? value : {}
  const defaults = createDownloadSettingsDefaults(defaultPath)

  const maxConcurrentRaw = Number(input.maxConcurrentDownloads)
  const staggerRaw = Number(input.staggerDownloadsMs)
  const defaultAudioContainer = String(input.defaultAudioContainer || '').trim().toLowerCase()
  const defaultVideoContainer = String(input.defaultVideoContainer || '').trim().toLowerCase()
  const maxAudioBitrateRaw = Number(input.maxAudioBitrateKbps)
  const maxVideoHeightRaw = Number(input.maxVideoHeight)
  const audioFilenamePattern = normalizeDownloadFilenamePattern(
    input.audioFilenamePattern,
    defaults.audioFilenamePattern,
  )
  const videoFilenamePattern = normalizeDownloadFilenamePattern(
    input.videoFilenamePattern,
    defaults.videoFilenamePattern,
  )
  const thumbnailFilenamePattern = normalizeDownloadFilenamePattern(
    input.thumbnailFilenamePattern,
    defaults.thumbnailFilenamePattern,
  )
  const downloadLocationModeRaw = String(input.downloadLocationMode || '').trim().toLowerCase()

  const globalDownloadPath = normalizePath(
    input.globalDownloadPath,
    defaults.globalDownloadPath,
  )
  const audioDownloadPath = normalizePath(
    input.audioDownloadPath,
    defaults.audioDownloadPath || globalDownloadPath,
  )
  const videoDownloadPath = normalizePath(
    input.videoDownloadPath,
    defaults.videoDownloadPath || globalDownloadPath,
  )
  const thumbnailDownloadPath = normalizePath(
    input.thumbnailDownloadPath,
    defaults.thumbnailDownloadPath || globalDownloadPath,
  )

  return {
    maxConcurrentDownloads: DOWNLOAD_CONCURRENCY_SET.has(maxConcurrentRaw)
      ? maxConcurrentRaw
      : defaults.maxConcurrentDownloads,
    staggerDownloadsMs: DOWNLOAD_STAGGER_SET.has(staggerRaw)
      ? staggerRaw
      : defaults.staggerDownloadsMs,
    defaultAudioContainer: AUDIO_CONTAINER_SET.has(defaultAudioContainer)
      ? defaultAudioContainer
      : defaults.defaultAudioContainer,
    defaultVideoContainer: VIDEO_CONTAINER_SET.has(defaultVideoContainer)
      ? defaultVideoContainer
      : defaults.defaultVideoContainer,
    defaultEmbedCoverArt: input.defaultEmbedCoverArt !== undefined
      ? Boolean(input.defaultEmbedCoverArt)
      : defaults.defaultEmbedCoverArt,
    maxAudioBitrateKbps: DOWNLOAD_AUDIO_BITRATE_SET.has(maxAudioBitrateRaw)
      ? maxAudioBitrateRaw
      : defaults.maxAudioBitrateKbps,
    maxVideoHeight: DOWNLOAD_VIDEO_HEIGHT_SET.has(maxVideoHeightRaw)
      ? maxVideoHeightRaw
      : defaults.maxVideoHeight,
    audioFilenamePattern,
    videoFilenamePattern,
    thumbnailFilenamePattern,
    downloadLocationMode: DOWNLOAD_LOCATION_MODE_SET.has(downloadLocationModeRaw)
      ? downloadLocationModeRaw
      : defaults.downloadLocationMode,
    globalDownloadPath,
    globalAlwaysAsk: input.globalAlwaysAsk !== undefined
      ? Boolean(input.globalAlwaysAsk)
      : defaults.globalAlwaysAsk,
    audioDownloadPath,
    videoDownloadPath,
    thumbnailDownloadPath,
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

export function resolveDownloadTargetSettings(
  settings,
  downloadType = 'video',
  options = {},
) {
  const normalized = normalizeDownloadSettings(settings, options)

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

export function resolveFilenamePatternFieldName(downloadType = 'video') {
  const normalizedType = String(downloadType || '').trim().toLowerCase()
  if (normalizedType === 'audio') return 'audioFilenamePattern'
  if (normalizedType === 'thumbnail') return 'thumbnailFilenamePattern'
  return 'videoFilenamePattern'
}

export function padDateTimeSegment(value) {
  const numeric = Number(value)
  const normalized = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0
  return String(normalized).padStart(2, '0')
}

export function extractSourceId(rawUrl) {
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

export function buildFilenameTemplateValues({
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
  defaultPath = '',
} = {}) {
  const defaults = createDownloadSettingsDefaults(defaultPath)
  const fieldName = resolveFilenamePatternFieldName(downloadType)
  const patternFallback = defaults[fieldName] || DOWNLOAD_FILENAME_PATTERN_DEFAULT
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
