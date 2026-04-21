import React from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
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

function statusChipSx(tone) {
  if (tone === 'success') {
    return {
      bgcolor: 'success.main',
      color: 'success.contrastText',
    }
  }

  if (tone === 'error') {
    return {
      bgcolor: 'error.main',
      color: 'error.contrastText',
    }
  }

  if (tone === 'warning') {
    return {
      bgcolor: 'warning.main',
      color: 'warning.contrastText',
    }
  }

  if (tone === 'info') {
    return {
      bgcolor: 'info.main',
      color: 'info.contrastText',
    }
  }

  return {}
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
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          borderRadius: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {i18nT('multiDownloader.emptyState')}
        </Typography>
      </Paper>
    )
  }

  return (
    <Stack spacing={2}>
      {groupedEntries.map((group) => {
        const groupServiceKey = String(group.serviceKey || 'generic').trim() || 'generic'
        const groupServiceName = getServiceDisplayName(groupServiceKey)

        return (
          <Paper
            key={groupServiceKey}
            variant="outlined"
            sx={{
              borderRadius: 2,
              p: { xs: 1.25, sm: 1.5 },
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <ServiceIcon serviceKey={groupServiceKey} size={16} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {groupServiceName}
                </Typography>
              </Stack>
              <Chip size="small" label={i18nT('multiDownloader.groupCount', { count: group.entries.length })} />
            </Stack>

            <Stack spacing={1.25}>
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
                  <Paper
                    key={entry.id}
                    variant="outlined"
                    sx={{
                      p: { xs: 1, sm: 1.25 },
                      borderRadius: 2,
                    }}
                  >
                    <Stack
                      direction={{ xs: 'column', md: 'row' }}
                      spacing={1}
                      alignItems={{ xs: 'stretch', md: 'center' }}
                      justifyContent="space-between"
                      sx={{ mb: 1 }}
                    >
                      <Stack direction="row" alignItems="center" spacing={0.8} sx={{ minWidth: 0 }}>
                        <Chip
                          size="small"
                          label={status.label}
                          sx={{
                            fontWeight: 600,
                            ...statusChipSx(status.tone),
                          }}
                        />
                        {showProgress && (
                          <Typography variant="caption" color="text.secondary">
                            {progressLabel}
                          </Typography>
                        )}
                      </Stack>

                      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
                        <FormControl size="small" sx={{ minWidth: 164 }} disabled={!isReady}>
                          <InputLabel id={`${entry.id}-download-type-label`}>
                            {i18nT('multiDownloader.entryTypeLabel')}
                          </InputLabel>
                          <Select
                            labelId={`${entry.id}-download-type-label`}
                            value={selectedType}
                            label={i18nT('multiDownloader.entryTypeLabel')}
                            onChange={(event) => onEntryTypeChange?.(entry.id, event.target.value)}
                          >
                            {DOWNLOAD_TYPE_ORDER.map((type) => (
                              <MenuItem key={type} value={type} disabled={!entry.supportedTypes?.includes(type)}>
                                {getDownloadTypeLabel(i18nT, type)}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>

                        {showOpenCompleted && (
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<FolderOpen size={14} />}
                            onClick={() => onOpenCompleted(entry)}
                          >
                            {i18nT('multiDownloader.openCompleted')}
                          </Button>
                        )}

                        <Tooltip title={i18nT('multiDownloader.removeEntry')}>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => onRemoveEntry?.(entry.id)}
                            aria-label={i18nT('multiDownloader.removeEntry')}
                          >
                            <Trash2 size={16} />
                          </IconButton>
                        </Tooltip>

                        <Tooltip
                          title={entry.expanded
                            ? i18nT('multiDownloader.collapseEntry')
                            : i18nT('multiDownloader.expandEntry')}
                        >
                          <IconButton
                            size="small"
                            onClick={() => onToggleExpanded?.(entry.id)}
                            aria-label={entry.expanded
                              ? i18nT('multiDownloader.collapseEntry')
                              : i18nT('multiDownloader.expandEntry')}
                            disabled={!isReady}
                          >
                            {entry.expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>

                    <MediaSummary
                      thumbnail={entry.meta?.thumbnail || ''}
                      title={entry.meta?.title || entry.rawInput}
                      author={entry.meta?.author || ''}
                      duration={entry.meta?.duration || null}
                      durationLoading={Boolean(entry.meta?.durationLoading)}
                      url={entry.url || ''}
                      loading={entry.metaState === ENTRY_META_STATE.loading}
                    />

                    {showProgress && (
                      <LinearProgress
                        sx={{ mt: 1, borderRadius: 999 }}
                        variant="determinate"
                        value={progress}
                      />
                    )}

                    {hasMetaError && (
                      <Alert severity="error" sx={{ mt: 1 }}>
                        {String(entry.errorMessage || i18nT('multiDownloader.statusNotRetrievable')).trim()}
                      </Alert>
                    )}

                    {downloadFailed && entry.download?.errorMessage && (
                      <Alert severity="error" sx={{ mt: 1 }}>
                        {entry.download.errorMessage}
                      </Alert>
                    )}

                    {isReady && (
                      <Box
                        sx={{
                          mt: 1.25,
                          borderTop: (theme) => `1px solid ${theme.palette.divider}`,
                          pt: entry.expanded ? 1.25 : 0,
                          height: entry.expanded ? 'auto' : 0,
                          overflow: 'hidden',
                          visibility: entry.expanded ? 'visible' : 'hidden',
                          pointerEvents: entry.expanded ? 'auto' : 'none',
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
                  </Paper>
                )
              })}
            </Stack>
          </Paper>
        )
      })}
    </Stack>
  )
}
