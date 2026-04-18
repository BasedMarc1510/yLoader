export const HOME_PREFETCH_CACHE_KEY = 'yloader.home.prefetch.v1'
export const HOME_AUTO_PREFS_KEY = 'yloader.home.autoDownload.prefs.v1'

function getRuntimeDownloadsPath() {
  if (typeof window === 'undefined') return ''
  return String(window?.yloaderRuntime?.downloadsPath || '').trim()
}

const RUNTIME_DOWNLOADS_PATH = getRuntimeDownloadsPath()

export const AUTO_DOWNLOAD_SETTINGS_DEFAULTS = Object.freeze({
  useMetadata: true,
  embedCoverArt: true,
  maxAudioBitrateKbps: 0,
  maxVideoHeight: 0,
  useFixedDownloadPath: false,
  fixedDownloadPath: RUNTIME_DOWNLOADS_PATH,
})
