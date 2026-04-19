import React from 'react'
import { Box, Typography, Button, Switch, TextField } from '@mui/material'
import SettingRow from './SettingRow'
import { resolveCookieFileValidationMessage } from './ytDlpCookieSettingsUtils'

export default function YtDlpCookieFileSettingsGroup({
  cookieState,
  cookieControlsDisabled,
  cookieSettingsLoading,
  cookieSettingsSaving,
  onUpdateCookieSettings,
  t,
}) {
  const runtime = typeof window !== 'undefined' ? window.yloaderRuntime : null
  const canPickCookieFile = Boolean(runtime?.isElectron && runtime?.downloads?.pickFile)
  const canValidateCookieFile = Boolean(runtime?.isElectron && runtime?.downloads?.validateFile)
  const [cookieFilePathDraft, setCookieFilePathDraft] = React.useState(String(cookieState.cookiesFilePath || ''))
  const [cookiePickerError, setCookiePickerError] = React.useState('')
  const [pickingCookieFile, setPickingCookieFile] = React.useState(false)
  const [cookieFileValidation, setCookieFileValidation] = React.useState(null)

  React.useEffect(() => {
    setCookieFilePathDraft(String(cookieState.cookiesFilePath || ''))
  }, [cookieState.cookiesFilePath])

  const commitCookieFilePath = React.useCallback(() => {
    const current = String(cookieState.cookiesFilePath || '').trim()
    const next = String(cookieFilePathDraft || '').trim()
    if (next === current) return
    onUpdateCookieSettings?.({
      cookiesFilePath: next,
      cookiesFileEnabled: next ? true : Boolean(cookieState.cookiesFileEnabled),
    })
  }, [cookieFilePathDraft, cookieState.cookiesFileEnabled, cookieState.cookiesFilePath, onUpdateCookieSettings])

  const handlePickCookieFile = React.useCallback(async () => {
    if (!canPickCookieFile || cookieControlsDisabled || pickingCookieFile) return

    setCookiePickerError('')
    setPickingCookieFile(true)
    const initialPath = String(cookieFilePathDraft || cookieState.cookiesFilePath || '').trim()
    try {
      const result = await runtime.downloads.pickFile(initialPath)
      if (!result || result.canceled || !result.path) return

      const nextPath = String(result.path || '').trim()
      if (!nextPath) return

      setCookieFilePathDraft(nextPath)
      onUpdateCookieSettings?.({
        cookiesFileEnabled: true,
        cookiesFilePath: nextPath,
      })
    } catch (error) {
      setCookiePickerError(t('settings.cookieFilePickedFailed', { message: error?.message || error }))
    } finally {
      setPickingCookieFile(false)
    }
  }, [
    canPickCookieFile,
    cookieControlsDisabled,
    pickingCookieFile,
    cookieFilePathDraft,
    cookieState.cookiesFilePath,
    runtime,
    onUpdateCookieSettings,
    t,
  ])

  React.useEffect(() => {
    if (!canValidateCookieFile || !cookieState.cookiesFileEnabled) {
      setCookieFileValidation(null)
      return undefined
    }

    const candidatePath = String(cookieFilePathDraft || '').trim()
    if (!candidatePath) {
      setCookieFileValidation(null)
      return undefined
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const result = await runtime.downloads.validateFile(candidatePath)
        if (cancelled) return

        const resolvedPath = String(result?.path || candidatePath)
        const exists = Boolean(result?.exists)
        const isFile = Boolean(result?.isFile)
        const readable = Boolean(result?.readable)

        let state = 'ok'
        if (!exists) state = 'missing'
        else if (!isFile) state = 'not-file'
        else if (!readable) state = 'not-readable'

        setCookieFileValidation({
          state,
          path: resolvedPath,
        })
      } catch {
        if (cancelled) return
        setCookieFileValidation({
          state: 'invalid',
          path: candidatePath,
        })
      }
    }, 220)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [canValidateCookieFile, cookieFilePathDraft, cookieState.cookiesFileEnabled, runtime])

  const cookieFileValidationMessage = React.useMemo(
    () => resolveCookieFileValidationMessage(t, cookieFileValidation?.state, cookieFileValidation?.path),
    [cookieFileValidation?.path, cookieFileValidation?.state, t]
  )

  return (
    <>
      <SettingRow
        label={t('settings.cookieFileEnabled')}
        description={t('settings.cookieFileEnabledDesc')}
      >
        <Switch
          checked={Boolean(cookieState.cookiesFileEnabled)}
          disabled={cookieControlsDisabled}
          onChange={(event) => {
            onUpdateCookieSettings?.({
              cookiesFileEnabled: event.target.checked,
            })
          }}
        />
      </SettingRow>

      <SettingRow
        label={t('settings.cookieFilePath')}
        description={t('settings.cookieFilePathDesc')}
        stacked
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', width: '100%' }}>
          <TextField
            size="small"
            value={cookieFilePathDraft}
            disabled={cookieControlsDisabled || !cookieState.cookiesFileEnabled}
            placeholder={t('settings.cookieFilePlaceholder')}
            onChange={(event) => setCookieFilePathDraft(event.target.value)}
            onBlur={commitCookieFilePath}
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

          {canPickCookieFile && (
            <Button
              variant="outlined"
              size="small"
              disabled={cookieControlsDisabled || !cookieState.cookiesFileEnabled || pickingCookieFile}
              onClick={handlePickCookieFile}
              sx={{
                textTransform: 'none',
                minWidth: 92,
                fontWeight: 600,
                borderRadius: '4px',
              }}
            >
              {pickingCookieFile ? t('settings.checking') : t('settings.cookieFileBrowse')}
            </Button>
          )}

          <Button
            variant="text"
            size="small"
            disabled={cookieControlsDisabled || (!cookieState.cookiesFileEnabled && !cookieState.cookiesFilePath)}
            onClick={() => {
              setCookieFilePathDraft('')
              onUpdateCookieSettings?.({
                cookiesFileEnabled: false,
                cookiesFilePath: '',
              })
            }}
            sx={{
              textTransform: 'none',
              minWidth: 74,
              fontWeight: 600,
              borderRadius: '4px',
            }}
          >
            {t('settings.cookieFileRemove')}
          </Button>
        </Box>
      </SettingRow>

      {cookieSettingsLoading && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
          {t('settings.checking')}
        </Typography>
      )}

      {cookieSettingsSaving && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
          {t('settings.cookieSettingsSaving')}
        </Typography>
      )}

      {cookieFileValidationMessage && (
        <Box sx={(th) => ({
          mt: 1,
          mb: 1,
          px: 2,
          py: 1.25,
          borderRadius: '4px',
          bgcolor: th.palette.mode === 'dark' ? 'rgba(245,158,11,0.14)' : 'rgba(245,158,11,0.12)',
          border: '1px solid rgba(245,158,11,0.32)',
        })}>
          <Typography variant="body2" sx={{ color: '#f59e0b', fontWeight: 500, fontSize: 13 }}>
            {cookieFileValidationMessage}
          </Typography>
        </Box>
      )}

      {cookiePickerError && (
        <Box sx={(th) => ({
          mt: 1,
          mb: 1,
          px: 2,
          py: 1.25,
          borderRadius: '4px',
          bgcolor: th.palette.mode === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
        })}>
          <Typography variant="body2" sx={{ color: '#f87171', fontWeight: 500, fontSize: 13 }}>
            {cookiePickerError}
          </Typography>
        </Box>
      )}
    </>
  )
}
