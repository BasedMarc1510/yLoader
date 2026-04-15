import React from 'react'
import { Box, Button, CircularProgress, Typography } from '@mui/material'
import { Download, Scissors, Video } from 'lucide-react'
import AudioCutSection from '../AudioCutSection'
import CombinedFilenameInput from '../CombinedFilenameInput'
import CustomSelect from '../CustomSelect'
import CollapsibleSection from './CollapsibleSection'
import { buildVideoOptions } from './formatOptions'
import { adjustColorBrightness } from './styleUtils'

export default function VideoTabContent({
  theme,
  i18nT,
  brandColor,
  activeSection,
  toggleSection,
  downloading,
  durationSeconds,
  setVideoCutsData,
  selectedVideoFormat,
  setSelectedVideoFormat,
  videoFormats,
  loadingFormats,
  filenameValue,
  setFilenameValue,
  videoContainer,
  setVideoContainer,
  handleDownload,
  downloadProgress,
  downloadStage,
  downloadError,
}) {
  const isDark = theme.palette.mode === 'dark'
  const textColor = isDark ? '#ffffff' : theme.palette.text.primary

  return (
    <Box>
      <CollapsibleSection
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
        <CustomSelect
          value={selectedVideoFormat}
          onChange={setSelectedVideoFormat}
          options={[
            { value: 'best', label: i18nT('downloader.bestQuality'), description: undefined },
            ...buildVideoOptions(videoFormats),
          ]}
          label={i18nT('downloader.quality')}
          isDark={isDark}
          disabled={loadingFormats || downloading}
        />
      </CollapsibleSection>

      <CollapsibleSection
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
        <AudioCutSection
          duration={durationSeconds}
          brandColor={brandColor}
          isDark={isDark}
          disabled={downloading}
          onChange={setVideoCutsData}
          mediaType="video"
        />
      </CollapsibleSection>

      <Box sx={{ mb: 2 }}>
        <CombinedFilenameInput
          value={filenameValue}
          onChange={setFilenameValue}
          extension={videoContainer}
          onExtensionChange={setVideoContainer}
          extensions={[
            { value: 'mp4', label: 'mp4' },
            { value: 'webm', label: 'webm' },
            { value: 'mkv', label: 'mkv' },
          ]}
          placeholder={i18nT('downloader.filename')}
          isDark={isDark}
          disabled={downloading}
        />
      </Box>

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
            color: '#ffffff',
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
              bgcolor: '#444',
              color: 'rgba(255,255,255,0.9)',
              borderColor: '#444',
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
                bgcolor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                transition: 'width 0.2s linear',
                zIndex: 0,
                height: 'calc(100% + 4px)',
              }}
            />
          )}

          <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {downloading ? (
              <>
                <CircularProgress size={22} sx={{ color: '#ffffff' }} thickness={5} />
                <Typography sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                  {downloadStage === 'merging'
                    ? i18nT('downloader.merging')
                    : (downloadStage === 'processing' ? i18nT('downloader.processing') : `${Math.round(downloadProgress)}%`)}
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

      {downloadError && (
        <Typography sx={{ color: 'error.main', fontSize: '0.875rem', mt: 1, textAlign: 'center' }}>
          {downloadError}
        </Typography>
      )}
    </Box>
  )
}
