import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Dialog, DialogContent, IconButton, List, ListItem, ListItemButton, Typography, Tooltip, Button, Menu, MenuItem, useMediaQuery } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { X, MoreHorizontal, Settings as SettingsIcon, Download as DownloadIcon, Globe as GlobeIcon, Cpu as CpuIcon } from 'lucide-react'
import { Sheet } from 'react-modal-sheet'
import { ColorModeContext } from '../providers/ColorModeProvider'
import { SettingsContext } from '../providers/SettingsProvider'
import { useI18n } from '../providers/I18nProvider'
import { defaultLanguage } from '../i18n/config'
import { getApiBase } from '../utils/metadata'
import GeneralSettingsSection from './settings-modal/GeneralSettingsSection'
import DownloadsSettingsSection from './settings-modal/DownloadsSettingsSection'
import NetworkSettingsSection from './settings-modal/NetworkSettingsSection'
import SystemSettingsSection from './settings-modal/SystemSettingsSection'
import SettingsBreadcrumb from './settings-modal/SettingsBreadcrumb'
import {
  AUTO_DOWNLOAD_RESET_FIELDS,
  DOWNLOAD_SUBSECTION_KEYS,
  DOWNLOAD_SUBSECTION_RESET_FIELDS,
  RESETTABLE_DOWNLOAD_SUBSECTIONS,
} from './settings-modal/downloadSubsections'
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

const SETTINGS_SAVE_DEBOUNCE_MS = 180
const SETTINGS_INTERACTION_TRANSITION_MS = 90
const SETTINGS_CONTENT_SWITCH_ANIMATION_MS = 120
const SETTINGS_SECTION_ORDER = Object.freeze(['general', 'downloads', 'network', 'system'])

function pickDefaultSettings(defaults, fieldNames) {
  return fieldNames.reduce((accumulator, key) => {
    if (Object.prototype.hasOwnProperty.call(defaults, key)) {
      accumulator[key] = defaults[key]
    }
    return accumulator
  }, {})
}

function shallowEqualObject(left, right) {
  if (left === right) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false

  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false

  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false
    if (!Object.is(left[key], right[key])) return false
  }

  return true
}

const DESKTOP_SETTINGS_DEFAULTS = Object.freeze({
  closeToTrayOnWindowClose: false,
  startOnSystemStartup: false,
  startupWindowMode: 'normal',
  startupSupported: true,
})

function normalizeDesktopSettingsPayload(input) {
  const raw = input && typeof input === 'object' ? input : {}
  const startupWindowMode = String(raw.startupWindowMode || '').trim().toLowerCase() === 'minimized'
    ? 'minimized'
    : 'normal'

  return {
    closeToTrayOnWindowClose: Boolean(raw.closeToTrayOnWindowClose),
    startOnSystemStartup: Boolean(raw.startOnSystemStartup),
    startupWindowMode,
    startupSupported: raw.startupSupported !== false,
  }
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
  const theme = useTheme()
  const isMobileLayout = useMediaQuery(theme.breakpoints.down('sm'))
  const { mode, setPreference } = useContext(ColorModeContext)
  const { language, setLanguage } = useContext(SettingsContext)
  const runtime = typeof window !== 'undefined' ? window.yloaderRuntime : null
  const isElectronRuntime = Boolean(runtime?.isElectron)
  const desktopSettingsApi = runtime?.desktopSettings
  const isDesktopSettingsAvailable = Boolean(isElectronRuntime && desktopSettingsApi)
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

  const resolveDownloadsSubsectionKey = React.useCallback((key) => {
    const raw = String(key || '').trim()
    if (raw === 'auto-download') return DOWNLOAD_SUBSECTION_KEYS.autoDownloadDefaults
    if (raw === 'downloader') return DOWNLOAD_SUBSECTION_KEYS.formatQuality
    return ''
  }, [])

  const [section, setSection] = useState(() => resolveSectionKey(requestedSection))
  const [sectionFocusTarget, setSectionFocusTarget] = useState(() => String(requestedFocusTarget || '').trim())
  const [sectionFocusRequestId, setSectionFocusRequestId] = useState(() => String(requestedFocusRequestId || '').trim())
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [sectionActionsAnchorEl, setSectionActionsAnchorEl] = useState(null)
  const [contentSwitchDirection, setContentSwitchDirection] = useState('forward')
  const [downloadsSubsection, setDownloadsSubsection] = useState(() => resolveDownloadsSubsectionKey(requestedSection))
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
  const toolUpdateSaveTimeoutRef = useRef(null)
  const [toolUpdateSettingsLoading, setToolUpdateSettingsLoading] = useState(false)
  const [toolUpdateSettingsSaving, setToolUpdateSettingsSaving] = useState(false)
  const [toolUpdateSettingsError, setToolUpdateSettingsError] = useState('')

  /* ─── auto download settings ─── */
  const [autoDownloadSettings, setAutoDownloadSettings] = useState(() => ({ ...AUTO_DOWNLOAD_DEFAULTS }))
  const autoDownloadSettingsRef = useRef(autoDownloadSettings)
  const autoDownloadSaveRequestIdRef = useRef(0)
  const autoDownloadSaveTimeoutRef = useRef(null)
  const [autoDownloadLoading, setAutoDownloadLoading] = useState(false)
  const [autoDownloadSaving, setAutoDownloadSaving] = useState(false)
  const [autoDownloadError, setAutoDownloadError] = useState('')

  /* ─── download settings ─── */
  const [downloadSettings, setDownloadSettings] = useState(() => ({ ...DOWNLOAD_SETTINGS_DEFAULTS }))
  const downloadSettingsRef = useRef(downloadSettings)
  const downloadSaveRequestIdRef = useRef(0)
  const downloadSaveTimeoutRef = useRef(null)
  const [downloadSettingsLoading, setDownloadSettingsLoading] = useState(false)
  const [downloadSettingsSaving, setDownloadSettingsSaving] = useState(false)
  const [downloadSettingsError, setDownloadSettingsError] = useState('')

  /* ─── cookie settings ─── */
  const [ytCookieSettings, setYtCookieSettings] = useState(() => ({ ...YT_DLP_COOKIE_SETTINGS_DEFAULTS }))
  const ytCookieSettingsRef = useRef(ytCookieSettings)
  const ytCookieSaveTimeoutRef = useRef(null)
  const [ytCookieSettingsLoading, setYtCookieSettingsLoading] = useState(false)
  const [ytCookieSettingsSaving, setYtCookieSettingsSaving] = useState(false)
  const [ytCookieSettingsError, setYtCookieSettingsError] = useState('')

  /* ─── electron desktop settings ─── */
  const [desktopSettings, setDesktopSettings] = useState(() => ({ ...DESKTOP_SETTINGS_DEFAULTS }))
  const desktopSettingsRef = useRef(desktopSettings)
  const desktopSettingsRequestIdRef = useRef(0)
  const [desktopSettingsLoading, setDesktopSettingsLoading] = useState(false)
  const [desktopSettingsSaving, setDesktopSettingsSaving] = useState(false)

  const isAppUpdateDownloading = appUpdateState?.phase === 'downloading'

  /* ─── ref syncs ─── */
  useEffect(() => { toolUpdateSettingsRef.current = toolUpdateSettings }, [toolUpdateSettings])
  useEffect(() => { autoDownloadSettingsRef.current = autoDownloadSettings }, [autoDownloadSettings])
  useEffect(() => { downloadSettingsRef.current = downloadSettings }, [downloadSettings])
  useEffect(() => { ytCookieSettingsRef.current = ytCookieSettings }, [ytCookieSettings])
  useEffect(() => { desktopSettingsRef.current = desktopSettings }, [desktopSettings])

  const scheduleDebouncedSave = React.useCallback((timeoutRef, action) => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null
      action()
    }, SETTINGS_SAVE_DEBOUNCE_MS)
  }, [])

  useEffect(() => () => {
    [
      toolUpdateSaveTimeoutRef,
      autoDownloadSaveTimeoutRef,
      downloadSaveTimeoutRef,
      ytCookieSaveTimeoutRef,
    ].forEach((timeoutRef) => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    })
  }, [])

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
        setToolUpdateSettings((current) => (shallowEqualObject(current, normalized) ? current : normalized))
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
    scheduleDebouncedSave(toolUpdateSaveTimeoutRef, () => {
      saveToolUpdateSettings(next).catch(() => {
        // error state is handled in saveToolUpdateSettings
      })
    })
  }, [saveToolUpdateSettings, scheduleDebouncedSave])

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
        setAutoDownloadSettings((current) => (shallowEqualObject(current, normalized) ? current : normalized))
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
    scheduleDebouncedSave(autoDownloadSaveTimeoutRef, () => {
      saveAutoDownloadSettings(next).catch(() => {
        // error state is handled in saveAutoDownloadSettings
      })
    })
  }, [saveAutoDownloadSettings, scheduleDebouncedSave])

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
        setDownloadSettings((current) => (shallowEqualObject(current, normalized) ? current : normalized))
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
    scheduleDebouncedSave(downloadSaveTimeoutRef, () => {
      saveDownloadSettings(next).catch(() => {
        // error state is handled in saveDownloadSettings
      })
    })
  }, [saveDownloadSettings, scheduleDebouncedSave])

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
      setYtCookieSettings((current) => (shallowEqualObject(current, normalized) ? current : normalized))
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
    scheduleDebouncedSave(ytCookieSaveTimeoutRef, () => {
      saveYtCookieSettings(next).catch(() => {
        // error state is handled in saveYtCookieSettings
      })
    })
  }, [saveYtCookieSettings, scheduleDebouncedSave])

  const fetchDesktopSettings = React.useCallback(async () => {
    if (!isDesktopSettingsAvailable || typeof desktopSettingsApi?.get !== 'function') {
      setDesktopSettings({ ...DESKTOP_SETTINGS_DEFAULTS })
      return
    }

    setDesktopSettingsLoading(true)

    try {
      const snapshot = await Promise.resolve(desktopSettingsApi.get())
      setDesktopSettings(normalizeDesktopSettingsPayload(snapshot))
    } catch {
      setDesktopSettings({ ...DESKTOP_SETTINGS_DEFAULTS })
    } finally {
      setDesktopSettingsLoading(false)
    }
  }, [desktopSettingsApi, isDesktopSettingsAvailable])

  const updateDesktopSettings = React.useCallback((changes) => {
    if (!isDesktopSettingsAvailable || typeof desktopSettingsApi?.update !== 'function') return

    const current = desktopSettingsRef.current || DESKTOP_SETTINGS_DEFAULTS
    const patch = typeof changes === 'function' ? changes(current) : changes
    if (!patch || typeof patch !== 'object') return

    const optimistic = normalizeDesktopSettingsPayload({ ...current, ...patch })
    setDesktopSettings(optimistic)

    const requestId = ++desktopSettingsRequestIdRef.current
    setDesktopSettingsSaving(true)

    Promise.resolve(desktopSettingsApi.update(patch))
      .then((snapshot) => {
        if (requestId !== desktopSettingsRequestIdRef.current) return
        setDesktopSettings(normalizeDesktopSettingsPayload(snapshot))
      })
      .catch(() => {
        if (requestId !== desktopSettingsRequestIdRef.current) return
        fetchDesktopSettings()
      })
      .finally(() => {
        if (requestId === desktopSettingsRequestIdRef.current) {
          setDesktopSettingsSaving(false)
        }
      })
  }, [desktopSettingsApi, fetchDesktopSettings, isDesktopSettingsAvailable])

  /* ─── lifecycle ─── */

  useEffect(() => {
    if (!open) return
    const resolvedSection = resolveSectionKey(requestedSection)
    setSection(resolvedSection)
    setSectionFocusTarget(String(requestedFocusTarget || '').trim())
    setSectionFocusRequestId(String(requestedFocusRequestId || `${Date.now()}`).trim())
    setResetConfirmOpen(false)
    setDownloadsSubsection(resolveDownloadsSubsectionKey(requestedSection))
    // Auto-drill into ffmpeg detail if legacy 'ffmpeg' key was requested
    const rawSection = String(requestedSection || '').trim()
    setSystemDetail(rawSection === 'ffmpeg' ? 'ffmpeg' : null)
  }, [
    open,
    requestedSection,
    requestedFocusRequestId,
    requestedFocusTarget,
    resolveDownloadsSubsectionKey,
    resolveSectionKey,
  ])

  useEffect(() => {
    if (!open || !isDesktopSettingsAvailable) return undefined

    fetchDesktopSettings()

    const unsubscribe = desktopSettingsApi?.onEvent?.((eventEnvelope) => {
      const nextState = eventEnvelope?.state || eventEnvelope?.payload || eventEnvelope
      setDesktopSettings(normalizeDesktopSettingsPayload(nextState))
    })

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [desktopSettingsApi, fetchDesktopSettings, isDesktopSettingsAvailable, open])

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
    system: t('settings.sectionSystem'),
  }

  const sectionTitle = sectionTitleMap[section] || t('settings.general')

  const downloadSubsectionTitleMap = {
    [DOWNLOAD_SUBSECTION_KEYS.formatQuality]: t('settings.downloadsFormatTitle'),
    [DOWNLOAD_SUBSECTION_KEYS.filenameConventions]: t('settings.downloadsNamingTitle'),
    [DOWNLOAD_SUBSECTION_KEYS.advancedDownloadSettings]: t('settings.downloadsAdvancedTitle'),
    [DOWNLOAD_SUBSECTION_KEYS.autoDownloadDefaults]: t('settings.downloadsAutoDefaultsTitle'),
  }

  const activeDownloadsSubsectionTitle = downloadSubsectionTitleMap[downloadsSubsection] || ''

  const handleNavigateToDownloadsSubsection = React.useCallback((nextSubsection) => {
    const next = String(nextSubsection || '').trim()
    const leavingSubsection = Boolean(downloadsSubsection) && !next
    const enteringSubsection = !downloadsSubsection && Boolean(next)

    if (leavingSubsection) setContentSwitchDirection('backward')
    else if (enteringSubsection) setContentSwitchDirection('forward')

    setDownloadsSubsection(next)
  }, [downloadsSubsection])

  const handleNavigateToSystemDetail = React.useCallback((detail) => {
    const nextDetail = String(detail || '').trim()
    if (!nextDetail) return

    setContentSwitchDirection('forward')
    setSystemDetail(nextDetail)
  }, [])

  const handleNavigateBackFromSystemDetail = React.useCallback(() => {
    if (!systemDetail) return

    setContentSwitchDirection('backward')
    setSystemDetail(null)
  }, [systemDetail])

  /* ─── breadcrumb for detail views ─── */
  const activeBreadcrumbSegments = useMemo(() => {
    if (section === 'system' && systemDetail) {
      return [
        { label: t('settings.breadcrumbSystem'), onClick: handleNavigateBackFromSystemDetail },
        { label: systemDetail === 'yt-dlp' ? 'yt-dlp' : 'ffmpeg' },
      ]
    }

    if (section === 'downloads' && downloadsSubsection) {
      return [
        { label: t('settings.downloadsConfig'), onClick: () => handleNavigateToDownloadsSubsection('') },
        { label: activeDownloadsSubsectionTitle || t('settings.downloadsConfig') },
      ]
    }

    return null
  }, [
    activeDownloadsSubsectionTitle,
    downloadsSubsection,
    handleNavigateBackFromSystemDetail,
    handleNavigateToDownloadsSubsection,
    section,
    systemDetail,
    t,
  ])

  /* ─── reset ─── */

  const canResetDownloadsSubsection = (
    section === 'downloads'
    && RESETTABLE_DOWNLOAD_SUBSECTIONS.includes(downloadsSubsection)
  )

  const canResetSection = section === 'general' || canResetDownloadsSubsection

  const resetDisabled = section === 'general'
    ? false
    : downloadsSubsection === DOWNLOAD_SUBSECTION_KEYS.autoDownloadDefaults
      ? autoDownloadLoading || autoDownloadSaving
      : downloadSettingsLoading || downloadSettingsSaving

  const canShowSectionActions = canResetSection && !resetDisabled

  const resetSectionTitle = (section === 'downloads' && canResetDownloadsSubsection)
    ? (activeDownloadsSubsectionTitle || t('settings.downloadsConfig'))
    : sectionTitle

  const applyResetToCurrentSection = React.useCallback(() => {
    if (section === 'general') {
      setLanguage(defaultLanguage)
      setPreference(null)
      if (isDesktopSettingsAvailable) {
        updateDesktopSettings({
          closeToTrayOnWindowClose: false,
          startOnSystemStartup: false,
          startupWindowMode: 'normal',
        })
      }
      return
    }

    if (section !== 'downloads' || !canResetDownloadsSubsection) return

    if (downloadsSubsection === DOWNLOAD_SUBSECTION_KEYS.autoDownloadDefaults) {
      updateAutoDownloadSettings(pickDefaultSettings(AUTO_DOWNLOAD_DEFAULTS, AUTO_DOWNLOAD_RESET_FIELDS))
      return
    }

    const resetFields = DOWNLOAD_SUBSECTION_RESET_FIELDS[downloadsSubsection]
    if (!Array.isArray(resetFields) || resetFields.length === 0) return

    updateDownloadSettings(pickDefaultSettings(DOWNLOAD_SETTINGS_DEFAULTS, resetFields))
  }, [
    canResetDownloadsSubsection,
    downloadsSubsection,
    isDesktopSettingsAvailable,
    section,
    setLanguage,
    setPreference,
    updateAutoDownloadSettings,
    updateDownloadSettings,
    updateDesktopSettings,
  ])

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
    setSectionActionsAnchorEl(null)
    onClose?.()
  }, [isCloseBlocked, onClose, resetConfirmOpen])

  const sectionActionsMenuOpen = Boolean(sectionActionsAnchorEl)

  const handleOpenSectionActionsMenu = React.useCallback((event) => {
    if (!canShowSectionActions) return
    setSectionActionsAnchorEl(event.currentTarget)
  }, [canShowSectionActions])

  const handleCloseSectionActionsMenu = React.useCallback(() => {
    setSectionActionsAnchorEl(null)
  }, [])

  const handleRequestResetFromActionsMenu = React.useCallback(() => {
    setSectionActionsAnchorEl(null)
    handleRequestResetSection()
  }, [handleRequestResetSection])

  useEffect(() => {
    if (canShowSectionActions || !sectionActionsAnchorEl) return
    setSectionActionsAnchorEl(null)
  }, [canShowSectionActions, sectionActionsAnchorEl])

  const reducedHoverTransitionSx = useMemo(() => ({
    '& .MuiButtonBase-root, & .MuiButton-root, & .MuiIconButton-root, & .MuiListItemButton-root, & .MuiOutlinedInput-root, & .MuiOutlinedInput-notchedOutline, & .MuiPaper-root, & .MuiSwitch-switchBase, & .MuiSlider-thumb, & .MuiSlider-track, & .MuiSlider-rail, & .MuiChip-root': {
      transitionDuration: `${SETTINGS_INTERACTION_TRANSITION_MS}ms !important`,
      transitionTimingFunction: 'ease-out !important',
    },
  }), [])

  const sectionSwitchAnimationSx = useMemo(() => ({
    animation: `${contentSwitchDirection === 'backward' ? 'settingsContentSlideBackward' : 'settingsContentSlideForward'} ${SETTINGS_CONTENT_SWITCH_ANIMATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
    willChange: 'opacity, transform',
    minWidth: 0,
    maxWidth: '100%',
    '@keyframes settingsContentSlideForward': {
      from: {
        opacity: 0,
        transform: 'translateX(14px)',
      },
      to: {
        opacity: 1,
        transform: 'translateX(0)',
      },
    },
    '@keyframes settingsContentSlideBackward': {
      from: {
        opacity: 0,
        transform: 'translateX(-14px)',
      },
      to: {
        opacity: 1,
        transform: 'translateX(0)',
      },
    },
  }), [contentSwitchDirection])

  const selectSx = useMemo(() => ({
    fontSize: isMobileLayout ? 14 : 13,
    height: isMobileLayout ? 36 : 32,
    minWidth: isMobileLayout ? 0 : 140,
    width: isMobileLayout ? '100%' : 'auto',
    borderRadius: '4px',
    '& .MuiOutlinedInput-root': { transition: `border-color ${SETTINGS_INTERACTION_TRANSITION_MS}ms ease-out, background-color ${SETTINGS_INTERACTION_TRANSITION_MS}ms ease-out` },
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider', transition: `border-color ${SETTINGS_INTERACTION_TRANSITION_MS}ms ease-out` },
    '& .MuiSelect-select': { py: isMobileLayout ? '7px' : '6px', px: 1.5 },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'text.disabled' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: 1 },
  }), [isMobileLayout])

  const resetConfirmTitleId = 'settings-reset-confirm-title'
  const resetConfirmDescriptionId = 'settings-reset-confirm-description'

  const handleSectionSelect = React.useCallback((nextSection) => {
    setResetConfirmOpen(false)
    setSectionActionsAnchorEl(null)

    const currentIndex = SETTINGS_SECTION_ORDER.indexOf(section)
    const nextIndex = SETTINGS_SECTION_ORDER.indexOf(nextSection)
    if (currentIndex !== -1 && nextIndex !== -1) {
      setContentSwitchDirection(nextIndex >= currentIndex ? 'forward' : 'backward')
    } else {
      setContentSwitchDirection('forward')
    }

    setSection(nextSection)
    setDownloadsSubsection('')
    setSystemDetail(null)
    setSectionFocusTarget('')
    setSectionFocusRequestId(String(Date.now()))
  }, [section])

  const activeContentViewKey = `${section}:${downloadsSubsection || 'overview'}:${systemDetail || 'overview'}`

  const renderSectionContent = () => {
    if (section === 'general') {
      return (
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
          isMobileLayout={isMobileLayout}
          showDesktopSettings={isDesktopSettingsAvailable}
          desktopSettings={desktopSettings}
          desktopSettingsLoading={desktopSettingsLoading || desktopSettingsSaving}
          onUpdateDesktopSettings={updateDesktopSettings}
        />
      )
    }

    if (section === 'downloads') {
      return (
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
          isMobileLayout={isMobileLayout}
          activeSubsection={downloadsSubsection}
          onNavigateToSubsection={handleNavigateToDownloadsSubsection}
        />
      )
    }

    if (section === 'network') {
      return (
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
          isMobileLayout={isMobileLayout}
        />
      )
    }

    if (section === 'system') {
      return (
        <SystemSettingsSection
          activeDetail={systemDetail}
          onNavigateToDetail={handleNavigateToSystemDetail}
          onNavigateBack={handleNavigateBackFromSystemDetail}
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
          isMobileLayout={isMobileLayout}
        />
      )
    }

    return null
  }

  const renderResetConfirmOverlay = (compactLayout = false) => {
    if (!resetConfirmOpen || !canResetSection) return null

    return (
      <Box
        onClick={handleCancelResetSection}
        sx={(themeValue) => ({
          position: 'absolute',
          inset: 0,
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: compactLayout ? 1.5 : 2,
          bgcolor: themeValue.palette.mode === 'dark' ? 'rgba(0,0,0,0.62)' : 'rgba(17,24,39,0.24)',
        })}
      >
        <Box
          role="dialog"
          aria-modal="true"
          aria-labelledby={resetConfirmTitleId}
          aria-describedby={resetConfirmDescriptionId}
          onClick={(event) => event.stopPropagation()}
          sx={(themeValue) => ({
            width: compactLayout ? 'min(460px, 100%)' : 'min(420px, 100%)',
            borderRadius: '12px',
            p: compactLayout ? 2 : 2.5,
            bgcolor: themeValue.palette.mode === 'dark' ? '#111111' : '#ffffff',
            border: `1px solid ${themeValue.palette.divider}`,
            boxShadow: themeValue.palette.mode === 'dark' ? '0 18px 32px rgba(0,0,0,0.6)' : '0 18px 30px rgba(0,0,0,0.16)',
          })}
        >
          <Typography id={resetConfirmTitleId} sx={{ fontWeight: 700, fontSize: 18, mb: 1 }}>
            {t('settings.resetConfirmTitle')}
          </Typography>
          <Typography id={resetConfirmDescriptionId} sx={{ color: 'text.secondary', fontSize: 14, lineHeight: 1.5 }}>
            {t('settings.resetConfirmDescription', { section: resetSectionTitle })}
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
    )
  }

  const renderSectionActionsMenu = () => {
    if (!canShowSectionActions) return null

    return (
    <Menu
      id="settings-section-actions-menu"
      anchorEl={sectionActionsAnchorEl}
      open={sectionActionsMenuOpen}
      onClose={handleCloseSectionActionsMenu}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      PaperProps={{
        sx: {
          minWidth: 200,
          borderRadius: '10px',
          border: `1px solid ${theme.palette.divider}`,
          boxShadow: theme.palette.mode === 'dark'
            ? '0 12px 26px rgba(0,0,0,0.45)'
            : '0 10px 22px rgba(0,0,0,0.15)',
        },
      }}
    >
      <MenuItem
        onClick={handleRequestResetFromActionsMenu}
        sx={{ fontSize: 13.5 }}
      >
        {t('settings.resetToDefaults')}
      </MenuItem>
    </Menu>
    )
  }

  if (isMobileLayout) {
    return (
      <Sheet
        isOpen={open}
        onClose={handleDialogClose}
        disableDismiss={isCloseBlocked}
        disableDrag={isCloseBlocked}
        detent="full"
        snapPoints={[0, 0.58, 1]}
        initialSnap={2}
      >
        <Sheet.Container
          style={{
            borderTopLeftRadius: '16px',
            borderTopRightRadius: '16px',
            background: theme.palette.mode === 'dark' ? '#000000' : '#f2f2f7',
            boxShadow: theme.palette.mode === 'dark'
              ? '0 -1px 0 rgba(255,255,255,0.12), 0 -12px 36px rgba(0,0,0,0.45)'
              : '0 -12px 30px rgba(0,0,0,0.18)',
          }}
        >
          <Sheet.Header />
          <Sheet.Content>
            <Box
              sx={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                height: '100%',
                ...reducedHoverTransitionSx,
              }}
            >
              <Box
                sx={{
                  px: 2,
                  pt: 0.25,
                  pb: 1.25,
                  borderBottom: `1px solid ${theme.palette.divider}`,
                  flexShrink: 0,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  <Box sx={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', height: 24 }}>
                    {activeBreadcrumbSegments ? (
                      <SettingsBreadcrumb segments={activeBreadcrumbSegments} isMobileLayout />
                    ) : (
                      <Typography sx={{ fontWeight: 700, fontSize: 20, letterSpacing: '-0.3px', lineHeight: 1, display: 'inline-flex', alignItems: 'center', height: '100%' }}>{sectionTitle}</Typography>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.35 }}>
                    {canShowSectionActions && (
                      <IconButton
                        onClick={handleOpenSectionActionsMenu}
                        size="small"
                        aria-label={t('settings.moreActionsAria')}
                        sx={{
                          borderRadius: '8px',
                          p: '6px',
                          color: 'text.secondary',
                          '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                        }}
                      >
                        <MoreHorizontal size={17} />
                      </IconButton>
                    )}
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
                      <X size={18} />
                    </IconButton>
                  </Box>
                </Box>

                <Box
                  sx={{
                    mt: 1.25,
                    display: 'flex',
                    gap: 0.75,
                    overflowX: 'auto',
                    pb: 0.25,
                    scrollbarWidth: 'none',
                    '&::-webkit-scrollbar': { display: 'none' },
                  }}
                >
                  {sections.map((entry) => (
                    <Button
                      key={entry.key}
                      variant={section === entry.key ? 'contained' : 'outlined'}
                      size="small"
                      onClick={() => handleSectionSelect(entry.key)}
                      sx={{
                        textTransform: 'none',
                        whiteSpace: 'nowrap',
                        borderRadius: '999px',
                        px: 1.25,
                        minWidth: 'auto',
                        minHeight: 32,
                        fontWeight: section === entry.key ? 700 : 600,
                        fontSize: 12.5,
                        borderColor: 'divider',
                        color: section === entry.key ? undefined : 'text.secondary',
                        boxShadow: 'none',
                        ...(section === entry.key
                          ? {}
                          : { '&:hover': { borderColor: 'text.disabled', bgcolor: 'action.hover' } }),
                      }}
                      startIcon={<entry.icon size={15} strokeWidth={2.5} />}
                    >
                      {entry.label}
                    </Button>
                  ))}
                </Box>

              </Box>

              <Box
                sx={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  WebkitOverflowScrolling: 'touch',
                  pb: 'calc(0.5rem + env(safe-area-inset-bottom))',
                }}
              >
                <Box sx={{ overflow: 'hidden', minWidth: 0, maxWidth: '100%' }}>
                  <Box key={activeContentViewKey} sx={sectionSwitchAnimationSx}>
                    {renderSectionContent()}
                  </Box>
                </Box>
              </Box>

              {renderResetConfirmOverlay(true)}

              {renderSectionActionsMenu()}
            </Box>
          </Sheet.Content>
        </Sheet.Container>
        <Sheet.Backdrop
          style={{
            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.62)' : 'rgba(17,24,39,0.35)',
          }}
        />
      </Sheet>
    )
  }

  return (
    <Dialog
      open={open}
      onClose={handleDialogClose}
      disableEscapeKeyDown={isCloseBlocked}
      fullWidth
      maxWidth="md"
      PaperProps={{
        sx: (themeValue) => ({
          borderRadius: '12px',
          overflow: 'hidden',
          bgcolor: themeValue.palette.mode === 'dark' ? '#000000' : '#f2f2f7',
          backgroundImage: 'none',
          boxShadow: themeValue.palette.mode === 'dark' ? '0 0 0 1px rgba(255,255,255,0.1), 0 24px 48px rgba(0,0,0,0.5)' : '0 24px 48px rgba(0,0,0,0.15)',
        }),
      }}
    >
      <DialogContent
        sx={{
          p: 0,
          position: 'relative',
          '&:first-of-type': { pt: 0 },
          ...reducedHoverTransitionSx,
        }}
      >
        <Box sx={{ display: 'flex', height: 640 }}>
          {/* ─── SIDEBAR ─── */}
          <Box sx={(themeValue) => ({
            width: 240,
            flexShrink: 0,
            borderRight: `1px solid ${themeValue.palette.divider}`,
            bgcolor: themeValue.palette.mode === 'dark' ? '#1c1c1e' : '#fbfbfb',
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
                      onClick={() => handleSectionSelect(entry.key)}
                      sx={(themeValue) => ({
                        borderRadius: '8px',
                        py: '6px',
                        px: 1,
                        '&.Mui-selected': {
                          bgcolor: themeValue.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                          '&:hover': { bgcolor: themeValue.palette.mode === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)' },
                        },
                        '&:hover': { bgcolor: themeValue.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' },
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
          <Box
            sx={{
              flex: 1,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            {/* Header with breadcrumb or title */}
            <Box sx={(themeValue) => ({
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
              bgcolor: themeValue.palette.mode === 'dark' ? '#000000' : '#f2f2f7',
            })}>
              <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, height: 28 }}>
                {activeBreadcrumbSegments ? (
                  <SettingsBreadcrumb segments={activeBreadcrumbSegments} isMobileLayout={false} />
                ) : (
                  <Typography sx={{ fontWeight: 700, fontSize: 24, letterSpacing: '-0.5px', lineHeight: 1, display: 'inline-flex', alignItems: 'center', height: '100%' }}>{sectionTitle}</Typography>
                )}
              </Box>

              {canShowSectionActions && (
                <IconButton
                  onClick={handleOpenSectionActionsMenu}
                  size="small"
                  aria-label={t('settings.moreActionsAria')}
                  sx={{
                    borderRadius: '8px',
                    p: '6px',
                    color: 'text.secondary',
                    '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                  }}
                >
                  <MoreHorizontal size={17} />
                </IconButton>
              )}
            </Box>

            <SimpleBarScrollArea sx={{ flex: 1, minHeight: 0 }} hideHorizontal>
              <Box sx={{ overflow: 'hidden', minWidth: 0, maxWidth: '100%' }}>
                <Box key={activeContentViewKey} sx={sectionSwitchAnimationSx}>
                  {renderSectionContent()}
                </Box>
              </Box>
            </SimpleBarScrollArea>
          </Box>
        </Box>

        {renderResetConfirmOverlay()}

        {renderSectionActionsMenu()}
      </DialogContent>
    </Dialog>
  )
}

export default function SettingsModal(props) {
  return <SettingsModalInner {...props} />
}
