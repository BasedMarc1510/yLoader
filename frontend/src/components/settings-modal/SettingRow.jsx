import React from 'react'
import { Box, Typography, Divider } from '@mui/material'

export default function SettingRow({ label, description, children, noDivider }) {
  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 52,
          px: 0,
          py: 0.5,
          gap: 3,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 500, fontSize: 14, lineHeight: 1.3 }}>
            {label}
          </Typography>
          {description && (
            <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.25, lineHeight: 1.4 }}>
              {description}
            </Typography>
          )}
        </Box>
        <Box sx={{ flexShrink: 0 }}>{children}</Box>
      </Box>
      {!noDivider && <Divider />}
    </>
  )
}
