import React from 'react'
import { Box, Button, IconButton, Paper, Popover, Stack, Typography } from '@mui/material'
import { Trash2, X } from 'lucide-react'
import SeverityIcon from './SeverityIcon'
import { formatTimestamp } from './utils'

export default function NotificationCenterPopover({
  open,
  anchorEl,
  onClose,
  isDark,
  t,
  language,
  sortedHistory,
  unreadCount,
  onMarkAllRead,
  onClearAll,
  onRemoveNotification,
  onAction,
}) {
  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      disableRestoreFocus
      sx={{ zIndex: 1850 }}
      PaperProps={{
        sx: {
          mt: 0.8,
          width: { xs: 'calc(100vw - 24px)', sm: 390 },
          maxWidth: 'calc(100vw - 24px)',
          maxHeight: 'min(76vh, 620px)',
          borderRadius: 2,
          border: `1px solid ${isDark ? '#333' : '#d9dbe1'}`,
          bgcolor: isDark ? '#1f1f1f' : '#ffffff',
          overflow: 'hidden',
          boxShadow: isDark
            ? '0 14px 40px rgba(0,0,0,0.5)'
            : '0 14px 38px rgba(0,0,0,0.16)',
        },
      }}
    >
      <Box sx={{ px: 1.5, py: 1.25, borderBottom: `1px solid ${isDark ? '#343434' : '#e8e9ee'}` }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
            {t('notifications.title')}
          </Typography>
          <Stack direction="row" spacing={0.5}>
            <Button
              size="small"
              onClick={onMarkAllRead}
              disabled={unreadCount <= 0}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              {t('notifications.markAllRead')}
            </Button>
            <Button
              size="small"
              color="error"
              onClick={onClearAll}
              startIcon={<Trash2 size={14} />}
              disabled={sortedHistory.length <= 0}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              {t('notifications.clearAll')}
            </Button>
          </Stack>
        </Stack>
      </Box>

      <Box sx={{ p: 1.25, maxHeight: 'min(70vh, 560px)', overflowY: 'auto' }}>
        {sortedHistory.length === 0 && (
          <Typography variant="body2" sx={{ color: 'text.secondary', px: 0.5, py: 0.25 }}>
            {t('notifications.empty')}
          </Typography>
        )}

        <Stack spacing={1}>
          {sortedHistory.map((entry) => (
            <Paper
              key={entry.id}
              elevation={0}
              sx={{
                p: 1.15,
                borderRadius: 1.5,
                border: `1px solid ${entry.read
                  ? (isDark ? '#35373c' : '#e4e7ef')
                  : (isDark ? '#4f606f' : '#b8cadc')}`,
                bgcolor: entry.read
                  ? (isDark ? '#222327' : '#fbfcff')
                  : (isDark ? 'rgba(41,65,89,0.28)' : 'rgba(31,105,183,0.09)'),
              }}
            >
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <Box sx={{ mt: 0.15, flexShrink: 0 }}>
                  <SeverityIcon severity={entry.severity} size={16} />
                </Box>

                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 500,
                      lineHeight: 1.4,
                      wordBreak: 'break-word',
                    }}
                  >
                    {entry.message}
                  </Typography>

                  <Typography
                    variant="caption"
                    sx={{ display: 'block', mt: 0.4, color: 'text.secondary' }}
                  >
                    {formatTimestamp(entry.createdAt, language)}
                  </Typography>

                  {entry.status === 'active' && Array.isArray(entry.actions) && entry.actions.length > 0 && (
                    <Stack direction="row" spacing={0.75} sx={{ mt: 0.8, flexWrap: 'wrap' }}>
                      {entry.actions.map((action) => (
                        <Button
                          key={`${entry.id}-${action.id}-history`}
                          size="small"
                          variant="outlined"
                          onClick={() => onAction(entry.id, action.id)}
                          sx={{
                            minHeight: 26,
                            borderRadius: 999,
                            textTransform: 'none',
                            fontWeight: 700,
                            fontSize: '0.74rem',
                          }}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </Stack>
                  )}
                </Box>

                <IconButton
                  size="small"
                  onClick={() => onRemoveNotification(entry.id)}
                  aria-label={t('notifications.dismissAria')}
                  sx={{
                    mt: -0.3,
                    mr: -0.3,
                    cursor: 'pointer',
                  }}
                >
                  <X size={15} />
                </IconButton>
              </Stack>
            </Paper>
          ))}
        </Stack>
      </Box>
    </Popover>
  )
}
