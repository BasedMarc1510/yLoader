import {
  createYtDlpCookieSettingsDefaults,
  normalizeYtDlpCookieSettings as normalizeSharedYtDlpCookieSettings,
} from '../../../shared/settings/ytDlpCookieSettings.js'

export const YT_DLP_COOKIE_SETTINGS_DEFAULTS =
  createYtDlpCookieSettingsDefaults()

export function normalizeYtDlpCookieSettings(value) {
  return normalizeSharedYtDlpCookieSettings(value)
}
