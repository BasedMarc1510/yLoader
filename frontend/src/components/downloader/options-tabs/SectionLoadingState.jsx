import React from 'react'
import { Box, CircularProgress, Typography } from '@mui/material'

export default function SectionLoadingState({ text = '', isDark = false }) {
  return (
    <Box
      sx={{
        minHeight: 72,
        display: 'grid',
        placeItems: 'center',
        py: 1,
      }}
    >
      <Box sx={{ display: 'grid', justifyItems: 'center', gap: 0.8 }}>
        <CircularProgress size={18} thickness={5} />
        <Typography
          variant="caption"
          sx={{
            color: isDark ? '#a7adbb' : '#5e6675',
            fontWeight: 600,
            textAlign: 'center',
          }}
        >
          {text}
        </Typography>
      </Box>
    </Box>
  )
}