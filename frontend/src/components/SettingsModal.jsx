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
import SimpleBarScrollArea from './SimpleBarScrollArea'

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
  const runtime = typeof window !== 'undefined' ? window.yloaderRuntime : null
  const isElectronRuntime = Boolean(runtime?.isElectron)
  const [section, setSection] = useState(() => String(requestedSection || 'general'))
  const [sectionFocusTarget, setSectionFocusTarget] = useState(() => String(requestedFocusTarget || '').trim())
  const [sectionFocusRequestId, setSectionFocusRequestId] = useState(() => String(requestedFocusRequestId || '').trim())
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
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
  const toolUpdateSettingsRef = useRef(toolUpdateSettings)
  const toolUpdateSettingsRequestIdRef = useRef(0)
  const [toolUpdateSettingsLoading, setToolUpdateSettingsLoading] = useState(false)
  const [toolUpdateSettingsSaving, setToolUpdateSettingsSaving] = useState(false)
  const [toolUpdateSettingsError, setToolUpdateSettingsError] = useState('')

  const [autoDownloadSettings, setAutoDownloadSettings] = useState(() => ({ ...AUTO_DOWNLOAD_DEFAULTS }))
  const autoDownloadSettingsRef = useRef(autoDownloadSettings)
  const autoDownloadSaveRequestIdRef = useRef(0)
  const [autoDownloadLoading, setAutoDownloadLoading] = useState(false)
  const [autoDownloadSaving, setAutoDownloadSaving] = useState(false)
  const [autoDownloadError, setAutoDownloadError] = useState('')

  const [downloadSettings, setDownloadSettings] = useState(() => ({ ...DOWNLOAD_SETTINGS_DEFAULTS }))
  const downloadSettingsRef = useRef(downloadSettings)
  const downloadSaveRequestIdRef = useRef(0)
  const [downloadSettingsLoading, setDownloadSettingsLoading] = useState(false)
  const [downloadSettingsSaving, setDownloadSettingsSaving] = useState(false)
  const [downloadSettingsError, setDownloadSettingsError] = useState('')
  const [ytCookieSettings, setYtCookieSettings] = useState(() => ({ ...YT_DLP_COOKIE_SETTINGS_DEFAULTS }))
  const ytCookieSettingsRef = useRef(ytCookieSettings)
  const [ytCookieSettingsLoading, setYtCookieSettingsLoading] = useState(false)
  const [ytCookieSettingsSaving, setYtCookieSettingsSaving] = useState(false)
  const [ytCookieSettingsError, setYtCookieSettingsError] = useState('')

  const isAppUpdateDownloading = appUpdateState?.phase === 'downloading'

  useEffect(() => {
    toolUpdateSettingsRef.current = toolUpdateSettings
  }, [toolUpdateSettings])

  useEffect(() => {
    autoDownloadSettingsRef.current = autoDownloadSettings
  }, [autoDownloadSettings])

  useEffect(() => {
    downloadSettingsRef.current = downloadSettings
  }, [downloadSettings])

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
    const requestId = ++toolUpdateSettingsRequestIdRef.current
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
      const normalized = {
        ytDlpAutoUpdate: data?.ytDlpAutoUpdate !== false,
        ffmpegAutoUpdate: data?.ffmpegAutoUpdate !== false,
      }

      if (requestId === toolUpdateSettingsRequestIdRef.current) {
        setToolUpdateSettings(normalized)
      }

      return normalized
    } catch (error) {
      if (requestId === toolUpdateSettingsRequestIdRef.current) {
        setToolUpdateSettingsError(t('settings.failedLoadStatus', { message: error?.message || error }))
      }
      throw error
    } finally {
      if (requestId === toolUpdateSettingsRequestIdRef.current) {
        setToolUpdateSettingsSaving(false)
      }
    }
  }, [API_BASE, t])

  const setToolAutoUpdateEnabled = React.useCallback((tool, enabled) => {
    const current = toolUpdateSettingsRef.current
    const next = {
      ...current,
      ...(tool === 'ytDlp'
        ? { ytDlpAutoUpdate: Boolean(enabled) }
        : { ffmpegAutoUpdate: Boolean(enabled) }),
    }

    setToolUpdateSettings(next)

    if (tool === 'ytDlp') {
      setYtInfo((state) => ({
        ...state,
        autoUpdateEnabled: next.ytDlpAutoUpdate,
      }))
    }

    if (tool === 'ffmpeg') {
      setFfmpegInfo((state) => ({
        ...state,
        autoUpdateEnabled: next.ffmpegAutoUpdate,
      }))
    }

    saveToolUpdateSettings(next).catch(() => {
      // error state is handled in saveToolUpdateSettings
    })
  }, [saveToolUpdateSettings])

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

  const saveAutoDownloadSettings = React.useCallback(async (nextSettings) => {
    const requestId = ++autoDownloadSaveRequestIdRef.current
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
      const normalized = normalizeAutoDownloadSettings(data)
      if (requestId === autoDownloadSaveRequestIdRef.current) {
        setAutoDownloadSettings(normalized)
      }
      return normalized
    } catch (error) {
      if (requestId === autoDownloadSaveRequestIdRef.current) {
        setAutoDownloadError(t('settings.autoDownloadSaveFailed', { message: error?.message || error }))
      }
      throw error
    } finally {
      if (requestId === autoDownloadSaveRequestIdRef.current) {
        setAutoDownloadSaving(false)
      }
    }
  }, [API_BASE, t])

  const updateAutoDownloadSettings = React.useCallback((changes) => {
    const current = autoDownloadSettingsRef.current || AUTO_DOWNLOAD_DEFAULTS
    const patch = typeof changes === 'function' ? changes(current) : changes
    const next = normalizeAutoDownloadSettings({
      ...current,
      ...(patch && typeof patch === 'object' ? patch : {}),
    })

    setAutoDownloadSettings(next)
    saveAutoDownloadSettings(next).catch(() => {
      // error state is handled in saveAutoDownloadSettings
    })
  }, [saveAutoDownloadSettings])

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

  const saveDownloadSettings = React.useCallback(async (nextSettings) => {
    const requestId = ++downloadSaveRequestIdRef.current
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
      const normalized = normalizeDownloadSettings(data)

      if (requestId === downloadSaveRequestIdRef.current) {
        setDownloadSettings(normalized)
      }

      try {
        const runtime = typeof window !== 'undefined' ? window.yloaderRuntime : null
        if (runtime?.isElectron && typeof runtime?.downloads?.settingsUpdated === 'function') {
          await runtime.downloads.settingsUpdated()
        }
      } catch {
        // keep UI flow resilient even when runtime bridge is temporarily unavailable
      }

      return normalized
    } catch (error) {
      if (requestId === downloadSaveRequestIdRef.current) {
        setDownloadSettingsError(t('settings.downloadSettingsSaveFailed', { message: error?.message || error }))
      }
      throw error
    } finally {
      if (requestId === downloadSaveRequestIdRef.current) {
        setDownloadSettingsSaving(false)
      }
    }
  }, [API_BASE, t])

  const updateDownloadSettings = React.useCallback((changes) => {
    const current = downloadSettingsRef.current || DOWNLOAD_SETTINGS_DEFAULTS
    const patch = typeof changes === 'function' ? changes(current) : changes
    const next = normalizeDownloadSettings({
      ...current,
      ...(patch && typeof patch === 'object' ? patch : {}),
    })

    setDownloadSettings(next)
    saveDownloadSettings(next).catch(() => {
      // error state is handled in saveDownloadSettings
    })
  }, [saveDownloadSettings])

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
    setResetConfirmOpen(false)
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
      ? downloadSettingsLoading
      : (section === 'auto-download' ? autoDownloadLoading : false)

  const applyResetToCurrentSection = React.useCallback(() => {
    if (section === 'general') {
      setLanguage('en')
      setPreference(null)
      return
    }

    if (section === 'downloader') {
      const defaults = { ...DOWNLOAD_SETTINGS_DEFAULTS }
      setDownloadSettings(defaults)
      saveDownloadSettings(defaults).catch(() => {
        // error state is handled in saveDownloadSettings
      })
      return
    }

    if (section === 'auto-download') {
      const defaults = { ...AUTO_DOWNLOAD_DEFAULTS }
      setAutoDownloadSettings(defaults)
      saveAutoDownloadSettings(defaults).catch(() => {
        // error state is handled in saveAutoDownloadSettings
      })
    }
  }, [section, saveAutoDownloadSettings, saveDownloadSettings, setLanguage, setPreference])

  const handleRequestResetSection = React.useCallback(() => {
    if (!canResetSection || resetDisabled) return
    setResetConfirmOpen(true)
  }, [canResetSection, resetDisabled])

  const handleCancelResetSection = React.useCallback(() => {
    setResetConfirmOpen(false)
  }, [])

  const handleConfirmResetSection = React.useCallback(() => {
    setResetConfirmOpen(false)
    applyResetToCurrentSection()
  }, [applyResetToCurrentSection])

  const isAnyUpdateRunning = isAppUpdateDownloading || updating || ffmpegUpdating || ytInfo.updateInProgress || ffmpegInfo.updateInProgress

  const handleDialogClose = React.useCallback(() => {
    if (resetConfirmOpen) {
      setResetConfirmOpen(false)
      return
    }
    if (isAnyUpdateRunning) return
    onClose?.()
  }, [isAnyUpdateRunning, onClose, resetConfirmOpen])

  const selectSx = {
    fontSize: 13,
    height: 32,
    minWidth: 140,
    borderRadius: '4px',
    '& .MuiOutlinedInput-root': { transition: 'border-color 180ms ease, background-color 180ms ease' },
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider', transition: 'border-color 180ms ease' },
    '& .MuiSelect-select': { py: '6px', px: 1.5 },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'text.disabled' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: 1 },
  }

  const resetConfirmTitleId = 'settings-reset-confirm-title'
  const resetConfirmDescriptionId = 'settings-reset-confirm-description'

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
        }),
      }}
    >
      <DialogContent sx={{ p: 0, position: 'relative', '&:first-of-type': { pt: 0 } }}>
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

            <SimpleBarScrollArea sx={{ flex: 1, minHeight: 0 }}>
              <List disablePadding sx={{ px: 2, pt: 1, pb: 4 }}>
                {sections.map((entry) => (
                  <ListItem key={entry.key} disablePadding sx={{ mb: 0.5 }}>
                    <ListItemButton
                      selected={section === entry.key}
                      onClick={() => {
                        setResetConfirmOpen(false)
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
            </SimpleBarScrollArea>
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
                  onClick={handleRequestResetSection}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: '8px',
                    color: 'primary.main',
                    '&:hover': {
                      bgcolor: 'action.hover',
                    },
                  }}
                >
                  {t('settings.resetToDefaults')}
                </Button>
              )}
            </Box>

            <SimpleBarScrollArea sx={{ flex: 1, minHeight: 0 }}>
              {section === 'general' && (
                <GeneralSettingsSection
                  language={language}
                  setLanguage={setLanguage}
                  mode={mode}
                  setPreference={setPreference}
                  showAppUpdateSection={isElectronRuntime}
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
                  autoUpdateEnabled={toolUpdateSettings.ytDlpAutoUpdate}
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
                  autoUpdateEnabled={toolUpdateSettings.ffmpegAutoUpdate}
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
            </SimpleBarScrollArea>
          </Box>
        </Box>

        {resetConfirmOpen && canResetSection && (
          <Box
            onClick={handleCancelResetSection}
            sx={(theme) => ({
              position: 'absolute',
              inset: 0,
              zIndex: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              px: 2,
              bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.62)' : 'rgba(17,24,39,0.24)',
            })}
          >
            <Box
              role="dialog"
              aria-modal="true"
              aria-labelledby={resetConfirmTitleId}
              aria-describedby={resetConfirmDescriptionId}
              onClick={(event) => event.stopPropagation()}
              sx={(theme) => ({
                width: 'min(420px, 100%)',
                borderRadius: '12px',
                p: 2.5,
                bgcolor: theme.palette.mode === 'dark' ? '#111111' : '#ffffff',
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: theme.palette.mode === 'dark' ? '0 18px 32px rgba(0,0,0,0.6)' : '0 18px 30px rgba(0,0,0,0.16)',
              })}
            >
              <Typography id={resetConfirmTitleId} sx={{ fontWeight: 700, fontSize: 18, mb: 1 }}>
                {t('settings.resetConfirmTitle')}
              </Typography>
              <Typography id={resetConfirmDescriptionId} sx={{ color: 'text.secondary', fontSize: 14, lineHeight: 1.5 }}>
                {t('settings.resetConfirmDescription', { section: sectionTitle })}
              </Typography>

              <Box sx={{ mt: 2.5, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                <Button
                  variant="text"
                  size="small"
                  onClick={handleCancelResetSection}
                  sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}
                >
                  {t('settings.resetConfirmCancel')}
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleConfirmResetSection}
                  sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '8px', boxShadow: 'none' }}
                >
                  {t('settings.resetConfirmConfirm')}
                </Button>
              </Box>
            </Box>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  )
}
