import React from 'react'
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Slider,
  Typography,
} from '@mui/material'
import { RotateCcw } from 'lucide-react'
import Cropper from 'react-cropper'
import 'cropperjs/dist/cropper.css'
import SimpleBarScrollArea from '../../SimpleBarScrollArea'
import {
  COVER_EDITOR_ASPECT_OPTIONS,
  resolveCoverAspectRatio,
  resolveCoverEditedFilename,
} from './coverImageEditorUtils'

const COVER_MAX_OUTPUT_SIDE = 2000

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalizeRotation(value) {
  let normalized = Math.round(Number(value) || 0)
  while (normalized > 180) normalized -= 360
  while (normalized < -180) normalized += 360
  return normalized
}

function stretchCropBoxToImage(cropper) {
  if (!cropper) return
  const imageData = cropper.getImageData()
  if (!imageData || !(imageData.width > 0) || !(imageData.height > 0)) return

  cropper.setCropBoxData({
    left: imageData.left,
    top: imageData.top,
    width: imageData.width,
    height: imageData.height,
  })
}

function readCropperFitRatio(cropper) {
  if (!cropper) return 1
  return clampNumber(Number(cropper.getImageData()?.ratio) || 1, 0.01, 8)
}

export default function CoverImageEditorModal({
  open,
  i18nT,
  isDark,
  sourceImageDataUrl,
  sourceName,
  loading = false,
  errorMessage = '',
  onClose,
  onSave,
}) {
  const cropperRef = React.useRef(null)
  const zoomBaseRef = React.useRef(1)
  const [zoomScale, setZoomScale] = React.useState(1)
  const [rotation, setRotation] = React.useState(0)
  const [aspectMode, setAspectMode] = React.useState('free')
  const [cropperReady, setCropperReady] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [localError, setLocalError] = React.useState('')
  const [sourceKey, setSourceKey] = React.useState(0)

  const getCropper = React.useCallback(() => {
    return cropperRef.current?.cropper || null
  }, [])

  React.useEffect(() => {
    if (!open) return

    setZoomScale(1)
    setRotation(0)
    setAspectMode('free')
    setCropperReady(false)
    setSaving(false)
    setLocalError('')
    setSourceKey((previous) => previous + 1)
  }, [open, sourceImageDataUrl])

  React.useEffect(() => {
    if (!open || !cropperReady) return
    const cropper = getCropper()
    if (!cropper) return
    cropper.setAspectRatio(resolveCoverAspectRatio(aspectMode))
  }, [aspectMode, cropperReady, getCropper, open])

  const controlsDisabled = loading || saving || !cropperReady || !sourceImageDataUrl
  const showBusyOverlay = (loading || !cropperReady) && !errorMessage && !localError
  const currentRotationDisplay = Math.round(rotation)
  const currentZoomDisplay = Math.round(zoomScale * 100)

  const handleCropperReady = React.useCallback(() => {
    const cropper = getCropper()
    if (!cropper) return

    cropper.setDragMode('move')
    cropper.reset()
    cropper.setAspectRatio(resolveCoverAspectRatio('free'))
    cropper.rotateTo(0)

    requestAnimationFrame(() => {
      zoomBaseRef.current = readCropperFitRatio(cropper)
      setZoomScale(1)
      stretchCropBoxToImage(cropper)
      setRotation(0)
      setCropperReady(true)
    })
  }, [getCropper])

  const handleZoomChange = React.useCallback((_, value) => {
    const nextZoomRaw = Array.isArray(value) ? value[0] : value
    const nextZoom = clampNumber(Number(nextZoomRaw) || 1, 1, 3)
    setZoomScale(nextZoom)

    const cropper = getCropper()
    if (!cropper) return
    cropper.zoomTo(zoomBaseRef.current * nextZoom)
  }, [getCropper])

  const handleRotationChange = React.useCallback((_, value) => {
    const rawRotation = Number(Array.isArray(value) ? value[0] : value)
    const nextRotation = normalizeRotation(Math.abs(rawRotation) <= 1 ? 0 : rawRotation)
    setRotation(nextRotation)

    const cropper = getCropper()
    if (!cropper) return
    cropper.rotateTo(nextRotation)
  }, [getCropper])

  const handleRotateByStep = React.useCallback((step) => {
    setRotation((previous) => {
      const next = normalizeRotation(previous + step)
      const cropper = getCropper()
      if (cropper) {
        cropper.rotateTo(next)
      }
      return next
    })
  }, [getCropper])

  const handleReset = React.useCallback(() => {
    const cropper = getCropper()
    if (cropper) {
      cropper.reset()
      cropper.setAspectRatio(resolveCoverAspectRatio('free'))
      cropper.rotateTo(0)
      requestAnimationFrame(() => {
        zoomBaseRef.current = readCropperFitRatio(cropper)
        setZoomScale(1)
        stretchCropBoxToImage(cropper)
      })
    } else {
      setZoomScale(1)
    }

    setAspectMode('free')
    setRotation(0)
    setLocalError('')
  }, [getCropper])

  const handleSetRotationZero = React.useCallback(() => {
    const cropper = getCropper()
    if (cropper) {
      cropper.rotateTo(0)
    }
    setRotation(0)
  }, [getCropper])

  const handleSave = React.useCallback(async () => {
    if (controlsDisabled) return

    const cropper = getCropper()
    if (!cropper) {
      setLocalError(i18nT('downloader.errorCoverEditorSave'))
      return
    }

    setSaving(true)
    setLocalError('')

    try {
      const canvas = cropper.getCroppedCanvas({
        maxWidth: COVER_MAX_OUTPUT_SIDE,
        maxHeight: COVER_MAX_OUTPUT_SIDE,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
      })

      if (!canvas) {
        throw new Error('Crop canvas unavailable')
      }

      const editedDataUrl = canvas.toDataURL('image/jpeg', 0.92)
      if (!editedDataUrl) {
        throw new Error('Edited image unavailable')
      }

      onSave?.({
        dataUrl: editedDataUrl,
        type: 'image/jpeg',
        name: resolveCoverEditedFilename(sourceName),
      })
    } catch {
      setLocalError(i18nT('downloader.errorCoverEditorSave'))
    } finally {
      setSaving(false)
    }
  }, [controlsDisabled, getCropper, i18nT, onSave, sourceName])

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="lg"
      PaperProps={{
        sx: {
          borderRadius: 3,
          bgcolor: isDark ? '#171717' : '#ffffff',
          border: `1px solid ${isDark ? '#2f2f2f' : '#d9d9d9'}`,
          color: isDark ? '#ffffff' : '#111111',
          overflow: 'hidden',
        },
      }}
    >
      <DialogTitle sx={{ pb: 1.1 }}>
        <Typography sx={{ fontSize: '1.12rem', fontWeight: 800 }}>
          {i18nT('downloader.coverEditorTitle')}
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ p: 0, '&:first-of-type': { pt: 0 } }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            minHeight: { xs: 'auto', md: 560 },
            maxHeight: '74vh',
          }}
        >
          <Box
            sx={{
              flex: 1.15,
              minWidth: 0,
              p: { xs: 1.5, md: 2 },
              bgcolor: isDark ? '#111111' : '#f4f4f4',
            }}
          >
            <Box
              sx={{
                width: '100%',
                maxWidth: { xs: '100%', md: 560 },
                mx: 'auto',
                aspectRatio: '1 / 1',
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 2.25,
                border: `1px solid ${isDark ? '#383838' : '#cfcfcf'}`,
                backgroundColor: isDark ? '#0b0b0b' : '#ececec',
              }}
            >
              {sourceImageDataUrl ? (
                <Cropper
                  key={sourceKey}
                  ref={cropperRef}
                  src={sourceImageDataUrl}
                  style={{ height: '100%', width: '100%' }}
                  guides
                  center
                  background={false}
                  autoCrop
                  autoCropArea={1}
                  responsive
                  dragMode="move"
                  viewMode={1}
                  cropBoxMovable
                  cropBoxResizable
                  toggleDragModeOnDblclick={false}
                  aspectRatio={resolveCoverAspectRatio(aspectMode)}
                  checkOrientation={false}
                  wheelZoomRatio={0.08}
                  minCropBoxWidth={40}
                  minCropBoxHeight={40}
                  ready={handleCropperReady}
                />
              ) : null}

              {showBusyOverlay && (
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'rgba(0,0,0,0.45)',
                    color: '#fff',
                    gap: 1,
                  }}
                >
                  <CircularProgress size={20} sx={{ color: '#fff' }} />
                  <Typography variant="body2">{i18nT('downloader.coverEditorLoading')}</Typography>
                </Box>
              )}
            </Box>
          </Box>

          <Divider
            orientation="vertical"
            flexItem
            sx={{
              display: { xs: 'none', md: 'block' },
              borderColor: isDark ? '#2f2f2f' : '#d9d9d9',
            }}
          />
          <Divider sx={{ display: { xs: 'block', md: 'none' }, borderColor: isDark ? '#2f2f2f' : '#d9d9d9' }} />

          <Box
            sx={{
              width: { xs: '100%', md: 340 },
              minWidth: { md: 340 },
              bgcolor: isDark ? '#151515' : '#fafafa',
              overflow: 'hidden',
            }}
          >
            <SimpleBarScrollArea
              fillContainer
              hideHorizontal
              autoHide={false}
              sx={{
                maxHeight: { xs: 300, md: 560 },
                p: 2,
                '& .simplebar-content': {
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  overflowX: 'hidden',
                  minWidth: 0,
                },
                '& .simplebar-content-wrapper': {
                  overflowX: 'hidden !important',
                },
              }}
            >
              <Box>
                <Typography variant="caption" sx={{ color: isDark ? '#c3c3c3' : '#555', fontWeight: 700 }}>
                  {i18nT('downloader.coverEditorAspect')}
                </Typography>
                <Box sx={{ mt: 0.8, display: 'grid', gap: 0.75, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                  {COVER_EDITOR_ASPECT_OPTIONS.map((option) => {
                    const selected = option.value === aspectMode
                    return (
                      <Button
                        key={option.value}
                        onClick={() => setAspectMode(option.value)}
                        disabled={controlsDisabled}
                        sx={{
                          minWidth: 0,
                          px: 1,
                          py: 0.7,
                          borderRadius: 1.5,
                          textTransform: 'none',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          color: selected ? (isDark ? '#fff' : '#111') : (isDark ? '#a9a9a9' : '#666'),
                          bgcolor: selected
                            ? (isDark ? 'rgba(255,255,255,0.14)' : '#f0f0f0')
                            : 'transparent',
                          border: `1px solid ${selected ? (isDark ? '#555' : '#c9c9c9') : (isDark ? '#3a3a3a' : '#d8d8d8')}`,
                          cursor: controlsDisabled ? 'default' : 'pointer',
                          transition: 'all 0.22s ease',
                          '&:hover': {
                            bgcolor: controlsDisabled
                              ? undefined
                              : (selected
                                ? (isDark ? 'rgba(255,255,255,0.18)' : '#ececec')
                                : (isDark ? 'rgba(255,255,255,0.07)' : '#f4f4f4')),
                          },
                        }}
                      >
                        {i18nT(option.labelKey)}
                      </Button>
                    )
                  })}
                </Box>
              </Box>

              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.35 }}>
                  <Typography variant="caption" sx={{ color: isDark ? '#c3c3c3' : '#555', fontWeight: 700 }}>
                    {i18nT('downloader.coverEditorZoom')}
                  </Typography>
                  <Typography variant="caption" sx={{ color: isDark ? '#d0d0d0' : '#444', fontWeight: 700 }}>
                    {currentZoomDisplay}%
                  </Typography>
                </Box>
                <Slider
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoomScale}
                  onChange={handleZoomChange}
                  disabled={controlsDisabled}
                  sx={{ px: 0.5 }}
                />
              </Box>

              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.35 }}>
                  <Typography variant="caption" sx={{ color: isDark ? '#c3c3c3' : '#555', fontWeight: 700 }}>
                    {i18nT('downloader.coverEditorRotation')}
                  </Typography>
                  <Typography variant="caption" sx={{ color: isDark ? '#d0d0d0' : '#444', fontWeight: 700 }}>
                    {`${currentRotationDisplay}°`}
                  </Typography>
                </Box>
                <Slider
                  min={-180}
                  max={180}
                  step={1}
                  value={rotation}
                  onChange={handleRotationChange}
                  onChangeCommitted={handleRotationChange}
                  disabled={controlsDisabled}
                  sx={{ px: 0.5 }}
                />

                <Box sx={{ mt: 0.75, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0.75 }}>
                  <Button
                    onClick={() => handleRotateByStep(-90)}
                    disabled={controlsDisabled}
                    sx={{
                      borderRadius: 1.5,
                      textTransform: 'none',
                      fontWeight: 700,
                      color: isDark ? '#dfdfdf' : '#333',
                      border: `1px solid ${isDark ? '#4a4a4a' : '#cfcfcf'}`,
                      cursor: controlsDisabled ? 'default' : 'pointer',
                    }}
                  >
                    -90°
                  </Button>
                  <Button
                    onClick={handleSetRotationZero}
                    disabled={controlsDisabled}
                    sx={{
                      borderRadius: 1.5,
                      textTransform: 'none',
                      fontWeight: 700,
                      color: isDark ? '#dfdfdf' : '#333',
                      border: `1px solid ${isDark ? '#4a4a4a' : '#cfcfcf'}`,
                      cursor: controlsDisabled ? 'default' : 'pointer',
                    }}
                  >
                    0°
                  </Button>
                  <Button
                    onClick={() => handleRotateByStep(90)}
                    disabled={controlsDisabled}
                    sx={{
                      borderRadius: 1.5,
                      textTransform: 'none',
                      fontWeight: 700,
                      color: isDark ? '#dfdfdf' : '#333',
                      border: `1px solid ${isDark ? '#4a4a4a' : '#cfcfcf'}`,
                      cursor: controlsDisabled ? 'default' : 'pointer',
                    }}
                  >
                    +90°
                  </Button>
                </Box>
              </Box>

              <Box sx={{ pt: 0.25 }}>
                <Button
                  onClick={handleReset}
                  disabled={controlsDisabled}
                  startIcon={<RotateCcw size={16} />}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 700,
                    borderRadius: 1.5,
                    px: 1.25,
                    color: isDark ? '#dfdfdf' : '#333',
                    border: `1px solid ${isDark ? '#4a4a4a' : '#cfcfcf'}`,
                    cursor: controlsDisabled ? 'default' : 'pointer',
                  }}
                >
                  {i18nT('downloader.coverEditorReset')}
                </Button>
              </Box>

              {(errorMessage || localError) && (
                <Typography color="error" variant="caption" sx={{ display: 'block' }}>
                  {errorMessage || localError}
                </Typography>
              )}
            </SimpleBarScrollArea>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.25, pt: 1.35, borderTop: `1px solid ${isDark ? '#2f2f2f' : '#d9d9d9'}` }}>
        <Button
          onClick={onClose}
          disabled={saving}
          sx={{ textTransform: 'none', fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}
        >
          {i18nT('downloader.coverEditorCancel')}
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={controlsDisabled}
          sx={{ textTransform: 'none', fontWeight: 700, cursor: controlsDisabled ? 'default' : 'pointer' }}
        >
          {saving ? i18nT('downloader.processing') : i18nT('downloader.coverEditorSave')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
