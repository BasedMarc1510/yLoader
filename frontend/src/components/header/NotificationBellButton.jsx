import React from 'react'
import { Badge, IconButton } from '@mui/material'
import { Bell } from 'lucide-react'
import { useI18n } from '../../providers/I18nProvider'
import { useNotification } from '../../providers/NotificationProvider'

export default function NotificationBellButton({
  className = '',
  disableRipple = false,
  iconSize = 16,
}) {
  const { t } = useI18n()
  const {
    unreadCount,
    isNotificationCenterOpen,
    openNotificationCenter,
    closeNotificationCenter,
  } = useNotification()

  const handleClick = React.useCallback((event) => {
    if (isNotificationCenterOpen) {
      closeNotificationCenter()
      return
    }
    openNotificationCenter(event.currentTarget)
  }, [closeNotificationCenter, isNotificationCenterOpen, openNotificationCenter])

  return (
    <IconButton
      size="small"
      className={className}
      disableRipple={disableRipple}
      aria-label={isNotificationCenterOpen
        ? t('notifications.closeCenterAria')
        : t('notifications.openCenterAria')}
      onClick={handleClick}
    >
      <Badge
        color="error"
        badgeContent={unreadCount > 99 ? 99 : unreadCount}
        invisible={unreadCount <= 0}
        overlap="circular"
      >
        <Bell size={iconSize} />
      </Badge>
    </IconButton>
  )
}
