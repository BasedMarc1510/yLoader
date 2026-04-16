import React from 'react'
import { IconButton, CircularProgress } from '@mui/material'
import { ArrowRight } from 'lucide-react'

function buttonSx(muiTheme) {
  return {
    width: 36,
    height: 36,
    bgcolor: muiTheme.palette.mode === 'dark' ? '#ffffff' : '#000000',
    color: muiTheme.palette.mode === 'dark' ? '#000000' : '#ffffff',
    borderRadius: '50%',
    boxShadow: muiTheme.palette.mode === 'dark'
      ? '0 2px 6px rgba(0,0,0,0.4)'
      : '0 2px 6px rgba(0,0,0,0.25)',
  }
}

export default function GoActionButton({
  mode,
  onClick,
  progressKnown,
  progressValue,
  t,
  edge,
  disabled = false,
}) {
  const isBusy = mode === 'progress' || mode === 'loading'
  const isDisabled = Boolean(disabled)

  if (isBusy) {
    return (
      <IconButton
        size="small"
        edge={edge}
        disableRipple
        disabled
        aria-label={t('app.loadingAria')}
        sx={(muiTheme) => ({
          ...buttonSx(muiTheme),
          opacity: 1,
          '&.Mui-disabled': {
            opacity: 1,
            color: muiTheme.palette.mode === 'dark' ? '#000000' : '#ffffff',
            bgcolor: muiTheme.palette.mode === 'dark' ? '#ffffff' : '#000000',
          },
        })}
      >
        <CircularProgress
          size={18}
          thickness={4}
          variant={mode === 'progress' && progressKnown ? 'determinate' : 'indeterminate'}
          value={mode === 'progress' && progressKnown ? progressValue : undefined}
          sx={{ color: (muiTheme) => (muiTheme.palette.mode === 'dark' ? '#000000' : '#ffffff') }}
        />
      </IconButton>
    )
  }

  return (
    <IconButton
      size="small"
      edge={edge}
      aria-label={t('app.startDownloadAria')}
      onClick={onClick}
      disabled={isDisabled}
      sx={(muiTheme) => ({
        ...buttonSx(muiTheme),
        '&:hover': {
          bgcolor: muiTheme.palette.mode === 'dark' ? '#f5f5f5' : '#111111',
        },
        ...(isDisabled
          ? {
              opacity: 0.55,
              '&.Mui-disabled': {
                opacity: 0.55,
                color: muiTheme.palette.mode === 'dark' ? '#000000' : '#ffffff',
                bgcolor: muiTheme.palette.mode === 'dark' ? '#ffffff' : '#000000',
              },
              '&:hover': {
                bgcolor: muiTheme.palette.mode === 'dark' ? '#ffffff' : '#000000',
              },
            }
          : {}),
      })}
    >
      <ArrowRight size={18} />
    </IconButton>
  )
}
