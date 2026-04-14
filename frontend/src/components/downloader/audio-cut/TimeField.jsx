import React from 'react'
import { Box, Typography } from '@mui/material'

export default function TimeField({ label, value, onChange, onCommit, isDark, disabled, textColor }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <Typography
        variant="caption"
        sx={{ color: isDark ? '#777' : '#888', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}
      >
        {label}
      </Typography>
      <Box
        component="input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        disabled={disabled}
        sx={{
          width: 72,
          px: 1,
          py: '4px',
          border: `1px solid ${isDark ? '#3a3a3a' : '#d0d0d0'}`,
          borderRadius: '6px',
          bgcolor: isDark ? '#1a1a1a' : '#fff',
          color: textColor,
          fontSize: '0.82rem',
          fontFamily: 'monospace',
          textAlign: 'center',
          outline: 'none',
          cursor: disabled ? 'default' : 'text',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s',
          '&:focus': { borderColor: isDark ? '#666' : '#aaa' },
          '&:disabled': { opacity: 0.45, cursor: 'default' },
        }}
      />
    </Box>
  )
}
