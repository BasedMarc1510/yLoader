import React from 'react'
import { createPortal } from 'react-dom'
import { Box, IconButton } from '@mui/material'
import { Minus, Square, Copy, X } from 'lucide-react'

export default function WindowControls({
  show,
  isWindowMaximized,
  onMinimize,
  onToggleMaximize,
  onClose,
  styleVars,
  t,
}) {
  if (!show) return null

  const controls = (
    <Box className="yl-window-controls" style={styleVars} role="group" aria-label={t('tabs.windowControlsAria')}>
      <IconButton
        size="small"
        className="yl-window-btn"
        aria-label={t('tabs.windowMinimizeAria')}
        onClick={onMinimize}
      >
        <Minus size={14} />
      </IconButton>

      <IconButton
        size="small"
        className="yl-window-btn"
        aria-label={isWindowMaximized ? t('tabs.windowRestoreAria') : t('tabs.windowMaximizeAria')}
        onClick={onToggleMaximize}
      >
        {isWindowMaximized ? <Copy size={12} /> : <Square size={12} />}
      </IconButton>

      <IconButton
        size="small"
        className="yl-window-btn is-close"
        aria-label={t('tabs.windowCloseAria')}
        onClick={onClose}
      >
        <X size={14} />
      </IconButton>
    </Box>
  )

  if (typeof document === 'undefined') return controls
  return createPortal(controls, document.body)
}
