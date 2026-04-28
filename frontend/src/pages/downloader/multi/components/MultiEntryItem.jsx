import React from 'react'
import {
  Alert,
  Box,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material'
import { ChevronDown, ChevronUp, FolderOpen, Trash2, Link2 } from 'lucide-react'
import OptionsTabs from '../../../../components/downloader/OptionsTabs'
import { getDownloadProgressLabel } from '../../../../components/downloader/options-tabs/downloadProgressLabel'
import {
  DOWNLOAD_TYPE_ORDER,
  ENTRY_DOWNLOAD_STATUS,
  ENTRY_META_STATE,
  normalizeDownloadType,
} from '../entryUtils'

function resolveEntryStatus(i18nT, entry) {
  if (!entry) return { label: i18nT('multiDownloader.statusInvalid'), tone: 'default' }
  if (entry.metaState === ENTRY_META_STATE.loading) return { label: i18nT('multiDownloader.statusLoading'), tone: 'default' }
  if (entry.metaState === ENTRY_META_STATE.invalid || entry.metaState === ENTRY_META_STATE.error) return { label: i18nT('multiDownloader.statusNotRetrievable'), tone: 'error' }
  if (entry.download?.status === ENTRY_DOWNLOAD_STATUS.complete) return { label: i18nT('multiDownloader.statusComplete'), tone: 'success' }
  if (entry.download?.status === ENTRY_DOWNLOAD_STATUS.failed) return { label: i18nT('multiDownloader.statusFailed'), tone: 'error' }
  if (entry.download?.status === ENTRY_DOWNLOAD_STATUS.downloading || entry.download?.active) return { label: i18nT('multiDownloader.statusDownloading'), tone: 'info' }
  if (entry.download?.status === ENTRY_DOWNLOAD_STATUS.queued) return { label: i18nT('multiDownloader.statusQueued'), tone: 'warning' }
  return { label: i18nT('multiDownloader.statusReady'), tone: 'success' }
}

export default function MultiEntryItem({
  i18nT,
  entry,
  serviceConfig,
  onToggleExpanded,
  onRemoveEntry,
  onEntryTypeChange,
  onRegisterController,
  onDownloadStateChange,
  onDownloadEvent,
  onOpenCompleted,
  onOpenCookieSettings,
  downloadSettingsOverride,
  forcedDownloadDirectory,
}) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  
  const status = resolveEntryStatus(i18nT, entry)
  const isReady = entry.metaState === ENTRY_META_STATE.ready
  const selectedType = normalizeDownloadType(entry.selectedType, 'audio')
  
  const disabledDownloadTypes = React.useMemo(() => {
    const disabled = new Set(Array.isArray(serviceConfig?.disabledDownloadTypes) ? serviceConfig.disabledDownloadTypes : [])
    for (const type of DOWNLOAD_TYPE_ORDER) {
      if (!entry?.supportedTypes?.includes(type)) disabled.add(type)
    }
    return Array.from(disabled)
  }, [entry?.supportedTypes, serviceConfig?.disabledDownloadTypes])

  const progress = Math.max(0, Math.min(100, Math.round(Number(entry.download?.progress || 0))))
  const showProgress = entry.download?.status === ENTRY_DOWNLOAD_STATUS.queued
    || entry.download?.status === ENTRY_DOWNLOAD_STATUS.downloading
    || Boolean(entry.download?.active)
    
  const progressLabel = getDownloadProgressLabel(
    i18nT,
    entry.download?.stage || (showProgress ? 'downloading' : ''),
    progress
  )

  return (
    <Box
      sx={{
        borderRadius: 2.5,
        bgcolor: isDark ? 'rgba(255,255,255,0.02)' : '#ffffff',
        border: '1px solid',
        borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#eef0f2',
        overflow: 'hidden',
        transition: 'all 0.15s ease-in-out',
        '&:hover': {
          borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#e2e5e9',
          boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.15)' : '0 4px 12px rgba(0,0,0,0.03)',
        }
      }}
    >
      {/* COMPACT HEADER ROW */}
      <Stack 
        direction="row" 
        spacing={1.5} 
        alignItems="center" 
        sx={{ 
          p: 1.25,
          cursor: isReady ? 'pointer' : 'default',
          userSelect: 'none'
        }}
        onClick={() => isReady && onToggleExpanded?.(entry.id)}
      >
        {/* Compact Thumbnail */}
        <Box
          sx={{
            width: 72,
            height: 40,
            borderRadius: 1.25,
            overflow: 'hidden',
            flexShrink: 0,
            bgcolor: isDark ? 'rgba(0,0,0,0.3)' : '#f0f2f5',
            position: 'relative'
          }}
        >
          {entry.meta?.thumbnail ? (
            <Box component="img" src={entry.meta.thumbnail} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.disabled' }}>
              <Link2 size={16} />
            </Box>
          )}
          {entry.meta?.duration && (
            <Typography sx={{ 
              position: 'absolute', 
              bottom: 4, 
              right: 4, 
              bgcolor: 'rgba(0,0,0,0.75)', 
              color: '#fff', 
              px: 0.6, 
              py: 0.1,
              borderRadius: 0.75, 
              fontSize: 9, 
              fontWeight: 800,
              lineHeight: 1
            }}>
              {entry.meta.duration}
            </Typography>
          )}
        </Box>

        {/* Title & Author */}
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 700, lineHeight: 1.2, mb: 0.1 }}>
            {entry.meta?.title || entry.rawInput}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ fontWeight: 600, opacity: 0.8 }}>
            {entry.meta?.author || i18nT('mediaSummary.emptyValue')}
          </Typography>
        </Box>

        {/* Status Dot & Icons */}
        <Stack direction="row" spacing={0.5} alignItems="center" onClick={(e) => e.stopPropagation()}>
          <Tooltip title={status.label}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: status.tone === 'success' ? 'success.main' : 
                         status.tone === 'error' ? 'error.main' :
                         status.tone === 'warning' ? 'warning.main' :
                         status.tone === 'info' ? 'info.main' : 'text.disabled',
                mr: 1
              }}
            />
          </Tooltip>

          {entry.download?.status === ENTRY_DOWNLOAD_STATUS.complete && (
            <IconButton size="small" onClick={() => onOpenCompleted?.(entry)}>
              <FolderOpen size={16} />
            </IconButton>
          )}
          
          <IconButton size="small" color="error" onClick={() => onRemoveEntry?.(entry.id)} sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}>
            <Trash2 size={16} />
          </IconButton>

          <Box sx={{ color: 'text.secondary', ml: 0.5, display: 'flex' }}>
            {entry.expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </Box>
        </Stack>
      </Stack>

      {/* Progress bar overlay for collapsed state */}
      {showProgress && !entry.expanded && (
        <LinearProgress 
          variant="determinate" 
          value={progress} 
          sx={{ height: 2, bgcolor: 'transparent', '& .MuiLinearProgress-bar': { borderRadius: 0 } }} 
        />
      )}

      {/* EXPANDED AREA */}
      {entry.expanded && (
        <Box sx={{ 
          p: 0, 
          borderTop: '1px solid', 
          borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#f0f2f5',
          bgcolor: isDark ? 'rgba(0,0,0,0.1)' : '#fcfdfe' 
        }}>
          <Stack spacing={0}>
            {showProgress && (
              <Box sx={{ px: 2, pt: 1.5 }}>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>{progressLabel}</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 800 }}>{progress}%</Typography>
                </Stack>
                <LinearProgress variant="determinate" value={progress} sx={{ height: 6, borderRadius: 3 }} />
              </Box>
            )}

            {(entry.metaState === ENTRY_META_STATE.error || entry.download?.status === ENTRY_DOWNLOAD_STATUS.failed) && (
              <Box sx={{ px: 2, pt: 1.5 }}>
                <Alert severity="error" sx={{ borderRadius: 2, fontSize: '0.75rem', fontWeight: 600 }}>
                  {entry.errorMessage || entry.download?.errorMessage || i18nT('multiDownloader.statusNotRetrievable')}
                </Alert>
              </Box>
            )}

            {/* Existing Settings Component */}
            <Box sx={{ mt: 0 }}>
              <OptionsTabs
                variant="compact"
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
                onDownloadStateChange={(state) => {
                  onDownloadStateChange?.(entry.id, state);
                  // Sync local tab change back to entry state if needed
                  if (state?.type && state.type !== entry.selectedType) {
                    onEntryTypeChange?.(entry.id, state.type);
                  }
                }}
                onDownloadEvent={(event) => onDownloadEvent?.(entry.id, event)}
                onOpenCookieSettings={onOpenCookieSettings}
              />
            </Box>
          </Stack>
        </Box>
      )}
    </Box>
  )
}
