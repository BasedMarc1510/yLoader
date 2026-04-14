import React from 'react'
import {
  Box,
  Stack,
  Typography,
  TextField,
  InputAdornment,
  IconButton,
  CircularProgress,
  Menu,
  MenuItem,
  Divider,
  Switch,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Tooltip,
} from '@mui/material'
import { ArrowRight, Plus, List, Zap, X, AlertTriangle, ChevronRight } from 'lucide-react'
import AppLayout from './layout/AppLayout'
import Downloader from './pages/Downloader'
import SupportPage from './pages/Support'
import DownloadsPage from './pages/Downloads'
import { detectService, fetchDuration, fetchFormats, fetchNoembed, getApiBase, normalizeUrlForNoembed } from './utils/metadata'
import { useI18n } from './providers/I18nProvider'
import { useNotification } from './providers/NotificationProvider'
import {
  getPathForService,
  getRouteTitle,
  getServiceForPath,
  normalizeTabPath,
  normalizeTabSearch,
} from './utils/tabRoutes'

const TAB_STATE_LOCAL_STORAGE_KEY = 'yloader.ui.tabs.state.v1'
const HOME_PREFETCH_CACHE_KEY = 'yloader.home.prefetch.v1'
const HOME_AUTO_PREFS_KEY = 'yloader.home.autoDownload.prefs.v1'
const AUTO_DOWNLOAD_SETTINGS_DEFAULTS = Object.freeze({
  useMetadata: true,
  embedCoverArt: true,
  maxAudioBitrateKbps: 0,
  maxVideoHeight: 0,
})

function readHomeAutoDownloadPrefs() {
  if (typeof window === 'undefined') {
    return { enabled: false, format: 'mp4' }
  }

  try {
    const raw = localStorage.getItem(HOME_AUTO_PREFS_KEY)
    if (!raw) return { enabled: false, format: 'mp4' }

    const parsed = JSON.parse(raw)
    const format = parsed?.format === 'mp3' ? 'mp3' : 'mp4'
    return {
      enabled: Boolean(parsed?.enabled),
      format,
    }
  } catch {
    return { enabled: false, format: 'mp4' }
  }
}

function normalizeAutoDownloadSettings(value) {
  const input = (value && typeof value === 'object') ? value : {}
  const maxAudioBitrateKbps = Number(input.maxAudioBitrateKbps)
  const maxVideoHeight = Number(input.maxVideoHeight)

  return {
    useMetadata: input.useMetadata !== undefined ? Boolean(input.useMetadata) : AUTO_DOWNLOAD_SETTINGS_DEFAULTS.useMetadata,
    embedCoverArt: input.embedCoverArt !== undefined ? Boolean(input.embedCoverArt) : AUTO_DOWNLOAD_SETTINGS_DEFAULTS.embedCoverArt,
    maxAudioBitrateKbps: Number.isFinite(maxAudioBitrateKbps) ? maxAudioBitrateKbps : AUTO_DOWNLOAD_SETTINGS_DEFAULTS.maxAudioBitrateKbps,
    maxVideoHeight: Number.isFinite(maxVideoHeight) ? maxVideoHeight : AUTO_DOWNLOAD_SETTINGS_DEFAULTS.maxVideoHeight,
  }
}

function openSettingsModal(section = 'general') {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  window.dispatchEvent(new CustomEvent('yloader:open-settings', { detail: { section } }))
}

function pickAudioFormatByMaxBitrate(formats, maxAudioBitrateKbps) {
  const list = Array.isArray(formats) ? formats : []
  if (!list.length) return 'best'

  const normalizedCap = Number(maxAudioBitrateKbps)
  const cap = Number.isFinite(normalizedCap) ? normalizedCap : 0

  const candidates = list
    .filter((fmt) => fmt && typeof fmt.formatId === 'string' && fmt.formatId.trim())
    .map((fmt) => ({
      formatId: fmt.formatId,
      abr: Number(fmt.abr) || 0,
      filesize: Number(fmt.filesize) || 0,
    }))
    .filter((fmt) => fmt.abr > 0)

  if (!candidates.length) return 'best'

  const bounded = cap > 0
    ? candidates.filter((fmt) => fmt.abr <= cap)
    : candidates
  const pool = bounded.length ? bounded : candidates

  pool.sort((a, b) => {
    if (b.abr !== a.abr) return b.abr - a.abr
    return (a.filesize || 0) - (b.filesize || 0)
  })

  return pool[0]?.formatId || 'best'
}

function readVideoFormatHeight(fmt) {
  const direct = Number(fmt?.height)
  if (Number.isFinite(direct) && direct > 0) return direct

  const resolution = String(fmt?.resolution || '')
  const pMatch = resolution.match(/(\d{3,4})p/i)
  if (pMatch) return Number(pMatch[1])

  const xMatch = resolution.match(/x(\d{3,4})$/i)
  if (xMatch) return Number(xMatch[1])

  return 0
}

function pickVideoFormatByMaxHeight(formats, maxVideoHeight) {
  const list = Array.isArray(formats) ? formats : []
  if (!list.length) return 'best'

  const normalizedCap = Number(maxVideoHeight)
  const cap = Number.isFinite(normalizedCap) ? normalizedCap : 0

  const candidates = list
    .filter((fmt) => fmt && typeof fmt.formatId === 'string' && fmt.formatId.trim())
    .map((fmt) => ({
      formatId: fmt.formatId,
      height: readVideoFormatHeight(fmt),
      filesize: Number(fmt.filesize) || 0,
    }))
    .filter((fmt) => fmt.height > 0)

  if (!candidates.length) return 'best'

  const bounded = cap > 0
    ? candidates.filter((fmt) => fmt.height <= cap)
    : candidates
  const pool = bounded.length ? bounded : candidates

  pool.sort((a, b) => {
    if (b.height !== a.height) return b.height - a.height
    return (b.filesize || 0) - (a.filesize || 0)
  })

  return pool[0]?.formatId || 'best'
}

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

function hasUrlInSearch(search) {
  const normalizedSearch = normalizeTabSearch(search)
  if (!normalizedSearch) return false

  const params = new URLSearchParams(normalizedSearch)
  return Boolean(String(params.get('url') || '').trim())
}

function extractYtDlpError(msg) {
  if (!msg) return ''
  const lines = String(msg).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const errorLine = lines.find((line) => line.startsWith('ERROR:'))
  const raw = errorLine ? errorLine.replace(/^ERROR:\s*/, '') : (lines[0] || msg)
  return raw.replace(/\ufffd/g, '\u2019')
}

function HomePage({ onOpenDownloader }) {
  const { t } = useI18n()
  const { showNotification } = useNotification()
  const [value, setValue] = React.useState('')
  const [menuAnchorEl, setMenuAnchorEl] = React.useState(null)
  const [multiModeEnabled, setMultiModeEnabled] = React.useState(false)
  const [confirmDisableMultiOpen, setConfirmDisableMultiOpen] = React.useState(false)
  const [autoDownloadEnabled, setAutoDownloadEnabled] = React.useState(() => readHomeAutoDownloadPrefs().enabled)
  const [autoDownloadFormat, setAutoDownloadFormat] = React.useState(() => readHomeAutoDownloadPrefs().format)
  const [isResolving, setIsResolving] = React.useState(false)
  const [fetchError, setFetchError] = React.useState(null)

  const quickActionsOpen = Boolean(menuAnchorEl)
  const hasMultiInput = React.useMemo(
    () => String(value || '').replace(/\r/g, '').split('\n').some((line) => Boolean(line.trim())),
    [value]
  )
  const multiInputRows = React.useMemo(() => {
    if (!multiModeEnabled) return 1

    const lines = String(value || '').replace(/\r/g, '').split('\n')
    let lastFilledIndex = -1
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].trim()) lastFilledIndex = i
    }

    return Math.max(3, Math.min(5, lastFilledIndex + 2))
  }, [multiModeEnabled, value])
  const inputHeightEstimate = multiModeEnabled
    ? (136 + Math.max(0, multiInputRows - 3) * 24)
    : 56

  const resolveAndOpenDownloader = React.useCallback(async (rawUrl) => {
    const target = String(rawUrl || '').trim()
    const serviceKey = detectService(target)
    if (!serviceKey || !target || isResolving) return

    setFetchError(null)
    setIsResolving(true)
    try {
      const noembedP = fetchNoembed(target).catch(() => ({}))
      const durationP = fetchDuration(target).catch(() => ({ duration: null, durationString: null }))
      const [noembed, duration, formats] = await Promise.all([noembedP, durationP, fetchFormats(target)])

      try {
        sessionStorage.setItem(HOME_PREFETCH_CACHE_KEY, JSON.stringify({
          type: 'success',
          url: target,
          service: serviceKey,
          noembed,
          duration,
          formats,
          createdAt: Date.now(),
        }))
      } catch {
        // ignore sessionStorage write errors
      }

      onOpenDownloader?.(serviceKey, target, { prefetched: true })
    } catch (error) {
      const message = error?.message || String(error || '')
      setFetchError({
        url: target,
        message,
      })
    } finally {
      setIsResolving(false)
    }
  }, [isResolving, onOpenDownloader])

  const openQuickActions = React.useCallback((event) => {
    setMenuAnchorEl(event.currentTarget)
  }, [])

  const closeQuickActions = React.useCallback(() => {
    setMenuAnchorEl(null)
  }, [])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(HOME_AUTO_PREFS_KEY, JSON.stringify({
        enabled: autoDownloadEnabled,
        format: autoDownloadFormat === 'mp3' ? 'mp3' : 'mp4',
      }))
    } catch {
      // ignore local persistence errors
    }
  }, [autoDownloadEnabled, autoDownloadFormat])

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const onStorage = (event) => {
      if (event.key !== HOME_AUTO_PREFS_KEY) return
      const next = readHomeAutoDownloadPrefs()
      setAutoDownloadEnabled(next.enabled)
      setAutoDownloadFormat(next.format)
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const disableMultiModeNow = React.useCallback(() => {
    setConfirmDisableMultiOpen(false)
    setMultiModeEnabled(false)
    setValue('')
    setFetchError(null)
    setMenuAnchorEl(null)
  }, [])

  const requestToggleMultiMode = React.useCallback((nextEnabled) => {
    if (isResolving) return

    if (!nextEnabled) {
      if (!multiModeEnabled) return
      if (!hasMultiInput) {
        disableMultiModeNow()
        return
      }
      setConfirmDisableMultiOpen(true)
      setMenuAnchorEl(null)
      return
    }

    if (autoDownloadEnabled) setAutoDownloadEnabled(false)
    setMultiModeEnabled(true)
    setMenuAnchorEl(null)
  }, [autoDownloadEnabled, disableMultiModeNow, hasMultiInput, isResolving, multiModeEnabled])

  const confirmDisableMultiMode = React.useCallback(() => {
    disableMultiModeNow()
  }, [disableMultiModeNow])

  const fetchAutoDownloadSettingsFromServer = React.useCallback(async () => {
    const API_BASE = getApiBase()
    try {
      const resp = await fetch(`${API_BASE}/api/auto-download/settings`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      return normalizeAutoDownloadSettings(data)
    } catch {
      return { ...AUTO_DOWNLOAD_SETTINGS_DEFAULTS }
    }
  }, [])

  const startAutoDownload = React.useCallback(async (rawUrl) => {
    const target = String(rawUrl || '').trim()
    const serviceKey = detectService(target)
    if (!autoDownloadEnabled || !serviceKey || !target || multiModeEnabled || isResolving) return

    setFetchError(null)
    setIsResolving(true)

    const API_BASE = getApiBase()
    let didStart = false

    const markStarted = () => {
      if (didStart) return
      didStart = true
      setValue('')
      setIsResolving(false)
    }

    const resolveSseErrorMessage = (value) => {
      try {
        const parsed = JSON.parse(value)
        return parsed?.error || parsed?.message || String(value || '')
      } catch {
        return String(value || '')
      }
    }

    try {
      const normalized = normalizeUrlForNoembed(target)
      const [autoSettings, formatsData, noembedData, durationData] = await Promise.all([
        fetchAutoDownloadSettingsFromServer(),
        fetchFormats(normalized).catch(() => ({ audioFormats: [], videoFormats: [] })),
        fetchNoembed(normalized).catch(() => ({})),
        fetchDuration(normalized).catch(() => ({ duration: null, durationString: null })),
      ])

      const isAudio = autoDownloadFormat === 'mp3'
      const payload = {
        url: normalized,
        service: serviceKey || 'other',
        type: isAudio ? 'audio' : 'video',
        duration: durationData?.duration ?? null,
        videoTitle: String(noembedData?.title || '').trim() || target,
        format: isAudio ? 'mp3' : 'mp4',
        audioFormat: isAudio
          ? pickAudioFormatByMaxBitrate(formatsData?.audioFormats, autoSettings.maxAudioBitrateKbps)
          : undefined,
        videoFormat: !isAudio
          ? pickVideoFormatByMaxHeight(formatsData?.videoFormats, autoSettings.maxVideoHeight)
          : undefined,
        metadata: isAudio && autoSettings.useMetadata
          ? {
              title: String(noembedData?.title || '').trim(),
              artist: String(noembedData?.author_name || '').trim(),
              album: '',
            }
          : undefined,
        cover: isAudio
          ? {
              enabled: Boolean(autoSettings.embedCoverArt),
              source: 'video',
            }
          : undefined,
      }

      const response = await fetch(`${API_BASE}/api/download/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let message = `HTTP ${response.status}`
        try {
          const body = await response.json()
          message = body?.error || body?.details || message
        } catch {
          // keep fallback message
        }
        throw new Error(message)
      }

      if (!response.body) {
        throw new Error(t('downloader.errorDownloadFailed'))
      }

      const processEvent = (eventName, rawData) => {
        const dataStr = String(rawData || '')

        if (eventName === 'info' || eventName === 'message' || eventName === 'progress') {
          markStarted()
          return
        }

        if (eventName === 'error') {
          const msg = resolveSseErrorMessage(dataStr) || t('downloader.errorDownloadFailed')
          if (!didStart) setIsResolving(false)
          setFetchError({ url: target, message: msg })
          showNotification(msg, 'error')
          return
        }

        if (eventName === 'complete') {
          markStarted()
          try {
            const data = JSON.parse(dataStr)
            if (!data?.filename || !data?.url) return
            const a = document.createElement('a')
            a.href = `${API_BASE}${data.url}`
            a.download = data.filename
            document.body.appendChild(a)
            a.click()
            a.remove()
          } catch {
            // ignore malformed complete payload
          }
        }
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const flushEvents = (force = false) => {
        let delimiterIndex = buffer.indexOf('\n\n')
        while (delimiterIndex !== -1) {
          const block = buffer.slice(0, delimiterIndex)
          buffer = buffer.slice(delimiterIndex + 2)

          if (block.trim()) {
            let eventName = 'message'
            const dataLines = []
            for (const rawLine of block.split('\n')) {
              const line = rawLine.replace(/\r$/, '')
              if (!line || line.startsWith(':')) continue
              if (line.startsWith('event:')) {
                eventName = line.slice(6).trim() || 'message'
                continue
              }
              if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trimStart())
              }
            }
            processEvent(eventName, dataLines.join('\n'))
          }

          delimiterIndex = buffer.indexOf('\n\n')
        }

        if (force && buffer.trim()) {
          let eventName = 'message'
          const dataLines = []
          for (const rawLine of buffer.split('\n')) {
            const line = rawLine.replace(/\r$/, '')
            if (!line || line.startsWith(':')) continue
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim() || 'message'
              continue
            }
            if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).trimStart())
            }
          }
          processEvent(eventName, dataLines.join('\n'))
          buffer = ''
        }
      }

      while (true) {
        const { done, value: chunk } = await reader.read()
        if (done) {
          flushEvents(true)
          break
        }

        buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n')
        flushEvents(false)
      }
    } catch (error) {
      const message = error?.message || String(error || '')
      if (!didStart) setIsResolving(false)
      setFetchError({
        url: target,
        message,
      })
      showNotification(message, 'error')
    } finally {
      if (!didStart) setIsResolving(false)
    }
  }, [
    autoDownloadEnabled,
    autoDownloadFormat,
    fetchAutoDownloadSettingsFromServer,
    isResolving,
    multiModeEnabled,
    showNotification,
    t,
  ])

  const handleToggleAutoDownload = React.useCallback((nextEnabled) => {
    if (isResolving) return
    if (nextEnabled && multiModeEnabled) {
      disableMultiModeNow()
    }
    setAutoDownloadEnabled(nextEnabled)
  }, [disableMultiModeNow, isResolving, multiModeEnabled])

  const handleSubmit = React.useCallback(() => {
    if (multiModeEnabled || isResolving) return

    if (autoDownloadEnabled) {
      startAutoDownload(value)
      return
    }

    const serviceKey = detectService(value)
    if (serviceKey) resolveAndOpenDownloader(value)
  }, [
    autoDownloadEnabled,
    isResolving,
    multiModeEnabled,
    resolveAndOpenDownloader,
    startAutoDownload,
    value,
  ])

  const closeFetchError = React.useCallback(() => {
    setFetchError(null)
  }, [])

  const retryFetchError = React.useCallback(() => {
    const url = String(fetchError?.url || '').trim()
    if (!url || isResolving) return
    setFetchError(null)
    if (autoDownloadEnabled) {
      startAutoDownload(url)
      return
    }
    resolveAndOpenDownloader(url)
  }, [autoDownloadEnabled, fetchError?.url, isResolving, resolveAndOpenDownloader, startAutoDownload])

  const quickActionsMenu = (
    <Menu
      anchorEl={menuAnchorEl}
      open={quickActionsOpen}
      onClose={closeQuickActions}
      transformOrigin={{ horizontal: 'left', vertical: 'top' }}
      anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
      slotProps={{
        paper: {
          sx: (theme) => ({
            mt: 1,
            width: 300,
            borderRadius: '16px',
            overflow: 'hidden',
            border: `1px solid ${theme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0'}`,
            bgcolor: theme.palette.mode === 'dark' ? '#303030' : '#f9f9f9',
            boxShadow: theme.palette.mode === 'dark'
              ? '0 14px 32px rgba(0,0,0,0.45)'
              : '0 14px 30px rgba(0,0,0,0.16)',
          }),
        },
        list: {
          sx: {
            p: 1.5,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.9,
          },
        },
      }}
    >
      <MenuItem
        onClick={() => requestToggleMultiMode(!multiModeEnabled)}
        disabled={isResolving || autoDownloadEnabled}
        sx={{
          py: 1.05,
          px: 1.25,
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 42,
          opacity: autoDownloadEnabled ? 0.52 : 1,
        }}
      >
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.15 }}>
          <List
            size={16}
            color={multiModeEnabled ? '#df2f2f' : undefined}
          />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t('home.quickActions.multiDownload')}
          </Typography>
        </Box>
        <Switch
          size="small"
          checked={multiModeEnabled}
          disabled={isResolving || autoDownloadEnabled}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => requestToggleMultiMode(event.target.checked)}
          inputProps={{ 'aria-label': t('home.quickActions.multiDownloadSwitchAria') }}
        />
      </MenuItem>

      <Divider sx={(theme) => ({ borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' })} />

      <MenuItem
        onClick={() => handleToggleAutoDownload(!autoDownloadEnabled)}
        disabled={isResolving}
        sx={{
          py: 1.05,
          px: 1.25,
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 42,
        }}
      >
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.15 }}>
          <Zap size={16} />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t('home.quickActions.autoDownload')}
          </Typography>
        </Box>
        <Switch
          size="small"
          checked={autoDownloadEnabled}
          disabled={isResolving}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => handleToggleAutoDownload(event.target.checked)}
          inputProps={{ 'aria-label': t('home.quickActions.autoDownloadSwitchAria') }}
        />
      </MenuItem>

      {autoDownloadEnabled && !multiModeEnabled && (
        <Box sx={{ mt: -0.15 }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              variant={autoDownloadFormat === 'mp4' ? 'contained' : 'outlined'}
              onClick={() => setAutoDownloadFormat('mp4')}
              sx={(theme) => ({
                flex: 1,
                minWidth: 0,
                borderRadius: 1.5,
                textTransform: 'none',
                fontWeight: 700,
                cursor: 'pointer',
                ...(autoDownloadFormat === 'mp4'
                  ? {
                      bgcolor: theme.palette.mode === 'dark' ? '#f3f4f6' : '#111827',
                      color: theme.palette.mode === 'dark' ? '#111827' : '#f9fafb',
                      '&:hover': {
                        bgcolor: theme.palette.mode === 'dark' ? '#e5e7eb' : '#1f2937',
                      },
                    }
                  : {
                      borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.26)' : 'rgba(0,0,0,0.2)',
                      color: theme.palette.mode === 'dark' ? '#e5e7eb' : '#374151',
                    }),
              })}
            >
              {t('home.quickActions.formatMp4')}
            </Button>
            <Button
              size="small"
              variant={autoDownloadFormat === 'mp3' ? 'contained' : 'outlined'}
              onClick={() => setAutoDownloadFormat('mp3')}
              sx={(theme) => ({
                flex: 1,
                minWidth: 0,
                borderRadius: 1.5,
                textTransform: 'none',
                fontWeight: 700,
                cursor: 'pointer',
                ...(autoDownloadFormat === 'mp3'
                  ? {
                      bgcolor: theme.palette.mode === 'dark' ? '#f3f4f6' : '#111827',
                      color: theme.palette.mode === 'dark' ? '#111827' : '#f9fafb',
                      '&:hover': {
                        bgcolor: theme.palette.mode === 'dark' ? '#e5e7eb' : '#1f2937',
                      },
                    }
                  : {
                      borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.26)' : 'rgba(0,0,0,0.2)',
                      color: theme.palette.mode === 'dark' ? '#e5e7eb' : '#374151',
                    }),
              })}
            >
              {t('home.quickActions.formatMp3')}
            </Button>
          </Box>

          <Button
            fullWidth
            size="small"
            variant="text"
            endIcon={<ChevronRight size={14} />}
            onClick={() => {
              closeQuickActions()
              openSettingsModal('auto-download')
            }}
            sx={{
              mt: 0.55,
              justifyContent: 'space-between',
              textTransform: 'none',
              borderRadius: 1.5,
              color: 'text.secondary',
              fontWeight: 600,
            }}
          >
            {t('home.quickActions.moreSettings')}
          </Button>
        </Box>
      )}
    </Menu>
  )

  const quickActionsTrigger = multiModeEnabled ? (
    <Box
      sx={(theme) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.35,
        height: 32,
        px: 0.85,
        borderRadius: 1.5,
        border: `1px solid ${theme.palette.mode === 'dark' ? '#535353' : '#d2d4d8'}`,
        bgcolor: theme.palette.mode === 'dark' ? '#3a3a3a' : '#f1f2f4',
        color: theme.palette.mode === 'dark' ? '#f2f3f5' : '#1f2937',
      })}
    >
      <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: 0.1, lineHeight: 1 }}>
        {t('home.quickActions.multiDownload')}
      </Typography>
      <IconButton
        size="small"
        onClick={() => requestToggleMultiMode(false)}
        aria-label={t('home.quickActions.multiDisableWarningTitle')}
        sx={(theme) => ({
          width: 20,
          height: 20,
          color: 'inherit',
          '&:hover': {
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)',
          },
        })}
      >
        <X size={12} />
      </IconButton>
    </Box>
  ) : (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
      }}
    >
      <Tooltip title={autoDownloadEnabled ? t('home.quickActions.autoDownloadActiveTooltip') : ''}>
        <Box component="span" sx={{ display: 'inline-flex' }}>
          <IconButton
            size="small"
            aria-label={t('home.quickActions.openAria')}
            onClick={openQuickActions}
            disabled={isResolving}
            sx={(theme) => ({
              width: 36,
              height: 36,
              p: 0,
              borderRadius: '50%',
              color: isResolving
                ? theme.palette.text.disabled
                : (quickActionsOpen ? theme.palette.text.primary : theme.palette.text.secondary),
              bgcolor: quickActionsOpen
                ? (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)')
                : 'transparent',
              opacity: 1,
              cursor: isResolving ? 'default' : 'pointer',
              '&:hover': {
                bgcolor: isResolving
                  ? 'transparent'
                  : (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'),
                opacity: 1,
              },
              '&.Mui-disabled': {
                opacity: 1,
                color: theme.palette.text.disabled,
              },
            })}
          >
            {autoDownloadEnabled ? <Zap size={18} /> : <Plus size={20} />}
          </IconButton>
        </Box>
      </Tooltip>
      {quickActionsMenu}
    </Box>
  )

  return (
    <Box sx={{ position: 'relative', height: '100%' }}>
      <Box sx={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '100%', maxWidth: 780, px: 2 }}>
        {multiModeEnabled ? (
          <Box
            sx={(muiTheme) => ({
              borderRadius: '12px',
              overflow: 'hidden',
              border: `1px solid ${muiTheme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0'}`,
              bgcolor: muiTheme.palette.mode === 'dark' ? '#303030' : '#f9f9f9',
              boxShadow: muiTheme.palette.mode === 'dark' ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
            })}
          >
            <TextField
              placeholder={t('placeholders.genericUrl')}
              variant="standard"
              fullWidth
              multiline
              autoFocus
              minRows={multiInputRows}
              maxRows={5}
              value={value}
              onChange={(e) => {
                if (fetchError) setFetchError(null)
                setValue(e.target.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
              InputProps={{
                disableUnderline: true,
                sx: (muiTheme) => ({
                  alignItems: 'flex-start',
                  px: 1.6,
                  pt: 1.35,
                  pb: 0.85,
                  '& textarea': {
                    color: muiTheme.palette.text.primary,
                    fontWeight: 700,
                    lineHeight: 1.45,
                    padding: 0,
                    resize: 'none',
                    overflowY: 'auto !important',
                    scrollbarWidth: 'thin',
                  },
                  '& textarea::placeholder': {
                    color: muiTheme.palette.text.secondary,
                    fontWeight: 700,
                    opacity: 1,
                  },
                }),
              }}
              disabled={isResolving}
              inputProps={{ 'aria-label': t('app.urlInputAria', { service: t('routes.downloader') }) }}
            />

            <Box
              sx={(muiTheme) => ({
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 1,
                py: 0.8,
                borderTop: `1px solid ${muiTheme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0'}`,
              })}
            >
              {quickActionsTrigger}

              {isResolving ? (
                <IconButton
                  size="small"
                  disableRipple
                  disabled
                  aria-label={t('app.loadingAria')}
                  sx={(muiTheme) => ({
                    width: 36,
                    height: 36,
                    bgcolor: muiTheme.palette.mode === 'dark' ? '#ffffff' : '#000000',
                    color: muiTheme.palette.mode === 'dark' ? '#000000' : '#ffffff',
                    borderRadius: '50%',
                    boxShadow: muiTheme.palette.mode === 'dark'
                      ? '0 2px 6px rgba(0,0,0,0.4)'
                      : '0 2px 6px rgba(0,0,0,0.25)',
                    opacity: 1,
                    '&.Mui-disabled': {
                      opacity: 1,
                      color: muiTheme.palette.mode === 'dark' ? '#000000' : '#ffffff',
                      bgcolor: muiTheme.palette.mode === 'dark' ? '#ffffff' : '#000000',
                    },
                  })}
                >
                  <CircularProgress
                    size={18}
                    thickness={4}
                    sx={{ color: (muiTheme) => (muiTheme.palette.mode === 'dark' ? '#000000' : '#ffffff') }}
                  />
                </IconButton>
              ) : (
                <IconButton
                  size="small"
                  aria-label={t('app.startDownloadAria')}
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
              )}
            </Box>
          </Box>
        ) : (
          <TextField
            placeholder={t('placeholders.genericUrl')}
            variant="outlined"
            fullWidth
            size="medium"
            autoFocus
            value={value}
            onChange={(e) => {
              if (fetchError) setFetchError(null)
              setValue(e.target.value)
            }}
            onFocus={(e) => e.target.select()}
            onClick={(e) => e.target.select()}
            onMouseUp={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSubmit()
              }
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start" sx={{ mr: 0.25, ml: 0 }}>
                  {quickActionsTrigger}
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  {isResolving ? (
                    <IconButton
                      size="small"
                      edge="end"
                      disableRipple
                      disabled
                      aria-label={t('app.loadingAria')}
                      sx={(muiTheme) => ({
                        width: 36,
                        height: 36,
                        bgcolor: muiTheme.palette.mode === 'dark' ? '#ffffff' : '#000000',
                        color: muiTheme.palette.mode === 'dark' ? '#000000' : '#ffffff',
                        borderRadius: '50%',
                        boxShadow: muiTheme.palette.mode === 'dark'
                          ? '0 2px 6px rgba(0,0,0,0.4)'
                          : '0 2px 6px rgba(0,0,0,0.25)',
                        opacity: 1,
                        '&.Mui-disabled': {
                          opacity: 1,
                          color: muiTheme.palette.mode === 'dark' ? '#000000' : '#ffffff',
                          bgcolor: muiTheme.palette.mode === 'dark' ? '#ffffff' : '#000000',
                        },
                      })}
                    >
                      <CircularProgress
                        size={18}
                        thickness={4}
                        sx={{ color: (muiTheme) => (muiTheme.palette.mode === 'dark' ? '#000000' : '#ffffff') }}
                      />
                    </IconButton>
                  ) : (
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
                  )}
                </InputAdornment>
              ),
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text')
              if (!pasted) return

              e.preventDefault()

              const input = e.currentTarget
              const start = Number.isFinite(input.selectionStart) ? input.selectionStart : value.length
              const end = Number.isFinite(input.selectionEnd) ? input.selectionEnd : value.length
              const nextValue = `${value.slice(0, start)}${pasted}${value.slice(end)}`

              if (fetchError) setFetchError(null)
              setValue(nextValue)

              const serviceKey = detectService(nextValue)
              if (serviceKey) {
                if (autoDownloadEnabled) {
                  setTimeout(() => startAutoDownload(nextValue), 0)
                } else {
                  setTimeout(() => resolveAndOpenDownloader(nextValue), 0)
                }
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
                '&.Mui-disabled fieldset': {
                  borderColor: muiTheme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0',
                  borderWidth: '1px !important',
                },
                boxShadow: muiTheme.palette.mode === 'dark' ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
              },
              '& .MuiOutlinedInput-input': {
                paddingLeft: '8px',
                paddingRight: '16px',
                color: muiTheme.palette.text.primary,
                fontWeight: 700,
                outline: 'none',
              },
              '& .MuiOutlinedInput-input::placeholder': {
                color: muiTheme.palette.text.secondary,
                fontWeight: 700,
              },
            })}
            disabled={isResolving}
            inputProps={{ 'aria-label': t('app.urlInputAria', { service: t('routes.downloader') }) }}
          />
        )}
      </Box>

      <Stack spacing={0} sx={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: `calc(50% + ${Math.round(inputHeightEstimate / 2)}px + 16px)`, width: '100%', maxWidth: 780, px: 2 }}>
        <Typography variant="h1" component="h1" align="center" className="youtube-title" sx={{ fontSize: { xs: '3.5rem', sm: '5rem', md: '6rem' } }}>
          <span style={{ color: '#df2f2f' }}>y</span>Loader
        </Typography>
        <Typography variant="h4" align="center" sx={{ color: 'text.secondary', fontWeight: 700, mt: 0.5, fontSize: { xs: '1.25rem', sm: '1.5rem', md: '1.75rem' } }}>
          {t('app.subtitle')}
        </Typography>
      </Stack>

      <Dialog open={confirmDisableMultiOpen} onClose={() => setConfirmDisableMultiOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('home.quickActions.multiDisableWarningTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('home.quickActions.multiDisableWarningBody')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDisableMultiOpen(false)}>{t('tabs.cancel')}</Button>
          <Button variant="contained" color="error" onClick={confirmDisableMultiMode}>
            {t('home.quickActions.multiDisableWarningConfirm')}
          </Button>
        </DialogActions>
      </Dialog>

      {fetchError && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            px: 2,
            zIndex: 4,
            pointerEvents: 'none',
          }}
        >
          <Box sx={{ width: '100%', maxWidth: 450, pointerEvents: 'auto' }}>
            <Paper elevation={0} sx={(muiTheme) => ({
              width: '100%',
              borderRadius: 2,
              border: 'none',
              overflow: 'hidden',
              bgcolor: muiTheme.palette.mode === 'dark' ? '#181818' : '#ffffff',
              boxShadow: muiTheme.palette.mode === 'dark' ? '0 8px 16px rgba(0, 0, 0, 0.2)' : '0 4px 24px rgba(0, 0, 0, 0.06)',
            })}>
              <Box sx={(muiTheme) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 2,
                py: 1.5,
                borderBottom: `1px solid ${muiTheme.palette.mode === 'dark' ? '#2a2a2a' : '#f0f0f0'}`,
              })}>
                <AlertTriangle size={18} style={{ color: '#e8a420', flexShrink: 0 }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1 }}>
                  {t('fetchError.title')}
                </Typography>
                <IconButton
                  size="small"
                  aria-label={t('fetchError.closeAria')}
                  onClick={closeFetchError}
                  sx={{ cursor: 'pointer' }}
                >
                  <X size={16} />
                </IconButton>
              </Box>

              <Box
                sx={(muiTheme) => ({
                  maxHeight: 160,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  bgcolor: muiTheme.palette.mode === 'dark' ? '#111' : '#f5f5f5',
                })}
              >
                <Typography variant="body2" sx={(muiTheme) => ({
                  display: 'block',
                  pl: 2,
                  pr: 1.5,
                  py: 1.5,
                  color: muiTheme.palette.text.secondary,
                  wordBreak: 'break-word',
                  fontFamily: 'monospace',
                  fontSize: '0.78rem',
                  lineHeight: 1.6,
                })}>
                  {extractYtDlpError(fetchError.message)}
                </Typography>
              </Box>

              <Box sx={{ px: 2, pb: 2 }}>
                <Button
                  fullWidth
                  variant="contained"
                  disableElevation
                  onClick={retryFetchError}
                  disabled={isResolving}
                  sx={(muiTheme) => ({
                    borderRadius: 9999,
                    fontWeight: 700,
                    textTransform: 'none',
                    bgcolor: muiTheme.palette.mode === 'dark' ? '#ffffff' : '#000000',
                    color: muiTheme.palette.mode === 'dark' ? '#000000' : '#ffffff',
                    '&:hover': {
                      bgcolor: muiTheme.palette.mode === 'dark' ? '#f0f0f0' : '#111111',
                    },
                    cursor: isResolving ? 'default' : 'pointer',
                  })}
                >
                  {t('fetchError.retry')}
                </Button>
              </Box>
            </Paper>
          </Box>
        </Box>
      )}
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
    const normalizedSearch = normalizeTabSearch(tab.search)

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

    if (normalizedPath === '/' && hasUrlInSearch(normalizedSearch)) {
      const serviceKey = getServiceForPath(normalizedPath, tab.search) || 'generic'
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
      <HomePage onOpenDownloader={(serviceKey, rawUrl, options) => openDownloaderInTab(tab.id, serviceKey, rawUrl, options)} />
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
        activeSearch={activeTab?.search || ''}
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
