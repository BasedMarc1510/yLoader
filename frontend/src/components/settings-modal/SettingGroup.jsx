import React from 'react'
import { Box, Typography } from '@mui/material'

export default function SettingGroup({ title, description, children, sx, allowOverflow = false }) {
  return (
    <Box sx={{ mb: 3.5, ...sx }}>
      {(title || description) && (
        <Box sx={{ px: 2, pb: 1 }}>
          {title && (
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {title}
            </Typography>
          )}
          {description && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, lineHeight: 1.4, fontSize: 13 }}>
              {description}
            </Typography>
          )}
        </Box>
      )}
      <Box
        sx={(theme) => ({
          bgcolor: theme.palette.mode === 'dark' ? '#1c1c1e' : '#ffffff',
          borderRadius: '10px',
          overflow: allowOverflow ? 'visible' : 'hidden',
          border: `1px solid ${theme.palette.divider}`,
        })}
      >
        {children}
      </Box>
    </Box>
  )
}
