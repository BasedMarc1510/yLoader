import React from 'react'
import { Box, Button, CircularProgress, Collapse, Typography } from '@mui/material'
import { Download, Image as ImageIcon, PencilLine, X } from 'lucide-react'
import { getApiBase } from '../../../utils/metadata'
import CoverImageEditorModal from './CoverImageEditorModal'

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('Failed to read image blob'))
    reader.readAsDataURL(blob)
  })
}

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
}) {
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [editorLoading, setEditorLoading] = React.useState(false)
  const [editorError, setEditorError] = React.useState('')
  const [editorSourceType, setEditorSourceType] = React.useState('')
  const [editorSourceDataUrl, setEditorSourceDataUrl] = React.useState('')
  const [editorSourceName, setEditorSourceName] = React.useState('')

  const videoPreviewUrl = String(coverVideoEdit?.dataUrl || videoThumbnailUrl || '').trim()
  const uploadPreviewUrl = String(coverUpload?.dataUrl || '').trim()
  const uploadOriginalDataUrl = String(coverUpload?.originalDataUrl || coverUpload?.dataUrl || '').trim()
  const videoOptionUnavailable = videoThumbnailChecked && !videoThumbnailChecking && !hasVideoThumbnail
  const videoCardDisabled = downloading || videoOptionUnavailable
  const sourceSwitchIndicatorLeft = coverSource === 'upload' ? 'calc(50% + 2px)' : '2px'

  const handleToggleEmbed = React.useCallback(() => {
    if (downloading) return
    setCoverEmbedEnabled(!coverEmbedEnabled)
  }, [coverEmbedEnabled, downloading, setCoverEmbedEnabled])

  const handleSelectSource = React.useCallback((nextSource) => {
    if (downloading) return
    if (nextSource === 'video' && videoOptionUnavailable) return
    setCoverSource(nextSource)
    setEditorError('')
  }, [downloading, setCoverSource, videoOptionUnavailable])

  const handleClearUpload = React.useCallback((event) => {
    event.preventDefault()
    event.stopPropagation()
    setCoverUpload(null)
    setCoverUploadError('')
    setEditorError('')
  }, [setCoverUpload, setCoverUploadError])

  const openUploadEditor = React.useCallback(() => {
    if (downloading || !uploadOriginalDataUrl) return
    setEditorError('')
    setEditorSourceType('upload')
    setEditorSourceDataUrl(uploadOriginalDataUrl)
    setEditorSourceName(coverUpload?.name || 'cover.jpg')
    setEditorOpen(true)
  }, [coverUpload?.name, downloading, uploadOriginalDataUrl])

  const openVideoEditor = React.useCallback(async () => {
    if (downloading || !hasVideoThumbnail || !videoThumbnailUrl || videoThumbnailChecking) return

    setEditorLoading(true)
    setEditorError('')

    try {
      const apiBase = getApiBase()
      const endpoint = `${apiBase}/api/proxy-image?url=${encodeURIComponent(videoThumbnailUrl)}`
      const response = await fetch(endpoint)
      if (!response.ok) {
        throw new Error(i18nT('downloader.errorCoverEditorOpen'))
      }

      const blob = await response.blob()
      if (!blob || blob.size <= 0) {
        throw new Error(i18nT('downloader.errorCoverEditorOpen'))
      }

      const dataUrl = await blobToDataUrl(blob)
      if (!dataUrl) {
        throw new Error(i18nT('downloader.errorCoverEditorOpen'))
      }

      setEditorSourceType('video')
      setEditorSourceDataUrl(dataUrl)
      setEditorSourceName('video-thumbnail.jpg')
      setEditorOpen(true)
    } catch {
      setEditorError(i18nT('downloader.errorCoverEditorOpen'))
    } finally {
      setEditorLoading(false)
    }
  }, [downloading, hasVideoThumbnail, i18nT, videoThumbnailChecking, videoThumbnailUrl])

  const closeEditor = React.useCallback(() => {
    if (editorLoading) return
    setEditorOpen(false)
    setEditorSourceType('')
    setEditorSourceDataUrl('')
    setEditorSourceName('')
  }, [editorLoading])

  const handleSaveEditedCover = React.useCallback((editedImage) => {
    if (!editedImage?.dataUrl) return

    if (editorSourceType === 'video') {
      setCoverVideoEdit({
        dataUrl: editedImage.dataUrl,
        type: editedImage.type || 'image/jpeg',
        name: editedImage.name || 'video-thumbnail-cover.jpg',
      })
    }

    if (editorSourceType === 'upload') {
      setCoverUpload((previous) => {
        if (!previous) return previous
        return {
          ...previous,
          dataUrl: editedImage.dataUrl,
          type: editedImage.type || previous.type || 'image/jpeg',
          name: editedImage.name || previous.name || 'cover.jpg',
          originalDataUrl: previous.originalDataUrl || previous.dataUrl || editedImage.dataUrl,
        }
      })
      setCoverUploadError('')
    }

    setEditorOpen(false)
  }, [editorSourceType, setCoverUpload, setCoverUploadError, setCoverVideoEdit])

  const renderSourcePreview = () => {
    if (coverSource === 'video') {
      return (
        <Box sx={{ mt: 1.5 }}>
          <Box
            sx={{
              width: '100%',
              minHeight: 170,
              borderRadius: 2,
              border: `1px solid ${isDark ? '#3a3a3a' : '#d7d8dc'}`,
              bgcolor: isDark ? '#141414' : '#f7f8fa',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {videoPreviewUrl ? (
              <Box
                component="img"
                src={videoPreviewUrl}
                alt={i18nT('downloader.coverPreviewAlt')}
                sx={{
                  width: '100%',
                  maxHeight: 230,
                  display: 'block',
                  objectFit: 'contain',
                  p: 1,
                }}
              />
            ) : (
              <Box sx={{ py: 4, px: 2, textAlign: 'center', display: 'grid', justifyItems: 'center', gap: 0.75 }}>
                {videoThumbnailChecking && (
                  <CircularProgress size={18} />
                )}
                <Typography variant="body2" sx={{ color: isDark ? '#9fa2a8' : '#5f6470', fontWeight: 600 }}>
                  {videoThumbnailChecking
                    ? i18nT('downloader.loadingThumbnails')
                    : i18nT('downloader.noThumbnailAvailable')}
                </Typography>
              </Box>
            )}
          </Box>

          {videoPreviewUrl && (
            <Button
              onClick={openVideoEditor}
              disabled={downloading || editorLoading || videoThumbnailChecking || !hasVideoThumbnail}
              startIcon={editorLoading ? <CircularProgress size={14} /> : <PencilLine size={16} />}
              sx={{
                mt: 1,
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: 999,
                cursor: downloading ? 'default' : 'pointer',
              }}
            >
              {i18nT('downloader.editCover')}
            </Button>
          )}
        </Box>
      )
    }

    return (
      <Box sx={{ mt: 1.5 }}>
        <Box
          component="label"
          sx={{
            width: '100%',
            minHeight: 150,
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
            onClick={(event) => {
              if (coverUpload?.dataUrl) event.preventDefault()
            }}
          />

          {uploadPreviewUrl ? (
            <>
              <Box
                component="img"
                src={uploadPreviewUrl}
                alt={i18nT('downloader.coverPreviewAlt')}
                sx={{
                  width: '100%',
                  height: '100%',
                  maxHeight: 230,
                  objectFit: 'contain',
                  display: 'block',
                  p: 1,
                }}
              />
              <Box
                onClick={handleClearUpload}
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
                  bgcolor: 'rgba(0,0,0,0.58)',
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

        {uploadPreviewUrl && (
          <Button
            onClick={openUploadEditor}
            disabled={downloading}
            startIcon={<PencilLine size={16} />}
            sx={{
              mt: 1,
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: 999,
              cursor: downloading ? 'default' : 'pointer',
            }}
          >
            {i18nT('downloader.editCover')}
          </Button>
        )}
      </Box>
    )
  }

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
          onClick={handleToggleEmbed}
          sx={{
            width: 40,
            height: 22,
            borderRadius: 12,
            bgcolor: coverEmbedEnabled ? brandColor : (isDark ? '#444' : '#ccc'),
            position: 'relative',
            cursor: downloading ? 'default' : 'pointer',
            opacity: downloading ? 0.7 : 1,
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
        <Box
          sx={{
            mb: 1.5,
            p: 0.35,
            borderRadius: 999,
            position: 'relative',
            overflow: 'hidden',
            background: isDark ? '#1a1a1a' : '#f2f2f2',
            border: `1px solid ${isDark ? '#343434' : '#d7d7d7'}`,
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              top: 2,
              left: sourceSwitchIndicatorLeft,
              width: 'calc(50% - 4px)',
              height: 'calc(100% - 4px)',
              borderRadius: 999,
              bgcolor: isDark ? '#2a2a2a' : '#ffffff',
              transition: 'left 280ms cubic-bezier(0.22, 1, 0.36, 1)',
              pointerEvents: 'none',
            }}
          />

          <Box
            sx={{
              position: 'relative',
              zIndex: 1,
              display: 'grid',
              gap: 0.35,
              gridTemplateColumns: '1fr 1fr',
            }}
          >
            <Box
              onClick={() => handleSelectSource('video')}
              sx={{
                p: 1.1,
                borderRadius: 999,
                bgcolor: 'transparent',
                border: '1px solid transparent',
                cursor: videoCardDisabled ? 'default' : 'pointer',
                opacity: videoCardDisabled ? 0.45 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.75,
                transition: 'color 0.24s ease',
                color: coverSource === 'video' ? textColor : (isDark ? '#a0a0a0' : '#666'),
                '&:hover': {
                  '& .cover-source-label': {
                    color: videoCardDisabled ? undefined : textColor,
                  },
                },
              }}
            >
              <ImageIcon
                size={18}
                strokeWidth={1.75}
                color={coverSource === 'video' ? brandColor : (isDark ? '#8a8a8a' : '#777')}
              />
              <Typography
                className="cover-source-label"
                variant="body2"
                sx={{
                  fontWeight: 700,
                  color: coverSource === 'video' ? textColor : (isDark ? '#a0a0a0' : '#666'),
                  fontSize: '0.82rem',
                  transition: 'color 0.24s ease',
                }}
              >
                {i18nT('downloader.coverFromVideo')}
              </Typography>
            </Box>

            <Box
              onClick={() => handleSelectSource('upload')}
              sx={{
                p: 1.1,
                borderRadius: 999,
                bgcolor: 'transparent',
                border: '1px solid transparent',
                cursor: downloading ? 'default' : 'pointer',
                opacity: downloading ? 0.55 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.75,
                transition: 'color 0.24s ease',
                color: coverSource === 'upload' ? textColor : (isDark ? '#a0a0a0' : '#666'),
                '&:hover': {
                  '& .cover-source-label': {
                    color: downloading ? undefined : textColor,
                  },
                },
              }}
            >
              <Download
                size={18}
                strokeWidth={1.75}
                color={coverSource === 'upload' ? brandColor : (isDark ? '#8a8a8a' : '#777')}
              />
              <Typography
                className="cover-source-label"
                variant="body2"
                sx={{
                  fontWeight: 700,
                  color: coverSource === 'upload' ? textColor : (isDark ? '#a0a0a0' : '#666'),
                  fontSize: '0.82rem',
                  transition: 'color 0.24s ease',
                }}
              >
                {i18nT('downloader.coverUploadCustom')}
              </Typography>
            </Box>
          </Box>
        </Box>

        {videoOptionUnavailable && (
          <Typography variant="caption" sx={{ color: isDark ? '#8f939b' : '#68707f', display: 'block', mt: -0.75, mb: 1.25 }}>
            {i18nT('downloader.videoThumbUnavailableHint')}
          </Typography>
        )}

        {renderSourcePreview()}

        {(coverUploadError || editorError) && (
          <Typography color="error" variant="caption" sx={{ mt: 0.5, display: 'block' }}>
            {coverUploadError || editorError}
          </Typography>
        )}
      </Collapse>

      <CoverImageEditorModal
        open={editorOpen}
        i18nT={i18nT}
        isDark={isDark}
        sourceImageDataUrl={editorSourceDataUrl}
        sourceName={editorSourceName}
        loading={editorLoading}
        errorMessage={editorError}
        onClose={closeEditor}
        onSave={handleSaveEditedCover}
      />
    </>
  )
}
