import React from 'react'
import { Box, Typography, Button } from '@mui/material'
import { RefreshCw } from 'lucide-react'
import SettingRow from './SettingRow'

export default function FfmpegSettingsSection({
  ffmpegInfo,
  fetchFfmpegStatus,
  t,
}) {
  return (
    <Box sx={{ px: 3, pt: 1, pb: 3 }}>
      <SettingRow label={t('settings.ffmpegStatus')}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              bgcolor: ffmpegInfo.loading ? '#9ca3af' : ffmpegInfo.available ? '#22c55e' : '#ef4444',
              flexShrink: 0,
            }}
          />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {ffmpegInfo.loading
              ? t('settings.checking')
              : ffmpegInfo.available
                ? t('settings.ffmpegAvailable')
                : t('settings.ffmpegMissing')}
          </Typography>
        </Box>
      </SettingRow>

      <SettingRow label={t('settings.ffmpegVersion')}>
        <Typography sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
          {ffmpegInfo.loading ? '…' : ffmpegInfo.version}
        </Typography>
      </SettingRow>

      <SettingRow label={t('settings.ffmpegPath')}>
        <Typography sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary', maxWidth: 380, textAlign: 'right', wordBreak: 'break-all' }}>
          {ffmpegInfo.loading ? '…' : ffmpegInfo.path}
        </Typography>
      </SettingRow>

      <SettingRow label={t('settings.ffmpegBinarySize')}>
        <Typography sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
          {ffmpegInfo.loading ? '…' : ffmpegInfo.fileSize}
        </Typography>
      </SettingRow>

      <SettingRow label={t('settings.projectManagedFfmpeg')}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {ffmpegInfo.projectManaged ? t('settings.yes') : t('settings.no')}
        </Typography>
      </SettingRow>

      <SettingRow label={t('settings.refreshStatus')} noDivider>
        <Button
          onClick={fetchFfmpegStatus}
          disabled={ffmpegInfo.loading}
          variant="outlined"
          size="small"
          startIcon={<RefreshCw size={13} />}
          sx={{
            textTransform: 'none',
            fontSize: 13,
            borderRadius: '4px',
            height: 32,
            borderColor: 'divider',
            color: 'text.primary',
            '&:hover': { borderColor: 'text.disabled', bgcolor: 'action.hover' },
          }}
        >
          {ffmpegInfo.loading ? t('settings.checking') : t('settings.refreshStatus')}
        </Button>
      </SettingRow>

      {ffmpegInfo.error && (
        <Box
          sx={(th) => ({
            mt: 2,
            px: 2,
            py: 1.25,
            borderRadius: '4px',
            bgcolor: th.palette.mode === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
          })}
        >
          <Typography variant="body2" sx={{ color: '#f87171', fontWeight: 500, fontSize: 13 }}>
            {ffmpegInfo.error}
          </Typography>
        </Box>
      )}
    </Box>
  )
}
