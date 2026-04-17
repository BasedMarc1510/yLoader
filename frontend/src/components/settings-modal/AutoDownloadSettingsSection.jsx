import React from 'react'
import { Box, Typography, Switch, Select, MenuItem } from '@mui/material'
import SettingRow from './SettingRow'
import SettingGroup from './SettingGroup'

export default function AutoDownloadSettingsSection({
  autoDownloadSettings,
  autoDownloadLoading,
  autoDownloadSaving,
  autoDownloadError,
  updateAutoDownloadSettings,
  selectSx,
  t,
}) {
  const controlsDisabled = autoDownloadLoading

  return (
    <Box sx={{ px: 4, pt: 4, pb: 4 }} aria-busy={autoDownloadLoading || autoDownloadSaving}>
      <SettingGroup title={t('settings.autoDownloadDescription')}>
        <SettingRow
          label={t('settings.autoDownloadUseMetadata')}
          description={t('settings.autoDownloadUseMetadataDesc')}
        >
          <Switch
            size="small"
            checked={Boolean(autoDownloadSettings.useMetadata)}
            disabled={controlsDisabled}
            onChange={(event) => updateAutoDownloadSettings({ useMetadata: event.target.checked })}
          />
        </SettingRow>

        <SettingRow
          label={t('settings.autoDownloadEmbedCover')}
          description={t('settings.autoDownloadEmbedCoverDesc')}
        >
          <Switch
            size="small"
            checked={Boolean(autoDownloadSettings.embedCoverArt)}
            disabled={controlsDisabled}
            onChange={(event) => updateAutoDownloadSettings({ embedCoverArt: event.target.checked })}
          />
        </SettingRow>

        <SettingRow label={t('settings.autoDownloadMaxAudioBitrate')}>
          <Select
            size="small"
            value={Number(autoDownloadSettings.maxAudioBitrateKbps) || 0}
            disabled={controlsDisabled}
            onChange={(event) => updateAutoDownloadSettings({ maxAudioBitrateKbps: Number(event.target.value) || 0 })}
            sx={selectSx}
          >
            <MenuItem value={0} sx={{ fontSize: 13 }}>{t('settings.autoDownloadBest')}</MenuItem>
            <MenuItem value={320} sx={{ fontSize: 13 }}>320 kbps</MenuItem>
            <MenuItem value={256} sx={{ fontSize: 13 }}>256 kbps</MenuItem>
            <MenuItem value={192} sx={{ fontSize: 13 }}>192 kbps</MenuItem>
            <MenuItem value={160} sx={{ fontSize: 13 }}>160 kbps</MenuItem>
            <MenuItem value={128} sx={{ fontSize: 13 }}>128 kbps</MenuItem>
            <MenuItem value={96} sx={{ fontSize: 13 }}>96 kbps</MenuItem>
          </Select>
        </SettingRow>

        <SettingRow label={t('settings.autoDownloadMaxVideoQuality')} noDivider>
          <Select
            size="small"
            value={Number(autoDownloadSettings.maxVideoHeight) || 0}
            disabled={controlsDisabled}
            onChange={(event) => updateAutoDownloadSettings({ maxVideoHeight: Number(event.target.value) || 0 })}
            sx={selectSx}
          >
            <MenuItem value={0} sx={{ fontSize: 13 }}>{t('settings.autoDownloadBest')}</MenuItem>
            <MenuItem value={2160} sx={{ fontSize: 13 }}>2160p</MenuItem>
            <MenuItem value={1440} sx={{ fontSize: 13 }}>1440p</MenuItem>
            <MenuItem value={1080} sx={{ fontSize: 13 }}>1080p</MenuItem>
            <MenuItem value={720} sx={{ fontSize: 13 }}>720p</MenuItem>
            <MenuItem value={480} sx={{ fontSize: 13 }}>480p</MenuItem>
            <MenuItem value={360} sx={{ fontSize: 13 }}>360p</MenuItem>
          </Select>
        </SettingRow>
      </SettingGroup>

      {autoDownloadLoading && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
          {t('settings.checking')}
        </Typography>
      )}

      {autoDownloadError && (
        <Box
          sx={(th) => ({
            mt: 1.5,
            px: 2,
            py: 1.25,
            borderRadius: '4px',
            bgcolor: th.palette.mode === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
          })}
        >
          <Typography variant="body2" sx={{ color: '#f87171', fontWeight: 500, fontSize: 13 }}>
            {autoDownloadError}
          </Typography>
        </Box>
      )}
    </Box>
  )
}
