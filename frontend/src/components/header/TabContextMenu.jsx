import React from 'react'
import {
  Menu,
  MenuItem,
  Divider,
  ListItemIcon,
  ListItemText,
} from '@mui/material'
import {
  X,
  Copy,
  PanelLeftClose,
  PanelRightClose,
  XSquare,
} from 'lucide-react'

export default function TabContextMenu({
  anchorPosition,
  tabId,
  tabs,
  onClose,
  onCloseTab,
  onCloneTab,
  onCloseOtherTabs,
  onCloseTabsToLeft,
  onCloseTabsToRight,
  t,
}) {
  const tabIndex = React.useMemo(
    () => tabs.findIndex((tab) => tab.id === tabId),
    [tabs, tabId],
  )

  if (!tabId || tabIndex < 0) return null

  const hasTabsToLeft = tabIndex > 0
  const hasTabsToRight = tabIndex < tabs.length - 1
  const hasOtherTabs = tabs.length > 1

  const handle = (fn) => () => {
    fn(tabId)
    onClose()
  }

  return (
    <Menu
      open={Boolean(anchorPosition)}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition ?? undefined}
      slotProps={{
        paper: {
          elevation: 4,
          sx: {
            minWidth: 210,
            '& .MuiMenuItem-root': { transition: 'none' },
            '& .MuiListItemIcon-root': { transition: 'none' },
          },
        },
      }}
      disableAutoFocusItem
    >
      <MenuItem dense onClick={handle(onCloneTab)}>
        <ListItemIcon><Copy size={14} /></ListItemIcon>
        <ListItemText>{t('tabs.contextMenu.cloneTab')}</ListItemText>
      </MenuItem>

      <Divider />

      <MenuItem dense onClick={handle(onCloseTab)}>
        <ListItemIcon><X size={14} /></ListItemIcon>
        <ListItemText>{t('tabs.contextMenu.closeTab')}</ListItemText>
      </MenuItem>

      {hasTabsToLeft && (
        <MenuItem dense onClick={handle(onCloseTabsToLeft)}>
          <ListItemIcon><PanelLeftClose size={14} /></ListItemIcon>
          <ListItemText>{t('tabs.contextMenu.closeTabsToLeft')}</ListItemText>
        </MenuItem>
      )}

      {hasTabsToRight && (
        <MenuItem dense onClick={handle(onCloseTabsToRight)}>
          <ListItemIcon><PanelRightClose size={14} /></ListItemIcon>
          <ListItemText>{t('tabs.contextMenu.closeTabsToRight')}</ListItemText>
        </MenuItem>
      )}

      {hasOtherTabs && (
        <MenuItem dense onClick={handle(onCloseOtherTabs)}>
          <ListItemIcon><XSquare size={14} /></ListItemIcon>
          <ListItemText>{t('tabs.contextMenu.closeOtherTabs')}</ListItemText>
        </MenuItem>
      )}
    </Menu>
  )
}
