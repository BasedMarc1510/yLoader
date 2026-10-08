import React from 'react'
import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import { AudioLines, Play, Pause, SkipBack, SkipForward } from 'lucide-react'
import { useI18n } from '../../providers/I18nProvider'
import { formatEditorTime } from './timelineUtils'

export default function EditorPreview({ editor }) {
  const { t } = useI18n()
  const { media, player, base, currentTime, playing, disabled, previewError, invalid, range } = editor
  return <Box sx={{ minWidth: 0 }}>
    <Box sx={{ position: 'relative', borderRadius: 1.5, overflow: 'hidden', bgcolor: 'common.black',
      width: '100%', aspectRatio: { xs: '16 / 9', md: 'auto' }, height: { xs: 'auto', md: 'clamp(160px, 27vh, 280px)' }, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {!media.hasVideo && <Stack alignItems="center" spacing={1} sx={{ color: 'common.white' }}>
        <AudioLines size={42} strokeWidth={1.3} />
        <Typography variant="body2">{t('editor.audioTrack')}</Typography>
      </Stack>}
      <Box component={media.hasVideo ? 'video' : 'audio'} ref={player} preload="metadata" playsInline
        src={`${base}/preview`} aria-label={t('editor.preview')} onError={() => editor.setPreviewError(true)}
        onPlay={() => {
          editor.setPlaying(true)
          if (player.current.currentTime < range[0] || player.current.currentTime >= range[1]) editor.seek(range[0])
        }} onPause={() => editor.setPlaying(false)} onEnded={() => editor.setPlaying(false)}
        onTimeUpdate={() => {
          if (!player.current) return
          editor.setCurrentTime(player.current.currentTime)
          if (player.current.currentTime >= range[1]) player.current.pause()
        }} sx={{ width: '100%', height: '100%', objectFit: 'contain', display: media.hasVideo ? 'block' : 'none' }} />
      {!playing && !previewError && <IconButton onClick={editor.togglePlayback} disabled={disabled || invalid}
        aria-label={t('editor.playSelection')} sx={{ position: 'absolute', width: 60, height: 60, color: 'common.white',
          bgcolor: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.25)', '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' } }}>
        <Play size={26} fill="currentColor" />
      </IconButton>}
    </Box>
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1 }}>
      <Stack direction="row" spacing={0.5}>
        <Tooltip title={t('editor.jumpStart')}><span><IconButton aria-label={t('editor.jumpStart')} disabled={disabled} onClick={() => editor.seek(range[0])}><SkipBack size={18} /></IconButton></span></Tooltip>
        <IconButton aria-label={t(playing ? 'editor.pause' : 'editor.playSelection')} disabled={disabled || previewError || invalid} onClick={editor.togglePlayback}>
          {playing ? <Pause size={20} /> : <Play size={20} />}
        </IconButton>
        <Tooltip title={t('editor.jumpEnd')}><span><IconButton aria-label={t('editor.jumpEnd')} disabled={disabled} onClick={() => editor.seek(range[1])}><SkipForward size={18} /></IconButton></span></Tooltip>
      </Stack>
      <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
        {formatEditorTime(currentTime)} <Box component="span" sx={{ color: 'text.secondary' }}>/ {formatEditorTime(media.duration)}</Box>
      </Typography>
    </Stack>
  </Box>
}
