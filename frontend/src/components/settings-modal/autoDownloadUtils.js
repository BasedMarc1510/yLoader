function getRuntimeDownloadsPath() {
  if (typeof window === 'undefined') return ''
  return String(window?.yloaderRuntime?.downloadsPath || '').trim()
}

function normalizeDownloadPath(value, fallbackPath) {
  const fallback = String(fallbackPath || '').trim()
  const raw = String(value || '')
    .replace(/\u0000/g, '')
    .trim()
  return raw || fallback
}

const RUNTIME_DOWNLOADS_PATH = getRuntimeDownloadsPath()

export const AUTO_DOWNLOAD_DEFAULTS = {
  useMetadata: true,
  embedCoverArt: true,
  maxAudioBitrateKbps: 0,
  maxVideoHeight: 0,
  useFixedDownloadPath: false,
  fixedDownloadPath: RUNTIME_DOWNLOADS_PATH,
}

export function normalizeAutoDownloadSettings(value) {
  const input = (value && typeof value === 'object') ? value : {}
  const maxAudioBitrateKbps = Number(input.maxAudioBitrateKbps)
  const maxVideoHeight = Number(input.maxVideoHeight)
  const fixedDownloadPath = normalizeDownloadPath(
    input.fixedDownloadPath,
    AUTO_DOWNLOAD_DEFAULTS.fixedDownloadPath,
  )

  return {
    useMetadata: input.useMetadata !== undefined ? Boolean(input.useMetadata) : AUTO_DOWNLOAD_DEFAULTS.useMetadata,
    embedCoverArt: input.embedCoverArt !== undefined ? Boolean(input.embedCoverArt) : AUTO_DOWNLOAD_DEFAULTS.embedCoverArt,
    maxAudioBitrateKbps: Number.isFinite(maxAudioBitrateKbps) ? maxAudioBitrateKbps : AUTO_DOWNLOAD_DEFAULTS.maxAudioBitrateKbps,
    maxVideoHeight: Number.isFinite(maxVideoHeight) ? maxVideoHeight : AUTO_DOWNLOAD_DEFAULTS.maxVideoHeight,
    useFixedDownloadPath: input.useFixedDownloadPath !== undefined
      ? Boolean(input.useFixedDownloadPath)
      : AUTO_DOWNLOAD_DEFAULTS.useFixedDownloadPath,
    fixedDownloadPath,
  }
}
