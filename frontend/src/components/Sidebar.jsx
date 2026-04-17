import React from 'react'
import {
  Badge,
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from '@mui/material'
import { Home, Search, Download, Settings, Heart, ChevronLeft, ChevronRight } from 'lucide-react'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { useTheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import SettingsModal from './SettingsModal'
import { useI18n } from '../providers/I18nProvider'
import useElectronAppUpdater from '../hooks/useElectronAppUpdater'
import { getApiBase } from '../utils/metadata'

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
  const isDarkMode = t.palette.mode === 'dark'
  /** Inaktive Einträge etwas gedämpft, aktiv voller Kontrast (an klassischer MUI-Sidebar-Navi orientiert). */
  const sidebarNav = {
    fgActive: isDarkMode ? '#ffffff' : '#0f0f0f',
    fgInactive: isDarkMode ? 'rgba(255, 255, 255, 0.52)' : 'rgba(0, 0, 0, 0.52)',
    iconInactive: isDarkMode ? 'rgba(255, 255, 255, 0.48)' : 'rgba(0, 0, 0, 0.48)',
  }
  const sidebarNavTextWeight = 700
  const sidebarIconStroke = 2.5
  const ICON_SIZE = 20
  const logoLeftOffset = Math.max(0, (collapsedWidth - ICON_SIZE) / 2)
  const expandedLeftInset = 1
  const MAC_TRAFFIC_LIGHTS_LEFT_GUTTER = 72
  const MAC_TRAFFIC_LIGHTS_TOP_OFFSET = 8
  const [openSettings, setOpenSettings] = React.useState(false)
  const [settingsSection, setSettingsSection] = React.useState('general')
  const [settingsFocusTarget, setSettingsFocusTarget] = React.useState('')
  const [settingsFocusRequestId, setSettingsFocusRequestId] = React.useState('')
  const {
    state: appUpdateState,
    isElectronUpdaterAvailable,
    checkForUpdates: checkForAppUpdates,
    downloadUpdate: downloadAppUpdate,
    quitAndInstall: installAppUpdate,
  } = useElectronAppUpdater()
  const runtime = typeof window !== 'undefined' ? window.yloaderRuntime : null
  const isElectron = Boolean(
    runtime
    && runtime.isElectron
  )
  const isMacElectron = Boolean(runtime?.platform === 'darwin')
  const showMacInlineExpand = collapsed && isMacElectron
  const brandLeftPadding = logoLeftOffset + 8
  const brandIconSrc = `${import.meta.env.BASE_URL}yloader-icon.svg`
  const API_BASE = getApiBase()
  const [toolUpdateSummary, setToolUpdateSummary] = React.useState({
    anyUpdateAvailable: false,
    anyUpdateInProgress: false,
    ytDlp: { updateAvailable: false, updateInProgress: false, updateSupported: true },
    ffmpeg: { updateAvailable: false, updateInProgress: false, updateSupported: true },
  })
  const updatePhase = String(appUpdateState?.phase || 'idle').trim()
  const hasAppUpdateBadge = isElectronUpdaterAvailable
    && (updatePhase === 'update-available' || updatePhase === 'downloading' || updatePhase === 'downloaded')
  const hasToolUpdateBadge = Boolean(toolUpdateSummary.anyUpdateAvailable)
  const showSettingsUpdateBadge = hasAppUpdateBadge || hasToolUpdateBadge
  const settingsBadgeColor = updatePhase === 'downloaded'
    ? 'error'
    : (hasToolUpdateBadge ? 'warning' : 'info')

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const onOpenSettings = (event) => {
      const requestedSection = String(event?.detail?.section || 'general').trim() || 'general'
      const requestedTarget = String(event?.detail?.target || '').trim()
      const requestId = String(event?.detail?.requestId || `${Date.now()}`).trim()
      setSettingsSection(requestedSection)
      setSettingsFocusTarget(requestedTarget)
      setSettingsFocusRequestId(requestId)
      setOpenSettings(true)
    }

    window.addEventListener('yloader:open-settings', onOpenSettings)
    return () => window.removeEventListener('yloader:open-settings', onOpenSettings)
  }, [])

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined

    let cancelled = false

    const fetchSummary = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/tool-updates/summary`)
        if (!response.ok) return
        const data = await response.json()
        if (cancelled) return

        setToolUpdateSummary({
          anyUpdateAvailable: Boolean(data?.anyUpdateAvailable),
          anyUpdateInProgress: Boolean(data?.anyUpdateInProgress),
          ytDlp: {
            updateAvailable: Boolean(data?.ytDlp?.updateAvailable),
            updateInProgress: Boolean(data?.ytDlp?.updateInProgress),
            updateSupported: data?.ytDlp?.updateSupported !== false,
          },
          ffmpeg: {
            updateAvailable: Boolean(data?.ffmpeg?.updateAvailable),
            updateInProgress: Boolean(data?.ffmpeg?.updateInProgress),
            updateSupported: data?.ffmpeg?.updateSupported !== false,
          },
        })
      } catch {
        // ignore polling errors
      }
    }

    fetchSummary()
    const interval = window.setInterval(fetchSummary, 90_000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [API_BASE])

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
    { label: i18nT('routes.home'), icon: <Home size={16} strokeWidth={sidebarIconStroke} />, to: '/' },
    { label: i18nT('routes.search'), icon: <Search size={16} strokeWidth={sidebarIconStroke} />, to: '/search' },
    { label: i18nT('routes.downloads'), icon: <Download size={16} strokeWidth={sidebarIconStroke} />, to: '/downloads' },
    { label: i18nT('routes.support'), icon: <Heart size={16} strokeWidth={sidebarIconStroke} />, to: '/support' },
  ]), [i18nT, sidebarIconStroke])

  const SidebarTopBar = ({ bg }) => {
    if (collapsed) {
      if (isMacElectron) {
        return (
          <Box
            className={`yl-sidebar-topbar ${isElectron ? 'is-electron' : ''}`}
            sx={{
              height: headerHeight,
              bgcolor: bg,
              borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
              borderRight: 'none',
            }}
          />
        )
      }

      return (
        <Box
          className={`yl-sidebar-topbar ${isElectron ? 'is-electron' : ''}`}
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
              className="yl-sidebar-topbar-action"
              size="small"
              onClick={onToggleCollapsed}
              aria-label={i18nT('sidebar.expand')}
              sx={{ p: 0.5 }}
            >
              <ChevronRight size={18} strokeWidth={sidebarIconStroke} />
            </IconButton>
          </Tooltip>
        </Box>
      )
    }

    return (
      <Box
        className={`yl-sidebar-topbar ${isElectron ? 'is-electron' : ''}`}
        sx={{
          height: headerHeight,
          bgcolor: bg,
          display: 'flex',
          alignItems: isMacElectron ? 'flex-end' : 'center',
          px: 0,
          position: 'relative',
          pt: isMacElectron ? `${MAC_TRAFFIC_LIGHTS_TOP_OFFSET}px` : 0,
          pb: isMacElectron ? 0.5 : 0,
          borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
          borderRight: 'none',
        }}
      >
        {isMacElectron && (
          <Box
            aria-hidden="true"
            sx={{
              width: `${MAC_TRAFFIC_LIGHTS_LEFT_GUTTER}px`,
              flexShrink: 0,
              alignSelf: 'stretch',
              pointerEvents: 'none',
            }}
          />
        )}

        <Box
          component="button"
          className="yl-sidebar-topbar-brand"
          type="button"
          onClick={() => handleNavigate('/')}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            textDecoration: 'none',
            color: 'inherit',
            gap: 1,
            flexShrink: 0,
            minWidth: 0,
            justifyContent: 'flex-start',
            pl: `${brandLeftPadding}px`,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            position: 'relative',
            zIndex: 2,
            py: 0,
            pr: 0,
          }}
        >
          <Box component="img" src={brandIconSrc} alt="yLoader" sx={{ width: ICON_SIZE, height: ICON_SIZE, display: 'block' }} />
          <Typography
            variant="h6"
            className="youtube-title"
            sx={{ fontWeight: 700 }}
          >
            yLoader
          </Typography>
        </Box>

        <Box className="yl-sidebar-topbar-drag-fill" aria-hidden="true" />

        <Tooltip title={i18nT('sidebar.collapse')}>
          <IconButton
            className="yl-sidebar-topbar-action"
            size="small"
            onClick={onToggleCollapsed}
            aria-label={i18nT('sidebar.collapse')}
            sx={{ mr: 1, cursor: 'pointer', position: 'relative', zIndex: 3 }}
          >
            <ChevronLeft size={18} strokeWidth={sidebarIconStroke} />
          </IconButton>
        </Tooltip>
      </Box>
    )
  }

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SidebarTopBar bg={sidebarBg} />

      <List sx={{ px: 1, py: 1 }}>
        {showMacInlineExpand && (
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            {withCollapsedTooltip(
              <ListItemButton
                onClick={onToggleCollapsed}
                aria-label={i18nT('sidebar.expand')}
                sx={{
                  borderRadius: 1,
                  minHeight: 28,
                  px: 1,
                  justifyContent: 'center',
                  color: sidebarNav.fgInactive,
                  transition: 'none',
                  '@media (hover: hover) and (pointer: fine)': {
                    '&:hover': {
                      bgcolor: isDarkMode ? '#303030' : '#f0f0f0',
                      color: sidebarNav.fgActive,
                    },
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 'auto',
                    justifyContent: 'center',
                    color: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    height: '100%',
                    transition: 'none',
                  }}
                >
                  <ChevronRight size={16} strokeWidth={sidebarIconStroke} />
                </ListItemIcon>
              </ListItemButton>,
              i18nT('sidebar.expand'),
            )}
          </ListItem>
        )}

        {items.map((item) => {
          const isActive = activePath === item.to
          const rowColor = isActive ? sidebarNav.fgActive : sidebarNav.fgInactive
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
                    color: rowColor,
                    transition: 'none',
                    '@media (hover: hover) and (pointer: fine)': {
                      '&:hover': {
                        bgcolor: isDarkMode ? '#303030' : '#f0f0f0',
                        color: sidebarNav.fgActive,
                        '& .MuiListItemIcon-root': {
                          color: sidebarNav.fgActive,
                        },
                      },
                    },
                    '&.Mui-selected': {
                      color: sidebarNav.fgActive,
                      bgcolor: isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)',
                      '@media (hover: hover) and (pointer: fine)': {
                        '&:hover': {
                          bgcolor: isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.12)',
                        },
                      },
                      '& .MuiListItemIcon-root': {
                        color: sidebarNav.fgActive,
                      },
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: collapsed ? 'auto' : 36,
                      justifyContent: 'center',
                      color: isActive ? sidebarNav.fgActive : sidebarNav.iconInactive,
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
                          fontWeight: sidebarNavTextWeight,
                          lineHeight: 1.2,
                          color: 'inherit',
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
                onClick={() => {
                  setSettingsSection('general')
                  setSettingsFocusTarget('')
                  setSettingsFocusRequestId(String(Date.now()))
                  setOpenSettings(true)
                }}
                sx={{
                  borderRadius: 1,
                  minHeight: 28,
                  px: collapsed ? 1 : expandedLeftInset,
                  py: collapsed ? undefined : 0.75,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  color: sidebarNav.fgInactive,
                  transition: 'none',
                  '@media (hover: hover) and (pointer: fine)': {
                    '&:hover': {
                      bgcolor: isDarkMode ? '#303030' : '#f0f0f0',
                      color: sidebarNav.fgActive,
                      '& .MuiListItemIcon-root': {
                        color: sidebarNav.fgActive,
                      },
                    },
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: collapsed ? 'auto' : 36,
                    justifyContent: 'center',
                    color: sidebarNav.iconInactive,
                    display: 'flex',
                    alignItems: 'center',
                    height: '100%',
                    transition: 'none',
                  }}
                >
                  <Badge
                    variant="dot"
                    color={settingsBadgeColor}
                    overlap="circular"
                    invisible={!showSettingsUpdateBadge}
                    anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                  >
                    <Settings size={16} strokeWidth={sidebarIconStroke} />
                  </Badge>
                </ListItemIcon>
                {!collapsed && (
                  <ListItemText
                    primary={i18nT('sidebar.settings')}
                    sx={{
                      '& .MuiListItemText-primary': {
                        fontSize: '0.875rem',
                        fontWeight: sidebarNavTextWeight,
                        lineHeight: 1.2,
                        color: 'inherit',
                        transition: 'none',
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
      <SettingsModal
        open={openSettings}
        onClose={() => setOpenSettings(false)}
        requestedSection={settingsSection}
        requestedFocusTarget={settingsFocusTarget}
        requestedFocusRequestId={settingsFocusRequestId}
        onToolUpdateSummaryChange={setToolUpdateSummary}
        appUpdateState={appUpdateState}
        isElectronUpdaterAvailable={isElectronUpdaterAvailable}
        checkForAppUpdates={checkForAppUpdates}
        downloadAppUpdate={downloadAppUpdate}
        installAppUpdate={installAppUpdate}
      />
    </Box>
  )
}

export { drawerWidth }
