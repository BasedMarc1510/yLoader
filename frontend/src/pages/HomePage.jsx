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
import { detectService, fetchDuration, fetchFormats, fetchNoembed, getApiBase, normalizeUrlForNoembed } from '../utils/metadata'
import { useI18n } from '../providers/I18nProvider'
import { useNotification } from '../providers/NotificationProvider'

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

function extractYtDlpError(msg) {
  if (!msg) return ''
  const lines = String(msg).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const errorLine = lines.find((line) => line.startsWith('ERROR:'))
  const raw = errorLine ? errorLine.replace(/^ERROR:\s*/, '') : (lines[0] || msg)
  return raw.replace(/\ufffd/g, '\u2019')
}

export default function HomePage({ onOpenDownloader }) {
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
  const [autoDownloadInFlight, setAutoDownloadInFlight] = React.useState(false)
  const [autoDownloadProgress, setAutoDownloadProgress] = React.useState(0)
  const [autoDownloadProgressKnown, setAutoDownloadProgressKnown] = React.useState(false)

  const quickActionsOpen = Boolean(menuAnchorEl)
  const showAutoDownloadProgress = autoDownloadInFlight
  const normalizedAutoDownloadProgress = Math.max(0, Math.min(100, Math.round(autoDownloadProgress || 0)))
  const inputBorderRunnerAnimation = 'input-border-runner 3.4s ease-in-out infinite'
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
    setAutoDownloadInFlight(true)
    setAutoDownloadProgress(0)
    setAutoDownloadProgressKnown(false)

    const API_BASE = getApiBase()
    let inputCleared = false
    let completed = false
    let ended = false
    let failed = false
    let explicitErrorMessage = ''

    const resolveSseErrorMessage = (value) => {
      try {
        const parsed = JSON.parse(value)
        return parsed?.error || parsed?.message || String(value || '')
      } catch {
        return String(value || '')
      }
    }

    const applyProgress = (rawPercent) => {
      const nextPercent = Number(rawPercent)
      if (!Number.isFinite(nextPercent)) return false
      const clampedPercent = Math.max(0, Math.min(100, nextPercent))
      setAutoDownloadProgress((prev) => Math.max(prev, clampedPercent))
      setAutoDownloadProgressKnown(true)
      if (!inputCleared) {
        inputCleared = true
        setValue('')
      }
      return true
    }

    const extractPercent = (input) => {
      if (input == null) return null

      if (typeof input === 'object') {
        const objectPercent = Number(input.percent ?? input.progress ?? input.percentage)
        return Number.isFinite(objectPercent) ? objectPercent : null
      }

      const text = String(input || '').trim()
      if (!text) return null

      try {
        const parsed = JSON.parse(text)
        const jsonPercent = Number(parsed?.percent ?? parsed?.progress ?? parsed?.percentage)
        if (Number.isFinite(jsonPercent)) return jsonPercent
      } catch {
        // continue with text parsing
      }

      const downloadMatches = Array.from(text.matchAll(/\[download\][^\r\n]*?(\d+(?:[\.,]\d+)?)%/gi))
      if (downloadMatches.length) {
        let maxDownloadPercent = null
        for (const match of downloadMatches) {
          const parsed = Number.parseFloat(String(match[1] || '').replace(',', '.'))
          if (!Number.isFinite(parsed)) continue
          maxDownloadPercent = maxDownloadPercent == null ? parsed : Math.max(maxDownloadPercent, parsed)
        }
        if (maxDownloadPercent != null) return maxDownloadPercent
      }

      const genericMatches = Array.from(text.matchAll(/(?:download|downloading)[^\r\n%]*?(\d+(?:[\.,]\d+)?)%/gi))
      if (genericMatches.length) {
        let maxGenericPercent = null
        for (const match of genericMatches) {
          const parsed = Number.parseFloat(String(match[1] || '').replace(',', '.'))
          if (!Number.isFinite(parsed)) continue
          maxGenericPercent = maxGenericPercent == null ? parsed : Math.max(maxGenericPercent, parsed)
        }
        if (maxGenericPercent != null) return maxGenericPercent
      }

      return null
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

        if (eventName === 'progress') {
          applyProgress(extractPercent(dataStr))
          return
        }

        if (eventName === 'info' || eventName === 'message') {
          applyProgress(extractPercent(dataStr))
          return
        }

        if (eventName === 'error') {
          const msg = resolveSseErrorMessage(dataStr) || t('downloader.errorDownloadFailed')
          failed = true
          explicitErrorMessage = msg
          setFetchError({ url: target, message: msg })
          showNotification(msg, 'error')
          return
        }

        if (eventName === 'complete') {
          completed = true
          setAutoDownloadProgressKnown(true)
          setAutoDownloadProgress(100)
          if (!inputCleared) {
            inputCleared = true
            setValue('')
          }
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
          return
        }

        if (eventName === 'end') {
          ended = true
          if (dataStr.trim() === 'failed') {
            failed = true
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
      explicitErrorMessage = message
      setFetchError({
        url: target,
        message,
      })
      showNotification(message, 'error')
    } finally {
      if (!completed && !explicitErrorMessage && (failed || !ended)) {
        setFetchError({ url: target, message: t('downloader.errorDownloadFailed') })
      }
      setAutoDownloadInFlight(false)
      setAutoDownloadProgress(0)
      setAutoDownloadProgressKnown(false)
      setIsResolving(false)
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
              position: 'relative',
              borderRadius: '12px',
              overflow: 'hidden',
              border: `1px solid ${muiTheme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0'}`,
              bgcolor: muiTheme.palette.mode === 'dark' ? '#303030' : '#f9f9f9',
              boxShadow: muiTheme.palette.mode === 'dark' ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
              ...(showAutoDownloadProgress
                ? {
                    '&::after': {
                      content: '""',
                      position: 'absolute',
                      inset: '-1px',
                      padding: '1px',
                      borderRadius: 'inherit',
                      background: muiTheme.palette.mode === 'dark'
                        ? 'linear-gradient(110deg, transparent 24%, rgba(255,255,255,0.52) 37%, transparent 52%, transparent 100%)'
                        : 'linear-gradient(110deg, transparent 24%, rgba(17,17,17,0.38) 37%, transparent 52%, transparent 100%)',
                      WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                      WebkitMaskComposite: 'xor',
                      maskComposite: 'exclude',
                      backgroundSize: '320% 100%',
                      animation: inputBorderRunnerAnimation,
                      pointerEvents: 'none',
                      zIndex: 2,
                    },
                  }
                : {}),
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

              {showAutoDownloadProgress ? (
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
                    variant={autoDownloadProgressKnown ? 'determinate' : 'indeterminate'}
                    value={autoDownloadProgressKnown ? normalizedAutoDownloadProgress : undefined}
                    sx={{ color: (muiTheme) => (muiTheme.palette.mode === 'dark' ? '#000000' : '#ffffff') }}
                  />
                </IconButton>
              ) : isResolving ? (
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
                  {showAutoDownloadProgress ? (
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
                        variant={autoDownloadProgressKnown ? 'determinate' : 'indeterminate'}
                        value={autoDownloadProgressKnown ? normalizedAutoDownloadProgress : undefined}
                        sx={{ color: (muiTheme) => (muiTheme.palette.mode === 'dark' ? '#000000' : '#ffffff') }}
                      />
                    </IconButton>
                  ) : isResolving ? (
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
                position: 'relative',
                borderRadius: 9999,
                backgroundColor: muiTheme.palette.mode === 'dark' ? '#303030' : '#f9f9f9',
                outline: 'none',
                '&:focus-within': {
                  outline: 'none',
                  boxShadow: 'none',
                },
                '& fieldset': {
                  borderColor: showAutoDownloadProgress ? 'transparent' : (muiTheme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0'),
                  borderWidth: '1px !important',
                },
                '&:hover fieldset': {
                  borderColor: showAutoDownloadProgress ? 'transparent' : (muiTheme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0'),
                },
                '&.Mui-focused fieldset': {
                  borderColor: showAutoDownloadProgress ? 'transparent' : (muiTheme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0'),
                  borderWidth: '1px !important',
                },
                '&.Mui-disabled fieldset': {
                  borderColor: showAutoDownloadProgress ? 'transparent' : (muiTheme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0'),
                  borderWidth: '1px !important',
                },
                ...(showAutoDownloadProgress
                  ? {
                      '&::after': {
                        content: '""',
                        position: 'absolute',
                        inset: 0,
                        borderRadius: 9999,
                        padding: '1px',
                        background: muiTheme.palette.mode === 'dark'
                          ? 'linear-gradient(110deg, transparent 24%, rgba(255,255,255,0.52) 37%, transparent 52%, transparent 100%)'
                          : 'linear-gradient(110deg, transparent 24%, rgba(17,17,17,0.38) 37%, transparent 52%, transparent 100%)',
                        backgroundSize: '320% 100%',
                        animation: inputBorderRunnerAnimation,
                        WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                        WebkitMaskComposite: 'xor',
                        maskComposite: 'exclude',
                        pointerEvents: 'none',
                      },
                    }
                  : {}),
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
