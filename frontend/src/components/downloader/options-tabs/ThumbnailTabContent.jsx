import React from 'react'
import { Box, Button, Typography } from '@mui/material'
import { Download } from 'lucide-react'
import CombinedFilenameInput from '../CombinedFilenameInput'
import CustomSelect from '../CustomSelect'
import { getApiBase } from '../../../utils/metadata'
import { adjustColorBrightness } from './styleUtils'

export default function ThumbnailTabContent({
  theme,
  i18nT,
  brandColor,
  thumbOptions,
  selectedThumbValue,
  setSelectedThumbValue,
  selectedThumbFormat,
  setSelectedThumbFormat,
  loadingThumbs,
  filenameValue,
  setFilenameValue,
  videoTitle,
  downloading,
}) {
  const isDark = theme.palette.mode === 'dark'
  const textColor = isDark ? '#ffffff' : theme.palette.text.primary
  const borderColor = isDark ? '#3a3a3a' : '#d0d0d0'
  const apiBase = getApiBase()
  const selectedThumb = thumbOptions.find((option) => option.value === selectedThumbValue) || null

  const handleDownloadThumb = () => {
    if (!selectedThumb) return

    const rawName = filenameValue || videoTitle || 'thumbnail'
    const safeTitle = rawName
      .replace(/[\\/:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 120)

    const ext = selectedThumbFormat
    const filename = `${safeTitle}.${ext}`
    const url = `${apiBase}/api/proxy-image?url=${encodeURIComponent(selectedThumb.url)}&filename=${encodeURIComponent(filename)}&format=${encodeURIComponent(ext)}`

    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <Box>
      <Box sx={{ mb: 1.5 }}>
        <CustomSelect
          value={selectedThumbValue}
          onChange={setSelectedThumbValue}
          options={thumbOptions}
          label={i18nT('downloader.thumbSize')}
          isDark={isDark}
          disabled={thumbOptions.length === 0}
        />
      </Box>

      <Box
        sx={{
          mb: 2,
          borderRadius: 2,
          overflow: 'hidden',
          border: `1px solid ${borderColor}`,
          bgcolor: isDark ? '#121212' : '#fafafa',
          position: 'relative',
        }}
      >
        {selectedThumb ? (
          <Box component="img" src={selectedThumb.url} alt={videoTitle || i18nT('downloader.thumbnailAltFallback')} sx={{ width: '100%', display: 'block' }} />
        ) : (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: textColor }}>
              {loadingThumbs ? i18nT('downloader.loadingThumbnails') : i18nT('downloader.noThumbnailAvailable')}
            </Typography>
          </Box>
        )}

        {selectedThumb && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 6,
              right: 6,
              bgcolor: 'rgba(0,0,0,0.7)',
              px: 0.8,
              py: 0.2,
              borderRadius: 1,
              color: '#fff',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            {selectedThumb.width}x{selectedThumb.height}
          </Box>
        )}
      </Box>

      <Box sx={{ mb: 2 }}>
        <CombinedFilenameInput
          value={filenameValue}
          onChange={setFilenameValue}
          extension={selectedThumbFormat}
          onExtensionChange={setSelectedThumbFormat}
          extensions={[
            { value: 'jpg', label: 'jpg' },
            { value: 'png', label: 'png' },
            { value: 'webp', label: 'webp' },
          ]}
          placeholder={i18nT('downloader.filename')}
          isDark={isDark}
          disabled={downloading || thumbOptions.length === 0}
        />
      </Box>

      <Button
        fullWidth
        startIcon={<Download size={20} />}
        onClick={handleDownloadThumb}
        disabled={!selectedThumb}
        sx={{
          bgcolor: brandColor,
          borderRadius: '999px',
          textTransform: 'none',
          padding: '14px 20px',
          fontWeight: 700,
          color: '#ffffff',
          fontSize: '1.125rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          border: `2px solid ${adjustColorBrightness(brandColor, -20)}`,
          opacity: selectedThumb ? 1 : 0.6,
          transition: 'all 0.2s ease',
          '&:hover': {
            bgcolor: adjustColorBrightness(brandColor, -10),
            boxShadow: '0 6px 16px rgba(0,0,0,0.25)',
          },
          '&:active': {
            bgcolor: adjustColorBrightness(brandColor, -15),
          },
        }}
      >
        {i18nT('downloader.downloadThumbnail')}
      </Button>
    </Box>
  )
}
