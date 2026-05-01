import React from 'react'
import {
  Box,
  Button,
  CircularProgress,
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
  const isDownloading = activeCount > 0

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
          p: 1.5,
          borderRadius: 3.5,
          bgcolor: isDark ? 'rgba(30,30,30,0.8)' : 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(16px) saturate(180%)',
          border: '1px solid',
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
          boxShadow: isDark 
            ? '0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)' 
            : '0 12px 40px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.02)',
        }}
      >
        <Button
          fullWidth
          variant="contained"
          onClick={onStartAll}
          disabled={startAllDisabled}
          sx={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 2.5,
            py: 1.5,
            textTransform: 'none',
            fontWeight: 800,
            fontSize: '1.05rem',
            boxShadow: (theme) => `0 8px 20px ${isDark ? 'rgba(0,0,0,0.4)' : theme.palette.primary.light + '40'}`,
            '&:hover': {
              boxShadow: (theme) => `0 10px 24px ${isDark ? 'rgba(0,0,0,0.5)' : theme.palette.primary.light + '60'}`,
            },
            '&.Mui-disabled': isDownloading ? {
                bgcolor: isDark ? '#444' : '#c8cad0',
                color: isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.6)',
                boxShadow: 'none',
            } : undefined
          }}
        >
          {isDownloading && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                width: `${overallProgress}%`,
                bgcolor: 'rgba(255,255,255,0.15)',
                transition: 'width 0.2s linear',
                zIndex: 0,
                height: '100%',
              }}
            />
          )}
          
          <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, width: '100%' }}>
            {isDownloading ? (
              <>
                <CircularProgress size={20} color="inherit" sx={{ color: 'inherit' }} thickness={5} />
                <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, lineHeight: 1 }}>
                  {overallProgress}%
                </Typography>
              </>
            ) : (
              <>
                <Play size={20} fill="currentColor" />
                <Box component="span">{i18nT('multiDownloader.startAll')}</Box>
              </>
            )}
          </Box>
        </Button>
      </Box>
    </Box>
  )
}
