import React from 'react'
import {
  Alert,
  Box,
  Button,
  Collapse,
  IconButton,
  LinearProgress,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { AlertTriangle, FolderOpen, MoreHorizontal, Play, Plus } from 'lucide-react'
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
import {
  ENTRY_DOWNLOAD_STATUS,
  ENTRY_META_STATE,
  countUnsupportedEntries,
  normalizeDownloadType,
} from './multi/entryUtils'

const DOWNLOAD_TYPE_CHOICES = ['audio', 'video', 'thumbnail']

function getDownloadTypeLabel(i18nT, type) {
  if (type === 'audio') return i18nT('downloader.tabAudio')
  if (type === 'video') return i18nT('downloader.tabVideo')
  return i18nT('downloader.downloadThumbnail')
}

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
  const [actionsAnchorEl, setActionsAnchorEl] = React.useState(null)

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
  const queueSummary = React.useMemo(() => (
    [
      i18nT('multiDownloader.counterReady', { count: readyCount }),
      i18nT('multiDownloader.counterLoading', { count: loadingCount }),
      i18nT('multiDownloader.counterInvalid', { count: invalidCount }),
      i18nT('multiDownloader.counterActive', { count: activeCount }),
      i18nT('multiDownloader.counterComplete', { count: completeCount }),
    ].join(' | ')
  ), [activeCount, completeCount, i18nT, invalidCount, loadingCount, readyCount])

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

    setEntries((previousEntries) => updateEntryById(previousEntries, entryId, (entry) => {
      const currentStatus = entry.download?.status || ENTRY_DOWNLOAD_STATUS.idle

      if (
        !nextActive
        && !nextStage
        && nextProgress === 0
        && (currentStatus === ENTRY_DOWNLOAD_STATUS.complete || currentStatus === ENTRY_DOWNLOAD_STATUS.failed)
      ) {
        return entry
      }

      return {
        ...entry,
        download: {
          ...entry.download,
          active: nextActive,
          progress: nextProgress,
          stage: nextStage,
          status: nextActive ? ENTRY_DOWNLOAD_STATUS.downloading : currentStatus,
        },
      }
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

  const handleOpenActionsMenu = React.useCallback((event) => {
    setActionsAnchorEl(event.currentTarget)
  }, [])

  const handleCloseActionsMenu = React.useCallback(() => {
    setActionsAnchorEl(null)
  }, [])

  const handleCloseInterface = React.useCallback(() => {
    onNavigate?.('/', '')
  }, [onNavigate])

  const startAllDisabled = !settingsLoaded || startableEntries.length === 0 || activeCount > 0
  const actionsMenuOpen = Boolean(actionsAnchorEl)

  return (
    <Box className="yl-native-scroll" sx={{ height: '100%', overflowX: 'hidden', overflowY: 'auto' }}>
      <Box
        sx={{
          maxWidth: 450,
          mx: 'auto',
          py: { xs: 1.5, sm: 2 },
          px: { xs: 1, sm: 1.5 },
          pb: { xs: 9.5, sm: 10.5 },
          display: 'flex',
          flexDirection: 'column',
          gap: 1.25,
        }}
      >
        <Paper variant="outlined" sx={{ p: { xs: 1.25, sm: 1.5 }, borderRadius: 2 }}>
          <Stack spacing={1.15}>
            <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {i18nT('multiDownloader.title')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {i18nT('multiDownloader.subtitle', { count: entries.length })}
                </Typography>
              </Box>

              <IconButton
                size="small"
                onClick={handleOpenActionsMenu}
                aria-label={i18nT('multiDownloader.moreActions')}
              >
                <MoreHorizontal size={18} />
              </IconButton>
            </Stack>

            <TextField
              fullWidth
              multiline
              minRows={2}
              maxRows={6}
              label={i18nT('multiDownloader.addLinksLabel')}
              placeholder={i18nT('placeholders.homeMultiUrls')}
              value={linkInput}
              onChange={(event) => setLinkInput(event.target.value)}
            />

            <Stack direction="row" spacing={0.8} alignItems="center">
              <Button
                variant="contained"
                startIcon={<Plus size={16} />}
                sx={{ flex: 1 }}
                onClick={handleAddLinks}
                disabled={!normalizeMultiLinksValue(linkInput)}
              >
                {i18nT('multiDownloader.addLinksButton')}
              </Button>

              <Button
                variant="text"
                size="small"
                onClick={handleToggleControls}
                sx={{ whiteSpace: 'nowrap', minWidth: 'fit-content' }}
              >
                {controlsExpanded
                  ? i18nT('multiDownloader.hideControls')
                  : i18nT('multiDownloader.showControls')}
              </Button>
            </Stack>

            <Collapse in={controlsExpanded} timeout="auto" unmountOnExit>
              <Stack spacing={1} sx={{ pt: 0.2 }}>
                <Box
                  sx={(currentTheme) => ({
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: currentTheme.palette.mode === 'dark'
                      ? 'rgba(255,255,255,0.03)'
                      : 'rgba(0,0,0,0.015)',
                    p: 0.9,
                  })}
                >
                  <Stack spacing={0.65}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, letterSpacing: '0.04em' }}>
                        {i18nT('multiDownloader.globalTypeLabel')}
                      </Typography>
                      {unsupportedCountForGlobalType > 0 && (
                        <Tooltip title={i18nT('multiDownloader.globalTypeUnsupported', { count: unsupportedCountForGlobalType })}>
                          <Box
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 0.4,
                              px: 0.75,
                              py: 0.35,
                              borderRadius: 999,
                              bgcolor: 'warning.light',
                              color: 'warning.contrastText',
                              fontSize: 11,
                              fontWeight: 800,
                              lineHeight: 1,
                            }}
                          >
                            <AlertTriangle size={12} />
                            {unsupportedCountForGlobalType}
                          </Box>
                        </Tooltip>
                      )}
                    </Stack>

                    <Stack direction="row" spacing={0.7} flexWrap="wrap" useFlexGap>
                      {DOWNLOAD_TYPE_CHOICES.map((type) => {
                        const selected = globalDownloadType === type

                        return (
                          <Button
                            key={type}
                            size="small"
                            variant={selected ? 'contained' : 'text'}
                            onClick={() => handleGlobalTypeChange({ target: { value: type } })}
                            sx={{
                              borderRadius: 999,
                              textTransform: 'none',
                              fontWeight: 700,
                              px: 1.2,
                              minHeight: 30,
                              bgcolor: selected ? 'primary.main' : 'transparent',
                              color: selected ? 'primary.contrastText' : 'text.secondary',
                              '&:hover': {
                                bgcolor: selected ? 'primary.dark' : 'action.hover',
                              },
                            }}
                          >
                            {getDownloadTypeLabel(i18nT, type)}
                          </Button>
                        )
                      })}
                    </Stack>
                  </Stack>
                </Box>

                {isElectronRuntime ? (
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.8} alignItems={{ xs: 'stretch', sm: 'center' }}>
                    <TextField
                      fullWidth
                      size="small"
                      label={i18nT('multiDownloader.downloadDirectoryLabel')}
                      value={downloadDirectory}
                      onChange={(event) => {
                        directoryCustomizedRef.current = true
                        setDownloadDirectory(String(event.target.value || ''))
                      }}
                      placeholder={runtimeDownloadsPath || i18nT('multiDownloader.downloadDirectoryPlaceholder')}
                    />
                    <Button
                      variant="outlined"
                      startIcon={<FolderOpen size={16} />}
                      onClick={handlePickDirectory}
                      sx={{ minWidth: 'fit-content' }}
                    >
                      {i18nT('multiDownloader.browseDirectory')}
                    </Button>
                  </Stack>
                ) : (
                  <Alert severity="info" sx={{ py: 0.2 }}>
                    {i18nT('multiDownloader.webDirectoryHint')}
                  </Alert>
                )}

                <Stack direction="row" spacing={0.55} flexWrap="wrap" useFlexGap>
                  {[
                    i18nT('multiDownloader.counterReady', { count: readyCount }),
                    i18nT('multiDownloader.counterLoading', { count: loadingCount }),
                    i18nT('multiDownloader.counterInvalid', { count: invalidCount }),
                    i18nT('multiDownloader.counterActive', { count: activeCount }),
                    i18nT('multiDownloader.counterComplete', { count: completeCount }),
                  ].map((counterText) => (
                    <Box
                      key={counterText}
                      sx={{
                        px: 0.75,
                        py: 0.3,
                        borderRadius: 999,
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: 'background.paper',
                      }}
                    >
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, lineHeight: 1 }}>
                        {counterText}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Stack>
            </Collapse>
          </Stack>
        </Paper>

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

        <Paper
          variant="outlined"
          sx={(currentTheme) => ({
            position: 'sticky',
            bottom: { xs: 10, sm: 14 },
            borderRadius: 2,
            p: 1.05,
            zIndex: 3,
            bgcolor: currentTheme.palette.background.paper,
            boxShadow: currentTheme.palette.mode === 'dark'
              ? '0 10px 28px rgba(0,0,0,0.4)'
              : '0 10px 28px rgba(0,0,0,0.09)',
          })}
        >
          <Stack spacing={0.7}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {i18nT('multiDownloader.overallProgress')}: {overallProgress}%
              </Typography>
              <Button
                variant="contained"
                size="small"
                startIcon={<Play size={14} />}
                onClick={handleStartAllDownloads}
                disabled={startAllDisabled}
              >
                {i18nT('multiDownloader.startAll')}
              </Button>
            </Stack>

            <LinearProgress value={overallProgress} variant="determinate" sx={{ borderRadius: 999 }} />

            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
              {queueSummary}
            </Typography>
          </Stack>
        </Paper>
      </Box>

      <Menu
        anchorEl={actionsAnchorEl}
        open={actionsMenuOpen}
        onClose={handleCloseActionsMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          onClick={() => {
            handleCloseActionsMenu()
            handleToggleControls()
          }}
        >
          {controlsExpanded
            ? i18nT('multiDownloader.hideControls')
            : i18nT('multiDownloader.showControls')}
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleCloseActionsMenu()
            handleCloseInterface()
          }}
        >
          {i18nT('downloader.close')}
        </MenuItem>
      </Menu>
    </Box>
  )
}
