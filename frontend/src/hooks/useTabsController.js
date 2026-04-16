import React from 'react'
import { getApiBase, resolveServiceKey } from '../utils/metadata'
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
  readCurrentTabLocation,
  readLocalTabState,
  serializeTabState,
} from '../utils/tabState'

function isFileProtocolRuntime() {
  if (typeof window === 'undefined') return false
  return String(window.location.protocol || '').toLowerCase() === 'file:'
}

function buildBrowserUrl(path, search) {
  const normalizedPath = normalizeTabPath(path)
  const normalizedSearch = normalizeTabSearch(search)

  if (!isFileProtocolRuntime()) {
    return `${normalizedPath}${normalizedSearch}`
  }

  if (normalizedPath === '/' && !normalizedSearch) {
    return ''
  }

  return `#${normalizedPath}${normalizedSearch}`
}

export function useTabsController({ t }) {
  const [tabs, setTabs] = React.useState(() => [createTabFromCurrentLocation('tab-home')])
  const [activeTabId, setActiveTabId] = React.useState('tab-home')
  const [tabsReady, setTabsReady] = React.useState(false)
  const [closeWarning, setCloseWarning] = React.useState(null)
  const [closingTabIds, setClosingTabIds] = React.useState(() => new Set())

  const saveTimerRef = React.useRef(null)
  const closeTimersRef = React.useRef(new Map())
  const lastSavedRef = React.useRef('')
  const lastLocalSerializedRef = React.useRef('')
  const runtimeQueueRef = React.useRef(new Map())
  const runtimeFlushTimerRef = React.useRef(null)

  React.useEffect(() => () => {
    closeTimersRef.current.forEach((timer) => clearTimeout(timer))
    closeTimersRef.current.clear()

    if (runtimeFlushTimerRef.current) {
      clearTimeout(runtimeFlushTimerRef.current)
      runtimeFlushTimerRef.current = null
    }
    runtimeQueueRef.current.clear()
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

        const currentLocation = readCurrentTabLocation()
        const currentPath = currentLocation.path
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
                search: currentLocation.search,
              }],
              activeTabId: normalized.activeTabId,
            }
          : normalized

        if (cancelled) return

        setTabs(effectiveState.tabs)
        setActiveTabId(effectiveState.activeTabId)

        const serialized = JSON.stringify(serializeTabState(effectiveState.tabs, effectiveState.activeTabId))
        lastSavedRef.current = serialized
        lastLocalSerializedRef.current = serialized

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
        lastLocalSerializedRef.current = serialized

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

    if (serialized !== lastLocalSerializedRef.current) {
      try {
        localStorage.setItem(TAB_STATE_LOCAL_STORAGE_KEY, serialized)
        lastLocalSerializedRef.current = serialized
      } catch {
        // ignore local persistence errors
      }
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
    const detected = resolveServiceKey(serviceKey, trimmedUrl)

    const params = new URLSearchParams()
    params.set('service', detected)
    if (trimmedUrl) params.set('url', trimmedUrl)
    if (options?.prefetched) params.set('prefetch', '1')

    const search = params.toString() ? `?${params.toString()}` : ''
    navigateTab(tabId, path, search)
  }, [navigateTab])

  const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0]

  React.useEffect(() => {
    if (!tabs.length) {
      const fallbackTab = createDefaultTab('tab-home')
      setTabs([fallbackTab])
      setActiveTabId(fallbackTab.id)
      return
    }

    setActiveTabId((prevActiveId) => {
      if (tabs.some((tab) => tab.id === prevActiveId)) return prevActiveId
      return tabs[0].id
    })
  }, [tabs])

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
    const currentLocation = readCurrentTabLocation()
    const currentUrl = buildBrowserUrl(currentLocation.path, currentLocation.search)
    const nextUrl = buildBrowserUrl(nextPath, nextSearch)

    if (currentUrl !== nextUrl) {
      window.history.replaceState(null, '', nextUrl)
    }
  }, [activeTab?.path, activeTab?.search])

  const getDisplayTabTitle = React.useCallback((tab) => {
    const routeTitle = getRouteTitle(tab.path, t, tab.search)
    if (normalizeTabPath(tab.path) !== '/' || !hasUrlInSearch(tab.search)) return routeTitle

    const candidate = tab.download?.title || tab.pageTitle
    if (!candidate) return routeTitle

    const normalizedCandidate = String(candidate).trim()
    const normalizedRouteTitle = String(routeTitle).trim()
    if (!normalizedRouteTitle) return normalizedCandidate

    const lowerCandidate = normalizedCandidate.toLowerCase()
    const lowerRouteTitle = normalizedRouteTitle.toLowerCase()
    if (lowerCandidate.endsWith(lowerRouteTitle)) return normalizedCandidate

    return `${normalizedCandidate} - ${normalizedRouteTitle}`
  }, [t])

  const closeTabNow = React.useCallback((tabId) => {
    setTabs((prevTabs) => {
      const index = prevTabs.findIndex((tab) => tab.id === tabId)
      if (index === -1) {
        if (prevTabs.length) return prevTabs
        const fallback = createDefaultTab('tab-home')
        setActiveTabId(fallback.id)
        return [fallback]
      }

      const remaining = prevTabs.filter((tab) => tab.id !== tabId)
      if (!remaining.length) {
        const fallback = createDefaultTab('tab-home')
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

    const sourceIndex = tabs.findIndex((tab) => tab.id === normalizedId)
    if (sourceIndex === -1) return

    // Never allow a zero-tab UI state.
    if (tabs.length <= 1) {
      const fallback = createDefaultTab('tab-home')
      setTabs([fallback])
      setActiveTabId(fallback.id)
      setClosingTabIds((prev) => {
        if (!prev.has(normalizedId)) return prev
        const next = new Set(prev)
        next.delete(normalizedId)
        return next
      })
      return
    }

    if (closeTimersRef.current.has(normalizedId)) return

    if (activeTabId === normalizedId) {
      const remainingTabs = tabs.filter((tab) => tab.id !== normalizedId)
      const fallbackIndex = Math.max(0, sourceIndex - 1)
      const nextActiveId = remainingTabs[Math.min(fallbackIndex, remainingTabs.length - 1)]?.id
      if (nextActiveId) setActiveTabId(nextActiveId)
    }

    setClosingTabIds((prev) => {
      if (prev.has(normalizedId)) return prev
      const next = new Set(prev)
      next.add(normalizedId)
      return next
    })

    const timer = setTimeout(() => {
      closeTimersRef.current.delete(normalizedId)
      setClosingTabIds((prev) => {
        if (!prev.has(normalizedId)) return prev
        const next = new Set(prev)
        next.delete(normalizedId)
        return next
      })
      closeTabNow(normalizedId)
    }, 240)

    closeTimersRef.current.set(normalizedId, timer)
  }, [activeTabId, closeTabNow, tabs])

  React.useEffect(() => {
    const tabIdSet = new Set(tabs.map((tab) => tab.id))

    setClosingTabIds((prev) => {
      if (!prev.size) return prev
      let changed = false
      const next = new Set()
      prev.forEach((id) => {
        if (!tabIdSet.has(id)) {
          changed = true
          return
        }
        next.add(id)
      })
      return changed ? next : prev
    })

    closeTimersRef.current.forEach((timer, id) => {
      if (tabIdSet.has(id)) return
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

  // Animates a set of tab IDs out (is-closing), then removes them in one state
  // update after the animation completes. All tabs share a single 240ms timer.
  const startBulkCloseAnimation = React.useCallback((tabIdsToClose) => {
    const validIds = tabIdsToClose
      .map((id) => String(id || '').trim())
      .filter((id) => id && !closeTimersRef.current.has(id))

    if (!validIds.length) return

    setClosingTabIds((prev) => {
      const next = new Set(prev)
      validIds.forEach((id) => next.add(id))
      return next
    })

    const idSet = new Set(validIds)
    const timer = setTimeout(() => {
      validIds.forEach((id) => closeTimersRef.current.delete(id))
      setClosingTabIds((prev) => {
        if (!prev.size) return prev
        const next = new Set(prev)
        validIds.forEach((id) => next.delete(id))
        return next
      })
      setTabs((prevTabs) => {
        const remaining = prevTabs.filter((t) => !idSet.has(t.id))
        if (!remaining.length) {
          const fallback = createDefaultTab('tab-home')
          setActiveTabId(fallback.id)
          return [fallback]
        }
        return remaining
      })
    }, 240)

    validIds.forEach((id) => closeTimersRef.current.set(id, timer))
  }, [])

  const handleCloneTab = React.useCallback((tabId) => {
    const sourceTab = tabs.find((t) => t.id === tabId)
    if (!sourceTab) return

    const newTab = createDefaultTab()
    newTab.path = sourceTab.path
    newTab.search = sourceTab.search

    setTabs((prevTabs) => {
      const index = prevTabs.findIndex((t) => t.id === tabId)
      const next = [...prevTabs]
      next.splice(index < 0 ? next.length : index + 1, 0, newTab)
      return next
    })
    setActiveTabId(newTab.id)
  }, [tabs])

  const handleCloseOtherTabs = React.useCallback((tabId) => {
    const toClose = tabs.filter((t) => t.id !== tabId).map((t) => t.id)
    if (!toClose.length) return
    setActiveTabId(tabId)
    startBulkCloseAnimation(toClose)
  }, [tabs, startBulkCloseAnimation])

  const handleCloseTabsToLeft = React.useCallback((tabId) => {
    const index = tabs.findIndex((t) => t.id === tabId)
    if (index <= 0) return
    const toClose = tabs.slice(0, index).map((t) => t.id)
    setActiveTabId(tabId)
    startBulkCloseAnimation(toClose)
  }, [tabs, startBulkCloseAnimation])

  const handleCloseTabsToRight = React.useCallback((tabId) => {
    const index = tabs.findIndex((t) => t.id === tabId)
    if (index < 0 || index >= tabs.length - 1) return
    const toClose = tabs.slice(index + 1).map((t) => t.id)
    setActiveTabId(tabId)
    startBulkCloseAnimation(toClose)
  }, [tabs, startBulkCloseAnimation])

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

  const flushQueuedRuntimeUpdates = React.useCallback(() => {
    runtimeFlushTimerRef.current = null

    if (!runtimeQueueRef.current.size) return
    const queued = new Map(runtimeQueueRef.current)
    runtimeQueueRef.current.clear()

    setTabs((prevTabs) => {
      let changed = false

      const nextTabs = prevTabs.map((tab) => {
        const runtime = queued.get(tab.id)
        if (!runtime) return tab

        const nextPageTitle = typeof runtime?.pageTitle === 'string'
          ? runtime.pageTitle.trim().slice(0, 180)
          : tab.pageTitle

        const nextLoading = runtime?.loading !== undefined
          ? Boolean(runtime.loading)
          : Boolean(tab.loading)

        const nextDownload = runtime?.download
          ? normalizeDownloadState(runtime.download)
          : tab.download

        const unchanged =
          nextPageTitle === tab.pageTitle
          && nextLoading === Boolean(tab.loading)
          && nextDownload.active === tab.download.active
          && nextDownload.progress === tab.download.progress
          && nextDownload.title === tab.download.title
          && nextDownload.stage === tab.download.stage

        if (unchanged) return tab

        changed = true
        return {
          ...tab,
          pageTitle: nextPageTitle,
          loading: nextLoading,
          download: nextDownload,
        }
      })

      return changed ? nextTabs : prevTabs
    })
  }, [])

  const handleTabRuntimeChange = React.useCallback((tabId, runtime) => {
    const normalizedId = String(tabId || '').trim()
    if (!normalizedId) return

    // Merge into existing queued entry so rapid partial updates (e.g. pageTitle
    // immediately followed by loading:false) don't silently drop earlier fields.
    const existing = runtimeQueueRef.current.get(normalizedId) || {}
    runtimeQueueRef.current.set(normalizedId, { ...existing, ...(runtime || {}) })

    if (runtimeFlushTimerRef.current) return
    runtimeFlushTimerRef.current = setTimeout(flushQueuedRuntimeUpdates, 90)
  }, [flushQueuedRuntimeUpdates])

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
    handleCloneTab,
    handleCloseOtherTabs,
    handleCloseTabsToLeft,
    handleCloseTabsToRight,
    handleTabsReorder,
    handleTabRuntimeChange,
  }
}
