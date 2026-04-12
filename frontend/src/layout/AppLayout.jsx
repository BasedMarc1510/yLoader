import React, { useEffect, useState } from 'react'
import { Box, Toolbar } from '@mui/material'
import Header from '../components/Header'
import Sidebar, { drawerWidth as drawerWidthExpanded } from '../components/Sidebar'

import { useNotification } from '../providers/NotificationProvider'
import { getApiBase } from '../utils/metadata'
import { useI18n } from '../providers/I18nProvider'

const drawerWidthCollapsed = 56
const headerHeight = 48
const sidebarHeaderHeight = 49

export default function AppLayout({ children }) {
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
    // Check for backend updates (yt-dlp auto-update)
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
      } catch (e) {
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

  return (
    <Box sx={{ display: 'flex' }}>
      <Header onMenuClick={handleDrawerToggle} sidebarWidth={sidebarWidth} />
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={handleClose}
        collapsed={collapsed}
        onToggleCollapsed={handleToggleCollapsed}
        headerHeight={sidebarHeaderHeight}
        collapsedWidth={drawerWidthCollapsed}
      />
      <Box
        component="main"
        sx={(t) => ({
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${sidebarWidth}px)` },
          // Ensure the app uses exactly the viewport height including padding to avoid stray scrollbars
          height: '100dvh',
          boxSizing: 'border-box',
          overflow: 'hidden',
          bgcolor: t.palette.mode === 'dark' ? '#212121' : '#ffffff',
        })}
      >
        {/* Push content below AppBar (match dense height) */}
        <Toolbar variant="dense" sx={{ minHeight: headerHeight }} />
        {/* Provide a stable, non-scrolling viewport for page content (below the header) */}
        <Box sx={{ position: 'relative', height: `calc(100% - ${headerHeight}px)` }}>
          {children}
        </Box>
      </Box>
    </Box>
  )
}
