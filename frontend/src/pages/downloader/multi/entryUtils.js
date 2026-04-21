import { getServiceByKey } from '../../../utils/metadata'

export const DOWNLOAD_TYPE_ORDER = Object.freeze(['audio', 'video', 'thumbnail'])

export const ENTRY_META_STATE = Object.freeze({
  loading: 'loading',
  ready: 'ready',
  error: 'error',
  invalid: 'invalid',
})

export const ENTRY_DOWNLOAD_STATUS = Object.freeze({
  idle: 'idle',
  queued: 'queued',
  downloading: 'downloading',
  complete: 'complete',
  failed: 'failed',
})

export function normalizeDownloadType(value, fallback = 'audio') {
  const normalized = String(value || '').trim().toLowerCase()
  if (DOWNLOAD_TYPE_ORDER.includes(normalized)) return normalized
  return fallback
}

export function createMultiEntryId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `multi-${crypto.randomUUID()}`
  }
  return `multi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function normalizeDurationSeconds(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return Math.round(numeric)
}

export function formatDurationLabel(totalSeconds) {
  const normalized = normalizeDurationSeconds(totalSeconds)
  if (normalized == null) return null

  const hours = Math.floor(normalized / 3600)
  const minutes = Math.floor((normalized % 3600) / 60)
  const seconds = normalized % 60
  const pad2 = (value) => String(value).padStart(2, '0')

  if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(seconds)}`
  return `${pad2(minutes)}:${pad2(seconds)}`
}

function hasArrayValues(value) {
  return Array.isArray(value) && value.length > 0
}

export function resolveSupportedDownloadTypes(serviceKey, preloadedFormats) {
  const service = getServiceByKey(serviceKey)
  const disabled = new Set(Array.isArray(service?.disabledDownloadTypes) ? service.disabledDownloadTypes : [])

  const audioAvailable = hasArrayValues(preloadedFormats?.audioFormats)
  const videoAvailable = hasArrayValues(preloadedFormats?.videoFormats)
  const thumbnailAvailable = hasArrayValues(preloadedFormats?.thumbnails) || Boolean(preloadedFormats?.thumbnail)

  const supported = []

  if (!disabled.has('audio') && audioAvailable) supported.push('audio')
  if (!disabled.has('video') && videoAvailable) supported.push('video')
  if (!disabled.has('thumbnail') && thumbnailAvailable) supported.push('thumbnail')

  return supported
}

export function resolveEntryDownloadType(supportedTypes, preferredType = 'audio') {
  const normalizedPreferred = normalizeDownloadType(preferredType, 'audio')
  const allowed = Array.isArray(supportedTypes)
    ? supportedTypes.filter((type) => DOWNLOAD_TYPE_ORDER.includes(type))
    : []

  if (!allowed.length) return normalizedPreferred
  if (allowed.includes(normalizedPreferred)) return normalizedPreferred
  if (allowed.includes('audio')) return 'audio'
  return allowed[0]
}

export function groupEntriesByService(entries) {
  const grouped = new Map()

  for (const entry of entries || []) {
    const serviceKey = String(entry?.serviceKey || 'generic').trim() || 'generic'
    if (!grouped.has(serviceKey)) {
      grouped.set(serviceKey, {
        serviceKey,
        entries: [],
      })
    }

    grouped.get(serviceKey).entries.push(entry)
  }

  return Array.from(grouped.values())
}

export function countUnsupportedEntries(entries, downloadType) {
  const targetType = normalizeDownloadType(downloadType, 'audio')
  return (entries || []).reduce((count, entry) => {
    if (!entry || entry.metaState !== ENTRY_META_STATE.ready) return count
    return entry.supportedTypes.includes(targetType) ? count : count + 1
  }, 0)
}
