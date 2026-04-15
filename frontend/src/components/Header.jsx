import React from 'react'
import {
  AppBar,
  Box,
  IconButton,
  Toolbar,
} from '@mui/material'
import { Menu } from 'lucide-react'
import { useTheme } from '@mui/material/styles'
import { useI18n } from '../providers/I18nProvider'
import HeaderTabBar from './header/HeaderTabBar'

export default function Header({
  onMenuClick,
  sidebarWidth = 240,
  tabs = [],
  closingTabIds = [],
  activeTabId = '',
  onTabSelect,
  onTabClose,
  onAddTab,
  onTabsReorder,
  onCloneTab,
  onCloseOtherTabs,
  onCloseTabsToLeft,
  onCloseTabsToRight,
}) {
  const { t } = useI18n()
  const theme = useTheme()
  const sidebarBg = theme.palette.mode === 'dark' ? '#181818' : '#f9f9f9'
  const mainBg = theme.palette.mode === 'dark' ? '#212121' : '#ffffff'

  return (
    <AppBar
      position="fixed"
      elevation={0}
      color="transparent"
      sx={(muiTheme) => ({
        zIndex: muiTheme.zIndex.drawer + 1,
        left: { sm: `${sidebarWidth}px` },
        width: { sm: `calc(100% - ${sidebarWidth}px)` },
        bgcolor: sidebarBg,
        borderBottom: 'none',
        borderLeft: '0 !important',
        boxShadow: 'none',
      })}
    >
      <Toolbar disableGutters variant="dense" sx={{ minHeight: '49px !important', height: 49, alignItems: 'center' }}>
        <IconButton
          color="inherit"
          aria-label={t('sidebar.navigationAria')}
          edge="start"
          onClick={onMenuClick}
          size="small"
          sx={{ ml: 1, mr: 1, display: { xs: 'inline-flex', sm: 'none' } }}
        >
          <Menu size={18} />
        </IconButton>

        <HeaderTabBar
          t={t}
          theme={theme}
          sidebarBg={sidebarBg}
          mainBg={mainBg}
          tabs={tabs}
          closingTabIds={closingTabIds}
          activeTabId={activeTabId}
          onTabSelect={onTabSelect}
          onTabClose={onTabClose}
          onAddTab={onAddTab}
          onTabsReorder={onTabsReorder}
          onCloneTab={onCloneTab}
          onCloseOtherTabs={onCloseOtherTabs}
          onCloseTabsToLeft={onCloseTabsToLeft}
          onCloseTabsToRight={onCloseTabsToRight}
        />
      </Toolbar>
    </AppBar>
  )
}
