import React from 'react'
import {
  Box,
  Stack,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material'
import { detectService, isLikelyValidUrlFor } from '../utils/metadata'
import { useI18n } from '../providers/I18nProvider'
import { useNotification } from '../providers/NotificationProvider'
import HomeQuickActions from './home/HomeQuickActions'
import HomeMultiInput from './home/HomeMultiInput'
import HomeSingleInput from './home/HomeSingleInput'
import HomeErrorOverlay from './home/HomeErrorOverlay'
import { HOME_AUTO_PREFS_KEY } from './home/constants'
import { readHomeAutoDownloadPrefs, persistHomeAutoDownloadPrefs } from './home/prefs'
import { useAutoDownload } from './home/useAutoDownload'

const INPUT_BORDER_RUNNER_ANIMATION = 'input-border-runner 3.4s ease-in-out infinite'

export default function HomePage({ onOpenDownloader }) {
  const { t } = useI18n()
  const { showNotification } = useNotification()

  const [value, setValue] = React.useState('')
  const [menuAnchorEl, setMenuAnchorEl] = React.useState(null)
  const [multiModeEnabled, setMultiModeEnabled] = React.useState(false)
  const [confirmDisableMultiOpen, setConfirmDisableMultiOpen] = React.useState(false)
  const [autoDownloadEnabled, setAutoDownloadEnabled] = React.useState(() => readHomeAutoDownloadPrefs().enabled)
  const [autoDownloadFormat, setAutoDownloadFormat] = React.useState(() => readHomeAutoDownloadPrefs().format)
  const [isResolving, setIsResolving] = React.useState(false)
  const [fetchError, setFetchError] = React.useState(null)

  const {
    autoDownloadInFlight,
    autoDownloadProgress,
    autoDownloadProgressKnown,
    startAutoDownload,
  } = useAutoDownload({
    autoDownloadEnabled,
    autoDownloadFormat,
    multiModeEnabled,
    t,
    setIsResolving,
    setFetchError,
    clearInput: () => setValue(''),
    showNotification,
  })

  const interactionLocked = isResolving || autoDownloadInFlight

  const showAutoDownloadProgress = autoDownloadInFlight
  const normalizedAutoDownloadProgress = Math.max(0, Math.min(100, Math.round(autoDownloadProgress || 0)))

  const hasMultiInput = React.useMemo(
    () => String(value || '').replace(/\r/g, '').split('\n').some((line) => Boolean(line.trim())),
    [value]
  )

  const multiInputRows = React.useMemo(() => {
    if (!multiModeEnabled) return 1

    const lines = String(value || '').replace(/\r/g, '').split('\n')
    let lastFilledIndex = -1
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].trim()) lastFilledIndex = i
    }

    return Math.max(3, Math.min(5, lastFilledIndex + 2))
  }, [multiModeEnabled, value])

  const inputHeightEstimate = multiModeEnabled
    ? (136 + Math.max(0, multiInputRows - 3) * 24)
    : 56

  const resolveAndOpenDownloader = React.useCallback((rawUrl) => {
    const target = String(rawUrl || '').trim()
    const detectedService = detectService(target)
    if (!detectedService || !target || interactionLocked) return
    if (!isLikelyValidUrlFor(detectedService, target)) return

    setFetchError(null)
    onOpenDownloader?.(detectedService, target)
  }, [interactionLocked, onOpenDownloader])

  React.useEffect(() => {
    persistHomeAutoDownloadPrefs(autoDownloadEnabled, autoDownloadFormat)
  }, [autoDownloadEnabled, autoDownloadFormat])

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const onStorage = (event) => {
      if (event.key !== HOME_AUTO_PREFS_KEY) return
      const next = readHomeAutoDownloadPrefs()
      setAutoDownloadEnabled(next.enabled)
      setAutoDownloadFormat(next.format)
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const openQuickActions = React.useCallback((event) => {
    setMenuAnchorEl(event.currentTarget)
  }, [])

  const closeQuickActions = React.useCallback(() => {
    setMenuAnchorEl(null)
  }, [])

  const handleValueChange = React.useCallback((nextValue) => {
    if (fetchError) setFetchError(null)
    setValue(nextValue)
  }, [fetchError])

  const disableMultiModeNow = React.useCallback(() => {
    setConfirmDisableMultiOpen(false)
    setMultiModeEnabled(false)
    setValue('')
    setFetchError(null)
    setMenuAnchorEl(null)
  }, [])

  const requestToggleMultiMode = React.useCallback((nextEnabled) => {
    if (interactionLocked) return

    if (!nextEnabled) {
      if (!multiModeEnabled) return
      if (!hasMultiInput) {
        disableMultiModeNow()
        return
      }
      setConfirmDisableMultiOpen(true)
      setMenuAnchorEl(null)
      return
    }

    if (autoDownloadEnabled) setAutoDownloadEnabled(false)
    setMultiModeEnabled(true)
    setMenuAnchorEl(null)
  }, [autoDownloadEnabled, disableMultiModeNow, hasMultiInput, interactionLocked, multiModeEnabled])

  const handleToggleAutoDownload = React.useCallback((nextEnabled) => {
    if (interactionLocked) return
    if (nextEnabled && multiModeEnabled) {
      disableMultiModeNow()
    }
    setAutoDownloadEnabled(nextEnabled)
  }, [disableMultiModeNow, interactionLocked, multiModeEnabled])

  const handleSubmit = React.useCallback(() => {
    if (multiModeEnabled || interactionLocked) return

    if (autoDownloadEnabled) {
      startAutoDownload(value)
      return
    }

    const serviceKey = detectService(value)
    if (serviceKey) resolveAndOpenDownloader(value)
  }, [
    autoDownloadEnabled,
    interactionLocked,
    multiModeEnabled,
    resolveAndOpenDownloader,
    startAutoDownload,
    value,
  ])

  const handleSingleInputServiceDetected = React.useCallback((nextValue) => {
    if (autoDownloadEnabled) {
      setTimeout(() => startAutoDownload(nextValue), 0)
      return
    }
    setTimeout(() => resolveAndOpenDownloader(nextValue), 0)
  }, [autoDownloadEnabled, resolveAndOpenDownloader, startAutoDownload])

  const confirmDisableMultiMode = React.useCallback(() => {
    disableMultiModeNow()
  }, [disableMultiModeNow])

  const closeFetchError = React.useCallback(() => {
    setFetchError(null)
  }, [])

  const retryFetchError = React.useCallback(() => {
    const url = String(fetchError?.url || '').trim()
    if (!url || interactionLocked) return

    setFetchError(null)

    if (autoDownloadEnabled) {
      startAutoDownload(url)
      return
    }

    resolveAndOpenDownloader(url)
  }, [autoDownloadEnabled, fetchError?.url, interactionLocked, resolveAndOpenDownloader, startAutoDownload])

  const quickActionsTrigger = (
    <HomeQuickActions
      multiModeEnabled={multiModeEnabled}
      autoDownloadEnabled={autoDownloadEnabled}
      autoDownloadFormat={autoDownloadFormat}
      isResolving={interactionLocked}
      menuAnchorEl={menuAnchorEl}
      onOpenQuickActions={openQuickActions}
      onCloseQuickActions={closeQuickActions}
      onRequestToggleMultiMode={requestToggleMultiMode}
      onToggleAutoDownload={handleToggleAutoDownload}
      onSetAutoDownloadFormat={setAutoDownloadFormat}
      t={t}
    />
  )

  return (
    <Box sx={{ position: 'relative', height: '100%' }}>
      <Box sx={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '100%', maxWidth: 780, px: 2 }}>
        {multiModeEnabled ? (
          <HomeMultiInput
            value={value}
            onChange={handleValueChange}
            onSubmit={handleSubmit}
            isResolving={interactionLocked}
            quickActionsTrigger={quickActionsTrigger}
            showAutoDownloadProgress={showAutoDownloadProgress}
            autoDownloadProgressKnown={autoDownloadProgressKnown}
            normalizedAutoDownloadProgress={normalizedAutoDownloadProgress}
            inputBorderRunnerAnimation={INPUT_BORDER_RUNNER_ANIMATION}
            multiInputRows={multiInputRows}
            t={t}
          />
        ) : (
          <HomeSingleInput
            value={value}
            onChange={handleValueChange}
            onSubmit={handleSubmit}
            onServiceDetected={handleSingleInputServiceDetected}
            isResolving={interactionLocked}
            quickActionsTrigger={quickActionsTrigger}
            showAutoDownloadProgress={showAutoDownloadProgress}
            autoDownloadProgressKnown={autoDownloadProgressKnown}
            normalizedAutoDownloadProgress={normalizedAutoDownloadProgress}
            inputBorderRunnerAnimation={INPUT_BORDER_RUNNER_ANIMATION}
            t={t}
          />
        )}
      </Box>

      <Stack spacing={0} sx={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: `calc(50% + ${Math.round(inputHeightEstimate / 2)}px + 16px)`, width: '100%', maxWidth: 780, px: 2 }}>
        <Typography variant="h1" component="h1" align="center" className="youtube-title" sx={{ fontSize: { xs: '3.5rem', sm: '5rem', md: '6rem' } }}>
          <span style={{ color: '#df2f2f' }}>y</span>Loader
        </Typography>
        <Typography variant="h4" align="center" sx={{ color: 'text.secondary', fontWeight: 700, mt: 0.5, fontSize: { xs: '1.25rem', sm: '1.5rem', md: '1.75rem' } }}>
          {t('app.subtitle')}
        </Typography>
      </Stack>

      <Dialog open={confirmDisableMultiOpen} onClose={() => setConfirmDisableMultiOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('home.quickActions.multiDisableWarningTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('home.quickActions.multiDisableWarningBody')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDisableMultiOpen(false)}>{t('tabs.cancel')}</Button>
          <Button variant="contained" color="error" onClick={confirmDisableMultiMode}>
            {t('home.quickActions.multiDisableWarningConfirm')}
          </Button>
        </DialogActions>
      </Dialog>

      <HomeErrorOverlay
        fetchError={fetchError}
        isResolving={interactionLocked}
        onClose={closeFetchError}
        onRetry={retryFetchError}
        t={t}
      />
    </Box>
  )
}
