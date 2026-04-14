import React from 'react'
import { detectService, getApiBase } from '../utils/metadata'
import {
  getPathForService,
  getRouteTitle,
  normalizeTabPath,
  normalizeTabSearch,
} from '../utils/tabRoutes'
import {
  TAB_STATE_LOCAL_STORAGE_KEY,
  createDefaultTab,
  createTabFromCurrentLocation,
  hasUrlInSearch,
  normalizeClientTabState,
  normalizeDownloadState,
  readLocalTabState,
  serializeTabState,
} from '../utils/tabState'

export function useTabsController({ t, closeTabAnimationMs = 240 }) {
  const [tabs, setTabs] = React.useState(() => [createTabFromCurrentLocation('tab-home')])
  const [activeTabId, setActiveTabId] = React.useState('tab-home')
  const [tabsReady, setTabsReady] = React.useState(false)
  const [closeWarning, setCloseWarning] = React.useState(null)
  const [closingTabIds, setClosingTabIds] = React.useState(() => new Set())

  const saveTimerRef = React.useRef(null)
  const closeTimersRef = React.useRef(new Map())
  const lastSavedRef = React.useRef('')

  React.useEffect(() => () => {
    closeTimersRef.current.forEach((timer) => clearTimeout(timer))
    closeTimersRef.current.clear()
  }, [])

  React.useEffect(() => {
    let cancelled = false

    const loadTabs = async () => {
      const localState = readLocalTabState()

      try {
        let normalized = localState

        if (!normalized) {
          const API_BASE = getApiBase()
          const res = await fetch(`${API_BASE}/api/tabs/state`)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)

          const payload = await res.json()
          normalized = normalizeClientTabState(payload)
        }

        const currentPath = typeof window !== 'undefined' ? normalizeTabPath(window.location.pathname) : '/'
        const shouldSeedFromUrl =
          normalized.tabs.length === 1
          && normalized.tabs[0].id === 'tab-home'
          && normalized.tabs[0].path === '/'
          && currentPath !== '/'

        const effectiveState = shouldSeedFromUrl
          ? {
              tabs: [{
                ...normalized.tabs[0],
                path: currentPath,
                search: normalizeTabSearch(window.location.search),
              }],
              activeTabId: normalized.activeTabId,
            }
          : normalized

        if (cancelled) return

        setTabs(effectiveState.tabs)
        setActiveTabId(effectiveState.activeTabId)

        const serialized = JSON.stringify(serializeTabState(effectiveState.tabs, effectiveState.activeTabId))
        lastSavedRef.current = serialized

        try {
          localStorage.setItem(TAB_STATE_LOCAL_STORAGE_KEY, serialized)
        } catch {
          // ignore local persistence errors
        }
      } catch {
        if (cancelled) return

        const fallbackTab = createTabFromCurrentLocation('tab-home')
        setTabs([fallbackTab])
        setActiveTabId(fallbackTab.id)

        const serialized = JSON.stringify(serializeTabState([fallbackTab], fallbackTab.id))
        lastSavedRef.current = serialized

        try {
          localStorage.setItem(TAB_STATE_LOCAL_STORAGE_KEY, serialized)
        } catch {
          // ignore local persistence errors
        }
      } finally {
        if (!cancelled) setTabsReady(true)
      }
    }

    loadTabs()
    return () => {
      cancelled = true
    }
  }, [])

  const persistedState = React.useMemo(() => serializeTabState(tabs, activeTabId), [tabs, activeTabId])

  React.useEffect(() => {
    if (!tabsReady) return

    const serialized = JSON.stringify(persistedState)

    try {
      localStorage.setItem(TAB_STATE_LOCAL_STORAGE_KEY, serialized)
    } catch {
      // ignore local persistence errors
    }

    if (serialized === lastSavedRef.current) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    saveTimerRef.current = setTimeout(async () => {
      try {
        const API_BASE = getApiBase()
        const response = await fetch(`${API_BASE}/api/tabs/state`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: serialized,
        })
        if (!response.ok) return
        lastSavedRef.current = serialized
      } catch {
        // ignore temporary persistence errors
      }
    }, 220)

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
    }
  }, [tabsReady, persistedState])

  const navigateTab = React.useCallback((tabId, path, search = '') => {
    const normalizedPath = normalizeTabPath(path)
    const normalizedSearch = normalizeTabSearch(search)

    setTabs((prevTabs) => prevTabs.map((tab) => {
      if (tab.id !== tabId) return tab
      return {
        ...tab,
        path: normalizedPath,
        search: normalizedSearch,
        navToken: tab.navToken + 1,
      }
    }))
  }, [])

  const navigateActiveTab = React.useCallback((path, search = '') => {
    if (!activeTabId) return
    navigateTab(activeTabId, path, search)
  }, [activeTabId, navigateTab])

  const openDownloaderInTab = React.useCallback((tabId, serviceKey, rawUrl, options = {}) => {
    const path = getPathForService(serviceKey)
    const trimmedUrl = String(rawUrl || '').trim()
    const detected = detectService(trimmedUrl) || serviceKey || 'generic'

    const params = new URLSearchParams()
    params.set('service', detected)
    if (trimmedUrl) params.set('url', trimmedUrl)
    if (options?.prefetched) params.set('prefetch', '1')

    const search = params.toString() ? `?${params.toString()}` : ''
    navigateTab(tabId, path, search)
  }, [navigateTab])

  const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0]

  const selectRelativeTab = React.useCallback((direction = 1) => {
    if (!tabs.length) return

    const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId)
    const safeIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = (safeIndex + direction + tabs.length) % tabs.length
    const nextTabId = tabs[nextIndex]?.id

    if (nextTabId) setActiveTabId(nextTabId)
  }, [activeTabId, tabs])

  React.useEffect(() => {
    if (!activeTab || typeof window === 'undefined') return

    const nextPath = normalizeTabPath(activeTab.path)
    const nextSearch = normalizeTabSearch(activeTab.search)
    const currentUrl = `${window.location.pathname}${window.location.search}`
    const nextUrl = `${nextPath}${nextSearch}`

    if (currentUrl !== nextUrl) {
      window.history.replaceState(null, '', nextUrl)
    }
  }, [activeTab?.path, activeTab?.search])

  const getDisplayTabTitle = React.useCallback((tab) => {
    const routeTitle = getRouteTitle(tab.path, t, tab.search)
    if (normalizeTabPath(tab.path) !== '/' || !hasUrlInSearch(tab.search)) return routeTitle

    const candidate = tab.download?.title || tab.pageTitle
    return candidate || routeTitle
  }, [t])

  const closeTabNow = React.useCallback((tabId) => {
    setTabs((prevTabs) => {
      const index = prevTabs.findIndex((tab) => tab.id === tabId)
      if (index === -1) return prevTabs

      const remaining = prevTabs.filter((tab) => tab.id !== tabId)
      if (!remaining.length) {
        const fallback = createDefaultTab()
        setActiveTabId(fallback.id)
        return [fallback]
      }

      setActiveTabId((prevActiveId) => {
        if (prevActiveId !== tabId && remaining.some((tab) => tab.id === prevActiveId)) {
          return prevActiveId
        }
        const fallbackIndex = Math.max(0, index - 1)
        return remaining[Math.min(fallbackIndex, remaining.length - 1)].id
      })

      return remaining
    })
  }, [])

  const startCloseTabAnimation = React.useCallback((tabId) => {
    const normalizedId = String(tabId || '').trim()
    if (!normalizedId) return

    setTabs((prevTabs) => {
      const sourceIndex = prevTabs.findIndex((tab) => tab.id === normalizedId)
      if (sourceIndex === -1) return prevTabs

      setActiveTabId((prevActiveId) => {
        if (prevActiveId !== normalizedId) return prevActiveId

        const remainingTabs = prevTabs.filter((tab) => tab.id !== normalizedId)
        if (!remainingTabs.length) {
          return prevActiveId
        }

        const fallbackIndex = Math.max(0, sourceIndex - 1)
        return remainingTabs[Math.min(fallbackIndex, remainingTabs.length - 1)].id
      })

      return prevTabs
    })

    let shouldSchedule = false
    setClosingTabIds((prev) => {
      if (prev.has(normalizedId)) return prev
      shouldSchedule = true
      const next = new Set(prev)
      next.add(normalizedId)
      return next
    })

    if (!shouldSchedule || closeTimersRef.current.has(normalizedId)) return

    const timer = setTimeout(() => {
      closeTimersRef.current.delete(normalizedId)
      closeTabNow(normalizedId)
      setClosingTabIds((prev) => {
        if (!prev.has(normalizedId)) return prev
        const next = new Set(prev)
        next.delete(normalizedId)
        return next
      })
    }, closeTabAnimationMs)

    closeTimersRef.current.set(normalizedId, timer)
  }, [closeTabAnimationMs, closeTabNow])

  React.useEffect(() => {
    const activeTabSet = new Set(tabs.map((tab) => tab.id))

    setClosingTabIds((prev) => {
      if (!prev.size) return prev

      let changed = false
      const next = new Set()
      prev.forEach((id) => {
        if (activeTabSet.has(id)) {
          next.add(id)
        } else {
          changed = true
        }
      })

      return changed ? next : prev
    })

    closeTimersRef.current.forEach((timer, id) => {
      if (activeTabSet.has(id)) return
      clearTimeout(timer)
      closeTimersRef.current.delete(id)
    })
  }, [tabs])

  const handleRequestCloseTab = React.useCallback((tabId) => {
    const tab = tabs.find((candidate) => candidate.id === tabId)
    if (!tab) return

    if (tab.download?.active) {
      setCloseWarning({
        tabId,
        title: getDisplayTabTitle(tab),
      })
      return
    }

    startCloseTabAnimation(tabId)
  }, [getDisplayTabTitle, startCloseTabAnimation, tabs])

  const handleConfirmClose = React.useCallback(() => {
    if (!closeWarning?.tabId) return
    startCloseTabAnimation(closeWarning.tabId)
    setCloseWarning(null)
  }, [closeWarning, startCloseTabAnimation])

  const handleAddTab = React.useCallback(() => {
    const newTab = createDefaultTab()
    setTabs((prevTabs) => [...prevTabs, newTab])
    setActiveTabId(newTab.id)
  }, [])

  const handleTabsReorder = React.useCallback((orderedIds = []) => {
    if (!Array.isArray(orderedIds) || !orderedIds.length) return

    setTabs((prevTabs) => {
      const byId = new Map(prevTabs.map((tab) => [tab.id, tab]))
      const reordered = []

      for (let i = 0; i < orderedIds.length; i += 1) {
        const id = String(orderedIds[i] || '')
        const tab = byId.get(id)
        if (!tab) continue
        reordered.push(tab)
        byId.delete(id)
      }

      prevTabs.forEach((tab) => {
        if (byId.has(tab.id)) reordered.push(tab)
      })

      return reordered.length === prevTabs.length ? reordered : prevTabs
    })
  }, [])

  const handleTabRuntimeChange = React.useCallback((tabId, runtime) => {
    setTabs((prevTabs) => prevTabs.map((tab) => {
      if (tab.id !== tabId) return tab

      const nextPageTitle = typeof runtime?.pageTitle === 'string'
        ? runtime.pageTitle.trim().slice(0, 180)
        : tab.pageTitle

      const nextDownload = runtime?.download
        ? normalizeDownloadState(runtime.download)
        : tab.download

      const unchanged =
        nextPageTitle === tab.pageTitle
        && nextDownload.active === tab.download.active
        && nextDownload.progress === tab.download.progress
        && nextDownload.title === tab.download.title
        && nextDownload.stage === tab.download.stage

      if (unchanged) return tab

      return {
        ...tab,
        pageTitle: nextPageTitle,
        download: nextDownload,
      }
    }))
  }, [])

  return {
    tabs,
    activeTab,
    activeTabId,
    closeWarning,
    closingTabIds,
    setActiveTabId,
    setCloseWarning,
    getDisplayTabTitle,
    navigateTab,
    navigateActiveTab,
    openDownloaderInTab,
    selectRelativeTab,
    handleRequestCloseTab,
    handleConfirmClose,
    handleAddTab,
    handleTabsReorder,
    handleTabRuntimeChange,
  }
}
