import React from 'react'
import { TextField, InputAdornment } from '@mui/material'
import { detectService } from '../../utils/metadata'
import GoActionButton from './GoActionButton'

export default function HomeSingleInput({
  value,
  onChange,
  onSubmit,
  onServiceDetected,
  isResolving,
  disableGoAction,
  quickActionsTrigger,
  showAutoDownloadProgress,
  autoDownloadProgressKnown,
  normalizedAutoDownloadProgress,
  inputBorderRunnerAnimation,
  t,
}) {
  const actionMode = showAutoDownloadProgress ? 'progress' : (isResolving ? 'loading' : 'idle')

  return (
    <TextField
      placeholder={t('placeholders.homeSingleUrl')}
      variant="outlined"
      fullWidth
      size="medium"
      autoFocus
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onFocus={(event) => event.target.select()}
      onClick={(event) => event.target.select()}
      onMouseUp={(event) => {
        if (event.button === 0) {
          event.preventDefault()
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          onSubmit()
        }
      }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start" sx={{ mr: 0.25, ml: 0 }}>
            {quickActionsTrigger}
          </InputAdornment>
        ),
        endAdornment: (
          <InputAdornment position="end">
            <GoActionButton
              mode={actionMode}
              onClick={onSubmit}
              progressKnown={autoDownloadProgressKnown}
              progressValue={normalizedAutoDownloadProgress}
              disabled={disableGoAction}
              t={t}
              edge="end"
            />
          </InputAdornment>
        ),
      }}
      onPaste={(event) => {
        const pasted = event.clipboardData.getData('text')
        if (!pasted) return

        event.preventDefault()

        const input = event.currentTarget
        const start = Number.isFinite(input.selectionStart) ? input.selectionStart : value.length
        const end = Number.isFinite(input.selectionEnd) ? input.selectionEnd : value.length
        const nextValue = `${value.slice(0, start)}${pasted}${value.slice(end)}`

        onChange(nextValue)

        const serviceKey = detectService(nextValue)
        if (serviceKey) {
          onServiceDetected(nextValue)
        }
      }}
      sx={(muiTheme) => ({
        '& .MuiOutlinedInput-root': {
          position: 'relative',
          borderRadius: 9999,
          backgroundColor: muiTheme.palette.mode === 'dark' ? '#303030' : '#f9f9f9',
          outline: 'none',
          '&:focus-within': {
            outline: 'none',
            boxShadow: 'none',
          },
          '& fieldset': {
            borderColor: showAutoDownloadProgress ? 'transparent' : (muiTheme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0'),
            borderWidth: '1px !important',
          },
          '&:hover fieldset': {
            borderColor: showAutoDownloadProgress ? 'transparent' : (muiTheme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0'),
          },
          '&.Mui-focused fieldset': {
            borderColor: showAutoDownloadProgress ? 'transparent' : (muiTheme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0'),
            borderWidth: '1px !important',
          },
          '&.Mui-disabled fieldset': {
            borderColor: showAutoDownloadProgress ? 'transparent' : (muiTheme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0'),
            borderWidth: '1px !important',
          },
          ...(showAutoDownloadProgress
            ? {
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 9999,
                  padding: '1px',
                  background: muiTheme.palette.mode === 'dark'
                    ? 'linear-gradient(110deg, transparent 24%, rgba(255,255,255,0.52) 37%, transparent 52%, transparent 100%)'
                    : 'linear-gradient(110deg, transparent 24%, rgba(17,17,17,0.38) 37%, transparent 52%, transparent 100%)',
                  backgroundSize: '320% 100%',
                  animation: inputBorderRunnerAnimation,
                  WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                  WebkitMaskComposite: 'xor',
                  maskComposite: 'exclude',
                  pointerEvents: 'none',
                },
              }
            : {}),
          boxShadow: muiTheme.palette.mode === 'dark' ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
        },
        '& .MuiOutlinedInput-input': {
          paddingLeft: '8px',
          paddingRight: '16px',
          color: muiTheme.palette.text.primary,
          fontWeight: 700,
          outline: 'none',
        },
        '& .MuiOutlinedInput-input::placeholder': {
          color: muiTheme.palette.text.secondary,
          fontWeight: 700,
        },
      })}
      disabled={isResolving}
      inputProps={{
        'aria-label': t('app.urlInputAria', { service: t('routes.downloader') }),
        spellCheck: 'false',
      }}
    />
  )
}
