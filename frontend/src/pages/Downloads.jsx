import React from 'react'
import { Box, Container, Typography, useTheme } from '@mui/material'
import { Image as ImageIcon, Music, Video } from 'lucide-react'
import { useI18n } from '../providers/I18nProvider'
import SimpleBarScrollArea from '../components/SimpleBarScrollArea'
import {
  GENERIC_SERVICE_KEY,
  getApiBase,
  getServiceDisplayName,
  normalizeServiceKey,
} from '../utils/metadata'
import DownloadsContent from './downloadsPage/DownloadsContent'
import DownloadsMenus from './downloadsPage/DownloadsMenus'
import DownloadsToolbar from './downloadsPage/DownloadsToolbar'
import {
  formatDurationLabel,
  formatEntryDate,
  formatTimestampTooltip,
  getVideoSourceUrl,
  GRID_PAGE_SIZE,
  LIST_PAGE_SIZE,
  persistDownloadsUiPreferences,
  readDownloadsUiPreferences,
  resolveThumbnailUrl,
  toKnownServiceKey,
} from './downloadsPage/downloadsPageUtils'

export default function DownloadsPage({ onOpenDownloader }) {
  const { t, language } = useI18n()
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'

  const [downloads, setDownloads] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [filterService, setFilterService] = React.useState('all')
  const [viewMode, setViewMode] = React.useState(() => readDownloadsUiPreferences().viewMode)
  const [filterType, setFilterType] = React.useState(() => readDownloadsUiPreferences().typeFilter)
  const [page, setPage] = React.useState(1)
  const [serviceMenuAnchorEl, setServiceMenuAnchorEl] = React.useState(null)
  const [entryMenuAnchorEl, setEntryMenuAnchorEl] = React.useState(null)
  const [entryMenuItem, setEntryMenuItem] = React.useState(null)
  const fetchControllerRef = React.useRef(null)

  const deferredSearchTerm = React.useDeferredValue(searchTerm)

  React.useEffect(() => {
    persistDownloadsUiPreferences({ viewMode, typeFilter: filterType })
  }, [filterType, viewMode])

  const closeEntryMenu = React.useCallback(() => {
    setEntryMenuAnchorEl(null)
    setEntryMenuItem(null)
  }, [])

  const openEntryMenu = React.useCallback((event, item) => {
    event.stopPropagation()
    setEntryMenuAnchorEl(event.currentTarget)
    setEntryMenuItem(item)
  }, [])

  const handleDelete = React.useCallback(async (id) => {
    if (!window.confirm(t('downloads.confirmDelete'))) return

    try {
      const apiBase = getApiBase()
      const res = await fetch(`${apiBase}/api/downloads/${id}`, { method: 'DELETE' })
      if (!res.ok) return

      setDownloads((previous) => previous.filter((entry) => entry.id !== id))
    } catch (err) {
      console.error('Failed to delete download entry', err)
    }
  }, [t])

  const handleDownloadFile = React.useCallback((filename) => {
    const apiBase = getApiBase()
    window.location.href = `${apiBase}/api/download/file/${encodeURIComponent(filename)}`
  }, [])

  const handleRedownload = React.useCallback((item) => {
    const openUrl = getVideoSourceUrl(item)
    const service = toKnownServiceKey(item?.service, openUrl || item?.source_url)
    if (openUrl) {
      onOpenDownloader?.(service, openUrl)
    }
  }, [onOpenDownloader])

  const handleMenuRedownload = React.useCallback(() => {
    if (entryMenuItem) {
      handleRedownload(entryMenuItem)
    }
    closeEntryMenu()
  }, [closeEntryMenu, entryMenuItem, handleRedownload])

  const handleMenuSave = React.useCallback(() => {
    if (entryMenuItem?.cached && entryMenuItem?.filename) {
      handleDownloadFile(entryMenuItem.filename)
    }
    closeEntryMenu()
  }, [closeEntryMenu, entryMenuItem, handleDownloadFile])

  const handleMenuDelete = React.useCallback(() => {
    if (entryMenuItem?.id != null) {
      void handleDelete(entryMenuItem.id)
    }
    closeEntryMenu()
  }, [closeEntryMenu, entryMenuItem, handleDelete])

  const fetchDownloads = React.useCallback(async () => {
    fetchControllerRef.current?.abort()
    const controller = new AbortController()
    fetchControllerRef.current = controller
    setLoading(true)

    try {
      const apiBase = getApiBase()
      const query = new URLSearchParams()
      const normalizedSearch = String(deferredSearchTerm || '').trim()

      if (normalizedSearch) query.append('q', normalizedSearch)
      if (filterService !== 'all') query.append('service', filterService)

      const res = await fetch(`${apiBase}/api/downloads?${query.toString()}`, {
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const payload = await res.json()
      if (fetchControllerRef.current === controller) {
        setDownloads(Array.isArray(payload) ? payload : [])
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('Failed to fetch downloads', err)
      }
    } finally {
      if (fetchControllerRef.current === controller) {
        fetchControllerRef.current = null
        setLoading(false)
      }
    }
  }, [deferredSearchTerm, filterService])

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchDownloads()
    }, 260)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [fetchDownloads])

  React.useEffect(() => () => {
    fetchControllerRef.current?.abort()
  }, [])

  React.useEffect(() => {
    setPage(1)
  }, [deferredSearchTerm, filterService, filterType, viewMode])

  const getServiceLabel = React.useCallback((serviceKey) => {
    if (serviceKey === GENERIC_SERVICE_KEY) return t('services.generic')
    return getServiceDisplayName(serviceKey)
  }, [t])

  const getTypeIcon = React.useCallback((type, size = 14) => {
    if (type === 'audio') return <Music size={size} />
    if (type === 'video') return <Video size={size} />
    return <ImageIcon size={size} />
  }, [])

  const getTypeLabel = React.useCallback((type) => {
    if (type === 'audio') return t('downloads.typeAudio')
    if (type === 'video') return t('downloads.typeVideo')
    return t('downloads.typeThumbnail')
  }, [t])

  const serviceOptions = React.useMemo(() => {
    const options = [{ value: 'all', label: t('downloads.allServices'), icon: null }]
    const used = new Set()

    for (const item of downloads) {
      const fallbackUrl = String(item?.source_url || '').trim()
      used.add(toKnownServiceKey(item?.service, fallbackUrl))
    }

    if (filterService !== 'all') {
      const selected = normalizeServiceKey(filterService)
      if (selected) used.add(selected)
    }

    const sorted = Array.from(used).sort((a, b) => {
      if (a === GENERIC_SERVICE_KEY) return 1
      if (b === GENERIC_SERVICE_KEY) return -1
      return getServiceLabel(a).localeCompare(getServiceLabel(b), undefined, { sensitivity: 'base' })
    })

    for (const serviceKey of sorted) {
      options.push({
        value: serviceKey,
        label: getServiceLabel(serviceKey),
        icon: serviceKey,
      })
    }

    return options
  }, [downloads, filterService, getServiceLabel, t])

  const activeServiceOption = React.useMemo(() => {
    const direct = serviceOptions.find((entry) => entry.value === filterService)
    if (direct) return direct

    const normalized = normalizeServiceKey(filterService)
    if (!normalized) {
      return { value: 'all', label: t('downloads.allServices'), icon: null }
    }

    return {
      value: normalized,
      label: getServiceLabel(normalized),
      icon: normalized,
    }
  }, [filterService, getServiceLabel, serviceOptions, t])

  const typeFilterOptions = React.useMemo(() => ([
    { value: 'all', label: t('downloads.typeAll') },
    { value: 'video', label: t('downloads.typeVideo') },
    { value: 'audio', label: t('downloads.typeAudio') },
    { value: 'thumbnail', label: t('downloads.typeThumbnail') },
  ]), [t])

  const filteredDownloads = React.useMemo(() => {
    if (filterType === 'all') return downloads
    return downloads.filter((item) => String(item?.download_type || '').trim().toLowerCase() === filterType)
  }, [downloads, filterType])

  const pageSize = viewMode === 'list' ? LIST_PAGE_SIZE : GRID_PAGE_SIZE
  const totalPages = Math.max(1, Math.ceil(filteredDownloads.length / pageSize))

  React.useEffect(() => {
    setPage((current) => Math.min(current, totalPages))
  }, [totalPages])

  const entries = React.useMemo(() => {
    const start = (page - 1) * pageSize
    const pagedDownloads = filteredDownloads.slice(start, start + pageSize)

    return pagedDownloads.map((item) => {
      const openUrl = getVideoSourceUrl(item)
      const serviceKey = toKnownServiceKey(item?.service, openUrl || item?.source_url)
      return {
        raw: item,
        id: item?.id,
        title: String(item?.title || '').trim() || item?.filename || '-',
        filename: String(item?.filename || '').trim(),
        cached: Boolean(item?.cached),
        durationLabel: formatDurationLabel(item?.duration),
        timestampTooltip: formatTimestampTooltip(item?.timestamp, language),
        shortDate: formatEntryDate(item?.timestamp, language),
        typeIcon: getTypeIcon(item?.download_type, 14),
        typeLabel: getTypeLabel(item?.download_type),
        serviceKey,
        serviceLabel: getServiceLabel(serviceKey),
        formatLabel: String(item?.format_id || item?.download_type || '').trim() || '-',
        openUrl,
        thumbnailUrl: resolveThumbnailUrl(item),
      }
    })
  }, [filteredDownloads, getServiceLabel, getTypeIcon, getTypeLabel, language, page, pageSize])

  const showInitialSkeleton = loading && downloads.length === 0
  const hasMenuRedownloadTarget = Boolean(entryMenuItem && getVideoSourceUrl(entryMenuItem))
  const canMenuSaveTarget = Boolean(entryMenuItem?.cached && entryMenuItem?.filename)

  return (
    <SimpleBarScrollArea sx={{ height: '100%' }} hideHorizontal>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box sx={{ mb: 3.3 }}>
          <Typography variant="h4" component="h1" fontWeight={800}>
            {t('downloads.title')}
          </Typography>
        </Box>

        <DownloadsToolbar
          activeServiceOption={activeServiceOption}
          filterType={filterType}
          isDark={isDark}
          onOpenServiceMenu={(event) => setServiceMenuAnchorEl(event.currentTarget)}
          onSearchTermChange={setSearchTerm}
          onTypeFilterChange={setFilterType}
          onViewModeChange={setViewMode}
          searchTerm={searchTerm}
          t={t}
          theme={theme}
          typeFilterOptions={typeFilterOptions}
          viewMode={viewMode}
        />

        <DownloadsContent
          downloads={downloads}
          entries={entries}
          filteredDownloads={filteredDownloads}
          isDark={isDark}
          loading={loading}
          onOpenEntryMenu={openEntryMenu}
          page={page}
          pageSize={pageSize}
          setPage={setPage}
          showInitialSkeleton={showInitialSkeleton}
          t={t}
          totalPages={totalPages}
          viewMode={viewMode}
        />

        <DownloadsMenus
          canMenuSaveTarget={canMenuSaveTarget}
          closeEntryMenu={closeEntryMenu}
          entryMenuAnchorEl={entryMenuAnchorEl}
          entryMenuItem={entryMenuItem}
          filterService={filterService}
          handleMenuDelete={handleMenuDelete}
          handleMenuRedownload={handleMenuRedownload}
          handleMenuSave={handleMenuSave}
          hasMenuRedownloadTarget={hasMenuRedownloadTarget}
          serviceMenuAnchorEl={serviceMenuAnchorEl}
          serviceOptions={serviceOptions}
          setFilterService={setFilterService}
          setServiceMenuAnchorEl={setServiceMenuAnchorEl}
          t={t}
        />
      </Container>
    </SimpleBarScrollArea>
  )
}
