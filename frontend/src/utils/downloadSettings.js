const AUDIO_CONTAINER_OPTIONS = new Set(['mp3', 'm4a', 'wav', 'ogg', 'flac', 'opus'])
const VIDEO_CONTAINER_OPTIONS = new Set(['mp4', 'webm', 'mkv'])
const CONCURRENT_DOWNLOAD_OPTIONS = new Set([1, 2, 3, 4, 5, 6, 7, 8])
const STAGGER_DOWNLOAD_OPTIONS = new Set([0, 100, 150, 250, 500, 1000])
const AUDIO_BITRATE_THRESHOLD_OPTIONS = new Set([0, 96, 128, 160, 192, 256, 320])
const VIDEO_HEIGHT_THRESHOLD_OPTIONS = new Set([0, 360, 480, 720, 1080, 1440, 2160])

export const DOWNLOAD_SETTINGS_DEFAULTS = Object.freeze({
  maxConcurrentDownloads: 3,
  staggerDownloadsMs: 150,
  defaultAudioContainer: 'mp3',
  defaultVideoContainer: 'mp4',
  defaultEmbedCoverArt: true,
  maxAudioBitrateKbps: 0,
  maxVideoHeight: 0,
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
  }
}
