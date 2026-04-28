import React from 'react'
import { Box, Button, Skeleton, useTheme } from '@mui/material'
import { Image as ImageIcon, Music2, Video } from 'lucide-react'
import { useNotification } from '../../providers/NotificationProvider'
import { useI18n } from '../../providers/I18nProvider'
import { openSettingsModal } from '../../pages/home/settingsBridge'
import AudioTabContent from './options-tabs/AudioTabContent'
import OverwriteConfirmDialog from './options-tabs/OverwriteConfirmDialog'
import ThumbnailTabContent from './options-tabs/ThumbnailTabContent'
import useOptionsTabsData from './options-tabs/useOptionsTabsData'
import useStreamDownload from './options-tabs/useStreamDownload'
import VideoTabContent from './options-tabs/VideoTabContent'

const DOWNLOAD_TAB_KEYS = Object.freeze(['audio', 'video', 'thumbnail'])
const EMPTY_INITIAL_FORMATS = Object.freeze({
  audioFormats: Object.freeze([]),
  videoFormats: Object.freeze([]),
  thumbnails: Object.freeze([]),
})

function normalizeDownloadType(value, fallback = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (DOWNLOAD_TAB_KEYS.includes(normalized)) return normalized
  return fallback
}

function normalizeDisabledDownloadTypes(values) {
  if (!Array.isArray(values)) return []

  const seen = new Set()
  const result = []

  for (const value of values) {
    const normalized = normalizeDownloadType(value, '')
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }

  // Prevent a dead-end UI due to a misconfigured service.
  if (result.length >= DOWNLOAD_TAB_KEYS.length) return []
  return result
}

export default function OptionsTabs({
  variant = 'default',
  brandColor = '#df2f2f',
  videoTitle = '',
  videoAuthor = '',
  videoUrl = '',
  videoThumbnail = '',
  durationSeconds = null,
  durationLoading = false,
  durationResolved = false,
  serviceKey = null,
  initialFormats = null,
  onFetchError = null,
  onDownloadStateChange = null,
  loadingState = false,
  autostartFormat = '',
  defaultDownloadType = 'video',
  disabledDownloadTypes = [],
  onRegisterController = null,
  onDownloadEvent = null,
  forcedDownloadDirectory = '',
  downloadSettingsOverride = null,
  onOpenCookieSettings = null,
}) {
  const theme = useTheme()
  const { t: i18nT } = useI18n()
  const { showNotification } = useNotification()
  const runtime = typeof window !== 'undefined' ? window.yloaderRuntime : null
  const isElectronRuntime = Boolean(runtime?.isElectron)

  const normalizedDisabledDownloadTypes = React.useMemo(
    () => normalizeDisabledDownloadTypes(disabledDownloadTypes),
    [disabledDownloadTypes]
  )
  const disabledDownloadTypeSet = React.useMemo(
    () => new Set(normalizedDisabledDownloadTypes),
    [normalizedDisabledDownloadTypes]
  )
  const normalizedDurationSeconds = React.useMemo(() => {
    const numeric = Number(durationSeconds)
    if (!Number.isFinite(numeric) || numeric <= 0) return null
    return Math.round(numeric)
  }, [durationSeconds])
  const isDurationLoading = normalizedDurationSeconds == null && (Boolean(durationLoading) || !Boolean(durationResolved))
  const isDurationUnavailable = normalizedDurationSeconds == null && Boolean(durationResolved) && !isDurationLoading

  const effectiveVideoUrl = loadingState ? '' : videoUrl
  const effectiveInitialFormats = React.useMemo(
    () => (loadingState ? EMPTY_INITIAL_FORMATS : initialFormats),
    [initialFormats, loadingState]
  )

  const data = useOptionsTabsData({
    i18nT,
    videoTitle,
    videoAuthor,
    videoUrl: effectiveVideoUrl,
    videoThumbnail,
    initialFormats: effectiveInitialFormats,
    onFetchError,
    defaultDownloadType: normalizeDownloadType(defaultDownloadType, 'video'),
    disabledDownloadTypes: normalizedDisabledDownloadTypes,
    downloadSettingsOverride,
  })

  const isCompact = variant === 'compact'

  // Sync tab change to parent
  React.useEffect(() => {
    onDownloadStateChange?.({ type: data.tab })
  }, [data.tab, onDownloadStateChange])

  const overwriteConfirmResolverRef = React.useRef(null)
  const [overwriteDialogData, setOverwriteDialogData] = React.useState(null)

  const openCookieSettings = React.useCallback(() => {
    if (typeof onOpenCookieSettings === 'function') {
      onOpenCookieSettings()
      return
    }
    openSettingsModal('yt-dlp', 'cookies')
  }, [onOpenCookieSettings])

  const resolveOverwriteDialog = React.useCallback((action = 'cancel') => {
    const resolver = overwriteConfirmResolverRef.current
    overwriteConfirmResolverRef.current = null
    setOverwriteDialogData(null)

    if (typeof resolver === 'function') {
      resolver(action)
    }
  }, [])

  const confirmOverwriteInApp = React.useCallback((dialogOptions = {}) => {
    const normalizedOptions = dialogOptions && typeof dialogOptions === 'object'
      ? dialogOptions
      : {}

    return new Promise((resolve) => {
      if (typeof overwriteConfirmResolverRef.current === 'function') {
        overwriteConfirmResolverRef.current('cancel')
      }

      overwriteConfirmResolverRef.current = resolve
      setOverwriteDialogData({
        title: String(normalizedOptions.title || i18nT('downloader.confirmOverwriteTitle')),
        message: String(normalizedOptions.message || ''),
        detail: String(normalizedOptions.detail || ''),
        replaceLabel: String(normalizedOptions.replaceLabel || i18nT('downloader.confirmOverwriteReplace')),
        keepLabel: String(normalizedOptions.keepLabel || i18nT('downloader.confirmOverwriteKeep')),
        cancelLabel: String(normalizedOptions.cancelLabel || i18nT('downloader.confirmOverwriteCancel')),
      })
    })
  }, [i18nT])

  React.useEffect(() => () => {
    if (typeof overwriteConfirmResolverRef.current === 'function') {
      overwriteConfirmResolverRef.current('cancel')
      overwriteConfirmResolverRef.current = null
    }
  }, [])

  const download = useStreamDownload({
    i18nT,
    showNotification,
    onDownloadStateChange,
    videoUrl: effectiveVideoUrl,
    serviceKey,
    durationSeconds: normalizedDurationSeconds,
    videoTitle,
    videoAuthor,
    videoThumbnail,
    audioFilenameValue: data.audioFilenameValue,
    videoFilenameValue: data.videoFilenameValue,
    titleValue: data.titleValue,
    artistValue: data.artistValue,
    albumValue: data.albumValue,
    videoContainer: data.videoContainer,
    audioContainer: data.audioContainer,
    selectedAudioFormat: data.selectedAudioFormat,
    selectedVideoFormat: data.selectedVideoFormat,
    audioCutsData: data.audioCutsData,
    videoCutsData: data.videoCutsData,
    coverEmbedEnabled: data.coverEmbedEnabled,
    coverSource: data.coverSource,
    coverUpload: data.coverUpload,
    coverVideoEdit: data.coverVideoEdit,
    hasVideoThumbnail: data.hasVideoThumbnail,
    downloadSettings: data.downloadSettings,
    audioDownloadTargetSettings: data.audioDownloadTargetSettings,
    videoDownloadTargetSettings: data.videoDownloadTargetSettings,
    forcedDownloadDirectory,
    confirmOverwriteInApp,
    onOpenCookieSettings: openCookieSettings,
    onDownloadEvent,
  })

  React.useEffect(() => {
    if (typeof onRegisterController !== 'function') return undefined

    onRegisterController({
      startDownload: (downloadType) => download.handleDownload(downloadType),
      isDownloading: () => Boolean(download.downloading),
    })

    return () => {
      onRegisterController(null)
    }
  }, [download.downloading, download.handleDownload, onRegisterController])

  const interactionsDisabled = download.downloading || loadingState

  const isDark = theme.palette.mode === 'dark'
  const tabActiveBg = isDark ? (isCompact ? 'rgba(255,255,255,0.08)' : '#272727') : (isCompact ? 'rgba(0,0,0,0.04)' : '#ffffff')
  const tabInactiveBg = 'transparent'
  const tabActiveBorder = isDark ? (isCompact ? theme.palette.primary.main : '#424242') : (isCompact ? theme.palette.primary.main : '#dcdee2')
  const tabInactiveBorder = 'transparent'
  const tabHoverBorder = isDark ? '#555555' : '#d0d2d6'
  const tabHoverBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'
  const tabTextColor = isDark ? '#ffffff' : '#111111'
  const tabActiveShadow = (isDark || isCompact) ? 'none' : '0 2px 8px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)'
  const optionsSurfaceColor = isDark ? (isCompact ? 'transparent' : '#0a0a0a') : (isCompact ? 'transparent' : '#f9fafc')
  const skeletonSx = React.useMemo(() => ({
    bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
    '&::after': {
      background: isDark
        ? 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)'
        : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)',
    },
  }), [isDark])

  const [hasAutostarted, setHasAutostarted] = React.useState(false)

  React.useEffect(() => {
    const format = String(autostartFormat || '').trim().toLowerCase()
    if (!format || loadingState || hasAutostarted || interactionsDisabled) return

    const formatIsMp3 = format === 'mp3'
    const formatIsMp4 = format === 'mp4'
    const canMp3 = formatIsMp3 && data.audioFormats.length > 0 && !disabledDownloadTypeSet.has('audio')
    const canMp4 = formatIsMp4 && data.videoFormats.length > 0 && !disabledDownloadTypeSet.has('video')

    if (canMp3 || canMp4) {
      if (formatIsMp3 && data.tab !== 'audio') data.handleTabChange('audio')
      if (formatIsMp4 && data.tab !== 'video') data.handleTabChange('video')

      setHasAutostarted(true)
      const autostartType = formatIsMp3 ? 'audio' : 'video'

      // Small delay to ensure tab state renders and no other effects block the trigger
      setTimeout(() => {
        download.handleDownload(autostartType)
      }, 150)
    }
  }, [
    autostartFormat,
    data.audioFormats.length,
    data.handleTabChange,
    data.tab,
    data.videoFormats.length,
    disabledDownloadTypeSet,
    download.handleDownload,
    hasAutostarted,
    interactionsDisabled,
    loadingState,
  ])

  return (
    <Box>
      <Box
        sx={{
          margin: isCompact ? theme.spacing(1.5, 2, 0, 2) : theme.spacing(1.5, 1.5, 0, 1.5),
          padding: isCompact ? 0 : theme.spacing(1.5),
          borderRadius: isCompact ? 0 : '12px 12px 0 0',
          bgcolor: optionsSurfaceColor,
          boxShadow: (isDark || isCompact) ? 'none' : '0 2px 4px rgba(0, 0, 0, 0.2)',
          border: (isDark || isCompact) ? 'none' : '1px solid #e2e4e8',
          borderBottom: 'none',
          display: 'flex',
          gap: theme.spacing(isCompact ? 0.5 : 1),
          opacity: interactionsDisabled ? 0.66 : 1,
          pointerEvents: interactionsDisabled ? 'none' : 'auto',
          transition: 'opacity 180ms ease',
        }}
      >
        <Button
          variant="contained"
          startIcon={loadingState ? <Skeleton variant="circular" animation="wave" width={isCompact ? 16 : 20} height={isCompact ? 16 : 20} sx={skeletonSx} /> : <Music2 size={isCompact ? 18 : 20} />}
          onClick={() => data.handleTabChange('audio')}
          disabled={interactionsDisabled || disabledDownloadTypeSet.has('audio')}
          sx={{
            borderRadius: isCompact ? '8px' : '28px',
            textTransform: 'none',
            padding: isCompact ? '8px 12px' : '12px 16px',
            fontWeight: 700,
            flex: 1,
            height: isCompact ? '40px' : '48px',
            bgcolor: data.tab === 'audio' ? tabActiveBg : tabInactiveBg,
            color: data.tab === 'audio' && isCompact ? 'primary.main' : tabTextColor,
            fontSize: isCompact ? '0.95rem' : '1.125rem',
            border: data.tab === 'audio' ? (isCompact ? `1.5px solid ${theme.palette.primary.main}` : `2px solid ${tabActiveBorder}`) : (isCompact ? `1.5px solid transparent` : `2px solid ${tabInactiveBorder}`),
            boxShadow: data.tab === 'audio' ? tabActiveShadow : 'none',
            boxSizing: 'border-box',
            opacity: disabledDownloadTypeSet.has('audio') ? 0.42 : 1,
            '&:hover': {
              bgcolor: data.tab === 'audio' ? tabActiveBg : tabHoverBg,
              borderColor: data.tab === 'audio' ? (isCompact ? theme.palette.primary.main : tabHoverBorder) : (isCompact ? 'transparent' : tabInactiveBorder),
            },
          }}
        >
          {loadingState ? <Skeleton variant="text" animation="wave" width={isCompact ? 50 : 70} sx={skeletonSx} /> : i18nT('downloader.tabAudio')}
        </Button>

        <Button
          variant="contained"
          startIcon={loadingState ? <Skeleton variant="circular" animation="wave" width={isCompact ? 16 : 20} height={isCompact ? 16 : 20} sx={skeletonSx} /> : <Video size={isCompact ? 18 : 20} />}
          onClick={() => data.handleTabChange('video')}
          disabled={interactionsDisabled || disabledDownloadTypeSet.has('video')}
          sx={{
            borderRadius: isCompact ? '8px' : '28px',
            textTransform: 'none',
            padding: isCompact ? '8px 12px' : '12px 16px',
            fontWeight: 700,
            flex: 1,
            height: isCompact ? '40px' : '48px',
            bgcolor: data.tab === 'video' ? tabActiveBg : tabInactiveBg,
            color: data.tab === 'video' && isCompact ? 'primary.main' : tabTextColor,
            fontSize: isCompact ? '0.95rem' : '1.125rem',
            border: data.tab === 'video' ? (isCompact ? `1.5px solid ${theme.palette.primary.main}` : `2px solid ${tabActiveBorder}`) : (isCompact ? `1.5px solid transparent` : `2px solid ${tabInactiveBorder}`),
            boxShadow: data.tab === 'video' ? tabActiveShadow : 'none',
            boxSizing: 'border-box',
            opacity: disabledDownloadTypeSet.has('video') ? 0.42 : 1,
            '&:hover': {
              bgcolor: data.tab === 'video' ? tabActiveBg : tabHoverBg,
              borderColor: data.tab === 'video' ? (isCompact ? theme.palette.primary.main : tabHoverBorder) : (isCompact ? 'transparent' : tabInactiveBorder),
            },
          }}
        >
          {loadingState ? <Skeleton variant="text" animation="wave" width={isCompact ? 50 : 70} sx={skeletonSx} /> : i18nT('downloader.tabVideo')}
        </Button>

        <Button
          variant="contained"
          onClick={() => data.handleTabChange('thumbnail')}
          disabled={interactionsDisabled || disabledDownloadTypeSet.has('thumbnail')}
          sx={{
            borderRadius: isCompact ? '8px' : '50%',
            minWidth: isCompact ? '40px' : '48px',
            width: isCompact ? '40px' : '48px',
            height: isCompact ? '40px' : '48px',
            padding: 0,
            bgcolor: data.tab === 'thumbnail' ? tabActiveBg : tabInactiveBg,
            color: data.tab === 'thumbnail' && isCompact ? 'primary.main' : tabTextColor,
            fontSize: '1.125rem',
            border: data.tab === 'thumbnail' ? (isCompact ? `1.5px solid ${theme.palette.primary.main}` : `2px solid ${tabActiveBorder}`) : (isCompact ? `1.5px solid transparent` : `2px solid ${tabInactiveBorder}`),
            boxShadow: data.tab === 'thumbnail' ? tabActiveShadow : 'none',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            opacity: disabledDownloadTypeSet.has('thumbnail') ? 0.42 : 1,
            '&:hover': {
              bgcolor: data.tab === 'thumbnail' ? tabActiveBg : tabHoverBg,
              borderColor: data.tab === 'thumbnail' ? (isCompact ? theme.palette.primary.main : tabHoverBorder) : (isCompact ? 'transparent' : tabInactiveBorder),
            },
          }}
        >
          {loadingState ? <Skeleton variant="circular" animation="wave" width={isCompact ? 16 : 20} height={isCompact ? 16 : 20} sx={skeletonSx} /> : <ImageIcon size={isCompact ? 18 : 20} />}
        </Button>
      </Box>

      <Box
        sx={{
          margin: isCompact ? theme.spacing(0, 2, 2, 2) : theme.spacing(0, 1.5, 1.5, 1.5),
          padding: isCompact ? theme.spacing(1, 0, 1, 0) : theme.spacing(0.75, 1.5, 1.5, 1.5),
          borderRadius: isCompact ? 0 : '0 0 12px 12px',
          bgcolor: optionsSurfaceColor,
          boxShadow: (isDark || isCompact) ? 'none' : '0 2px 4px rgba(0, 0, 0, 0.2)',
          border: (isDark || isCompact) ? 'none' : '1px solid #e2e4e8',
          borderTop: 'none',
          minHeight: isCompact ? 'auto' : '120px',
          opacity: interactionsDisabled ? 0.82 : 1,
          pointerEvents: interactionsDisabled ? 'none' : 'auto',
          transition: 'opacity 180ms ease',
        }}
      >
        {loadingState && (
          <Box sx={{ pt: 0.5 }}>
            <Skeleton variant="rounded" animation="wave" width="100%" height={46} sx={{ ...skeletonSx, borderRadius: 1.25 }} />
            <Skeleton variant="rounded" animation="wave" width="100%" height={46} sx={{ ...skeletonSx, borderRadius: 1.25, mt: 1 }} />
            <Skeleton variant="rounded" animation="wave" width="100%" height={46} sx={{ ...skeletonSx, borderRadius: 1.25, mt: 1 }} />
            <Skeleton variant="rounded" animation="wave" width="100%" height={46} sx={{ ...skeletonSx, borderRadius: 1.25, mt: 1 }} />
            <Skeleton variant="rounded" animation="wave" width="100%" height={50} sx={{ ...skeletonSx, borderRadius: 999, mt: 2 }} />
          </Box>
        )}

        {!loadingState && data.tab === 'audio' && (
          <AudioTabContent
            variant={variant}
            theme={theme}
            i18nT={i18nT}
            brandColor={brandColor}
            activeSection={data.activeSection}
            toggleSection={data.toggleSection}
            downloading={interactionsDisabled}
            durationSeconds={normalizedDurationSeconds}
            durationLoading={isDurationLoading}
            durationUnavailable={isDurationUnavailable}
            titleValue={data.titleValue}
            setTitleValue={data.setTitleValue}
            artistValue={data.artistValue}
            setArtistValue={data.setArtistValue}
            albumValue={data.albumValue}
            setAlbumValue={data.setAlbumValue}
            setAudioCutsData={data.setAudioCutsData}
            coverEmbedEnabled={data.coverEmbedEnabled}
            setCoverEmbedEnabled={data.setCoverEmbedEnabled}
            coverSource={data.coverSource}
            setCoverSource={data.setCoverSource}
            videoThumbnailUrl={data.videoThumbnailUrl}
            hasVideoThumbnail={data.hasVideoThumbnail}
            videoThumbnailChecked={data.videoThumbnailChecked}
            videoThumbnailChecking={data.videoThumbnailChecking}
            coverVideoEdit={data.coverVideoEdit}
            setCoverVideoEdit={data.setCoverVideoEdit}
            coverUpload={data.coverUpload}
            setCoverUpload={data.setCoverUpload}
            coverUploadError={data.coverUploadError}
            setCoverUploadError={data.setCoverUploadError}
            handleCoverFileChange={data.handleCoverFileChange}
            selectedAudioFormat={data.selectedAudioFormat}
            setSelectedAudioFormat={data.setSelectedAudioFormat}
            audioFormats={data.audioFormats}
            maxAudioBitrateKbps={data.maxAudioBitrateKbps}
            loadingFormats={data.loadingFormats}
            isElectronRuntime={isElectronRuntime}
            downloadTargetSettings={data.audioDownloadTargetSettings}
            videoTitle={videoTitle}
            filenameValue={data.audioFilenameValue}
            setFilenameValue={data.setAudioFilenameValue}
            audioContainer={data.audioContainer}
            setAudioContainer={data.setAudioContainer}
            handleDownload={download.handleDownload}
            downloadProgress={download.downloadProgress}
            downloadStage={download.downloadStage}
            showNotification={showNotification}
          />
        )}

        {!loadingState && data.tab === 'video' && (
          <VideoTabContent
            variant={variant}
            theme={theme}
            i18nT={i18nT}
            brandColor={brandColor}
            activeSection={data.activeSection}
            toggleSection={data.toggleSection}
            downloading={interactionsDisabled}
            durationSeconds={normalizedDurationSeconds}
            durationLoading={isDurationLoading}
            durationUnavailable={isDurationUnavailable}
            setVideoCutsData={data.setVideoCutsData}
            selectedVideoFormat={data.selectedVideoFormat}
            setSelectedVideoFormat={data.setSelectedVideoFormat}
            videoFormats={data.videoFormats}
            maxVideoHeight={data.maxVideoHeight}
            loadingFormats={data.loadingFormats}
            isElectronRuntime={isElectronRuntime}
            downloadTargetSettings={data.videoDownloadTargetSettings}
            videoTitle={videoTitle}
            filenameValue={data.videoFilenameValue}
            setFilenameValue={data.setVideoFilenameValue}
            videoContainer={data.videoContainer}
            setVideoContainer={data.setVideoContainer}
            handleDownload={download.handleDownload}
            downloadProgress={download.downloadProgress}
            downloadStage={download.downloadStage}
            showNotification={showNotification}
          />
        )}

        {!loadingState && data.tab === 'thumbnail' && (
          <ThumbnailTabContent
            variant={variant}
            theme={theme}
            i18nT={i18nT}
            brandColor={brandColor}
            thumbOptions={data.thumbOptions}
            selectedThumbValue={data.selectedThumbValue}
            setSelectedThumbValue={data.setSelectedThumbValue}
            selectedThumbFormat={data.selectedThumbFormat}
            setSelectedThumbFormat={data.setSelectedThumbFormat}
            loadingThumbs={data.loadingThumbs}
            filenameValue={data.thumbnailFilenameValue}
            setFilenameValue={data.setThumbnailFilenameValue}
            videoTitle={videoTitle}
            downloading={interactionsDisabled}
          />
        )}
      </Box>

      <OverwriteConfirmDialog
        open={Boolean(overwriteDialogData)}
        title={overwriteDialogData?.title || i18nT('downloader.confirmOverwriteTitle')}
        message={overwriteDialogData?.message || ''}
        detail={overwriteDialogData?.detail || ''}
        replaceLabel={overwriteDialogData?.replaceLabel || i18nT('downloader.confirmOverwriteReplace')}
        keepLabel={overwriteDialogData?.keepLabel || i18nT('downloader.confirmOverwriteKeep')}
        cancelLabel={overwriteDialogData?.cancelLabel || i18nT('downloader.confirmOverwriteCancel')}
        onReplace={() => resolveOverwriteDialog('replace')}
        onKeep={() => resolveOverwriteDialog('keep')}
        onCancel={() => resolveOverwriteDialog('cancel')}
      />
    </Box>
  )
}
