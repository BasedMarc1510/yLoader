import React from 'react'
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
} from '@mui/material'
import { Home, Download, Settings, Heart, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { useTheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import { useLocation, Link } from 'react-router-dom'
import SettingsModal from './SettingsModal'
import { useI18n } from '../providers/I18nProvider'

const drawerWidth = 240

export default function Sidebar({ mobileOpen, onClose, collapsed = false, onToggleCollapsed, headerHeight = 49, collapsedWidth = 56 }) {
  const { t: i18nT } = useI18n()
  const t = useTheme()
  const location = useLocation()
  const ICON_SIZE = 20
  const logoLeftOffset = Math.max(0, (collapsedWidth - ICON_SIZE) / 2)
  const [openDownloaders, setOpenDownloaders] = React.useState(true)
  const [openSettings, setOpenSettings] = React.useState(false)

  const handleNavClick = React.useCallback(() => {
    if (typeof onClose === 'function') onClose()
  }, [onClose])
  const items = React.useMemo(() => ([
    { label: i18nT('routes.home'), icon: <Home size={16} />, to: '/' },
    { label: i18nT('routes.downloads'), icon: <Download size={16} />, to: '/downloads' },
    { label: i18nT('routes.support'), icon: <Heart size={16} />, to: '/support' },
  ]), [i18nT])

  const downloaders = React.useMemo(() => ([
    { label: 'YouTube', to: '/youtube-downloader', icon: '/dl-icons/youtube-icon.svg' },
    { label: 'X/Twitter', to: '/x-downloader', icon: '/dl-icons/x-icon.svg' },
    { label: 'Reddit', to: '/reddit-downloader', icon: '/dl-icons/reddit-icon.svg' },
    { label: 'Generic', to: '/generic-downloader', icon: '/dl-icons/generic-icon.svg' },
  ]), [])

  const SidebarTopBar = ({ bg }) => {
    if (collapsed) {
      // Collapsed: center favicon horizontally in collapsed sidebar
      return (
        <Box
          sx={{
            height: headerHeight,
            bgcolor: bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            px: 0,
            borderBottom: (t) => `1px solid ${t.palette.divider}`,
          }}
        >
          <Tooltip title={i18nT('sidebar.expand')}>
            <IconButton
              size="small"
              onClick={onToggleCollapsed}
              aria-label={i18nT('sidebar.expand')}
              sx={{ p: 0.5 }}
            >
              <ChevronRight size={18} />
            </IconButton>
          </Tooltip>
        </Box>
      )
    }
    // Expanded: favicon at same position as collapsed state, then text, then collapse button
    return (
      <Box
        sx={{
          height: headerHeight,
          bgcolor: bg,
          display: 'flex',
          alignItems: 'center',
          px: 0,
          borderBottom: (t) => `1px solid ${t.palette.divider}`,
        }}
      >
        {/* Brand: favicon + yLoader */}
        <Box
          component="a"
          href="/"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            textDecoration: 'none',
            color: 'inherit',
            gap: 1,
            flexGrow: 1,
            justifyContent: 'flex-start',
            pl: `${logoLeftOffset}px`,
          }}
        >
          <Box component="img" src="/favicon.svg" alt="yLoader" sx={{ width: ICON_SIZE, height: ICON_SIZE, display: 'block' }} />
          <Typography
            variant="h6"
            className="youtube-title"
            sx={{ fontWeight: 600, fontFamily: '"YouTube Sans Bold", sans-serif' }}
          >
            yLoader
          </Typography>
        </Box>
  <Tooltip title={i18nT('sidebar.collapse')}>
          <IconButton size="small" onClick={onToggleCollapsed} aria-label={i18nT('sidebar.collapse')} sx={{ mr: 1 }}>
            <ChevronLeft size={18} />
          </IconButton>
        </Tooltip>
      </Box>
    )
  }

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Invisible-looking top bar inside sidebar */}
  <SidebarTopBar bg={t.palette.mode === 'dark' ? '#181818' : '#f9f9f9'} />

      {/* Navigation list */}
      <List sx={{ px: 1, py: 1 }}>
        {items.map((item) => {
          const isActive = location.pathname === item.to
          return (
            <ListItem key={item.label} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton 
                component={Link}
                to={item.to}
                selected={isActive}
                onClick={handleNavClick}
                sx={{
                  borderRadius: 1,
                    minHeight: 28,
                    px: collapsed ? 1 : 0.5,
                    // Compact but comfortable height in expanded state (match collapsed feel)
                    py: collapsed ? undefined : 0.75,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  color: t.palette.mode === 'dark' ? '#ffffff' : '#000000',
                  transition: 'none',
                  '@media (hover: hover) and (pointer: fine)': {
                    '&:hover': {
                      bgcolor: t.palette.mode === 'dark' ? '#303030' : '#f0f0f0',
                    },
                  },
                  '&.Mui-selected': {
                    bgcolor: t.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)',
                    '@media (hover: hover) and (pointer: fine)': {
                      '&:hover': {
                        bgcolor: t.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.12)',
                      },
                    },
                  },
                }}
              >
              <ListItemIcon 
                sx={{ 
                  minWidth: collapsed ? 'auto' : 36,
                  justifyContent: 'center',
                  color: t.palette.mode === 'dark' ? '#ffffff' : '#000000',
                  display: 'flex',
                  alignItems: 'center',
                  height: '100%',
                }}
              >
                {item.icon}
              </ListItemIcon>
              {!collapsed && (
                <ListItemText 
                  primary={item.label}
                  sx={{
                    '& .MuiListItemText-primary': {
                      fontSize: '0.875rem',
                      fontWeight: 400,
                      lineHeight: 1.2,
                      color: t.palette.mode === 'dark' ? '#ffffff' : '#000000',
                    },
                  }}
                />
              )}
            </ListItemButton>
          </ListItem>
          )
        })}

        {/* Downloaders dropdown header (hidden when collapsed) */}
        {!collapsed && (
          <ListItem disablePadding sx={{ mb: 0.5, mt: 1 }}>
            <ListItemButton
              onClick={() => setOpenDownloaders((v) => !v)}
              disableRipple
              sx={{
                borderRadius: 0,
                minHeight: 24,
                px: 0.5,
                py: 0,
                justifyContent: 'flex-start',
                color: t.palette.text.secondary,
                transition: 'none',
                '&:hover': { bgcolor: 'transparent' },
                '&.Mui-focusVisible': { bgcolor: 'transparent' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box component="span" sx={{ fontSize: '0.825rem', fontWeight: 500, color: t.palette.text.secondary }}>{i18nT('sidebar.downloaders')}</Box>
                {openDownloaders ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </Box>
            </ListItemButton>
          </ListItem>
        )}

        <Collapse in={collapsed ? true : openDownloaders} timeout="auto" unmountOnExit>
          <List component="div" disablePadding sx={{ pl: 0 }}>
            {downloaders.map((dl) => {
              const isActive = location.pathname === dl.to
              return (
                <ListItem key={dl.label} disablePadding sx={{ mb: 0.25 }}>
                  <ListItemButton
                    component={Link}
                    to={dl.to}
                    selected={isActive}
                    onClick={handleNavClick}
                    sx={{
                      borderRadius: 1,
                      minHeight: 28,
                      px: collapsed ? 1 : 0.5,
                      py: collapsed ? undefined : 0.5,
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      color: t.palette.mode === 'dark' ? '#ffffff' : '#000000',
                      transition: 'none',
                      '@media (hover: hover) and (pointer: fine)': {
                        '&:hover': {
                          bgcolor: t.palette.mode === 'dark' ? '#303030' : '#f0f0f0',
                        },
                      },
                      '&.Mui-selected': {
                        bgcolor: t.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)',
                        '@media (hover: hover) and (pointer: fine)': {
                          '&:hover': {
                            bgcolor: t.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.12)',
                          },
                        },
                      },
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: collapsed ? 'auto' : 36,
                        justifyContent: 'center',
                        display: 'flex',
                        alignItems: 'center',
                        height: '100%',
                      }}
                    >
                      <Box component="img" src={dl.icon} alt={i18nT('sidebar.iconAlt', { name: dl.label })} sx={{ width: 18, height: 18, display: 'block' }} />
                    </ListItemIcon>
                    {!collapsed && (
                      <ListItemText
                        primary={dl.label}
                        sx={{
                          '& .MuiListItemText-primary': {
                            fontSize: '0.85rem',
                            fontWeight: 400,
                            lineHeight: 1.2,
                            color: t.palette.mode === 'dark' ? '#ffffff' : '#000000',
                          },
                        }}
                      />
                    )}
                  </ListItemButton>
                </ListItem>
              )
            })}
          </List>
        </Collapse>
      </List>

      {/* Footer with Settings button */}
      <Box sx={{ mt: 'auto', px: 1, pb: 1, pt: 1.25, borderTop: (t) => `1px solid ${t.palette.divider}` }}>
        <List sx={{ p: 0 }}>
          <ListItem disablePadding>
            <ListItemButton
              onClick={() => setOpenSettings(true)}
              sx={{
                borderRadius: 1,
                minHeight: 28,
                px: collapsed ? 1 : 0.5,
                py: collapsed ? undefined : 0.75,
                justifyContent: collapsed ? 'center' : 'flex-start',
                color: t.palette.mode === 'dark' ? '#ffffff' : '#000000',
                '@media (hover: hover) and (pointer: fine)': {
                  '&:hover': {
                    bgcolor: t.palette.mode === 'dark' ? '#303030' : '#f0f0f0',
                  },
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: collapsed ? 'auto' : 36,
                  justifyContent: 'center',
                  color: t.palette.mode === 'dark' ? '#ffffff' : '#000000',
                  display: 'flex',
                  alignItems: 'center',
                  height: '100%',
                }}
              >
                <Settings size={16} />
              </ListItemIcon>
              {!collapsed && (
                <ListItemText
                  primary={i18nT('sidebar.settings')}
                  sx={{
                    '& .MuiListItemText-primary': {
                      fontSize: '0.875rem',
                      fontWeight: 400,
                      lineHeight: 1.2,
                      color: t.palette.mode === 'dark' ? '#ffffff' : '#000000',
                    },
                  }}
                />
              )}
            </ListItemButton>
          </ListItem>
        </List>
      </Box>
    </Box>
  )

  return (
    <Box component="nav" sx={{ width: { sm: collapsed ? collapsedWidth : drawerWidth }, flexShrink: { sm: 0 } }} aria-label={i18nT('sidebar.navigationAria')}>
      {/* Temporary drawer on mobile */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', sm: 'none' },
          '& .MuiDrawer-paper': (t) => ({
            boxSizing: 'border-box',
            width: drawerWidth,
            bgcolor: t.palette.mode === 'dark' ? '#181818' : '#f9f9f9',
          }),
        }}
      >
        {drawerContent}
      </Drawer>
      {/* Permanent drawer on desktop */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', sm: 'block' },
          '& .MuiDrawer-paper': (t) => ({
            boxSizing: 'border-box',
            width: collapsed ? collapsedWidth : drawerWidth,
            bgcolor: t.palette.mode === 'dark' ? '#181818' : '#f9f9f9',
            borderRight: 'none',
            overflow: 'visible',
          }),
        }}
        open
      >
        {drawerContent}
      </Drawer>
      <SettingsModal open={openSettings} onClose={() => setOpenSettings(false)} />
    </Box>
  )
}

export { drawerWidth }
