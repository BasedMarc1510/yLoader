import React from 'react'
import {
  Box,
  Stack,
  Typography,
  TextField,
  InputAdornment,
  IconButton,
  CircularProgress,
} from '@mui/material'
import { ArrowRight } from 'lucide-react'
import ServiceIcon from '../../components/ServiceIcon'

export default function DownloaderLanding({
  showLanding,
  cfg,
  idx,
  value,
  setValue,
  loading,
  inputRef,
  fading,
  fadeMs,
  onFetch,
  i18nT,
}) {
  return (
    <>
      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '100%',
          maxWidth: 780,
          px: 2,
          opacity: showLanding ? 1 : 0,
          pointerEvents: showLanding ? 'auto' : 'none',
          transition: 'opacity 220ms ease',
        }}
      >
        <TextField
          placeholder={(cfg.examples && cfg.examples[idx]) || ''}
          variant="outlined"
          fullWidth
          size="medium"
          autoFocus
          inputRef={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          onClick={(e) => e.target.select()}
          onMouseUp={(e) => {
            if (e.button === 0) {
              e.preventDefault()
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onFetch()
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start" sx={{ mr: 0.25 }}>
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 44,
                    height: 44,
                    ml: 0,
                  }}
                >
                  <ServiceIcon serviceKey={cfg.icon} size={32} title={i18nT('sidebar.iconAlt', { name: cfg.name })} />
                </Box>
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                {loading ? (
                  <IconButton
                    size="small"
                    edge="end"
                    disableRipple
                    disabled
                    aria-label={i18nT('app.loadingAria')}
                    sx={(t) => ({
                      width: 36,
                      height: 36,
                      bgcolor: t.palette.mode === 'dark' ? '#ffffff' : '#000000',
                      color: t.palette.mode === 'dark' ? '#000000' : '#ffffff',
                      borderRadius: '50%',
                      boxShadow: t.palette.mode === 'dark'
                        ? '0 2px 6px rgba(0,0,0,0.4)'
                        : '0 2px 6px rgba(0,0,0,0.25)',
                      opacity: 1,
                      '&.Mui-disabled': {
                        opacity: 1,
                        color: t.palette.mode === 'dark' ? '#000000' : '#ffffff',
                        bgcolor: t.palette.mode === 'dark' ? '#ffffff' : '#000000',
                      },
                    })}
                  >
                    <CircularProgress
                      size={18}
                      thickness={4}
                      sx={(t) => ({
                        color: t.palette.mode === 'dark' ? '#000000' : '#ffffff',
                      })}
                    />
                  </IconButton>
                ) : (
                  <IconButton
                    size="small"
                    aria-label={i18nT('app.loadMetadataAria')}
                    edge="end"
                    onClick={() => onFetch()}
                    sx={(t) => ({
                      width: 36,
                      height: 36,
                      bgcolor: t.palette.mode === 'dark' ? '#ffffff' : '#000000',
                      color: t.palette.mode === 'dark' ? '#000000' : '#ffffff',
                      borderRadius: '50%',
                      boxShadow: t.palette.mode === 'dark'
                        ? '0 2px 6px rgba(0,0,0,0.4)'
                        : '0 2px 6px rgba(0,0,0,0.25)',
                      '&:hover': {
                        bgcolor: t.palette.mode === 'dark' ? '#f5f5f5' : '#111111',
                      },
                    })}
                  >
                    <ArrowRight size={18} />
                  </IconButton>
                )}
              </InputAdornment>
            ),
          }}
          sx={(t) => ({
            '& .MuiOutlinedInput-root': {
              borderRadius: 9999,
              backgroundColor: t.palette.mode === 'dark' ? '#303030' : '#f9f9f9',
              outline: 'none',
              '&:focus-within': {
                outline: 'none',
                boxShadow: 'none',
              },
              '& fieldset': {
                borderColor: t.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0',
                borderWidth: '1px !important',
              },
              '&:hover fieldset': {
                borderColor: t.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0',
              },
              '&.Mui-focused fieldset': {
                borderColor: t.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0',
                borderWidth: '1px !important',
              },
              '&.Mui-disabled fieldset': {
                borderColor: t.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0',
                borderWidth: '1px !important',
              },
              boxShadow: t.palette.mode === 'dark' ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
            },
            '& .MuiOutlinedInput-input': {
              paddingLeft: '4px',
              paddingRight: '16px',
              color: t.palette.text.primary,
              fontWeight: 700,
              outline: 'none',
              transition: `opacity ${fadeMs}ms ease`,
              opacity: fading ? 0 : 1,
            },
            '& .MuiOutlinedInput-input::placeholder': {
              color: t.palette.text.secondary,
              fontWeight: 700,
            },
            '& .MuiOutlinedInput-input:focus': {
              outline: 'none',
            },
          })}
          inputProps={{ 'aria-label': i18nT('app.urlInputAria', { service: cfg.name }) }}
          disabled={loading}
        />
      </Box>

      <Stack
        spacing={0}
        sx={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: 'calc(50% + 56px + 16px)',
          width: '100%',
          maxWidth: 780,
          px: 2,
          opacity: showLanding ? 1 : 0,
          pointerEvents: showLanding ? 'auto' : 'none',
          transition: 'opacity 220ms ease',
        }}
      >
        <Typography
          variant="h1"
          component="h1"
          align="center"
          className="youtube-title"
          sx={{ fontSize: { xs: '3.5rem', sm: '5rem', md: '6rem' } }}
        >
          <span style={{ color: cfg.yColor }}>y</span>Loader
        </Typography>
        <Typography
          variant="h4"
          align="center"
          sx={{ color: 'text.secondary', fontWeight: 700, mt: 0.5, fontSize: { xs: '1.25rem', sm: '1.5rem', md: '1.75rem' } }}
        >
          {i18nT('app.subtitleService', { service: cfg.name })}
        </Typography>
      </Stack>
    </>
  )
}
