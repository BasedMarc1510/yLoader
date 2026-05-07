import {
  GENERIC_SERVICE_KEY,
  detectService,
  normalizeServiceKey,
  youtubeThumb,
} from '../../utils/metadata'
import { getLocaleForLanguage } from '../../i18n/config'

export const DOWNLOADS_UI_STORAGE_KEY = 'yloader.downloads.ui.v2'
export const GRID_PAGE_SIZE = 18
export const LIST_PAGE_SIZE = 20
export const GRID_SKELETON_COUNT = 12
export const LIST_SKELETON_COUNT = 8
export const TYPE_FILTER_VALUES = new Set(['all', 'video', 'audio', 'thumbnail'])
export const VIEW_MODE_VALUES = new Set(['grid', 'list'])

export function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim())
}

export function normalizeViewMode(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return VIEW_MODE_VALUES.has(normalized) ? normalized : 'list'
}

export function normalizeTypeFilter(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return TYPE_FILTER_VALUES.has(normalized) ? normalized : 'all'
}

export function readDownloadsUiPreferences() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { viewMode: 'list', typeFilter: 'all' }
  }

  try {
    const raw = window.localStorage.getItem(DOWNLOADS_UI_STORAGE_KEY)
    if (!raw) return { viewMode: 'list', typeFilter: 'all' }

    const parsed = JSON.parse(raw)
    return {
      viewMode: normalizeViewMode(parsed?.viewMode),
      typeFilter: normalizeTypeFilter(parsed?.typeFilter),
    }
  } catch {
    return { viewMode: 'list', typeFilter: 'all' }
  }
}

export function persistDownloadsUiPreferences(preferences) {
  if (typeof window === 'undefined' || !window.localStorage) return

  try {
    window.localStorage.setItem(
      DOWNLOADS_UI_STORAGE_KEY,
      JSON.stringify({
        viewMode: normalizeViewMode(preferences?.viewMode),
        typeFilter: normalizeTypeFilter(preferences?.typeFilter),
      })
    )
  } catch {
    // Ignore local persistence errors.
  }
}

export function getVideoSourceUrl(item) {
  const raw = typeof item?.source_url === 'string' ? item.source_url.trim() : ''
  if (isHttpUrl(raw)) return raw

  const normalizedService = normalizeServiceKey(item?.service)
  if (normalizedService === 'youtube' && item?.video_id) {
    return `https://www.youtube.com/watch?v=${item.video_id}`
  }

  return null
}

export function toKnownServiceKey(rawService, fallbackUrl = '') {
  return normalizeServiceKey(rawService) || detectService(fallbackUrl) || GENERIC_SERVICE_KEY
}

export function resolveThumbnailUrl(item) {
  const direct = String(item?.thumbnail_url || '').trim()
  if (isHttpUrl(direct)) return direct

  const service = normalizeServiceKey(item?.service)
  if (service === 'youtube' && item?.video_id) {
    return youtubeThumb(item.video_id, 'mqdefault')
  }

  return ''
}

export function formatDurationLabel(sec) {
  const numeric = Number(sec)
  if (!Number.isFinite(numeric) || numeric <= 0) return ''

  const totalSeconds = Math.round(numeric)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)

  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export function formatEntryDate(timestamp, language) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return String(timestamp || '')

  const localeTag = getLocaleForLanguage(language)
  return date.toLocaleDateString(localeTag)
}

export function formatTimestampTooltip(timestamp, language) {
  if (!timestamp) return ''

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return String(timestamp)

  const localeTag = getLocaleForLanguage(language)
  const human = date.toLocaleString(localeTag, { dateStyle: 'full', timeStyle: 'medium' })
  return `${human}\n${date.toISOString()}`
}
