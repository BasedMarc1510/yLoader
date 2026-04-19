import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Dialog, DialogContent, IconButton, List, ListItem, ListItemButton, Typography, Tooltip, Button } from '@mui/material'
import { X, Settings as SettingsIcon, Download as DownloadIcon, Globe as GlobeIcon, Cpu as CpuIcon, ChevronLeft } from 'lucide-react'
import { ColorModeContext } from '../providers/ColorModeProvider'
import { SettingsContext } from '../providers/SettingsProvider'
import { useI18n } from '../providers/I18nProvider'
import { getApiBase } from '../utils/metadata'
import GeneralSettingsSection from './settings-modal/GeneralSettingsSection'
import DownloadsSettingsSection from './settings-modal/DownloadsSettingsSection'
import NetworkSettingsSection from './settings-modal/NetworkSettingsSection'
import SystemSettingsSection from './settings-modal/SystemSettingsSection'
import SettingsBreadcrumb from './settings-modal/SettingsBreadcrumb'
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

/* ─── helpers ─── */

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

function hasOwnPropertyKey(value, key) {
  if (!value || typeof value !== 'object') return false
  return Object.prototype.hasOwnProperty.call(value, key)
}

function mergeLegacyAutoDownloadFields(serverValue, fallbackValue) {
  const server = (serverValue && typeof serverValue === 'object') ? serverValue : {}
  const fallback = (fallbackValue && typeof fallbackValue === 'object') ? fallbackValue : {}

  return {
    ...server,
    useFixedDownloadPath: hasOwnPropertyKey(server, 'useFixedDownloadPath')
      ? server.useFixedDownloadPath
      : fallback.useFixedDownloadPath,
    fixedDownloadPath: hasOwnPropertyKey(server, 'fixedDownloadPath')
      ? server.fixedDownloadPath
      : fallback.fixedDownloadPath,
  }
}

/* ─── section → legacy mapping for data fetch ─── */

const SECTION_DATA_DEPENDENCIES = {
  downloads: ['download-settings', 'auto-download'],
  network: ['cookie-settings'],
  system: ['tool-status'],
}

/* ─── settings modal ─── */

function SettingsModalInner({
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
  setAppAutoUpdateEnabled,
}) {
  const { t } = useI18n()
  const { mode, setPreference } = useContext(ColorModeContext)
  const { language, setLanguage } = useContext(SettingsContext)
  const runtime = typeof window !== 'undefined' ? window.yloaderRuntime : null
  const isElectronRuntime = Boolean(runtime?.isElectron)
  // Map legacy section keys from external callers to the new navigation structure.
  // This ensures openSettingsModal('yt-dlp', 'cookies') still works after the refactor.
  const resolveSectionKey = React.useCallback((key) => {
    const raw = String(key || 'general').trim()
    const legacyMap = {
      'yt-dlp': 'network',
      'auto-download': 'downloads',
      'downloader': 'downloads',
      'ffmpeg': 'system',
    }
    return legacyMap[raw] || raw
  }, [])

  const [section, setSection] = useState(() => resolveSectionKey(requestedSection))
  const [sectionFocusTarget, setSectionFocusTarget] = useState(() => String(requestedFocusTarget || '').trim())
  const [sectionFocusRequestId, setSectionFocusRequestId] = useState(() => String(requestedFocusRequestId || '').trim())
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [systemDetail, setSystemDetail] = useState(() => {
    // If an old caller requested 'ffmpeg' specifically, auto-drill into the ffmpeg detail
    const raw = String(requestedSection || '').trim()
    if (raw === 'ffmpeg') return 'ffmpeg'
    if (raw === 'yt-dlp') return null // cookie focus is on network section
    return null
  })
  const API_BASE = getApiBase()

  /* ─── yt-dlp state ─── */
  const [ytInfo, setYtInfo] = useState({
    currentVersion: '-', latestVersion: '-', latestReleaseTag: '', latestReleaseName: '',
    latestHtmlUrl: '', binaryPath: '-', binarySize: '-', outdated: false, updateSupported: true,
    updateInProgress: false, autoUpdateEnabled: true, lastUpdatedAt: 0, lastError: '',
    loading: false, localLoading: false, latestLoading: false, latestFromCache: false,
    latestCheckedAt: 0, latestSource: 'none', error: '',
  })

  /* ─── ffmpeg state ─── */
  const [ffmpegInfo, setFfmpegInfo] = useState({
    available: false, version: '-', latestVersion: '-', latestReleaseTag: '', latestReleaseName: '',
    latestHtmlUrl: '', outdated: false, path: '-', fileSize: '-', projectManaged: true,
    updateSupported: false, updateInProgress: false, autoUpdateEnabled: true, lastUpdatedAt: 0,
    lastError: '', loading: false, latestLoading: false, latestFromCache: false,
    latestCheckedAt: 0, latestSource: 'none', latestError: '', error: '',
  })

  /* ─── updater state ─── */
  const [updating, setUpdating] = useState(false)
  const [logLines, setLogLines] = useState([])
  const [ffmpegUpdating, setFfmpegUpdating] = useState(false)
  const [ffmpegLogLines, setFfmpegLogLines] = useState([])

  /* ─── tool update settings ─── */
  const [toolUpdateSettings, setToolUpdateSettings] = useState({ ytDlpAutoUpdate: true, ffmpegAutoUpdate: true })
  const toolUpdateSettingsRef = useRef(toolUpdateSettings)
  const toolUpdateSettingsRequestIdRef = useRef(0)
  const [toolUpdateSettingsLoading, setToolUpdateSettingsLoading] = useState(false)
  const [toolUpdateSettingsSaving, setToolUpdateSettingsSaving] = useState(false)
  const [toolUpdateSettingsError, setToolUpdateSettingsError] = useState('')

  /* ─── auto download settings ─── */
  const [autoDownloadSettings, setAutoDownloadSettings] = useState(() => ({ ...AUTO_DOWNLOAD_DEFAULTS }))
  const autoDownloadSettingsRef = useRef(autoDownloadSettings)
  const autoDownloadSaveRequestIdRef = useRef(0)
  const [autoDownloadLoading, setAutoDownloadLoading] = useState(false)
  const [autoDownloadSaving, setAutoDownloadSaving] = useState(false)
  const [autoDownloadError, setAutoDownloadError] = useState('')

  /* ─── download settings ─── */
  const [downloadSettings, setDownloadSettings] = useState(() => ({ ...DOWNLOAD_SETTINGS_DEFAULTS }))
  const downloadSettingsRef = useRef(downloadSettings)
  const downloadSaveRequestIdRef = useRef(0)
  const [downloadSettingsLoading, setDownloadSettingsLoading] = useState(false)
  const [downloadSettingsSaving, setDownloadSettingsSaving] = useState(false)
  const [downloadSettingsError, setDownloadSettingsError] = useState('')

  /* ─── cookie settings ─── */
  const [ytCookieSettings, setYtCookieSettings] = useState(() => ({ ...YT_DLP_COOKIE_SETTINGS_DEFAULTS }))
  const ytCookieSettingsRef = useRef(ytCookieSettings)
  const [ytCookieSettingsLoading, setYtCookieSettingsLoading] = useState(false)
  const [ytCookieSettingsSaving, setYtCookieSettingsSaving] = useState(false)
  const [ytCookieSettingsError, setYtCookieSettingsError] = useState('')

  const isAppUpdateDownloading = appUpdateState?.phase === 'downloading'

  /* ─── ref syncs ─── */
  useEffect(() => { toolUpdateSettingsRef.current = toolUpdateSettings }, [toolUpdateSettings])
  useEffect(() => { autoDownloadSettingsRef.current = autoDownloadSettings }, [autoDownloadSettings])
  useEffect(() => { downloadSettingsRef.current = downloadSettings }, [downloadSettings])
  useEffect(() => { ytCookieSettingsRef.current = ytCookieSettings }, [ytCookieSettings])

  /* ─── fetch helpers ─── */

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
      setYtInfo((state) => ({ ...state, autoUpdateEnabled: next.ytDlpAutoUpdate }))
    }
    if (tool === 'ffmpeg') {
      setFfmpegInfo((state) => ({ ...state, autoUpdateEnabled: next.ffmpegAutoUpdate }))
    }
    saveToolUpdateSettings(next).catch(() => {
      // error state is handled in saveToolUpdateSettings
    })
  }, [saveToolUpdateSettings])

  const fetchStatus = React.useCallback(async ({ forceLatest = false } = {}) => {
    setYtInfo((state) => ({ ...state, loading: true, localLoading: true, latestLoading: true, error: '' }))
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
        localLoading: false, latestLoading: false, loading: false,
        error: data.error || data.latestError || '',
      }))
      if (typeof data?.autoUpdateEnabled === 'boolean') {
        setToolUpdateSettings((state) => ({ ...state, ytDlpAutoUpdate: data.autoUpdateEnabled }))
      }
    } catch (error) {
      setYtInfo((state) => ({
        ...state, localLoading: false, latestLoading: false, loading: false,
        error: t('settings.failedLoadStatus', { message: error?.message || error }),
      }))
    }
  }, [API_BASE, t])

  const fetchFfmpegStatus = React.useCallback(async ({ forceLatest = false } = {}) => {
    setFfmpegInfo((state) => ({ ...state, loading: true, latestLoading: true, error: '' }))
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
        loading: false, latestLoading: false,
        error: data.error || '',
      }))
      if (typeof data?.autoUpdateEnabled === 'boolean') {
        setToolUpdateSettings((state) => ({ ...state, ffmpegAutoUpdate: data.autoUpdateEnabled }))
      }
    } catch (error) {
      setFfmpegInfo((state) => ({
        ...state, loading: false, latestLoading: false,
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
      const merged = mergeLegacyAutoDownloadFields(data, autoDownloadSettingsRef.current || AUTO_DOWNLOAD_DEFAULTS)
      setAutoDownloadSettings(normalizeAutoDownloadSettings(merged))
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
      const merged = mergeLegacyAutoDownloadFields(data, nextSettings)
      const normalized = normalizeAutoDownloadSettings(merged)
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

  /* ─── lifecycle ─── */

  useEffect(() => {
    if (!open) return
    const resolvedSection = resolveSectionKey(requestedSection)
    setSection(resolvedSection)
    setSectionFocusTarget(String(requestedFocusTarget || '').trim())
    setSectionFocusRequestId(String(requestedFocusRequestId || `${Date.now()}`).trim())
    setResetConfirmOpen(false)
    // Auto-drill into ffmpeg detail if legacy 'ffmpeg' key was requested
    const rawSection = String(requestedSection || '').trim()
    setSystemDetail(rawSection === 'ffmpeg' ? 'ffmpeg' : null)
  }, [open, requestedSection, requestedFocusRequestId, requestedFocusTarget, resolveSectionKey])

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
    if (section === 'downloads') {
      fetchDownloadSettings()
      fetchAutoDownloadSettings()
    }
    if (section === 'network') fetchYtCookieSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, section])

  /* ─── tool update summary ─── */

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
    ffmpegInfo.outdated, ffmpegInfo.updateInProgress, ffmpegInfo.updateSupported,
    ffmpegUpdating, onToolUpdateSummaryChange, updating,
    ytInfo.outdated, ytInfo.updateInProgress, ytInfo.updateSupported,
  ])

  /* ─── update streams (hardened SSE) ─── */

  const startUpdate = () => {
    if (!ytInfo.updateSupported) {
      setLogLines((lines) => [...lines, t('settings.updateManagedExternally')])
      return
    }
    if (updating || ytInfo.updateInProgress) return

    setUpdating(true)
    setLogLines((lines) => [...lines, t('settings.startUpdate')])

    const es = new EventSource(`${API_BASE}/api/yt-dlp/update/stream`)

    const cleanup = () => {
      try { es.close() } catch { /* safe close */ }
      setUpdating(false)
      fetchStatus({ forceLatest: true })
    }

    // Timeout guard — if no events arrive within 60s, abort
    let lastEventAt = Date.now()
    const timeoutInterval = window.setInterval(() => {
      if (Date.now() - lastEventAt > 60_000) {
        setLogLines((lines) => [...lines, 'ERROR: Update timed out — no response from server.'])
        window.clearInterval(timeoutInterval)
        cleanup()
      }
    }, 5_000)

    es.onmessage = (event) => {
      lastEventAt = Date.now()
      if (event.data) setLogLines((lines) => [...lines, event.data])
    }
    es.addEventListener('info', (event) => {
      lastEventAt = Date.now()
      if (event.data) setLogLines((lines) => [...lines, event.data])
    })
    es.addEventListener('error', (event) => {
      lastEventAt = Date.now()
      const message = typeof event?.data === 'string' && event.data ? event.data : t('settings.updateErrorOccurred')
      setLogLines((lines) => [...lines, `ERROR: ${message}`])
    })
    es.addEventListener('end', (event) => {
      lastEventAt = Date.now()
      window.clearInterval(timeoutInterval)
      const ok = event?.data === 'done'
      setLogLines((lines) => [...lines, ok ? t('settings.updateCompleted') : t('settings.updateFailed')])
      cleanup()
    })
    // Native error handler — connection failures
    es.onerror = () => {
      lastEventAt = Date.now()
      // EventSource auto-reconnects, but if the connection is truly broken,
      // the 'end' event won't fire. The timeout guard will catch it.
    }
  }

  const startFfmpegUpdate = () => {
    if (!ffmpegInfo.updateSupported) {
      setFfmpegLogLines((lines) => [...lines, t('settings.updateManagedExternally')])
      return
    }
    if (ffmpegUpdating || ffmpegInfo.updateInProgress) return

    setFfmpegUpdating(true)
    setFfmpegLogLines((lines) => [...lines, t('settings.startUpdate')])

    const es = new EventSource(`${API_BASE}/api/ffmpeg/update/stream`)

    const cleanup = () => {
      try { es.close() } catch { /* safe close */ }
      setFfmpegUpdating(false)
      fetchFfmpegStatus({ forceLatest: true })
    }

    let lastEventAt = Date.now()
    const timeoutInterval = window.setInterval(() => {
      if (Date.now() - lastEventAt > 60_000) {
        setFfmpegLogLines((lines) => [...lines, 'ERROR: Update timed out — no response from server.'])
        window.clearInterval(timeoutInterval)
        cleanup()
      }
    }, 5_000)

    es.onmessage = (event) => {
      lastEventAt = Date.now()
      if (event.data) setFfmpegLogLines((lines) => [...lines, event.data])
    }
    es.addEventListener('info', (event) => {
      lastEventAt = Date.now()
      if (event.data) setFfmpegLogLines((lines) => [...lines, event.data])
    })
    es.addEventListener('error', (event) => {
      lastEventAt = Date.now()
      const message = typeof event?.data === 'string' && event.data ? event.data : t('settings.updateErrorOccurred')
      setFfmpegLogLines((lines) => [...lines, `ERROR: ${message}`])
    })
    es.addEventListener('end', (event) => {
      lastEventAt = Date.now()
      window.clearInterval(timeoutInterval)
      const ok = event?.data === 'done'
      setFfmpegLogLines((lines) => [...lines, ok ? t('settings.updateCompleted') : t('settings.updateFailed')])
      cleanup()
    })
    es.onerror = () => {
      lastEventAt = Date.now()
    }
  }

  /* ─── navigation ─── */

  const appUpdatePhase = String(appUpdateState?.phase || 'idle').trim()
  const appUpdateAvailable = appUpdatePhase === 'update-available' || appUpdatePhase === 'downloaded'

  const sections = useMemo(() => ([
    { key: 'general', label: t('settings.general'), icon: SettingsIcon, hasUpdate: appUpdateAvailable },
    { key: 'downloads', label: t('settings.sectionDownloads'), icon: DownloadIcon, hasUpdate: false },
    { key: 'network', label: t('settings.sectionNetwork'), icon: GlobeIcon, hasUpdate: false },
    { key: 'system', label: t('settings.sectionSystem'), icon: CpuIcon, hasUpdate: Boolean(ytInfo.outdated || ffmpegInfo.outdated) },
  ]), [appUpdateAvailable, ffmpegInfo.outdated, t, ytInfo.outdated])

  const sectionTitleMap = {
    general: t('settings.general'),
    downloads: t('settings.downloadsConfig'),
    network: t('settings.networkConfig'),
    system: t('settings.systemConfig'),
  }

  const sectionTitle = sectionTitleMap[section] || t('settings.general')

  /* ─── breadcrumb for system detail ─── */
  const breadcrumbSegments = useMemo(() => {
    if (section !== 'system' || !systemDetail) return null
    return [
      { label: t('settings.breadcrumbSettings'), onClick: () => { setSection('general'); setSystemDetail(null) } },
      { label: t('settings.breadcrumbSystem'), onClick: () => setSystemDetail(null) },
      { label: systemDetail === 'yt-dlp' ? 'yt-dlp' : 'ffmpeg' },
    ]
  }, [section, systemDetail, t])

  /* ─── reset ─── */

  const canResetSection = section === 'general' || section === 'downloads'
  const resetDisabled = section === 'downloads' ? downloadSettingsLoading : false

  const applyResetToCurrentSection = React.useCallback(() => {
    if (section === 'general') {
      setLanguage('en')
      setPreference(null)
      return
    }
    if (section === 'downloads') {
      const defaults = { ...DOWNLOAD_SETTINGS_DEFAULTS }
      setDownloadSettings(defaults)
      saveDownloadSettings(defaults).catch(() => {
        // error state is handled in saveDownloadSettings
      })
      const autoDefaults = { ...AUTO_DOWNLOAD_DEFAULTS }
      setAutoDownloadSettings(autoDefaults)
      saveAutoDownloadSettings(autoDefaults).catch(() => {
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

  /* ─── dialog close ─── */

  const isCloseBlocked = isAppUpdateDownloading || updating || ffmpegUpdating

  const handleDialogClose = React.useCallback(() => {
    if (resetConfirmOpen) {
      setResetConfirmOpen(false)
      return
    }
    if (isCloseBlocked) return
    onClose?.()
  }, [isCloseBlocked, onClose, resetConfirmOpen])

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
      disableEscapeKeyDown={isCloseBlocked}
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
          {/* ─── SIDEBAR ─── */}
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
                  disabled={isCloseBlocked}
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
              <List disablePadding sx={{ px: 2, pt: 1, pb: 2 }}>
                {sections.map((entry) => (
                  <ListItem key={entry.key} disablePadding sx={{ mb: 0.5 }}>
                    <ListItemButton
                      selected={section === entry.key}
                      onClick={() => {
                        setResetConfirmOpen(false)
                        setSection(entry.key)
                        setSystemDetail(null)
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

          {/* ─── CONTENT AREA ─── */}
          <Box sx={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}>
            {/* Header with breadcrumb or title */}
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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {/* Back button for system detail */}
                {section === 'system' && systemDetail && (
                  <IconButton
                    onClick={() => setSystemDetail(null)}
                    size="small"
                    sx={{
                      borderRadius: '8px', p: '6px', mr: 0.5,
                      color: 'text.secondary',
                      '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                    }}
                  >
                    <ChevronLeft size={18} />
                  </IconButton>
                )}
                {breadcrumbSegments ? (
                  <SettingsBreadcrumb segments={breadcrumbSegments} />
                ) : (
                  <Typography sx={{ fontWeight: 700, fontSize: 24, letterSpacing: '-0.5px' }}>{sectionTitle}</Typography>
                )}
              </Box>

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
                    '&:hover': { bgcolor: 'action.hover' },
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
                  showAppUpdateSection
                  selectSx={selectSx}
                  t={t}
                  appUpdateState={appUpdateState}
                  isElectronUpdaterAvailable={isElectronUpdaterAvailable}
                  checkForAppUpdates={checkForAppUpdates}
                  downloadAppUpdate={downloadAppUpdate}
                  installAppUpdate={installAppUpdate}
                  setAppAutoUpdateEnabled={setAppAutoUpdateEnabled}
                />
              )}

              {section === 'downloads' && (
                <DownloadsSettingsSection
                  downloadSettings={downloadSettings}
                  downloadSettingsLoading={downloadSettingsLoading}
                  downloadSettingsError={downloadSettingsError}
                  updateDownloadSettings={updateDownloadSettings}
                  autoDownloadSettings={autoDownloadSettings}
                  autoDownloadLoading={autoDownloadLoading}
                  autoDownloadError={autoDownloadError}
                  updateAutoDownloadSettings={updateAutoDownloadSettings}
                  selectSx={selectSx}
                  t={t}
                  isElectronRuntime={isElectronRuntime}
                />
              )}

              {section === 'network' && (
                <NetworkSettingsSection
                  cookieSettings={ytCookieSettings}
                  cookieSettingsLoading={ytCookieSettingsLoading}
                  cookieSettingsSaving={ytCookieSettingsSaving}
                  cookieSettingsError={ytCookieSettingsError}
                  onUpdateCookieSettings={updateYtCookieSettings}
                  onRefreshCookieSettings={fetchYtCookieSettings}
                  requestedFocusTarget={sectionFocusTarget}
                  requestedFocusRequestId={sectionFocusRequestId}
                  t={t}
                  isElectronRuntime={isElectronRuntime}
                />
              )}

              {section === 'system' && (
                <SystemSettingsSection
                  activeDetail={systemDetail}
                  onNavigateToDetail={(detail) => setSystemDetail(detail)}
                  onNavigateBack={() => setSystemDetail(null)}
                  ytInfo={ytInfo}
                  ffmpegInfo={ffmpegInfo}
                  ytAutoUpdateEnabled={toolUpdateSettings.ytDlpAutoUpdate}
                  ffmpegAutoUpdateEnabled={toolUpdateSettings.ffmpegAutoUpdate}
                  ytUpdating={updating}
                  ffmpegUpdating={ffmpegUpdating}
                  startYtUpdate={startUpdate}
                  startFfmpegUpdate={startFfmpegUpdate}
                  onToggleYtAutoUpdate={(enabled) => setToolAutoUpdateEnabled('ytDlp', enabled)}
                  onToggleFfmpegAutoUpdate={(enabled) => setToolAutoUpdateEnabled('ffmpeg', enabled)}
                  toolUpdateSettingsLoading={toolUpdateSettingsLoading}
                  toolUpdateSettingsSaving={toolUpdateSettingsSaving}
                  toolUpdateSettingsError={toolUpdateSettingsError}
                  onCheckYtUpdates={() => fetchStatus({ forceLatest: true })}
                  onCheckFfmpegUpdates={() => fetchFfmpegStatus({ forceLatest: true })}
                  ytLogLines={logLines}
                  ffmpegLogLines={ffmpegLogLines}
                  t={t}
                />
              )}
            </SimpleBarScrollArea>
          </Box>
        </Box>

        {/* ─── RESET CONFIRM OVERLAY ─── */}
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

export default function SettingsModal(props) {
  return <SettingsModalInner {...props} />
}
