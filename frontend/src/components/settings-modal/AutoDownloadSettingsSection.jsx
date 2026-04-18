import React from 'react'
import { Box, Typography, Switch, Select, MenuItem, TextField, Button } from '@mui/material'
import SettingRow from './SettingRow'
import SettingGroup from './SettingGroup'

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

export default function AutoDownloadSettingsSection({
  autoDownloadSettings,
  autoDownloadLoading,
  autoDownloadSaving,
  autoDownloadError,
  updateAutoDownloadSettings,
  selectSx,
  t,
  isElectronRuntime = false,
}) {
  const controlsDisabled = autoDownloadLoading
  const runtime = typeof window !== 'undefined' ? window.yloaderRuntime : null
  const canPickDirectory = Boolean(runtime?.downloads?.pickDirectory)
  const canValidateDirectory = Boolean(runtime?.downloads?.validateDirectory)
  const fixedPathEnabled = Boolean(autoDownloadSettings.useFixedDownloadPath)
  const [fixedPathDraft, setFixedPathDraft] = React.useState(() => String(autoDownloadSettings.fixedDownloadPath || ''))
  const [directoryPickerError, setDirectoryPickerError] = React.useState('')
  const [pickingPath, setPickingPath] = React.useState(false)
  const [pathValidation, setPathValidation] = React.useState(null)

  React.useEffect(() => {
    setFixedPathDraft(String(autoDownloadSettings.fixedDownloadPath || ''))
  }, [autoDownloadSettings.fixedDownloadPath])

  const commitFixedPathDraft = React.useCallback(() => {
    const current = String(autoDownloadSettings?.fixedDownloadPath || '').trim()
    const next = String(fixedPathDraft || '').trim()
    if (next === current) return
    updateAutoDownloadSettings({ fixedDownloadPath: next })
  }, [autoDownloadSettings, fixedPathDraft, updateAutoDownloadSettings])

  const handlePickDirectory = React.useCallback(async () => {
    if (!isElectronRuntime || controlsDisabled || !canPickDirectory || pickingPath) return

    setDirectoryPickerError('')
    setPickingPath(true)
    try {
      const initialPath = String(fixedPathDraft || autoDownloadSettings?.fixedDownloadPath || '').trim()
      const result = await runtime.downloads.pickDirectory(initialPath)
      if (!result || result.canceled || !result.path) return

      const selectedPath = String(result.path || '').trim()
      if (!selectedPath) return

      setFixedPathDraft(selectedPath)
      updateAutoDownloadSettings({ fixedDownloadPath: selectedPath })
    } catch (error) {
      setDirectoryPickerError(t('settings.downloaderChooseFolderFailed', { message: error?.message || error }))
    } finally {
      setPickingPath(false)
    }
  }, [
    isElectronRuntime,
    controlsDisabled,
    canPickDirectory,
    pickingPath,
    fixedPathDraft,
    autoDownloadSettings,
    runtime,
    updateAutoDownloadSettings,
    t,
  ])

  React.useEffect(() => {
    if (!isElectronRuntime || !fixedPathEnabled || !canValidateDirectory) {
      setPathValidation(null)
      return undefined
    }

    const draftPath = String(fixedPathDraft || '').trim()
    if (!draftPath) {
      setPathValidation(null)
      return undefined
    }

    let cancelled = false
    const timer = setTimeout(async () => {
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

        setPathValidation({ state, path: resolvedPath })
      } catch {
        if (cancelled) return
        setPathValidation({
          state: 'invalid',
          path: draftPath,
        })
      }
    }, 220)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isElectronRuntime, fixedPathEnabled, canValidateDirectory, fixedPathDraft, runtime])

  const pathValidationMessage = resolveValidationMessage(t, pathValidation?.state, pathValidation?.path)

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

      {isElectronRuntime && (
        <SettingGroup title={t('settings.autoDownloadStorageTitle')}>
          <SettingRow
            label={t('settings.autoDownloadUseFixedPath')}
            description={t('settings.autoDownloadUseFixedPathDesc')}
          >
            <Switch
              size="small"
              checked={fixedPathEnabled}
              disabled={controlsDisabled}
              onChange={(event) => updateAutoDownloadSettings({ useFixedDownloadPath: event.target.checked })}
            />
          </SettingRow>

          {fixedPathEnabled && (
            <SettingRow
              label={t('settings.autoDownloadFixedPath')}
              description={t('settings.autoDownloadFixedPathDesc')}
              noDivider
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TextField
                  size="small"
                  value={fixedPathDraft}
                  disabled={controlsDisabled}
                  placeholder={t('settings.downloaderPathPlaceholder')}
                  onChange={(event) => setFixedPathDraft(String(event.target.value || ''))}
                  onBlur={commitFixedPathDraft}
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

                <Button
                  variant="outlined"
                  size="small"
                  disabled={controlsDisabled || !canPickDirectory || pickingPath}
                  onClick={handlePickDirectory}
                  sx={{
                    textTransform: 'none',
                    minWidth: 96,
                    fontWeight: 600,
                    borderRadius: '4px',
                    transition: 'none',
                  }}
                >
                  {pickingPath ? t('settings.checking') : t('settings.downloaderBrowsePath')}
                </Button>
              </Box>
            </SettingRow>
          )}
        </SettingGroup>
      )}

      {isElectronRuntime && fixedPathEnabled && pathValidationMessage && (
        <Box
          sx={(theme) => ({
            mt: 1.5,
            px: 2,
            py: 1.2,
            borderRadius: '4px',
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.07)',
            border: '1px solid rgba(245,158,11,0.25)',
          })}
        >
          <Typography variant="caption" sx={{ display: 'block', color: '#f59e0b', lineHeight: 1.45 }}>
            {pathValidationMessage}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5, lineHeight: 1.45 }}>
            {t('settings.downloaderStorageFallbackHint')}
          </Typography>
        </Box>
      )}

      {directoryPickerError && (
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
            {directoryPickerError}
          </Typography>
        </Box>
      )}

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
