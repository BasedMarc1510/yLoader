import React from 'react'
import { Box, Button, CircularProgress, Typography } from '@mui/material'
import {
  Download,
  Image as ImageIcon,
  Info,
  Scissors,
  Tag,
  TrendingUp,
} from 'lucide-react'
import AudioCutSection from '../AudioCutSection'
import CombinedFilenameInput from '../CombinedFilenameInput'
import CustomSelect from '../CustomSelect'
import MetadataInput from '../MetadataInput'
import AudioCoverSection from './AudioCoverSection'
import CollapsibleSection from './CollapsibleSection'
import SectionLoadingState from './SectionLoadingState'
import { getDownloadProgressLabel } from './downloadProgressLabel'
import { buildAudioOptions } from './formatOptions'
import { adjustColorBrightness, getContrastTextColor } from './styleUtils'
import { parseVideoTitle } from '../../../utils/metadataParser'
import {
  getPathDirectory,
  getPathFilename,
  resolveFullPathValue,
  updatePathExtension,
} from '../../../utils/downloadPathInput'

export default function AudioTabContent({
  variant = 'default',
  theme,
  i18nT,
  brandColor,
  activeSection,
  toggleSection,
  downloading,
  durationSeconds,
  durationLoading = false,
  durationUnavailable = false,
  titleValue,
  setTitleValue,
  artistValue,
  setArtistValue,
  albumValue,
  setAlbumValue,
  audioCutsData,
  setAudioCutsData,
  coverEmbedEnabled,
  setCoverEmbedEnabled,
  coverSource,
  setCoverSource,
  videoThumbnailUrl,
  hasVideoThumbnail,
  videoThumbnailChecked,
  videoThumbnailChecking,
  coverVideoEdit,
  setCoverVideoEdit,
  coverUpload,
  setCoverUpload,
  coverUploadError,
  setCoverUploadError,
  handleCoverFileChange,
  selectedAudioFormat,
  setSelectedAudioFormat,
  audioFormats,
  maxAudioBitrateKbps,
  loadingFormats,
  isElectronRuntime = false,
  downloadTargetSettings = null,
  defaultAudioContainer,
  defaultCoverEmbedEnabled,
  videoTitle = '',
  videoAuthor = '',
  filenameValue,
  setFilenameValue,
  audioContainer,
  setAudioContainer,
  handleDownload,
  downloadProgress,
  downloadStage,
  showNotification,
}) {
  const isDark = theme.palette.mode === 'dark'
  const isCompact = variant === 'compact'
  const textColor = isDark ? '#ffffff' : theme.palette.text.primary
  const downloadButtonTextColor = React.useMemo(
    () => getContrastTextColor(theme, brandColor),
    [brandColor, theme]
  )
  const progressOverlayColor = downloadButtonTextColor === '#111111'
    ? 'rgba(0,0,0,0.14)'
    : 'rgba(255,255,255,0.22)'
  const runtime = typeof window !== 'undefined' ? window.yloaderRuntime : null
  const pathModeEnabled = Boolean(
    isElectronRuntime
    && downloadTargetSettings
    && downloadTargetSettings.alwaysAsk === false
  )
  const defaultDirectory = String(downloadTargetSettings?.directoryPath || runtime?.downloadsPath || '').trim()
  const canPickSavePath = Boolean(pathModeEnabled && runtime?.downloads?.pickSavePath)
  const [pickingSavePath, setPickingSavePath] = React.useState(false)
  const pathModeInitializedRef = React.useRef(false)
  const showCutLoader = durationLoading
  const showCutUnavailable = !durationLoading && durationUnavailable
  const showBitrateLoader = loadingFormats
  const normalizeValue = (value) => String(value || '').trim()
  const normalizedVideoTitle = normalizeValue(videoTitle)
  const normalizedVideoAuthor = normalizeValue(videoAuthor)
  const parsedMetadata = parseVideoTitle(normalizedVideoTitle)
  const metadataDefaults = {
    title: normalizeValue(parsedMetadata.title || normalizedVideoTitle || ''),
    artist: normalizeValue(parsedMetadata.artist || normalizedVideoAuthor || ''),
    album: normalizeValue(parsedMetadata.album || ''),
  }
  const metadataChanged =
    normalizeValue(titleValue) !== metadataDefaults.title
    || normalizeValue(artistValue) !== metadataDefaults.artist
    || normalizeValue(albumValue) !== metadataDefaults.album
  const defaultAudioContainerValue = normalizeValue(defaultAudioContainer) || 'mp3'
  const filenameBaseName = normalizedVideoTitle || normalizeValue(titleValue) || 'download'
  const defaultFilenameValue = pathModeEnabled
    ? resolveFullPathValue({
      inputValue: '',
      defaultDirectory,
      fallbackBaseName: filenameBaseName,
      extension: defaultAudioContainerValue,
    })
    : filenameBaseName
  const normalizedFilenameValue = normalizeValue(filenameValue)
  const normalizedDefaultFilename = normalizeValue(defaultFilenameValue)
  const filenameChanged = normalizedFilenameValue
    ? normalizedFilenameValue !== normalizedDefaultFilename
    : false
  const containerChanged = normalizeValue(audioContainer) !== defaultAudioContainerValue
  const bitrateChanged = Boolean(selectedAudioFormat && selectedAudioFormat !== 'best')
  const coverDefaultSource = (videoThumbnailChecked && !videoThumbnailChecking && !hasVideoThumbnail)
    ? 'upload'
    : 'video'
  const coverDefaultEmbedEnabled = (videoThumbnailChecked && !videoThumbnailChecking && !hasVideoThumbnail)
    ? false
    : Boolean(defaultCoverEmbedEnabled)
  const coverHasUpload = Boolean(coverUpload?.dataUrl || coverUpload?.originalDataUrl)
  const coverHasVideoEdit = Boolean(coverVideoEdit?.dataUrl)
  const coverChanged = coverSource !== coverDefaultSource
    || coverEmbedEnabled !== coverDefaultEmbedEnabled
    || coverHasUpload
    || coverHasVideoEdit
  const cutChanged = React.useMemo(() => {
    if (!audioCutsData) return false
    const enabled = Boolean(audioCutsData.enabled)
    const mode = String(audioCutsData.mode || 'keep')
    const trimStart = Number(audioCutsData.trimStart) || 0
    const trimEnd = Number(audioCutsData.trimEnd) || 0
    const segments = Array.isArray(audioCutsData.segments) ? audioCutsData.segments : []
    const hasSegments = segments.length > 0
    const duration = Number(durationSeconds)
    const hasDuration = Number.isFinite(duration) && duration > 0
    const defaultEnd = hasDuration ? duration : 1
    const endChanged = hasDuration ? trimEnd < duration : trimEnd !== defaultEnd
    return enabled || mode !== 'keep' || trimStart > 0 || endChanged || hasSegments
  }, [audioCutsData, durationSeconds])

  React.useEffect(() => {
    if (!pathModeEnabled) {
      pathModeInitializedRef.current = false
      return
    }

    const sourceTitle = String(videoTitle || '').trim()
    const currentValue = String(filenameValue || '').trim()
    const shouldHydratePath = !pathModeInitializedRef.current
      || (sourceTitle && currentValue === sourceTitle)

    if (!shouldHydratePath) return

    const resolvedPathValue = resolveFullPathValue({
      inputValue: currentValue,
      defaultDirectory,
      fallbackBaseName: sourceTitle || titleValue || currentValue || 'download',
      extension: audioContainer || 'mp3',
    })

    pathModeInitializedRef.current = true
    if (resolvedPathValue !== filenameValue) {
      setFilenameValue(resolvedPathValue)
    }
  }, [
    pathModeEnabled,
    filenameValue,
    videoTitle,
    titleValue,
    defaultDirectory,
    audioContainer,
    setFilenameValue,
  ])

  const handleAudioContainerChange = React.useCallback((nextExtension) => {
    setAudioContainer(nextExtension)
    if (!pathModeEnabled) return

    const nextPath = updatePathExtension(
      filenameValue,
      nextExtension,
      String(videoTitle || titleValue || filenameValue || 'download'),
    )
    if (nextPath !== filenameValue) {
      setFilenameValue(nextPath)
    }
  }, [
    setAudioContainer,
    pathModeEnabled,
    filenameValue,
    videoTitle,
    titleValue,
    setFilenameValue,
  ])

  const handlePickSavePath = React.useCallback(async () => {
    if (!canPickSavePath || downloading || pickingSavePath) return

    setPickingSavePath(true)
    try {
      const fallbackBaseName = String(videoTitle || titleValue || filenameValue || 'download').trim()
      const resolvedCurrentPath = resolveFullPathValue({
        inputValue: filenameValue,
        defaultDirectory,
        fallbackBaseName,
        extension: audioContainer || 'mp3',
      })
      const initialDirectory = String(getPathDirectory(resolvedCurrentPath) || defaultDirectory).trim()
      const suggestedName = String(getPathFilename(resolvedCurrentPath) || '').trim()

      const result = await runtime.downloads.pickSavePath({
        initialDirectory,
        suggestedName,
      })
      if (!result || result.canceled || !result.path) return

      const pickedPath = updatePathExtension(
        String(result.path || '').trim(),
        audioContainer || 'mp3',
        fallbackBaseName,
      )
      if (pickedPath) {
        setFilenameValue(pickedPath)
      }
    } catch (error) {
      const message = i18nT('downloader.errorPickSavePath', { message: error?.message || error })
      showNotification?.(message, 'error')
    } finally {
      setPickingSavePath(false)
    }
  }, [
    canPickSavePath,
    downloading,
    pickingSavePath,
    videoTitle,
    titleValue,
    filenameValue,
    defaultDirectory,
    audioContainer,
    runtime,
    setFilenameValue,
    i18nT,
    showNotification,
  ])

  return (
    <Box>
      <CollapsibleSection
        variant={variant}
        id="metadata"
        activeSection={activeSection}
        onToggle={toggleSection}
        disabled={downloading}
        isDark={isDark}
        textColor={textColor}
        iconColor={metadataChanged ? brandColor : undefined}
        icon={<Info size={18} />}
        label={i18nT('downloader.metadata')}
        theme={theme}
      >
        <MetadataInput
          id="title_input"
          label={i18nT('downloader.titleLabel')}
          value={titleValue}
          onChange={(e) => setTitleValue(e.target.value)}
          maxLength={120}
          isDark={isDark}
          disabled={downloading}
        />
        <MetadataInput
          id="artist_input"
          label={i18nT('downloader.artistLabel')}
          value={artistValue}
          onChange={(e) => setArtistValue(e.target.value)}
          maxLength={120}
          isDark={isDark}
          disabled={downloading}
        />
        <MetadataInput
          id="album_input"
          label={i18nT('downloader.albumLabel')}
          value={albumValue}
          onChange={(e) => setAlbumValue(e.target.value)}
          maxLength={120}
          isDark={isDark}
          disabled={downloading}
        />
      </CollapsibleSection>

      <CollapsibleSection
        variant={variant}
        id="cut"
        activeSection={activeSection}
        onToggle={toggleSection}
        disabled={downloading}
        isDark={isDark}
        textColor={textColor}
        iconColor={cutChanged ? brandColor : undefined}
        icon={<Scissors size={18} />}
        label={i18nT('downloader.cutAudio')}
        theme={theme}
      >
        {showCutLoader ? (
          <SectionLoadingState
            text={i18nT('downloader.loadingDuration')}
            isDark={isDark}
          />
        ) : showCutUnavailable ? (
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              py: 1,
              color: isDark ? '#a7adbb' : '#5e6675',
              fontWeight: 600,
            }}
          >
            {i18nT('downloader.durationUnavailable')}
          </Typography>
        ) : (
          <AudioCutSection
            duration={durationSeconds}
            brandColor={brandColor}
            isDark={isDark}
            disabled={downloading}
            kind="audio"
            onChange={setAudioCutsData}
            mediaType="audio"
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection
        variant={variant}
        id="cover"
        activeSection={activeSection}
        onToggle={toggleSection}
        disabled={downloading}
        isDark={isDark}
        textColor={textColor}
        iconColor={coverChanged ? brandColor : undefined}
        icon={<ImageIcon size={18} />}
        label={i18nT('downloader.albumCover')}
        theme={theme}
      >
        <AudioCoverSection
          i18nT={i18nT}
          isDark={isDark}
          textColor={textColor}
          brandColor={brandColor}
          downloading={downloading}
          coverEmbedEnabled={coverEmbedEnabled}
          setCoverEmbedEnabled={setCoverEmbedEnabled}
          coverSource={coverSource}
          setCoverSource={setCoverSource}
          videoThumbnailUrl={videoThumbnailUrl}
          hasVideoThumbnail={hasVideoThumbnail}
          videoThumbnailChecked={videoThumbnailChecked}
          videoThumbnailChecking={videoThumbnailChecking}
          coverVideoEdit={coverVideoEdit}
          setCoverVideoEdit={setCoverVideoEdit}
          coverUpload={coverUpload}
          setCoverUpload={setCoverUpload}
          coverUploadError={coverUploadError}
          setCoverUploadError={setCoverUploadError}
          handleCoverFileChange={handleCoverFileChange}
        />
      </CollapsibleSection>

      <CollapsibleSection
        variant={variant}
        id="bitrate"
        activeSection={activeSection}
        onToggle={toggleSection}
        disabled={downloading}
        isDark={isDark}
        textColor={textColor}
        iconColor={bitrateChanged ? brandColor : undefined}
        icon={<TrendingUp size={18} />}
        label={i18nT('downloader.audioBitrate')}
        theme={theme}
      >
        {showBitrateLoader ? (
          <SectionLoadingState
            text={i18nT('downloader.loadingFormats')}
            isDark={isDark}
          />
        ) : (
          <CustomSelect
            variant={variant}
            value={selectedAudioFormat}
            onChange={setSelectedAudioFormat}
            options={[
              { value: 'best', label: i18nT('downloader.bestQuality'), description: undefined },
              ...buildAudioOptions(audioFormats, maxAudioBitrateKbps),
            ]}
            label={i18nT('downloader.quality')}
            isDark={isDark}
            disabled={downloading}
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection
        variant={variant}
        id="filename"
        activeSection={activeSection}
        onToggle={toggleSection}
        disabled={downloading}
        isDark={isDark}
        textColor={textColor}
        iconColor={(filenameChanged || containerChanged) ? brandColor : undefined}
        icon={<Tag size={18} />}
        label={i18nT(pathModeEnabled ? 'downloader.filePathAndFormat' : 'downloader.filenameAndFormat')}
        theme={theme}
      >
        <CombinedFilenameInput
          value={filenameValue}
          onChange={setFilenameValue}
          extension={audioContainer}
          onExtensionChange={handleAudioContainerChange}
          extensions={[
            { value: 'mp3', label: 'mp3' },
            { value: 'm4a', label: 'm4a' },
            { value: 'wav', label: 'wav' },
            { value: 'ogg', label: 'ogg' },
            { value: 'flac', label: 'flac' },
            { value: 'opus', label: 'opus' },
          ]}
          placeholder={i18nT(pathModeEnabled ? 'downloader.filePath' : 'downloader.filename')}
          isDark={isDark}
          disabled={downloading}
          variant={variant}
          showPathPicker={pathModeEnabled && canPickSavePath}
          onPickPath={handlePickSavePath}
          pickPathDisabled={downloading || !canPickSavePath}
          pickPathLoading={pickingSavePath}
          pickPathAriaLabel={i18nT('downloader.browseFilePath')}
        />
      </CollapsibleSection>

      {!isCompact && (
        <Box sx={{ position: 'relative', mt: 2 }}>
          <Button
            fullWidth
            onClick={() => handleDownload('audio')}
            disabled={downloading}
            sx={{
              position: 'relative',
              overflow: 'hidden',
              bgcolor: brandColor,
              borderRadius: '999px',
              textTransform: 'none',
              padding: '14px 20px',
              fontWeight: 700,
              color: downloadButtonTextColor,
              fontSize: '1.125rem',
              border: `2px solid ${adjustColorBrightness(brandColor, -20)}`,
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: adjustColorBrightness(brandColor, -10),
                boxShadow: '0 6px 16px rgba(0,0,0,0.25)',
              },
              '&:active': {
                bgcolor: adjustColorBrightness(brandColor, -15),
              },
              '&:disabled': {
                bgcolor: isDark ? '#444' : '#c8cad0',
                color: isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.5)',
                borderColor: isDark ? '#444' : '#c8cad0',
                boxShadow: 'none',
              },
            }}
          >
            {downloading && (
              <Box
                sx={{
                  position: 'absolute',
                  top: '-2px',
                  left: '-2px',
                  bottom: '-2px',
                  width: `calc(${downloadProgress}% + 4px)`,
                  bgcolor: progressOverlayColor,
                  transition: 'width 0.2s linear',
                  zIndex: 0,
                  height: 'calc(100% + 4px)',
                }}
              />
            )}

            <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, width: '100%' }}>
              {downloading ? (
                <>
                  <CircularProgress size={22} color="inherit" sx={{ color: 'inherit' }} thickness={5} />
                  <Typography sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                    {getDownloadProgressLabel(i18nT, downloadStage, downloadProgress)}
                  </Typography>
                </>
              ) : (
                <>
                  <Download size={22} strokeWidth={2.5} />
                  <span>{i18nT('downloader.downloadAudio')}</span>
                </>
              )}
            </Box>
          </Button>
        </Box>
      )}
    </Box>
  )
}
