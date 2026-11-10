import React from 'react'
import { createPortal } from 'react-dom'
import { Box, IconButton } from '@mui/material'
import { Minus, Square, Copy, X } from 'lucide-react'
import NotificationBellButton from './NotificationBellButton'

export default function WindowControls({ controls, styleVars, t }) {
  const [isWindowMaximized, setIsWindowMaximized] = React.useState(false)

  React.useEffect(() => {
    let active = true
    const update = (state) => {
      if (active) setIsWindowMaximized(Boolean(state?.isMaximized))
    }
    const unsubscribe = controls.onStateChange(update)
    controls.getState().then(update).catch(() => {})
    return () => {
      active = false
      unsubscribe()
    }
  }, [controls])

  const controlGroup = (
    <Box className="yl-window-controls" style={styleVars} role="group" aria-label={t('tabs.windowControlsAria')}>
      <NotificationBellButton
        className="yl-window-btn yl-window-btn-notification"
        disableRipple
        iconSize={14}
      />

      <IconButton
        size="small"
        className="yl-window-btn yl-window-btn-control"
        disableRipple
        aria-label={t('tabs.windowMinimizeAria')}
        onClick={() => controls.minimize().catch(() => {})}
      >
        <Minus size={14} />
      </IconButton>

      <IconButton
        size="small"
        className="yl-window-btn yl-window-btn-control"
        disableRipple
        aria-label={isWindowMaximized ? t('tabs.windowRestoreAria') : t('tabs.windowMaximizeAria')}
        onClick={() => controls.toggleMaximize()
          .then((state) => setIsWindowMaximized(Boolean(state?.isMaximized)))
          .catch(() => {})}
      >
        {isWindowMaximized ? <Copy size={12} /> : <Square size={12} />}
      </IconButton>

      <IconButton
        size="small"
        className="yl-window-btn yl-window-btn-control is-close"
        disableRipple
        aria-label={t('tabs.windowCloseAria')}
        onClick={() => controls.close().catch(() => {})}
      >
        <X size={14} />
      </IconButton>
    </Box>
  )

  if (typeof document === 'undefined') return controlGroup
  return createPortal(controlGroup, document.body)
}
