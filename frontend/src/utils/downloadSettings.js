import {
  createDownloadSettingsDefaults,
  DOWNLOAD_AUDIO_BITRATE_VALUES,
  DOWNLOAD_CONCURRENCY_VALUES,
  DOWNLOAD_FILENAME_PATTERN_TOKENS,
  DOWNLOAD_STAGGER_VALUES,
  DOWNLOAD_VIDEO_HEIGHT_VALUES,
  normalizeDownloadSettings as normalizeSharedDownloadSettings,
  resolveDownloadFilenamePattern as resolveSharedDownloadFilenamePattern,
  resolveDownloadTargetSettings as resolveSharedDownloadTargetSettings,
} from '../../../shared/settings/downloadSettings.js'

function getRuntimeDownloadsPath() {
  if (typeof window === 'undefined') return ''
  return String(window?.yloaderRuntime?.downloadsPath || '').trim()
}

const RUNTIME_DOWNLOADS_PATH = getRuntimeDownloadsPath()

export { DOWNLOAD_FILENAME_PATTERN_TOKENS }

export const DOWNLOAD_SETTINGS_DEFAULTS =
  createDownloadSettingsDefaults(RUNTIME_DOWNLOADS_PATH)

export const DOWNLOAD_CONCURRENCY_OPTIONS =
  Object.freeze([...DOWNLOAD_CONCURRENCY_VALUES])

export const DOWNLOAD_STAGGER_OPTIONS =
  Object.freeze([...DOWNLOAD_STAGGER_VALUES])

export const DOWNLOAD_AUDIO_BITRATE_OPTIONS = Object.freeze(
  [...DOWNLOAD_AUDIO_BITRATE_VALUES].sort((left, right) => right - left),
)

export const DOWNLOAD_VIDEO_QUALITY_OPTIONS = Object.freeze(
  [...DOWNLOAD_VIDEO_HEIGHT_VALUES].sort((left, right) => right - left),
)

export function normalizeDownloadSettings(value) {
  return normalizeSharedDownloadSettings(value, {
    defaultPath: RUNTIME_DOWNLOADS_PATH,
  })
}

export function resolveDownloadFilenamePattern(input) {
  return resolveSharedDownloadFilenamePattern({
    ...input,
    defaultPath: RUNTIME_DOWNLOADS_PATH,
  })
}

export function resolveDownloadTargetSettings(settings, downloadType = 'video') {
  return resolveSharedDownloadTargetSettings(settings, downloadType, {
    defaultPath: RUNTIME_DOWNLOADS_PATH,
  })
}
