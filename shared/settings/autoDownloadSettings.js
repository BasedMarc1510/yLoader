import {
  DOWNLOAD_AUDIO_BITRATE_VALUES,
  DOWNLOAD_VIDEO_HEIGHT_VALUES,
  defaultNormalizeDownloadPath,
} from './downloadSettings.js'

const AUTO_DOWNLOAD_AUDIO_BITRATE_SET = new Set(DOWNLOAD_AUDIO_BITRATE_VALUES)
const AUTO_DOWNLOAD_VIDEO_HEIGHT_SET = new Set(DOWNLOAD_VIDEO_HEIGHT_VALUES)

export function createAutoDownloadSettingsDefaults(defaultPath = '') {
  return Object.freeze({
    useMetadata: true,
    embedCoverArt: true,
    maxAudioBitrateKbps: 0,
    maxVideoHeight: 0,
    useFixedDownloadPath: false,
    fixedDownloadPath: String(defaultPath || '').trim(),
  })
}

export function normalizeAutoDownloadSettings(
  value,
  {
    defaultPath = '',
    normalizePath = defaultNormalizeDownloadPath,
  } = {},
) {
  const input = (value && typeof value === 'object') ? value : {}
  const defaults = createAutoDownloadSettingsDefaults(defaultPath)
  const maxAudioBitrateKbps = Number(input.maxAudioBitrateKbps)
  const maxVideoHeight = Number(input.maxVideoHeight)
  const fixedDownloadPath = normalizePath(
    input.fixedDownloadPath,
    defaults.fixedDownloadPath,
  )

  return {
    useMetadata: input.useMetadata !== undefined
      ? Boolean(input.useMetadata)
      : defaults.useMetadata,
    embedCoverArt: input.embedCoverArt !== undefined
      ? Boolean(input.embedCoverArt)
      : defaults.embedCoverArt,
    maxAudioBitrateKbps: AUTO_DOWNLOAD_AUDIO_BITRATE_SET.has(maxAudioBitrateKbps)
      ? maxAudioBitrateKbps
      : defaults.maxAudioBitrateKbps,
    maxVideoHeight: AUTO_DOWNLOAD_VIDEO_HEIGHT_SET.has(maxVideoHeight)
      ? maxVideoHeight
      : defaults.maxVideoHeight,
    useFixedDownloadPath: input.useFixedDownloadPath !== undefined
      ? Boolean(input.useFixedDownloadPath)
      : defaults.useFixedDownloadPath,
    fixedDownloadPath,
  }
}
