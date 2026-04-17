import React from 'react'
import { Box, Collapse, Typography } from '@mui/material'
import { Download, Image as ImageIcon, X } from 'lucide-react'

export default function AudioCoverSection({
  i18nT,
  isDark,
  textColor,
  brandColor,
  downloading,
  coverEmbedEnabled,
  setCoverEmbedEnabled,
  coverSource,
  setCoverSource,
  coverUpload,
  setCoverUpload,
  coverUploadError,
  setCoverUploadError,
  handleCoverFileChange,
}) {
  return (
    <>
      <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700, color: textColor }}>
            {i18nT('downloader.embedCoverArt')}
          </Typography>
          <Typography variant="caption" sx={{ color: isDark ? '#888' : '#666', lineHeight: 1 }}>
            {i18nT('downloader.includeArtwork')}
          </Typography>
        </Box>
        <Box
          onClick={() => setCoverEmbedEnabled(!coverEmbedEnabled)}
          sx={{
            width: 40,
            height: 22,
            borderRadius: 12,
            bgcolor: coverEmbedEnabled ? brandColor : (isDark ? '#444' : '#ccc'),
            position: 'relative',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
          }}
        >
          <Box
            sx={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              bgcolor: '#fff',
              position: 'absolute',
              top: 2,
              left: coverEmbedEnabled ? 20 : 2,
              transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }}
          />
        </Box>
      </Box>

      <Collapse in={coverEmbedEnabled}>
        <Box sx={{ mb: 1.5, display: 'flex', gap: 1.5 }}>
          <Box
            onClick={() => !downloading && setCoverSource('video')}
            sx={{
              flex: 1,
              p: 1.5,
              borderRadius: 2,
              bgcolor: coverSource === 'video' ? (isDark ? 'rgba(255,255,255,0.05)' : '#f4f5f7') : 'transparent',
              border: `2px solid ${coverSource === 'video' ? brandColor : (isDark ? '#333' : '#dfe0e2')}`,
              cursor: downloading ? 'default' : 'pointer',
              opacity: downloading ? 0.6 : 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: coverSource === 'video' ? undefined : (isDark ? '#222' : '#f9fafc'),
                borderColor: coverSource === 'video' ? undefined : (isDark ? '#555' : '#c0c2c6'),
              },
            }}
          >
            <ImageIcon size={28} strokeWidth={1.5} color={coverSource === 'video' ? brandColor : (isDark ? '#666' : '#999')} />
            <Typography variant="body2" sx={{ fontWeight: 700, color: textColor, fontSize: '0.85rem' }}>
              {i18nT('downloader.coverFromVideo')}
            </Typography>
          </Box>

          <Box
            onClick={() => !downloading && setCoverSource('upload')}
            sx={{
              flex: 1,
              p: 1.5,
              borderRadius: 2,
              bgcolor: coverSource === 'upload' ? (isDark ? 'rgba(255,255,255,0.05)' : '#f4f5f7') : 'transparent',
              border: `2px solid ${coverSource === 'upload' ? brandColor : (isDark ? '#333' : '#dfe0e2')}`,
              cursor: downloading ? 'default' : 'pointer',
              opacity: downloading ? 0.6 : 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: coverSource === 'upload' ? undefined : (isDark ? '#222' : '#f9fafc'),
                borderColor: coverSource === 'upload' ? undefined : (isDark ? '#555' : '#c0c2c6'),
              },
            }}
          >
            <Download size={28} strokeWidth={1.5} color={coverSource === 'upload' ? brandColor : (isDark ? '#666' : '#999')} />
            <Typography variant="body2" sx={{ fontWeight: 700, color: textColor, fontSize: '0.85rem' }}>
              {i18nT('downloader.coverUploadCustom')}
            </Typography>
          </Box>
        </Box>

        {coverSource === 'upload' && (
          <Box sx={{ mt: 2, mb: 1 }}>
            <Box
              component="label"
              sx={{
                width: '100%',
                minHeight: 140,
                borderRadius: 2,
                border: `1px dashed ${isDark ? '#444' : '#d0d1d4'}`,
                bgcolor: isDark ? '#1a1a1a' : '#fafbfc',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: downloading ? 'default' : 'pointer',
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 0.2s',
                '&:hover': {
                  bgcolor: isDark ? '#222' : '#f4f5f7',
                  borderColor: isDark ? '#666' : '#b0b2b6',
                },
              }}
            >
              <input
                hidden
                type="file"
                accept="image/*"
                onChange={handleCoverFileChange}
                disabled={downloading}
                onClick={(e) => {
                  if (coverUpload?.dataUrl) e.preventDefault()
                }}
              />

              {coverUpload?.dataUrl ? (
                <>
                  <Box
                    component="img"
                    src={coverUpload.dataUrl}
                    alt={i18nT('downloader.coverPreviewAlt')}
                    sx={{
                      width: '100%',
                      height: '100%',
                      maxHeight: 200,
                      objectFit: 'contain',
                      display: 'block',
                      p: 1,
                    }}
                  />
                  <Box
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setCoverUpload(null)
                      setCoverUploadError('')
                    }}
                    sx={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      bgcolor: 'rgba(0,0,0,0.6)',
                      borderRadius: '50%',
                      p: 0.5,
                      color: '#fff',
                      display: 'flex',
                      cursor: 'pointer',
                      zIndex: 10,
                      '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' },
                    }}
                  >
                    <X size={16} />
                  </Box>
                  <Box
                    sx={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      bgcolor: 'rgba(0,0,0,0.6)',
                      p: 0.5,
                      textAlign: 'center',
                    }}
                  >
                    <Typography variant="caption" sx={{ color: '#fff' }}>
                      {coverUpload.name}
                    </Typography>
                  </Box>
                </>
              ) : (
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Download size={24} color={isDark ? '#666' : '#999'} style={{ marginBottom: 8 }} />
                  <Typography variant="body2" sx={{ fontWeight: 600, color: textColor }}>
                    {i18nT('downloader.clickUpload')}
                  </Typography>
                  <Typography variant="caption" sx={{ color: isDark ? '#888' : '#777' }}>
                    {i18nT('downloader.dragDrop')}
                  </Typography>
                </Box>
              )}
            </Box>
            {coverUploadError && (
              <Typography color="error" variant="caption" sx={{ mt: 0.5, display: 'block' }}>
                {coverUploadError}
              </Typography>
            )}
          </Box>
        )}
      </Collapse>
    </>
  )
}
