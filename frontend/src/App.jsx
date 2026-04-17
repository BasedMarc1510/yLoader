import React from 'react'
import {
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material'
import AppLayout from './layout/AppLayout'
import Downloader from './pages/Downloader'
import SupportPage from './pages/Support'
import DownloadsPage from './pages/Downloads'
import HomePage from './pages/HomePage'
import SearchPage from './pages/Search'
import { useI18n } from './providers/I18nProvider'
import {
  getServiceForPath,
  normalizeTabPath,
  normalizeTabSearch,
} from './utils/tabRoutes'
import {
  getPanelDomId,
  getTabDomId,
  hasUrlInSearch,
} from './utils/tabState'
import { useTabsController } from './hooks/useTabsController'
import { useGlobalTabShortcuts } from './hooks/useGlobalTabShortcuts'

export default function App() {
  const { t } = useI18n()

  const {
    tabs,
    activeTab,
    activeTabId,
    closeWarning,
    closingTabIds,
    setActiveTabId,
    setCloseWarning,
    getDisplayTabTitle,
    navigateTab,
    navigateActiveTab,
    openDownloaderInTab,
    openDownloaderInNewTab,
    selectRelativeTab,
    handleRequestCloseTab,
    handleConfirmClose,
    handleAddTab,
    handleCloneTab,
    handleCloseOtherTabs,
    handleCloseTabsToLeft,
    handleCloseTabsToRight,
    handleTabsReorder,
    handleTabRuntimeChange,
  } = useTabsController({ t })

  useGlobalTabShortcuts({
    activeTabId,
    onAddTab: handleAddTab,
    onCloseActiveTab: handleRequestCloseTab,
    onSelectRelativeTab: selectRelativeTab,
  })

  const effectiveActiveTabId = activeTab?.id || tabs[0]?.id || ''

  const renderTabContent = React.useCallback((tab) => {
    const normalizedPath = normalizeTabPath(tab.path)
    const normalizedSearch = normalizeTabSearch(tab.search)

    if (normalizedPath === '/downloads') {
      return (
        <DownloadsPage
          onOpenDownloader={(serviceKey, rawUrl) => openDownloaderInTab(tab.id, serviceKey, rawUrl)}
        />
      )
    }

    if (normalizedPath === '/support') {
      return <SupportPage />
    }

    if (normalizedPath === '/search') {
      return (
        <SearchPage
          onOpenDownloader={(serviceKey, rawUrl, options) => openDownloaderInTab(tab.id, serviceKey, rawUrl, options)}
          onOpenInNewTab={(serviceKey, rawUrl) => openDownloaderInNewTab(serviceKey, rawUrl)}
        />
      )
    }

    if (normalizedPath === '/' && hasUrlInSearch(normalizedSearch)) {
      const serviceKey = getServiceForPath(normalizedPath, tab.search) || 'generic'
      return (
        <Downloader
          serviceKey={serviceKey}
          routeSearch={tab.search}
          routeToken={tab.navToken}
          onNavigate={(nextPath, nextSearch = '') => navigateTab(tab.id, nextPath, nextSearch)}
          onTabStateChange={(runtime) => handleTabRuntimeChange(tab.id, runtime)}
        />
      )
    }

    return (
      <HomePage onOpenDownloader={(serviceKey, rawUrl, options) => openDownloaderInTab(tab.id, serviceKey, rawUrl, options)} />
    )
  }, [handleTabRuntimeChange, navigateTab, openDownloaderInTab])

  return (
    <>
      <AppLayout
        activePath={activeTab?.path || '/'}
        activeSearch={activeTab?.search || ''}
        tabs={tabs.map((tab) => ({
          ...tab,
          displayTitle: getDisplayTabTitle(tab),
        }))}
        closingTabIds={Array.from(closingTabIds)}
        activeTabId={effectiveActiveTabId}
        onTabSelect={setActiveTabId}
        onTabClose={handleRequestCloseTab}
        onAddTab={handleAddTab}
        onTabsReorder={handleTabsReorder}
        onNavigateActiveTab={navigateActiveTab}
        onCloneTab={handleCloneTab}
        onCloseOtherTabs={handleCloseOtherTabs}
        onCloseTabsToLeft={handleCloseTabsToLeft}
        onCloseTabsToRight={handleCloseTabsToRight}
      >
        <Box sx={{ position: 'relative', height: '100%' }}>
          {tabs.map((tab) => (
            <Box
              key={tab.id}
              role="tabpanel"
              id={getPanelDomId(tab.id)}
              aria-labelledby={getTabDomId(tab.id)}
              hidden={tab.id !== effectiveActiveTabId}
              tabIndex={tab.id === effectiveActiveTabId ? 0 : -1}
              sx={{
                display: tab.id === effectiveActiveTabId ? 'block' : 'none',
                height: '100%',
              }}
            >
              {renderTabContent(tab)}
            </Box>
          ))}
        </Box>
      </AppLayout>

      <Dialog open={Boolean(closeWarning)} onClose={() => setCloseWarning(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('tabs.closeWarningTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('tabs.closeWarningBody', {
              title: closeWarning?.title || t('tabs.unnamedTab'),
            })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCloseWarning(null)}>{t('tabs.cancel')}</Button>
          <Button variant="contained" color="error" onClick={handleConfirmClose}>
            {t('tabs.closeAnyway')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
