import React from 'react'
import { Box, Typography, Button, Switch, CircularProgress } from '@mui/material'
import { Video, Cpu, ChevronRight, RefreshCw, ArrowLeft } from 'lucide-react'
import SettingRow from './SettingRow'
import SettingGroup from './SettingGroup'
import SettingsBreadcrumb from './SettingsBreadcrumb'
import TerminalOutput from './TerminalOutput'

/**
 * Status badge component for dependency cards.
 */
function StatusBadge({ status, label }) {
  const colorMap = {
    loading: '#9ca3af',
    missing: '#ef4444',
    updating: '#60a5fa',
    outdated: '#f59e0b',
    current: '#22c55e',
    unsupported: '#9ca3af',
  }
  const color = colorMap[status] || '#9ca3af'

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
        {label}
      </Typography>
    </Box>
  )
}

/**
 * Clickable card for dependency overview.
 */
function DependencyCard({ icon: Icon, name, version, statusElement, hasUpdate, onClick, t }) {
  return (
    <Box
      onClick={onClick}
      sx={(theme) => ({
        flex: '1 1 0',
        minWidth: 200,
        p: 2.5,
        borderRadius: '12px',
        bgcolor: theme.palette.mode === 'dark' ? '#1c1c1e' : '#ffffff',
        border: `1px solid ${hasUpdate ? 'rgba(245,158,11,0.4)' : theme.palette.divider}`,
        cursor: 'pointer',
        transition: 'border-color 180ms ease, box-shadow 180ms ease',
        '&:hover': {
          borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
          boxShadow: theme.palette.mode === 'dark'
            ? '0 4px 16px rgba(0,0,0,0.3)'
            : '0 4px 16px rgba(0,0,0,0.08)',
        },
      })}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={(theme) => ({
            width: 36, height: 36, borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
          })}>
            <Icon size={20} strokeWidth={2} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: 15 }}>{name}</Typography>
            <Typography sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary', fontWeight: 500 }}>
              {version}
            </Typography>
          </Box>
        </Box>
        <ChevronRight size={18} style={{ color: '#8e8e93' }} />
      </Box>
      {statusElement}
      {hasUpdate && (
        <Box sx={(theme) => ({
          mt: 1.5, px: 1.5, py: 0.5, borderRadius: '6px',
          bgcolor: theme.palette.mode === 'dark' ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.08)',
          display: 'inline-flex',
        })}>
          <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: '#f59e0b' }}>
            {t('settings.updateAvailable')}
          </Typography>
        </Box>
      )}
    </Box>
  )
}

/**
 * Detail view for a single dependency (yt-dlp or ffmpeg).
 */
function DependencyDetail({
  tool,
  info,
  autoUpdateEnabled,
  updating,
  startUpdate,
  onToggleAutoUpdate,
  toolUpdateSettingsLoading,
  toolUpdateSettingsSaving,
  toolUpdateSettingsError,
  onCheckForUpdates,
  logLines,
  t,
}) {
  const updateInProgress = Boolean(updating || info?.updateInProgress)
  const autoUpdateBusy = Boolean(toolUpdateSettingsLoading || toolUpdateSettingsSaving)
  const canRunUpdate = Boolean(info?.outdated && info?.updateSupported)
  const primaryActionIsUpdate = canRunUpdate
  const primaryActionDisabled = Boolean(info.loading || updateInProgress || (primaryActionIsUpdate && !info?.updateSupported))
  const handlePrimaryAction = primaryActionIsUpdate ? startUpdate : onCheckForUpdates
  const primaryActionLabel = primaryActionIsUpdate
    ? (updateInProgress ? t('settings.updating') : t('settings.updateNow'))
    : (info.loading ? t('settings.checking') : t('settings.checkForUpdates'))
  const switchChecked = typeof autoUpdateEnabled === 'boolean'
    ? autoUpdateEnabled
    : info?.autoUpdateEnabled !== false

  const resolveStatus = () => {
    if (info.loading) return { status: 'loading', label: t('settings.checking') }
    if (tool === 'ffmpeg' && !info.available) return { status: 'missing', label: t('settings.ffmpegMissing') }
    if (!info.updateSupported) return { status: 'unsupported', label: t('settings.updateManagedExternally') }
    if (updateInProgress) return { status: 'updating', label: t('settings.updating') }
    if (info.outdated) return { status: 'outdated', label: t('settings.updateAvailable') }
    return { status: 'current', label: tool === 'ffmpeg' ? t('settings.ffmpegAvailable') : t('settings.upToDate') }
  }
  const { status, label } = resolveStatus()

  const versionLabel = tool === 'ffmpeg' ? t('settings.ffmpegVersion') : t('settings.currentVersion')
  const versionValue = tool === 'ffmpeg' ? info.version : info.currentVersion
  const pathLabel = tool === 'ffmpeg' ? t('settings.ffmpegPath') : t('settings.ytDlpPath')
  const pathValue = tool === 'ffmpeg' ? info.path : info.binaryPath
  const sizeLabel = tool === 'ffmpeg' ? t('settings.ffmpegBinarySize') : t('settings.ytDlpBinarySize')
  const sizeValue = tool === 'ffmpeg' ? info.fileSize : info.binarySize
  const latestVersion = info.latestVersion || '-'

  return (
    <Box sx={{ px: 4, pt: 1, pb: 4 }}>
      {/* Terminal — always visible when update in progress */}
      {updateInProgress && (
        <Box sx={{ mb: 3 }}>
          <TerminalOutput
            lines={logLines}
            isRunning={updateInProgress}
            emptyLabel={t('settings.readyToUpdate')}
            height={220}
          />
        </Box>
      )}

      <SettingGroup>
        <SettingRow label={t('settings.systemStatus')}>
          <StatusBadge status={status} label={label} />
        </SettingRow>

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

        <SettingRow label={versionLabel}>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
            {info.loading ? '...' : versionValue}
          </Typography>
        </SettingRow>

        <SettingRow label={t('settings.latestVersion')}>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
            {info.loading ? '...' : latestVersion}
          </Typography>
        </SettingRow>

        <SettingRow label={pathLabel}>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary', maxWidth: 340, textAlign: 'right', wordBreak: 'break-all' }}>
            {info.loading ? '...' : pathValue}
          </Typography>
        </SettingRow>

        <SettingRow label={sizeLabel}>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
            {info.loading ? '...' : sizeValue}
          </Typography>
        </SettingRow>

        <SettingRow label={t('settings.systemActions')} noDivider>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              onClick={handlePrimaryAction}
              disabled={primaryActionDisabled}
              variant={primaryActionIsUpdate ? 'contained' : 'outlined'}
              size="small"
              startIcon={updateInProgress ? <CircularProgress size={13} /> : <RefreshCw size={13} />}
              sx={{
                textTransform: 'none',
                fontSize: 13,
                borderRadius: '8px',
                height: 32,
                borderColor: 'divider',
                color: primaryActionIsUpdate ? undefined : 'text.primary',
                transition: 'none',
                boxShadow: 'none',
                '&:hover': primaryActionIsUpdate ? {} : { borderColor: 'text.disabled', bgcolor: 'action.hover' },
              }}
            >
              {primaryActionLabel}
            </Button>
          </Box>
        </SettingRow>
      </SettingGroup>

      {/* Error banners */}
      {toolUpdateSettingsError && (
        <Box sx={(th) => ({
          mt: 2, px: 2, py: 1.25, borderRadius: '4px',
          bgcolor: th.palette.mode === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
        })}>
          <Typography variant="body2" sx={{ color: '#f87171', fontWeight: 500, fontSize: 13 }}>
            {toolUpdateSettingsError}
          </Typography>
        </Box>
      )}
      {info.error && (
        <Box sx={(th) => ({
          mt: 2, px: 2, py: 1.25, borderRadius: '4px',
          bgcolor: th.palette.mode === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
        })}>
          <Typography variant="body2" sx={{ color: '#f87171', fontWeight: 500, fontSize: 13 }}>
            {info.error}
          </Typography>
        </Box>
      )}
    </Box>
  )
}

/**
 * System & Dependencies section.
 * - Overview mode: two clickable cards (yt-dlp, ffmpeg)
 * - Detail mode: drill-in with breadcrumb
 */
export default function SystemSettingsSection({
  activeDetail,
  onNavigateToDetail,
  onNavigateBack,
  ytInfo,
  ffmpegInfo,
  ytAutoUpdateEnabled,
  ffmpegAutoUpdateEnabled,
  ytUpdating,
  ffmpegUpdating,
  startYtUpdate,
  startFfmpegUpdate,
  onToggleYtAutoUpdate,
  onToggleFfmpegAutoUpdate,
  toolUpdateSettingsLoading,
  toolUpdateSettingsSaving,
  toolUpdateSettingsError,
  onCheckYtUpdates,
  onCheckFfmpegUpdates,
  ytLogLines,
  ffmpegLogLines,
  t,
}) {
  // Overview mode
  if (!activeDetail) {
    const ytStatus = ytInfo.loading ? 'loading'
      : !ytInfo.updateSupported ? 'unsupported'
      : (ytUpdating || ytInfo.updateInProgress) ? 'updating'
      : ytInfo.outdated ? 'outdated'
      : 'current'

    const ytStatusLabel = ytInfo.loading ? t('settings.checking')
      : !ytInfo.updateSupported ? t('settings.updateManagedExternally')
      : (ytUpdating || ytInfo.updateInProgress) ? t('settings.updating')
      : ytInfo.outdated ? t('settings.updateAvailable')
      : t('settings.upToDate')

    const ffmpegStatus = ffmpegInfo.loading ? 'loading'
      : !ffmpegInfo.available ? 'missing'
      : (ffmpegUpdating || ffmpegInfo.updateInProgress) ? 'updating'
      : ffmpegInfo.outdated ? 'outdated'
      : 'current'

    const ffmpegStatusLabel = ffmpegInfo.loading ? t('settings.checking')
      : !ffmpegInfo.available ? t('settings.ffmpegMissing')
      : (ffmpegUpdating || ffmpegInfo.updateInProgress) ? t('settings.updating')
      : ffmpegInfo.outdated ? t('settings.updateAvailable')
      : t('settings.ffmpegAvailable')

    return (
      <Box sx={{ px: 4, pt: 4, pb: 4 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 3, lineHeight: 1.45, fontSize: 13 }}>
          {t('settings.systemDescription')}
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <DependencyCard
            icon={Video}
            name="yt-dlp"
            version={ytInfo.currentVersion || '-'}
            statusElement={<StatusBadge status={ytStatus} label={ytStatusLabel} />}
            hasUpdate={Boolean(ytInfo.outdated)}
            onClick={() => onNavigateToDetail('yt-dlp')}
            t={t}
          />
          <DependencyCard
            icon={Cpu}
            name="ffmpeg"
            version={ffmpegInfo.version || '-'}
            statusElement={<StatusBadge status={ffmpegStatus} label={ffmpegStatusLabel} />}
            hasUpdate={Boolean(ffmpegInfo.outdated)}
            onClick={() => onNavigateToDetail('ffmpeg')}
            t={t}
          />
        </Box>
      </Box>
    )
  }

  // Detail mode — yt-dlp or ffmpeg
  const isYtDlp = activeDetail === 'yt-dlp'

  return (
    <DependencyDetail
      tool={isYtDlp ? 'yt-dlp' : 'ffmpeg'}
      info={isYtDlp ? ytInfo : ffmpegInfo}
      autoUpdateEnabled={isYtDlp ? ytAutoUpdateEnabled : ffmpegAutoUpdateEnabled}
      updating={isYtDlp ? ytUpdating : ffmpegUpdating}
      startUpdate={isYtDlp ? startYtUpdate : startFfmpegUpdate}
      onToggleAutoUpdate={isYtDlp ? onToggleYtAutoUpdate : onToggleFfmpegAutoUpdate}
      toolUpdateSettingsLoading={toolUpdateSettingsLoading}
      toolUpdateSettingsSaving={toolUpdateSettingsSaving}
      toolUpdateSettingsError={toolUpdateSettingsError}
      onCheckForUpdates={isYtDlp ? onCheckYtUpdates : onCheckFfmpegUpdates}
      logLines={isYtDlp ? ytLogLines : ffmpegLogLines}
      t={t}
    />
  )
}
