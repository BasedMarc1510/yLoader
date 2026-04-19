import React from 'react'
import { Box, LinearProgress, Typography } from '@mui/material'
import { useI18n } from '../providers/I18nProvider'

const TASK_ORDER = ['ytdlp', 'ffmpeg']

function resolveTaskLabel(taskKey, t) {
  if (taskKey === 'ytdlp') return t('app.dependencyBootstrap.tools.ytdlp')
  if (taskKey === 'ffmpeg') return t('app.dependencyBootstrap.tools.ffmpeg')
  return taskKey
}

function resolveStatusLabel(status, t) {
  const key = String(status || 'pending').trim()
  if (key === 'ready') return t('app.dependencyBootstrap.status.ready')
  if (key === 'downloading') return t('app.dependencyBootstrap.status.downloading')
  if (key === 'installing') return t('app.dependencyBootstrap.status.installing')
  if (key === 'checking') return t('app.dependencyBootstrap.status.checking')
  if (key === 'error') return t('app.dependencyBootstrap.status.error')
  return t('app.dependencyBootstrap.status.pending')
}

function resolvePhaseLabel(phase, t) {
  const key = String(phase || 'idle').trim()
  if (key === 'ready') return t('app.dependencyBootstrap.phase.ready')
  if (key === 'downloading') return t('app.dependencyBootstrap.phase.downloading')
  if (key === 'installing') return t('app.dependencyBootstrap.phase.installing')
  if (key === 'checking') return t('app.dependencyBootstrap.phase.checking')
  if (key === 'error') return t('app.dependencyBootstrap.phase.error')
  return t('app.dependencyBootstrap.phase.idle')
}

export default function ElectronDependencyBootstrapOverlay({ state, isVisible }) {
  const { t } = useI18n()

  if (!isVisible) return null

  const safeState = state && typeof state === 'object' ? state : {}
  const tasks = safeState.tasks && typeof safeState.tasks === 'object' ? safeState.tasks : {}
  const overallProgressRaw = Number(safeState.overallProgress)
  const overallProgress = Number.isFinite(overallProgressRaw)
    ? Math.min(Math.max(overallProgressRaw, 0), 100)
    : 0
  const retryAt = Number(safeState.retryAt)
  const retrySeconds = Number.isFinite(retryAt)
    ? Math.max(0, Math.ceil((retryAt - Date.now()) / 1000))
    : 0

  return (
    <Box
      sx={(theme) => ({
        position: 'fixed',
        inset: 0,
        zIndex: 1600,
        bgcolor: theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.82)' : 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 3,
      })}
    >
      <Box
        role="alertdialog"
        aria-modal="true"
        sx={(theme) => ({
          width: 'min(640px, 100%)',
          borderRadius: '14px',
          border: `1px solid ${theme.palette.divider}`,
          bgcolor: theme.palette.mode === 'dark' ? '#111111' : '#ffffff',
          boxShadow: theme.palette.mode === 'dark'
            ? '0 24px 44px rgba(0,0,0,0.6)'
            : '0 24px 44px rgba(0,0,0,0.18)',
          p: 3,
        })}
      >
        <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>
          {t('app.dependencyBootstrap.title')}
        </Typography>

        <Typography sx={{ mt: 1, color: 'text.secondary', fontSize: 14.5, lineHeight: 1.5 }}>
          {t('app.dependencyBootstrap.description')}
        </Typography>

        <Box sx={{ mt: 2.5 }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.secondary', mb: 0.75 }}>
            {resolvePhaseLabel(safeState.phase, t)}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={overallProgress}
            sx={{ height: 9, borderRadius: 999 }}
          />
          <Typography sx={{ mt: 0.75, fontSize: 12.5, color: 'text.secondary' }}>
            {t('app.dependencyBootstrap.overallProgress', { value: Math.round(overallProgress) })}
          </Typography>
        </Box>

        <Box sx={{ mt: 2.5, display: 'grid', gap: 1.25 }}>
          {TASK_ORDER.map((taskKey) => {
            const task = tasks[taskKey] && typeof tasks[taskKey] === 'object' ? tasks[taskKey] : {}
            const taskVersion = String(task.version || '').trim()
            const taskError = String(task.error || '').trim()

            return (
              <Box key={taskKey}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                    {resolveTaskLabel(taskKey, t)}
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, color: taskError ? '#f87171' : 'text.secondary' }}>
                    {resolveStatusLabel(task.status, t)}
                  </Typography>
                </Box>
                {taskVersion && !taskError && (
                  <Typography sx={{ mt: 0.4, fontSize: 12, color: 'text.secondary' }}>
                    {t('app.dependencyBootstrap.version', { value: taskVersion })}
                  </Typography>
                )}
                {taskError && (
                  <Typography sx={{ mt: 0.4, fontSize: 12, color: '#f87171' }}>
                    {taskError}
                  </Typography>
                )}
              </Box>
            )
          })}
        </Box>

        {safeState.error && (
          <Typography sx={{ mt: 2.25, fontSize: 13, color: '#f87171', lineHeight: 1.4 }}>
            {t('app.dependencyBootstrap.error', { message: safeState.error })}
          </Typography>
        )}

        {safeState.phase === 'error' && retrySeconds > 0 && (
          <Typography sx={{ mt: 1, fontSize: 12.5, color: 'text.secondary' }}>
            {t('app.dependencyBootstrap.retryIn', { seconds: retrySeconds })}
          </Typography>
        )}
      </Box>
    </Box>
  )
}
