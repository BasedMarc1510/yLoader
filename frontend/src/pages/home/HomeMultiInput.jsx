import React from 'react'
import { Box, TextField } from '@mui/material'
import GoActionButton from './GoActionButton'

export default function HomeMultiInput({
  value,
  onChange,
  onSubmit,
  isResolving,
  disableGoAction,
  quickActionsTrigger,
  showAutoDownloadProgress,
  autoDownloadProgressKnown,
  normalizedAutoDownloadProgress,
  inputBorderRunnerAnimation,
  multiInputRows,
  t,
}) {
  const actionMode = showAutoDownloadProgress ? 'progress' : (isResolving ? 'loading' : 'idle')

  return (
    <Box
      sx={(muiTheme) => ({
        position: 'relative',
        borderRadius: '12px',
        overflow: 'hidden',
        border: `1px solid ${muiTheme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0'}`,
        bgcolor: muiTheme.palette.mode === 'dark' ? '#303030' : '#f9f9f9',
        boxShadow: muiTheme.palette.mode === 'dark' ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
        ...(showAutoDownloadProgress
          ? {
              '&::after': {
                content: '""',
                position: 'absolute',
                inset: '-1px',
                padding: '1px',
                borderRadius: 'inherit',
                background: muiTheme.palette.mode === 'dark'
                  ? 'linear-gradient(110deg, transparent 24%, rgba(255,255,255,0.52) 37%, transparent 52%, transparent 100%)'
                  : 'linear-gradient(110deg, transparent 24%, rgba(17,17,17,0.38) 37%, transparent 52%, transparent 100%)',
                WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                WebkitMaskComposite: 'xor',
                maskComposite: 'exclude',
                backgroundSize: '320% 100%',
                animation: inputBorderRunnerAnimation,
                pointerEvents: 'none',
                zIndex: 2,
              },
            }
          : {}),
      })}
    >
      <TextField
        placeholder={t('placeholders.homeMultiUrls')}
        variant="standard"
        fullWidth
        multiline
        autoFocus
        minRows={multiInputRows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            onSubmit()
          }
        }}
        InputProps={{
          disableUnderline: true,
          sx: (muiTheme) => ({
            alignItems: 'flex-start',
            px: 1.6,
            pt: 1.35,
            pb: 0.85,
            '& textarea': {
              color: muiTheme.palette.text.primary,
              fontWeight: 700,
              lineHeight: 1.45,
              padding: 0,
              resize: 'none',
              overflowY: 'hidden !important',
            },
            '& textarea::placeholder': {
              color: muiTheme.palette.text.secondary,
              fontWeight: 700,
              opacity: 1,
            },
          }),
        }}
        disabled={isResolving}
        inputProps={{
          'aria-label': t('app.urlInputAria', { service: t('routes.downloader') }),
          spellCheck: 'false',
        }}
      />

      <Box
        sx={(muiTheme) => ({
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1,
          py: 0.8,
          borderTop: `1px solid ${muiTheme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0'}`,
        })}
      >
        {quickActionsTrigger}

        <GoActionButton
          mode={actionMode}
          onClick={onSubmit}
          progressKnown={autoDownloadProgressKnown}
          progressValue={normalizedAutoDownloadProgress}
          disabled={disableGoAction}
          t={t}
        />
      </Box>
    </Box>
  )
}
