import React from 'react'
import { Box, Button, Skeleton, useTheme } from '@mui/material'
import { Image as ImageIcon, Music2, Video } from 'lucide-react'
import { useNotification } from '../../providers/NotificationProvider'
import { useI18n } from '../../providers/I18nProvider'
import { shouldSuggestCookieSettings } from '../../utils/ytDlpErrorPresentation'
import { openSettingsModal } from '../../pages/home/settingsBridge'
import AudioTabContent from './options-tabs/AudioTabContent'
import ThumbnailTabContent from './options-tabs/ThumbnailTabContent'
import useOptionsTabsData from './options-tabs/useOptionsTabsData'
import useStreamDownload from './options-tabs/useStreamDownload'
import VideoTabContent from './options-tabs/VideoTabContent'

export default function OptionsTabs({
  brandColor = '#df2f2f',
  videoTitle = '',
  videoAuthor = '',
  videoUrl = '',
  durationSeconds = null,
  serviceKey = null,
  initialFormats = null,
  onFetchError = null,
  onDownloadStateChange = null,
  loadingState = false,
  autostartFormat = '',
}) {
  const theme = useTheme()
  const { t: i18nT } = useI18n()
  const { showNotification } = useNotification()

  const effectiveVideoUrl = loadingState ? '' : videoUrl
  const effectiveInitialFormats = loadingState
    ? { audioFormats: [], videoFormats: [], thumbnails: [] }
    : initialFormats

  const data = useOptionsTabsData({
    i18nT,
    videoTitle,
    videoAuthor,
    videoUrl: effectiveVideoUrl,
    initialFormats: effectiveInitialFormats,
    onFetchError,
  })

  const download = useStreamDownload({
    i18nT,
    showNotification,
    onDownloadStateChange,
    videoUrl: effectiveVideoUrl,
    serviceKey,
    durationSeconds,
    videoTitle,
    videoAuthor,
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
  })

  const interactionsDisabled = download.downloading || loadingState

  const isDark = theme.palette.mode === 'dark'
  const tabActiveBg = isDark ? '#272727' : '#e0e0e0'
  const tabInactiveBg = isDark ? '#1a1a1a' : '#f5f5f5'
  const tabActiveBorder = isDark ? '#424242' : '#a0a0a0'
  const tabInactiveBorder = isDark ? '#1a1a1a' : '#f5f5f5'
  const tabHoverBorder = isDark ? '#555555' : '#909090'
  const tabTextColor = isDark ? '#ffffff' : theme.palette.text.primary
  const skeletonSx = React.useMemo(() => ({
    bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
    '&::after': {
      background: isDark
        ? 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)'
        : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)',
    },
  }), [isDark])
  const showCookieSettingsHint = React.useMemo(
    () => shouldSuggestCookieSettings(download.downloadError, { i18nT }),
    [download.downloadError, i18nT]
  )

  const openCookieSettings = React.useCallback(() => {
    openSettingsModal('yt-dlp', 'cookies')
  }, [])

  const [hasAutostarted, setHasAutostarted] = React.useState(false)

  React.useEffect(() => {
    const format = String(autostartFormat || '').trim().toLowerCase()
    if (!format || loadingState || hasAutostarted || interactionsDisabled) return

    const formatIsMp3 = format === 'mp3'
    const formatIsMp4 = format === 'mp4'
    const canMp3 = formatIsMp3 && data.audioFormats.length > 0
    const canMp4 = formatIsMp4 && data.videoFormats.length > 0

    if (canMp3 || canMp4) {
      if (formatIsMp3 && data.tab !== 'audio') data.handleTabChange('audio')
      if (formatIsMp4 && data.tab !== 'video') data.handleTabChange('video')

      setHasAutostarted(true)

      // Small delay to ensure tab state renders and no other effects block the trigger
      setTimeout(() => {
        download.handleDownload(true)
      }, 150)
    }
  }, [autostartFormat, loadingState, data, hasAutostarted, interactionsDisabled, download])

  return (
    <Box>
      <Box
        sx={{
          margin: theme.spacing(1.5, 1.5, 0, 1.5),
          padding: theme.spacing(1.5),
          borderRadius: '12px 12px 0 0',
          bgcolor: isDark ? '#0a0a0a' : '#f0f0f0',
          boxShadow: isDark ? '0 2px 4px rgba(0, 0, 0, 0.2)' : 'none',
          display: 'flex',
          gap: theme.spacing(1),
          opacity: interactionsDisabled ? 0.66 : 1,
          pointerEvents: interactionsDisabled ? 'none' : 'auto',
          transition: 'opacity 180ms ease',
        }}
      >
        <Button
          variant="contained"
          startIcon={loadingState ? <Skeleton variant="circular" animation="wave" width={20} height={20} sx={skeletonSx} /> : <Music2 size={20} />}
          onClick={() => data.handleTabChange('audio')}
          disabled={interactionsDisabled}
          sx={{
            borderRadius: '28px',
            textTransform: 'none',
            padding: '12px 16px',
            fontWeight: 600,
            flex: 1,
            height: '48px',
            bgcolor: data.tab === 'audio' ? tabActiveBg : tabInactiveBg,
            color: tabTextColor,
            fontSize: '1.125rem',
            border: data.tab === 'audio' ? `2px solid ${tabActiveBorder}` : `2px solid ${tabInactiveBorder}`,
            boxSizing: 'border-box',
            '&:hover': {
              bgcolor: tabActiveBg,
              borderColor: data.tab === 'audio' ? tabHoverBorder : tabInactiveBorder,
            },
          }}
        >
          {loadingState ? <Skeleton variant="text" animation="wave" width={70} sx={skeletonSx} /> : i18nT('downloader.tabAudio')}
        </Button>

        <Button
          variant="contained"
          startIcon={loadingState ? <Skeleton variant="circular" animation="wave" width={20} height={20} sx={skeletonSx} /> : <Video size={20} />}
          onClick={() => data.handleTabChange('video')}
          disabled={interactionsDisabled}
          sx={{
            borderRadius: '28px',
            textTransform: 'none',
            padding: '12px 16px',
            fontWeight: 600,
            flex: 1,
            height: '48px',
            bgcolor: data.tab === 'video' ? tabActiveBg : tabInactiveBg,
            color: tabTextColor,
            fontSize: '1.125rem',
            border: data.tab === 'video' ? `2px solid ${tabActiveBorder}` : `2px solid ${tabInactiveBorder}`,
            boxSizing: 'border-box',
            '&:hover': {
              bgcolor: tabActiveBg,
              borderColor: data.tab === 'video' ? tabHoverBorder : tabInactiveBorder,
            },
          }}
        >
          {loadingState ? <Skeleton variant="text" animation="wave" width={70} sx={skeletonSx} /> : i18nT('downloader.tabVideo')}
        </Button>

        <Button
          variant="contained"
          onClick={() => data.handleTabChange('thumbnail')}
          disabled={interactionsDisabled}
          sx={{
            borderRadius: '50%',
            minWidth: '48px',
            width: '48px',
            height: '48px',
            padding: 0,
            bgcolor: data.tab === 'thumbnail' ? tabActiveBg : tabInactiveBg,
            color: tabTextColor,
            fontSize: '1.125rem',
            border: data.tab === 'thumbnail' ? `2px solid ${tabActiveBorder}` : `2px solid ${tabInactiveBorder}`,
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            '&:hover': {
              bgcolor: tabActiveBg,
              borderColor: data.tab === 'thumbnail' ? tabHoverBorder : tabInactiveBorder,
            },
          }}
        >
          {loadingState ? <Skeleton variant="circular" animation="wave" width={20} height={20} sx={skeletonSx} /> : <ImageIcon size={20} />}
        </Button>
      </Box>

      <Box
        sx={{
          margin: theme.spacing(0, 1.5, 1.5, 1.5),
          padding: theme.spacing(0.75, 1.5, 1.5, 1.5),
          borderRadius: '0 0 12px 12px',
          bgcolor: isDark ? '#0a0a0a' : '#f0f0f0',
          boxShadow: isDark ? '0 2px 4px rgba(0, 0, 0, 0.2)' : 'none',
          minHeight: '120px',
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
            theme={theme}
            i18nT={i18nT}
            brandColor={brandColor}
            activeSection={data.activeSection}
            toggleSection={data.toggleSection}
            downloading={interactionsDisabled}
            durationSeconds={durationSeconds}
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
            filenameValue={data.audioFilenameValue}
            setFilenameValue={data.setAudioFilenameValue}
            audioContainer={data.audioContainer}
            setAudioContainer={data.setAudioContainer}
            handleDownload={download.handleDownload}
            downloadProgress={download.downloadProgress}
            downloadStage={download.downloadStage}
            downloadError={download.downloadError}
            showCookieSettingsHint={showCookieSettingsHint}
            onOpenCookieSettings={openCookieSettings}
          />
        )}

        {!loadingState && data.tab === 'video' && (
          <VideoTabContent
            theme={theme}
            i18nT={i18nT}
            brandColor={brandColor}
            activeSection={data.activeSection}
            toggleSection={data.toggleSection}
            downloading={interactionsDisabled}
            durationSeconds={durationSeconds}
            setVideoCutsData={data.setVideoCutsData}
            selectedVideoFormat={data.selectedVideoFormat}
            setSelectedVideoFormat={data.setSelectedVideoFormat}
            videoFormats={data.videoFormats}
            maxVideoHeight={data.maxVideoHeight}
            loadingFormats={data.loadingFormats}
            filenameValue={data.videoFilenameValue}
            setFilenameValue={data.setVideoFilenameValue}
            videoContainer={data.videoContainer}
            setVideoContainer={data.setVideoContainer}
            handleDownload={download.handleDownload}
            downloadProgress={download.downloadProgress}
            downloadStage={download.downloadStage}
            downloadError={download.downloadError}
            showCookieSettingsHint={showCookieSettingsHint}
            onOpenCookieSettings={openCookieSettings}
          />
        )}

        {!loadingState && data.tab === 'thumbnail' && (
          <ThumbnailTabContent
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
    </Box>
  )
}
