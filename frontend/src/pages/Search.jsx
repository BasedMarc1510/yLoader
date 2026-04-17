import React from 'react'
import {
  Box,
  Button,
  Checkbox,
  Card,
  CardActionArea,
  CircularProgress,
  Container,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  LinearProgress,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Typography,
  ButtonGroup,
} from '@mui/material'
import { Search as SearchIcon, X, ChevronDown, ChevronUp, MoreVertical, Play, ExternalLink, Globe, Film, Music2, Image } from 'lucide-react'
import ServiceIcon from '../components/ServiceIcon'
import { useNotification } from '../providers/NotificationProvider'
import { useI18n } from '../providers/I18nProvider'
import {
  GENERIC_SERVICE_KEY,
  detectService,
  getApiBase,
  getServiceDisplayName,
  normalizeServiceKey,
  getServiceThemeColor,
} from '../utils/metadata'
import { formatYtDlpErrorMessage } from '../utils/ytDlpErrorPresentation'
import SimpleBarScrollArea from '../components/SimpleBarScrollArea'

const SEARCH_SERVICE_OPTIONS = [
  { value: 'youtube', labelKey: 'search.services.youtube', iconKey: 'youtube' },
  { value: 'youtubemusic', labelKey: 'search.services.youtubeMusic', iconKey: 'youtube' },
  { value: 'spotify', labelKey: 'search.services.spotify', iconKey: 'spotify' },
  { value: 'soundcloud', labelKey: 'search.services.soundcloud', iconKey: 'soundcloud' },
]
const SEARCH_PAGE_SIZE = 10
const SQUARE_THUMBNAIL_SERVICES = new Set(['spotify', 'soundcloud'])
const EMBED_PREVIEW_SERVICES = new Set(['youtube', 'soundcloud'])
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{6,}$/
const DIRECT_DOWNLOAD_FORMAT_OPTIONS = Object.freeze(['mp4', 'mp3', 'thumbnail'])
const SEARCH_RUNTIME_MAX_RESULTS = 120
const SEARCH_RUNTIME_MAX_SELECTED_ENTRIES = 160
const SEARCH_RUNTIME_DEFAULT_SERVICE = 'youtube'
const SEARCH_PROVIDER_VALUES = new Set(SEARCH_SERVICE_OPTIONS.map((option) => option.value))

function sanitizeSearchRuntimeText(value, maxLength = 240) {
  return String(value || '').trim().slice(0, maxLength)
}

function normalizeSearchProvider(value) {
  const normalized = sanitizeSearchRuntimeText(value, 40).toLowerCase()
  if (SEARCH_PROVIDER_VALUES.has(normalized)) return normalized
  return SEARCH_RUNTIME_DEFAULT_SERVICE
}

function normalizeSearchResultService(value) {
  return normalizeServiceKey(value) || GENERIC_SERVICE_KEY
}

function sanitizeSearchRuntimeResultEntry(entry) {
  const url = toHttpUrl(entry?.url)
  if (!url) return null

  const title = sanitizeSearchRuntimeText(entry?.title, 320)

  return {
    id: sanitizeSearchRuntimeText(entry?.id, 120),
    url,
    title: title || url,
    uploader: sanitizeSearchRuntimeText(entry?.uploader, 180),
    thumbnail: sanitizeSearchRuntimeText(entry?.thumbnail, 2048),
    duration: Number.isFinite(Number(entry?.duration)) ? Number(entry.duration) : 0,
    durationString: sanitizeSearchRuntimeText(entry?.durationString, 32),
    service: normalizeSearchResultService(entry?.service),
  }
}

function sanitizeSearchRuntimeSelectedEntry(entry) {
  const identity = sanitizeSearchRuntimeText(entry?.identity, 260)
  const url = toHttpUrl(entry?.url)
  if (!identity || !url) return null

  return {
    identity,
    url,
    service: normalizeSearchResultService(entry?.service),
    title: sanitizeSearchRuntimeText(entry?.title, 240),
    thumbnail: sanitizeSearchRuntimeText(entry?.thumbnail, 2048),
  }
}

function normalizeSearchRuntimeState(rawState) {
  const state = (rawState && typeof rawState === 'object') ? rawState : {}

  const results = Array.isArray(state.results)
    ? state.results
      .map(sanitizeSearchRuntimeResultEntry)
      .filter(Boolean)
      .slice(0, SEARCH_RUNTIME_MAX_RESULTS)
    : []

  const selectedEntries = Array.isArray(state.selectedEntries)
    ? state.selectedEntries
      .map(sanitizeSearchRuntimeSelectedEntry)
      .filter(Boolean)
      .slice(0, SEARCH_RUNTIME_MAX_SELECTED_ENTRIES)
    : []

  return {
    query: sanitizeSearchRuntimeText(state.query, 300),
    selectedService: normalizeSearchProvider(state.selectedService),
    results,
    errorMessage: sanitizeSearchRuntimeText(state.errorMessage, 600),
    lastQuery: sanitizeSearchRuntimeText(state.lastQuery, 300),
    lastService: normalizeSearchProvider(state.lastService),
    nextOffset: Number.isFinite(Number(state.nextOffset)) ? Math.max(0, Number(state.nextOffset)) : 0,
    hasMore: Boolean(state.hasMore),
    selectedEntries,
  }
}

function toSelectedEntriesMap(entries) {
  const map = new Map()
  for (const entry of entries || []) {
    const identity = sanitizeSearchRuntimeText(entry?.identity, 260)
    const url = toHttpUrl(entry?.url)
    if (!identity || !url) continue
    map.set(identity, {
      identity,
      url,
      service: normalizeSearchResultService(entry?.service),
      title: sanitizeSearchRuntimeText(entry?.title, 240),
      thumbnail: sanitizeSearchRuntimeText(entry?.thumbnail, 2048),
    })
  }
  return map
}

function getSearchEntryIdentity(entry) {
  const id = String(entry?.id || '').trim()
  const url = String(entry?.url || '').trim()
  const service = String(entry?.service || '').trim()
  return `${service}::${id || url}`
}

function triggerBrowserDownload(href, filename = '') {
  const url = String(href || '').trim()
  if (!url) return

  const anchor = document.createElement('a')
  anchor.href = url
  if (filename) {
    anchor.download = String(filename || '').trim()
  }
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

function appendUrlQueryParam(rawUrl, key, value) {
  const targetUrl = String(rawUrl || '').trim()
  const targetKey = String(key || '').trim()
  if (!targetUrl || !targetKey) return targetUrl

  try {
    const base = (typeof window !== 'undefined' && window.location)
      ? window.location.href
      : 'http://localhost'
    const parsed = new URL(targetUrl, base)
    parsed.searchParams.set(targetKey, String(value || ''))
    return parsed.href
  } catch {
    const joinChar = targetUrl.includes('?') ? '&' : '?'
    return `${targetUrl}${joinChar}${encodeURIComponent(targetKey)}=${encodeURIComponent(String(value || ''))}`
  }
}

async function readSseEventsFromResponse(response, onEvent) {
  if (!response?.body || typeof response.body.getReader !== 'function') {
    throw new Error('Missing response stream')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const flushEvents = (force = false) => {
    let delimiterIndex = buffer.indexOf('\n\n')
    while (delimiterIndex !== -1) {
      const block = buffer.slice(0, delimiterIndex)
      buffer = buffer.slice(delimiterIndex + 2)

      if (block.trim()) {
        let eventName = 'message'
        const dataLines = []
        const lines = block.split('\n')

        for (const rawLine of lines) {
          const line = rawLine.replace(/\r$/, '')
          if (!line || line.startsWith(':')) continue
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim() || 'message'
            continue
          }
          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart())
          }
        }

        onEvent?.(eventName, dataLines.join('\n'))
      }

      delimiterIndex = buffer.indexOf('\n\n')
    }

    if (force && buffer.trim()) {
      let eventName = 'message'
      const dataLines = []
      const lines = buffer.split('\n')

      for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, '')
        if (!line || line.startsWith(':')) continue
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim() || 'message'
          continue
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart())
        }
      }

      onEvent?.(eventName, dataLines.join('\n'))
      buffer = ''
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      flushEvents(true)
      break
    }

    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    flushEvents(false)
  }
}

function toHttpUrl(rawValue) {
  const value = String(rawValue || '').trim()
  if (!value) return null

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.href
  } catch {
    return null
  }
}

function mergeUniqueEntries(existingEntries, incomingEntries) {
  const merged = [...existingEntries]
  const seen = new Set(existingEntries.map((entry) => `${String(entry?.id || '')}::${String(entry?.url || '')}`))

  for (const entry of incomingEntries) {
    const key = `${String(entry?.id || '')}::${String(entry?.url || '')}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(entry)
  }

  return merged
}

function formatDuration(durationSeconds) {
  const numeric = Number(durationSeconds)
  if (!Number.isFinite(numeric) || numeric <= 0) return ''

  const total = Math.max(0, Math.round(numeric))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad2 = (input) => String(input).padStart(2, '0')

  if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(seconds)}`
  return `${pad2(minutes)}:${pad2(seconds)}`
}

function sanitizeYouTubeId(value) {
  const candidate = String(value || '').trim()
  if (!candidate) return ''
  if (!YOUTUBE_ID_PATTERN.test(candidate)) return ''
  return candidate
}

function extractYouTubeIdFromUrl(rawUrl) {
  const targetUrl = toHttpUrl(rawUrl)
  if (!targetUrl) return ''

  try {
    const parsed = new URL(targetUrl)
    const host = String(parsed.hostname || '').trim().toLowerCase()
    const pathParts = String(parsed.pathname || '')
      .split('/')
      .map((part) => String(part || '').trim())
      .filter(Boolean)

    if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
      return sanitizeYouTubeId(pathParts[0])
    }

    if (!(host.includes('youtube.com') || host.includes('youtube-nocookie.com'))) {
      return ''
    }

    const watchId = sanitizeYouTubeId(parsed.searchParams.get('v'))
    if (watchId) return watchId

    if (pathParts[0] === 'embed' || pathParts[0] === 'shorts' || pathParts[0] === 'live') {
      return sanitizeYouTubeId(pathParts[1])
    }

    return ''
  } catch {
    return ''
  }
}

function buildYouTubeEmbedUrl(rawUrl, rawId) {
  const id = extractYouTubeIdFromUrl(rawUrl) || sanitizeYouTubeId(rawId)
  if (!id) return ''

  const params = new URLSearchParams({
    autoplay: '1',
    rel: '0',
  })

  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${params.toString()}`
}

function buildSoundcloudEmbedUrl(rawUrl, rawId) {
  const sourceUrl = toHttpUrl(rawUrl)
  if (!sourceUrl) return ''

  try {
    const parsed = new URL(sourceUrl)
    const host = String(parsed.hostname || '').trim().toLowerCase()
    if (!(host === 'soundcloud.com' || host.endsWith('.soundcloud.com'))) {
      return ''
    }

    const normalizedId = String(rawId || '').trim()
    const trackMatch = normalizedId.match(/^(?:soundcloud:tracks:)?(\d+)$/i)
    const embedTargetUrl = trackMatch?.[1]
      ? `https://api.soundcloud.com/tracks/${trackMatch[1]}`
      : parsed.href

    const params = new URLSearchParams({
      url: embedTargetUrl,
      color: '#ff5500',
      auto_play: 'false',
      hide_related: 'false',
      show_comments: 'true',
      show_user: 'true',
      show_reposts: 'false',
      show_teaser: 'true',
    })

    return `https://w.soundcloud.com/player/?${params.toString()}`
  } catch {
    return ''
  }
}

function resolvePreviewEmbedPayload(entry, fallbackService, getServiceLabel) {
  const resolvedService = normalizeServiceKey(entry?.service || fallbackService)
  const serviceKey = resolvedService || GENERIC_SERVICE_KEY
  if (!EMBED_PREVIEW_SERVICES.has(serviceKey)) return null

  const sourceUrl = toHttpUrl(entry?.url)
  if (!sourceUrl) return null

  const embedUrl = serviceKey === 'youtube'
    ? buildYouTubeEmbedUrl(sourceUrl, entry?.id)
    : buildSoundcloudEmbedUrl(sourceUrl, entry?.id)

  if (!embedUrl) return null

  return {
    serviceKey,
    serviceLabel: getServiceLabel(serviceKey),
    sourceUrl,
    embedUrl,
  }
}

export default function SearchPage({ onOpenDownloader, onOpenInNewTab, onOpenMultiInNewTab, tabsReady = true, runtimeState = null, onTabStateChange = null }) {
  const initialRuntimeRef = React.useRef(normalizeSearchRuntimeState(runtimeState))
  const lastRuntimeSnapshotRef = React.useRef('')
  const runtimeHydratedRef = React.useRef(false)
  const [runtimeHydrationComplete, setRuntimeHydrationComplete] = React.useState(false)
  const { t } = useI18n()
  const { showNotification } = useNotification()
  const scrollRootRef = React.useRef(null)
  const loadMoreSentinelRef = React.useRef(null)
  const requestTokenRef = React.useRef(0)
  const quickDownloadResetTimerRef = React.useRef(null)
  const pendingElectronDownloadRef = React.useRef(null)

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
  const [selectedListAnchorEl, setSelectedListAnchorEl] = React.useState(null)
  const [actionEntry, setActionEntry] = React.useState(null)
  const [embedPreview, setEmbedPreview] = React.useState(null)
  const [quickDownloadState, setQuickDownloadState] = React.useState(null)
  const [selectedEntriesMap, setSelectedEntriesMap] = React.useState(() => toSelectedEntriesMap(initialRuntimeRef.current.selectedEntries))

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
    const normalizedChecked = Boolean(checked)
    const candidate = buildSelectionEntry(entry)
    if (!candidate) return

    setSelectedEntriesMap((prev) => {
      const next = new Map(prev)
      if (normalizedChecked) {
        next.set(candidate.identity, candidate)
      } else {
        next.delete(candidate.identity)
      }
      return next
    })
  }, [buildSelectionEntry])

  const selectedEntries = React.useMemo(() => Array.from(selectedEntriesMap.values()), [selectedEntriesMap])
  const selectedCount = selectedEntries.length

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

  const handleOpenSelectedList = React.useCallback((event) => {
    setSelectedListAnchorEl(event.currentTarget)
  }, [])

  const handleCloseSelectedList = React.useCallback(() => {
    setSelectedListAnchorEl(null)
  }, [])

  const handleClearSelectedEntries = React.useCallback(() => {
    setSelectedEntriesMap(new Map())
    setSelectedListAnchorEl(null)
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

  const handleDownloadSelectedEntries = React.useCallback(() => {
    const urls = Array.from(new Set(
      selectedEntries
        .map((item) => String(item?.url || '').trim())
        .filter(Boolean)
    ))
    if (!urls.length) return

    if (typeof onOpenMultiInNewTab === 'function') {
      onOpenMultiInNewTab(urls)
      handleClearSelectedEntries()
      return
    }

    showNotification(t('search.errorGeneric'), 'error')
  }, [handleClearSelectedEntries, onOpenMultiInNewTab, selectedEntries, showNotification, t])

  const isQuickDownloadActive = Boolean(quickDownloadState?.active)

  const handleOpenDownloadDropdown = (e, entry) => {
    e.stopPropagation()
    if (isQuickDownloadActive) return

    setDownloadAnchorEl(e.currentTarget)
    setActionEntry(entry)
  }

  const handleCloseKebab = () => {
    setKebabAnchorEl(null)
  }

  const handleCloseDownloadDropdown = React.useCallback(() => {
    setDownloadAnchorEl(null)
  }, [])

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

  const handleDownloadQuick = React.useCallback(async (requestedFormat) => {
    const format = String(requestedFormat || '').trim().toLowerCase()
    if (!DIRECT_DOWNLOAD_FORMAT_OPTIONS.includes(format)) return
    if (!actionEntry || isQuickDownloadActive) return

    setDownloadAnchorEl(null)

    const entryId = getSearchEntryIdentity(actionEntry)
    const sourceUrl = toHttpUrl(actionEntry?.url)
    const serviceValue = normalizeServiceKey(actionEntry?.service || lastService) || GENERIC_SERVICE_KEY
    const title = String(actionEntry?.title || actionEntry?.url || '').trim() || 'download'
    const uploader = String(actionEntry?.uploader || '').trim()
    const thumbnailUrl = String(actionEntry?.thumbnail || '').trim()

    if (!sourceUrl) {
      showNotification(t('search.errorGeneric'), 'error')
      return
    }

    if (format === 'thumbnail' && !toHttpUrl(thumbnailUrl)) {
      showNotification(t('search.quickThumbnailMissing'), 'warning')
      return
    }

    if (quickDownloadResetTimerRef.current) {
      clearTimeout(quickDownloadResetTimerRef.current)
      quickDownloadResetTimerRef.current = null
    }
    if (pendingElectronDownloadRef.current?.fallbackTimeout) {
      clearTimeout(pendingElectronDownloadRef.current.fallbackTimeout)
    }
    pendingElectronDownloadRef.current = null

    setQuickDownloadState({
      active: true,
      entryId,
      format,
      progress: 2,
      stage: 'starting',
      title,
    })

    const apiBase = getApiBase()
    const streamEndpoint = format === 'thumbnail'
      ? '/api/download/thumbnail/stream'
      : '/api/download/stream'
    const payload = format === 'thumbnail'
      ? {
        url: sourceUrl,
        thumbnailUrl,
        format: 'jpg',
        videoTitle: title,
        service: serviceValue,
      }
      : {
        url: sourceUrl,
        service: serviceValue,
        type: format === 'mp3' ? 'audio' : 'video',
        format,
        videoTitle: title,
        metadata: format === 'mp3'
          ? {
            title,
            artist: uploader,
          }
          : undefined,
      }

    let streamError = ''
    let streamEndedAsFailed = false
    let completedPayload = null

    try {
      const response = await fetch(`${apiBase}${streamEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        if (format === 'thumbnail' && response.status === 404) {
          setQuickDownloadState((prev) => {
            if (!prev || prev.entryId !== entryId) return prev
            return {
              ...prev,
              progress: 86,
              stage: 'processing',
            }
          })

          completedPayload = {
            filename: `${title}.jpg`,
            directUrl: `${apiBase}/api/proxy-image?url=${encodeURIComponent(thumbnailUrl)}&filename=${encodeURIComponent(title)}&format=jpg`,
          }
        } else {
          let errorPayload = null
          try {
            errorPayload = await response.json()
          } catch {
            errorPayload = null
          }
          const message = formatYtDlpErrorMessage(t, errorPayload || `HTTP ${response.status}`, {
            fallbackKey: 'search.errorGeneric',
            includeRawForUnknown: true,
          })
          throw new Error(message)
        }
      } else {
        await readSseEventsFromResponse(response, (eventName, rawData) => {
          if (eventName === 'progress') {
            try {
              const data = JSON.parse(String(rawData || '{}'))
              const numericPercent = Number(data?.percent)
              const percent = Number.isFinite(numericPercent) ? Math.max(0, Math.min(100, numericPercent)) : 0
              setQuickDownloadState((prev) => {
                if (!prev || prev.entryId !== entryId) return prev
                return {
                  ...prev,
                  progress: percent,
                  stage: String(data?.stage || prev.stage || 'downloading'),
                }
              })
            } catch {
              // ignore malformed progress payloads
            }
            return
          }

          if (eventName === 'complete') {
            try {
              const data = JSON.parse(String(rawData || '{}'))
              completedPayload = data && typeof data === 'object' ? data : null
            } catch {
              completedPayload = null
            }
            return
          }

          if (eventName === 'error') {
            const parsed = (() => {
              try {
                return JSON.parse(String(rawData || '{}'))
              } catch {
                return rawData
              }
            })()
            streamError = formatYtDlpErrorMessage(t, parsed, {
              fallbackKey: 'search.errorGeneric',
              includeRawForUnknown: true,
            })
            return
          }

          if (eventName === 'end') {
            const endState = String(rawData || '').trim().toLowerCase()
            if (endState === 'failed') {
              streamEndedAsFailed = true
            }
          }
        })
      }

      if (streamError) {
        throw new Error(streamError)
      }
      if (streamEndedAsFailed || (!completedPayload?.url && !completedPayload?.directUrl)) {
        throw new Error(t('search.errorGeneric'))
      }

      const filename = String(completedPayload.filename || '').trim() || `${title}.${format === 'thumbnail' ? 'jpg' : format}`
      const directUrl = String(completedPayload.directUrl || '').trim()
      const resolvedDownloadUrl = directUrl || `${apiBase}${String(completedPayload.url || '').trim()}`
      if (!resolvedDownloadUrl) {
        throw new Error(t('search.errorGeneric'))
      }

      const runtime = (typeof window !== 'undefined' && window.yloaderRuntime) ? window.yloaderRuntime : null
      const isElectronRuntime = Boolean(runtime?.isElectron)
      const quickToken = isElectronRuntime
        ? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
        : ''
      const downloadUrl = quickToken
        ? appendUrlQueryParam(resolvedDownloadUrl, 'quickToken', quickToken)
        : resolvedDownloadUrl

      setQuickDownloadState((prev) => {
        if (!prev || prev.entryId !== entryId) return prev
        return {
          ...prev,
          progress: 100,
          stage: 'saving',
        }
      })

      if (isElectronRuntime) {
        const fallbackTimeout = setTimeout(() => {
          const pending = pendingElectronDownloadRef.current
          if (!pending || pending.sourceUrl !== downloadUrl) return
          pendingElectronDownloadRef.current = null
          setQuickDownloadState(null)
          showNotification(t('search.quickDownloadCompleted', { filename }), 'success')
        }, 12000)

        pendingElectronDownloadRef.current = {
          sourceUrl: downloadUrl,
          filename,
          fallbackTimeout,
        }
      } else {
        quickDownloadResetTimerRef.current = setTimeout(() => {
          setQuickDownloadState(null)
          showNotification(t('search.quickDownloadCompleted', { filename }), 'success')
        }, 500)
      }

      triggerBrowserDownload(downloadUrl, filename)
    } catch (error) {
      const message = String(error?.message || t('search.errorGeneric')).trim() || t('search.errorGeneric')
      showNotification(message, 'error')
      setQuickDownloadState(null)

      if (pendingElectronDownloadRef.current?.fallbackTimeout) {
        clearTimeout(pendingElectronDownloadRef.current.fallbackTimeout)
      }
      pendingElectronDownloadRef.current = null
    }
  }, [
    actionEntry,
    isQuickDownloadActive,
    lastService,
    showNotification,
    t,
  ])

  const handleCloseEmbedPreview = React.useCallback(() => {
    setEmbedPreview(null)
  }, [])

  const handleOpenEmbedPreview = React.useCallback((entry) => {
    const previewPayload = resolvePreviewEmbedPayload(entry, lastService, getServiceLabel)
    if (!previewPayload) return
    setEmbedPreview(previewPayload)
  }, [getServiceLabel, lastService])

  React.useEffect(() => {
    const runtime = (typeof window !== 'undefined' && window.yloaderRuntime) ? window.yloaderRuntime : null
    const subscribeDownloadCompleted = runtime?.downloads?.onDownloadCompleted
    if (typeof subscribeDownloadCompleted !== 'function') return undefined

    return subscribeDownloadCompleted((payload) => {
      const pending = pendingElectronDownloadRef.current
      if (!pending) return

      const payloadSourceUrl = String(payload?.sourceUrl || '').trim()
      if (pending.sourceUrl && payloadSourceUrl && pending.sourceUrl !== payloadSourceUrl) {
        const payloadFilename = String(payload?.filename || '').trim().toLowerCase()
        const pendingFilename = String(pending.filename || '').trim().toLowerCase()
        if (!payloadFilename || !pendingFilename || payloadFilename !== pendingFilename) return
      }

      if (pending.fallbackTimeout) {
        clearTimeout(pending.fallbackTimeout)
      }
      pendingElectronDownloadRef.current = null

      const state = String(payload?.state || '').trim().toLowerCase()
      if (state === 'cancelled') {
        setQuickDownloadState(null)
        showNotification(t('search.quickDownloadCancelled'), 'warning')
        return
      }
      if (state !== 'completed') return

      const filename = String(payload?.filename || pending.filename || '').trim() || pending.filename || ''
      const savePath = String(payload?.savePath || '').trim()
      const revealFile = runtime?.downloads?.revealFile
      setQuickDownloadState(null)

      if (savePath && typeof revealFile === 'function') {
        showNotification(t('search.quickDownloadCompleted', { filename }), 'success', {
          actionLabel: t('search.openDownloadedFile'),
          onAction: async () => {
            await revealFile(savePath)
          },
        })
        return
      }

      showNotification(t('search.quickDownloadCompleted', { filename }), 'success')
    })
  }, [showNotification, t])

  React.useEffect(() => () => {
    if (quickDownloadResetTimerRef.current) {
      clearTimeout(quickDownloadResetTimerRef.current)
      quickDownloadResetTimerRef.current = null
    }
    if (pendingElectronDownloadRef.current?.fallbackTimeout) {
      clearTimeout(pendingElectronDownloadRef.current.fallbackTimeout)
    }
    pendingElectronDownloadRef.current = null
  }, [])

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

  React.useEffect(() => {
    if (selectedCount > 0) return
    setSelectedListAnchorEl(null)
  }, [selectedCount])

  const showInitialLoading = loadingInitial && results.length === 0
  const showEmptyState = !showInitialLoading && !errorMessage && Boolean(lastQuery) && results.length === 0

  const isSearched = loadingInitial || loadingMore || results.length > 0 || errorMessage || Boolean(lastQuery)
  const quickDownloadOptions = React.useMemo(() => ([
    {
      key: 'mp4',
      label: t('search.downloadFormat', { format: 'MP4' }),
      icon: Film,
    },
    {
      key: 'mp3',
      label: t('search.downloadFormat', { format: 'MP3' }),
      icon: Music2,
    },
    {
      key: 'thumbnail',
      label: t('search.downloadThumbnail'),
      icon: Image,
    },
  ]), [t])
  const activeQuickDownloadFormat = String(quickDownloadState?.format || '').trim().toLowerCase()
  const activeQuickDownloadProgress = Number.isFinite(Number(quickDownloadState?.progress))
    ? Math.max(0, Math.min(100, Number(quickDownloadState.progress)))
    : 0
  const selectedListOpen = Boolean(selectedListAnchorEl)
  const quickDownloadTitle = String(quickDownloadState?.title || '').trim()

  const quickDownloadFormatLabel = React.useMemo(() => {
    if (activeQuickDownloadFormat === 'mp4') return t('search.downloadFormat', { format: 'MP4' })
    if (activeQuickDownloadFormat === 'mp3') return t('search.downloadFormat', { format: 'MP3' })
    if (activeQuickDownloadFormat === 'thumbnail') return t('search.downloadThumbnail')
    return t('search.download')
  }, [activeQuickDownloadFormat, t])

  const quickDownloadStageLabel = React.useMemo(() => {
    const stage = String(quickDownloadState?.stage || '').trim().toLowerCase()
    if (stage === 'starting') return t('search.quickDownloadStageStarting')
    if (stage === 'downloading') return t('search.quickDownloadStageDownloading')
    if (stage === 'processing') return t('search.quickDownloadStageProcessing')
    if (stage === 'saving') return t('search.quickDownloadStageSaving')
    if (stage === 'complete') return t('search.quickDownloadStageComplete')
    return t('search.quickDownloadStageWorking')
  }, [quickDownloadState?.stage, t])

  const calculatedSpacer = Math.max(0, (availableHeight / 2) - 28)

  const searchBarJsx = (
    <>
      <Menu
        anchorEl={serviceMenuAnchor}
        open={Boolean(serviceMenuAnchor)}
        onClose={() => setServiceMenuAnchor(null)}
        transformOrigin={{ horizontal: 'left', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
        slotProps={{ paper: { sx: { width: 220, mt: 1, borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' } } }}
      >
        {SEARCH_SERVICE_OPTIONS.map((option) => (
          <MenuItem
            key={option.value}
            selected={selectedService === option.value}
            onClick={() => {
              const nextService = option.value
              const hasChanged = selectedService !== nextService
              setSelectedService(nextService)
              setServiceMenuAnchor(null)
              if (hasChanged) {
                rerunLastSearchForService(nextService)
              }
            }}
            sx={{ py: 1.5, borderRadius: 2, mx: 1 }}
          >
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.5 }}>
              <ServiceIcon serviceKey={option.iconKey} size={20} />
              <Typography variant="body2" fontWeight={selectedService === option.value ? 800 : 500}>
                {t(option.labelKey)}
              </Typography>
            </Box>
          </MenuItem>
        ))}
      </Menu>

      <TextField
        value={query}
        fullWidth
        placeholder={t('search.queryPlaceholder')}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            handleSubmit()
          }
        }}
        sx={(muiTheme) => ({
          '& .MuiOutlinedInput-root': {
            position: 'relative',
            borderRadius: 9999,
            backgroundColor: muiTheme.palette.mode === 'dark' ? '#303030' : '#f9f9f9',
            outline: 'none',
            '&:focus-within': {
              outline: 'none',
              boxShadow: 'none',
            },
            '& fieldset': {
              borderColor: muiTheme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0',
              borderWidth: '1px !important',
            },
            '&:hover fieldset': {
              borderColor: muiTheme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0',
            },
            '&.Mui-focused fieldset': {
              borderColor: muiTheme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0',
              borderWidth: '1px !important',
            },
            boxShadow: muiTheme.palette.mode === 'dark' ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
            transition: 'box-shadow 0.3s, border-color 0.3s'
          },
          '& .MuiOutlinedInput-input': {
            paddingLeft: '8px',
            paddingRight: '16px',
            color: muiTheme.palette.text.primary,
            fontWeight: 700,
            outline: 'none',
          },
          '& .MuiOutlinedInput-input::placeholder': {
            color: muiTheme.palette.text.secondary,
            fontWeight: 700,
          },
        })}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start" sx={{ ml: 0, mr: 0.25 }}>
              <Button
                size="small"
                onClick={(e) => setServiceMenuAnchor(e.currentTarget)}
                startIcon={<ServiceIcon serviceKey={selectedServiceOption.iconKey} size={18} />}
                endIcon={<ChevronDown size={14} />}
                sx={{
                  height: 36,
                  borderRadius: 9999,
                  textTransform: 'none',
                  fontWeight: 700,
                  px: 1.5,
                  color: 'text.primary',
                  bgcolor: 'transparent',
                  '&:hover': { bgcolor: 'action.hover' }
                }}
              >
                {t(selectedServiceOption.labelKey)}
              </Button>
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              {Boolean(query) && (
                <IconButton size="small" onClick={handleClearSearch} title={t('search.clear')} sx={{ mr: 0.5, opacity: 0.5, '&:hover': { opacity: 1 } }}>
                  <X size={18} />
                </IconButton>
              )}
              <IconButton
                size="small"
                edge="end"
                disabled={loadingInitial || !String(query || '').trim()}
                onClick={handleSubmit}
                sx={(muiTheme) => ({
                  width: 36,
                  height: 36,
                  bgcolor: muiTheme.palette.mode === 'dark' ? '#ffffff' : '#000000',
                  color: muiTheme.palette.mode === 'dark' ? '#000000' : '#ffffff',
                  borderRadius: '50%',
                  boxShadow: muiTheme.palette.mode === 'dark'
                    ? '0 2px 6px rgba(0,0,0,0.4)'
                    : '0 2px 6px rgba(0,0,0,0.25)',
                  '&:hover': {
                    bgcolor: muiTheme.palette.mode === 'dark' ? '#f5f5f5' : '#111111',
                  },
                  '&.Mui-disabled': {
                    opacity: 0.55,
                    color: muiTheme.palette.mode === 'dark' ? '#000000' : '#ffffff',
                    bgcolor: muiTheme.palette.mode === 'dark' ? '#ffffff' : '#000000',
                  },
                })}
              >
                <SearchIcon size={18} />
              </IconButton>
            </InputAdornment>
          ),
        }}
        inputProps={{
          'aria-label': t('search.queryAria'),
          spellCheck: 'false',
        }}
      />
    </>
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

          {showInitialLoading && (
            <Box sx={{ overflow: 'hidden' }}>
              <Stack spacing={2} sx={{ mt: 2 }}>
                {Array.from({ length: hasMeasured && availableHeight > 0 ? Math.max(2, Math.floor((availableHeight - 160) / 140)) : 4 }).map((_, i) => {
                  const useSquareThumbnail = SQUARE_THUMBNAIL_SERVICES.has(selectedService)
                  const thumbnailWidth = useSquareThumbnail ? { xs: 110, sm: 130 } : { xs: 140, sm: 230 }
                  const searchSkeletonSx = {
                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                    '&::after': {
                      background: (theme) => theme.palette.mode === 'dark'
                        ? 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)'
                        : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)',
                    },
                  }

                  return (
                    <Card elevation={0} key={i} sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider', display: 'flex', overflow: 'hidden', height: { xs: 110, sm: 130 } }}>
                      <Box sx={{ width: thumbnailWidth, minWidth: thumbnailWidth, flexShrink: 0, position: 'relative' }}>
                        <Skeleton variant="rectangular" width="100%" height="100%" animation="wave" sx={searchSkeletonSx} />
                        <Skeleton variant="rounded" width={34} height={16} animation="wave" sx={{ position: 'absolute', bottom: 8, right: 8, borderRadius: 0.75, ...searchSkeletonSx }} />
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, p: { xs: 1.5, sm: 2 }, pr: { xs: 7, sm: 10 }, justifyContent: 'center', position: 'relative' }}>
                        <Skeleton variant="text" width="85%" height={26} animation="wave" sx={searchSkeletonSx} />
                        <Skeleton variant="text" width="45%" height={20} animation="wave" sx={{ mt: 0.5, ...searchSkeletonSx }} />
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mt: 1 }}>
                          <Skeleton variant="circular" width={14} height={14} animation="wave" sx={searchSkeletonSx} />
                          <Skeleton variant="text" width={60} height={18} animation="wave" sx={searchSkeletonSx} />
                        </Box>
                        <Skeleton variant="circular" width={32} height={32} animation="wave" sx={{ position: 'absolute', top: 8, right: 8, ...searchSkeletonSx }} />
                        <Skeleton variant="rounded" width={110} height={32} animation="wave" sx={{ position: 'absolute', bottom: 12, right: 12, borderRadius: 9999, ...searchSkeletonSx }} />
                      </Box>
                    </Card>
                  )
                })}
              </Stack>
            </Box>
          )}

          {showEmptyState && (
            <Stack spacing={0.5} sx={{ py: 8, textAlign: 'center' }}>
              <Typography variant="h6" fontWeight={800}>{t('search.noResultsTitle')}</Typography>
              <Typography variant="body2" color="text.secondary">{t('search.noResultsSubtitle')}</Typography>
            </Stack>
          )}

          {results.length > 0 && !loadingInitial && (
            <Stack spacing={2}>
              {results.map((entry) => {
                const rawService = normalizeServiceKey(entry?.service)
                const serviceKey = rawService || GENERIC_SERVICE_KEY
                const serviceLabel = getServiceLabel(serviceKey)
                const supportsEmbedPreview = EMBED_PREVIEW_SERVICES.has(serviceKey)
                const useSquareThumbnail = SQUARE_THUMBNAIL_SERVICES.has(serviceKey)
                const duration = entry?.durationString || formatDuration(entry?.duration)
                const title = String(entry?.title || '').trim() || String(entry?.url || '').trim()
                const uploader = String(entry?.uploader || '').trim()
                const thumbnail = String(entry?.thumbnail || '').trim()
                const itemId = getSearchEntryIdentity(entry) || String(entry?.url || `${serviceKey}-${title}`).trim()
                const isSelected = selectedEntriesMap.has(itemId)
                const thumbnailWidth = useSquareThumbnail
                  ? { xs: 110, sm: 130 }
                  : { xs: 140, sm: 230 }

                return (
                  <Card elevation={0} key={itemId} sx={{ position: 'relative', borderRadius: 1.5, border: '1px solid', borderColor: 'divider', display: 'flex', overflow: 'hidden', height: { xs: 110, sm: 130 } }}>
                    <Box
                      sx={{ display: 'flex', alignItems: 'stretch', width: '100%', justifyContent: 'flex-start' }}
                    >
                      <Box sx={{
                        width: thumbnailWidth,
                        minWidth: thumbnailWidth,
                        position: 'relative',
                        bgcolor: 'action.hover',
                        flexShrink: 0,
                        ...(supportsEmbedPreview ? {
                          '&:hover .search-thumb-duration, &:focus-within .search-thumb-duration': {
                            opacity: 0,
                          },
                        } : {}),
                      }}>
                        {supportsEmbedPreview ? (
                          <CardActionArea
                            onClick={() => handleOpenEmbedPreview(entry)}
                            aria-label={t('search.openPreview', { service: serviceLabel })}
                            sx={{
                              position: 'absolute',
                              inset: 0,
                              transition: 'none',
                              '& .search-thumb-overlay': {
                                opacity: 0,
                                transition: 'none',
                              },
                              '&:hover .search-thumb-media, &.Mui-focusVisible .search-thumb-media': {
                                filter: 'brightness(0.6)',
                              },
                              '&:hover .search-thumb-overlay, &.Mui-focusVisible .search-thumb-overlay': {
                                opacity: 1,
                              },
                              '& .MuiCardActionArea-focusHighlight': {
                                transition: 'none',
                              }
                            }}
                          >
                            {thumbnail ? (
                              <Box
                                component="img"
                                src={thumbnail}
                                alt=""
                                className="search-thumb-media"
                                sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                                loading="lazy"
                              />
                            ) : (
                              <Stack
                                className="search-thumb-media"
                                sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
                              >
                                <ServiceIcon serviceKey={serviceKey} size={34} title={serviceLabel} />
                              </Stack>
                            )}

                            <Stack
                              className="search-thumb-overlay"
                              sx={{
                                position: 'absolute',
                                inset: 0,
                                alignItems: 'center',
                                justifyContent: 'center',
                                bgcolor: 'rgba(0,0,0,0.25)',
                                pointerEvents: 'none',
                              }}
                            >
                              <Box
                                sx={{
                                  width: 44,
                                  height: 44,
                                  borderRadius: '50%',
                                  bgcolor: 'rgba(0,0,0,0.66)',
                                  border: '1px solid rgba(255,255,255,0.6)',
                                  color: '#fff',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Play size={20} fill="currentColor" />
                              </Box>
                            </Stack>
                          </CardActionArea>
                        ) : thumbnail ? (
                          <Box
                            component="img"
                            src={thumbnail}
                            alt=""
                            sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                            loading="lazy"
                          />
                        ) : (
                          <Stack
                            sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <ServiceIcon serviceKey={serviceKey} size={34} title={serviceLabel} />
                          </Stack>
                        )}

                        {duration ? (
                          <Box
                            className="search-thumb-duration"
                            sx={{
                              position: 'absolute',
                              right: 8,
                              bottom: 8,
                              bgcolor: 'rgba(0,0,0,0.72)',
                              color: '#fff',
                              px: 0.8,
                              py: 0.2,
                              borderRadius: 0.75,
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              fontFeatureSettings: '"tnum"',
                              zIndex: 2,
                              transition: 'none',
                              pointerEvents: 'none',
                              userSelect: 'none',
                            }}
                          >
                            {duration}
                          </Box>
                        ) : null}
                      </Box>

                      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, p: { xs: 1.5, sm: 2 }, pr: { xs: 7, sm: 10 }, overflow: 'hidden', justifyContent: 'center', position: 'relative' }}>
                        <Typography variant="body1" fontWeight={800} noWrap>
                          {title}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.5 }}>
                          {uploader || t('search.unknownUploader')}
                        </Typography>

                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mt: 1 }}>
                          <ServiceIcon serviceKey={serviceKey} size={14} title={serviceLabel} />
                          <Typography variant="caption" fontWeight={700}>{serviceLabel}</Typography>
                        </Box>
                      </Box>
                    </Box>

                    <Checkbox
                      size="small"
                      checked={isSelected}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        event.stopPropagation()
                        toggleEntrySelection(entry, event.target.checked)
                      }}
                      inputProps={{ 'aria-label': t('search.selectResultAria', { title }) }}
                      sx={{
                        position: 'absolute',
                        top: 6,
                        left: 6,
                        zIndex: 3,
                        p: 0.25,
                        borderRadius: 0.75,
                        color: '#ffffff',
                        bgcolor: 'rgba(0,0,0,0.45)',
                        '&.Mui-checked': {
                          color: '#ffffff',
                          bgcolor: 'rgba(0,0,0,0.62)',
                        },
                        '&:hover': {
                          bgcolor: 'rgba(0,0,0,0.58)',
                        },
                      }}
                    />

                    <IconButton
                      size="small"
                      onClick={(e) => handleOpenKebab(e, entry)}
                      sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', '&:hover': { bgcolor: 'action.hover' } }}
                    >
                      <MoreVertical size={16} />
                    </IconButton>

                    <ButtonGroup
                      variant="contained"
                      disableElevation
                      size="small"
                      sx={(theme) => {
                        const baseColor = getServiceThemeColor(serviceKey)
                        const bgColor = (theme.palette.mode === 'dark' && /^#000000$/i.test(baseColor)) ? '#333333' : baseColor
                        const effectiveBg = bgColor || 'primary.main'
                        const effectiveText = (theme.palette.mode === 'light' && /^#FFFFFF$/i.test(baseColor)) ? '#000000' : '#ffffff'

                        return {
                          position: 'absolute',
                          bottom: 12,
                          right: 12,
                          borderRadius: 9999,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                          '& .MuiButton-root': {
                            textTransform: 'none',
                            fontWeight: 700,
                            bgcolor: effectiveBg,
                            color: effectiveText,
                          },
                          '& .MuiButton-root:hover': {
                            bgcolor: effectiveBg,
                            filter: 'brightness(1.15)',
                          },
                          '& .MuiButtonGroup-grouped:not(:last-of-type)': {
                            borderColor: theme.palette.mode === 'light' && /^#FFFFFF$/i.test(baseColor) 
                              ? 'rgba(0,0,0,0.15)' 
                              : 'rgba(255,255,255,0.25)',
                          }
                        }
                      }}
                    >
                      <Button onClick={() => handleDownloadMain(entry)} sx={{ px: 2, borderRadius: '9999px 0 0 9999px' }}>
                        {t('search.download')}
                      </Button>
                      <Button size="small" onClick={(e) => handleOpenDownloadDropdown(e, entry)} sx={{ px: 0.75, minWidth: 0, borderRadius: '0 9999px 9999px 0' }}>
                        <ChevronDown size={16} />
                      </Button>
                    </ButtonGroup>
                  </Card>
                )
              })}
            </Stack>
          )}

          {results.length > 0 && (
            <Box ref={loadMoreSentinelRef} sx={{ width: '100%', height: 1 }} />
          )}

          {loadingMore && results.length > 0 && (
            <Stack spacing={1} alignItems="center" justifyContent="center" sx={{ py: 3 }}>
              <CircularProgress size={22} />
              <Typography variant="body2" color="text.secondary">{t('search.loadingMore')}</Typography>
            </Stack>
          )}

          {selectedCount > 0 && (
            <Box sx={{ position: 'sticky', bottom: { xs: 8, sm: 12 }, zIndex: 24, mt: 2, pb: 1 }}>
              <Box
                sx={{
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                  px: { xs: 1, sm: 1.5 },
                  py: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1,
                  boxShadow: '0 8px 26px rgba(0,0,0,0.14)',
                }}
              >
                <Button
                  size="small"
                  onClick={selectedListOpen ? handleCloseSelectedList : handleOpenSelectedList}
                  endIcon={selectedListOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  sx={{ textTransform: 'none', fontWeight: 800, px: 1.2 }}
                >
                  {t('search.selectedCount', { count: selectedCount })}
                </Button>

                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="text" onClick={handleClearSelectedEntries} sx={{ textTransform: 'none', fontWeight: 700 }}>
                    {t('tabs.cancel')}
                  </Button>
                  <Button size="small" variant="contained" onClick={handleDownloadSelectedEntries} sx={{ textTransform: 'none', fontWeight: 800 }}>
                    {t('search.downloadSelected')}
                  </Button>
                </Stack>
              </Box>
            </Box>
          )}
        </Box>

        <Menu
          anchorEl={kebabAnchorEl}
          open={Boolean(kebabAnchorEl)}
          onClose={handleCloseKebab}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          slotProps={{ paper: { sx: { width: 220, mt: 1, borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' } } }}
        >
          <MenuItem onClick={handleKebabNewTab} sx={{ py: 1.5, borderRadius: 2, mx: 1 }}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25 }}>
              <ExternalLink size={16} />
              <Typography variant="body2" fontWeight={700}>{t('search.openInNewTab')}</Typography>
            </Box>
          </MenuItem>
          <MenuItem onClick={handleKebabBrowser} sx={{ py: 1.5, borderRadius: 2, mx: 1 }}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25 }}>
              <Globe size={16} />
              <Typography variant="body2" fontWeight={700}>{t('search.openInBrowser')}</Typography>
            </Box>
          </MenuItem>
        </Menu>

        <Menu
          anchorEl={downloadAnchorEl}
          open={Boolean(downloadAnchorEl)}
          onClose={handleCloseDownloadDropdown}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          slotProps={{ paper: { sx: { width: 240, mt: 1, borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' } } }}
        >
          {quickDownloadOptions.map((option) => {
            const Icon = option.icon

            return (
              <MenuItem
                key={option.key}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  void handleDownloadQuick(option.key)
                }}
                sx={{
                  py: 1.5,
                  borderRadius: 2,
                  mx: 1,
                }}
              >
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25 }}>
                  <Icon size={16} />
                  <Typography variant="body2" fontWeight={700}>{option.label}</Typography>
                </Box>
              </MenuItem>
            )
          })}
        </Menu>

        <Menu
          anchorEl={selectedListAnchorEl}
          open={selectedListOpen}
          onClose={handleCloseSelectedList}
          transformOrigin={{ horizontal: 'left', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
          slotProps={{ paper: { sx: { width: 'min(480px, calc(100vw - 32px))', mt: 1, borderRadius: 3, boxShadow: '0 8px 30px rgba(0,0,0,0.16)', maxHeight: 'min(56vh, 460px)', overflow: 'auto' } } }}
        >
          {selectedEntries.length === 0 ? (
            <MenuItem disabled sx={{ py: 1.5, borderRadius: 2, mx: 1 }}>
              <Typography variant="body2" color="text.secondary">{t('search.selectedListEmpty')}</Typography>
            </MenuItem>
          ) : selectedEntries.map((item) => (
            <Box
              key={item.identity}
              sx={{
                px: 1.25,
                py: 0.9,
                mx: 1,
                my: 0.45,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                bgcolor: 'action.hover',
              }}
            >
              <Box sx={{ width: 44, height: 44, borderRadius: 1, overflow: 'hidden', bgcolor: 'action.selected', flexShrink: 0 }}>
                {item.thumbnail ? (
                  <Box component="img" src={item.thumbnail} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                ) : (
                  <Stack sx={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                    <ServiceIcon serviceKey={item.service || 'generic'} size={18} />
                  </Stack>
                )}
              </Box>

              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" fontWeight={700} noWrap>{item.title}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap>{item.url}</Typography>
              </Box>

              <IconButton
                size="small"
                aria-label={t('search.removeSelectedAria', { title: item.title })}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  handleRemoveSelectedEntry(item.identity)
                }}
              >
                <X size={15} />
              </IconButton>
            </Box>
          ))}
        </Menu>

        <Dialog
          open={isQuickDownloadActive}
          onClose={() => {}}
          fullScreen
          disableEscapeKeyDown
          PaperProps={{
            sx: {
              m: 0,
              p: 0,
              borderRadius: 0,
              maxWidth: 'none',
              bgcolor: 'transparent',
              boxShadow: 'none',
            },
          }}
          BackdropProps={{
            sx: {
              backdropFilter: 'blur(8px)',
              bgcolor: (theme) => theme.palette.mode === 'dark'
                ? 'rgba(0,0,0,0.42)'
                : 'rgba(245,245,245,0.48)',
            },
          }}
        >
          <DialogContent sx={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
            <Box
              sx={{
                width: 'min(560px, calc(100vw - 32px))',
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                boxShadow: '0 20px 42px rgba(0,0,0,0.22)',
                px: { xs: 2, sm: 2.5 },
                py: { xs: 2, sm: 2.5 },
              }}
            >
              <Typography variant="h6" fontWeight={800}>
                {t('search.quickDownloadModalTitle')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {t('search.quickDownloadModalDescription', { format: quickDownloadFormatLabel })}
              </Typography>
              {quickDownloadTitle ? (
                <Typography variant="body2" fontWeight={700} noWrap sx={{ mt: 1.25 }}>
                  {quickDownloadTitle}
                </Typography>
              ) : null}
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
                {quickDownloadStageLabel}
              </Typography>

              <LinearProgress
                variant="determinate"
                value={activeQuickDownloadProgress}
                sx={{
                  mt: 1.15,
                  height: 8,
                  borderRadius: 999,
                  bgcolor: (theme) => theme.palette.mode === 'dark'
                    ? 'rgba(255,255,255,0.15)'
                    : 'rgba(0,0,0,0.1)',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: (theme) => theme.palette.mode === 'dark'
                      ? 'rgba(255,255,255,0.56)'
                      : 'rgba(0,0,0,0.46)',
                  },
                }}
              />

              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
                {`${Math.round(activeQuickDownloadProgress)}%`}
              </Typography>
            </Box>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(embedPreview?.embedUrl)}
          onClose={handleCloseEmbedPreview}
          fullWidth
          maxWidth={false}
          keepMounted={false}
          PaperProps={{
            sx: {
              width: embedPreview?.serviceKey === 'soundcloud'
                ? 'min(680px, calc(100vw - 24px))'
                : 'min(980px, calc(100vw - 24px))',
              m: 1.5,
              borderRadius: 2.5,
              overflow: 'hidden',
            },
          }}
        >
          <DialogTitle
            sx={{
              px: 2,
              py: 1.25,
              borderBottom: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2,
            }}
          >
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
              <ServiceIcon serviceKey={embedPreview?.serviceKey || 'generic'} size={18} />
              <Typography variant="subtitle1" fontWeight={800} noWrap>
                {embedPreview?.serviceLabel || t('search.title')}
              </Typography>
            </Box>

            <IconButton
              size="small"
              aria-label={t('search.closePreview')}
              onClick={handleCloseEmbedPreview}
            >
              <X size={18} />
            </IconButton>
          </DialogTitle>

          <DialogContent sx={{ p: 0, bgcolor: embedPreview?.serviceKey === 'soundcloud' ? 'background.default' : '#000' }}>
            {embedPreview?.embedUrl ? (
              <Box
                sx={{
                  position: 'relative',
                  width: '100%',
                  ...(embedPreview?.serviceKey === 'soundcloud'
                    ? { height: 166, bgcolor: 'transparent' }
                    : { pt: '56.25%', bgcolor: '#000' }),
                }}
              >
                <Box
                  key={embedPreview.embedUrl}
                  component="iframe"
                  src={embedPreview.embedUrl}
                  scrolling={embedPreview?.serviceKey === 'soundcloud' ? 'no' : undefined}
                  title={t('search.previewFrameTitle', { service: embedPreview.serviceLabel || t('search.title') })}
                  allow={embedPreview?.serviceKey === 'soundcloud' ? 'autoplay' : 'autoplay; encrypted-media; picture-in-picture; web-share'}
                  allowFullScreen={embedPreview?.serviceKey !== 'soundcloud'}
                  loading="eager"
                  referrerPolicy="strict-origin-when-cross-origin"
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    border: 0,
                  }}
                />
              </Box>
            ) : null}
          </DialogContent>
        </Dialog>
      </Container>
    </SimpleBarScrollArea>
  )
}
