import {
  createFallbackPersistedTab,
  normalizePersistedTabState,
  normalizeSearchRuntimeState,
  normalizeTabRuntimeState,
  normalizeTabPath,
  normalizeTabSearch,
  normalizeTabTitle,
  TAB_STATE_MAX_PERSISTED_TABS,
} from '../../../shared/tabs/tabRuntime.js'

export const TAB_STATE_LOCAL_STORAGE_KEY = 'yloader.ui.tabs.state.v1'

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
    pageTitle: normalizeTabTitle(rawTab?.pageTitle),
    loading: false,
    download: normalizeDownloadState(rawTab?.download),
    runtime: normalizeTabRuntimeState(rawTab?.runtime),
  }
}

export function normalizeClientTabState(rawState) {
  const persisted = normalizePersistedTabState(rawState)
  const inputTabs = Array.isArray(rawState?.tabs) ? rawState.tabs : []
  const tabs = []

  for (
    let index = 0;
    index < inputTabs.length && tabs.length < TAB_STATE_MAX_PERSISTED_TABS;
    index += 1
  ) {
    const normalized = normalizeClientTab(inputTabs[index], index)
    if (tabs.some((tab) => tab.id === normalized.id)) continue
    tabs.push(normalized)
  }

  if (!tabs.length) {
    tabs.push({
      ...createFallbackPersistedTab(),
      navToken: 0,
      loading: false,
      download: normalizeDownloadState(null),
    })
  }

  const activeTabId = tabs.some((tab) => tab.id === persisted.activeTabId)
    ? persisted.activeTabId
    : tabs[0].id

  return { tabs, activeTabId }
}

export function serializeTabState(tabs, activeTabId) {
  return {
    tabs: tabs.map((tab) => ({
      id: tab.id,
      path: normalizeTabPath(tab.path),
      search: normalizeTabSearch(tab.search),
      pageTitle: normalizeTabTitle(tab.pageTitle),
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

export { normalizeTabRuntimeState }
export { normalizeSearchRuntimeState }
