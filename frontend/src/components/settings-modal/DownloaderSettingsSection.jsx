import React from 'react'
import { Box, Typography, Switch, Select, MenuItem, TextField, Button } from '@mui/material'
import SettingRow from './SettingRow'
import SettingGroup from './SettingGroup'
import {
  DOWNLOAD_AUDIO_BITRATE_OPTIONS,
  DOWNLOAD_CONCURRENCY_OPTIONS,
  DOWNLOAD_STAGGER_OPTIONS,
  DOWNLOAD_VIDEO_QUALITY_OPTIONS,
} from '../../utils/downloadSettings'

function createPathDrafts(settings) {
  return {
    globalDownloadPath: String(settings?.globalDownloadPath || ''),
    audioDownloadPath: String(settings?.audioDownloadPath || ''),
    videoDownloadPath: String(settings?.videoDownloadPath || ''),
    thumbnailDownloadPath: String(settings?.thumbnailDownloadPath || ''),
  }
}

function resolveValidationMessage(t, validationState, resolvedPath) {
  if (!validationState) return ''

  if (validationState === 'missing') {
    return t('settings.downloaderPathMissing', { path: resolvedPath || '' })
  }
  if (validationState === 'not-directory') {
    return t('settings.downloaderPathNotDirectory', { path: resolvedPath || '' })
  }
  if (validationState === 'not-writable') {
    return t('settings.downloaderPathNotWritable', { path: resolvedPath || '' })
  }
  if (validationState === 'invalid') {
    return t('settings.downloaderPathInvalid', { path: resolvedPath || '' })
  }

  return ''
}

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
  const runtime = typeof window !== 'undefined' ? window.yloaderRuntime : null
  const isElectronRuntime = Boolean(runtime?.isElectron)
  const canPickDirectory = Boolean(runtime?.downloads?.pickDirectory)
  const canValidateDirectory = Boolean(runtime?.downloads?.validateDirectory)
  const storageSettingsDisabled = disabled
  const [directoryPickerError, setDirectoryPickerError] = React.useState('')
  const [pickingPathKey, setPickingPathKey] = React.useState('')
  const [pathDrafts, setPathDrafts] = React.useState(() => createPathDrafts(downloadSettings))
  const [pathValidationByKey, setPathValidationByKey] = React.useState({})

  React.useEffect(() => {
    setPathDrafts(createPathDrafts(downloadSettings))
  }, [
    downloadSettings.globalDownloadPath,
    downloadSettings.audioDownloadPath,
    downloadSettings.videoDownloadPath,
    downloadSettings.thumbnailDownloadPath,
  ])

  const commitPathDraft = React.useCallback((pathKey) => {
    const current = String(downloadSettings?.[pathKey] || '').trim()
    const next = String(pathDrafts?.[pathKey] || '').trim()
    if (next === current) return
    updateDownloadSettings({ [pathKey]: next })
  }, [downloadSettings, pathDrafts, updateDownloadSettings])

  const handlePathDraftChange = React.useCallback((pathKey, nextValue) => {
    setPathDrafts((prev) => ({
      ...prev,
      [pathKey]: String(nextValue || ''),
    }))
  }, [])

  const handlePickDirectory = React.useCallback(async (pathKey) => {
    if (!isElectronRuntime || storageSettingsDisabled || !canPickDirectory || pickingPathKey) return

    setDirectoryPickerError('')
    setPickingPathKey(pathKey)
    try {
      const initialPath = String(pathDrafts?.[pathKey] || downloadSettings?.[pathKey] || '').trim()
      const result = await runtime.downloads.pickDirectory(initialPath)
      if (!result || result.canceled || !result.path) return

      const selectedPath = String(result.path || '').trim()
      if (!selectedPath) return

      setPathDrafts((prev) => ({
        ...prev,
        [pathKey]: selectedPath,
      }))
      updateDownloadSettings({ [pathKey]: selectedPath })
    } catch (error) {
      setDirectoryPickerError(t('settings.downloaderChooseFolderFailed', { message: error?.message || error }))
    } finally {
      setPickingPathKey('')
    }
  }, [
    isElectronRuntime,
    storageSettingsDisabled,
    canPickDirectory,
    pickingPathKey,
    pathDrafts,
    downloadSettings,
    runtime,
    updateDownloadSettings,
    t,
  ])

  const isSeparateStorageMode = String(downloadSettings.downloadLocationMode || 'all') === 'separate'

  const activePathKeys = React.useMemo(
    () => (isSeparateStorageMode
      ? ['audioDownloadPath', 'videoDownloadPath', 'thumbnailDownloadPath']
      : ['globalDownloadPath']),
    [isSeparateStorageMode]
  )

  React.useEffect(() => {
    if (!isElectronRuntime || !canValidateDirectory) {
      setPathValidationByKey({})
      return undefined
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      const nextValidation = {}

      for (const pathKey of activePathKeys) {
        const draftPath = String(pathDrafts[pathKey] || '').trim()
        if (!draftPath) continue

        try {
          const result = await runtime.downloads.validateDirectory(draftPath)
          if (cancelled) return

          const resolvedPath = String(result?.path || draftPath)
          const exists = Boolean(result?.exists)
          const isDirectory = Boolean(result?.isDirectory)
          const writable = Boolean(result?.writable)

          let state = 'ok'
          if (!exists) state = 'missing'
          else if (!isDirectory) state = 'not-directory'
          else if (!writable) state = 'not-writable'

          nextValidation[pathKey] = {
            state,
            path: resolvedPath,
          }
        } catch {
          if (cancelled) return
          nextValidation[pathKey] = {
            state: 'invalid',
            path: draftPath,
          }
        }
      }

      if (!cancelled) {
        setPathValidationByKey(nextValidation)
      }
    }, 220)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [
    isElectronRuntime,
    canValidateDirectory,
    activePathKeys,
    pathDrafts,
    runtime,
  ])

  const renderPathControl = React.useCallback((pathKey) => {
    const isPickingCurrentPath = pickingPathKey === pathKey

    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <TextField
          size="small"
          value={String(pathDrafts[pathKey] || '')}
          disabled={storageSettingsDisabled}
          placeholder={t('settings.downloaderPathPlaceholder')}
          onChange={(event) => handlePathDraftChange(pathKey, event.target.value)}
          onBlur={() => commitPathDraft(pathKey)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            event.currentTarget.blur()
          }}
          sx={{
            width: { xs: '100%', sm: 200, md: 260 },
            '& .MuiInputBase-input': {
              fontSize: 12.5,
              py: '6px',
            },
          }}
        />

        {isElectronRuntime && (
          <Button
            variant="outlined"
            size="small"
            disabled={storageSettingsDisabled || !canPickDirectory || isPickingCurrentPath}
            onClick={() => handlePickDirectory(pathKey)}
            sx={{
              textTransform: 'none',
              minWidth: 96,
              fontWeight: 600,
              borderRadius: '4px',
              transition: 'none',
            }}
          >
            {isPickingCurrentPath ? t('settings.checking') : t('settings.downloaderBrowsePath')}
          </Button>
        )}
      </Box>
    )
  }, [
    pickingPathKey,
    pathDrafts,
    storageSettingsDisabled,
    t,
    handlePathDraftChange,
    commitPathDraft,
    isElectronRuntime,
    canPickDirectory,
    handlePickDirectory,
  ])

  const pathWarnings = React.useMemo(() => {
    const warnings = []

    for (const pathKey of activePathKeys) {
      const entry = pathValidationByKey[pathKey]
      if (!entry || entry.state === 'ok') continue

      const message = resolveValidationMessage(t, entry.state, entry.path)
      if (!message) continue

      warnings.push({
        pathKey,
        message,
      })
    }

    return warnings
  }, [activePathKeys, pathValidationByKey, t])

  const renderStorageAllMode = () => (
    <SettingGroup>
      <SettingRow
        label={t('settings.downloaderGlobalPath')}
        description={t('settings.downloaderGlobalPathDesc')}
      >
        {renderPathControl('globalDownloadPath')}
      </SettingRow>

      <SettingRow
        label={t('settings.downloaderGlobalAlwaysAsk')}
        description={t('settings.downloaderGlobalAlwaysAskDesc')}
        noDivider
      >
        <Switch
          size="small"
          checked={Boolean(downloadSettings.globalAlwaysAsk)}
          disabled={storageSettingsDisabled}
          onChange={(event) => updateDownloadSettings({ globalAlwaysAsk: event.target.checked })}
        />
      </SettingRow>
    </SettingGroup>
  )

  const renderStorageSeparateMode = () => (
    <SettingGroup>
      <SettingRow
        label={t('settings.downloaderAudioPath')}
        description={t('settings.downloaderAudioPathDesc')}
      >
        {renderPathControl('audioDownloadPath')}
      </SettingRow>

      <SettingRow
        label={t('settings.downloaderAudioAlwaysAsk')}
        description={t('settings.downloaderAudioAlwaysAskDesc')}
      >
        <Switch
          size="small"
          checked={Boolean(downloadSettings.audioAlwaysAsk)}
          disabled={storageSettingsDisabled}
          onChange={(event) => updateDownloadSettings({ audioAlwaysAsk: event.target.checked })}
        />
      </SettingRow>

      <SettingRow
        label={t('settings.downloaderVideoPath')}
        description={t('settings.downloaderVideoPathDesc')}
      >
        {renderPathControl('videoDownloadPath')}
      </SettingRow>

      <SettingRow
        label={t('settings.downloaderVideoAlwaysAsk')}
        description={t('settings.downloaderVideoAlwaysAskDesc')}
      >
        <Switch
          size="small"
          checked={Boolean(downloadSettings.videoAlwaysAsk)}
          disabled={storageSettingsDisabled}
          onChange={(event) => updateDownloadSettings({ videoAlwaysAsk: event.target.checked })}
        />
      </SettingRow>

      <SettingRow
        label={t('settings.downloaderThumbnailPath')}
        description={t('settings.downloaderThumbnailPathDesc')}
      >
        {renderPathControl('thumbnailDownloadPath')}
      </SettingRow>

      <SettingRow
        label={t('settings.downloaderThumbnailAlwaysAsk')}
        description={t('settings.downloaderThumbnailAlwaysAskDesc')}
        noDivider
      >
        <Switch
          size="small"
          checked={Boolean(downloadSettings.thumbnailAlwaysAsk)}
          disabled={storageSettingsDisabled}
          onChange={(event) => updateDownloadSettings({ thumbnailAlwaysAsk: event.target.checked })}
        />
      </SettingRow>
    </SettingGroup>
  )

  return (
    <Box sx={{ px: 4, pt: 4, pb: 4 }}>
      <SettingGroup title={t('settings.downloaderDescription')}>
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
          noDivider
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
      </SettingGroup>

      <SettingGroup>
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
          label={t('settings.downloaderMaxAudioBitrate')}
          description={t('settings.downloaderMaxAudioBitrateDesc')}
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

      {isElectronRuntime && (
        <Box sx={{ mb: 3.5 }}>
          <Box sx={{ px: 2, pb: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {t('settings.downloaderStorageTitle')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, lineHeight: 1.4, fontSize: 13 }}>
              {t('settings.downloaderStorageModeDesc')}
            </Typography>
          </Box>

          <SettingGroup sx={{ mb: 0 }}>
            <SettingRow
              label={t('settings.downloaderStorageMode')}
              description={t('settings.downloaderStorageModeRowDesc')}
              noDivider
            >
              <Select
                size="small"
                value={String(downloadSettings.downloadLocationMode || 'all')}
                disabled={storageSettingsDisabled}
                onChange={(event) => updateDownloadSettings({ downloadLocationMode: String(event.target.value || 'all') })}
                sx={selectSx}
              >
                <MenuItem value="all" sx={{ fontSize: 13 }}>
                  {t('settings.downloaderStorageModeAll')}
                </MenuItem>
                <MenuItem value="separate" sx={{ fontSize: 13 }}>
                  {t('settings.downloaderStorageModeSeparate')}
                </MenuItem>
              </Select>
            </SettingRow>
          </SettingGroup>

          <Box sx={{ mt: 3.5 }}>
            {!isSeparateStorageMode && renderStorageAllMode()}
            {isSeparateStorageMode && renderStorageSeparateMode()}
          </Box>

          {pathWarnings.length > 0 && (
            <Box
              sx={(theme) => ({
                borderTop: `1px solid ${theme.palette.divider}`,
                px: 2,
                py: 1.2,
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.07)',
              })}
            >
              {pathWarnings.map((entry) => (
                <Typography key={entry.pathKey} variant="caption" sx={{ display: 'block', color: '#f59e0b', lineHeight: 1.45 }}>
                  {entry.message}
                </Typography>
              ))}
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5, lineHeight: 1.45 }}>
                {t('settings.downloaderStorageFallbackHint')}
              </Typography>
            </Box>
          )}

          {directoryPickerError && (
            <Box
              sx={(th) => ({
                px: 2,
                py: 1.2,
                borderTop: `1px solid ${th.palette.divider}`,
                bgcolor: th.palette.mode === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
              })}
            >
              <Typography variant="body2" sx={{ color: '#f87171', fontWeight: 500, fontSize: 13 }}>
                {directoryPickerError}
              </Typography>
            </Box>
          )}
        </Box>
      )}

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
