import React from 'react'
import {
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Typography,
} from '@mui/material'
import SettingRow from './SettingRow'

const MB_IN_BYTES = 1024 * 1024

function toSafeNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function formatMegabytes(bytes, t) {
  const safeBytes = Math.max(0, toSafeNumber(bytes))
  const megabytes = safeBytes / MB_IN_BYTES
  const value = megabytes >= 100 ? megabytes.toFixed(0) : megabytes.toFixed(1)
  return t('settings.appUpdateSizeMb', { value })
}

function formatSpeed(bytesPerSecond, t) {
  const safeBytes = Math.max(0, toSafeNumber(bytesPerSecond))
  const megabytes = safeBytes / MB_IN_BYTES
  const value = megabytes >= 100 ? megabytes.toFixed(0) : megabytes.toFixed(1)
  return t('settings.appUpdateSpeedMb', { value })
}

export default function AppVersionUpdateSection({
  t,
  appUpdateState,
  isElectronUpdaterAvailable,
  checkForAppUpdates,
  downloadAppUpdate,
  installAppUpdate,
}) {
  const actionLockRef = React.useRef(false)
  const [runningAction, setRunningAction] = React.useState('')

  const phase = String(appUpdateState?.phase || 'idle').trim()
  const canCheckForUpdates = Boolean(isElectronUpdaterAvailable && appUpdateState?.canCheckForUpdates)
  const canAutoUpdate = Boolean(isElectronUpdaterAvailable && appUpdateState?.canAutoUpdate)
  const manualDownloadOnly = Boolean(isElectronUpdaterAvailable && appUpdateState?.manualDownloadOnly)
  const releasePageUrl = String(appUpdateState?.releasePageUrl || '').trim()
  const currentVersion = String(appUpdateState?.currentVersion || '-').trim() || '-'
  const targetVersion = String(appUpdateState?.availableVersion || appUpdateState?.downloadedVersion || '').trim()
  const versionText = targetVersion || t('settings.appUpdateVersionUnknown')

  const progress = appUpdateState?.progress || {}
  const progressPercent = Math.min(Math.max(toSafeNumber(progress.percent), 0), 100)
  const transferredBytes = Math.max(0, toSafeNumber(progress.transferred))
  const totalBytes = Math.max(0, toSafeNumber(progress.total))
  const speedBytesPerSecond = Math.max(0, toSafeNumber(progress.bytesPerSecond))

  const isChecking = phase === 'checking'
  const isUpdateAvailable = phase === 'update-available'
  const isDownloading = phase === 'downloading'
  const isReadyToInstall = phase === 'downloaded'
  const isUpToDate = phase === 'up-to-date'
  const isError = phase === 'error'

  const statusText = React.useMemo(() => {
    if (!isElectronUpdaterAvailable) return t('settings.appUpdateWebVersionOnly')
    if (!canCheckForUpdates) return t('settings.appUpdateNotSupported')
    if (isChecking) return t('settings.appUpdateChecking')
    if (isUpdateAvailable) {
      return manualDownloadOnly
        ? t('settings.appUpdateAvailableVersionManual', { version: versionText })
        : t('settings.appUpdateAvailableVersion', { version: versionText })
    }
    if (isDownloading) return t('settings.appUpdateDownloading')
    if (isReadyToInstall) return t('settings.appUpdateReady')
    if (isError) {
      const message = String(appUpdateState?.error || '').trim() || t('settings.appUpdateUnknownError')
      return t('settings.appUpdateError', { message })
    }
    if (isUpToDate) return t('settings.appUpdateUpToDate')
    return t('settings.appUpdateIdle')
  }, [
    appUpdateState?.error,
    canCheckForUpdates,
    canAutoUpdate,
    isChecking,
    isDownloading,
    isElectronUpdaterAvailable,
    isError,
    manualDownloadOnly,
    isReadyToInstall,
    isUpdateAvailable,
    isUpToDate,
    t,
    versionText,
  ])

  const runAction = React.useCallback(async (actionName, action) => {
    if (actionLockRef.current) return
    if (typeof action !== 'function') return

    actionLockRef.current = true
    setRunningAction(actionName)

    try {
      await Promise.resolve(action())
    } finally {
      actionLockRef.current = false
      setRunningAction('')
    }
  }, [])

  if (!isElectronUpdaterAvailable) {
    return (
      <Box sx={{ pt: 1 }}>
        <SettingRow label={t('settings.appVersion')} noDivider>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {currentVersion}
          </Typography>
        </SettingRow>
      </Box>
    )
  }

  const showCheckButton = canCheckForUpdates
    && !isChecking
    && !isUpdateAvailable
    && !isDownloading
    && !isReadyToInstall
  const showDownloadButton = canCheckForUpdates && isUpdateAvailable
  const showInstallButton = canAutoUpdate && isReadyToInstall

  const isActionRunning = Boolean(runningAction)
  const transferredLabel = formatMegabytes(transferredBytes, t)
  const totalLabel = totalBytes > 0 ? formatMegabytes(totalBytes, t) : t('settings.appUpdateUnknownSize')
  const speedLabel = formatSpeed(speedBytesPerSecond, t)

  return (
    <Box sx={{ pt: 1 }}>
      <SettingRow label={t('settings.appVersion')} noDivider>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {currentVersion}
        </Typography>
      </SettingRow>

      <Box sx={{ mt: 1.5, p: 1.5, borderRadius: '6px', border: (theme) => `1px solid ${theme.palette.divider}` }}>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
          {t('settings.appUpdateTitle')}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 24 }}>
          {isChecking && <CircularProgress size={15} />}
          <Typography variant="body2" sx={{ fontSize: 13.5 }}>
            {statusText}
          </Typography>
        </Box>

        {manualDownloadOnly && (
          <Typography variant="caption" sx={{ mt: 0.75, display: 'block', color: 'text.secondary' }}>
            {t('settings.appUpdateManualMacHint')}
          </Typography>
        )}

        {manualDownloadOnly && releasePageUrl && (
          <Typography variant="caption" sx={{ mt: 0.25, display: 'block', color: 'text.secondary', wordBreak: 'break-all' }}>
            {releasePageUrl}
          </Typography>
        )}

        {isDownloading && (
          <Box sx={{ mt: 1.25 }}>
            <LinearProgress
              variant="determinate"
              value={progressPercent}
              sx={{
                height: 7,
                borderRadius: '999px',
                bgcolor: 'action.hover',
                '& .MuiLinearProgress-bar': { borderRadius: '999px' },
              }}
            />
            <Typography variant="caption" sx={{ mt: 0.75, display: 'block', color: 'text.secondary' }}>
              {t('settings.appUpdateDownloadProgress', {
                percent: progressPercent.toFixed(1),
                transferred: transferredLabel,
                total: totalLabel,
                speed: speedLabel,
              })}
            </Typography>
          </Box>
        )}

        {appUpdateState?.closeBlocked && (
          <Typography variant="caption" sx={{ mt: 0.75, display: 'block', color: 'warning.main' }}>
            {t('settings.appUpdateCloseBlocked')}
          </Typography>
        )}

        <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end', minHeight: 32 }}>
          {showCheckButton && (
            <Button
              variant="outlined"
              size="small"
              disabled={isActionRunning}
              onClick={() => runAction('check', checkForAppUpdates)}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '4px', transition: 'none' }}
            >
              {t('settings.appUpdateCheckButton')}
            </Button>
          )}

          {showDownloadButton && (
            <Button
              variant="contained"
              size="small"
              disabled={isActionRunning}
              onClick={() => runAction('download', downloadAppUpdate)}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '4px', transition: 'none' }}
            >
              {manualDownloadOnly ? t('settings.appUpdateOpenReleaseButton') : t('settings.appUpdateDownloadButton')}
            </Button>
          )}

          {showInstallButton && (
            <Button
              variant="contained"
              size="small"
              disabled={isActionRunning}
              onClick={() => runAction('install', installAppUpdate)}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '4px', transition: 'none' }}
            >
              {t('settings.appUpdateInstallButton')}
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  )
}
