import React from 'react'
import { AppBar, Box, IconButton, Toolbar, Typography } from '@mui/material'
import { Menu, Home, Download, Heart } from 'lucide-react'
import { Box as ImageBox } from '@mui/material'
import { useLocation } from 'react-router-dom'
import { useI18n } from '../providers/I18nProvider'

export default function Header({ onMenuClick, sidebarWidth = 240 }) {
  const { t } = useI18n()
  const location = useLocation()

  // Define route info (title + icon)
  const getRouteInfo = () => {
    switch (location.pathname) {
      case '/downloads':
        return { title: t('routes.downloads'), icon: <Download size={18} /> }
      case '/support':
        return { title: t('routes.support'), icon: <Heart size={18} /> }
      case '/youtube-downloader':
        return { title: t('routes.youtubeDownloader'), icon: <ImageBox component="img" src="/dl-icons/youtube-icon.svg" alt="YouTube" sx={{ width: 20, height: 20 }} /> }
      case '/reddit-downloader':
        return { title: t('routes.redditDownloader'), icon: <ImageBox component="img" src="/dl-icons/reddit-icon.svg" alt="Reddit" sx={{ width: 20, height: 20 }} /> }
      case '/x-downloader':
        return { title: t('routes.xDownloader'), icon: <ImageBox component="img" src="/dl-icons/x-icon.svg" alt="X/Twitter" sx={{ width: 20, height: 20 }} /> }
      case '/':
      default:
        return { title: t('routes.home'), icon: <Home size={18} /> }
    }
  }

  const { title, icon } = getRouteInfo()

  return (
    <AppBar
      position="fixed"
      elevation={0}
      color="transparent"
      sx={(t) => ({
        zIndex: t.zIndex.drawer + 1,
        ml: { sm: `${sidebarWidth}px` },
        width: { sm: `calc(100% - ${sidebarWidth}px)` },
        bgcolor: t.palette.mode === 'dark' ? '#212121' : '#ffffff',
        backdropFilter: 'saturate(180%) blur(4px)',
        borderBottom: `1px solid ${t.palette.divider}`,
      })}
    >
      <Toolbar variant="dense" sx={{ minHeight: 48 }}>
        <IconButton
          color="inherit"
          aria-label={t('sidebar.navigationAria')}
          edge="start"
          onClick={onMenuClick}
          size="small"
          sx={{ mr: 1, display: { xs: 'inline-flex', sm: 'none' } }}
        >
          <Menu size={18} />
        </IconButton>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1 }}>
          {icon}
          <Typography variant="subtitle1" noWrap component="div" sx={{ userSelect: 'none' }}>
            {title}
          </Typography>
        </Box>
      </Toolbar>
    </AppBar>
  )
}
