import React from 'react'
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, LinearProgress, Stack, TextField, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material'
import { Scissors, Download, X, ArrowRightToLine, ArrowLeftToLine } from 'lucide-react'
import { useI18n } from '../../providers/I18nProvider'
import { getApiBase } from '../../utils/metadata'
import useMediaEditor from './useMediaEditor'
import EditorPreview from './EditorPreview'
import EditorAudioControls from './EditorAudioControls'
import MediaTimeline from './MediaTimeline'
import { clampTrim } from './timelineUtils'

export default function MediaEditorDialog({ entry, onClose, onSaved }) {
  const { t } = useI18n()
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const compact = useMediaQuery(theme.breakpoints.down('md'))
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const editor = useMediaEditor(entry, onSaved)
  const { media, error, saving, result, disabled, range, invalid } = editor
  const close = () => { editor.cancel(); onClose() }

  return <Dialog open onClose={saving ? undefined : close} fullScreen={fullScreen} fullWidth maxWidth="lg"
    transitionDuration={reducedMotion ? 0 : undefined} aria-labelledby="media-editor-title"
    PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 2, '& .MuiButton-root': { minHeight: 44 },
      '& .MuiIconButton-root': { minWidth: 44, minHeight: 44 }, '& .MuiInputBase-root': { minHeight: 44 } } }}>
    <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5 }}>
      <Scissors size={22} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography id="media-editor-title" component="span" fontWeight={700}>{t('editor.title')}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.filename}>{entry.filename}</Typography>
      </Box>
      {!saving && <IconButton aria-label={t('editor.close')} onClick={close}><X size={20} /></IconButton>}
    </DialogTitle>
    <DialogContent dividers sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Stack spacing={1.5}>
        {error && <Alert severity="error">{t(`editor.errors.${error}`)}</Alert>}
        {!media && !error && <Box sx={{ textAlign: 'center', py: 8 }}><CircularProgress aria-label={t('editor.loading')} /></Box>}
        {media && <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) 280px' }, gap: 2.5 }}>
            <EditorPreview editor={editor} />
            {!compact && <Box sx={{ maxHeight: 'clamp(204px, 33vh, 324px)', overflowY: 'auto' }}><EditorAudioControls editor={editor} /></Box>}
          </Box>
          {editor.previewError && <Alert severity="info">{t('editor.previewUnavailable')}</Alert>}
          <MediaTimeline media={media} visuals={editor.visuals} loading={editor.visualsLoading} error={editor.visualsError}
            onRetry={editor.retryVisuals} range={range} onRangeChange={editor.setRange} currentTime={editor.currentTime}
            onSeek={editor.seek} disabled={disabled} mute={editor.mute} audioOnly={editor.audioOnly} fades={editor.fades} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="stretch">
            {['start', 'end'].map((key, index) => <Stack key={key} direction="row" spacing={0.5} sx={{ flex: 1 }}>
              <TextField label={t(`editor.${key}`)} type="number" value={range[index]} fullWidth size="small" disabled={disabled}
                error={invalid} inputProps={{ min: 0, max: media.duration, step: 0.01 }}
                onChange={event => editor.setRange(previous => previous.map((v, i) => i === index ? Number(event.target.value) : v))} />
              <Tooltip title={t(index ? 'editor.markEnd' : 'editor.markStart')}><span>
                <IconButton disabled={disabled} aria-label={t(index ? 'editor.markEnd' : 'editor.markStart')}
                  onClick={() => editor.setRange(previous => previous.map((v, i) => i === index ? clampTrim(editor.currentTime, index, previous, media.duration) : v))}>
                  {index ? <ArrowLeftToLine size={18} /> : <ArrowRightToLine size={18} />}
                </IconButton>
              </span></Tooltip>
            </Stack>)}
          </Stack>
          {invalid && <Alert severity="warning">{t('editor.errors.invalid')}</Alert>}
          {compact && <EditorAudioControls editor={editor} />}
        </>}
        {saving && <Box role="status"><Typography variant="body2" sx={{ mb: 1 }}>{t('editor.saving')}</Typography><LinearProgress /></Box>}
        {result && <Alert severity="success" sx={{ overflowWrap: 'anywhere' }}>{t('editor.saved', { filename: result.filename })}</Alert>}
      </Stack>
    </DialogContent>
    <DialogActions sx={{ px: 2.5, py: 1.5, gap: 1, flexWrap: 'wrap', pb: 'max(12px, env(safe-area-inset-bottom))' }}>
      <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto', flexBasis: { xs: '100%', sm: 'auto' }, maxWidth: { sm: '55%' } }}>
        {t('editor.exportHint', { format: editor.audioOnly ? 'M4A' : 'MP4' })}
      </Typography>
      <Button color="inherit" onClick={close}>{t(saving ? 'editor.cancel' : 'editor.close')}</Button>
      {result ? <Button variant="contained" startIcon={<Download size={18} />} component="a"
        href={`${getApiBase()}/api/downloads/${result.id}/file`}>{t('editor.download')}</Button>
        : <Button variant="contained" startIcon={<Download size={18} />} onClick={editor.save} disabled={!media || invalid || saving}>{t('editor.save')}</Button>}
    </DialogActions>
  </Dialog>
}
