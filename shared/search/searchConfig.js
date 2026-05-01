export const SEARCH_RUNTIME_DEFAULT_SERVICE = 'youtube'
export const SEARCH_PROVIDER_KEYS = Object.freeze([
  'youtube',
  'youtubemusic',
  'spotify',
  'soundcloud',
])
export const SEARCH_PAGE_SIZE = 10
export const SEARCH_QUERY_MAX_LENGTH = 300
export const SEARCH_OFFSET_MAX = 500
export const SEARCH_RUNTIME_MAX_RESULTS = 120
export const SEARCH_RUNTIME_MAX_SELECTED_ENTRIES = 160

const SEARCH_PROVIDER_SET = new Set(SEARCH_PROVIDER_KEYS)

function sanitizeSearchProviderToken(value, maxLength = 40) {
  return String(value || '').trim().slice(0, maxLength).toLowerCase()
}

export function isKnownSearchProvider(value) {
  return SEARCH_PROVIDER_SET.has(sanitizeSearchProviderToken(value))
}

export function normalizeSearchProvider(
  value,
  fallback = SEARCH_RUNTIME_DEFAULT_SERVICE,
) {
  const normalized = sanitizeSearchProviderToken(value)
  if (SEARCH_PROVIDER_SET.has(normalized)) return normalized

  const normalizedFallback = sanitizeSearchProviderToken(fallback)
  if (SEARCH_PROVIDER_SET.has(normalizedFallback)) return normalizedFallback

  return SEARCH_RUNTIME_DEFAULT_SERVICE
}
