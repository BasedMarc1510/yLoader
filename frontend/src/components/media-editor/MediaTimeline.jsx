import React from 'react'
import { Alert, Box, Button, IconButton, Skeleton, Stack, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material'
import { Film, AudioLines, Minus, Plus, RotateCcw } from 'lucide-react'
import { useI18n } from '../../providers/I18nProvider'
import { clampTrim, formatEditorTime } from './timelineUtils'

export default function MediaTimeline({ media, visuals, loading, error, onRetry, range, onRangeChange,
  currentTime, onSeek, disabled, mute, audioOnly, fades }) {
  const { t } = useI18n()
  const theme = useTheme()
  const compact = useMediaQuery(theme.breakpoints.down('sm'))
  const [zoom, setZoom] = React.useState(1)
  const track = React.useRef(null)
  const drag = React.useRef(null)
  const percent = seconds => `${Math.max(0, Math.min(100, seconds / media.duration * 100))}%`
  const start = Math.max(0, Math.min(media.duration, range[0]))
  const end = Math.max(start, Math.min(media.duration, range[1]))
  const hasPeaks = Boolean(visuals?.peaks?.length)
  const maxPeak = Math.max(0.01, ...(visuals?.peaks || []))
  const tickCount = (compact ? 2 : 4) * zoom
  const timeAtPointer = event => {
    const rect = track.current.getBoundingClientRect()
    return Math.max(0, Math.min(media.duration, (event.clientX - rect.left) / rect.width * media.duration))
  }
  const move = (event, index) => {
    if (disabled) return
    const rect = track.current.getBoundingClientRect()
    const time = drag.current
      ? drag.current.time + (event.clientX - drag.current.x) / rect.width * media.duration
      : timeAtPointer(event)
    if (index === 'playhead') onSeek(time)
    else {
      const value = clampTrim(time, index, range, media.duration)
      onRangeChange(range.map((old, i) => i === index ? value : old))
      onSeek(value)
    }
  }
  const keyboard = (event, index) => {
    if (disabled) return
    const old = index === 'playhead' ? currentTime : range[index]
    const delta = event.shiftKey ? 1 : event.altKey ? 0.01 : 0.1
    const next = { ArrowLeft: old - delta, ArrowRight: old + delta, Home: 0, End: media.duration }[event.key]
    if (next === undefined) return
    event.preventDefault()
    if (index === 'playhead') onSeek(Math.max(0, Math.min(media.duration, next)))
    else {
      const value = clampTrim(next, index, range, media.duration)
      onRangeChange(range.map((v, i) => i === index ? value : v))
      onSeek(value)
    }
  }
  const pointerEvents = index => ({
    onPointerDown: event => {
      event.stopPropagation()
      drag.current = { x: event.clientX, time: index === 'playhead' ? currentTime : range[index] }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    onPointerMove: event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event, index) },
    onPointerUp: event => {
      drag.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    },
    onPointerCancel: () => { drag.current = null },
    onClick: event => event.stopPropagation(),
    onKeyDown: event => keyboard(event, index),
  })

  return <Box sx={{ minWidth: 0 }}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
      <Box>
        <Typography fontWeight={700}>{t('editor.timeline')}</Typography>
        <Typography variant="caption" color="text.secondary">{t('editor.selectedDuration', { value: formatEditorTime(end - start) })}</Typography>
      </Box>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Tooltip title={t('editor.resetTrim')}><span><IconButton disabled={disabled} onClick={() => { onRangeChange([0, media.duration]); onSeek(0) }} aria-label={t('editor.resetTrim')}><RotateCcw size={16} /></IconButton></span></Tooltip>
        <IconButton aria-label={t('editor.zoomOut')} disabled={zoom === 1} onClick={() => setZoom(value => Math.max(1, value / 2))}><Minus size={16} /></IconButton>
        <Typography variant="caption" sx={{ minWidth: 26, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{zoom}×</Typography>
        <IconButton aria-label={t('editor.zoomIn')} disabled={zoom === 16} onClick={() => setZoom(value => value * 2)}><Plus size={16} /></IconButton>
      </Stack>
    </Stack>
    <Box sx={{ overflowX: 'auto', border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'action.hover', pb: 1 }}>
      <Box ref={track} onClick={event => { if (!disabled) onSeek(timeAtPointer(event)) }}
        sx={{ position: 'relative', width: `${zoom * 100}%`, minWidth: '100%', px: 0, cursor: disabled ? 'default' : 'crosshair' }}>
        <Box aria-hidden="true" sx={{ height: 28, position: 'relative', borderBottom: 1, borderColor: 'divider', mb: 1 }}>
          {Array.from({ length: tickCount + 1 }, (_, index) => <Typography key={index} variant="caption"
            sx={{ position: 'absolute', left: `${index / tickCount * 100}%`, top: 6, transform: index === tickCount ? 'translateX(-100%)' : index === 0 ? 'none' : 'translateX(-50%)',
              fontFamily: 'monospace', color: 'text.secondary', px: 0.5 }}>
            {formatEditorTime(media.duration * index / tickCount)}
          </Typography>)}
        </Box>
        <Stack spacing={0.5} sx={{ minHeight: 72 }}>
          {media.hasVideo && <Box sx={{ height: 48, display: 'flex', overflow: 'hidden', opacity: audioOnly ? 0.35 : 1 }}>
            {visuals?.frames?.length ? visuals.frames.map((frame, index) => <Box key={index} aria-hidden="true"
              sx={{ flex: 1, height: '100%', backgroundImage: `url("${frame.image}")`, backgroundSize: zoom === 1 ? 'cover' : 'auto 100%', backgroundPosition: 'center', backgroundRepeat: zoom === 1 ? 'no-repeat' : 'repeat-x', borderRight: 1, borderColor: 'divider' }} />)
              : loading ? <Skeleton variant="rectangular" height={48} width="100%" />
                : <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ width: '100%' }}><Film size={18} /><Typography variant="caption">{t('editor.videoTrack')}</Typography></Stack>}
          </Box>}
          {media.hasAudio && <Box sx={{ height: media.hasVideo ? 40 : 92, position: 'relative', color: mute ? 'text.disabled' : 'primary.main', bgcolor: 'background.paper' }}>
            {hasPeaks ? <Box component="svg" viewBox="0 0 960 100" preserveAspectRatio="none" aria-hidden="true" sx={{ width: '100%', height: '100%', display: 'block', opacity: mute ? 0.35 : 0.85 }}>
              <path d="M0 50H960" stroke="currentColor" strokeWidth="0.7" />
              {visuals.peaks.map((peak, index) => {
                const height = peak / maxPeak * 86
                return <rect key={index} x={index * 960 / visuals.peaks.length} y={50 - height / 2} width={Math.max(0.7, 960 / visuals.peaks.length - 0.5)} height={Math.max(0.6, height)} rx="0.4" fill="currentColor" />
              })}
            </Box> : loading ? <Skeleton variant="rectangular" height="100%" width="100%" />
              : <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ height: '100%' }}><AudioLines size={18} /><Typography variant="caption">{t('editor.audioTrack')}</Typography></Stack>}
            {!mute && hasPeaks && <Box component="svg" viewBox={`0 0 ${media.duration} 100`} preserveAspectRatio="none" aria-hidden="true"
              sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', color: 'background.paper', pointerEvents: 'none' }}>
              {fades[0] > 0 && <polygon points={`${start},0 ${start + fades[0]},0 ${start},100`} fill="currentColor" opacity="0.75" />}
              {fades[1] > 0 && <polygon points={`${end - fades[1]},0 ${end},0 ${end},100`} fill="currentColor" opacity="0.75" />}
            </Box>}
          </Box>}
        </Stack>
        <Box aria-hidden="true" sx={{ position: 'absolute', left: 0, top: 36, bottom: 0, width: percent(start), bgcolor: 'background.default', opacity: 0.75, pointerEvents: 'none' }} />
        <Box aria-hidden="true" sx={{ position: 'absolute', right: 0, top: 36, bottom: 0, width: percent(media.duration - end), bgcolor: 'background.default', opacity: 0.75, pointerEvents: 'none' }} />
        <Box aria-hidden="true" sx={{ position: 'absolute', left: percent(start), width: percent(end - start), top: 36, bottom: 0, border: 2, borderColor: 'primary.main', borderRadius: 0.5, pointerEvents: 'none' }} />
        {[0, 1].map(index => <Box key={index} component="button" type="button" role="slider" disabled={disabled}
          aria-label={t(index ? 'editor.end' : 'editor.start')} aria-valuemin={index ? start + 0.05 : 0}
          aria-valuemax={index ? media.duration : end - 0.05} aria-valuenow={index ? end : start} aria-valuetext={formatEditorTime(index ? end : start)}
          {...pointerEvents(index)} sx={{ position: 'absolute', zIndex: 2, top: 36, bottom: -4, left: percent(index ? end : start),
            transform: index ? 'translateX(-100%)' : 'none', width: 44, border: 0, p: 0, bgcolor: 'transparent', cursor: 'ew-resize', touchAction: 'none',
            '&:focus-visible': { outline: '2px solid', outlineColor: 'text.primary', outlineOffset: 2 }, '&:disabled': { cursor: 'default', opacity: 0.5 } }}>
          <Box sx={{ position: 'absolute', [index ? 'right' : 'left']: 0, top: 0, bottom: 0, width: 10, borderRadius: 0.5, bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box sx={{ width: 2, height: 20, bgcolor: 'primary.contrastText', borderRadius: 1 }} />
          </Box>
        </Box>)}
        <Box component="button" type="button" role="slider" disabled={disabled} aria-label={t('editor.playhead')}
          aria-valuemin={0} aria-valuemax={media.duration} aria-valuenow={currentTime} aria-valuetext={formatEditorTime(currentTime)}
          {...pointerEvents('playhead')} sx={{ position: 'absolute', zIndex: 3, left: percent(currentTime), top: 24, bottom: -4,
            width: 24, transform: 'translateX(-50%)', border: 0, bgcolor: 'transparent', cursor: 'ew-resize', touchAction: 'none', p: 0,
            '&:focus-visible': { outline: '2px solid', outlineColor: 'text.primary' } }}>
          <Box sx={{ position: 'absolute', left: 11, top: 4, bottom: 0, width: 2, bgcolor: 'text.primary', boxShadow: '0 0 2px rgba(0,0,0,0.5)' }} />
          <Box sx={{ width: 10, height: 10, position: 'absolute', top: 0, left: 7, bgcolor: 'text.primary', borderRadius: '2px 2px 50% 50%' }} />
        </Box>
      </Box>
    </Box>
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{t('editor.timelineHint')}</Typography>
    {loading && <Typography role="status" variant="caption" color="text.secondary">{t('editor.visualsLoading')}</Typography>}
    {(error || visuals?.incomplete) && <Alert severity="info" sx={{ mt: 1 }} action={<Button color="inherit" onClick={onRetry} disabled={loading}>{t('editor.retryVisuals')}</Button>}>{t('editor.visualsUnavailable')}</Alert>}
  </Box>
}
