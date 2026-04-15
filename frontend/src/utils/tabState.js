import { normalizeTabPath, normalizeTabSearch } from './tabRoutes'

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
  }
}

export function getTabDomId(tabId) {
  return `yl-tab-${tabId}`
}

export function getPanelDomId(tabId) {
  return `yl-tabpanel-${tabId}`
}

export function createTabFromCurrentLocation(tabId = 'tab-home') {
  const base = createDefaultTab(tabId)
  if (typeof window === 'undefined') return base

  base.path = normalizeTabPath(window.location.pathname)
  base.search = normalizeTabSearch(window.location.search)
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
  return Boolean(String(params.get('url') || '').trim())
}
