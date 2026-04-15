export const AUTO_DOWNLOAD_DEFAULTS = {
  useMetadata: true,
  embedCoverArt: true,
  maxAudioBitrateKbps: 0,
  maxVideoHeight: 0,
}

export function normalizeAutoDownloadSettings(value) {
  const input = (value && typeof value === 'object') ? value : {}
  const maxAudioBitrateKbps = Number(input.maxAudioBitrateKbps)
  const maxVideoHeight = Number(input.maxVideoHeight)

  return {
    useMetadata: input.useMetadata !== undefined ? Boolean(input.useMetadata) : AUTO_DOWNLOAD_DEFAULTS.useMetadata,
    embedCoverArt: input.embedCoverArt !== undefined ? Boolean(input.embedCoverArt) : AUTO_DOWNLOAD_DEFAULTS.embedCoverArt,
    maxAudioBitrateKbps: Number.isFinite(maxAudioBitrateKbps) ? maxAudioBitrateKbps : AUTO_DOWNLOAD_DEFAULTS.maxAudioBitrateKbps,
    maxVideoHeight: Number.isFinite(maxVideoHeight) ? maxVideoHeight : AUTO_DOWNLOAD_DEFAULTS.maxVideoHeight,
  }
}
