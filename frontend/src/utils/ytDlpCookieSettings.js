function normalizeText(value, maxLength = 2048) {
  const raw = String(value || '')
    .replace(/\u0000/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
  if (!raw) return ''
  return raw.slice(0, maxLength)
}

function normalizeList(values) {
  if (!Array.isArray(values)) return []

  const seen = new Set()
  const normalized = []

  for (const value of values) {
    const item = normalizeText(value, 64).toLowerCase()
    if (!item || seen.has(item)) continue
    seen.add(item)
    normalized.push(item)
  }

  return normalized
}

export const YT_DLP_COOKIE_SETTINGS_DEFAULTS = Object.freeze({
  cookiesFileEnabled: false,
  cookiesFilePath: '',
  cookiesFromBrowserEnabled: false,
  browserName: '',
  browserKeyring: '',
  browserProfile: '',
  browserContainer: '',
  browserImportSupported: false,
  runtimeTarget: 'server',
  supportedBrowsers: [],
  supportedKeyrings: [],
})

export function normalizeYtDlpCookieSettings(value) {
  const input = (value && typeof value === 'object') ? value : {}

  const supportedBrowsers = normalizeList(input.supportedBrowsers)
  const supportedKeyrings = normalizeList(input.supportedKeyrings)

  const browserName = normalizeText(input.browserName, 64).toLowerCase()
  const browserKeyring = normalizeText(input.browserKeyring, 64).toLowerCase()
  const browserProfile = normalizeText(input.browserProfile, 1024)
  const browserContainer = normalizeText(input.browserContainer, 256)

  const browserAvailable = Boolean(input.browserImportSupported)
  const browserSupported = supportedBrowsers.length
    ? supportedBrowsers.includes(browserName)
    : Boolean(browserName)

  const cookiesFromBrowserEnabled = Boolean(
    browserAvailable
    && input.cookiesFromBrowserEnabled
    && browserName
    && browserSupported
  )

  const cookiesFileEnabledRaw = input.cookiesFileEnabled !== undefined
    ? Boolean(input.cookiesFileEnabled)
    : YT_DLP_COOKIE_SETTINGS_DEFAULTS.cookiesFileEnabled
  const cookiesFileEnabled = Boolean(cookiesFileEnabledRaw && !cookiesFromBrowserEnabled)

  return {
    cookiesFileEnabled,
    cookiesFilePath: normalizeText(input.cookiesFilePath, 4096),
    cookiesFromBrowserEnabled,
    browserName: browserSupported ? browserName : '',
    browserKeyring,
    browserProfile,
    browserContainer,
    browserImportSupported: browserAvailable,
    runtimeTarget: normalizeText(input.runtimeTarget, 32).toLowerCase() || YT_DLP_COOKIE_SETTINGS_DEFAULTS.runtimeTarget,
    supportedBrowsers,
    supportedKeyrings,
  }
}
