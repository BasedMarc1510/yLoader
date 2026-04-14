import React from 'react'
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from '@mui/material'
import { Home, Download, Settings, Heart, ChevronLeft, ChevronRight } from 'lucide-react'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { useTheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import SettingsModal from './SettingsModal'
import { useI18n } from '../providers/I18nProvider'

const drawerWidth = 240

export default function Sidebar({
  mobileOpen,
  onClose,
  collapsed = false,
  onToggleCollapsed,
  headerHeight = 49,
  collapsedWidth = 56,
  activePath = '/',
  onNavigate,
}) {
  const { t: i18nT } = useI18n()
  const t = useTheme()
  const sidebarBg = t.palette.mode === 'dark' ? '#181818' : '#f9f9f9'
  const ICON_SIZE = 20
  const logoLeftOffset = Math.max(0, (collapsedWidth - ICON_SIZE) / 2)
  const expandedLeftInset = 1
  const [openSettings, setOpenSettings] = React.useState(false)

  const withCollapsedTooltip = (node, title) => (
    collapsed
      ? (
        <Tooltip title={title} placement="right" enterDelay={200}>
          {node}
        </Tooltip>
      )
      : node
  )

  const handleNavClick = React.useCallback(() => {
    if (typeof onClose === 'function') onClose()
  }, [onClose])

  const handleNavigate = React.useCallback((to) => {
    onNavigate?.(to, '')
    handleNavClick()
  }, [handleNavClick, onNavigate])

  const items = React.useMemo(() => ([
    { label: i18nT('routes.home'), icon: <Home size={16} />, to: '/' },
    { label: i18nT('routes.downloads'), icon: <Download size={16} />, to: '/downloads' },
    { label: i18nT('routes.support'), icon: <Heart size={16} />, to: '/support' },
  ]), [i18nT])

  const SidebarTopBar = ({ bg }) => {
    if (collapsed) {
      return (
        <Box
          sx={{
            height: headerHeight,
            bgcolor: bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            px: 0,
            borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
            borderRight: 'none',
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

    return (
      <Box
        sx={{
          height: headerHeight,
          bgcolor: bg,
          display: 'flex',
          alignItems: 'center',
          px: 0,
          position: 'relative',
          borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
          borderRight: 'none',
        }}
      >
        <Box
          component="button"
          type="button"
          onClick={() => handleNavigate('/')}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            textDecoration: 'none',
            color: 'inherit',
            gap: 1,
            flexGrow: 1,
            minWidth: 0,
            justifyContent: 'flex-start',
            pl: `calc(${logoLeftOffset}px + 8px)`,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            position: 'relative',
            zIndex: 2,
            py: 0,
            pr: 0,
          }}
        >
          <Box component="img" src="/favicon.svg" alt="yLoader" sx={{ width: ICON_SIZE, height: ICON_SIZE, display: 'block' }} />
          <Typography
            variant="h6"
            className="youtube-title"
            sx={{ fontWeight: 600 }}
          >
            yLoader
          </Typography>
        </Box>
        <Tooltip title={i18nT('sidebar.collapse')}>
          <IconButton
            size="small"
            onClick={onToggleCollapsed}
            aria-label={i18nT('sidebar.collapse')}
            sx={{ mr: 1, cursor: 'pointer', position: 'relative', zIndex: 3 }}
          >
            <ChevronLeft size={18} />
          </IconButton>
        </Tooltip>
      </Box>
    )
  }

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SidebarTopBar bg={sidebarBg} />

      <List sx={{ px: 1, py: 1 }}>
        {items.map((item) => {
          const isActive = activePath === item.to
          return (
            <ListItem key={item.label} disablePadding sx={{ mb: 0.5 }}>
              {withCollapsedTooltip(
                <ListItemButton
                  selected={isActive}
                  onClick={() => handleNavigate(item.to)}
                  sx={{
                    borderRadius: 1,
                    minHeight: 28,
                    px: collapsed ? 1 : expandedLeftInset,
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
                </ListItemButton>,
                item.label,
              )}
            </ListItem>
          )
        })}

      </List>

      <Box sx={{ mt: 'auto', px: 1, pb: 1, pt: 1.25, borderTop: (theme) => `1px solid ${theme.palette.divider}` }}>
        <List sx={{ p: 0 }}>
          <ListItem disablePadding>
            {withCollapsedTooltip(
              <ListItemButton
                onClick={() => setOpenSettings(true)}
                sx={{
                  borderRadius: 1,
                  minHeight: 28,
                  px: collapsed ? 1 : expandedLeftInset,
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
              </ListItemButton>,
              i18nT('sidebar.settings'),
            )}
          </ListItem>
        </List>
      </Box>
    </Box>
  )

  return (
    <Box component="nav" sx={{ width: { sm: collapsed ? collapsedWidth : drawerWidth }, flexShrink: { sm: 0 } }} aria-label={i18nT('sidebar.navigationAria')}>
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', sm: 'none' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: drawerWidth,
            bgcolor: sidebarBg,
            borderRight: '0 !important',
          },
          '& .MuiDrawer-paperAnchorLeft': {
            borderRight: '0 !important',
          },
        }}
      >
        {drawerContent}
      </Drawer>

      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', sm: 'block' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: collapsed ? collapsedWidth : drawerWidth,
            bgcolor: sidebarBg,
            borderRight: '0 !important',
            overflow: 'visible',
          },
          '& .MuiDrawer-paperAnchorDockedLeft': {
            borderRight: '0 !important',
          },
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
