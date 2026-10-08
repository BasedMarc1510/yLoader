import React from 'react'
import { Box, FormControlLabel, IconButton, Slider, Stack, Switch, TextField, Tooltip, Typography } from '@mui/material'
import { Info, Volume2 } from 'lucide-react'
import { useI18n } from '../../providers/I18nProvider'

export default function EditorAudioControls({ editor }) {
  const { t } = useI18n()
  const { media, volume, mute, audioOnly, fades, length, disabled } = editor
  return <Box component="fieldset" disabled={disabled} sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, m: 0, p: 1.5, minWidth: 0, bgcolor: 'background.paper' }}>
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} alignItems="center"><Volume2 size={18} /><Typography fontWeight={700}>{t('editor.audioSettings')}</Typography></Stack>
      {media.hasAudio ? <>
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" id="editor-volume-label">{t('editor.volumeLabel')}</Typography>
            <Stack direction="row" alignItems="center"><Typography variant="body2" fontWeight={700}>{volume}%</Typography>
              <Tooltip title={t('editor.volumeHint')}><IconButton aria-label={t('editor.volumeHint')} size="small"><Info size={15} /></IconButton></Tooltip>
            </Stack>
          </Stack>
          <Slider value={volume} min={0} max={200} step={5} aria-labelledby="editor-volume-label" disabled={mute || disabled}
            onChange={(_event, value) => editor.setVolume(value)} valueLabelDisplay="auto" />
        </Box>
        {media.hasVideo && <Box>
          <FormControlLabel sx={{ m: 0, display: 'flex', justifyContent: 'space-between' }} labelPlacement="start" label={t('editor.mute')}
            control={<Switch checked={mute} disabled={audioOnly || disabled} onChange={e => editor.setMute(e.target.checked)} />} />
          <FormControlLabel sx={{ m: 0, display: 'flex', justifyContent: 'space-between' }} labelPlacement="start" label={t('editor.audioOnly')}
            control={<Switch checked={audioOnly} disabled={disabled} onChange={e => { editor.setAudioOnly(e.target.checked); editor.setMute(false) }} />} />
        </Box>}
        <Box>
          <Stack direction="row" spacing={1}>
            {['fadeIn', 'fadeOut'].map((key, index) => <TextField key={key} label={t(`editor.${key}`)} type="number" size="small" fullWidth
              disabled={mute || disabled} value={fades[index]} inputProps={{ min: 0, max: Math.min(10, length), step: 0.1 }}
              onChange={e => editor.setFades(previous => previous.map((v, i) => i === index ? Number(e.target.value) : v))} />)}
          </Stack>
        </Box>
      </> : <Typography variant="body2" color="text.secondary">{t('editor.noAudio')}</Typography>}
    </Stack>
  </Box>
}
