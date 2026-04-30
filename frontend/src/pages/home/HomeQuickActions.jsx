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
import { Plus, List, Zap, ChevronRight, ChevronDown } from 'lucide-react'
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
  const quickActionsOpen = Boolean(menuAnchorEl)

  // Determine trigger button styling based on active mode
  let triggerIcon = <Plus size={20} />
  let triggerText = null
  let triggerBg = quickActionsOpen
    ? (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)')
    : 'transparent'
  let triggerColor = quickActionsOpen
    ? (theme) => theme.palette.text.primary
    : (theme) => theme.palette.text.secondary
  let triggerHoverBg = (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)')
  let triggerTooltip = t('home.quickActions.openAria')

  if (autoDownloadEnabled) {
    triggerIcon = <Zap size={16} fill="currentColor" />
    triggerText = t('home.quickActions.autoDownload')
    triggerBg = (theme) => (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)')
    triggerColor = (theme) => theme.palette.text.primary
    triggerHoverBg = (theme) => (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)')
    triggerTooltip = t('home.quickActions.autoDownloadActiveTooltip')
  } else if (multiModeEnabled) {
    triggerIcon = <List size={16} />
    triggerText = t('home.quickActions.multiDownload')
    triggerBg = (theme) => (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)')
    triggerColor = (theme) => theme.palette.text.primary
    triggerHoverBg = (theme) => (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)')
    triggerTooltip = t('home.quickActions.multiDownload')
  }

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Tooltip title={triggerTooltip}>
        <Box
          component="button"
          type="button"
          onClick={onOpenQuickActions}
          disabled={isResolving}
          aria-label={t('home.quickActions.openAria')}
          sx={(theme) => ({
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: triggerText ? 0.75 : 0,
            height: 36,
            minWidth: 36,
            px: triggerText ? 1.5 : 0,
            borderRadius: 999,
            border: 'none',
            color: isResolving ? theme.palette.text.disabled : triggerColor(theme),
            bgcolor: triggerBg,
            cursor: isResolving ? 'default' : 'pointer',
            transition: 'background-color 150ms ease, color 150ms ease',
            outline: 'none',
            '&:hover': {
              bgcolor: isResolving ? triggerBg : triggerHoverBg(theme),
            },
          })}
        >
          {triggerIcon}
          {triggerText && (
            <>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  lineHeight: 1,
                  fontSize: '0.8rem',
                  letterSpacing: 0.3,
                  mt: '1px',
                }}
              >
                {triggerText}
              </Typography>
              <ChevronDown size={14} style={{ marginLeft: 2, opacity: 0.7 }} />
            </>
          )}
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
              width: 320,
              borderRadius: '16px',
              overflow: 'hidden',
              border: `1px solid ${theme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0'}`,
              bgcolor: theme.palette.mode === 'dark' ? '#2a2a2a' : '#ffffff',
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
              gap: 1,
            },
          },
        }}
      >
        <MenuItem
          onClick={() => onRequestToggleMultiMode(!multiModeEnabled)}
          disabled={isResolving}
          sx={(theme) => ({
            py: 1.2,
            px: 1.5,
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 48,
            bgcolor: multiModeEnabled
              ? (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)')
              : 'transparent',
            transition: 'background-color 150ms ease',
            '&:hover': {
              bgcolor: multiModeEnabled
                ? (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)')
                : (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
            },
          })}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: '8px',
                bgcolor: multiModeEnabled
                  ? (theme) => (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)')
                  : (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'),
                color: multiModeEnabled
                  ? (theme) => theme.palette.text.primary
                  : (theme) => theme.palette.text.secondary,
              }}
            >
              <List size={18} />
            </Box>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                {t('home.quickActions.multiDownload')}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: -0.2 }}>
                {multiModeEnabled ? t('home.quickActions.active') : t('home.quickActions.inactive')}
              </Typography>
            </Box>
          </Box>
          <Switch
            size="medium"
            checked={multiModeEnabled}
            disabled={isResolving}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onRequestToggleMultiMode(event.target.checked)}
            inputProps={{ 'aria-label': t('home.quickActions.multiDownloadSwitchAria') }}
            sx={(theme) => ({
              '& .MuiSwitch-switchBase.Mui-checked': {
                color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
              },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                backgroundColor: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
              },
            })}
          />
        </MenuItem>

        <MenuItem
          onClick={() => onToggleAutoDownload(!autoDownloadEnabled)}
          disabled={isResolving}
          sx={(theme) => ({
            py: 1.2,
            px: 1.5,
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 48,
            bgcolor: autoDownloadEnabled
              ? (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)')
              : 'transparent',
            transition: 'background-color 150ms ease',
            '&:hover': {
              bgcolor: autoDownloadEnabled
                ? (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)')
                : (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
            },
          })}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: '8px',
                bgcolor: autoDownloadEnabled
                  ? (theme) => (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)')
                  : (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'),
                color: autoDownloadEnabled
                  ? (theme) => theme.palette.text.primary
                  : (theme) => theme.palette.text.secondary,
              }}
            >
              <Zap size={18} fill={autoDownloadEnabled ? "currentColor" : "none"} />
            </Box>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                {t('home.quickActions.autoDownload')}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: -0.2 }}>
                {autoDownloadEnabled ? t('home.quickActions.active') : t('home.quickActions.inactive')}
              </Typography>
            </Box>
          </Box>
          <Switch
            size="medium"
            checked={autoDownloadEnabled}
            disabled={isResolving}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onToggleAutoDownload(event.target.checked)}
            inputProps={{ 'aria-label': t('home.quickActions.autoDownloadSwitchAria') }}
            sx={(theme) => ({
              '& .MuiSwitch-switchBase.Mui-checked': {
                color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
              },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                backgroundColor: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
              },
            })}
          />
        </MenuItem>

        {autoDownloadEnabled && (
          <Box sx={{ mt: 0.5, px: 0.5 }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                variant={autoDownloadFormat === 'mp4' ? 'contained' : 'outlined'}
                onClick={() => onSetAutoDownloadFormat('mp4')}
                sx={(theme) => ({
                  flex: 1,
                  minWidth: 0,
                  borderRadius: '8px',
                  textTransform: 'none',
                  fontWeight: 700,
                  py: 0.8,
                  cursor: 'pointer',
                  transition: 'background-color 150ms ease, color 150ms ease',
                  ...(autoDownloadFormat === 'mp4'
                    ? {
                        bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                        color: theme.palette.text.primary,
                        boxShadow: 'none',
                        '&:hover': {
                          bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)',
                          boxShadow: 'none',
                        },
                      }
                    : {
                        borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
                        color: theme.palette.text.secondary,
                        '&:hover': {
                          bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                        },
                      }),
                })}
              >
                {t('home.quickActions.formatMp4') || 'MP4 Video'}
              </Button>
              <Button
                size="small"
                variant={autoDownloadFormat === 'mp3' ? 'contained' : 'outlined'}
                onClick={() => onSetAutoDownloadFormat('mp3')}
                sx={(theme) => ({
                  flex: 1,
                  minWidth: 0,
                  borderRadius: '8px',
                  textTransform: 'none',
                  fontWeight: 700,
                  py: 0.8,
                  cursor: 'pointer',
                  transition: 'background-color 150ms ease, color 150ms ease',
                  ...(autoDownloadFormat === 'mp3'
                    ? {
                        bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                        color: theme.palette.text.primary,
                        boxShadow: 'none',
                        '&:hover': {
                          bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)',
                          boxShadow: 'none',
                        },
                      }
                    : {
                        borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
                        color: theme.palette.text.secondary,
                        '&:hover': {
                          bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                        },
                      }),
                })}
              >
                {t('home.quickActions.formatMp3') || 'MP3 Audio'}
              </Button>
            </Box>

            <Button
              fullWidth
              size="small"
              variant="text"
              endIcon={<ChevronRight size={16} />}
              onClick={() => {
                onCloseQuickActions()
                openSettingsModal('auto-download')
              }}
              sx={{
                mt: 1,
                justifyContent: 'space-between',
                textTransform: 'none',
                borderRadius: '8px',
                color: 'text.secondary',
                fontWeight: 600,
                py: 0.8,
                transition: 'background-color 150ms ease',
                '&:hover': {
                  bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                },
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
