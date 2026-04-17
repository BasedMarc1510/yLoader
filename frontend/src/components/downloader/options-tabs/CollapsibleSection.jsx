import React from 'react'
import { Box, Button, Collapse, Typography } from '@mui/material'
import ChevronIcon from './ChevronIcon'
import { getSectionButtonBg, getSectionButtonBorder, getSectionButtonHover, getSectionButtonShadow } from './styleUtils'

export default function CollapsibleSection({
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
  const collapseBg = isDark ? '#272727' : '#ffffff'

  return (
    <Box sx={{ mb: 0.75 }}>
      <Button
        fullWidth
        disabled={disabled}
        onClick={() => onToggle(id)}
        endIcon={<ChevronIcon isOpen={isOpen} theme={theme} />}
        sx={{
          bgcolor: getSectionButtonBg(isDark, isOpen),
          color: textColor,
          borderRadius: isOpen ? '12px 12px 0 0' : '12px',
          padding: '8px 16px',
          textTransform: 'none',
          justifyContent: 'space-between',
          minHeight: 'auto',
          opacity: disabled ? 0.6 : 1,
          border: getSectionButtonBorder(isDark, isOpen),
          boxShadow: isOpen ? 'none' : getSectionButtonShadow(isDark),
          '&:hover': {
            bgcolor: getSectionButtonHover(isDark),
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {icon}
          <Typography sx={{ fontWeight: 600 }}>{label}</Typography>
        </Box>
      </Button>
      <Collapse in={isOpen} timeout={250}>
        <Box
          sx={{
            padding: 1.5,
            bgcolor: collapseBg,
            borderRadius: '0 0 12px 12px',
            border: isDark ? 'none' : '1px solid #dcdee2',
            borderTop: 'none',
          }}
        >
          {children}
        </Box>
      </Collapse>
    </Box>
  )
}
