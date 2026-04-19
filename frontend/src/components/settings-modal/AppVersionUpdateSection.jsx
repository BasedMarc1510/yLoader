import React from 'react'
import {
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Switch,
  Typography,
} from '@mui/material'
import SettingRow from './SettingRow'
import SettingGroup from './SettingGroup'

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

function resolveFriendlyUpdaterError(rawMessage, t) {
  const message = String(rawMessage || '').trim()
  if (!message) return t('settings.appUpdateUnknownError')

  const lowered = message.toLowerCase()

  if (lowered.includes('timeout') || lowered.includes('timed out') || lowered.includes('etimedout')) {
    return t('settings.appUpdateErrorTimeout')
  }

  if (
    lowered.includes('getaddrinfo')
    || lowered.includes('enotfound')
    || lowered.includes('econnrefused')
    || lowered.includes('failed to fetch')
    || lowered.includes('network')
  ) {
    return t('settings.appUpdateErrorNetwork')
  }

  if (lowered.includes('rate limit') || lowered.includes('429')) {
    return t('settings.appUpdateErrorRateLimit')
  }

  if (lowered.includes('authentication token') || lowered.includes('unauthorized') || lowered.includes('401')) {
    return t('settings.appUpdateErrorAuth')
  }

  if (lowered.includes('releases.atom') && lowered.includes('404')) {
    return t('settings.appUpdateErrorRepositoryUnavailable')
  }

  if (lowered.includes('404')) {
    return t('settings.appUpdateErrorNotFound')
  }

  const firstLine = message.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || ''
  if (!firstLine) return t('settings.appUpdateUnknownError')
  if (firstLine.length <= 180) return firstLine
  return `${firstLine.slice(0, 177)}...`
}

export default function AppVersionUpdateSection({
  t,
  appUpdateState,
  isElectronUpdaterAvailable,
  checkForAppUpdates,
  downloadAppUpdate,
  installAppUpdate,
  setAppAutoUpdateEnabled,
}) {
  const actionLockRef = React.useRef(false)
  const [runningAction, setRunningAction] = React.useState('')

  const phase = String(appUpdateState?.phase || 'idle').trim()
  const canCheckForUpdates = Boolean(appUpdateState?.canCheckForUpdates)
  const canAutoUpdate = Boolean(isElectronUpdaterAvailable && appUpdateState?.canAutoUpdate)
  const manualDownloadOnly = Boolean(appUpdateState?.manualDownloadOnly)
  const deploymentTarget = String(appUpdateState?.deploymentTarget || '').trim().toLowerCase()
  const isDockerDeployment = !isElectronUpdaterAvailable && deploymentTarget === 'docker'
  const autoUpdateEnabled = Boolean(appUpdateState?.autoUpdateEnabled !== false)
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
  const isAutoUpdateSwitchVisible = Boolean(isElectronUpdaterAvailable && canAutoUpdate)

  const statusText = React.useMemo(() => {
    if (!canCheckForUpdates) {
      return isElectronUpdaterAvailable
        ? t('settings.appUpdateNotSupported')
        : t('settings.appUpdateLocalVersionOnly')
    }
    if (isChecking) return t('settings.appUpdateChecking')
    if (isUpdateAvailable) {
      return manualDownloadOnly
        ? t('settings.appUpdateAvailableVersionManual', { version: versionText })
        : t('settings.appUpdateAvailableVersion', { version: versionText })
    }
    if (isDownloading) return t('settings.appUpdateDownloading')
    if (isReadyToInstall) return t('settings.appUpdateReady')
    if (isError) {
      const message = resolveFriendlyUpdaterError(appUpdateState?.error, t)
      return t('settings.appUpdateError', { message })
    }
    if (isUpToDate) return t('settings.appUpdateUpToDate')
    return t('settings.appUpdateIdle')
  }, [
    appUpdateState?.error,
    canCheckForUpdates,
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

  const showCheckButton = canCheckForUpdates
    && !isChecking
    && !isUpdateAvailable
    && !isDownloading
    && !isReadyToInstall
  const showDownloadButton = canCheckForUpdates && isUpdateAvailable
  const showInstallButton = canAutoUpdate && isReadyToInstall
  const showVersionOnly = !isElectronUpdaterAvailable && !canCheckForUpdates

  const isActionRunning = Boolean(runningAction)
  const transferredLabel = formatMegabytes(transferredBytes, t)
  const totalLabel = totalBytes > 0 ? formatMegabytes(totalBytes, t) : t('settings.appUpdateUnknownSize')
  const speedLabel = formatSpeed(speedBytesPerSecond, t)

  if (showVersionOnly) {
    return (
      <SettingGroup title={t('settings.appUpdateTitle')}>
        <SettingRow label={t('settings.appVersion')} noDivider>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {currentVersion}
          </Typography>
        </SettingRow>
      </SettingGroup>
    )
  }

  return (
    <SettingGroup title={t('settings.appUpdateTitle')}>
      <SettingRow label={t('settings.appVersion')}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {currentVersion}
        </Typography>
      </SettingRow>

      {isAutoUpdateSwitchVisible && (
        <SettingRow
          label={t('settings.appUpdateAutoEnabled')}
          description={t('settings.appUpdateAutoEnabledDesc')}
        >
          <Switch
            checked={autoUpdateEnabled}
            disabled={isActionRunning || isChecking || isDownloading}
            onChange={(event) => runAction('toggle-auto-update', () => setAppAutoUpdateEnabled?.(event.target.checked))}
          />
        </SettingRow>
      )}

      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 24 }}>
          {isChecking && <CircularProgress size={15} />}
          <Typography variant="body2" sx={{ fontSize: 13.5 }}>
            {statusText}
          </Typography>
        </Box>

        {manualDownloadOnly && (
          <Typography variant="caption" sx={{ mt: 0.75, display: 'block', color: 'text.secondary' }}>
            {isDockerDeployment ? t('settings.appUpdateDockerManualHint') : t('settings.appUpdateManualMacHint')}
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
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '8px', transition: 'none' }}
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
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '8px', transition: 'none', boxShadow: 'none' }}
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
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '8px', transition: 'none', boxShadow: 'none' }}
            >
              {t('settings.appUpdateInstallButton')}
            </Button>
          )}
        </Box>
      </Box>
    </SettingGroup>
  )
}
