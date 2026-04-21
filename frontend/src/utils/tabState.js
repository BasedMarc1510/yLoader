import { normalizeTabPath, normalizeTabSearch } from './tabRoutes'

export const TAB_STATE_LOCAL_STORAGE_KEY = 'yloader.ui.tabs.state.v1'
const SEARCH_RESULTS_LIMIT = 120
const SEARCH_SELECTED_ENTRIES_LIMIT = 160
const DOWNLOADER_AUDIO_FORMAT_LIMIT = 240
const DOWNLOADER_VIDEO_FORMAT_LIMIT = 240
const DOWNLOADER_THUMBNAIL_LIMIT = 140
const SEARCH_PROVIDER_VALUES = new Set(['youtube', 'youtubemusic', 'spotify', 'soundcloud'])

function sanitizeText(value, maxLength = 200) {
  return String(value || '').trim().slice(0, maxLength)
}

function sanitizeClampedNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return min
  return Math.min(max, Math.max(min, numeric))
}

function sanitizeOptionalUrl(value, maxLength = 2048) {
  return sanitizeText(value, maxLength)
}

function sanitizeOptionalString(value, maxLength = 120) {
  return sanitizeText(value, maxLength)
}

function normalizeSearchProvider(value, fallback = 'youtube') {
  const normalized = sanitizeOptionalString(value, 40).toLowerCase()
  if (SEARCH_PROVIDER_VALUES.has(normalized)) return normalized
  return fallback
}

function sanitizeDownloaderAudioFormat(value) {
  const formatId = sanitizeOptionalString(value?.formatId, 80)
  if (!formatId) return null

  return {
    formatId,
    ext: sanitizeOptionalString(value?.ext, 12),
    abr: sanitizeClampedNumber(value?.abr, 0, 2000),
    acodec: sanitizeOptionalString(value?.acodec, 80),
    filesize: sanitizeClampedNumber(value?.filesize, 0, 500 * 1024 * 1024 * 1024),
  }
}

function sanitizeDownloaderVideoFormat(value) {
  const formatId = sanitizeOptionalString(value?.formatId, 80)
  if (!formatId) return null

  return {
    formatId,
    ext: sanitizeOptionalString(value?.ext, 12),
    resolution: sanitizeOptionalString(value?.resolution, 40),
    width: sanitizeClampedNumber(value?.width, 0, 20000),
    height: sanitizeClampedNumber(value?.height, 0, 20000),
    vcodec: sanitizeOptionalString(value?.vcodec, 80),
    acodec: sanitizeOptionalString(value?.acodec, 80),
    filesize: sanitizeClampedNumber(value?.filesize, 0, 500 * 1024 * 1024 * 1024),
    fps: sanitizeClampedNumber(value?.fps, 0, 600),
    requiresMerge: Boolean(value?.requiresMerge),
  }
}

function sanitizeDownloaderThumbnail(value) {
  const url = sanitizeOptionalUrl(value?.url)
  if (!url) return null

  return {
    url,
    id: sanitizeOptionalString(value?.id, 32),
    width: sanitizeClampedNumber(value?.width, 0, 20000),
    height: sanitizeClampedNumber(value?.height, 0, 20000),
    preference: sanitizeClampedNumber(value?.preference, -9999, 9999),
  }
}

function normalizeDownloaderFormatsCache(value) {
  if (!value || typeof value !== 'object') return null

  const audioFormats = Array.isArray(value.audioFormats)
    ? value.audioFormats
      .map(sanitizeDownloaderAudioFormat)
      .filter(Boolean)
      .slice(0, DOWNLOADER_AUDIO_FORMAT_LIMIT)
    : []

  const videoFormats = Array.isArray(value.videoFormats)
    ? value.videoFormats
      .map(sanitizeDownloaderVideoFormat)
      .filter(Boolean)
      .slice(0, DOWNLOADER_VIDEO_FORMAT_LIMIT)
    : []

  const thumbnails = Array.isArray(value.thumbnails)
    ? value.thumbnails
      .map(sanitizeDownloaderThumbnail)
      .filter(Boolean)
      .slice(0, DOWNLOADER_THUMBNAIL_LIMIT)
    : []

  return {
    title: sanitizeOptionalString(value.title, 240),
    author: sanitizeOptionalString(value.author, 180),
    extractor: sanitizeOptionalString(value.extractor, 120),
    thumbnail: sanitizeOptionalUrl(value.thumbnail),
    duration: sanitizeClampedNumber(value.duration, 0, 60 * 60 * 24 * 365),
    durationString: sanitizeOptionalString(value.durationString, 32),
    audioFormats,
    videoFormats,
    thumbnails,
  }
}

function normalizeDownloaderMetaCache(value) {
  if (!value || typeof value !== 'object') return null

  const url = sanitizeOptionalUrl(value.url)
  if (!url) return null

  return {
    service: sanitizeOptionalString(value.service, 80),
    url,
    title: sanitizeOptionalString(value.title, 240),
    author: sanitizeOptionalString(value.author, 180),
    provider: sanitizeOptionalString(value.provider, 120),
    thumbnail: sanitizeOptionalUrl(value.thumbnail),
    duration: sanitizeOptionalString(value.duration, 32),
    durationSeconds: sanitizeClampedNumber(value.durationSeconds, 0, 60 * 60 * 24 * 365),
    preloadedFormats: normalizeDownloaderFormatsCache(value.preloadedFormats),
  }
}

function normalizeDownloaderFetchError(value) {
  if (!value || typeof value !== 'object') return null

  const url = sanitizeOptionalUrl(value.url)
  const message = sanitizeOptionalString(value.message, 600)

  if (!url || !message) return null
  return { url, message }
}

function createDefaultDownloaderRuntimeState() {
  return {
    sourceUrl: '',
    sourceServiceKey: '',
    inputValue: '',
    meta: null,
    fetchError: null,
  }
}

function normalizeDownloaderRuntimeState(value) {
  const base = createDefaultDownloaderRuntimeState()
  if (!value || typeof value !== 'object') return base

  return {
    sourceUrl: sanitizeOptionalUrl(value.sourceUrl),
    sourceServiceKey: sanitizeOptionalString(value.sourceServiceKey, 80).toLowerCase(),
    inputValue: sanitizeOptionalUrl(value.inputValue),
    meta: normalizeDownloaderMetaCache(value.meta),
    fetchError: normalizeDownloaderFetchError(value.fetchError),
  }
}

function sanitizeSearchResultEntry(value) {
  const url = sanitizeOptionalUrl(value?.url)
  if (!url) return null

  const id = sanitizeOptionalString(value?.id, 120)
  const title = sanitizeOptionalString(value?.title, 320)
  const fallbackTitle = title || url

  return {
    id,
    url,
    title: fallbackTitle,
    uploader: sanitizeOptionalString(value?.uploader, 180),
    thumbnail: sanitizeOptionalUrl(value?.thumbnail),
    duration: sanitizeClampedNumber(value?.duration, 0, 60 * 60 * 24 * 365),
    durationString: sanitizeOptionalString(value?.durationString, 32),
    service: sanitizeOptionalString(value?.service, 80).toLowerCase(),
  }
}

function sanitizeSearchSelectedEntry(value) {
  const identity = sanitizeOptionalString(value?.identity, 260)
  const url = sanitizeOptionalUrl(value?.url)
  if (!identity || !url) return null

  return {
    identity,
    url,
    service: sanitizeOptionalString(value?.service, 80).toLowerCase(),
    title: sanitizeOptionalString(value?.title, 240),
    thumbnail: sanitizeOptionalUrl(value?.thumbnail),
  }
}

function createDefaultSearchRuntimeState() {
  return {
    query: '',
    selectedService: 'youtube',
    results: [],
    errorMessage: '',
    lastQuery: '',
    lastService: 'youtube',
    nextOffset: 0,
    hasMore: false,
    selectedEntries: [],
  }
}

function normalizeSearchRuntimeState(value) {
  const base = createDefaultSearchRuntimeState()
  if (!value || typeof value !== 'object') return base

  const results = Array.isArray(value.results)
    ? value.results
      .map(sanitizeSearchResultEntry)
      .filter(Boolean)
      .slice(0, SEARCH_RESULTS_LIMIT)
    : []

  const selectedEntries = Array.isArray(value.selectedEntries)
    ? value.selectedEntries
      .map(sanitizeSearchSelectedEntry)
      .filter(Boolean)
      .slice(0, SEARCH_SELECTED_ENTRIES_LIMIT)
    : []

  return {
    query: sanitizeOptionalString(value.query, 300),
    selectedService: normalizeSearchProvider(value.selectedService, base.selectedService),
    results,
    errorMessage: sanitizeOptionalString(value.errorMessage, 600),
    lastQuery: sanitizeOptionalString(value.lastQuery, 300),
    lastService: normalizeSearchProvider(value.lastService, base.lastService),
    nextOffset: sanitizeClampedNumber(value.nextOffset, 0, 5000),
    hasMore: Boolean(value.hasMore),
    selectedEntries,
  }
}

export function normalizeTabRuntimeState(value) {
  return {
    downloader: normalizeDownloaderRuntimeState(value?.downloader),
    search: normalizeSearchRuntimeState(value?.search),
  }
}

export function createTabId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tab-${crypto.randomUUID()}`
  }
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function createDefaultTab(tabId = createTabId()) {
  return {
    id: tabId,
    path: '/',
    search: '',
    navToken: 0,
    pageTitle: '',
    loading: false,
    download: {
      active: false,
      progress: 0,
      title: '',
      stage: '',
    },
    runtime: normalizeTabRuntimeState(null),
  }
}

export function getTabDomId(tabId) {
  return `yl-tab-${tabId}`
}

export function getPanelDomId(tabId) {
  return `yl-tabpanel-${tabId}`
}

export function readCurrentTabLocation() {
  if (typeof window === 'undefined') {
    return {
      path: '/',
      search: '',
    }
  }

  const protocol = String(window.location.protocol || '').toLowerCase()

  if (protocol === 'file:') {
    const rawHash = String(window.location.hash || '').trim()
    const hashValue = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash

    if (hashValue.startsWith('/')) {
      const queryIndex = hashValue.indexOf('?')
      const hashPath = queryIndex >= 0 ? hashValue.slice(0, queryIndex) : hashValue
      const hashSearch = queryIndex >= 0 ? hashValue.slice(queryIndex) : ''
      return {
        path: normalizeTabPath(hashPath),
        search: normalizeTabSearch(hashSearch),
      }
    }

    return {
      path: '/',
      search: '',
    }
  }

  return {
    path: normalizeTabPath(window.location.pathname),
    search: normalizeTabSearch(window.location.search),
  }
}

export function createTabFromCurrentLocation(tabId = 'tab-home') {
  const base = createDefaultTab(tabId)
  if (typeof window === 'undefined') return base

  const current = readCurrentTabLocation()
  base.path = current.path
  base.search = current.search
  return base
}

export function normalizeDownloadState(value) {
  const progressRaw = Number(value?.progress)
  const progress = Number.isFinite(progressRaw)
    ? Math.max(0, Math.min(100, Math.round(progressRaw)))
    : 0

  return {
    active: Boolean(value?.active),
    progress,
    title: String(value?.title || '').trim().slice(0, 180),
    stage: String(value?.stage || '').trim().slice(0, 60),
  }
}

function normalizeClientTab(rawTab, index) {
  const rawId = String(rawTab?.id || '').trim()
  const id = rawId ? rawId.slice(0, 80) : `tab-${index + 1}`
  return {
    id,
    path: normalizeTabPath(rawTab?.path),
    search: normalizeTabSearch(rawTab?.search),
    navToken: 0,
    pageTitle: String(rawTab?.pageTitle || '').trim().slice(0, 180),
    loading: false,
    download: normalizeDownloadState(rawTab?.download),
    runtime: normalizeTabRuntimeState(rawTab?.runtime),
  }
}

export function normalizeClientTabState(rawState) {
  const inputTabs = Array.isArray(rawState?.tabs) ? rawState.tabs : []
  const seen = new Set()
  const tabs = []

  for (let i = 0; i < inputTabs.length; i += 1) {
    const normalized = normalizeClientTab(inputTabs[i], i)
    if (seen.has(normalized.id)) continue
    seen.add(normalized.id)
    tabs.push(normalized)
    if (tabs.length >= 30) break
  }

  if (!tabs.length) {
    tabs.push(createDefaultTab('tab-home'))
  }

  const requestedActive = String(rawState?.activeTabId || '').trim()
  const activeTabId = tabs.some((tab) => tab.id === requestedActive)
    ? requestedActive
    : tabs[0].id

  return { tabs, activeTabId }
}

export function serializeTabState(tabs, activeTabId) {
  return {
    tabs: tabs.map((tab) => ({
      id: tab.id,
      path: normalizeTabPath(tab.path),
      search: normalizeTabSearch(tab.search),
      pageTitle: String(tab.pageTitle || '').trim().slice(0, 180),
      runtime: normalizeTabRuntimeState(tab.runtime),
    })),
    activeTabId,
  }
}

export function readLocalTabState() {
  if (typeof window === 'undefined') return null

  try {
    const raw = localStorage.getItem(TAB_STATE_LOCAL_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    return normalizeClientTabState(parsed)
  } catch {
    return null
  }
}

export function hasUrlInSearch(search) {
  const normalizedSearch = normalizeTabSearch(search)
  if (!normalizedSearch) return false

  const params = new URLSearchParams(normalizedSearch)
  return Boolean(String(params.get('source') || params.get('url') || '').trim())
}

export function hasMultiDownloadInSearch(search) {
  const normalizedSearch = normalizeTabSearch(search)
  if (!normalizedSearch) return false

  const params = new URLSearchParams(normalizedSearch)
  const multiFlag = String(params.get('multiDownload') || '').trim()
  if (multiFlag !== '1') return false

  const token = String(params.get('multiImportToken') || '').trim()
  const inlineLinks = String(params.get('links') || '').trim()
  return Boolean(token || inlineLinks)
}

export function hasDownloaderInSearch(search) {
  return hasUrlInSearch(search) || hasMultiDownloadInSearch(search)
}
