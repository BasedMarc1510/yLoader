import React from 'react'
import { Box } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { useI18n } from '../../providers/I18nProvider'
import { getApiBase } from '../../utils/metadata'
import { normalizeMultiLinksValue } from '../../utils/multiLinks'
import {
  DOWNLOADER_MULTI_IMPORT_STORAGE_PREFIX,
  consumeMultiImportPayload,
} from '../../utils/multiImportStorage'
import {
  normalizeDownloadSettings,
  resolveDownloadTargetSettings,
} from '../../utils/downloadSettings'
import { openSettingsModal } from '../home/settingsBridge'
import buildServices from './buildServices'
import MultiEntryGroups from './multi/MultiEntryGroups'
import useMultiEntries from './multi/useMultiEntries'
import SimpleBarScrollArea from '../../components/SimpleBarScrollArea'
import {
  ENTRY_DOWNLOAD_STATUS,
  ENTRY_META_STATE,
  countUnsupportedEntries,
  normalizeDownloadType,
} from './multi/entryUtils'
import MultiDownloaderHeader from './multi/components/MultiDownloaderHeader'
import MultiDownloaderFooter from './multi/components/MultiDownloaderFooter'

function normalizeProgress(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

function resolveValidEntryType(entry, fallback = 'audio') {
  const normalizedFallback = normalizeDownloadType(fallback, 'audio')
  if (!entry || entry.metaState !== ENTRY_META_STATE.ready) return normalizedFallback
  if (entry.supportedTypes?.includes(normalizedFallback)) return normalizedFallback
  if (entry.supportedTypes?.includes('audio')) return 'audio'
  if (entry.supportedTypes?.length) return entry.supportedTypes[0]
  return normalizedFallback
}

function updateEntryById(previousEntries, entryId, updater) {
  return previousEntries.map((entry) => {
    if (entry.id !== entryId) return entry
    return updater(entry)
  })
}

export default function MultiDownloader({
  routeSearch = '',
  routeToken = 0,
  tabsReady = true,
  onNavigate,
  onTabStateChange,
}) {
  const { t: i18nT } = useI18n()
  const theme = useTheme()
  const mode = theme.palette.mode
  const services = React.useMemo(() => buildServices(i18nT, mode), [i18nT, mode])

  const runtime = typeof window !== 'undefined' ? window.yloaderRuntime : null
  const isElectronRuntime = Boolean(runtime?.isElectron)
  const runtimeDownloadsPath = String(runtime?.downloadsPath || '').trim()

  const [globalDownloadType, setGlobalDownloadType] = React.useState('audio')
  const [linkInput, setLinkInput] = React.useState('')
  const [downloadDirectory, setDownloadDirectory] = React.useState('')
  const [downloadSettings, setDownloadSettings] = React.useState(() => normalizeDownloadSettings({}))
  const [settingsLoaded, setSettingsLoaded] = React.useState(false)
  const [controlsExpanded, setControlsExpanded] = React.useState(false)

  const importedRouteKeyRef = React.useRef('')
  const controllersRef = React.useRef(new Map())
  const directoryCustomizedRef = React.useRef(false)

  const {
    entries,
    setEntries,
    appendLinks,
    replaceLinks,
    removeEntry,
  } = useMultiEntries({
    i18nT,
    initialDownloadType: 'audio',
  })

  React.useEffect(() => {
    let cancelled = false

    const loadDownloadSettings = async () => {
      let resolvedSettings = normalizeDownloadSettings({})

      try {
        const apiBase = getApiBase()
        const response = await fetch(`${apiBase}/api/download/settings`)
        if (response.ok) {
          const payload = await response.json()
          resolvedSettings = normalizeDownloadSettings(payload)
        }
      } catch {
        resolvedSettings = normalizeDownloadSettings({})
      }

      if (cancelled) return

      setDownloadSettings(resolvedSettings)
      setSettingsLoaded(true)
    }

    loadDownloadSettings()

    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (directoryCustomizedRef.current) return

    const target = resolveDownloadTargetSettings(downloadSettings, globalDownloadType)
    const defaultDirectory = String(target?.directoryPath || runtimeDownloadsPath || '').trim()
    setDownloadDirectory(defaultDirectory)
  }, [downloadSettings, globalDownloadType, runtimeDownloadsPath])

  React.useEffect(() => {
    if (!tabsReady) return

    const params = new URLSearchParams(String(routeSearch || '').trim())
    const isMultiRoute = String(params.get('multiDownload') || '').trim() === '1'
    if (!isMultiRoute) return

    const token = String(params.get('multiImportToken') || '').trim()
    const inlineLinks = String(params.get('links') || '').trim()
    const importKey = `${routeToken}:${token}:${inlineLinks}`

    if (!token && !inlineLinks) return
    if (importedRouteKeyRef.current === importKey) return

    const importedValue = token
      ? consumeMultiImportPayload(DOWNLOADER_MULTI_IMPORT_STORAGE_PREFIX, token)
      : inlineLinks
    const normalizedValue = normalizeMultiLinksValue(importedValue)
    if (!normalizedValue) return

    importedRouteKeyRef.current = importKey
    replaceLinks(normalizedValue, globalDownloadType)
    setLinkInput('')
  }, [globalDownloadType, replaceLinks, routeSearch, routeToken, tabsReady])

  const loadingCount = React.useMemo(
    () => entries.filter((entry) => entry.metaState === ENTRY_META_STATE.loading).length,
    [entries]
  )
  const readyCount = React.useMemo(
    () => entries.filter((entry) => entry.metaState === ENTRY_META_STATE.ready).length,
    [entries]
  )
  const invalidCount = React.useMemo(
    () => entries.filter((entry) => entry.metaState === ENTRY_META_STATE.invalid || entry.metaState === ENTRY_META_STATE.error).length,
    [entries]
  )
  const activeCount = React.useMemo(
    () => entries.filter((entry) => entry.download?.active || entry.download?.status === ENTRY_DOWNLOAD_STATUS.queued || entry.download?.status === ENTRY_DOWNLOAD_STATUS.downloading).length,
    [entries]
  )
  const completeCount = React.useMemo(
    () => entries.filter((entry) => entry.download?.status === ENTRY_DOWNLOAD_STATUS.complete).length,
    [entries]
  )
  
  const queueSummary = React.useMemo(() => {
    if (activeCount > 0) return i18nT('multiDownloader.counterActive', { count: activeCount })
    return ''
  }, [activeCount, i18nT])

  const downloadableEntries = React.useMemo(() => entries.filter((entry) => (
    entry.metaState === ENTRY_META_STATE.ready
    && Array.isArray(entry.supportedTypes)
    && entry.supportedTypes.includes(entry.selectedType)
  )), [entries])

  const startableEntries = React.useMemo(() => downloadableEntries.filter((entry) => (
    entry.download?.status !== ENTRY_DOWNLOAD_STATUS.complete
    && entry.download?.status !== ENTRY_DOWNLOAD_STATUS.downloading
    && entry.download?.status !== ENTRY_DOWNLOAD_STATUS.queued
    && !entry.download?.active
  )), [downloadableEntries])

  const overallProgress = React.useMemo(() => {
    if (!downloadableEntries.length) return 0

    const total = downloadableEntries.reduce((sum, entry) => {
      if (entry.download?.status === ENTRY_DOWNLOAD_STATUS.complete) {
        return sum + 100
      }

      return sum + normalizeProgress(entry.download?.progress)
    }, 0)

    return normalizeProgress(total / downloadableEntries.length)
  }, [downloadableEntries])

  const unsupportedCountForGlobalType = React.useMemo(
    () => countUnsupportedEntries(entries, globalDownloadType),
    [entries, globalDownloadType]
  )

  React.useEffect(() => {
    const anyActive = activeCount > 0

    onTabStateChange?.({
      pageTitle: i18nT('multiDownloader.tabTitleWithCount', { count: entries.length }),
      loading: loadingCount > 0,
      download: {
        active: anyActive,
        progress: anyActive ? overallProgress : 0,
        stage: anyActive ? 'downloading' : '',
        title: i18nT('multiDownloader.tabTitle'),
      },
    })
  }, [activeCount, entries.length, i18nT, loadingCount, onTabStateChange, overallProgress])

  React.useEffect(() => () => {
    onTabStateChange?.({
      loading: false,
      download: {
        active: false,
        progress: 0,
        stage: '',
        title: '',
      },
    })
  }, [onTabStateChange])

  const handleAddLinks = React.useCallback(() => {
    const normalized = normalizeMultiLinksValue(linkInput)
    if (!normalized) return

    const added = appendLinks(normalized, globalDownloadType)
    if (added > 0) {
      setLinkInput('')
      setControlsExpanded(false)
    }
  }, [appendLinks, globalDownloadType, linkInput])

  const handleGlobalTypeChange = React.useCallback((event) => {
    const nextType = normalizeDownloadType(event?.target?.value, 'audio')
    setGlobalDownloadType(nextType)

    setEntries((previousEntries) => previousEntries.map((entry) => {
      if (entry.metaState !== ENTRY_META_STATE.ready) return entry
      if (!entry.supportedTypes?.includes(nextType)) return entry

      return {
        ...entry,
        selectedType: nextType,
      }
    }))
  }, [setEntries])

  const handleEntryTypeChange = React.useCallback((entryId, nextType) => {
    setEntries((previousEntries) => updateEntryById(previousEntries, entryId, (entry) => ({
      ...entry,
      selectedType: resolveValidEntryType(entry, nextType),
    })))
  }, [setEntries])

  const handleToggleExpanded = React.useCallback((entryId) => {
    setEntries((previousEntries) => updateEntryById(previousEntries, entryId, (entry) => ({
      ...entry,
      expanded: !entry.expanded,
    })))
  }, [setEntries])

  const handleRemoveEntry = React.useCallback((entryId) => {
    controllersRef.current.delete(entryId)
    removeEntry(entryId)
  }, [removeEntry])

  const handleRegisterController = React.useCallback((entryId, controller) => {
    if (!entryId) return
    if (!controller || typeof controller.startDownload !== 'function') {
      controllersRef.current.delete(entryId)
      return
    }

    controllersRef.current.set(entryId, controller)
  }, [])

  const handleDownloadStateChange = React.useCallback((entryId, state) => {
    const nextProgress = normalizeProgress(state?.progress)
    const nextStage = String(state?.stage || '').trim()
    const nextActive = Boolean(state?.active)
    const nextFormat = state?.format ? String(state.format).toUpperCase() : undefined

    setEntries((previousEntries) => updateEntryById(previousEntries, entryId, (entry) => {
      const currentStatus = entry.download?.status || ENTRY_DOWNLOAD_STATUS.idle

      let updatedEntry = {
        ...entry,
        download: {
          ...entry.download,
          active: nextActive,
          progress: nextProgress,
          stage: nextStage,
          status: nextActive ? ENTRY_DOWNLOAD_STATUS.downloading : currentStatus,
        },
      }

      if (nextFormat !== undefined) {
        updatedEntry.selectedFormat = nextFormat
      }

      if (
        !nextActive
        && !nextStage
        && nextProgress === 0
        && (currentStatus === ENTRY_DOWNLOAD_STATUS.complete || currentStatus === ENTRY_DOWNLOAD_STATUS.failed)
        && entry.selectedFormat === updatedEntry.selectedFormat
      ) {
        return entry
      }

      return updatedEntry
    }))
  }, [setEntries])

  const handleDownloadEvent = React.useCallback((entryId, event) => {
    const eventType = String(event?.type || '').trim().toLowerCase()

    setEntries((previousEntries) => updateEntryById(previousEntries, entryId, (entry) => {
      if (eventType === 'start') {
        return {
          ...entry,
          download: {
            ...entry.download,
            status: ENTRY_DOWNLOAD_STATUS.downloading,
            active: true,
            stage: 'starting',
            errorMessage: '',
            completedFile: null,
          },
        }
      }

      if (eventType === 'complete') {
        return {
          ...entry,
          download: {
            ...entry.download,
            status: ENTRY_DOWNLOAD_STATUS.complete,
            active: false,
            progress: 100,
            stage: 'complete',
            errorMessage: '',
            completedFile: event?.payload || null,
          },
        }
      }

      if (eventType === 'error') {
        return {
          ...entry,
          download: {
            ...entry.download,
            status: ENTRY_DOWNLOAD_STATUS.failed,
            active: false,
            stage: '',
            errorMessage: String(event?.message || i18nT('downloader.errorDownloadFailed')).trim(),
            completedFile: null,
          },
        }
      }

      return entry
    }))
  }, [i18nT, setEntries])

  const handleStartAllDownloads = React.useCallback(() => {
    if (!startableEntries.length) return

    const startableEntryIds = new Set(startableEntries.map((entry) => entry.id))

    setEntries((previousEntries) => previousEntries.map((entry) => {
      if (!startableEntryIds.has(entry.id)) return entry

      return {
        ...entry,
        download: {
          ...entry.download,
          status: ENTRY_DOWNLOAD_STATUS.queued,
          active: false,
          progress: 0,
          stage: 'queued',
          errorMessage: '',
          completedFile: null,
        },
      }
    }))

    const triggerEntryDownload = (entry, attempt = 0) => {
      const controller = controllersRef.current.get(entry.id)

      if (!controller || typeof controller.startDownload !== 'function') {
        if (attempt < 8) {
          setTimeout(() => {
            triggerEntryDownload(entry, attempt + 1)
          }, 80)
          return
        }

        setEntries((previousEntries) => updateEntryById(previousEntries, entry.id, (currentEntry) => ({
          ...currentEntry,
          download: {
            ...currentEntry.download,
            status: ENTRY_DOWNLOAD_STATUS.failed,
            active: false,
            stage: '',
            errorMessage: i18nT('multiDownloader.errorDownloadControlUnavailable'),
          },
        })))
        return
      }

      void Promise.resolve(controller.startDownload(entry.selectedType)).catch((error) => {
        const message = String(error?.message || i18nT('downloader.errorDownloadFailed')).trim()
        setEntries((previousEntries) => updateEntryById(previousEntries, entry.id, (currentEntry) => ({
          ...currentEntry,
          download: {
            ...currentEntry.download,
            status: ENTRY_DOWNLOAD_STATUS.failed,
            active: false,
            stage: '',
            errorMessage: message,
          },
        })))
      })
    }

    for (const entry of startableEntries) {
      triggerEntryDownload(entry)
    }
  }, [i18nT, setEntries, startableEntries])

  const handlePickDirectory = React.useCallback(async () => {
    if (!isElectronRuntime || typeof runtime?.downloads?.pickDirectory !== 'function') return

    try {
      const result = await runtime.downloads.pickDirectory(downloadDirectory || runtimeDownloadsPath)
      const selectedPath = String(result?.path || '').trim()
      if (!selectedPath) return

      directoryCustomizedRef.current = true
      setDownloadDirectory(selectedPath)
    } catch {
      // Keep current path unchanged when the picker fails.
    }
  }, [downloadDirectory, isElectronRuntime, runtime, runtimeDownloadsPath])

  const handleOpenCompleted = React.useCallback((entry) => {
    const payload = entry?.download?.completedFile
    if (!payload) return

    const savePath = String(payload?.savePath || '').trim()
    const downloadUrl = String(payload?.downloadUrl || '').trim()

    if (
      isElectronRuntime
      && savePath
      && typeof runtime?.downloads?.revealFile === 'function'
    ) {
      void runtime.downloads.revealFile(savePath)
      return
    }

    if (downloadUrl) {
      window.open(downloadUrl, '_blank', 'noopener,noreferrer')
    }
  }, [isElectronRuntime, runtime])

  const openCookieSettings = React.useCallback(() => {
    openSettingsModal('yt-dlp', 'cookies')
  }, [])

  const handleToggleControls = React.useCallback(() => {
    setControlsExpanded((previous) => !previous)
  }, [])

  const handleCloseInterface = React.useCallback(() => {
    onNavigate?.('/', '')
  }, [onNavigate])

  const startAllDisabled = !settingsLoaded || startableEntries.length === 0 || activeCount > 0 || loadingCount > 0

  return (
    <SimpleBarScrollArea 
      sx={{ 
        height: '100%',
        '& .simplebar-content': {
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100%',
        }
      }} 
      hideHorizontal
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          minHeight: '100%',
          boxSizing: 'border-box',
        }}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: 450,
            mx: 'auto',
            my: 'auto',
            py: { xs: 2, sm: 3 },
            px: { xs: 1.5, sm: 2 },
            pb: { xs: 12, sm: 14 },
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <MultiDownloaderHeader
          i18nT={i18nT}
          entriesCount={entries.length}
          controlsExpanded={controlsExpanded}
          onToggleControls={handleToggleControls}
          onCloseInterface={handleCloseInterface}
          linkInput={linkInput}
          onLinkInputChange={setLinkInput}
          onAddLinks={handleAddLinks}
          globalDownloadType={globalDownloadType}
          onGlobalTypeChange={handleGlobalTypeChange}
          unsupportedCount={unsupportedCountForGlobalType}
          isElectronRuntime={isElectronRuntime}
          downloadDirectory={downloadDirectory}
          onDownloadDirectoryChange={(val) => {
            directoryCustomizedRef.current = true
            setDownloadDirectory(val)
          }}
          onPickDirectory={handlePickDirectory}
          runtimeDownloadsPath={runtimeDownloadsPath}
        />

        <MultiEntryGroups
          i18nT={i18nT}
          services={services}
          entries={entries}
          downloadSettingsOverride={downloadSettings}
          forcedDownloadDirectory={isElectronRuntime ? downloadDirectory : ''}
          onToggleExpanded={handleToggleExpanded}
          onRemoveEntry={handleRemoveEntry}
          onEntryTypeChange={handleEntryTypeChange}
          onRegisterController={handleRegisterController}
          onDownloadStateChange={handleDownloadStateChange}
          onDownloadEvent={handleDownloadEvent}
          onOpenCompleted={handleOpenCompleted}
          onOpenCookieSettings={openCookieSettings}
        />

        <MultiDownloaderFooter
          i18nT={i18nT}
          activeCount={activeCount}
          completeCount={completeCount}
          overallProgress={overallProgress}
          startableCount={startableEntries.length}
          onStartAll={handleStartAllDownloads}
          startAllDisabled={startAllDisabled}
          queueSummary={queueSummary}
        />
      </Box>
      </Box>
    </SimpleBarScrollArea>
  )
}
