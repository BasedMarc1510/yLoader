import React, { useEffect, useState } from 'react'
import { Box, Toolbar } from '@mui/material'
import Header from '../components/Header'
import Sidebar, { drawerWidth as drawerWidthExpanded } from '../components/Sidebar'

import { useNotification } from '../providers/NotificationProvider'
import { getApiBase } from '../utils/metadata'
import { useI18n } from '../providers/I18nProvider'

const drawerWidthCollapsed = 56
const headerHeight = 49
const sidebarHeaderHeight = 49

export default function AppLayout({
  children,
  activePath = '/',
  activeSearch = '',
  tabs = [],
  closingTabIds = [],
  activeTabId = '',
  onTabSelect,
  onTabClose,
  onAddTab,
  onTabsReorder,
  onNavigateActiveTab,
}) {
  const { showNotification } = useNotification()
  const { t } = useI18n()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('sidebarCollapsed')
      return saved ? JSON.parse(saved) === true : false
    } catch {
      return false
    }
  })

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const API_BASE = getApiBase()
        const res = await fetch(`${API_BASE}/api/yt-dlp/update-notification`)
        if (res.ok) {
          const data = await res.json()
          if (data.show && data.version) {
            showNotification(t('app.notify.ytDlpUpdated', { version: data.version }), 'success')
          }
        }
      } catch {
        // ignore quietly
      }
    }
    checkUpdate()
  }, [showNotification, t])

  useEffect(() => {
    try {
      localStorage.setItem('sidebarCollapsed', JSON.stringify(collapsed))
    } catch {
      // ignore persistence errors
    }
  }, [collapsed])

  const handleDrawerToggle = () => setMobileOpen((prev) => !prev)
  const handleClose = () => setMobileOpen(false)
  const handleToggleCollapsed = () => setCollapsed((v) => !v)

  const sidebarWidth = collapsed ? drawerWidthCollapsed : drawerWidthExpanded
  const hasHomeQuery = React.useMemo(() => {
    if (activePath !== '/') return false
    const rawSearch = String(activeSearch || '').trim()
    if (!rawSearch) return false

    const normalizedSearch = rawSearch.startsWith('?') ? rawSearch.slice(1) : rawSearch
    const params = new URLSearchParams(normalizedSearch)
    return Boolean(String(params.get('url') || '').trim())
  }, [activePath, activeSearch])

  return (
    <Box sx={{ display: 'flex' }}>
      <Header
        onMenuClick={handleDrawerToggle}
        sidebarWidth={sidebarWidth}
        tabs={tabs}
        closingTabIds={closingTabIds}
        activeTabId={activeTabId}
        onTabSelect={onTabSelect}
        onTabClose={onTabClose}
        onAddTab={onAddTab}
        onTabsReorder={onTabsReorder}
      />
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={handleClose}
        collapsed={collapsed}
        onToggleCollapsed={handleToggleCollapsed}
        headerHeight={sidebarHeaderHeight}
        collapsedWidth={drawerWidthCollapsed}
        activePath={activePath}
        onNavigate={onNavigateActiveTab}
      />
      <Box
        component="main"
        sx={(muiTheme) => ({
          flexGrow: 1,
          p: hasHomeQuery ? 0 : 3,
          width: { sm: `calc(100% - ${sidebarWidth}px)` },
          height: '100dvh',
          boxSizing: 'border-box',
          overflow: 'hidden',
          bgcolor: muiTheme.palette.mode === 'dark' ? '#212121' : '#ffffff',
        })}
      >
        <Toolbar variant="dense" sx={{ minHeight: `${headerHeight}px !important`, height: headerHeight }} />
        <Box sx={{ position: 'relative', height: `calc(100% - ${headerHeight}px)` }}>
          {children}
        </Box>
      </Box>
    </Box>
  )
}
