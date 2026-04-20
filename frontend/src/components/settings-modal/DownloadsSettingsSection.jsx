import React from 'react'
import { Box, Select, MenuItem, Slider, Switch, Typography } from '@mui/material'
import SettingRow from './SettingRow'
import SettingGroup from './SettingGroup'
import {
  DOWNLOAD_AUDIO_BITRATE_OPTIONS,
  DOWNLOAD_CONCURRENCY_OPTIONS,
  DOWNLOAD_STAGGER_OPTIONS,
  DOWNLOAD_VIDEO_QUALITY_OPTIONS,
} from '../../utils/downloadSettings'

/**
 * Merged Downloads settings section — combines former "Downloader defaults" and "Auto download"
 * into a single cohesive section with Basic / Advanced separation.
 */
export default function DownloadsSettingsSection({
  downloadSettings,
  downloadSettingsLoading,
  downloadSettingsError,
  updateDownloadSettings,
  autoDownloadSettings,
  autoDownloadLoading,
  autoDownloadError,
  updateAutoDownloadSettings,
  selectSx,
  t,
  isElectronRuntime,
  isMobileLayout = false,
  /* path picker helpers from DownloaderSettingsSection are wired through the parent */
  renderStorageSection,
}) {
  const disabled = downloadSettingsLoading
  const autoDisabled = autoDownloadLoading

  const audioContainerOptions = [
    { value: 'mp3', label: 'MP3' },
    { value: 'flac', label: 'FLAC' },
    { value: 'm4a', label: 'M4A' },
    { value: 'ogg', label: 'OGG' },
    { value: 'wav', label: 'WAV' },
    { value: 'opus', label: 'Opus' },
  ]

  const videoContainerOptions = [
    { value: 'mp4', label: 'MP4' },
    { value: 'mkv', label: 'MKV' },
    { value: 'webm', label: 'WebM' },
  ]

  const concurrencyMarks = DOWNLOAD_CONCURRENCY_OPTIONS.map((v) => ({ value: v, label: String(v) }))
  const concurrencyValue = Number(downloadSettings.maxConcurrentDownloads) || 3

  const staggerValue = Number(downloadSettings.staggerDownloadsMs) || 0
  const staggerMax = DOWNLOAD_STAGGER_OPTIONS[DOWNLOAD_STAGGER_OPTIONS.length - 1] || 1000

  return (
    <Box
      sx={{
        px: isMobileLayout ? 2 : 4,
        pt: isMobileLayout ? 2.5 : 4,
        pb: isMobileLayout ? 2.5 : 4,
      }}
      aria-busy={downloadSettingsLoading || autoDownloadLoading}
    >
      {/* ─── BASIC: Format Selection ─── */}
      <SettingGroup title={t('settings.downloadsFormatTitle')}>
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
            {audioContainerOptions.map((opt) => (
              <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: 13 }}>
                {opt.label}
              </MenuItem>
            ))}
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
            {videoContainerOptions.map((opt) => (
              <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: 13 }}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </SettingRow>

        <SettingRow
          label={t('settings.downloaderMaxVideoQuality')}
          description={t('settings.downloaderMaxVideoQualityDesc')}
          noDivider
        >
          <Select
            size="small"
            value={Number(downloadSettings.maxVideoHeight) || 0}
            disabled={disabled}
            onChange={(event) => updateDownloadSettings({ maxVideoHeight: Number(event.target.value) || 0 })}
            sx={selectSx}
          >
            {DOWNLOAD_VIDEO_QUALITY_OPTIONS.map((value) => (
              <MenuItem key={value} value={value} sx={{ fontSize: 13 }}>
                {value === 0 ? t('settings.downloaderHighestQuality') : `${value}p`}
              </MenuItem>
            ))}
          </Select>
        </SettingRow>
      </SettingGroup>

      <SettingGroup title={t('settings.downloadsAdvancedTitle')} allowOverflow>
        {/* Parallel downloads — Slider */}
        <SettingRow
          label={t('settings.downloaderConcurrentDownloads')}
          description={t('settings.downloaderConcurrentDownloadsDesc')}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: { xs: '100%', sm: 200 } }}>
            <Slider
              value={concurrencyValue}
              min={1}
              max={8}
              step={1}
              marks={concurrencyMarks}
              disabled={disabled}
              onChange={(event, next) => updateDownloadSettings({ maxConcurrentDownloads: next })}
              valueLabelDisplay="auto"
              sx={{
                flex: 1,
                '& .MuiSlider-markLabel': { fontSize: 10 },
                '& .MuiSlider-thumb': { width: 16, height: 16 },
              }}
            />
            <Typography sx={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>
              {concurrencyValue}
            </Typography>
          </Box>
        </SettingRow>

        {/* Start delay — Slider */}
        <SettingRow
          label={t('settings.downloaderStagger')}
          description={t('settings.downloaderStaggerDesc')}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: { xs: '100%', sm: 200 } }}>
            <Slider
              value={staggerValue}
              min={0}
              max={staggerMax}
              step={null}
              marks={DOWNLOAD_STAGGER_OPTIONS.map((v) => ({
                value: v,
                label: v === 0 ? t('settings.downloaderStaggerDisabled') : `${v}`,
              }))}
              disabled={disabled}
              onChange={(event, next) => updateDownloadSettings({ staggerDownloadsMs: next })}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) =>
                v === 0 ? t('settings.downloaderStaggerDisabled') : t('settings.downloaderStaggerMs', { value: v })
              }
              sx={{
                flex: 1,
                '& .MuiSlider-markLabel': { fontSize: 9, display: 'none' },
                '& .MuiSlider-thumb': { width: 16, height: 16 },
              }}
            />
            <Typography sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, minWidth: 50, textAlign: 'right', color: 'text.secondary' }}>
              {staggerValue === 0 ? '—' : t('settings.downloaderStaggerMs', { value: staggerValue })}
            </Typography>
          </Box>
        </SettingRow>

        {/* Embed cover & Metadata toggles — side by side */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
          <Box sx={{ flex: '1 1 50%', minWidth: 200 }}>
            <SettingRow
              label={t('settings.downloaderDefaultEmbedCoverArt')}
              description={t('settings.downloaderDefaultEmbedCoverArtDesc')}
            >
              <Switch
                size="small"
                checked={Boolean(downloadSettings.defaultEmbedCoverArt)}
                disabled={disabled}
                onChange={(event) => updateDownloadSettings({ defaultEmbedCoverArt: event.target.checked })}
              />
            </SettingRow>
          </Box>
          <Box sx={{ flex: '1 1 50%', minWidth: 200 }}>
            <SettingRow
              label={t('settings.autoDownloadUseMetadata')}
              description={t('settings.autoDownloadUseMetadataDesc')}
            >
              <Switch
                size="small"
                checked={Boolean(autoDownloadSettings.useMetadata)}
                disabled={autoDisabled}
                onChange={(event) => updateAutoDownloadSettings({ useMetadata: event.target.checked })}
              />
            </SettingRow>
          </Box>
        </Box>

        {/* Audio bitrate */}
        <SettingRow
          label={t('settings.downloaderMaxAudioBitrate')}
          description={t('settings.downloaderMaxAudioBitrateDesc')}
          noDivider
        >
          <Select
            size="small"
            value={Number(downloadSettings.maxAudioBitrateKbps) || 0}
            disabled={disabled}
            onChange={(event) => updateDownloadSettings({ maxAudioBitrateKbps: Number(event.target.value) || 0 })}
            sx={selectSx}
          >
            {DOWNLOAD_AUDIO_BITRATE_OPTIONS.map((value) => (
              <MenuItem key={value} value={value} sx={{ fontSize: 13 }}>
                {value === 0 ? t('settings.downloaderHighestQuality') : `${value} kbps`}
              </MenuItem>
            ))}
          </Select>
        </SettingRow>
      </SettingGroup>

      {/* Auto download embed cover */}
      <SettingGroup title={t('settings.autoDownloadDescription')}>
        <SettingRow
          label={t('settings.autoDownloadEmbedCover')}
          description={t('settings.autoDownloadEmbedCoverDesc')}
        >
          <Switch
            size="small"
            checked={Boolean(autoDownloadSettings.embedCoverArt)}
            disabled={autoDisabled}
            onChange={(event) => updateAutoDownloadSettings({ embedCoverArt: event.target.checked })}
          />
        </SettingRow>

        <SettingRow label={t('settings.autoDownloadMaxAudioBitrate')}>
          <Select
            size="small"
            value={Number(autoDownloadSettings.maxAudioBitrateKbps) || 0}
            disabled={autoDisabled}
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
            disabled={autoDisabled}
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

      {/* Download storage section — rendered by parent to keep path-picker wiring intact */}
      {renderStorageSection?.()}

      {/* Error banners */}
      {downloadSettingsError && (
        <Box sx={(th) => ({
          mt: 1.5, px: 2, py: 1.25, borderRadius: '4px',
          bgcolor: th.palette.mode === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
        })}>
          <Typography variant="body2" sx={{ color: '#f87171', fontWeight: 500, fontSize: 13 }}>
            {downloadSettingsError}
          </Typography>
        </Box>
      )}
      {autoDownloadError && (
        <Box sx={(th) => ({
          mt: 1.5, px: 2, py: 1.25, borderRadius: '4px',
          bgcolor: th.palette.mode === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
        })}>
          <Typography variant="body2" sx={{ color: '#f87171', fontWeight: 500, fontSize: 13 }}>
            {autoDownloadError}
          </Typography>
        </Box>
      )}
    </Box>
  )
}
