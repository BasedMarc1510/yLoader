import React from 'react'
import { Box, Typography, IconButton, Paper, Button } from '@mui/material'
import { AlertTriangle, X } from 'lucide-react'
import { formatYtDlpErrorMessage } from '../../utils/ytDlpErrorPresentation'

export default function FetchErrorPanel({ fetchError, closeError, retryError, i18nT }) {
  const message = formatYtDlpErrorMessage(i18nT, fetchError?.message, {
    fallbackKey: 'downloader.errorDownloadFailed',
    includeRawForUnknown: true,
  })

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        minHeight: '100%',
        boxSizing: 'border-box',
        py: { xs: 2, sm: 3 },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
        <Paper
          elevation={0}
          sx={(t) => ({
            width: '100%',
            maxWidth: 450,
            borderRadius: 2,
            border: 'none',
            overflow: 'hidden',
            bgcolor: t.palette.mode === 'dark' ? '#181818' : '#ffffff',
            boxShadow: t.palette.mode === 'dark' ? '0 8px 16px rgba(0, 0, 0, 0.2)' : '0 4px 24px rgba(0, 0, 0, 0.06)',
          })}
        >
          <Box
            sx={(t) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              py: 1.5,
              borderBottom: `1px solid ${t.palette.mode === 'dark' ? '#2a2a2a' : '#f0f0f0'}`,
            })}
          >
            <AlertTriangle size={18} style={{ color: '#e8a420', flexShrink: 0 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1 }}>
              {i18nT('fetchError.title')}
            </Typography>
            <IconButton
              size="small"
              aria-label={i18nT('fetchError.closeAria')}
              onClick={closeError}
              sx={{ cursor: 'pointer' }}
            >
              <X size={16} />
            </IconButton>
          </Box>

          <Box
            sx={(t) => ({
              maxHeight: 160,
              overflowY: 'auto',
              overflowX: 'hidden',
              bgcolor: t.palette.mode === 'dark' ? '#111' : '#f5f5f5',
            })}
          >
            <Typography
              variant="body2"
              sx={(t) => ({
                display: 'block',
                pl: 2,
                pr: 1.5,
                py: 1.5,
                color: t.palette.text.secondary,
                wordBreak: 'break-word',
                fontSize: '0.9rem',
                lineHeight: 1.55,
              })}
            >
              {message}
            </Typography>
          </Box>

          <Box sx={{ px: 2, py: 2 }}>
            <Button
              fullWidth
              variant="contained"
              disableElevation
              onClick={retryError}
              sx={(t) => ({
                borderRadius: 9999,
                fontWeight: 700,
                textTransform: 'none',
                bgcolor: t.palette.mode === 'dark' ? '#ffffff' : '#000000',
                color: t.palette.mode === 'dark' ? '#000000' : '#ffffff',
                '&:hover': {
                  bgcolor: t.palette.mode === 'dark' ? '#f0f0f0' : '#111111',
                },
                cursor: 'pointer',
              })}
            >
              {i18nT('fetchError.retry')}
            </Button>
          </Box>
        </Paper>
      </Box>
    </Box>
  )
}
