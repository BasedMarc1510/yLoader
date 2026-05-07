import React from 'react'
import { GENERIC_SERVICE_KEY, normalizeServiceKey } from '../../utils/metadata'
import { getSearchEntryIdentity, toHttpUrl, toSelectedEntriesMap } from './searchUtils'

export default function useSearchSelection({
  initialSelectedEntries = [],
  lastService,
  onOpenMultiInNewTab,
  onOpenMultiInTab,
  showNotification,
  t,
}) {
  const [selectedEntriesMap, setSelectedEntriesMap] = React.useState(() => toSelectedEntriesMap(initialSelectedEntries))
  const [selectedListAnchorEl, setSelectedListAnchorEl] = React.useState(null)
  const [selectedDownloadAnchorEl, setSelectedDownloadAnchorEl] = React.useState(null)

  const buildSelectionEntry = React.useCallback((entry) => {
    const identity = getSearchEntryIdentity(entry)
    const sourceUrl = toHttpUrl(entry?.url)
    if (!identity || !sourceUrl) return null

    return {
      identity,
      url: sourceUrl,
      service: normalizeServiceKey(entry?.service || lastService) || GENERIC_SERVICE_KEY,
      title: String(entry?.title || sourceUrl).trim() || sourceUrl,
      thumbnail: String(entry?.thumbnail || '').trim(),
    }
  }, [lastService])

  const toggleEntrySelection = React.useCallback((entry, checked) => {
    const candidate = buildSelectionEntry(entry)
    if (!candidate) return

    setSelectedEntriesMap((prev) => {
      const next = new Map(prev)
      if (checked) {
        next.set(candidate.identity, candidate)
      } else {
        next.delete(candidate.identity)
      }
      return next
    })
  }, [buildSelectionEntry])

  const selectedEntries = React.useMemo(() => Array.from(selectedEntriesMap.values()), [selectedEntriesMap])
  const selectedCount = selectedEntries.length

  const handleOpenSelectedList = React.useCallback((event) => {
    setSelectedListAnchorEl(event.currentTarget)
  }, [])

  const handleCloseSelectedList = React.useCallback(() => {
    setSelectedListAnchorEl(null)
  }, [])

  const handleClearSelectedEntries = React.useCallback(() => {
    setSelectedEntriesMap(new Map())
    setSelectedListAnchorEl(null)
    setSelectedDownloadAnchorEl(null)
  }, [])

  const handleRemoveSelectedEntry = React.useCallback((entryIdentity) => {
    const identity = String(entryIdentity || '').trim()
    if (!identity) return

    setSelectedEntriesMap((prev) => {
      if (!prev.has(identity)) return prev
      const next = new Map(prev)
      next.delete(identity)
      return next
    })
  }, [])

  const collectSelectedEntryUrls = React.useCallback(() => {
    return Array.from(new Set(
      selectedEntries
        .map((item) => String(item?.url || '').trim())
        .filter(Boolean)
    ))
  }, [selectedEntries])

  const handleOpenSelectedDownloadOptions = React.useCallback((event) => {
    setSelectedDownloadAnchorEl(event.currentTarget)
  }, [])

  const handleCloseSelectedDownloadOptions = React.useCallback(() => {
    setSelectedDownloadAnchorEl(null)
  }, [])

  const handleDownloadSelectedEntries = React.useCallback(() => {
    const urls = collectSelectedEntryUrls()
    if (!urls.length) return

    if (typeof onOpenMultiInTab === 'function') {
      onOpenMultiInTab(urls)
      handleClearSelectedEntries()
      return
    }

    if (typeof onOpenMultiInNewTab === 'function') {
      onOpenMultiInNewTab(urls)
      handleClearSelectedEntries()
      return
    }

    showNotification(t('search.errorGeneric'), 'error')
  }, [collectSelectedEntryUrls, handleClearSelectedEntries, onOpenMultiInNewTab, onOpenMultiInTab, showNotification, t])

  const handleDownloadSelectedEntriesInNewTab = React.useCallback(() => {
    const urls = collectSelectedEntryUrls()
    setSelectedDownloadAnchorEl(null)
    if (!urls.length) return

    if (typeof onOpenMultiInNewTab === 'function') {
      onOpenMultiInNewTab(urls)
      handleClearSelectedEntries()
      return
    }

    showNotification(t('search.errorGeneric'), 'error')
  }, [collectSelectedEntryUrls, handleClearSelectedEntries, onOpenMultiInNewTab, showNotification, t])

  React.useEffect(() => {
    if (selectedCount > 0) return
    setSelectedListAnchorEl(null)
    setSelectedDownloadAnchorEl(null)
  }, [selectedCount])

  return {
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
    selectedDownloadOptionsOpen: Boolean(selectedDownloadAnchorEl),
    selectedEntries,
    selectedEntriesMap,
    selectedListAnchorEl,
    selectedListOpen: Boolean(selectedListAnchorEl),
    setSelectedEntriesMap,
    toggleEntrySelection,
  }
}
