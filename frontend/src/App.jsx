import React from 'react'
import {
  Box,
  Stack,
  Typography,
  TextField,
  InputAdornment,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { ArrowRight } from 'lucide-react'
import AppLayout from './layout/AppLayout'
import Downloader from './pages/Downloader'
import SupportPage from './pages/Support'
import DownloadsPage from './pages/Downloads'
import { getApiBase } from './utils/metadata'
import { useI18n } from './providers/I18nProvider'
import {
  getPathForService,
  getRouteTitle,
  getServiceForPath,
  isDownloaderPath,
  normalizeTabPath,
  normalizeTabSearch,
} from './utils/tabRoutes'

const TAB_STATE_LOCAL_STORAGE_KEY = 'yloader.ui.tabs.state.v1'

function createTabId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tab-${crypto.randomUUID()}`
  }
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function createDefaultTab(tabId = createTabId()) {
  return {
    id: tabId,
    path: '/',
    search: '',
    navToken: 0,
    pageTitle: '',
    download: {
      active: false,
      progress: 0,
      title: '',
      stage: '',
    },
  }
}

function getTabDomId(tabId) {
  return `yl-tab-${tabId}`
}

function getPanelDomId(tabId) {
  return `yl-tabpanel-${tabId}`
}

function createTabFromCurrentLocation(tabId = 'tab-home') {
  const base = createDefaultTab(tabId)
  if (typeof window === 'undefined') return base

  base.path = normalizeTabPath(window.location.pathname)
  base.search = normalizeTabSearch(window.location.search)
  return base
}

function normalizeDownloadState(value) {
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
    download: normalizeDownloadState(rawTab?.download),
  }
}

function normalizeClientTabState(rawState) {
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

function serializeTabState(tabs, activeTabId) {
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

function readLocalTabState() {
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

function detectServiceFromUrl(rawValue) {
  if (!rawValue) return null
  const lower = String(rawValue).trim().toLowerCase()
  if (/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(lower)) return 'youtube'
  if (/^(https?:\/\/)?(www\.)?(reddit\.com|redd\.it)\//i.test(lower)) return 'reddit'
  if (/^(https?:\/\/)?(www\.)?(x\.com|twitter\.com)\//i.test(lower)) return 'x'
  if (/^https?:\/\//i.test(lower)) return 'generic'
  return null
}

function HomePage({ onOpenDownloader }) {
  const { t } = useI18n()
  const theme = useTheme()
  const genericIcon = theme.palette.mode === 'dark' ? '/dl-icons/generic-icon-dark.svg' : '/dl-icons/generic-icon-light.svg'
  const xIcon = theme.palette.mode === 'dark' ? '/dl-icons/x-icon-dark.svg' : '/dl-icons/x-icon-light.svg'
  const platforms = [
    { key: 'youtube', placeholder: t('placeholders.youtubeUrl'), icon: '/dl-icons/youtube-icon.svg' },
    { key: 'x', placeholder: t('placeholders.xUrl'), icon: xIcon },
    { key: 'reddit', placeholder: t('placeholders.redditUrl'), icon: '/dl-icons/reddit-icon.svg' },
    { key: 'generic', placeholder: t('placeholders.genericUrl'), icon: genericIcon },
  ]

  const FADE_MS = 400
  const HOLD_MS = 4200

  const [idx, setIdx] = React.useState(0)
  const [fading, setFading] = React.useState(false)
  const [value, setValue] = React.useState('')

  const intervalRef = React.useRef(null)
  const timeoutRef = React.useRef(null)

  React.useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    if (value && value.length > 0) {
      setFading(false)
      return () => {}
    }

    intervalRef.current = setInterval(() => {
      setFading(true)
      timeoutRef.current = setTimeout(() => {
        setIdx((i) => (i + 1) % platforms.length)
        setFading(false)
      }, FADE_MS)
    }, HOLD_MS + FADE_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [value, platforms.length])

  const goToDownloader = React.useCallback((serviceKey, rawUrl) => {
    if (!serviceKey || !rawUrl) return
    onOpenDownloader?.(serviceKey, rawUrl)
  }, [onOpenDownloader])

  React.useEffect(() => {
    const serviceKey = detectServiceFromUrl(value)
    if (!serviceKey) return
    const timer = setTimeout(() => {
      goToDownloader(serviceKey, value)
    }, 250)
    return () => clearTimeout(timer)
  }, [value, goToDownloader])

  const handleSubmit = React.useCallback(() => {
    const serviceKey = detectServiceFromUrl(value)
    if (serviceKey) goToDownloader(serviceKey, value)
  }, [value, goToDownloader])

  return (
    <Box sx={{ position: 'relative', height: '100%' }}>
      <Box sx={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '100%', maxWidth: 780, px: 2 }}>
        <TextField
          placeholder={platforms[idx].placeholder}
          variant="outlined"
          fullWidth
          size="medium"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start" sx={{ mr: 0.25 }}>
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 44,
                    height: 44,
                    ml: 0,
                    opacity: fading ? 0 : 1,
                    transition: `opacity ${FADE_MS}ms ease`,
                  }}
                >
                  <Box component="img" src={platforms[idx].icon} alt={t('app.platformIconAlt')} sx={{ width: 32, height: 32, display: 'block' }} />
                </Box>
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  aria-label={t('app.startDownloadAria')}
                  edge="end"
                  onClick={handleSubmit}
                  sx={(muiTheme) => ({
                    width: 36,
                    height: 36,
                    bgcolor: muiTheme.palette.mode === 'dark' ? '#ffffff' : '#000000',
                    color: muiTheme.palette.mode === 'dark' ? '#000000' : '#ffffff',
                    borderRadius: '50%',
                    boxShadow: muiTheme.palette.mode === 'dark'
                      ? '0 2px 6px rgba(0,0,0,0.4)'
                      : '0 2px 6px rgba(0,0,0,0.25)',
                    '&:hover': {
                      bgcolor: muiTheme.palette.mode === 'dark' ? '#f5f5f5' : '#111111',
                    },
                  })}
                >
                  <ArrowRight size={18} />
                </IconButton>
              </InputAdornment>
            ),
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text')
            const serviceKey = detectServiceFromUrl(pasted)
            if (serviceKey) {
              setValue(pasted)
              setTimeout(() => goToDownloader(serviceKey, pasted), 0)
            }
          }}
          sx={(muiTheme) => ({
            '& .MuiOutlinedInput-root': {
              borderRadius: 9999,
              backgroundColor: muiTheme.palette.mode === 'dark' ? '#303030' : '#f9f9f9',
              outline: 'none',
              '&:focus-within': {
                outline: 'none',
                boxShadow: 'none',
              },
              '& fieldset': {
                borderColor: muiTheme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0',
                borderWidth: '1px !important',
              },
              '&:hover fieldset': {
                borderColor: muiTheme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0',
              },
              '&.Mui-focused fieldset': {
                borderColor: muiTheme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0',
                borderWidth: '1px !important',
              },
              boxShadow: muiTheme.palette.mode === 'dark' ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
            },
            '& .MuiOutlinedInput-input': {
              paddingLeft: '4px',
              paddingRight: '16px',
              color: muiTheme.palette.text.primary,
              fontWeight: 700,
              outline: 'none',
              transition: `opacity ${FADE_MS}ms ease`,
              opacity: fading ? 0 : 1,
            },
            '& .MuiOutlinedInput-input::placeholder': {
              color: muiTheme.palette.text.secondary,
              fontWeight: 700,
            },
          })}
          inputProps={{ 'aria-label': t('app.urlInputAria', { service: 'YouTube' }) }}
        />
      </Box>

      <Stack spacing={0} sx={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(50% + 56px + 16px)', width: '100%', maxWidth: 780, px: 2 }}>
        <Typography variant="h1" component="h1" align="center" className="youtube-title" sx={{ fontSize: { xs: '3.5rem', sm: '5rem', md: '6rem' } }}>
          <span style={{ color: '#df2f2f' }}>y</span>Loader
        </Typography>
        <Typography variant="h4" align="center" sx={{ color: 'text.secondary', fontWeight: 700, mt: 0.5, fontSize: { xs: '1.25rem', sm: '1.5rem', md: '1.75rem' } }}>
          {t('app.subtitle')}
        </Typography>
      </Stack>
    </Box>
  )
}

export default function App() {
  const CLOSE_TAB_ANIMATION_MS = 240
  const { t } = useI18n()
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

  const openDownloaderInTab = React.useCallback((tabId, serviceKey, rawUrl) => {
    const path = getPathForService(serviceKey)
    const trimmedUrl = String(rawUrl || '').trim()
    const search = trimmedUrl ? `?url=${encodeURIComponent(trimmedUrl)}` : ''
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
    const routeTitle = getRouteTitle(tab.path, t)
    if (!isDownloaderPath(tab.path)) return routeTitle

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

      // Only update activeTabId here if no pre-switch was done (i.e. the closing tab is still active)
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

    // Pre-switch active tab immediately (before animation) using functional updater
    // to avoid stale-closure issues with tabs/activeTabId.
    setTabs((prevTabs) => {
      const sourceIndex = prevTabs.findIndex((tab) => tab.id === normalizedId)
      if (sourceIndex === -1) return prevTabs

      setActiveTabId((prevActiveId) => {
        if (prevActiveId !== normalizedId) return prevActiveId

        const remainingTabs = prevTabs.filter((tab) => tab.id !== normalizedId)
        if (!remainingTabs.length) {
          // Last tab: a new tab will be created in closeTabNow; keep current id for now.
          return prevActiveId
        }
        const fallbackIndex = Math.max(0, sourceIndex - 1)
        return remainingTabs[Math.min(fallbackIndex, remainingTabs.length - 1)].id
      })

      return prevTabs // don't mutate here, just side-effect for activeTabId
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
    }, CLOSE_TAB_ANIMATION_MS)

    closeTimersRef.current.set(normalizedId, timer)
  }, [CLOSE_TAB_ANIMATION_MS, closeTabNow])

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

  const renderTabContent = React.useCallback((tab) => {
    const normalizedPath = normalizeTabPath(tab.path)

    if (normalizedPath === '/downloads') {
      return (
        <DownloadsPage
          onOpenDownloader={(serviceKey, rawUrl) => openDownloaderInTab(tab.id, serviceKey, rawUrl)}
        />
      )
    }

    if (normalizedPath === '/support') {
      return <SupportPage />
    }

    if (isDownloaderPath(normalizedPath)) {
      const serviceKey = getServiceForPath(normalizedPath) || 'generic'
      return (
        <Downloader
          serviceKey={serviceKey}
          routeSearch={tab.search}
          routeToken={tab.navToken}
          onNavigate={(nextPath, nextSearch = '') => navigateTab(tab.id, nextPath, nextSearch)}
          onTabStateChange={(runtime) => handleTabRuntimeChange(tab.id, runtime)}
        />
      )
    }

    return (
      <HomePage onOpenDownloader={(serviceKey, rawUrl) => openDownloaderInTab(tab.id, serviceKey, rawUrl)} />
    )
  }, [handleTabRuntimeChange, navigateTab, openDownloaderInTab])

  React.useEffect(() => {
    const isTypingTarget = (target) => {
      if (!(target instanceof HTMLElement)) return false
      if (target.isContentEditable) return true
      const tagName = target.tagName.toLowerCase()
      return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
    }

    const handleGlobalTabShortcuts = (event) => {
      const key = String(event.key || '').toLowerCase()
      const hasPrimaryModifier = event.ctrlKey || event.metaKey
      if (!hasPrimaryModifier) return

      if (isTypingTarget(event.target)) return

      if (key === 't') {
        event.preventDefault()
        handleAddTab()
        return
      }

      if (key === 'w') {
        event.preventDefault()
        if (activeTabId) handleRequestCloseTab(activeTabId)
        return
      }

      if (key === 'tab') {
        event.preventDefault()
        selectRelativeTab(event.shiftKey ? -1 : 1)
      }
    }

    window.addEventListener('keydown', handleGlobalTabShortcuts)
    return () => window.removeEventListener('keydown', handleGlobalTabShortcuts)
  }, [activeTabId, handleAddTab, handleRequestCloseTab, selectRelativeTab])

  return (
    <>
      <AppLayout
        activePath={activeTab?.path || '/'}
        tabs={tabs.map((tab) => ({
          ...tab,
          displayTitle: getDisplayTabTitle(tab),
        }))}
        closingTabIds={Array.from(closingTabIds)}
        activeTabId={activeTab?.id || activeTabId}
        onTabSelect={setActiveTabId}
        onTabClose={handleRequestCloseTab}
        onAddTab={handleAddTab}
        onTabsReorder={handleTabsReorder}
        onNavigateActiveTab={navigateActiveTab}
      >
        <Box sx={{ position: 'relative', height: '100%' }}>
          {tabs.map((tab) => (
            <Box
              key={tab.id}
              role="tabpanel"
              id={getPanelDomId(tab.id)}
              aria-labelledby={getTabDomId(tab.id)}
              hidden={tab.id !== activeTabId}
              tabIndex={tab.id === activeTabId ? 0 : -1}
              sx={{
                display: tab.id === activeTabId ? 'block' : 'none',
                height: '100%',
              }}
            >
              {renderTabContent(tab)}
            </Box>
          ))}
        </Box>
      </AppLayout>

      <Dialog open={Boolean(closeWarning)} onClose={() => setCloseWarning(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('tabs.closeWarningTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('tabs.closeWarningBody', {
              title: closeWarning?.title || t('tabs.unnamedTab'),
            })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCloseWarning(null)}>{t('tabs.cancel')}</Button>
          <Button variant="contained" color="error" onClick={handleConfirmClose}>
            {t('tabs.closeAnyway')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
