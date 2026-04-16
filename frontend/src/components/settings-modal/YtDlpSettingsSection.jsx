import React from 'react'
import { Box, Typography, Button, Switch } from '@mui/material'
import { RefreshCw } from 'lucide-react'
import SettingRow from './SettingRow'

export default function YtDlpSettingsSection({
  ytInfo,
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

  return (
    <Box sx={{ px: 3, pt: 1, pb: 3 }}>
      <SettingRow
        label={t('settings.autoUpdateEnabled')}
        description={t('settings.autoUpdateEnabledDesc')}
      >
        <Switch
          checked={ytInfo?.autoUpdateEnabled !== false}
          onChange={(event) => onToggleAutoUpdate?.(event.target.checked)}
          disabled={autoUpdateBusy}
        />
      </SettingRow>

      <SettingRow label={t('settings.currentVersion')}>
        <Typography sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
          {(localLoading && !hasLocalCurrent) ? '…' : ytInfo.currentVersion}
        </Typography>
      </SettingRow>

      <SettingRow label={t('settings.latestVersion')}>
        <Typography sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
          {(latestLoading && !latestKnown) ? '…' : ytInfo.latestVersion}
        </Typography>
      </SettingRow>

      <SettingRow label={t('settings.ytDlpPath')}>
        <Typography sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary', maxWidth: 380, textAlign: 'right', wordBreak: 'break-all' }}>
          {(localLoading && !hasLocalPath) ? '…' : ytInfo.binaryPath}
        </Typography>
      </SettingRow>

      <SettingRow label={t('settings.ytDlpBinarySize')}>
        <Typography sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
          {(localLoading && !hasLocalSize) ? '…' : ytInfo.binarySize}
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
            borderRadius: '4px',
            height: 32,
            borderColor: 'divider',
            color: 'text.primary',
            '&:hover': { borderColor: 'text.disabled', bgcolor: 'action.hover' },
          }}
        >
          {primaryActionLabel}
        </Button>
      </SettingRow>

      <SettingRow label={t('settings.updateNow')}>
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

      <Box sx={{ mt: 2 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'text.disabled', letterSpacing: '0.08em', mb: 1, textTransform: 'uppercase' }}>
          {t('settings.updateLogs')}
        </Typography>
        <Box
          ref={logRef}
          sx={(th) => ({
            fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
            fontSize: 12,
            p: 1.5,
            bgcolor: th.palette.mode === 'dark' ? '#111111' : '#1e1e1e',
            color: '#d4d4d4',
            borderRadius: '4px',
            border: `1px solid ${th.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'transparent'}`,
            height: 180,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.6,
            '&::-webkit-scrollbar': { width: 5 },
            '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
            '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.15)', borderRadius: '3px' },
          })}
        >
          {logLines.length === 0 ? (
            <span style={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
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
        </Box>
      </Box>
    </Box>
  )
}
