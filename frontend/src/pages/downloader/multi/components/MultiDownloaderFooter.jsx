import React from 'react'
import {
  Box,
  Button,
  LinearProgress,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import { Play } from 'lucide-react'

export default function MultiDownloaderFooter({
  i18nT,
  activeCount,
  completeCount,
  overallProgress,
  startableCount,
  onStartAll,
  startAllDisabled,
  queueSummary,
}) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'

  const hasActivity = activeCount > 0 || completeCount > 0

  return (
    <Box
      sx={{
        position: 'sticky',
        bottom: { xs: 16, sm: 20 },
        mx: 'auto',
        width: '100%',
        maxWidth: 450,
        zIndex: 10,
        px: { xs: 1, sm: 0 }
      }}
    >
      <Box
        sx={{
          p: 2,
          borderRadius: 4,
          bgcolor: isDark ? 'rgba(30,30,30,0.8)' : 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(16px) saturate(180%)',
          border: '1px solid',
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
          boxShadow: isDark 
            ? '0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)' 
            : '0 12px 40px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.02)',
        }}
      >
        <Stack spacing={1.5}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
            <Box sx={{ minWidth: 0 }}>
              {hasActivity ? (
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'primary.main', display: 'flex', alignItems: 'center', gap: 1 }}>
                   {overallProgress}% <Box component="span" sx={{ color: 'text.secondary', fontWeight: 600 }}>{i18nT('multiDownloader.overallProgress')}</Box>
                </Typography>
              ) : (
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  {startableCount > 0 
                    ? i18nT('multiDownloader.counterReady', { count: startableCount }) 
                    : i18nT('multiDownloader.tabTitle')}
                </Typography>
              )}
            </Box>

            <Button
              variant="contained"
              onClick={onStartAll}
              disabled={startAllDisabled}
              startIcon={<Play size={18} fill="currentColor" />}
              sx={{
                borderRadius: 3,
                px: 3,
                py: 1,
                textTransform: 'none',
                fontWeight: 800,
                fontSize: '0.95rem',
                boxShadow: (theme) => `0 8px 20px ${isDark ? 'rgba(0,0,0,0.4)' : theme.palette.primary.light + '40'}`,
                '&:hover': {
                  boxShadow: (theme) => `0 10px 24px ${isDark ? 'rgba(0,0,0,0.5)' : theme.palette.primary.light + '60'}`,
                }
              }}
            >
              {i18nT('multiDownloader.startAll')}
            </Button>
          </Stack>

          {hasActivity && (
            <LinearProgress 
              value={overallProgress} 
              variant="determinate" 
              sx={{ 
                borderRadius: 999, 
                height: 8,
                bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 999,
                }
              }} 
            />
          )}

          {queueSummary && (
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textAlign: 'center', display: 'block', opacity: 0.8 }}>
              {queueSummary}
            </Typography>
          )}
        </Stack>
      </Box>
    </Box>
  )
}
