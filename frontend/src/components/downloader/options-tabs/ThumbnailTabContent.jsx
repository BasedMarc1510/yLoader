import React from 'react'
import { Box, Button, Skeleton, Typography } from '@mui/material'
import { Download } from 'lucide-react'
import CombinedFilenameInput from '../CombinedFilenameInput'
import CustomSelect from '../CustomSelect'
import { getApiBase } from '../../../utils/metadata'
import { adjustColorBrightness, getContrastTextColor } from './styleUtils'

export default function ThumbnailTabContent({
  variant = 'default',
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
  const isCompact = variant === 'compact'
  const textColor = isDark ? '#ffffff' : theme.palette.text.primary
  const borderColor = isDark ? '#3a3a3a' : '#dfe0e2'
  const downloadButtonTextColor = React.useMemo(
    () => getContrastTextColor(theme, brandColor),
    [brandColor, theme]
  )
  const apiBase = getApiBase()
  const selectedThumb = thumbOptions.find((option) => option.value === selectedThumbValue) || null
  const [renderedDimensions, setRenderedDimensions] = React.useState(null)

  React.useEffect(() => {
    setRenderedDimensions(null)
  }, [selectedThumb?.url])

  const selectedThumbWidth = Number(renderedDimensions?.width || selectedThumb?.width || 0)
  const selectedThumbHeight = Number(renderedDimensions?.height || selectedThumb?.height || 0)
  const hasSelectedThumbDimensions = Number.isFinite(selectedThumbWidth)
    && Number.isFinite(selectedThumbHeight)
    && selectedThumbWidth > 0
    && selectedThumbHeight > 0

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
    <Box sx={{ px: 0 }}>
      {/* Top Select */}
      <Box sx={{ mb: isCompact ? 1 : 1.5, px: 0 }}>
        {loadingThumbs ? (
          <Skeleton
            variant="rounded"
            animation="wave"
            width="100%"
            height={46}
            sx={{ borderRadius: isCompact ? 0 : 1.25, bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
          />
        ) : (
          <CustomSelect
            variant={variant}
            value={selectedThumbValue}
            onChange={setSelectedThumbValue}
            options={thumbOptions}
            label={i18nT('downloader.thumbSize')}
            isDark={isDark}
            disabled={thumbOptions.length === 0}
          />
        )}
      </Box>

      {/* Image */}
      <Box
        sx={{
          mb: isCompact ? 1 : 2,
          borderRadius: isCompact ? 0 : 2,
          overflow: 'hidden',
          border: isCompact ? 'none' : `1px solid ${borderColor}`,
          borderTop: isCompact ? `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'}` : `1px solid ${borderColor}`,
          borderBottom: isCompact ? `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'}` : `1px solid ${borderColor}`,
          bgcolor: isDark ? (isCompact ? 'rgba(0,0,0,0.2)' : '#121212') : (isCompact ? 'rgba(0,0,0,0.02)' : '#fafafa'),
          position: 'relative',
        }}
      >
        {loadingThumbs ? (
          <Box sx={{ p: 1.5 }}>
            <Skeleton
              variant="rounded"
              animation="wave"
              width="100%"
              height={isCompact ? 140 : 220}
              sx={{ borderRadius: 1.5, bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
            />
          </Box>
        ) : selectedThumb ? (
          <Box
            component="img"
            src={selectedThumb.url}
            alt={videoTitle || i18nT('downloader.thumbnailAltFallback')}
            onLoad={(event) => {
              const width = Math.round(Number(event.currentTarget?.naturalWidth || 0))
              const height = Math.round(Number(event.currentTarget?.naturalHeight || 0))
              if (!(width > 0 && height > 0)) {
                setRenderedDimensions(null)
                return
              }

              setRenderedDimensions({ width, height })
            }}
            onError={() => {
              setRenderedDimensions(null)
            }}
            sx={{ width: '100%', display: 'block', maxHeight: isCompact ? 240 : 'none', objectFit: 'contain' }}
          />
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
              bottom: 8,
              right: 8,
              bgcolor: 'rgba(0,0,0,0.7)',
              px: 0.8,
              py: 0.2,
              borderRadius: 1,
              color: '#fff',
              fontSize: '11px',
              fontWeight: 700,
            }}
          >
            {hasSelectedThumbDimensions
              ? `${selectedThumbWidth}x${selectedThumbHeight}`
              : i18nT('downloader.thumbnailSizeUnknown')}
          </Box>
        )}
      </Box>

      {/* Filename Input */}
      <Box sx={{ mb: 0, px: 0 }}>
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
          disabled={downloading || loadingThumbs || thumbOptions.length === 0}
          sx={isCompact ? {
            '& .MuiOutlinedInput-root': {
              borderRadius: 0,
              border: 'none',
              '& fieldset': { border: 'none' },
              bgcolor: 'transparent'
            }
          } : {}}
        />
      </Box>

      {!isCompact && (
        <Button
          fullWidth
          startIcon={<Download size={20} />}
          onClick={handleDownloadThumb}
          disabled={!selectedThumb || loadingThumbs}
          sx={{
            mt: 2,
            bgcolor: brandColor,
            borderRadius: '999px',
            textTransform: 'none',
            padding: '14px 20px',
            fontWeight: 700,
            color: downloadButtonTextColor,
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
      )}
    </Box>
  )
}
