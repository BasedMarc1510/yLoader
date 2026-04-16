import React from 'react'
import {
  Box,
  Menu,
  MenuItem,
  Switch,
  Button,
  Tooltip,
  Typography,
  IconButton,
} from '@mui/material'
import { Plus, List, Zap, X, ChevronRight } from 'lucide-react'
import { openSettingsModal } from './settingsBridge'

export default function HomeQuickActions({
  multiModeEnabled,
  autoDownloadEnabled,
  autoDownloadFormat,
  isResolving,
  menuAnchorEl,
  onOpenQuickActions,
  onCloseQuickActions,
  onRequestToggleMultiMode,
  onToggleAutoDownload,
  onSetAutoDownloadFormat,
  t,
}) {
  if (multiModeEnabled) {
    return (
      <Box
        component="button"
        type="button"
        onClick={() => onRequestToggleMultiMode(false)}
        aria-label={t('home.quickActions.multiDisableWarningTitle')}
        sx={(theme) => ({
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.55,
          height: 32,
          px: 0.6,
          borderRadius: 999,
          border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(147,197,253,0.52)' : '#b4d2ff'}`,
          bgcolor: theme.palette.mode === 'dark' ? 'rgba(59,130,246,0.22)' : '#e8f1ff',
          color: theme.palette.mode === 'dark' ? '#dbeafe' : '#1f4f99',
          boxShadow: theme.palette.mode === 'dark'
            ? 'inset 0 1px 0 rgba(255,255,255,0.08)'
            : 'inset 0 1px 0 rgba(255,255,255,0.92)',
          cursor: 'pointer',
          transition: 'background-color 160ms ease, border-color 160ms ease, transform 120ms ease',
          '&:hover': {
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(59,130,246,0.3)' : '#deecff',
            borderColor: theme.palette.mode === 'dark' ? 'rgba(191,219,254,0.65)' : '#9dc4ff',
          },
          '&:active': {
            transform: 'translateY(0.5px)',
          },
        })}
      >
        <Box
          sx={(theme) => ({
            width: 18,
            height: 18,
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(37,99,235,0.44)' : '#d5e6ff',
            border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(191,219,254,0.42)' : '#a5c8ff'}`,
          })}
        >
          <X size={11} />
        </Box>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 800,
            letterSpacing: 0.15,
            lineHeight: 1,
            pr: 0.2,
          }}
        >
          {t('home.quickActions.multiDownload')}
        </Typography>
      </Box>
    )
  }

  const quickActionsOpen = Boolean(menuAnchorEl)

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
      }}
    >
      <Tooltip title={autoDownloadEnabled ? t('home.quickActions.autoDownloadActiveTooltip') : ''}>
        <Box component="span" sx={{ display: 'inline-flex' }}>
          <IconButton
            size="small"
            aria-label={t('home.quickActions.openAria')}
            onClick={onOpenQuickActions}
            disabled={isResolving}
            sx={(theme) => ({
              width: 36,
              height: 36,
              p: 0,
              borderRadius: '50%',
              color: isResolving
                ? theme.palette.text.disabled
                : (quickActionsOpen ? theme.palette.text.primary : theme.palette.text.secondary),
              bgcolor: quickActionsOpen
                ? (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)')
                : 'transparent',
              opacity: 1,
              cursor: isResolving ? 'default' : 'pointer',
              '&:hover': {
                bgcolor: isResolving
                  ? 'transparent'
                  : (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'),
                opacity: 1,
              },
              '&.Mui-disabled': {
                opacity: 1,
                color: theme.palette.text.disabled,
              },
            })}
          >
            {autoDownloadEnabled ? <Zap size={18} /> : <Plus size={20} />}
          </IconButton>
        </Box>
      </Tooltip>

      <Menu
        anchorEl={menuAnchorEl}
        open={quickActionsOpen}
        onClose={onCloseQuickActions}
        transformOrigin={{ horizontal: 'left', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
        slotProps={{
          paper: {
            sx: (theme) => ({
              mt: 1,
              width: 300,
              borderRadius: '16px',
              overflow: 'hidden',
              border: `1px solid ${theme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0'}`,
              bgcolor: theme.palette.mode === 'dark' ? '#303030' : '#f9f9f9',
              boxShadow: theme.palette.mode === 'dark'
                ? '0 14px 32px rgba(0,0,0,0.45)'
                : '0 14px 30px rgba(0,0,0,0.16)',
            }),
          },
          list: {
            sx: {
              p: 1.5,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.9,
            },
          },
        }}
      >
        <MenuItem
          onClick={() => onRequestToggleMultiMode(true)}
          disabled={isResolving || autoDownloadEnabled}
          sx={{
            py: 1.05,
            px: 1.25,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 42,
            opacity: autoDownloadEnabled ? 0.52 : 1,
          }}
        >
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.15 }}>
            <List
              size={16}
              color={multiModeEnabled ? '#df2f2f' : undefined}
            />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {t('home.quickActions.multiDownload')}
            </Typography>
          </Box>
          <Switch
            size="small"
            checked={multiModeEnabled}
            disabled={isResolving || autoDownloadEnabled}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onRequestToggleMultiMode(event.target.checked)}
            inputProps={{ 'aria-label': t('home.quickActions.multiDownloadSwitchAria') }}
          />
        </MenuItem>

        <MenuItem
          onClick={() => onToggleAutoDownload(!autoDownloadEnabled)}
          disabled={isResolving}
          sx={{
            py: 1.05,
            px: 1.25,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 42,
          }}
        >
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.15 }}>
            <Zap size={16} />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {t('home.quickActions.autoDownload')}
            </Typography>
          </Box>
          <Switch
            size="small"
            checked={autoDownloadEnabled}
            disabled={isResolving}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onToggleAutoDownload(event.target.checked)}
            inputProps={{ 'aria-label': t('home.quickActions.autoDownloadSwitchAria') }}
          />
        </MenuItem>

        {autoDownloadEnabled && !multiModeEnabled && (
          <Box sx={{ mt: -0.15 }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                variant={autoDownloadFormat === 'mp4' ? 'contained' : 'outlined'}
                onClick={() => onSetAutoDownloadFormat('mp4')}
                sx={(theme) => ({
                  flex: 1,
                  minWidth: 0,
                  borderRadius: 1.5,
                  textTransform: 'none',
                  fontWeight: 700,
                  cursor: 'pointer',
                  ...(autoDownloadFormat === 'mp4'
                    ? {
                        bgcolor: theme.palette.mode === 'dark' ? '#f3f4f6' : '#111827',
                        color: theme.palette.mode === 'dark' ? '#111827' : '#f9fafb',
                        '&:hover': {
                          bgcolor: theme.palette.mode === 'dark' ? '#e5e7eb' : '#1f2937',
                        },
                      }
                    : {
                        borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.26)' : 'rgba(0,0,0,0.2)',
                        color: theme.palette.mode === 'dark' ? '#e5e7eb' : '#374151',
                      }),
                })}
              >
                {t('home.quickActions.formatMp4')}
              </Button>
              <Button
                size="small"
                variant={autoDownloadFormat === 'mp3' ? 'contained' : 'outlined'}
                onClick={() => onSetAutoDownloadFormat('mp3')}
                sx={(theme) => ({
                  flex: 1,
                  minWidth: 0,
                  borderRadius: 1.5,
                  textTransform: 'none',
                  fontWeight: 700,
                  cursor: 'pointer',
                  ...(autoDownloadFormat === 'mp3'
                    ? {
                        bgcolor: theme.palette.mode === 'dark' ? '#f3f4f6' : '#111827',
                        color: theme.palette.mode === 'dark' ? '#111827' : '#f9fafb',
                        '&:hover': {
                          bgcolor: theme.palette.mode === 'dark' ? '#e5e7eb' : '#1f2937',
                        },
                      }
                    : {
                        borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.26)' : 'rgba(0,0,0,0.2)',
                        color: theme.palette.mode === 'dark' ? '#e5e7eb' : '#374151',
                      }),
                })}
              >
                {t('home.quickActions.formatMp3')}
              </Button>
            </Box>

            <Button
              fullWidth
              size="small"
              variant="text"
              endIcon={<ChevronRight size={14} />}
              onClick={() => {
                onCloseQuickActions()
                openSettingsModal('auto-download')
              }}
              sx={{
                mt: 0.55,
                justifyContent: 'space-between',
                textTransform: 'none',
                borderRadius: 1.5,
                color: 'text.secondary',
                fontWeight: 600,
              }}
            >
              {t('home.quickActions.moreSettings')}
            </Button>
          </Box>
        )}
      </Menu>
    </Box>
  )
}
