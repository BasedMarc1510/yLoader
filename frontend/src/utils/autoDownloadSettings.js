import {
  createAutoDownloadSettingsDefaults,
  normalizeAutoDownloadSettings as normalizeSharedAutoDownloadSettings,
} from '../../../shared/settings/autoDownloadSettings.js'

function getRuntimeDownloadsPath() {
  if (typeof window === 'undefined') return ''
  return String(window?.yloaderRuntime?.downloadsPath || '').trim()
}

const RUNTIME_DOWNLOADS_PATH = getRuntimeDownloadsPath()

export const AUTO_DOWNLOAD_SETTINGS_DEFAULTS =
  createAutoDownloadSettingsDefaults(RUNTIME_DOWNLOADS_PATH)

export function normalizeAutoDownloadSettings(value) {
  return normalizeSharedAutoDownloadSettings(value, {
    defaultPath: RUNTIME_DOWNLOADS_PATH,
  })
}
