import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Dialog, DialogContent, IconButton, List, ListItem, ListItemButton, Typography, Tooltip, Button } from '@mui/material'
import { X, Settings as SettingsIcon, Download as DownloadIcon, Zap as ZapIcon, Video as VideoIcon, Cpu as CpuIcon } from 'lucide-react'
import { ColorModeContext } from '../providers/ColorModeProvider'
import { SettingsContext } from '../providers/SettingsProvider'
import { useI18n } from '../providers/I18nProvider'
import { getApiBase } from '../utils/metadata'
import GeneralSettingsSection from './settings-modal/GeneralSettingsSection'
import AutoDownloadSettingsSection from './settings-modal/AutoDownloadSettingsSection'
import YtDlpSettingsSection from './settings-modal/YtDlpSettingsSection'
import FfmpegSettingsSection from './settings-modal/FfmpegSettingsSection'
import DownloaderSettingsSection from './settings-modal/DownloaderSettingsSection'
import {
  AUTO_DOWNLOAD_DEFAULTS,
  normalizeAutoDownloadSettings,
} from './settings-modal/autoDownloadUtils'
import {
  DOWNLOAD_SETTINGS_DEFAULTS,
  normalizeDownloadSettings,
} from '../utils/downloadSettings'
import {
  YT_DLP_COOKIE_SETTINGS_DEFAULTS,
  normalizeYtDlpCookieSettings,
} from '../utils/ytDlpCookieSettings'

async function parseApiError(response) {
  let message = `HTTP ${response?.status || 500}`
  try {
    const payload = await response.json()
    message = String(payload?.error || payload?.details || message)
  } catch {
    // keep default fallback message
  }
  return message
}

export default function SettingsModal({
  open,
  onClose,
  requestedSection = 'general',
  requestedFocusTarget = '',
  requestedFocusRequestId = '',
  onToolUpdateSummaryChange,
  appUpdateState,
  isElectronUpdaterAvailable = false,
  checkForAppUpdates,
  downloadAppUpdate,
  installAppUpdate,
}) {
  const { t } = useI18n()
  const { mode, setPreference } = useContext(ColorModeContext)
  const { language, setLanguage } = useContext(SettingsContext)
  const [section, setSection] = useState(() => String(requestedSection || 'general'))
  const [sectionFocusTarget, setSectionFocusTarget] = useState(() => String(requestedFocusTarget || '').trim())
  const [sectionFocusRequestId, setSectionFocusRequestId] = useState(() => String(requestedFocusRequestId || '').trim())
  const API_BASE = getApiBase()

  const [ytInfo, setYtInfo] = useState({
    currentVersion: '-',
    latestVersion: '-',
    latestReleaseTag: '',
    latestReleaseName: '',
    latestHtmlUrl: '',
    binaryPath: '-',
    binarySize: '-',
    outdated: false,
    updateSupported: true,
    updateInProgress: false,
    autoUpdateEnabled: true,
    lastUpdatedAt: 0,
    lastError: '',
    loading: false,
    localLoading: false,
    latestLoading: false,
    latestFromCache: false,
    latestCheckedAt: 0,
    latestSource: 'none',
    error: '',
  })

  const [ffmpegInfo, setFfmpegInfo] = useState({
    available: false,
    version: '-',
    latestVersion: '-',
    latestReleaseTag: '',
    latestReleaseName: '',
    latestHtmlUrl: '',
    outdated: false,
    path: '-',
    fileSize: '-',
    projectManaged: true,
    updateSupported: false,
    updateInProgress: false,
    autoUpdateEnabled: true,
    lastUpdatedAt: 0,
    lastError: '',
    loading: false,
    latestLoading: false,
    latestFromCache: false,
    latestCheckedAt: 0,
    latestSource: 'none',
    latestError: '',
    error: '',
  })

  const [updating, setUpdating] = useState(false)
  const [logLines, setLogLines] = useState([])
  const logRef = useRef(null)
  const [ffmpegUpdating, setFfmpegUpdating] = useState(false)
  const [ffmpegLogLines, setFfmpegLogLines] = useState([])
  const ffmpegLogRef = useRef(null)

  const [toolUpdateSettings, setToolUpdateSettings] = useState({
    ytDlpAutoUpdate: true,
    ffmpegAutoUpdate: true,
  })
  const [toolUpdateSettingsLoading, setToolUpdateSettingsLoading] = useState(false)
  const [toolUpdateSettingsSaving, setToolUpdateSettingsSaving] = useState(false)
  const [toolUpdateSettingsError, setToolUpdateSettingsError] = useState('')

  const [autoDownloadSettings, setAutoDownloadSettings] = useState(() => ({ ...AUTO_DOWNLOAD_DEFAULTS }))
  const [autoDownloadLoading, setAutoDownloadLoading] = useState(false)
  const [autoDownloadSaving, setAutoDownloadSaving] = useState(false)
  const [autoDownloadError, setAutoDownloadError] = useState('')

  const [downloadSettings, setDownloadSettings] = useState(() => ({ ...DOWNLOAD_SETTINGS_DEFAULTS }))
  const [downloadSettingsLoading, setDownloadSettingsLoading] = useState(false)
  const [downloadSettingsSaving, setDownloadSettingsSaving] = useState(false)
  const [downloadSettingsError, setDownloadSettingsError] = useState('')
  const [ytCookieSettings, setYtCookieSettings] = useState(() => ({ ...YT_DLP_COOKIE_SETTINGS_DEFAULTS }))
  const ytCookieSettingsRef = useRef(ytCookieSettings)
  const [ytCookieSettingsLoading, setYtCookieSettingsLoading] = useState(false)
  const [ytCookieSettingsSaving, setYtCookieSettingsSaving] = useState(false)
  const [ytCookieSettingsError, setYtCookieSettingsError] = useState('')

  const isAppUpdateDownloading = appUpdateState?.phase === 'downloading'

  const fetchToolUpdateSettings = React.useCallback(async () => {
    setToolUpdateSettingsLoading(true)
    setToolUpdateSettingsError('')

    try {
      const resp = await fetch(`${API_BASE}/api/tool-updates/settings`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setToolUpdateSettings({
        ytDlpAutoUpdate: data?.ytDlpAutoUpdate !== false,
        ffmpegAutoUpdate: data?.ffmpegAutoUpdate !== false,
      })
    } catch (error) {
      setToolUpdateSettingsError(t('settings.failedLoadStatus', { message: error?.message || error }))
    } finally {
      setToolUpdateSettingsLoading(false)
    }
  }, [API_BASE, t])

  const saveToolUpdateSettings = React.useCallback(async (nextSettings) => {
    setToolUpdateSettingsSaving(true)
    setToolUpdateSettingsError('')

    try {
      const resp = await fetch(`${API_BASE}/api/tool-updates/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextSettings),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setToolUpdateSettings({
        ytDlpAutoUpdate: data?.ytDlpAutoUpdate !== false,
        ffmpegAutoUpdate: data?.ffmpegAutoUpdate !== false,
      })
    } catch (error) {
      setToolUpdateSettingsError(t('settings.failedLoadStatus', { message: error?.message || error }))
      throw error
    } finally {
      setToolUpdateSettingsSaving(false)
    }
  }, [API_BASE, t])

  const setToolAutoUpdateEnabled = React.useCallback((tool, enabled) => {
    const next = {
      ...toolUpdateSettings,
      ...(tool === 'ytDlp'
        ? { ytDlpAutoUpdate: Boolean(enabled) }
        : { ffmpegAutoUpdate: Boolean(enabled) }),
    }
    setToolUpdateSettings(next)
    saveToolUpdateSettings(next).catch(() => {
      // error state is handled in saveToolUpdateSettings
    })
  }, [saveToolUpdateSettings, toolUpdateSettings])

  const fetchStatus = React.useCallback(async ({ forceLatest = false } = {}) => {
    setYtInfo((state) => ({
      ...state,
      loading: true,
      localLoading: true,
      latestLoading: true,
      error: '',
    }))

    try {
      const statusUrl = forceLatest
        ? `${API_BASE}/api/yt-dlp/status?forceLatest=1`
        : `${API_BASE}/api/yt-dlp/status`

      const resp = await fetch(statusUrl)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()

      setYtInfo((state) => ({
        ...state,
        currentVersion: data.currentVersion || '-',
        latestVersion: data.latestVersion || data.currentVersion || '-',
        latestReleaseTag: data.latestReleaseTag || '',
        latestReleaseName: data.latestReleaseName || '',
        latestHtmlUrl: data.latestHtmlUrl || '',
        binaryPath: data.binaryPath || '-',
        binarySize: data.binarySizeHuman || '-',
        outdated: Boolean(data.outdated),
        updateSupported: data.updateSupported !== false,
        updateInProgress: Boolean(data.updateInProgress),
        autoUpdateEnabled: data.autoUpdateEnabled !== false,
        lastUpdatedAt: Number(data.lastUpdatedAt || 0),
        lastError: String(data.lastError || ''),
        latestFromCache: Boolean(data.latestFromCache),
        latestCheckedAt: Number(data.latestCheckedAt || 0),
        latestSource: String(data.latestSource || 'none'),
        localLoading: false,
        latestLoading: false,
        loading: false,
        error: data.error || data.latestError || '',
      }))

      if (typeof data?.autoUpdateEnabled === 'boolean') {
        setToolUpdateSettings((state) => ({ ...state, ytDlpAutoUpdate: data.autoUpdateEnabled }))
      }
    } catch (error) {
      setYtInfo((state) => ({
        ...state,
        localLoading: false,
        latestLoading: false,
        loading: false,
        error: t('settings.failedLoadStatus', { message: error?.message || error }),
      }))
    }
  }, [API_BASE, t])

  const fetchFfmpegStatus = React.useCallback(async ({ forceLatest = false } = {}) => {
    setFfmpegInfo((state) => ({
      ...state,
      loading: true,
      latestLoading: true,
      error: '',
    }))

    try {
      const statusUrl = forceLatest
        ? `${API_BASE}/api/ffmpeg/status?forceLatest=1`
        : `${API_BASE}/api/ffmpeg/status`
      const resp = await fetch(statusUrl)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      const projectManaged = data.projectManaged !== false

      setFfmpegInfo((state) => ({
        ...state,
        available: Boolean(data.available),
        version: data.version || '-',
        latestVersion: data.latestVersion || data.version || '-',
        latestReleaseTag: data.latestReleaseTag || '',
        latestReleaseName: data.latestReleaseName || '',
        latestHtmlUrl: data.latestHtmlUrl || '',
        outdated: Boolean(data.outdated),
        path: data.path || '-',
        fileSize: projectManaged ? (data.fileSizeHuman || '-') : t('settings.systemManagedFfmpegSize'),
        projectManaged,
        updateSupported: Boolean(data.updateSupported),
        updateInProgress: Boolean(data.updateInProgress),
        autoUpdateEnabled: data.autoUpdateEnabled !== false,
        lastUpdatedAt: Number(data.lastUpdatedAt || 0),
        lastError: String(data.lastError || ''),
        latestFromCache: Boolean(data.latestFromCache),
        latestCheckedAt: Number(data.latestCheckedAt || 0),
        latestSource: String(data.latestSource || 'none'),
        latestError: String(data.latestError || ''),
        loading: false,
        latestLoading: false,
        error: data.error || '',
      }))

      if (typeof data?.autoUpdateEnabled === 'boolean') {
        setToolUpdateSettings((state) => ({ ...state, ffmpegAutoUpdate: data.autoUpdateEnabled }))
      }
    } catch (error) {
      setFfmpegInfo((state) => ({
        ...state,
        loading: false,
        latestLoading: false,
        error: t('settings.failedLoadFfmpegStatus', { message: error?.message || error }),
      }))
    }
  }, [API_BASE, t])

  const fetchAutoDownloadSettings = async () => {
    setAutoDownloadLoading(true)
    setAutoDownloadError('')

    try {
      const resp = await fetch(`${API_BASE}/api/auto-download/settings`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setAutoDownloadSettings(normalizeAutoDownloadSettings(data))
    } catch (error) {
      setAutoDownloadError(t('settings.autoDownloadLoadFailed', { message: error?.message || error }))
    } finally {
      setAutoDownloadLoading(false)
    }
  }

  const saveAutoDownloadSettings = async (nextSettings) => {
    setAutoDownloadSaving(true)
    setAutoDownloadError('')

    try {
      const resp = await fetch(`${API_BASE}/api/auto-download/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextSettings),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setAutoDownloadSettings(normalizeAutoDownloadSettings(data))
    } catch (error) {
      setAutoDownloadError(t('settings.autoDownloadSaveFailed', { message: error?.message || error }))
    } finally {
      setAutoDownloadSaving(false)
    }
  }

  const updateAutoDownloadSettings = (changes) => {
    const next = normalizeAutoDownloadSettings({ ...autoDownloadSettings, ...changes })
    setAutoDownloadSettings(next)
    saveAutoDownloadSettings(next)
  }

  const fetchDownloadSettings = async () => {
    setDownloadSettingsLoading(true)
    setDownloadSettingsError('')

    try {
      const resp = await fetch(`${API_BASE}/api/download/settings`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setDownloadSettings(normalizeDownloadSettings(data))
    } catch (error) {
      setDownloadSettingsError(t('settings.downloadSettingsLoadFailed', { message: error?.message || error }))
    } finally {
      setDownloadSettingsLoading(false)
    }
  }

  const saveDownloadSettings = async (nextSettings) => {
    setDownloadSettingsSaving(true)
    setDownloadSettingsError('')

    try {
      const resp = await fetch(`${API_BASE}/api/download/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextSettings),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setDownloadSettings(normalizeDownloadSettings(data))

      try {
        const runtime = typeof window !== 'undefined' ? window.yloaderRuntime : null
        if (runtime?.isElectron && typeof runtime?.downloads?.settingsUpdated === 'function') {
          await runtime.downloads.settingsUpdated()
        }
      } catch {
        // keep UI flow resilient even when runtime bridge is temporarily unavailable
      }
    } catch (error) {
      setDownloadSettingsError(t('settings.downloadSettingsSaveFailed', { message: error?.message || error }))
    } finally {
      setDownloadSettingsSaving(false)
    }
  }

  const updateDownloadSettings = (changes) => {
    const next = normalizeDownloadSettings({ ...downloadSettings, ...changes })
    setDownloadSettings(next)
    saveDownloadSettings(next)
  }

  useEffect(() => {
    ytCookieSettingsRef.current = ytCookieSettings
  }, [ytCookieSettings])

  const fetchYtCookieSettings = React.useCallback(async () => {
    setYtCookieSettingsLoading(true)
    setYtCookieSettingsError('')

    try {
      const response = await fetch(`${API_BASE}/api/yt-dlp/cookies/settings`)
      if (!response.ok) throw new Error(await parseApiError(response))
      const payload = await response.json()
      setYtCookieSettings(normalizeYtDlpCookieSettings(payload))
    } catch (error) {
      setYtCookieSettingsError(t('settings.cookieSettingsLoadFailed', { message: error?.message || error }))
    } finally {
      setYtCookieSettingsLoading(false)
    }
  }, [API_BASE, t])

  const saveYtCookieSettings = React.useCallback(async (nextSettings) => {
    setYtCookieSettingsSaving(true)
    setYtCookieSettingsError('')

    try {
      const response = await fetch(`${API_BASE}/api/yt-dlp/cookies/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextSettings),
      })
      if (!response.ok) throw new Error(await parseApiError(response))

      const payload = await response.json()
      const normalized = normalizeYtDlpCookieSettings(payload)
      setYtCookieSettings(normalized)
      return normalized
    } catch (error) {
      setYtCookieSettingsError(t('settings.cookieSettingsSaveFailed', { message: error?.message || error }))
      throw error
    } finally {
      setYtCookieSettingsSaving(false)
    }
  }, [API_BASE, t])

  const updateYtCookieSettings = React.useCallback((changes) => {
    const current = ytCookieSettingsRef.current || YT_DLP_COOKIE_SETTINGS_DEFAULTS
    const patch = typeof changes === 'function' ? changes(current) : changes
    const next = normalizeYtDlpCookieSettings({
      ...current,
      ...(patch && typeof patch === 'object' ? patch : {}),
    })

    setYtCookieSettings(next)
    saveYtCookieSettings(next).catch(() => {
      // error state is handled in saveYtCookieSettings
    })
  }, [saveYtCookieSettings])

  useEffect(() => {
    if (!open) return
    setSection(String(requestedSection || 'general'))
    setSectionFocusTarget(String(requestedFocusTarget || '').trim())
    setSectionFocusRequestId(String(requestedFocusRequestId || `${Date.now()}`).trim())
  }, [open, requestedSection, requestedFocusRequestId, requestedFocusTarget])

  useEffect(() => {
    if (!open) return undefined

    fetchToolUpdateSettings()
    fetchStatus()
    fetchFfmpegStatus()

    const interval = window.setInterval(() => {
      fetchStatus()
      fetchFfmpegStatus()
    }, 90_000)

    return () => window.clearInterval(interval)
  }, [open, fetchFfmpegStatus, fetchStatus, fetchToolUpdateSettings])

  useEffect(() => {
    if (!open) return
    if (open && section === 'auto-download') fetchAutoDownloadSettings()
    if (open && section === 'downloader') fetchDownloadSettings()
    if (open && section === 'yt-dlp') fetchYtCookieSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, section])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logLines])

  useEffect(() => {
    if (ffmpegLogRef.current) {
      ffmpegLogRef.current.scrollTop = ffmpegLogRef.current.scrollHeight
    }
  }, [ffmpegLogLines])

  useEffect(() => {
    if (typeof onToolUpdateSummaryChange !== 'function') return

    onToolUpdateSummaryChange({
      anyUpdateAvailable: Boolean(ytInfo.outdated || ffmpegInfo.outdated),
      anyUpdateInProgress: Boolean(ytInfo.updateInProgress || ffmpegInfo.updateInProgress || updating || ffmpegUpdating),
      ytDlp: {
        updateAvailable: Boolean(ytInfo.outdated),
        updateInProgress: Boolean(ytInfo.updateInProgress || updating),
        updateSupported: Boolean(ytInfo.updateSupported),
      },
      ffmpeg: {
        updateAvailable: Boolean(ffmpegInfo.outdated),
        updateInProgress: Boolean(ffmpegInfo.updateInProgress || ffmpegUpdating),
        updateSupported: Boolean(ffmpegInfo.updateSupported),
      },
    })
  }, [
    ffmpegInfo.outdated,
    ffmpegInfo.updateInProgress,
    ffmpegInfo.updateSupported,
    ffmpegUpdating,
    onToolUpdateSummaryChange,
    updating,
    ytInfo.outdated,
    ytInfo.updateInProgress,
    ytInfo.updateSupported,
  ])

  const startUpdate = () => {
    if (!ytInfo.updateSupported) {
      setLogLines((lines) => [...lines, t('settings.updateManagedExternally')])
      return
    }

    if (updating || ytInfo.updateInProgress) {
      return
    }

    setUpdating(true)
    setLogLines((lines) => [...lines, t('settings.startUpdate')])

    const es = new EventSource(`${API_BASE}/api/yt-dlp/update/stream`)
    es.onmessage = (event) => {
      if (event.data) setLogLines((lines) => [...lines, event.data])
    }

    es.addEventListener('info', (event) => {
      if (event.data) setLogLines((lines) => [...lines, event.data])
    })

    es.addEventListener('error', (event) => {
      const message = typeof event?.data === 'string' && event.data ? event.data : t('settings.updateErrorOccurred')
      setLogLines((lines) => [...lines, `ERROR: ${message}`])
    })

    es.addEventListener('end', (event) => {
      const ok = event?.data === 'done'
      setLogLines((lines) => [...lines, ok ? t('settings.updateCompleted') : t('settings.updateFailed')])
      es.close()
      setUpdating(false)
      fetchStatus({ forceLatest: true })
    })
  }

  const startFfmpegUpdate = () => {
    if (!ffmpegInfo.updateSupported) {
      setFfmpegLogLines((lines) => [...lines, t('settings.updateManagedExternally')])
      return
    }

    if (ffmpegUpdating || ffmpegInfo.updateInProgress) {
      return
    }

    setFfmpegUpdating(true)
    setFfmpegLogLines((lines) => [...lines, t('settings.startUpdate')])

    const es = new EventSource(`${API_BASE}/api/ffmpeg/update/stream`)
    es.onmessage = (event) => {
      if (event.data) setFfmpegLogLines((lines) => [...lines, event.data])
    }

    es.addEventListener('info', (event) => {
      if (event.data) setFfmpegLogLines((lines) => [...lines, event.data])
    })

    es.addEventListener('error', (event) => {
      const message = typeof event?.data === 'string' && event.data ? event.data : t('settings.updateErrorOccurred')
      setFfmpegLogLines((lines) => [...lines, `ERROR: ${message}`])
    })

    es.addEventListener('end', (event) => {
      const ok = event?.data === 'done'
      setFfmpegLogLines((lines) => [...lines, ok ? t('settings.updateCompleted') : t('settings.updateFailed')])
      es.close()
      setFfmpegUpdating(false)
      fetchFfmpegStatus({ forceLatest: true })
    })
  }

  const sections = useMemo(() => ([
    { key: 'general', label: t('settings.general'), icon: SettingsIcon, hasUpdate: false },
    { key: 'downloader', label: t('settings.sectionDownloader'), icon: DownloadIcon, hasUpdate: false },
    { key: 'auto-download', label: t('settings.sectionAutoDownload'), icon: ZapIcon, hasUpdate: false },
    { key: 'yt-dlp', label: t('settings.sectionYtDlp'), icon: VideoIcon, hasUpdate: Boolean(ytInfo.outdated) },
    { key: 'ffmpeg', label: t('settings.sectionFfmpeg'), icon: CpuIcon, hasUpdate: Boolean(ffmpegInfo.outdated) },
  ]), [ffmpegInfo.outdated, t, ytInfo.outdated])

  let sectionTitle = t('settings.general')
  if (section === 'downloader') sectionTitle = t('settings.downloaderConfig')
  if (section === 'auto-download') sectionTitle = t('settings.autoDownloadConfig')
  if (section === 'yt-dlp') sectionTitle = t('settings.ytDlpConfig')
  if (section === 'ffmpeg') sectionTitle = t('settings.ffmpegConfig')

  const canResetSection = section === 'general' || section === 'downloader' || section === 'auto-download'
  const resetDisabled =
    section === 'downloader'
      ? (downloadSettingsLoading || downloadSettingsSaving)
      : (section === 'auto-download' ? (autoDownloadLoading || autoDownloadSaving) : false)

  const handleResetSection = React.useCallback(() => {
    if (section === 'general') {
      setLanguage('en')
      setPreference(null)
      return
    }

    if (section === 'downloader') {
      const defaults = { ...DOWNLOAD_SETTINGS_DEFAULTS }
      setDownloadSettings(defaults)
      saveDownloadSettings(defaults)
      return
    }

    if (section === 'auto-download') {
      const defaults = { ...AUTO_DOWNLOAD_DEFAULTS }
      setAutoDownloadSettings(defaults)
      saveAutoDownloadSettings(defaults)
    }
  }, [section, saveAutoDownloadSettings, saveDownloadSettings, setLanguage, setPreference])

  const isAnyUpdateRunning = isAppUpdateDownloading || updating || ffmpegUpdating || ytInfo.updateInProgress || ffmpegInfo.updateInProgress

  const handleDialogClose = React.useCallback(() => {
    if (isAnyUpdateRunning) return
    onClose?.()
  }, [isAnyUpdateRunning, onClose])

  const selectSx = {
    fontSize: 13,
    height: 32,
    minWidth: 140,
    borderRadius: '4px',
    transition: 'none',
    '& .MuiOutlinedInput-root': { transition: 'none' },
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider', transition: 'none' },
    '& .MuiSelect-select': { py: '6px', px: 1.5 },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'text.disabled' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: 1 },
  }

  return (
    <Dialog
      open={open}
      onClose={handleDialogClose}
      disableEscapeKeyDown={isAnyUpdateRunning}
      fullWidth
      maxWidth="md"
      PaperProps={{
        sx: (theme) => ({
          borderRadius: '12px',
          overflow: 'hidden',
          bgcolor: theme.palette.mode === 'dark' ? '#000000' : '#f2f2f7',
          backgroundImage: 'none',
          boxShadow: theme.palette.mode === 'dark' ? '0 0 0 1px rgba(255,255,255,0.1), 0 24px 48px rgba(0,0,0,0.5)' : '0 24px 48px rgba(0,0,0,0.15)',
          '& .MuiButton-root': { transition: 'none' },
          '& .MuiIconButton-root': { transition: 'none' },
          '& .MuiListItemButton-root': { transition: 'none' },
          '& .MuiMenuItem-root': { transition: 'none' },
          '& .MuiOutlinedInput-root': { transition: 'none' },
          '& .MuiOutlinedInput-notchedOutline': { transition: 'none' },
        }),
      }}
    >
      <DialogContent sx={{ p: 0, '&:first-of-type': { pt: 0 } }}>
        <Box sx={{ display: 'flex', height: 640 }}>
          <Box sx={(theme) => ({
            width: 240,
            flexShrink: 0,
            borderRight: `1px solid ${theme.palette.divider}`,
            bgcolor: theme.palette.mode === 'dark' ? '#1c1c1e' : '#fbfbfb',
            display: 'flex',
            flexDirection: 'column',
          })}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 2,
                pt: 3,
                pb: 2,
                flexShrink: 0,
              }}
            >
              <Typography sx={{ fontWeight: 600, fontSize: 13, color: 'text.secondary' }}>{t('settings.title')}</Typography>
              <Tooltip title={t('settings.close')}>
                <IconButton
                  onClick={handleDialogClose}
                  disabled={isAnyUpdateRunning}
                  size="small"
                  aria-label={t('settings.closeAria')}
                  sx={{
                    borderRadius: '8px',
                    p: '6px',
                    color: 'text.secondary',
                    '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                  }}
                >
                  <X size={16} />
                </IconButton>
              </Tooltip>
            </Box>

            <List disablePadding sx={{ px: 2, pt: 1, pb: 4, overflowY: 'auto' }}>
              {sections.map((entry) => (
                <ListItem key={entry.key} disablePadding sx={{ mb: 0.5 }}>
                  <ListItemButton
                    selected={section === entry.key}
                    onClick={() => {
                      setSection(entry.key)
                      setSectionFocusTarget('')
                      setSectionFocusRequestId(String(Date.now()))
                    }}
                    sx={(theme) => ({
                      borderRadius: '8px',
                      py: '6px',
                      px: 1,
                      '&.Mui-selected': {
                        bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                        '&:hover': { bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)' },
                      },
                      '&:hover': { bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' },
                    })}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, flexShrink: 0 }}>
                        <entry.icon size={18} strokeWidth={2.5} color={section === entry.key ? 'currentColor' : '#8e8e93'} />
                      </Box>
                      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontSize: 13.5, fontWeight: section === entry.key ? 600 : 500, color: section === entry.key ? 'text.primary' : 'text.secondary' }}>
                          {entry.label}
                        </Typography>
                        {entry.hasUpdate ? (
                          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#ff3b30', flexShrink: 0 }} />
                        ) : null}
                      </Box>
                    </Box>
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>

          <Box sx={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}>
            <Box sx={(theme) => ({
              px: 4,
              pt: 3,
              pb: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
              position: 'sticky',
              top: 0,
              zIndex: 1,
              bgcolor: theme.palette.mode === 'dark' ? '#000000' : '#f2f2f7',
            })}>
              <Typography sx={{ fontWeight: 700, fontSize: 24, letterSpacing: '-0.5px' }}>{sectionTitle}</Typography>
              {canResetSection && (
                <Button
                  variant="text"
                  size="small"
                  disabled={resetDisabled}
                  onClick={handleResetSection}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: '8px',
                    color: '#007aff',
                  }}
                >
                  {t('settings.resetToDefaults')}
                </Button>
              )}
            </Box>

            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {section === 'general' && (
                <GeneralSettingsSection
                  language={language}
                  setLanguage={setLanguage}
                  mode={mode}
                  setPreference={setPreference}
                  selectSx={selectSx}
                  t={t}
                  appUpdateState={appUpdateState}
                  isElectronUpdaterAvailable={isElectronUpdaterAvailable}
                  checkForAppUpdates={checkForAppUpdates}
                  downloadAppUpdate={downloadAppUpdate}
                  installAppUpdate={installAppUpdate}
                />
              )}

              {section === 'auto-download' && (
                <AutoDownloadSettingsSection
                  autoDownloadSettings={autoDownloadSettings}
                  autoDownloadLoading={autoDownloadLoading}
                  autoDownloadSaving={autoDownloadSaving}
                  autoDownloadError={autoDownloadError}
                  updateAutoDownloadSettings={updateAutoDownloadSettings}
                  selectSx={selectSx}
                  t={t}
                />
              )}

              {section === 'downloader' && (
                <DownloaderSettingsSection
                  downloadSettings={downloadSettings}
                  downloadSettingsLoading={downloadSettingsLoading}
                  downloadSettingsSaving={downloadSettingsSaving}
                  downloadSettingsError={downloadSettingsError}
                  updateDownloadSettings={updateDownloadSettings}
                  selectSx={selectSx}
                  t={t}
                />
              )}

              {section === 'yt-dlp' && (
                <YtDlpSettingsSection
                  ytInfo={ytInfo}
                  updating={updating}
                  startUpdate={startUpdate}
                  onToggleAutoUpdate={(enabled) => setToolAutoUpdateEnabled('ytDlp', enabled)}
                  toolUpdateSettingsLoading={toolUpdateSettingsLoading}
                  toolUpdateSettingsSaving={toolUpdateSettingsSaving}
                  toolUpdateSettingsError={toolUpdateSettingsError}
                  fetchStatus={fetchStatus}
                  onCheckForUpdates={() => fetchStatus({ forceLatest: true })}
                  logRef={logRef}
                  logLines={logLines}
                  cookieSettings={ytCookieSettings}
                  cookieSettingsLoading={ytCookieSettingsLoading}
                  cookieSettingsSaving={ytCookieSettingsSaving}
                  cookieSettingsError={ytCookieSettingsError}
                  onUpdateCookieSettings={updateYtCookieSettings}
                  onRefreshCookieSettings={fetchYtCookieSettings}
                  requestedFocusTarget={sectionFocusTarget}
                  requestedFocusRequestId={sectionFocusRequestId}
                  t={t}
                />
              )}

              {section === 'ffmpeg' && (
                <FfmpegSettingsSection
                  ffmpegInfo={ffmpegInfo}
                  updating={ffmpegUpdating}
                  startUpdate={startFfmpegUpdate}
                  onToggleAutoUpdate={(enabled) => setToolAutoUpdateEnabled('ffmpeg', enabled)}
                  toolUpdateSettingsLoading={toolUpdateSettingsLoading}
                  toolUpdateSettingsSaving={toolUpdateSettingsSaving}
                  toolUpdateSettingsError={toolUpdateSettingsError}
                  fetchFfmpegStatus={fetchFfmpegStatus}
                  onCheckForUpdates={() => fetchFfmpegStatus({ forceLatest: true })}
                  logRef={ffmpegLogRef}
                  logLines={ffmpegLogLines}
                  t={t}
                />
              )}
            </Box>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  )
}
