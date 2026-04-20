import React from 'react'
import { Box, ButtonBase, MenuItem, Select, Slider, Switch, Typography } from '@mui/material'
import { ChevronRight } from 'lucide-react'
import SettingRow from './SettingRow'
import SettingGroup from './SettingGroup'
import DownloadNamingSettingsGroup from './DownloadNamingSettingsGroup'
import {
  DOWNLOAD_AUDIO_BITRATE_OPTIONS,
  DOWNLOAD_CONCURRENCY_OPTIONS,
  DOWNLOAD_STAGGER_OPTIONS,
  DOWNLOAD_VIDEO_QUALITY_OPTIONS,
} from '../../utils/downloadSettings'

const DOWNLOAD_SUBSECTION_KEYS = Object.freeze({
  FORMAT_QUALITY: 'format-quality',
  FILENAME_CONVENTIONS: 'filename-conventions',
  ADVANCED_DOWNLOAD_SETTINGS: 'advanced-download-settings',
  AUTO_DOWNLOAD_DEFAULTS: 'auto-download-defaults',
})

const DOWNLOAD_SUBSECTIONS = Object.freeze([
  {
    key: DOWNLOAD_SUBSECTION_KEYS.FORMAT_QUALITY,
    labelKey: 'settings.downloadsFormatTitle',
    subtitleKey: 'settings.downloadsFormatSubtitle',
  },
  {
    key: DOWNLOAD_SUBSECTION_KEYS.FILENAME_CONVENTIONS,
    labelKey: 'settings.downloadsNamingTitle',
    subtitleKey: 'settings.downloadsNamingSubtitle',
  },
  {
    key: DOWNLOAD_SUBSECTION_KEYS.ADVANCED_DOWNLOAD_SETTINGS,
    labelKey: 'settings.downloadsAdvancedTitle',
    subtitleKey: 'settings.downloadsAdvancedSubtitle',
  },
  {
    key: DOWNLOAD_SUBSECTION_KEYS.AUTO_DOWNLOAD_DEFAULTS,
    labelKey: 'settings.downloadsAutoDefaultsTitle',
    subtitleKey: 'settings.downloadsAutoDefaultsSubtitle',
  },
])

function ErrorBanner({ message }) {
  if (!message) return null

  return (
    <Box
      sx={(theme) => ({
        mt: 1.5,
        px: 2,
        py: 1.25,
        borderRadius: '4px',
        bgcolor: theme.palette.mode === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
        border: '1px solid rgba(239,68,68,0.3)',
      })}
    >
      <Typography variant="body2" sx={{ color: '#f87171', fontWeight: 500, fontSize: 13 }}>
        {message}
      </Typography>
    </Box>
  )
}

function DownloadsSubsectionMenu({ t, onSelect, disabled = false }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.1, mb: 0.5 }}>
      {DOWNLOAD_SUBSECTIONS.map((item) => (
        <ButtonBase
          key={item.key}
          disabled={disabled}
          onClick={() => onSelect(item.key)}
          sx={(theme) => ({
            width: '100%',
            minHeight: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            px: 1.75,
            py: 1.5,
            textAlign: 'left',
            borderRadius: '12px',
            border: `1px solid ${theme.palette.divider}`,
            bgcolor: theme.palette.mode === 'dark' ? '#1c1c1e' : '#ffffff',
            cursor: disabled ? 'default' : 'pointer',
            transition: 'background-color 180ms ease, border-color 180ms ease',
            '&:hover': disabled
              ? {}
              : {
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)',
                borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)',
              },
          })}
        >
          <Box sx={{ minWidth: 0, pr: 0.5 }}>
            <Typography sx={{ fontWeight: 600, fontSize: 15, color: 'text.primary', lineHeight: 1.35 }}>
              {t(item.labelKey)}
            </Typography>
            <Typography sx={{ mt: 0.3, fontSize: 12.5, color: 'text.secondary', lineHeight: 1.4 }}>
              {t(item.subtitleKey)}
            </Typography>
          </Box>
          <ChevronRight size={17} style={{ color: '#8e8e93', flexShrink: 0 }} />
        </ButtonBase>
      ))}
    </Box>
  )
}

function FormatQualitySettings({
  downloadSettings,
  disabled,
  updateDownloadSettings,
  selectSx,
  t,
}) {
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

  return (
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
  )
}

function AdvancedDownloadSettings({
  downloadSettings,
  disabled,
  updateDownloadSettings,
  t,
  renderStorageSection,
}) {
  const concurrencyMarks = DOWNLOAD_CONCURRENCY_OPTIONS.map((value) => ({ value, label: String(value) }))
  const concurrencyValue = Number(downloadSettings.maxConcurrentDownloads) || 3

  const staggerValue = Number(downloadSettings.staggerDownloadsMs) || 0
  const staggerMax = DOWNLOAD_STAGGER_OPTIONS[DOWNLOAD_STAGGER_OPTIONS.length - 1] || 1000

  return (
    <>
      <SettingGroup title={t('settings.downloadsAdvancedTitle')} allowOverflow>
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
              onChange={(_event, next) => updateDownloadSettings({ maxConcurrentDownloads: next })}
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
              marks={DOWNLOAD_STAGGER_OPTIONS.map((value) => ({
                value,
                label: value === 0 ? t('settings.downloaderStaggerDisabled') : `${value}`,
              }))}
              disabled={disabled}
              onChange={(_event, next) => updateDownloadSettings({ staggerDownloadsMs: next })}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => (
                value === 0 ? t('settings.downloaderStaggerDisabled') : t('settings.downloaderStaggerMs', { value })
              )}
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
      </SettingGroup>

      {renderStorageSection?.()}
    </>
  )
}

function AutoDownloadDefaultsSettings({
  autoDownloadSettings,
  autoDisabled,
  updateAutoDownloadSettings,
  selectSx,
  t,
}) {
  return (
    <SettingGroup title={t('settings.downloadsAutoDefaultsTitle')}>
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
  )
}

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
  isMobileLayout = false,
  activeSubsection = '',
  onNavigateToSubsection,
  renderStorageSection,
}) {
  const disabled = downloadSettingsLoading
  const autoDisabled = autoDownloadLoading
  const sectionKey = String(activeSubsection || '').trim().toLowerCase()
  const isKnownSubsection = DOWNLOAD_SUBSECTIONS.some((item) => item.key === sectionKey)
  const isOverview = !sectionKey || !isKnownSubsection

  const contentPadding = {
    px: isMobileLayout ? 2 : 4,
    pt: isMobileLayout ? 2.5 : 4,
    pb: isMobileLayout ? 2.5 : 4,
  }

  return (
    <Box
      sx={contentPadding}
      aria-busy={downloadSettingsLoading || autoDownloadLoading}
    >
      {isOverview && (
        <DownloadsSubsectionMenu
          t={t}
          onSelect={(nextSection) => onNavigateToSubsection?.(nextSection)}
          disabled={downloadSettingsLoading || autoDownloadLoading}
        />
      )}

      {sectionKey === DOWNLOAD_SUBSECTION_KEYS.FORMAT_QUALITY && (
        <FormatQualitySettings
          downloadSettings={downloadSettings}
          disabled={disabled}
          updateDownloadSettings={updateDownloadSettings}
          selectSx={selectSx}
          t={t}
        />
      )}

      {sectionKey === DOWNLOAD_SUBSECTION_KEYS.FILENAME_CONVENTIONS && (
        <DownloadNamingSettingsGroup
          downloadSettings={downloadSettings}
          disabled={disabled}
          updateDownloadSettings={updateDownloadSettings}
          t={t}
          isMobileLayout={isMobileLayout}
        />
      )}

      {sectionKey === DOWNLOAD_SUBSECTION_KEYS.ADVANCED_DOWNLOAD_SETTINGS && (
        <AdvancedDownloadSettings
          downloadSettings={downloadSettings}
          disabled={disabled}
          updateDownloadSettings={updateDownloadSettings}
          t={t}
          renderStorageSection={renderStorageSection}
        />
      )}

      {sectionKey === DOWNLOAD_SUBSECTION_KEYS.AUTO_DOWNLOAD_DEFAULTS && (
        <AutoDownloadDefaultsSettings
          autoDownloadSettings={autoDownloadSettings}
          autoDisabled={autoDisabled}
          updateAutoDownloadSettings={updateAutoDownloadSettings}
          selectSx={selectSx}
          t={t}
        />
      )}

      <ErrorBanner message={downloadSettingsError} />
      <ErrorBanner message={autoDownloadError} />
    </Box>
  )
}
