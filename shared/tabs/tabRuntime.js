import { normalizeServiceKey } from '../services/serviceCatalog.js'
import {
  normalizeSearchProvider,
  SEARCH_RUNTIME_DEFAULT_SERVICE,
  SEARCH_RUNTIME_MAX_RESULTS,
  SEARCH_RUNTIME_MAX_SELECTED_ENTRIES,
} from '../search/searchConfig.js'

export const TAB_STATE_MAX_PERSISTED_TABS = 30
export const DOWNLOADER_AUDIO_FORMAT_LIMIT = 240
export const DOWNLOADER_VIDEO_FORMAT_LIMIT = 240
export const DOWNLOADER_THUMBNAIL_LIMIT = 140
export const DOWNLOADER_SOURCE_PARAM = 'source'
export const LEGACY_DOWNLOADER_SOURCE_PARAM = 'url'
export const TAB_ALLOWED_PATHS = Object.freeze([
  '/',
  '/search',
  '/downloads',
  '/support',
])

const TAB_ALLOWED_PATH_SET = new Set(TAB_ALLOWED_PATHS)
const LEGACY_DOWNLOADER_PATH_SET = new Set([
  '/downloader',
  '/youtube-downloader',
  '/reddit-downloader',
  '/x-downloader',
  '/generic-downloader',
])

export function normalizeTabPath(path) {
  const normalized = String(path || '').trim()
  if (LEGACY_DOWNLOADER_PATH_SET.has(normalized)) return '/'
  return TAB_ALLOWED_PATH_SET.has(normalized) ? normalized : '/'
}

export function normalizeTabSearch(search) {
  const raw = String(search || '').trim()
  if (!raw) return ''

  const prefixed = raw.startsWith('?') ? raw : `?${raw}`
  const normalized = prefixed.slice(0, 1024)

  if (!normalized.includes(`${LEGACY_DOWNLOADER_SOURCE_PARAM}=`)) {
    return normalized
  }

  try {
    const params = new URLSearchParams(normalized)
    const sourceParam = String(params.get(DOWNLOADER_SOURCE_PARAM) || '').trim()
    const legacySourceParam = String(params.get(LEGACY_DOWNLOADER_SOURCE_PARAM) || '').trim()

    if (legacySourceParam && !sourceParam) {
      params.set(DOWNLOADER_SOURCE_PARAM, legacySourceParam)
    }

    params.delete(LEGACY_DOWNLOADER_SOURCE_PARAM)
    const serialized = params.toString()
    return serialized ? `?${serialized}` : ''
  } catch {
    return normalized
  }
}

export function normalizeTabTitle(value) {
  const raw = String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!raw) return ''
  return raw.slice(0, 180)
}

function sanitizeRuntimeText(value, maxLength = 200) {
  const raw = String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!raw) return ''
  return raw.slice(0, maxLength)
}

function sanitizeRuntimeNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return min
  return Math.min(max, Math.max(min, numeric))
}

function sanitizeRuntimeUrl(value, maxLength = 2048) {
  return sanitizeRuntimeText(value, maxLength)
}

function normalizeRuntimeServiceKey(value) {
  return normalizeServiceKey(value) || ''
}

function normalizeDownloaderAudioFormat(value) {
  if (!value || typeof value !== 'object') return null

  const formatId = sanitizeRuntimeText(value.formatId, 80)
  if (!formatId) return null

  return {
    formatId,
    ext: sanitizeRuntimeText(value.ext, 12),
    abr: sanitizeRuntimeNumber(value.abr, 0, 2000),
    acodec: sanitizeRuntimeText(value.acodec, 80),
    filesize: sanitizeRuntimeNumber(value.filesize, 0, 500 * 1024 * 1024 * 1024),
  }
}

function normalizeDownloaderVideoFormat(value) {
  if (!value || typeof value !== 'object') return null

  const formatId = sanitizeRuntimeText(value.formatId, 80)
  if (!formatId) return null

  return {
    formatId,
    ext: sanitizeRuntimeText(value.ext, 12),
    resolution: sanitizeRuntimeText(value.resolution, 40),
    width: sanitizeRuntimeNumber(value.width, 0, 20000),
    height: sanitizeRuntimeNumber(value.height, 0, 20000),
    vcodec: sanitizeRuntimeText(value.vcodec, 80),
    acodec: sanitizeRuntimeText(value.acodec, 80),
    filesize: sanitizeRuntimeNumber(value.filesize, 0, 500 * 1024 * 1024 * 1024),
    fps: sanitizeRuntimeNumber(value.fps, 0, 600),
    requiresMerge: Boolean(value.requiresMerge),
  }
}

function normalizeDownloaderThumbnail(value) {
  if (!value || typeof value !== 'object') return null

  const url = sanitizeRuntimeUrl(value.url)
  if (!url) return null

  return {
    url,
    id: sanitizeRuntimeText(value.id, 32),
    width: sanitizeRuntimeNumber(value.width, 0, 20000),
    height: sanitizeRuntimeNumber(value.height, 0, 20000),
    preference: sanitizeRuntimeNumber(value.preference, -9999, 9999),
  }
}

function normalizeDownloaderFormatsCache(value) {
  if (!value || typeof value !== 'object') return null

  const audioFormats = Array.isArray(value.audioFormats)
    ? value.audioFormats
      .map(normalizeDownloaderAudioFormat)
      .filter(Boolean)
      .slice(0, DOWNLOADER_AUDIO_FORMAT_LIMIT)
    : []

  const videoFormats = Array.isArray(value.videoFormats)
    ? value.videoFormats
      .map(normalizeDownloaderVideoFormat)
      .filter(Boolean)
      .slice(0, DOWNLOADER_VIDEO_FORMAT_LIMIT)
    : []

  const thumbnails = Array.isArray(value.thumbnails)
    ? value.thumbnails
      .map(normalizeDownloaderThumbnail)
      .filter(Boolean)
      .slice(0, DOWNLOADER_THUMBNAIL_LIMIT)
    : []

  return {
    title: sanitizeRuntimeText(value.title, 240),
    author: sanitizeRuntimeText(value.author, 180),
    extractor: sanitizeRuntimeText(value.extractor, 120),
    thumbnail: sanitizeRuntimeUrl(value.thumbnail),
    duration: sanitizeRuntimeNumber(value.duration, 0, 60 * 60 * 24 * 365),
    durationString: sanitizeRuntimeText(value.durationString, 32),
    audioFormats,
    videoFormats,
    thumbnails,
  }
}

function normalizeDownloaderMeta(value) {
  if (!value || typeof value !== 'object') return null

  const url = sanitizeRuntimeUrl(value.url)
  if (!url) return null

  return {
    service: normalizeRuntimeServiceKey(value.service),
    url,
    title: sanitizeRuntimeText(value.title, 240),
    author: sanitizeRuntimeText(value.author, 180),
    provider: sanitizeRuntimeText(value.provider, 120),
    thumbnail: sanitizeRuntimeUrl(value.thumbnail),
    duration: sanitizeRuntimeText(value.duration, 32),
    durationSeconds: sanitizeRuntimeNumber(value.durationSeconds, 0, 60 * 60 * 24 * 365),
    preloadedFormats: normalizeDownloaderFormatsCache(value.preloadedFormats),
  }
}

function normalizeDownloaderFetchError(value) {
  if (!value || typeof value !== 'object') return null

  const url = sanitizeRuntimeUrl(value.url)
  const message = sanitizeRuntimeText(value.message, 600)
  if (!url || !message) return null

  return { url, message }
}

function normalizeDownloaderRuntimeState(value) {
  const input = (value && typeof value === 'object') ? value : {}

  return {
    sourceUrl: sanitizeRuntimeUrl(input.sourceUrl),
    sourceServiceKey: normalizeRuntimeServiceKey(input.sourceServiceKey),
    inputValue: sanitizeRuntimeUrl(input.inputValue),
    meta: normalizeDownloaderMeta(input.meta),
    fetchError: normalizeDownloaderFetchError(input.fetchError),
  }
}

function normalizeSearchRuntimeResult(value) {
  if (!value || typeof value !== 'object') return null

  const url = sanitizeRuntimeUrl(value.url)
  if (!url) return null

  const title = sanitizeRuntimeText(value.title, 320)

  return {
    id: sanitizeRuntimeText(value.id, 120),
    url,
    title: title || url,
    uploader: sanitizeRuntimeText(value.uploader, 180),
    thumbnail: sanitizeRuntimeUrl(value.thumbnail),
    duration: sanitizeRuntimeNumber(value.duration, 0, 60 * 60 * 24 * 365),
    durationString: sanitizeRuntimeText(value.durationString, 32),
    service: normalizeRuntimeServiceKey(value.service),
  }
}

function normalizeSearchSelectedEntry(value) {
  if (!value || typeof value !== 'object') return null

  const identity = sanitizeRuntimeText(value.identity, 260)
  const url = sanitizeRuntimeUrl(value.url)
  if (!identity || !url) return null

  return {
    identity,
    url,
    service: normalizeRuntimeServiceKey(value.service),
    title: sanitizeRuntimeText(value.title, 240),
    thumbnail: sanitizeRuntimeUrl(value.thumbnail),
  }
}

export function normalizeSearchRuntimeState(value) {
  const input = (value && typeof value === 'object') ? value : {}

  const results = Array.isArray(input.results)
    ? input.results
      .map(normalizeSearchRuntimeResult)
      .filter(Boolean)
      .slice(0, SEARCH_RUNTIME_MAX_RESULTS)
    : []

  const selectedEntries = Array.isArray(input.selectedEntries)
    ? input.selectedEntries
      .map(normalizeSearchSelectedEntry)
      .filter(Boolean)
      .slice(0, SEARCH_RUNTIME_MAX_SELECTED_ENTRIES)
    : []

  return {
    query: sanitizeRuntimeText(input.query, 300),
    selectedService: normalizeSearchProvider(
      input.selectedService,
      SEARCH_RUNTIME_DEFAULT_SERVICE,
    ),
    results,
    errorMessage: sanitizeRuntimeText(input.errorMessage, 600),
    lastQuery: sanitizeRuntimeText(input.lastQuery, 300),
    lastService: normalizeSearchProvider(
      input.lastService,
      SEARCH_RUNTIME_DEFAULT_SERVICE,
    ),
    nextOffset: sanitizeRuntimeNumber(input.nextOffset, 0, 5000),
    hasMore: Boolean(input.hasMore),
    selectedEntries,
  }
}

export function normalizeTabRuntimeState(value) {
  const input = (value && typeof value === 'object') ? value : {}

  return {
    downloader: normalizeDownloaderRuntimeState(input.downloader),
    search: normalizeSearchRuntimeState(input.search),
  }
}

export function createFallbackPersistedTab() {
  return {
    id: 'tab-home',
    path: '/',
    search: '',
    pageTitle: '',
    runtime: normalizeTabRuntimeState(null),
  }
}

export function normalizePersistedTabState(value) {
  const inputTabs = Array.isArray(value?.tabs) ? value.tabs : []
  const normalizedTabs = []
  const seenIds = new Set()

  for (
    let index = 0;
    index < inputTabs.length && normalizedTabs.length < TAB_STATE_MAX_PERSISTED_TABS;
    index += 1
  ) {
    const tab = inputTabs[index] || {}
    const rawId = String(tab.id || '').trim().slice(0, 80)
    const id = rawId || `tab-${index + 1}`
    if (seenIds.has(id)) continue

    seenIds.add(id)
    normalizedTabs.push({
      id,
      path: normalizeTabPath(tab.path),
      search: normalizeTabSearch(tab.search),
      pageTitle: normalizeTabTitle(tab.pageTitle),
      runtime: normalizeTabRuntimeState(tab.runtime),
    })
  }

  if (!normalizedTabs.length) {
    normalizedTabs.push(createFallbackPersistedTab())
  }

  const requestedActiveId = String(value?.activeTabId || '').trim()
  const activeTabId = normalizedTabs.some((tab) => tab.id === requestedActiveId)
    ? requestedActiveId
    : normalizedTabs[0].id

  return { tabs: normalizedTabs, activeTabId }
}
