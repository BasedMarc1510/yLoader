import React from 'react'
import {
  Alert,
  Box,
  CircularProgress,
  Collapse,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material'
import { ChevronDown, ChevronUp, FolderOpen, X, Link2 } from 'lucide-react'
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

  const handleRegisterController = React.useCallback((controller) => {
    onRegisterController?.(entry.id, controller)
  }, [entry.id, onRegisterController])

  const handleDownloadEvent = React.useCallback((event) => {
    onDownloadEvent?.(entry.id, event)
  }, [entry.id, onDownloadEvent])

  const handleDownloadStateChange = React.useCallback((state) => {
    onDownloadStateChange?.(entry.id, state)

    const normalizedType = normalizeDownloadType(state?.type, '')
    if (normalizedType && normalizedType !== entry.selectedType) {
      onEntryTypeChange?.(entry.id, normalizedType)
    }
  }, [entry.id, entry.selectedType, onDownloadStateChange, onEntryTypeChange])

  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: 2.5,
        bgcolor: isDark ? 'rgba(255,255,255,0.02)' : '#ffffff',
        border: '1px solid',
        borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#eef0f2',
        overflow: 'hidden',
        transition: 'all 0.15s ease-in-out',
        '&:hover': {
          borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#e2e5e9',
          boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.15)' : '0 4px 12px rgba(0,0,0,0.03)',
        },
        // Show delete button on hover
        '&:hover .yl-multi-remove': {
          opacity: 1,
        }
      }}
    >
      {/* Header Container for absolute positioning */}
      <Box sx={{ position: 'relative' }}>
        {/* Floating Remove Button */}
        <IconButton
          className="yl-multi-remove"
          size="small"
          onClick={(e) => {
            e.stopPropagation()
            onRemoveEntry?.(entry.id)
          }}
          sx={{
            position: 'absolute',
            top: '50%',
            right: 8,
            transform: 'translateY(-50%)',
            zIndex: 5,
            width: 22,
            height: 22,
            bgcolor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.8)',
            backdropFilter: 'blur(4px)',
            border: '1px solid',
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
            color: 'text.secondary',
            opacity: { xs: 1, sm: 0 }, // Always visible on mobile
            transition: 'all 0.2s',
            '&:hover': {
              bgcolor: 'error.main',
              color: '#fff',
              borderColor: 'error.main',
            }
          }}
        >
          <X size={14} strokeWidth={3} />
        </IconButton>

        {/* COMPACT HEADER ROW */}
        <Stack 
          direction="row" 
          spacing={1.5} 
          alignItems="center" 
          sx={{ 
            p: 1.25,
            pr: 3.5, // Make room for the floating X
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
              p: '3px 5px',
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
          <Typography variant="caption" color="text.secondary" noWrap display="flex" alignItems="center" sx={{ fontWeight: 600, opacity: 0.8 }}>
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {entry.meta?.author || i18nT('mediaSummary.emptyValue')}
            </Box>
            {entry.selectedFormat && (
              <Box component="span" sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <Box component="span" sx={{ mx: 0.6, opacity: 0.5 }}>•</Box>
                <Box component="span" sx={{ fontWeight: 800 }}>{entry.selectedFormat}</Box>
              </Box>
            )}
          </Typography>
        </Box>

        {/* Status Dot & Icons */}
        <Stack direction="row" spacing={1.5} alignItems="center" onClick={(e) => e.stopPropagation()}>
          <Tooltip title={status.label}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14 }}>
              {entry.metaState === ENTRY_META_STATE.loading ? (
                <CircularProgress size={12} thickness={5} sx={{ color: 'text.secondary' }} />
              ) : (
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: status.tone === 'success' ? 'success.main' : 
                             status.tone === 'error' ? 'error.main' :
                             status.tone === 'warning' ? 'warning.main' :
                             status.tone === 'info' ? 'info.main' : 'text.disabled',
                  }}
                />
              )}
            </Box>
          </Tooltip>

          {entry.download?.status === ENTRY_DOWNLOAD_STATUS.complete && (
            <IconButton size="small" onClick={() => onOpenCompleted?.(entry)}>
              <FolderOpen size={16} />
            </IconButton>
          )}
          
          <Box sx={{ color: 'text.secondary', display: 'flex' }}>
            {entry.expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </Box>
        </Stack>
      </Stack>
      </Box>

      {/* Progress bar overlay for collapsed state */}
      {showProgress && !entry.expanded && (
        <LinearProgress 
          variant="determinate" 
          value={progress} 
          sx={{ height: 2, bgcolor: 'transparent', '& .MuiLinearProgress-bar': { borderRadius: 0 } }} 
        />
      )}

      {/* EXPANDED AREA with Animation */}
      <Collapse in={entry.expanded} timeout="auto">
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
                onRegisterController={handleRegisterController}
                onDownloadStateChange={handleDownloadStateChange}
                onDownloadEvent={handleDownloadEvent}
                onOpenCookieSettings={onOpenCookieSettings}
              />
            </Box>
          </Stack>
        </Box>
      </Collapse>
    </Box>
  )
}
