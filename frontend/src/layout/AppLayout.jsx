import React, { useEffect, useState } from 'react'
import { Box, Toolbar } from '@mui/material'
import Header from '../components/Header'
import Sidebar, { drawerWidth as drawerWidthExpanded } from '../components/Sidebar'
import ElectronDependencyBootstrapOverlay from '../components/ElectronDependencyBootstrapOverlay'

import { useNotification } from '../providers/NotificationProvider'
import { getApiBase } from '../utils/metadata'
import { useI18n } from '../providers/I18nProvider'
import useElectronDependencyBootstrap from '../hooks/useElectronDependencyBootstrap'

const drawerWidthCollapsed = 56
const headerHeight = 49
const sidebarHeaderHeight = 49
const SIDEBAR_TRANSITION = '260ms cubic-bezier(0.22, 1, 0.36, 1)'

export default function AppLayout({
  children,
  activePath = '/',
  tabs = [],
  closingTabIds = [],
  activeTabId = '',
  onTabSelect,
  onTabClose,
  onAddTab,
  onTabsReorder,
  onNavigateActiveTab,
  onCloneTab,
  onCloseOtherTabs,
  onCloseTabsToLeft,
  onCloseTabsToRight,
}) {
  const { showNotification } = useNotification()
  const { t } = useI18n()
  const runtime = typeof window !== 'undefined' ? window.yloaderRuntime : null
  const isElectronRuntime = Boolean(runtime?.isElectron)
  const {
    state: dependencyBootstrapState,
    isElectronBootstrapAvailable,
  } = useElectronDependencyBootstrap()
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
    let cancelled = false

    const handleNotificationEntry = (entry) => {
      const tool = String(entry?.tool || '').trim()
      const type = String(entry?.type || '').trim()
      const version = String(entry?.version || '').trim()

      if (tool === 'ytDlp' && type === 'updated' && version) {
        showNotification(t('app.notify.ytDlpUpdated', { version }), 'success')
        return
      }

      if (tool === 'ytDlp' && type === 'installing') {
        showNotification(t('app.notify.ytDlpInstalling', { version: version || t('settings.appUpdateVersionUnknown') }), 'info')
        return
      }

      if (tool === 'ffmpeg' && type === 'updated' && version) {
        showNotification(t('app.notify.ffmpegUpdated', { version }), 'success')
        return
      }

      if (tool === 'ffmpeg' && type === 'installing') {
        showNotification(t('app.notify.ffmpegInstalling', { version: version || t('settings.appUpdateVersionUnknown') }), 'info')
      }
    }

    const pollToolNotifications = async () => {
      try {
        const API_BASE = getApiBase()
        const res = await fetch(`${API_BASE}/api/tool-updates/notifications`)
        if (res.ok) {
          const data = await res.json()
          if (cancelled) return
          const list = Array.isArray(data?.notifications) ? data.notifications : []
          for (const entry of list) {
            handleNotificationEntry(entry)
          }
        }
      } catch {
        // ignore quietly
      }
    }

    pollToolNotifications()
    const interval = window.setInterval(pollToolNotifications, 45_000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
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
  const showDependencyBootstrapOverlay = Boolean(
    isElectronRuntime
    && isElectronBootstrapAvailable
    && dependencyBootstrapState.blocking
  )

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
        onCloneTab={onCloneTab}
        onCloseOtherTabs={onCloseOtherTabs}
        onCloseTabsToLeft={onCloseTabsToLeft}
        onCloseTabsToRight={onCloseTabsToRight}
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
          p: 0,
          width: { sm: `calc(100% - ${sidebarWidth}px)` },
          transition: { sm: `width ${SIDEBAR_TRANSITION}` },
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

      <ElectronDependencyBootstrapOverlay
        state={dependencyBootstrapState}
        isVisible={showDependencyBootstrapOverlay}
      />
    </Box>
  )
}
