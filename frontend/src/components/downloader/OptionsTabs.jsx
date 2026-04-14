import React from 'react'
import { Box, Button, useTheme } from '@mui/material'
import { Image as ImageIcon, Music2, Video } from 'lucide-react'
import { useNotification } from '../../providers/NotificationProvider'
import { useI18n } from '../../providers/I18nProvider'
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
}) {
  const theme = useTheme()
  const { t: i18nT } = useI18n()
  const { showNotification } = useNotification()

  const data = useOptionsTabsData({
    i18nT,
    videoTitle,
    videoAuthor,
    videoUrl,
    initialFormats,
    onFetchError,
  })

  const download = useStreamDownload({
    i18nT,
    showNotification,
    onDownloadStateChange,
    videoUrl,
    serviceKey,
    durationSeconds,
    videoTitle,
    videoAuthor,
    filenameValue: data.filenameValue,
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

  const isDark = theme.palette.mode === 'dark'
  const tabActiveBg = isDark ? '#272727' : '#e0e0e0'
  const tabInactiveBg = isDark ? '#1a1a1a' : '#f5f5f5'
  const tabActiveBorder = isDark ? '#424242' : '#a0a0a0'
  const tabInactiveBorder = isDark ? '#1a1a1a' : '#f5f5f5'
  const tabHoverBorder = isDark ? '#555555' : '#909090'
  const tabTextColor = isDark ? '#ffffff' : theme.palette.text.primary

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
          opacity: download.downloading ? 0.6 : 1,
          pointerEvents: download.downloading ? 'none' : 'auto',
        }}
      >
        <Button
          variant="contained"
          startIcon={<Music2 size={20} />}
          onClick={() => data.handleTabChange('audio')}
          disabled={download.downloading}
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
          {i18nT('downloader.tabAudio')}
        </Button>

        <Button
          variant="contained"
          startIcon={<Video size={20} />}
          onClick={() => data.handleTabChange('video')}
          disabled={download.downloading}
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
          {i18nT('downloader.tabVideo')}
        </Button>

        <Button
          variant="contained"
          onClick={() => data.handleTabChange('thumbnail')}
          disabled={download.downloading}
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
          <ImageIcon size={20} />
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
          opacity: download.downloading ? 0.8 : 1,
          pointerEvents: download.downloading ? 'none' : 'auto',
        }}
      >
        {data.tab === 'audio' && (
          <AudioTabContent
            theme={theme}
            i18nT={i18nT}
            brandColor={brandColor}
            activeSection={data.activeSection}
            toggleSection={data.toggleSection}
            downloading={download.downloading}
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
            loadingFormats={data.loadingFormats}
            filenameValue={data.filenameValue}
            setFilenameValue={data.setFilenameValue}
            audioContainer={data.audioContainer}
            setAudioContainer={data.setAudioContainer}
            handleDownload={download.handleDownload}
            downloadProgress={download.downloadProgress}
            downloadStage={download.downloadStage}
            downloadError={download.downloadError}
          />
        )}

        {data.tab === 'video' && (
          <VideoTabContent
            theme={theme}
            i18nT={i18nT}
            brandColor={brandColor}
            activeSection={data.activeSection}
            toggleSection={data.toggleSection}
            downloading={download.downloading}
            durationSeconds={durationSeconds}
            setVideoCutsData={data.setVideoCutsData}
            selectedVideoFormat={data.selectedVideoFormat}
            setSelectedVideoFormat={data.setSelectedVideoFormat}
            videoFormats={data.videoFormats}
            loadingFormats={data.loadingFormats}
            filenameValue={data.filenameValue}
            setFilenameValue={data.setFilenameValue}
            videoContainer={data.videoContainer}
            setVideoContainer={data.setVideoContainer}
            handleDownload={download.handleDownload}
            downloadProgress={download.downloadProgress}
            downloadStage={download.downloadStage}
            downloadError={download.downloadError}
          />
        )}

        {data.tab === 'thumbnail' && (
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
            filenameValue={data.filenameValue}
            setFilenameValue={data.setFilenameValue}
            videoTitle={videoTitle}
            downloading={download.downloading}
          />
        )}
      </Box>
    </Box>
  )
}
