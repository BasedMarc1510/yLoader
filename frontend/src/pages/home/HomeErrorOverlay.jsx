import React from 'react'
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Button,
} from '@mui/material'
import { AlertTriangle, X } from 'lucide-react'
import { extractYtDlpError } from './errorUtils'

export default function HomeErrorOverlay({
  fetchError,
  isResolving,
  onClose,
  onRetry,
  t,
}) {
  if (!fetchError) return null

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        zIndex: 4,
        pointerEvents: 'none',
      }}
    >
      <Box sx={{ width: '100%', maxWidth: 450, pointerEvents: 'auto' }}>
        <Paper elevation={0} sx={(muiTheme) => ({
          width: '100%',
          borderRadius: 2,
          border: 'none',
          overflow: 'hidden',
          bgcolor: muiTheme.palette.mode === 'dark' ? '#181818' : '#ffffff',
          boxShadow: muiTheme.palette.mode === 'dark' ? '0 8px 16px rgba(0, 0, 0, 0.2)' : '0 4px 24px rgba(0, 0, 0, 0.06)',
        })}>
          <Box sx={(muiTheme) => ({
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1.5,
            borderBottom: `1px solid ${muiTheme.palette.mode === 'dark' ? '#2a2a2a' : '#f0f0f0'}`,
          })}>
            <AlertTriangle size={18} style={{ color: '#e8a420', flexShrink: 0 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1 }}>
              {t('fetchError.title')}
            </Typography>
            <IconButton
              size="small"
              aria-label={t('fetchError.closeAria')}
              onClick={onClose}
              sx={{ cursor: 'pointer' }}
            >
              <X size={16} />
            </IconButton>
          </Box>

          <Box
            sx={(muiTheme) => ({
              maxHeight: 160,
              overflowY: 'auto',
              overflowX: 'hidden',
              bgcolor: muiTheme.palette.mode === 'dark' ? '#111' : '#f5f5f5',
            })}
          >
            <Typography variant="body2" sx={(muiTheme) => ({
              display: 'block',
              pl: 2,
              pr: 1.5,
              py: 1.5,
              color: muiTheme.palette.text.secondary,
              wordBreak: 'break-word',
              fontFamily: 'monospace',
              fontSize: '0.78rem',
              lineHeight: 1.6,
            })}>
              {extractYtDlpError(fetchError.message)}
            </Typography>
          </Box>

          <Box sx={{ px: 2, pb: 2 }}>
            <Button
              fullWidth
              variant="contained"
              disableElevation
              onClick={onRetry}
              disabled={isResolving}
              sx={(muiTheme) => ({
                borderRadius: 9999,
                fontWeight: 700,
                textTransform: 'none',
                bgcolor: muiTheme.palette.mode === 'dark' ? '#ffffff' : '#000000',
                color: muiTheme.palette.mode === 'dark' ? '#000000' : '#ffffff',
                '&:hover': {
                  bgcolor: muiTheme.palette.mode === 'dark' ? '#f0f0f0' : '#111111',
                },
                cursor: isResolving ? 'default' : 'pointer',
              })}
            >
              {t('fetchError.retry')}
            </Button>
          </Box>
        </Paper>
      </Box>
    </Box>
  )
}
