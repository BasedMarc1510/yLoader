import React from 'react'
import { Box, Typography, Button, Switch } from '@mui/material'
import { RefreshCw } from 'lucide-react'
import SettingRow from './SettingRow'
import SettingGroup from './SettingGroup'

export default function FfmpegSettingsSection({
  ffmpegInfo,
  updating,
  startUpdate,
  onToggleAutoUpdate,
  toolUpdateSettingsLoading,
  toolUpdateSettingsSaving,
  toolUpdateSettingsError,
  fetchFfmpegStatus,
  onCheckForUpdates,
  logRef,
  logLines,
  t,
}) {
  const updateInProgress = Boolean(updating || ffmpegInfo?.updateInProgress)
  const autoUpdateBusy = Boolean(toolUpdateSettingsLoading || toolUpdateSettingsSaving)
  const canRunUpdate = Boolean(ffmpegInfo?.outdated && ffmpegInfo?.updateSupported)
  const primaryActionIsUpdate = canRunUpdate
  const primaryActionDisabled = Boolean(ffmpegInfo.loading || updateInProgress || (primaryActionIsUpdate && !ffmpegInfo?.updateSupported))
  const handlePrimaryAction = primaryActionIsUpdate
    ? startUpdate
    : (onCheckForUpdates || (() => fetchFfmpegStatus?.({ forceLatest: true })))
  const primaryActionLabel = primaryActionIsUpdate
    ? (updateInProgress ? t('settings.updating') : t('settings.updateNow'))
    : (ffmpegInfo.loading ? t('settings.checking') : t('settings.checkForUpdates'))

  return (
    <Box sx={{ px: 4, pt: 4, pb: 4, opacity: updateInProgress || autoUpdateBusy ? 0.6 : 1, pointerEvents: updateInProgress || autoUpdateBusy ? 'none' : 'auto' }}>
      
      {updateInProgress && (
        <SettingGroup title={t('settings.updateLogs')} sx={{ mb: 4 }}>
          <Box
            ref={logRef}
            sx={(th) => ({
              fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
              fontSize: 12,
              p: 1.5,
              color: '#d4d4d4',
              bgcolor: 'transparent',
              height: 240,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
              '&::-webkit-scrollbar': { width: 5 },
              '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
              '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(150,150,150,0.3)', borderRadius: '3px' },
            })}
          >
            {!Array.isArray(logLines) || logLines.length === 0 ? (
              <span style={{ color: 'text.disabled', fontStyle: 'italic' }}>
                {t('settings.readyToUpdate')}
              </span>
            ) : (
              logLines.map((line, index) => (
                <div
                  key={index}
                  style={{
                    marginBottom: 2,
                    color: String(line || '').includes('ERROR') ? '#f87171' : undefined,
                  }}
                >
                  {line}
                </div>
              ))
            )}
          </Box>
        </SettingGroup>
      )}

      <SettingGroup>
        <SettingRow
          label={t('settings.autoUpdateEnabled')}
          description={t('settings.autoUpdateEnabledDesc')}
        >
          <Switch
            checked={ffmpegInfo?.autoUpdateEnabled !== false}
            onChange={(event) => onToggleAutoUpdate?.(event.target.checked)}
            disabled={autoUpdateBusy}
          />
        </SettingRow>

        <SettingRow label={t('settings.ffmpegStatus')}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: ffmpegInfo.loading
                  ? '#9ca3af'
                  : !ffmpegInfo.available
                    ? '#ef4444'
                    : updateInProgress
                      ? '#60a5fa'
                      : ffmpegInfo.outdated
                        ? '#f59e0b'
                        : '#22c55e',
                flexShrink: 0,
              }}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {ffmpegInfo.loading
                ? t('settings.checking')
                : !ffmpegInfo.available
                  ? t('settings.ffmpegMissing')
                  : updateInProgress
                    ? t('settings.updating')
                    : ffmpegInfo.outdated
                      ? t('settings.updateAvailable')
                      : t('settings.ffmpegAvailable')}
            </Typography>
          </Box>
        </SettingRow>

        <SettingRow label={t('settings.ffmpegVersion')}>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
            {ffmpegInfo.loading ? '…' : ffmpegInfo.version}
          </Typography>
        </SettingRow>

        <SettingRow label={t('settings.ffmpegPath')}>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary', maxWidth: 380, textAlign: 'right', wordBreak: 'break-all' }}>
            {ffmpegInfo.loading ? '…' : ffmpegInfo.path}
          </Typography>
        </SettingRow>

        <SettingRow label={t('settings.ffmpegBinarySize')}>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
            {ffmpegInfo.loading ? '…' : ffmpegInfo.fileSize}
          </Typography>
        </SettingRow>

        <SettingRow label={t('settings.latestVersion')}>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
            {ffmpegInfo.loading ? '…' : ffmpegInfo.latestVersion}
          </Typography>
        </SettingRow>

        <SettingRow label={t('settings.projectManagedFfmpeg')}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {ffmpegInfo.projectManaged ? t('settings.yes') : t('settings.no')}
          </Typography>
        </SettingRow>

        <SettingRow label={t('settings.checkForUpdates')} noDivider>
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
      </SettingGroup>

      {toolUpdateSettingsError && (
        <Box
          sx={(th) => ({
            mt: 2,
            px: 2,
            py: 1.25,
            borderRadius: '4px',
            bgcolor: th.palette.mode === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
          })}
        >
          <Typography variant="body2" sx={{ color: '#f87171', fontWeight: 500, fontSize: 13 }}>
            {toolUpdateSettingsError}
          </Typography>
        </Box>
      )}

      {ffmpegInfo.error && (
        <Box
          sx={(th) => ({
            mt: 2,
            px: 2,
            py: 1.25,
            borderRadius: '4px',
            bgcolor: th.palette.mode === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
          })}
        >
          <Typography variant="body2" sx={{ color: '#f87171', fontWeight: 500, fontSize: 13 }}>
            {ffmpegInfo.error}
          </Typography>
        </Box>
      )}

    </Box>
  )
}
