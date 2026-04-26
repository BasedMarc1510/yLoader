import React from 'react'
import {
  Alert,
  Box,
  Button,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { ChevronDown, ChevronUp, FolderOpen, Trash2 } from 'lucide-react'
import ServiceIcon from '../../../components/ServiceIcon'
import MediaSummary from '../../../components/downloader/MediaSummary'
import OptionsTabs from '../../../components/downloader/OptionsTabs'
import { getDownloadProgressLabel } from '../../../components/downloader/options-tabs/downloadProgressLabel'
import { getServiceDisplayName } from '../../../utils/metadata'
import {
  DOWNLOAD_TYPE_ORDER,
  ENTRY_DOWNLOAD_STATUS,
  ENTRY_META_STATE,
  groupEntriesByService,
  normalizeDownloadType,
} from './entryUtils'

function getDownloadTypeLabel(i18nT, type) {
  if (type === 'audio') return i18nT('downloader.tabAudio')
  if (type === 'video') return i18nT('downloader.tabVideo')
  return i18nT('downloader.downloadThumbnail')
}

function resolveEntryStatus(i18nT, entry) {
  if (!entry) {
    return {
      label: i18nT('multiDownloader.statusInvalid'),
      tone: 'default',
    }
  }

  if (entry.metaState === ENTRY_META_STATE.loading) {
    return {
      label: i18nT('multiDownloader.statusLoading'),
      tone: 'default',
    }
  }

  if (entry.metaState === ENTRY_META_STATE.invalid || entry.metaState === ENTRY_META_STATE.error) {
    return {
      label: i18nT('multiDownloader.statusNotRetrievable'),
      tone: 'error',
    }
  }

  if (entry.download?.status === ENTRY_DOWNLOAD_STATUS.complete) {
    return {
      label: i18nT('multiDownloader.statusComplete'),
      tone: 'success',
    }
  }

  if (entry.download?.status === ENTRY_DOWNLOAD_STATUS.failed) {
    return {
      label: i18nT('multiDownloader.statusFailed'),
      tone: 'error',
    }
  }

  if (entry.download?.status === ENTRY_DOWNLOAD_STATUS.downloading || entry.download?.active) {
    return {
      label: i18nT('multiDownloader.statusDownloading'),
      tone: 'info',
    }
  }

  if (entry.download?.status === ENTRY_DOWNLOAD_STATUS.queued) {
    return {
      label: i18nT('multiDownloader.statusQueued'),
      tone: 'warning',
    }
  }

  return {
    label: i18nT('multiDownloader.statusReady'),
    tone: 'success',
  }
}

function normalizeProgress(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

function mergeDisabledDownloadTypes(entry, serviceConfig) {
  const disabled = new Set(Array.isArray(serviceConfig?.disabledDownloadTypes)
    ? serviceConfig.disabledDownloadTypes
    : [])

  for (const type of DOWNLOAD_TYPE_ORDER) {
    if (!entry?.supportedTypes?.includes(type)) {
      disabled.add(type)
    }
  }

  return Array.from(disabled)
}

function statusLabelSx(tone) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    px: 0.9,
    py: 0.35,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    lineHeight: 1,
  }

  if (tone === 'success') {
    return {
      ...base,
      bgcolor: 'success.main',
      color: 'success.contrastText',
    }
  }

  if (tone === 'error') {
    return {
      ...base,
      bgcolor: 'error.main',
      color: 'error.contrastText',
    }
  }

  if (tone === 'warning') {
    return {
      ...base,
      bgcolor: 'warning.main',
      color: 'warning.contrastText',
    }
  }

  if (tone === 'info') {
    return {
      ...base,
      bgcolor: 'info.main',
      color: 'info.contrastText',
    }
  }

  return {
    ...base,
    bgcolor: 'action.hover',
    color: 'text.secondary',
  }
}

export default function MultiEntryGroups({
  i18nT,
  services,
  entries,
  downloadSettingsOverride,
  forcedDownloadDirectory,
  onToggleExpanded,
  onRemoveEntry,
  onEntryTypeChange,
  onRegisterController,
  onDownloadStateChange,
  onDownloadEvent,
  onOpenCompleted,
  onOpenCookieSettings,
}) {
  const groupedEntries = React.useMemo(
    () => groupEntriesByService(entries),
    [entries]
  )

  if (!entries.length) {
    return (
      <Box
        sx={(theme) => ({
          p: 3,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
          textAlign: 'center',
        })}
      >
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
          {i18nT('multiDownloader.emptyState')}
        </Typography>
      </Box>
    )
  }

  return (
    <Stack spacing={2}>
      {groupedEntries.map((group) => {
        const groupServiceKey = String(group.serviceKey || 'generic').trim() || 'generic'
        const groupServiceName = getServiceDisplayName(groupServiceKey)

        return (
          <Box
            key={groupServiceKey}
            sx={(theme) => ({
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.015)' : '#ffffff',
              boxShadow: theme.palette.mode === 'dark' ? '0 4px 12px rgba(0,0,0,0.1)' : '0 2px 8px rgba(0,0,0,0.03)',
              p: { xs: 1.25, sm: 1.5 },
            })}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.95 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <ServiceIcon serviceKey={groupServiceKey} size={16} />
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  {groupServiceName}
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                {i18nT('multiDownloader.groupCount', { count: group.entries.length })}
              </Typography>
            </Stack>

            <Stack
              spacing={1.1}
              divider={<Box sx={{ borderTop: (theme) => `1px solid ${theme.palette.divider}` }} />}
            >
              {group.entries.map((entry) => {
                const serviceConfig = services[String(entry.serviceKey || 'generic').trim() || 'generic'] || services.generic
                const status = resolveEntryStatus(i18nT, entry)
                const isReady = entry.metaState === ENTRY_META_STATE.ready
                const selectedType = normalizeDownloadType(entry.selectedType, 'audio')
                const disabledDownloadTypes = mergeDisabledDownloadTypes(entry, serviceConfig)
                const progress = normalizeProgress(entry.download?.progress)
                const showProgress = entry.download?.status === ENTRY_DOWNLOAD_STATUS.queued
                  || entry.download?.status === ENTRY_DOWNLOAD_STATUS.downloading
                  || Boolean(entry.download?.active)
                const progressLabel = getDownloadProgressLabel(
                  i18nT,
                  entry.download?.stage || (showProgress ? 'downloading' : ''),
                  progress
                )
                const hasMetaError = entry.metaState === ENTRY_META_STATE.invalid
                  || entry.metaState === ENTRY_META_STATE.error
                const downloadFailed = entry.download?.status === ENTRY_DOWNLOAD_STATUS.failed
                const showOpenCompleted = entry.download?.status === ENTRY_DOWNLOAD_STATUS.complete
                  && typeof onOpenCompleted === 'function'

                return (
                  <Box
                    key={entry.id}
                    sx={(theme) => ({
                      pt: 0.2,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: theme.palette.mode === 'dark'
                        ? 'rgba(255,255,255,0.03)'
                        : 'rgba(0,0,0,0.015)',
                      p: 1.25,
                      boxShadow: 'none',
                    })}
                  >
                    <Stack spacing={1}>
                      <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={0.8}
                        alignItems={{ xs: 'stretch', sm: 'center' }}
                      >
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <MediaSummary
                            thumbnail={entry.meta?.thumbnail || ''}
                            title={entry.meta?.title || entry.rawInput}
                            author={entry.meta?.author || ''}
                            duration={entry.meta?.duration || null}
                            durationLoading={Boolean(entry.meta?.durationLoading)}
                            url={entry.url || ''}
                            loading={entry.metaState === ENTRY_META_STATE.loading}
                          />
                        </Box>

                        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <Box sx={statusLabelSx(status.tone)}>{status.label}</Box>

                          <Stack direction="row" spacing={0.45} sx={{ flexWrap: 'wrap' }}>
                            {DOWNLOAD_TYPE_ORDER.map((type) => {
                              const supported = entry.supportedTypes?.includes(type)
                              const active = selectedType === type

                              return (
                                <Button
                                  key={type}
                                  size="small"
                                  variant={active ? 'contained' : 'text'}
                                  onClick={() => onEntryTypeChange?.(entry.id, type)}
                                  disabled={!isReady || !supported}
                                  sx={{
                                    minHeight: 28,
                                    borderRadius: 999,
                                    px: 1.2,
                                    textTransform: 'none',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    bgcolor: active ? 'primary.main' : 'transparent',
                                    color: active ? 'primary.contrastText' : 'text.secondary',
                                    border: 'none',
                                    boxShadow: 'none',
                                    '&:hover': {
                                      boxShadow: 'none',
                                      bgcolor: active ? 'primary.dark' : 'action.hover',
                                    }
                                  }}
                                >
                                  {getDownloadTypeLabel(i18nT, type)}
                                </Button>
                              )
                            })}
                          </Stack>

                          {showOpenCompleted && (
                            <Tooltip title={i18nT('multiDownloader.openCompleted')}>
                              <IconButton
                                size="small"
                                onClick={() => onOpenCompleted(entry)}
                                aria-label={i18nT('multiDownloader.openCompleted')}
                                sx={{ bgcolor: 'action.hover' }}
                              >
                                <FolderOpen size={16} />
                              </IconButton>
                            </Tooltip>
                          )}

                          <Tooltip title={i18nT('multiDownloader.removeEntry')}>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => onRemoveEntry?.(entry.id)}
                              aria-label={i18nT('multiDownloader.removeEntry')}
                              sx={{ bgcolor: 'action.hover' }}
                            >
                              <Trash2 size={16} />
                            </IconButton>
                          </Tooltip>

                          <Tooltip
                            title={entry.expanded
                              ? i18nT('multiDownloader.collapseEntry')
                              : i18nT('multiDownloader.expandEntry')}
                          >
                            <span>
                              <IconButton
                                size="small"
                                onClick={() => onToggleExpanded?.(entry.id)}
                                aria-label={entry.expanded
                                  ? i18nT('multiDownloader.collapseEntry')
                                  : i18nT('multiDownloader.expandEntry')}
                                disabled={!isReady}
                                sx={{ bgcolor: 'action.hover' }}
                              >
                                {entry.expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Stack>
                      </Stack>

                      {showProgress && (
                        <Box>
                          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.35 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                              {progressLabel}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                              {progress}%
                            </Typography>
                          </Stack>
                          <LinearProgress
                            sx={{ borderRadius: 999 }}
                            variant="determinate"
                            value={progress}
                          />
                        </Box>
                      )}

                      {hasMetaError && (
                        <Alert severity="error">
                          {String(entry.errorMessage || i18nT('multiDownloader.statusNotRetrievable')).trim()}
                        </Alert>
                      )}

                      {downloadFailed && entry.download?.errorMessage && (
                        <Alert severity="error">
                          {entry.download.errorMessage}
                        </Alert>
                      )}

                      {isReady && entry.expanded && (
                        <Box
                          sx={{
                            borderTop: (theme) => `1px dashed ${theme.palette.divider}`,
                            pt: 1.1,
                          }}
                        >
                          <OptionsTabs
                            brandColor={serviceConfig?.yColor || '#df2f2f'}
                            videoTitle={entry.meta?.title || entry.rawInput}
                            videoAuthor={entry.meta?.author || ''}
                            videoUrl={entry.url || ''}
                            videoThumbnail={entry.meta?.thumbnail || ''}
                            duration={entry.meta?.duration || null}
                            durationSeconds={entry.meta?.durationSeconds ?? null}
                            initialFormats={entry.meta?.preloadedFormats || null}
                            loadingState={entry.metaState === ENTRY_META_STATE.loading}
                            defaultDownloadType={selectedType}
                            disabledDownloadTypes={disabledDownloadTypes}
                            forcedDownloadDirectory={forcedDownloadDirectory}
                            downloadSettingsOverride={downloadSettingsOverride}
                            onRegisterController={(controller) => onRegisterController?.(entry.id, controller)}
                            onDownloadStateChange={(state) => onDownloadStateChange?.(entry.id, state)}
                            onDownloadEvent={(event) => onDownloadEvent?.(entry.id, event)}
                            onOpenCookieSettings={onOpenCookieSettings}
                          />
                        </Box>
                      )}
                    </Stack>
                  </Box>
                )
              })}
            </Stack>
          </Box>
        )
      })}
    </Stack>
  )
}
