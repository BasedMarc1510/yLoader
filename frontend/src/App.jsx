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
import { resolveServiceKey } from './utils/metadata'
import {
  getPanelDomId,
  getTabDomId,
  hasDownloaderInSearch,
} from './utils/tabState'
import { useTabsController } from './hooks/useTabsController'
import { useGlobalTabShortcuts } from './hooks/useGlobalTabShortcuts'

function normalizeDeepLinkEnvelope(envelope) {
  const payload = envelope && typeof envelope === 'object'
    ? (envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : envelope)
    : {}

  const urls = Array.isArray(payload.urls)
    ? Array.from(new Set(
        payload.urls
          .map((entry) => String(entry || '').trim())
          .filter(Boolean)
      )).slice(0, 50)
    : []

  const service = String(payload.service || '').trim().toLowerCase()
  const targetRaw = String(payload.target || '').trim().toLowerCase()
  const target = (targetRaw === 'current' || targetRaw === 'current-tab')
    ? 'current-tab'
    : 'new-tab'

  return {
    id: String(payload.id || '').trim(),
    urls,
    service,
    target,
  }
}

export default function App() {
  const { t } = useI18n()

  const {
    tabs,
    tabsReady,
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
    openHomeMultiInTab,
    openHomeMultiInNewTab,
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

  const handledDeepLinkIdsRef = React.useRef(new Set())

  const handleIncomingDeepLink = React.useCallback((envelope) => {
    const normalized = normalizeDeepLinkEnvelope(envelope)
    if (!normalized.urls.length) return

    if (normalized.id) {
      if (handledDeepLinkIdsRef.current.has(normalized.id)) return
      handledDeepLinkIdsRef.current.add(normalized.id)
      if (handledDeepLinkIdsRef.current.size > 120) {
        handledDeepLinkIdsRef.current.clear()
      }
    }

    const targetTabId = String(activeTabId || '').trim()

    if (normalized.urls.length > 1) {
      if (normalized.target === 'current-tab' && targetTabId) {
        const openedInCurrentTab = openHomeMultiInTab(targetTabId, normalized.urls)
        if (!openedInCurrentTab) {
          openHomeMultiInNewTab(normalized.urls)
        }
        return
      }

      openHomeMultiInNewTab(normalized.urls)
      return
    }

    const sourceUrl = normalized.urls[0]
    if (!sourceUrl) return

    const resolvedService = resolveServiceKey(normalized.service || 'generic', sourceUrl)

    if (normalized.target === 'current-tab' && targetTabId) {
      openDownloaderInTab(targetTabId, resolvedService, sourceUrl)
      return
    }

    openDownloaderInNewTab(resolvedService, sourceUrl)
  }, [
    activeTabId,
    openDownloaderInNewTab,
    openDownloaderInTab,
    openHomeMultiInNewTab,
    openHomeMultiInTab,
  ])

  React.useEffect(() => {
    const runtime = typeof window !== 'undefined' ? window.yloaderRuntime : null
    const deepLinksApi = runtime?.deepLinks
    if (!runtime?.isElectron || !deepLinksApi) return undefined

    let mounted = true

    Promise.resolve(deepLinksApi.getPending?.())
      .then((pending) => {
        if (!mounted) return
        const entries = Array.isArray(pending) ? pending : []
        for (const entry of entries) {
          handleIncomingDeepLink(entry)
        }
      })
      .catch(() => {
        // ignore initial deep-link sync errors
      })

    const unsubscribe = deepLinksApi.onEvent?.((eventEnvelope) => {
      if (!mounted) return
      handleIncomingDeepLink(eventEnvelope)
    })

    return () => {
      mounted = false
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [handleIncomingDeepLink])

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
          onOpenMultiInTab={(urls) => openHomeMultiInTab(tab.id, urls)}
          onOpenMultiInNewTab={(urls) => openHomeMultiInNewTab(urls)}
          tabsReady={tabsReady}
          runtimeState={tab.runtime?.search}
          onTabStateChange={(runtime) => handleTabRuntimeChange(tab.id, runtime)}
        />
      )
    }

    if (normalizedPath === '/' && hasDownloaderInSearch(normalizedSearch)) {
      const serviceKey = getServiceForPath(normalizedPath, tab.search) || 'generic'
      return (
        <Downloader
          serviceKey={serviceKey}
          routeSearch={tab.search}
          routeToken={tab.navToken}
          tabsReady={tabsReady}
          onNavigate={(nextPath, nextSearch = '') => navigateTab(tab.id, nextPath, nextSearch)}
          runtimeState={tab.runtime?.downloader}
          onTabStateChange={(runtime) => handleTabRuntimeChange(tab.id, runtime)}
        />
      )
    }

    return (
      <HomePage
        routeSearch={tab.search}
        routeToken={tab.navToken}
        onOpenDownloader={(serviceKey, rawUrl, options) => openDownloaderInTab(tab.id, serviceKey, rawUrl, options)}
      />
    )
  }, [
    handleTabRuntimeChange,
    navigateTab,
    openDownloaderInTab,
    openDownloaderInNewTab,
    openHomeMultiInTab,
    openHomeMultiInNewTab,
    tabsReady,
  ])

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
