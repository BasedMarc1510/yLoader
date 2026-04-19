import React from 'react'
import { Box, Typography, Divider } from '@mui/material'

export default function SettingRow({ label, description, children, noDivider, stacked = false }) {
  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: stacked ? 'flex-start' : { xs: 'flex-start', sm: 'center' },
          flexDirection: stacked ? 'column' : { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          minHeight: 44,
          px: 2,
          py: 1.25,
          gap: stacked ? 1.25 : { xs: 1.5, sm: 3 },
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 400, fontSize: 15, color: 'text.primary', lineHeight: 1.3 }}>
            {label}
          </Typography>
          {description && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25, lineHeight: 1.4, fontSize: 13 }}>
              {description}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            flexShrink: 0,
            width: stacked ? '100%' : { xs: '100%', sm: 'auto' },
            display: 'flex',
            justifyContent: stacked ? 'flex-start' : { xs: 'flex-start', sm: 'flex-end' },
          }}
        >
          {children}
        </Box>
      </Box>
      {!noDivider && <Divider sx={{ ml: 2 }} />}
    </>
  )
}
