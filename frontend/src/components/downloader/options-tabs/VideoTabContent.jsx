import React from 'react'
import { Box, Button, CircularProgress, Typography } from '@mui/material'
import { Download, Scissors, Tag, Video } from 'lucide-react'
import AudioCutSection from '../AudioCutSection'
import CombinedFilenameInput from '../CombinedFilenameInput'
import CustomSelect from '../CustomSelect'
import CollapsibleSection from './CollapsibleSection'
import SectionLoadingState from './SectionLoadingState'
import { getDownloadProgressLabel } from './downloadProgressLabel'
import { buildVideoOptions } from './formatOptions'
import { adjustColorBrightness, getContrastTextColor } from './styleUtils'
import {
  getPathDirectory,
  getPathFilename,
  resolveFullPathValue,
  updatePathExtension,
} from '../../../utils/downloadPathInput'

export default function VideoTabContent({
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
  setVideoCutsData,
  selectedVideoFormat,
  setSelectedVideoFormat,
  videoFormats,
  maxVideoHeight,
  loadingFormats,
  isElectronRuntime = false,
  downloadTargetSettings = null,
  videoTitle = '',
  filenameValue,
  setFilenameValue,
  videoContainer,
  setVideoContainer,
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
  const showQualityLoader = loadingFormats

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
      fallbackBaseName: sourceTitle || currentValue || 'download',
      extension: videoContainer || 'mp4',
    })

    pathModeInitializedRef.current = true
    if (resolvedPathValue !== filenameValue) {
      setFilenameValue(resolvedPathValue)
    }
  }, [
    pathModeEnabled,
    filenameValue,
    videoTitle,
    defaultDirectory,
    videoContainer,
    setFilenameValue,
  ])

  const handleVideoContainerChange = React.useCallback((nextExtension) => {
    setVideoContainer(nextExtension)
    if (!pathModeEnabled) return

    const nextPath = updatePathExtension(
      filenameValue,
      nextExtension,
      String(videoTitle || filenameValue || 'download'),
    )
    if (nextPath !== filenameValue) {
      setFilenameValue(nextPath)
    }
  }, [
    setVideoContainer,
    pathModeEnabled,
    filenameValue,
    videoTitle,
    setFilenameValue,
  ])

  const handlePickSavePath = React.useCallback(async () => {
    if (!canPickSavePath || downloading || pickingSavePath) return

    setPickingSavePath(true)
    try {
      const fallbackBaseName = String(videoTitle || filenameValue || 'download').trim()
      const resolvedCurrentPath = resolveFullPathValue({
        inputValue: filenameValue,
        defaultDirectory,
        fallbackBaseName,
        extension: videoContainer || 'mp4',
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
        videoContainer || 'mp4',
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
    filenameValue,
    defaultDirectory,
    videoContainer,
    runtime,
    setFilenameValue,
    i18nT,
    showNotification,
  ])

  return (
    <Box>
      <CollapsibleSection
        variant={variant}
        id="quality"
        activeSection={activeSection}
        onToggle={toggleSection}
        disabled={downloading}
        isDark={isDark}
        textColor={textColor}
        icon={<Video size={18} />}
        label={i18nT('downloader.quality')}
        theme={theme}
      >
        {showQualityLoader ? (
          <SectionLoadingState
            text={i18nT('downloader.loadingFormats')}
            isDark={isDark}
          />
        ) : (
          <CustomSelect
            variant={variant}
            value={selectedVideoFormat}
            onChange={setSelectedVideoFormat}
            options={[
              { value: 'best', label: i18nT('downloader.bestQuality'), description: undefined },
              ...buildVideoOptions(videoFormats, maxVideoHeight),
            ]}
            label={i18nT('downloader.quality')}
            isDark={isDark}
            disabled={downloading}
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection
        variant={variant}
        id="video-cut"
        activeSection={activeSection}
        onToggle={toggleSection}
        disabled={downloading}
        isDark={isDark}
        textColor={textColor}
        icon={<Scissors size={18} />}
        label={i18nT('downloader.cutVideo')}
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
            onChange={setVideoCutsData}
            mediaType="video"
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
        icon={<Tag size={18} />}
        label={i18nT(pathModeEnabled ? 'downloader.filePathAndFormat' : 'downloader.filenameAndFormat')}
        theme={theme}
      >
        <CombinedFilenameInput
          value={filenameValue}
          onChange={setFilenameValue}
          extension={videoContainer}
          onExtensionChange={handleVideoContainerChange}
          extensions={[
            { value: 'mp4', label: 'mp4' },
            { value: 'webm', label: 'webm' },
            { value: 'mkv', label: 'mkv' },
          ]}
          placeholder={i18nT(pathModeEnabled ? 'downloader.filePath' : 'downloader.filename')}
          isDark={isDark}
          disabled={downloading}
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
            onClick={() => handleDownload('video')}
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
                  <span>{i18nT('downloader.downloadVideo')}</span>
                </>
              )}
            </Box>
          </Button>
        </Box>
      )}
    </Box>
  )
}
