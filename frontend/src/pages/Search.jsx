import React from 'react'
import { Box, Container, Stack, Typography } from '@mui/material'
import { useNotification } from '../providers/NotificationProvider'
import { useI18n } from '../providers/I18nProvider'
import { SEARCH_PAGE_SIZE } from '../../../shared/search/searchConfig.js'
import { normalizeSearchRuntimeState } from '../../../shared/tabs/tabRuntime.js'
import {
  GENERIC_SERVICE_KEY,
  detectService,
  getApiBase,
  getServiceDisplayName,
  normalizeServiceKey,
} from '../utils/metadata'
import { formatYtDlpErrorMessage } from '../utils/ytDlpErrorPresentation'
import SimpleBarScrollArea from '../components/SimpleBarScrollArea'
import {
  mergeUniqueEntries,
  SEARCH_SERVICE_OPTIONS,
  toHttpUrl,
  toSelectedEntriesMap,
} from './search/searchUtils'
import SearchBar from './search/SearchBar'
import SearchOverlays from './search/SearchOverlays'
import SearchResultsPane from './search/SearchResultsPane'
import useSearchSelection from './search/useSearchSelection'
import useSearchQuickDownload from './search/useSearchQuickDownload'

export default function SearchPage({
  onOpenDownloader,
  onOpenInNewTab,
  onOpenMultiInTab,
  onOpenMultiInNewTab,
  tabsReady = true,
  runtimeState = null,
  onTabStateChange = null,
}) {
  const initialRuntimeRef = React.useRef(normalizeSearchRuntimeState(runtimeState))
  const lastRuntimeSnapshotRef = React.useRef('')
  const runtimeHydratedRef = React.useRef(false)
  const [runtimeHydrationComplete, setRuntimeHydrationComplete] = React.useState(false)
  const { t } = useI18n()
  const { showNotification } = useNotification()
  const scrollRootRef = React.useRef(null)
  const loadMoreSentinelRef = React.useRef(null)
  const requestTokenRef = React.useRef(0)

  const [query, setQuery] = React.useState(() => initialRuntimeRef.current.query)
  const [selectedService, setSelectedService] = React.useState(() => initialRuntimeRef.current.selectedService)
  const [results, setResults] = React.useState(() => initialRuntimeRef.current.results)
  const [loadingInitial, setLoadingInitial] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState(() => initialRuntimeRef.current.errorMessage)
  const [lastQuery, setLastQuery] = React.useState(() => initialRuntimeRef.current.lastQuery)
  const [lastService, setLastService] = React.useState(() => initialRuntimeRef.current.lastService)
  const [nextOffset, setNextOffset] = React.useState(() => initialRuntimeRef.current.nextOffset)
  const [hasMore, setHasMore] = React.useState(() => initialRuntimeRef.current.hasMore)
  const [serviceMenuAnchor, setServiceMenuAnchor] = React.useState(null)

  const [hasMeasured, setHasMeasured] = React.useState(false)
  const [enableAnimation, setEnableAnimation] = React.useState(false)
  const [availableHeight, setAvailableHeight] = React.useState(0)

  const [kebabAnchorEl, setKebabAnchorEl] = React.useState(null)
  const [downloadAnchorEl, setDownloadAnchorEl] = React.useState(null)
  const [actionEntry, setActionEntry] = React.useState(null)
  const {
    handleClearSelectedEntries,
    handleCloseSelectedDownloadOptions,
    handleCloseSelectedList,
    handleDownloadSelectedEntries,
    handleDownloadSelectedEntriesInNewTab,
    handleOpenSelectedDownloadOptions,
    handleOpenSelectedList,
    handleRemoveSelectedEntry,
    selectedCount,
    selectedDownloadAnchorEl,
    selectedDownloadOptionsOpen,
    selectedEntries,
    selectedEntriesMap,
    selectedListAnchorEl,
    selectedListOpen,
    setSelectedEntriesMap,
    toggleEntrySelection,
  } = useSearchSelection({
    initialSelectedEntries: initialRuntimeRef.current.selectedEntries,
    lastService,
    onOpenMultiInNewTab,
    onOpenMultiInTab,
    showNotification,
    t,
  })

  React.useEffect(() => {
    if (!tabsReady || runtimeHydratedRef.current) return

    const canHydrate =
      !query
      && !results.length
      && !errorMessage
      && !lastQuery
      && nextOffset === 0
      && !hasMore
      && selectedEntriesMap.size === 0

    if (!canHydrate) {
      runtimeHydratedRef.current = true
      setRuntimeHydrationComplete(true)
      return
    }

    const restored = normalizeSearchRuntimeState(runtimeState)
    const hasRestorableState =
      Boolean(restored.query)
      || Boolean(restored.lastQuery)
      || Boolean(restored.errorMessage)
      || restored.results.length > 0
      || restored.selectedEntries.length > 0

    if (hasRestorableState) {
      requestTokenRef.current += 1
      setQuery(restored.query)
      setSelectedService(restored.selectedService)
      setResults(restored.results)
      setErrorMessage(restored.errorMessage)
      setLastQuery(restored.lastQuery)
      setLastService(restored.lastService)
      setNextOffset(restored.nextOffset)
      setHasMore(restored.hasMore)
      setSelectedEntriesMap(toSelectedEntriesMap(restored.selectedEntries))
    }

    runtimeHydratedRef.current = true
    setRuntimeHydrationComplete(true)
  }, [
    errorMessage,
    hasMore,
    lastQuery,
    nextOffset,
    query,
    results,
    runtimeState,
    selectedEntriesMap.size,
    tabsReady,
  ])

  const selectedServiceOption = React.useMemo(() => {
    return SEARCH_SERVICE_OPTIONS.find((o) => o.value === selectedService) || SEARCH_SERVICE_OPTIONS[0]
  }, [selectedService])

  const handleClearSearch = React.useCallback(() => {
    setQuery('')
    setLastQuery('')
    setResults([])
    setErrorMessage('')
    setHasMore(false)
    setNextOffset(0)
  }, [])

  const getServiceLabel = React.useCallback((rawService) => {
    const normalized = normalizeServiceKey(rawService)
    if (!normalized || normalized === GENERIC_SERVICE_KEY) {
      return t('services.generic')
    }
    return getServiceDisplayName(normalized)
  }, [t])

  const openDownloaderForUrl = React.useCallback((rawUrl, preferredService, options) => {
    const targetUrl = toHttpUrl(rawUrl)
    if (!targetUrl) return false

    const preferred = String(preferredService || '').trim().toLowerCase() === 'youtubemusic'
      ? 'youtube'
      : preferredService

    const detected = normalizeServiceKey(detectService(targetUrl))
    const normalizedPreferred = normalizeServiceKey(preferred)
    const serviceKey = detected || normalizedPreferred || GENERIC_SERVICE_KEY

    onOpenDownloader?.(serviceKey, targetUrl, options)
    return true
  }, [onOpenDownloader])

  const fetchSearchPage = React.useCallback(async ({ queryText, serviceKey, offset, append }) => {
    const token = requestTokenRef.current + 1
    requestTokenRef.current = token

    if (append) {
      setLoadingMore(true)
    } else {
      setLoadingInitial(true)
      setLoadingMore(false)
    }

    try {
      const apiBase = getApiBase()
      const params = new URLSearchParams({
        q: String(queryText || '').trim(),
        from: String(serviceKey || 'youtube'),
        offset: String(Math.max(0, Number(offset) || 0)),
      })

      const response = await fetch(`${apiBase}/api/search?${params.toString()}`)
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        const mappedMessage = formatYtDlpErrorMessage(t, payload || `HTTP ${response.status}`, {
          fallbackKey: 'search.errorGeneric',
          includeRawForUnknown: false,
        })
        throw new Error(String(mappedMessage))
      }

      if (token !== requestTokenRef.current) return

      const entries = Array.isArray(payload?.entries) ? payload.entries : []
      const resolvedLimit = Number(payload?.limit)
      const limit = Number.isFinite(resolvedLimit) && resolvedLimit > 0
        ? Math.round(resolvedLimit)
        : SEARCH_PAGE_SIZE
      const resolvedHasMore = typeof payload?.hasMore === 'boolean'
        ? payload.hasMore
        : entries.length >= limit

      setResults((prev) => (append ? mergeUniqueEntries(prev, entries) : entries))
      setNextOffset(Math.max(0, Number(offset) || 0) + entries.length)
      setHasMore(resolvedHasMore)
      setErrorMessage('')
    } catch (err) {
      if (token !== requestTokenRef.current) return

      const message = String(err?.message || err || t('search.errorGeneric')).trim() || t('search.errorGeneric')
      if (!append) {
        setResults([])
      }
      setHasMore(false)
      setErrorMessage(t('search.errorWithMessage', { message }))
    } finally {
      if (token === requestTokenRef.current) {
        setLoadingInitial(false)
        setLoadingMore(false)
      }
    }
  }, [t])

  const handleSubmit = React.useCallback(async () => {
    const trimmedQuery = String(query || '').trim()
    if (!trimmedQuery || loadingInitial) return

    setErrorMessage('')
    setResults([])
    setHasMore(false)
    setNextOffset(0)
    setLastQuery(trimmedQuery)
    setLastService(selectedService)

    await fetchSearchPage({
      queryText: trimmedQuery,
      serviceKey: selectedService,
      offset: 0,
      append: false,
    })
  }, [fetchSearchPage, loadingInitial, query, selectedService])

  const loadMore = React.useCallback(() => {
    if (!lastQuery || !hasMore || loadingInitial || loadingMore) return

    fetchSearchPage({
      queryText: lastQuery,
      serviceKey: lastService,
      offset: nextOffset,
      append: true,
    })
  }, [fetchSearchPage, hasMore, lastQuery, lastService, loadingInitial, loadingMore, nextOffset])

  React.useEffect(() => {
    if (!hasMore || loadingInitial || loadingMore || !lastQuery) return undefined

    const root = scrollRootRef.current
    const target = loadMoreSentinelRef.current
    if (!root || !target) return undefined

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        loadMore()
        break
      }
    }, {
      root,
      rootMargin: '280px 0px',
      threshold: 0.01,
    })

    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, lastQuery, loadMore, loadingInitial, loadingMore])

  const handleOpenResult = React.useCallback((entry, options = {}) => {
    openDownloaderForUrl(entry?.url, entry?.service || lastService, options)
  }, [lastService, openDownloaderForUrl])

  const handleOpenKebab = (e, entry) => {
    e.stopPropagation()
    setKebabAnchorEl(e.currentTarget)
    setActionEntry(entry)
  }

  const rerunLastSearchForService = React.useCallback((nextService) => {
    const normalizedNext = String(nextService || '').trim().toLowerCase()
    if (!normalizedNext) return
    if (!lastQuery || loadingInitial || loadingMore) return
    if (normalizedNext === lastService) return

    setErrorMessage('')
    setResults([])
    setHasMore(false)
    setNextOffset(0)
    setLastService(normalizedNext)

    void fetchSearchPage({
      queryText: lastQuery,
      serviceKey: normalizedNext,
      offset: 0,
      append: false,
    })
  }, [fetchSearchPage, lastQuery, lastService, loadingInitial, loadingMore])

  React.useEffect(() => {
    if (!tabsReady || !runtimeHydrationComplete) return

    const runtimePayload = normalizeSearchRuntimeState({
      query,
      selectedService,
      results,
      errorMessage,
      lastQuery,
      lastService,
      nextOffset,
      hasMore,
      selectedEntries,
    })

    const serialized = JSON.stringify(runtimePayload)
    if (serialized === lastRuntimeSnapshotRef.current) return
    lastRuntimeSnapshotRef.current = serialized

    onTabStateChange?.({
      searchCache: runtimePayload,
    })
  }, [
    errorMessage,
    hasMore,
    lastQuery,
    lastService,
    nextOffset,
    onTabStateChange,
    query,
    results,
    selectedEntries,
    selectedService,
    tabsReady,
    runtimeHydrationComplete,
  ])

  const handleCloseKebab = () => {
    setKebabAnchorEl(null)
  }

  const handleCloseDownloadDropdown = React.useCallback(() => {
    setDownloadAnchorEl(null)
  }, [])

  const {
    activeQuickDownloadProgress,
    embedPreview,
    handleCloseEmbedPreview,
    handleDownloadQuick,
    handleOpenEmbedPreview,
    isQuickDownloadActive,
    quickDownloadFormatLabel,
    quickDownloadOptions,
    quickDownloadStageLabel,
    quickDownloadTitle,
  } = useSearchQuickDownload({
    actionEntry,
    closeDownloadDropdown: handleCloseDownloadDropdown,
    getServiceLabel,
    lastService,
    showNotification,
    t,
  })

  const handleOpenDownloadDropdown = (e, entry) => {
    e.stopPropagation()
    if (isQuickDownloadActive) return

    setDownloadAnchorEl(e.currentTarget)
    setActionEntry(entry)
  }

  const handleKebabNewTab = () => {
    if (actionEntry && onOpenInNewTab) {
      onOpenInNewTab(actionEntry.service || lastService, actionEntry.url)
    }
    handleCloseKebab()
  }

  const handleKebabBrowser = () => {
    if (actionEntry?.url) {
      window.open(actionEntry.url, '_blank')
    }
    handleCloseKebab()
  }

  const handleDownloadMain = (entry) => {
    handleOpenResult(entry)
  }

  React.useEffect(() => {
    const root = scrollRootRef.current
    if (!root) return undefined

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 0) {
          setAvailableHeight(entry.contentRect.height)
          setHasMeasured(true)
        }
      }
    })

    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    if (hasMeasured) {
      const timer = setTimeout(() => {
        setEnableAnimation(true)
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [hasMeasured])

  const showInitialLoading = loadingInitial && results.length === 0
  const showEmptyState = !showInitialLoading && !errorMessage && Boolean(lastQuery) && results.length === 0

  const isSearched = loadingInitial || loadingMore || results.length > 0 || errorMessage || Boolean(lastQuery)

  const calculatedSpacer = Math.max(0, (availableHeight / 2) - 28)

  const searchBarJsx = (
    <SearchBar
      handleClearSearch={handleClearSearch}
      handleSubmit={handleSubmit}
      loadingInitial={loadingInitial}
      onSelectService={(nextService) => {
        const hasChanged = selectedService !== nextService
        setSelectedService(nextService)
        setServiceMenuAnchor(null)
        if (hasChanged) {
          rerunLastSearchForService(nextService)
        }
      }}
      query={query}
      selectedService={selectedService}
      selectedServiceOption={selectedServiceOption}
      serviceMenuAnchor={serviceMenuAnchor}
      setQuery={setQuery}
      setServiceMenuAnchor={setServiceMenuAnchor}
      t={t}
    />
  )

  return (
    <SimpleBarScrollArea
      sx={{ height: '100%', opacity: hasMeasured ? 1 : 0 }}
      scrollableNodeProps={{ ref: scrollRootRef }}
    >
      <Container maxWidth="xl" sx={{ display: 'flex', flexDirection: 'column', minHeight: '100%', px: { xs: 2, sm: 3 } }}>
        <Box sx={{
          transition: enableAnimation ? 'height 0.4s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
          height: isSearched ? 0 : `${calculatedSpacer}px`,
          flexShrink: 0
        }} />

        <Box sx={{
          width: '100%',
          maxWidth: isSearched ? 1000 : 780,
          mx: 'auto',
          transition: enableAnimation ? 'max-width 0.4s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
          pb: isSearched ? 8 : 0
        }}>
          <Box sx={{
            position: isSearched ? 'sticky' : 'relative',
            top: 0,
            zIndex: 10,
            pt: isSearched ? { xs: 2, md: 3 } : 0,
            pb: isSearched ? 2 : 0,
            transition: enableAnimation ? 'padding 0.3s' : 'none',
            mb: isSearched ? 2 : 0,
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: '44px',
              bgcolor: (theme) => theme.palette.mode === 'dark' ? '#212121' : '#ffffff',
              opacity: isSearched ? 1 : 0,
              transition: enableAnimation ? 'opacity 0.3s' : 'none',
              zIndex: -1,
            }
          }}>
            {!isSearched && (
              <Box sx={{ position: 'absolute', bottom: 'calc(100% + 16px)', left: 0, right: 0 }}>
                <Stack spacing={0}>
                  <Typography variant="h1" align="center" className="youtube-title" sx={{ fontSize: { xs: '3.5rem', sm: '5rem', md: '6rem' } }}>
                    {t('search.title')}
                  </Typography>
                  <Typography variant="h4" align="center" sx={{ color: 'text.secondary', fontWeight: 700, mt: 0.5, fontSize: { xs: '1.25rem', sm: '1.5rem', md: '1.75rem' } }}>
                    {t('search.subtitle', { service: t(selectedServiceOption.labelKey) })}
                  </Typography>
                </Stack>
              </Box>
            )}
            {searchBarJsx}
          </Box>

          {errorMessage && (
            <Typography sx={{ color: 'error.main', mb: 2, fontWeight: 700, px: 0.5 }}>
              {errorMessage}
            </Typography>
          )}

          <SearchResultsPane
            availableHeight={availableHeight}
            getServiceLabel={getServiceLabel}
            handleClearSelectedEntries={handleClearSelectedEntries}
            handleCloseSelectedList={handleCloseSelectedList}
            handleDownloadMain={handleDownloadMain}
            handleDownloadSelectedEntries={handleDownloadSelectedEntries}
            handleOpenDownloadDropdown={handleOpenDownloadDropdown}
            handleOpenEmbedPreview={handleOpenEmbedPreview}
            handleOpenKebab={handleOpenKebab}
            handleOpenSelectedDownloadOptions={handleOpenSelectedDownloadOptions}
            handleOpenSelectedList={handleOpenSelectedList}
            hasMeasured={hasMeasured}
            loadMoreSentinelRef={loadMoreSentinelRef}
            loadingInitial={loadingInitial}
            loadingMore={loadingMore}
            results={results}
            selectedCount={selectedCount}
            selectedEntriesMap={selectedEntriesMap}
            selectedListOpen={selectedListOpen}
            selectedService={selectedService}
            showEmptyState={showEmptyState}
            showInitialLoading={showInitialLoading}
            t={t}
            toggleEntrySelection={toggleEntrySelection}
          />
        </Box>

        <SearchOverlays
          activeQuickDownloadProgress={activeQuickDownloadProgress}
          downloadAnchorEl={downloadAnchorEl}
          embedPreview={embedPreview}
          handleCloseDownloadDropdown={handleCloseDownloadDropdown}
          handleCloseEmbedPreview={handleCloseEmbedPreview}
          handleCloseKebab={handleCloseKebab}
          handleCloseSelectedDownloadOptions={handleCloseSelectedDownloadOptions}
          handleCloseSelectedList={handleCloseSelectedList}
          handleDownloadQuick={handleDownloadQuick}
          handleDownloadSelectedEntriesInNewTab={handleDownloadSelectedEntriesInNewTab}
          handleKebabBrowser={handleKebabBrowser}
          handleKebabNewTab={handleKebabNewTab}
          handleRemoveSelectedEntry={handleRemoveSelectedEntry}
          isQuickDownloadActive={isQuickDownloadActive}
          kebabAnchorEl={kebabAnchorEl}
          quickDownloadFormatLabel={quickDownloadFormatLabel}
          quickDownloadOptions={quickDownloadOptions}
          quickDownloadStageLabel={quickDownloadStageLabel}
          quickDownloadTitle={quickDownloadTitle}
          selectedDownloadAnchorEl={selectedDownloadAnchorEl}
          selectedDownloadOptionsOpen={selectedDownloadOptionsOpen}
          selectedEntries={selectedEntries}
          selectedListAnchorEl={selectedListAnchorEl}
          selectedListOpen={selectedListOpen}
          t={t}
        />
      </Container>
    </SimpleBarScrollArea>
  )
}
