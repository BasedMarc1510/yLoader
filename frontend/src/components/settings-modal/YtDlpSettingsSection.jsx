import React from 'react'
import { Box, Typography, Button, Switch } from '@mui/material'
import { RefreshCw } from 'lucide-react'
import SettingRow from './SettingRow'
import SettingGroup from './SettingGroup'
import YtDlpCookieSettingsSection from './YtDlpCookieSettingsSection'
import SimpleBarScrollArea from '../SimpleBarScrollArea'

export default function YtDlpSettingsSection({
  ytInfo,
  autoUpdateEnabled,
  updating,
  startUpdate,
  onToggleAutoUpdate,
  toolUpdateSettingsLoading,
  toolUpdateSettingsSaving,
  toolUpdateSettingsError,
  fetchStatus,
  onCheckForUpdates,
  logRef,
  logLines,
  cookieSettings,
  cookieSettingsLoading,
  cookieSettingsSaving,
  cookieSettingsError,
  onUpdateCookieSettings,
  onRefreshCookieSettings,
  requestedFocusTarget,
  requestedFocusRequestId,
  t,
}) {
  const localLoading = Boolean(ytInfo?.localLoading)
  const latestLoading = Boolean(ytInfo?.latestLoading)
  const latestSource = String(ytInfo?.latestSource || 'none').trim() || 'none'
  const latestKnown = latestSource !== 'none'
  const hasLocalCurrent = Boolean(String(ytInfo?.currentVersion || '').trim() && String(ytInfo?.currentVersion || '').trim() !== '-')
  const hasLocalPath = Boolean(String(ytInfo?.binaryPath || '').trim() && String(ytInfo?.binaryPath || '').trim() !== '-')
  const hasLocalSize = Boolean(String(ytInfo?.binarySize || '').trim() && String(ytInfo?.binarySize || '').trim() !== '-')
  const updateInProgress = Boolean(updating || ytInfo?.updateInProgress)
  const autoUpdateBusy = Boolean(toolUpdateSettingsLoading || toolUpdateSettingsSaving)
  const canRunUpdate = Boolean(latestKnown && ytInfo?.outdated && ytInfo?.updateSupported)
  const primaryActionIsUpdate = canRunUpdate
  const primaryActionDisabled = Boolean(localLoading || latestLoading || updateInProgress || (primaryActionIsUpdate && !ytInfo?.updateSupported))
  const handlePrimaryAction = primaryActionIsUpdate
    ? startUpdate
    : (onCheckForUpdates || (() => fetchStatus?.({ forceLatest: true })))
  const primaryActionLabel = primaryActionIsUpdate
    ? (updateInProgress ? t('settings.updating') : t('settings.updateNow'))
    : (latestLoading ? t('settings.checking') : t('settings.checkForUpdates'))
  const switchChecked = typeof autoUpdateEnabled === 'boolean'
    ? autoUpdateEnabled
    : ytInfo?.autoUpdateEnabled !== false

  return (
    <Box sx={{ px: 4, pt: 4, pb: 4, opacity: updateInProgress ? 0.6 : 1, pointerEvents: updateInProgress ? 'none' : 'auto' }}>
      
      {updateInProgress && (
        <SettingGroup title={t('settings.updateLogs')} sx={{ mb: 4 }}>
          <SimpleBarScrollArea
            fillContainer={false}
            hideHorizontal
            scrollableNodeProps={{ ref: logRef }}
            sx={(th) => ({
              fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
              fontSize: 12,
              p: 1.5,
              color: '#d4d4d4',
              bgcolor: 'transparent',
              height: 240,
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
            })}
          >
            {logLines.length === 0 ? (
              <span style={{ color: 'text.disabled', fontStyle: 'italic' }}>
                {t('settings.readyToUpdate')}
              </span>
            ) : (
              logLines.map((line, index) => (
                <div
                  key={index}
                  style={{
                    marginBottom: 2,
                    color: line.includes('ERROR') ? '#f87171' : undefined,
                  }}
                >
                  {line}
                </div>
              ))
            )}
          </SimpleBarScrollArea>
        </SettingGroup>
      )}

      <SettingGroup>
        <SettingRow
          label={t('settings.autoUpdateEnabled')}
          description={t('settings.autoUpdateEnabledDesc')}
        >
          <Switch
            checked={switchChecked}
            onChange={(event) => onToggleAutoUpdate?.(event.target.checked)}
            disabled={autoUpdateBusy}
          />
        </SettingRow>

        <SettingRow label={t('settings.currentVersion')}>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
            {(localLoading && !hasLocalCurrent) ? '...' : ytInfo.currentVersion}
          </Typography>
        </SettingRow>

        <SettingRow label={t('settings.latestVersion')}>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
            {(latestLoading && !latestKnown) ? '...' : ytInfo.latestVersion}
          </Typography>
        </SettingRow>

        <SettingRow label={t('settings.ytDlpPath')}>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary', maxWidth: 380, textAlign: 'right', wordBreak: 'break-all' }}>
            {(localLoading && !hasLocalPath) ? '...' : ytInfo.binaryPath}
          </Typography>
        </SettingRow>

        <SettingRow label={t('settings.ytDlpBinarySize')}>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
            {(localLoading && !hasLocalSize) ? '...' : ytInfo.binarySize}
          </Typography>
        </SettingRow>

        <SettingRow label={t('settings.checkForUpdates')}>
          <Button
            onClick={handlePrimaryAction}
            disabled={primaryActionDisabled}
            variant="outlined"
            size="small"
            startIcon={<RefreshCw size={13} />}
            sx={{
              textTransform: 'none',
              fontSize: 13,
              borderRadius: '8px',
              height: 32,
              borderColor: 'divider',
              color: 'text.primary',
              transition: 'none',
              '&:hover': { borderColor: 'text.disabled', bgcolor: 'action.hover' },
            }}
          >
            {primaryActionLabel}
          </Button>
        </SettingRow>

        <SettingRow label={t('settings.updateNow')} noDivider>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: !ytInfo.updateSupported ? '#9ca3af' : updateInProgress ? '#60a5fa' : ytInfo.outdated ? '#f59e0b' : '#22c55e',
                flexShrink: 0,
              }}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary', mr: 1 }}>
              {!ytInfo.updateSupported
                ? t('settings.updateManagedExternally')
                : updateInProgress
                  ? t('settings.updating')
                  : (!latestKnown || latestLoading)
                    ? t('settings.checking')
                    : ytInfo.outdated
                      ? t('settings.updateAvailable')
                      : t('settings.upToDate')}
            </Typography>
          </Box>
        </SettingRow>
      </SettingGroup>

      <YtDlpCookieSettingsSection
        cookieSettings={cookieSettings}
        cookieSettingsLoading={cookieSettingsLoading}
        cookieSettingsSaving={cookieSettingsSaving}
        cookieSettingsError={cookieSettingsError}
        onUpdateCookieSettings={onUpdateCookieSettings}
        onRefreshCookieSettings={onRefreshCookieSettings}
        requestedFocusTarget={requestedFocusTarget}
        requestedFocusRequestId={requestedFocusRequestId}
        t={t}
      />

      {toolUpdateSettingsError && (
        <Box sx={(th) => ({
          mt: 1,
          mb: 1,
          px: 2,
          py: 1.25,
          borderRadius: '4px',
          bgcolor: th.palette.mode === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
        })}>
          <Typography variant="body2" sx={{ color: '#f87171', fontWeight: 500, fontSize: 13 }}>{toolUpdateSettingsError}</Typography>
        </Box>
      )}

      {ytInfo.error && (
        <Box sx={(th) => ({
          mt: 1,
          mb: 1,
          px: 2,
          py: 1.25,
          borderRadius: '4px',
          bgcolor: th.palette.mode === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
        })}>
          <Typography variant="body2" sx={{ color: '#f87171', fontWeight: 500, fontSize: 13 }}>{ytInfo.error}</Typography>
        </Box>
      )}

    </Box>
  )
}
