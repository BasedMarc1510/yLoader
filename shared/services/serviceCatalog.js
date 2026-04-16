import {
  GENERIC_SERVICE_KEY,
  SERVICE_DEFINITIONS,
} from './serviceDefinitions.js'

const HTTP_PROTOCOLS = new Set(['http:', 'https:'])

const SERVICE_BY_KEY = new Map(SERVICE_DEFINITIONS.map((service) => [service.key, service]))
const NON_GENERIC_SERVICE_DEFINITIONS = Object.freeze(
  SERVICE_DEFINITIONS.filter((service) => service.key !== GENERIC_SERVICE_KEY)
)

const SERVICE_KEYS = Object.freeze(SERVICE_DEFINITIONS.map((service) => service.key))

const SERVICE_ALIASES = Object.freeze({
  other: GENERIC_SERVICE_KEY,
  twitter: 'x',
  'x-twitter': 'x',
  xtwitter: 'x',
})

const SERVICE_MATCHERS = new Map(
  NON_GENERIC_SERVICE_DEFINITIONS.map((service) => [
    service.key,
    {
      hostMatchers: service.hostRegexes.map((pattern) => new RegExp(pattern, 'i')),
      pathMatchers: service.pathRegexes.map((pattern) => new RegExp(pattern, 'i')),
    },
  ])
)

function toParsedHttpUrl(rawUrl) {
  const input = String(rawUrl || '').trim()
  if (!input) return null

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`

  try {
    const parsed = new URL(candidate)
    if (!HTTP_PROTOCOLS.has(String(parsed.protocol || '').toLowerCase())) return null
    return parsed
  } catch {
    return null
  }
}

function matchesServiceByParsedUrl(serviceKey, parsedUrl) {
  const matcher = SERVICE_MATCHERS.get(serviceKey)
  if (!matcher || !parsedUrl) return false

  const hostname = String(parsedUrl.hostname || '').toLowerCase()
  if (!hostname) return false

  const hostMatched = matcher.hostMatchers.some((hostMatcher) => hostMatcher.test(hostname))
  if (!hostMatched) return false

  if (!matcher.pathMatchers.length) return true

  const pathname = String(parsedUrl.pathname || '/')
  return matcher.pathMatchers.some((pathMatcher) => pathMatcher.test(pathname))
}

export function normalizeServiceKey(rawKey) {
  const input = String(rawKey || '').trim().toLowerCase()
  if (!input) return null

  const normalized = SERVICE_ALIASES[input] || input
  return SERVICE_BY_KEY.has(normalized) ? normalized : null
}

export function isKnownServiceKey(rawKey) {
  return Boolean(normalizeServiceKey(rawKey))
}

export function getServiceByKey(rawKey) {
  const normalized = normalizeServiceKey(rawKey)
  if (normalized && SERVICE_BY_KEY.has(normalized)) {
    return SERVICE_BY_KEY.get(normalized)
  }

  return SERVICE_BY_KEY.get(GENERIC_SERVICE_KEY)
}

export function getServiceDisplayName(rawKey) {
  return getServiceByKey(rawKey).name
}

export function getServiceThemeColor(rawKey) {
  return getServiceByKey(rawKey).themeColor
}

export function getServiceAccentColor(rawKey) {
  return getServiceByKey(rawKey).accentColor || ''
}

export function getServiceIconExportName(rawKey) {
  return getServiceByKey(rawKey).iconExport || ''
}

export function detectServiceByUrl(rawUrl) {
  const parsed = toParsedHttpUrl(rawUrl)
  if (!parsed) return null

  for (const service of NON_GENERIC_SERVICE_DEFINITIONS) {
    if (matchesServiceByParsedUrl(service.key, parsed)) return service.key
  }

  return GENERIC_SERVICE_KEY
}

export function isLikelyValidUrlForService(rawKey, rawUrl) {
  const parsed = toParsedHttpUrl(rawUrl)
  if (!parsed) return false

  const normalizedKey = normalizeServiceKey(rawKey)
  if (!normalizedKey) return false

  if (normalizedKey === GENERIC_SERVICE_KEY) return true
  return matchesServiceByParsedUrl(normalizedKey, parsed)
}

export function resolveServiceKey(rawKey, rawUrl) {
  return normalizeServiceKey(rawKey) || detectServiceByUrl(rawUrl) || GENERIC_SERVICE_KEY
}

export {
  GENERIC_SERVICE_KEY,
  NON_GENERIC_SERVICE_DEFINITIONS,
  SERVICE_DEFINITIONS,
  SERVICE_KEYS,
}
