import React from 'react'
import { Box, Typography, Switch, Select, MenuItem } from '@mui/material'
import SettingRow from './SettingRow'
import {
  DOWNLOAD_CONCURRENCY_OPTIONS,
  DOWNLOAD_STAGGER_OPTIONS,
} from '../../utils/downloadSettings'

export default function DownloaderSettingsSection({
  downloadSettings,
  downloadSettingsLoading,
  downloadSettingsSaving,
  downloadSettingsError,
  updateDownloadSettings,
  selectSx,
  t,
}) {
  const disabled = downloadSettingsLoading || downloadSettingsSaving

  return (
    <Box sx={{ px: 3, pt: 1, pb: 3 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
        {t('settings.downloaderDescription')}
      </Typography>

      <SettingRow
        label={t('settings.downloaderConcurrentDownloads')}
        description={t('settings.downloaderConcurrentDownloadsDesc')}
      >
        <Select
          size="small"
          value={Number(downloadSettings.maxConcurrentDownloads) || 1}
          disabled={disabled}
          onChange={(event) => updateDownloadSettings({ maxConcurrentDownloads: Number(event.target.value) || 1 })}
          sx={selectSx}
        >
          {DOWNLOAD_CONCURRENCY_OPTIONS.map((value) => (
            <MenuItem key={value} value={value} sx={{ fontSize: 13 }}>
              {value}
            </MenuItem>
          ))}
        </Select>
      </SettingRow>

      <SettingRow
        label={t('settings.downloaderStagger')}
        description={t('settings.downloaderStaggerDesc')}
      >
        <Select
          size="small"
          value={Number(downloadSettings.staggerDownloadsMs) || 0}
          disabled={disabled}
          onChange={(event) => updateDownloadSettings({ staggerDownloadsMs: Number(event.target.value) || 0 })}
          sx={selectSx}
        >
          {DOWNLOAD_STAGGER_OPTIONS.map((value) => (
            <MenuItem key={value} value={value} sx={{ fontSize: 13 }}>
              {value === 0 ? t('settings.downloaderStaggerDisabled') : t('settings.downloaderStaggerMs', { value })}
            </MenuItem>
          ))}
        </Select>
      </SettingRow>

      <SettingRow
        label={t('settings.downloaderDefaultAudioContainer')}
        description={t('settings.downloaderDefaultAudioContainerDesc')}
      >
        <Select
          size="small"
          value={String(downloadSettings.defaultAudioContainer || 'mp3')}
          disabled={disabled}
          onChange={(event) => updateDownloadSettings({ defaultAudioContainer: String(event.target.value || 'mp3') })}
          sx={selectSx}
        >
          <MenuItem value="mp3" sx={{ fontSize: 13 }}>mp3</MenuItem>
          <MenuItem value="m4a" sx={{ fontSize: 13 }}>m4a</MenuItem>
          <MenuItem value="wav" sx={{ fontSize: 13 }}>wav</MenuItem>
          <MenuItem value="ogg" sx={{ fontSize: 13 }}>ogg</MenuItem>
          <MenuItem value="flac" sx={{ fontSize: 13 }}>flac</MenuItem>
          <MenuItem value="opus" sx={{ fontSize: 13 }}>opus</MenuItem>
        </Select>
      </SettingRow>

      <SettingRow
        label={t('settings.downloaderDefaultVideoContainer')}
        description={t('settings.downloaderDefaultVideoContainerDesc')}
      >
        <Select
          size="small"
          value={String(downloadSettings.defaultVideoContainer || 'mp4')}
          disabled={disabled}
          onChange={(event) => updateDownloadSettings({ defaultVideoContainer: String(event.target.value || 'mp4') })}
          sx={selectSx}
        >
          <MenuItem value="mp4" sx={{ fontSize: 13 }}>mp4</MenuItem>
          <MenuItem value="webm" sx={{ fontSize: 13 }}>webm</MenuItem>
          <MenuItem value="mkv" sx={{ fontSize: 13 }}>mkv</MenuItem>
        </Select>
      </SettingRow>

      <SettingRow
        label={t('settings.downloaderDefaultEmbedCoverArt')}
        description={t('settings.downloaderDefaultEmbedCoverArtDesc')}
        noDivider
      >
        <Switch
          size="small"
          checked={Boolean(downloadSettings.defaultEmbedCoverArt)}
          disabled={disabled}
          onChange={(event) => updateDownloadSettings({ defaultEmbedCoverArt: event.target.checked })}
        />
      </SettingRow>

      {disabled && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
          {t('settings.checking')}
        </Typography>
      )}

      {downloadSettingsError && (
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
            {downloadSettingsError}
          </Typography>
        </Box>
      )}
    </Box>
  )
}
