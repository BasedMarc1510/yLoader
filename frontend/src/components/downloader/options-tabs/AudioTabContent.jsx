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
import { buildAudioOptions } from './formatOptions'
import { adjustColorBrightness } from './styleUtils'

export default function AudioTabContent({
  theme,
  i18nT,
  brandColor,
  activeSection,
  toggleSection,
  downloading,
  durationSeconds,
  titleValue,
  setTitleValue,
  artistValue,
  setArtistValue,
  albumValue,
  setAlbumValue,
  setAudioCutsData,
  coverEmbedEnabled,
  setCoverEmbedEnabled,
  coverSource,
  setCoverSource,
  coverUpload,
  setCoverUpload,
  coverUploadError,
  setCoverUploadError,
  handleCoverFileChange,
  selectedAudioFormat,
  setSelectedAudioFormat,
  audioFormats,
  loadingFormats,
  filenameValue,
  setFilenameValue,
  audioContainer,
  setAudioContainer,
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
        id="metadata"
        activeSection={activeSection}
        onToggle={toggleSection}
        disabled={downloading}
        isDark={isDark}
        textColor={textColor}
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
        id="cut"
        activeSection={activeSection}
        onToggle={toggleSection}
        disabled={downloading}
        isDark={isDark}
        textColor={textColor}
        icon={<Scissors size={18} />}
        label={i18nT('downloader.cutAudio')}
        theme={theme}
      >
        <AudioCutSection
          duration={durationSeconds}
          brandColor={brandColor}
          isDark={isDark}
          disabled={downloading}
          kind="audio"
          onChange={setAudioCutsData}
          mediaType="audio"
        />
      </CollapsibleSection>

      <CollapsibleSection
        id="cover"
        activeSection={activeSection}
        onToggle={toggleSection}
        disabled={downloading}
        isDark={isDark}
        textColor={textColor}
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
          coverUpload={coverUpload}
          setCoverUpload={setCoverUpload}
          coverUploadError={coverUploadError}
          setCoverUploadError={setCoverUploadError}
          handleCoverFileChange={handleCoverFileChange}
        />
      </CollapsibleSection>

      <CollapsibleSection
        id="bitrate"
        activeSection={activeSection}
        onToggle={toggleSection}
        disabled={downloading}
        isDark={isDark}
        textColor={textColor}
        icon={<TrendingUp size={18} />}
        label={i18nT('downloader.audioBitrate')}
        theme={theme}
      >
        <CustomSelect
          value={selectedAudioFormat}
          onChange={setSelectedAudioFormat}
          options={[
            { value: 'best', label: i18nT('downloader.bestQuality'), description: undefined },
            ...buildAudioOptions(audioFormats),
          ]}
          label={i18nT('downloader.quality')}
          isDark={isDark}
          disabled={loadingFormats || downloading}
        />
      </CollapsibleSection>

      <CollapsibleSection
        id="filename"
        activeSection={activeSection}
        onToggle={toggleSection}
        disabled={downloading}
        isDark={isDark}
        textColor={textColor}
        icon={<Tag size={18} />}
        label={i18nT('downloader.filename')}
        theme={theme}
      >
        <CombinedFilenameInput
          value={filenameValue}
          onChange={setFilenameValue}
          extension={audioContainer}
          onExtensionChange={setAudioContainer}
          extensions={[
            { value: 'mp3', label: 'mp3' },
            { value: 'm4a', label: 'm4a' },
            { value: 'wav', label: 'wav' },
            { value: 'ogg', label: 'ogg' },
            { value: 'flac', label: 'flac' },
            { value: 'opus', label: 'opus' },
          ]}
          placeholder={i18nT('downloader.filename')}
          isDark={isDark}
          disabled={downloading}
        />
      </CollapsibleSection>

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
                <span>{i18nT('downloader.downloadAudio')}</span>
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
