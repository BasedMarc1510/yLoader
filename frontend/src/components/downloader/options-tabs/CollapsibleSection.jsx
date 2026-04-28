import React from 'react'
import { Box, Button, Collapse, Typography } from '@mui/material'
import ChevronIcon from './ChevronIcon'
import { getSectionButtonBg, getSectionButtonBorder, getSectionButtonHover, getSectionButtonShadow } from './styleUtils'

export default function CollapsibleSection({
  variant = 'default',
  id,
  activeSection,
  onToggle,
  disabled,
  isDark,
  textColor,
  icon,
  label,
  children,
  theme,
}) {
  const isOpen = activeSection === id
  const isCompact = variant === 'compact'
  
  const collapseBg = isDark 
    ? (isCompact ? 'rgba(255,255,255,0.02)' : '#272727') 
    : (isCompact ? 'rgba(0,0,0,0.015)' : '#ffffff')

  const buttonBg = isCompact
    ? (isOpen ? (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)') : 'transparent')
    : getSectionButtonBg(isDark, isOpen)

  return (
    <Box sx={{ mb: isCompact ? 0.25 : 0.75 }}>
      <Button
        fullWidth
        disabled={disabled}
        onClick={() => onToggle(id)}
        endIcon={<ChevronIcon isOpen={isOpen} theme={theme} />}
        sx={{
          bgcolor: buttonBg,
          color: textColor,
          borderRadius: isCompact ? '8px' : (isOpen ? '12px 12px 0 0' : '12px'),
          padding: isCompact ? '6px 12px' : '8px 16px',
          textTransform: 'none',
          justifyContent: 'space-between',
          minHeight: 'auto',
          opacity: disabled ? 0.6 : 1,
          border: isCompact ? 'none' : getSectionButtonBorder(isDark, isOpen),
          boxShadow: (isOpen || isCompact) ? 'none' : getSectionButtonShadow(isDark),
          '&:hover': {
            bgcolor: isCompact ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') : getSectionButtonHover(isDark),
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {React.cloneElement(icon, { size: isCompact ? 16 : 18 })}
          <Typography sx={{ fontWeight: isCompact ? 700 : 600, fontSize: isCompact ? '0.85rem' : '1rem' }}>{label}</Typography>
        </Box>
      </Button>
      <Collapse in={isOpen} timeout={250}>
        <Box
          sx={{
            padding: isCompact ? 1.25 : 1.5,
            bgcolor: collapseBg,
            borderRadius: isCompact ? '0 0 8px 8px' : '0 0 12px 12px',
            border: (isDark || isCompact) ? 'none' : '1px solid #dcdee2',
            borderTop: 'none',
            mx: isCompact ? 0.5 : 0
          }}
        >
          {children}
        </Box>
      </Collapse>
    </Box>
  )
}
