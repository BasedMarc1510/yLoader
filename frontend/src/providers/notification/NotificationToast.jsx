import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Button, IconButton, Paper, Stack, Typography, keyframes, useTheme } from '@mui/material'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import SeverityIcon from './SeverityIcon'
import { normalizeMessage } from './utils'

const slideIn = keyframes`
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
`

export default function NotificationToast({
  entry,
  isWindowFocused,
  isNotificationCenterOpen,
  onDismiss,
  onAction,
  t,
}) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'

  const [isExpanded, setIsExpanded] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const timerRef = useRef(null)
  const timerStartedAtRef = useRef(0)
  const remainingMsRef = useRef(Number(entry?.duration) || 0)

  const clearTimer = useCallback((preserveRemaining = true) => {
    if (!timerRef.current) return

    clearTimeout(timerRef.current)
    timerRef.current = null

    if (preserveRemaining && timerStartedAtRef.current > 0) {
      const elapsed = Date.now() - timerStartedAtRef.current
      remainingMsRef.current = Math.max(0, remainingMsRef.current - elapsed)
    }

    timerStartedAtRef.current = 0
  }, [])

  const startTimer = useCallback(() => {
    if (timerRef.current) return
    if (remainingMsRef.current <= 0) {
      onDismiss(entry.id)
      return
    }

    timerStartedAtRef.current = Date.now()
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      timerStartedAtRef.current = 0
      onDismiss(entry.id)
    }, remainingMsRef.current)
  }, [entry.id, onDismiss])

  const canAutoDismiss = !entry.persistent && entry.duration > 0
  const focusReady = !entry.startTimerOnFocus || isWindowFocused
  const shouldRunTimer = canAutoDismiss && focusReady && !isHovered && !isNotificationCenterOpen

  useEffect(() => {
    if (!canAutoDismiss) return undefined

    if (shouldRunTimer) {
      startTimer()
    } else {
      clearTimer(true)
    }

    return () => {
      clearTimer(true)
    }
  }, [canAutoDismiss, clearTimer, shouldRunTimer, startTimer])

  useEffect(() => {
    remainingMsRef.current = Number(entry?.duration) || 0
  }, [entry.duration, entry.id])

  const message = normalizeMessage(entry?.message)
  const isLong = message.length > 80

  const bgColor = isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.98)'
  const borderColor = isDark ? '#333' : '#e0e0e0'
  const textColor = isDark ? '#fff' : '#1a1a1a'

  return (
    <Paper
      elevation={4}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        width: 338,
        bgcolor: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 2,
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.25s ease',
        animation: `${slideIn} 0.25s cubic-bezier(0.2, 0, 0, 1)`,
        backdropFilter: 'blur(8px)',
        boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 24px rgba(0,0,0,0.12)',
      }}
    >
      <Box sx={{ p: 1.8, display: 'flex', alignItems: 'flex-start', gap: 1.4 }}>
        <Box sx={{ mt: 0.15, flexShrink: 0 }}>
          <SeverityIcon severity={entry.severity} size={19} />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{
              color: textColor,
              fontWeight: 500,
              fontSize: '0.9rem',
              lineHeight: 1.5,
              ...(!isExpanded && {
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }),
            }}
          >
            {message}
          </Typography>

          {isLong && (
            <Box
              component="button"
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              sx={{
                mt: 0.5,
                p: 0,
                border: 0,
                background: 'transparent',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.4,
                cursor: 'pointer',
                color: isDark ? '#999' : '#666',
                fontSize: '0.75rem',
                fontWeight: 700,
                '&:hover': { color: textColor },
              }}
            >
              {isExpanded ? t('notifications.showLess') : t('notifications.showMore')}
              {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </Box>
          )}

          {Array.isArray(entry.actions) && entry.actions.length > 0 && (
            <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap' }}>
              {entry.actions.map((action) => (
                <Button
                  key={`${entry.id}-${action.id}`}
                  size="small"
                  variant="outlined"
                  onClick={() => onAction(entry.id, action.id)}
                  sx={{
                    minHeight: 28,
                    borderRadius: 999,
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    borderColor: isDark ? '#5f5f5f' : '#c7c7c7',
                    color: textColor,
                    '&:hover': {
                      borderColor: isDark ? '#8a8a8a' : '#9f9f9f',
                      bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
                    },
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
          onClick={() => onDismiss(entry.id)}
          aria-label={t('notifications.dismissAria')}
          sx={{
            mt: -0.6,
            mr: -0.5,
            color: isDark ? '#666' : '#999',
            cursor: 'pointer',
            '&:hover': {
              color: textColor,
              bgcolor: isDark ? '#333' : '#f0f0f0',
            },
          }}
        >
          <X size={16} />
        </IconButton>
      </Box>
    </Paper>
  )
}
