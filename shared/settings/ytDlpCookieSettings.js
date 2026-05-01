export const YT_DLP_COOKIE_SUPPORTED_BROWSERS = Object.freeze([
  'brave',
  'chrome',
  'chromium',
  'edge',
  'firefox',
  'opera',
  'safari',
  'vivaldi',
  'whale',
])
export const YT_DLP_COOKIE_CHROMIUM_BROWSERS = new Set([
  'brave',
  'chrome',
  'chromium',
  'edge',
  'opera',
  'vivaldi',
  'whale',
])
export const YT_DLP_COOKIE_SUPPORTED_KEYRINGS = Object.freeze([
  'basictext',
  'gnomekeyring',
  'kwallet',
  'kwallet5',
  'kwallet6',
])
export const YT_DLP_COOKIE_SPEC_REGEX =
  /^(?<name>[^+:]+)(?:\s*\+\s*(?<keyring>[^:]+))?(?:\s*:\s*(?!:)(?<profile>.+?))?(?:\s*::\s*(?<container>.+))?$/

const YT_DLP_COOKIE_SUPPORTED_BROWSER_SET = new Set(YT_DLP_COOKIE_SUPPORTED_BROWSERS)
const YT_DLP_COOKIE_SUPPORTED_KEYRING_SET = new Set(YT_DLP_COOKIE_SUPPORTED_KEYRINGS)

export function normalizeCookieSettingText(value, maxLength = 2048) {
  const raw = String(value || '')
    .replace(/\u0000/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
  if (!raw) return ''
  return raw.slice(0, maxLength)
}

function normalizeStringList(values, maxLength = 64) {
  if (!Array.isArray(values)) return []

  const seen = new Set()
  const normalized = []

  for (const value of values) {
    const item = normalizeCookieSettingText(value, maxLength).toLowerCase()
    if (!item || seen.has(item)) continue
    seen.add(item)
    normalized.push(item)
  }

  return normalized
}

export function normalizeCookieBrowser(
  value,
  supportedBrowsers = YT_DLP_COOKIE_SUPPORTED_BROWSERS,
) {
  const supportedBrowserSet = new Set(normalizeStringList(supportedBrowsers))
  const normalized = normalizeCookieSettingText(value, 64).toLowerCase()
  if (supportedBrowserSet.size === 0) {
    return YT_DLP_COOKIE_SUPPORTED_BROWSER_SET.has(normalized) ? normalized : ''
  }
  return supportedBrowserSet.has(normalized) ? normalized : ''
}

export function normalizeCookieKeyring(
  value,
  supportedKeyrings = YT_DLP_COOKIE_SUPPORTED_KEYRINGS,
) {
  const supportedKeyringSet = new Set(normalizeStringList(supportedKeyrings))
  const normalized = normalizeCookieSettingText(value, 64).toLowerCase()
  if (supportedKeyringSet.size === 0) {
    return YT_DLP_COOKIE_SUPPORTED_KEYRING_SET.has(normalized) ? normalized : ''
  }
  return supportedKeyringSet.has(normalized) ? normalized : ''
}

export function parseCookiesFromBrowserSpec(
  rawSpec,
  {
    supportedBrowsers = YT_DLP_COOKIE_SUPPORTED_BROWSERS,
    supportedKeyrings = YT_DLP_COOKIE_SUPPORTED_KEYRINGS,
  } = {},
) {
  const spec = normalizeCookieSettingText(rawSpec, 4096)
  if (!spec) {
    return {
      valid: true,
      browserName: '',
      browserKeyring: '',
      browserProfile: '',
      browserContainer: '',
    }
  }

  const match = spec.match(YT_DLP_COOKIE_SPEC_REGEX)
  if (!match || !match.groups) {
    return {
      valid: false,
      browserName: '',
      browserKeyring: '',
      browserProfile: '',
      browserContainer: '',
    }
  }

  const browserName = normalizeCookieBrowser(match.groups.name, supportedBrowsers)
  const browserKeyringRaw = normalizeCookieSettingText(match.groups.keyring || '', 128)
  const browserKeyring = normalizeCookieKeyring(browserKeyringRaw, supportedKeyrings)
  const browserProfile = normalizeCookieSettingText(match.groups.profile || '', 1024)
  const browserContainer = normalizeCookieSettingText(match.groups.container || '', 256)

  if (!browserName) {
    return {
      valid: false,
      browserName: '',
      browserKeyring: '',
      browserProfile: '',
      browserContainer: '',
    }
  }

  if (browserKeyringRaw && !browserKeyring) {
    return {
      valid: false,
      browserName: '',
      browserKeyring: '',
      browserProfile: '',
      browserContainer: '',
    }
  }

  return {
    valid: true,
    browserName,
    browserKeyring,
    browserProfile,
    browserContainer,
  }
}

export function getSupportedCookieBrowsersForPlatform(platform = '') {
  if (String(platform || '').trim().toLowerCase() === 'darwin') {
    return [...YT_DLP_COOKIE_SUPPORTED_BROWSERS]
  }
  return YT_DLP_COOKIE_SUPPORTED_BROWSERS.filter((browser) => browser !== 'safari')
}

export function getYtDlpCookieCapabilities({
  browserImportSupported = false,
  runtimeTarget = 'server',
  supportedBrowsers = [],
  supportedKeyrings = [],
} = {}) {
  return {
    browserImportSupported: Boolean(browserImportSupported),
    runtimeTarget: normalizeCookieSettingText(runtimeTarget, 32).toLowerCase() || 'server',
    supportedBrowsers: normalizeStringList(supportedBrowsers),
    supportedKeyrings: normalizeStringList(supportedKeyrings),
  }
}

export function createYtDlpCookieSettingsDefaults({
  browserImportSupported = false,
  runtimeTarget = 'server',
  supportedBrowsers = [],
  supportedKeyrings = [],
  cookiesFilePath = '',
  cookiesFromBrowserSpec = '',
} = {}) {
  const parsed = parseCookiesFromBrowserSpec(cookiesFromBrowserSpec, {
    supportedBrowsers,
    supportedKeyrings,
  })
  const browserEnabled = parsed.valid && Boolean(parsed.browserName)

  return normalizeYtDlpCookieSettings(
    {
      cookiesFileEnabled: Boolean(normalizeCookieSettingText(cookiesFilePath, 4096)),
      cookiesFilePath: normalizeCookieSettingText(cookiesFilePath, 4096),
      cookiesFromBrowserEnabled: browserEnabled,
      browserName: browserEnabled ? parsed.browserName : '',
      browserKeyring: browserEnabled ? parsed.browserKeyring : '',
      browserProfile: browserEnabled ? parsed.browserProfile : '',
      browserContainer: browserEnabled ? parsed.browserContainer : '',
    },
    {
      browserImportSupported,
      runtimeTarget,
      supportedBrowsers,
      supportedKeyrings,
    },
  )
}

export function normalizeYtDlpCookieSettings(
  value,
  {
    browserImportSupported,
    runtimeTarget,
    supportedBrowsers,
    supportedKeyrings,
  } = {},
) {
  const input = (value && typeof value === 'object') ? value : {}
  const effectiveSupportedBrowsers = normalizeStringList(
    supportedBrowsers !== undefined ? supportedBrowsers : input.supportedBrowsers,
  )
  const effectiveSupportedKeyrings = normalizeStringList(
    supportedKeyrings !== undefined ? supportedKeyrings : input.supportedKeyrings,
  )
  const effectiveBrowserImportSupported = browserImportSupported !== undefined
    ? Boolean(browserImportSupported)
    : Boolean(input.browserImportSupported)
  const effectiveRuntimeTarget = runtimeTarget !== undefined
    ? normalizeCookieSettingText(runtimeTarget, 32).toLowerCase()
    : normalizeCookieSettingText(input.runtimeTarget, 32).toLowerCase()

  let browserName = normalizeCookieBrowser(
    input.browserName,
    effectiveSupportedBrowsers.length
      ? effectiveSupportedBrowsers
      : YT_DLP_COOKIE_SUPPORTED_BROWSERS,
  )
  let browserKeyring = normalizeCookieKeyring(
    input.browserKeyring,
    effectiveSupportedKeyrings.length
      ? effectiveSupportedKeyrings
      : YT_DLP_COOKIE_SUPPORTED_KEYRINGS,
  )
  let browserProfile = normalizeCookieSettingText(input.browserProfile, 1024)
  let browserContainer = normalizeCookieSettingText(input.browserContainer, 256)

  const browserSupported = effectiveSupportedBrowsers.length === 0
    ? Boolean(browserName)
    : effectiveSupportedBrowsers.includes(browserName)

  if (!browserSupported) {
    browserName = ''
    browserKeyring = ''
    browserProfile = ''
    browserContainer = ''
  }

  if (!YT_DLP_COOKIE_CHROMIUM_BROWSERS.has(browserName)) {
    browserKeyring = ''
  }

  if (browserName !== 'firefox') {
    browserContainer = ''
  }

  const cookiesFromBrowserEnabled = Boolean(
    effectiveBrowserImportSupported
    && input.cookiesFromBrowserEnabled
    && browserName,
  )
  const cookiesFileEnabled = Boolean(
    (input.cookiesFileEnabled !== undefined ? input.cookiesFileEnabled : false)
    && !cookiesFromBrowserEnabled
  )

  return {
    cookiesFileEnabled,
    cookiesFilePath: normalizeCookieSettingText(input.cookiesFilePath, 4096),
    cookiesFromBrowserEnabled,
    browserName,
    browserKeyring,
    browserProfile,
    browserContainer,
    ...getYtDlpCookieCapabilities({
      browserImportSupported: effectiveBrowserImportSupported,
      runtimeTarget: effectiveRuntimeTarget || 'server',
      supportedBrowsers: effectiveSupportedBrowsers,
      supportedKeyrings: effectiveSupportedKeyrings,
    }),
  }
}

export function composeCookiesFromBrowserSpec(
  settings,
  {
    supportedBrowsers = YT_DLP_COOKIE_SUPPORTED_BROWSERS,
    supportedKeyrings = YT_DLP_COOKIE_SUPPORTED_KEYRINGS,
  } = {},
) {
  const browserName = normalizeCookieBrowser(settings?.browserName, supportedBrowsers)
  if (!browserName) return ''

  let spec = browserName

  const keyring = normalizeCookieKeyring(settings?.browserKeyring, supportedKeyrings)
  if (keyring && YT_DLP_COOKIE_CHROMIUM_BROWSERS.has(browserName)) {
    spec += `+${keyring}`
  }

  const profile = normalizeCookieSettingText(settings?.browserProfile, 1024)
  if (profile) {
    spec += `:${profile}`
  }

  const container = normalizeCookieSettingText(settings?.browserContainer, 256)
  if (browserName === 'firefox' && container) {
    spec += `::${container}`
  }

  return spec
}

export function toPersistedYtDlpCookieSettings(
  settings,
  {
    supportedBrowsers = YT_DLP_COOKIE_SUPPORTED_BROWSERS,
    supportedKeyrings = YT_DLP_COOKIE_SUPPORTED_KEYRINGS,
  } = {},
) {
  return {
    cookiesFileEnabled: Boolean(settings?.cookiesFileEnabled),
    cookiesFilePath: normalizeCookieSettingText(settings?.cookiesFilePath, 4096),
    cookiesFromBrowserEnabled: Boolean(settings?.cookiesFromBrowserEnabled),
    browserName: normalizeCookieBrowser(settings?.browserName, supportedBrowsers),
    browserKeyring: normalizeCookieKeyring(settings?.browserKeyring, supportedKeyrings),
    browserProfile: normalizeCookieSettingText(settings?.browserProfile, 1024),
    browserContainer: normalizeCookieSettingText(settings?.browserContainer, 256),
  }
}

export function validateYtDlpCookieSettings(
  settings,
  {
    browserImportSupported = false,
    runtimeTarget = 'server',
    supportedBrowsers = [],
    supportedKeyrings = [],
  } = {},
) {
  const normalized = normalizeYtDlpCookieSettings(settings, {
    browserImportSupported,
    runtimeTarget,
    supportedBrowsers,
    supportedKeyrings,
  })

  if (
    normalized.cookiesFileEnabled
    && !normalizeCookieSettingText(normalized.cookiesFilePath, 4096)
  ) {
    return 'Cookie file path is required when cookie file import is enabled'
  }

  if (normalized.cookiesFromBrowserEnabled) {
    if (!browserImportSupported) {
      return 'Browser cookie import is not supported in this runtime mode'
    }
    if (!normalized.browserName) {
      return 'Browser selection is required when browser cookie import is enabled'
    }
  }

  return ''
}
