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
          startIcon={<Play size={20} fill="currentColor" />}
          sx={{
            borderRadius: 2.5,
            py: 1.5,
            textTransform: 'none',
            fontWeight: 800,
            fontSize: '1.05rem',
            boxShadow: (theme) => `0 8px 20px ${isDark ? 'rgba(0,0,0,0.4)' : theme.palette.primary.light + '40'}`,
            '&:hover': {
              boxShadow: (theme) => `0 10px 24px ${isDark ? 'rgba(0,0,0,0.5)' : theme.palette.primary.light + '60'}`,
            }
          }}
        >
          {i18nT('multiDownloader.startAll')}
        </Button>
      </Box>
    </Box>
  )
}
