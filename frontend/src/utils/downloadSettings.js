const AUDIO_CONTAINER_OPTIONS = new Set(['mp3', 'm4a', 'wav', 'ogg', 'flac', 'opus'])
const VIDEO_CONTAINER_OPTIONS = new Set(['mp4', 'webm', 'mkv'])
const CONCURRENT_DOWNLOAD_OPTIONS = new Set([1, 2, 3, 4, 5, 6, 7, 8])
const STAGGER_DOWNLOAD_OPTIONS = new Set([0, 100, 150, 250, 500, 1000])
const AUDIO_BITRATE_THRESHOLD_OPTIONS = new Set([0, 96, 128, 160, 192, 256, 320])
const VIDEO_HEIGHT_THRESHOLD_OPTIONS = new Set([0, 360, 480, 720, 1080, 1440, 2160])
const DOWNLOAD_LOCATION_MODE_OPTIONS = new Set(['all', 'separate'])

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

const RUNTIME_DOWNLOADS_PATH = getRuntimeDownloadsPath()

export const DOWNLOAD_SETTINGS_DEFAULTS = Object.freeze({
  maxConcurrentDownloads: 3,
  staggerDownloadsMs: 150,
  defaultAudioContainer: 'mp3',
  defaultVideoContainer: 'mp4',
  defaultEmbedCoverArt: true,
  maxAudioBitrateKbps: 0,
  maxVideoHeight: 0,
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
