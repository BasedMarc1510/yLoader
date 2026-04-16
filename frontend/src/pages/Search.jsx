import React from 'react'
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CircularProgress,
  Container,
  Grid,
  InputAdornment,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { ArrowRight, Search as SearchIcon } from 'lucide-react'
import ServiceIcon from '../components/ServiceIcon'
import { useI18n } from '../providers/I18nProvider'
import {
  GENERIC_SERVICE_KEY,
  detectService,
  getApiBase,
  getServiceDisplayName,
  normalizeServiceKey,
} from '../utils/metadata'

const SEARCH_SERVICE_OPTIONS = [
  { value: 'youtube', labelKey: 'search.services.youtube', iconKey: 'youtube' },
  { value: 'youtubemusic', labelKey: 'search.services.youtubeMusic', iconKey: 'youtube' },
  { value: 'spotify', labelKey: 'search.services.spotify', iconKey: 'spotify' },
  { value: 'soundcloud', labelKey: 'search.services.soundcloud', iconKey: 'soundcloud' },
]
const SEARCH_PAGE_SIZE = 10

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

export default function SearchPage({ onOpenDownloader }) {
  const { t } = useI18n()
  const scrollRootRef = React.useRef(null)
  const loadMoreSentinelRef = React.useRef(null)
  const requestTokenRef = React.useRef(0)

  const [query, setQuery] = React.useState('')
  const [selectedService, setSelectedService] = React.useState('youtube')
  const [results, setResults] = React.useState([])
  const [loadingInitial, setLoadingInitial] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState('')
  const [lastQuery, setLastQuery] = React.useState('')
  const [lastService, setLastService] = React.useState('youtube')
  const [nextOffset, setNextOffset] = React.useState(0)
  const [hasMore, setHasMore] = React.useState(false)

  const getServiceLabel = React.useCallback((rawService) => {
    const normalized = normalizeServiceKey(rawService)
    if (!normalized || normalized === GENERIC_SERVICE_KEY) {
      return t('services.generic')
    }
    return getServiceDisplayName(normalized)
  }, [t])

  const openDownloaderForUrl = React.useCallback((rawUrl, preferredService) => {
    const targetUrl = toHttpUrl(rawUrl)
    if (!targetUrl) return false

    const preferred = String(preferredService || '').trim().toLowerCase() === 'youtubemusic'
      ? 'youtube'
      : preferredService

    const detected = normalizeServiceKey(detectService(targetUrl))
    const normalizedPreferred = normalizeServiceKey(preferred)
    const serviceKey = detected || normalizedPreferred || GENERIC_SERVICE_KEY

    onOpenDownloader?.(serviceKey, targetUrl)
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
        const detail = payload?.details || payload?.error || t('search.errorGeneric')
        throw new Error(String(detail))
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

  const handleOpenResult = React.useCallback((entry) => {
    openDownloaderForUrl(entry?.url, entry?.service || lastService)
  }, [lastService, openDownloaderForUrl])

  const showInitialLoading = loadingInitial && results.length === 0
  const showEmptyState = !showInitialLoading && !errorMessage && Boolean(lastQuery) && results.length === 0

  return (
    <Box ref={scrollRootRef} sx={{ height: '100%', overflowY: 'auto' }}>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" component="h1" fontWeight={800} gutterBottom>
            {t('search.title')}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t('search.subtitle')}
          </Typography>
        </Box>

        <Stack spacing={2} sx={{ mb: 3 }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5}>
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
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon size={18} />
                  </InputAdornment>
                ),
              }}
              inputProps={{
                'aria-label': t('search.queryAria'),
              }}
            />

            <Select
              size="small"
              value={selectedService}
              onChange={(event) => setSelectedService(String(event.target.value || 'youtube'))}
              sx={{ minWidth: { xs: '100%', lg: 220 } }}
              inputProps={{ 'aria-label': t('search.serviceAria') }}
              renderValue={(value) => {
                const selected = SEARCH_SERVICE_OPTIONS.find((option) => option.value === value) || SEARCH_SERVICE_OPTIONS[0]
                return (
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                    <ServiceIcon serviceKey={selected.iconKey} size={16} title={t(selected.labelKey)} />
                    <Typography variant="body2" fontWeight={700}>{t(selected.labelKey)}</Typography>
                  </Box>
                )
              }}
            >
              {SEARCH_SERVICE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                    <ServiceIcon serviceKey={option.iconKey} size={18} title={t(option.labelKey)} />
                    <Typography variant="body2">{t(option.labelKey)}</Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>

            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={loadingInitial || !String(query || '').trim()}
              sx={{ minWidth: { xs: '100%', lg: 132 }, fontWeight: 700 }}
            >
              {loadingInitial ? (
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                  <CircularProgress size={16} color="inherit" />
                  <span>{t('search.searching')}</span>
                </Box>
              ) : t('search.searchButton')}
            </Button>
          </Stack>

          <Typography variant="body2" color="text.secondary">
            {t('search.hintDirectUrl')}
          </Typography>
        </Stack>

        {Boolean(lastQuery) && !loadingInitial && !errorMessage && results.length > 0 && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            {t('search.resultsFor', { query: lastQuery })}
          </Typography>
        )}

        {errorMessage && (
          <Typography sx={{ color: 'error.main', mb: 2, fontWeight: 700 }}>
            {errorMessage}
          </Typography>
        )}

        {showInitialLoading && (
          <Stack spacing={1} alignItems="center" justifyContent="center" sx={{ py: 8 }}>
            <CircularProgress size={28} />
            <Typography variant="body2" color="text.secondary">{t('search.searching')}</Typography>
          </Stack>
        )}

        {showEmptyState && (
          <Stack spacing={0.5} sx={{ py: 5 }}>
            <Typography variant="h6" fontWeight={800}>{t('search.noResultsTitle')}</Typography>
            <Typography variant="body2" color="text.secondary">{t('search.noResultsSubtitle')}</Typography>
          </Stack>
        )}

        {results.length > 0 && !loadingInitial && (
          <Grid container spacing={2}>
            {results.map((entry) => {
              const rawService = normalizeServiceKey(entry?.service)
              const serviceKey = rawService || GENERIC_SERVICE_KEY
              const serviceLabel = getServiceLabel(serviceKey)
              const duration = entry?.durationString || formatDuration(entry?.duration)
              const title = String(entry?.title || '').trim() || String(entry?.url || '').trim()
              const uploader = String(entry?.uploader || '').trim()
              const thumbnail = String(entry?.thumbnail || '').trim()
              const itemId = String(entry?.id || entry?.url || `${serviceKey}-${title}`).trim()

              return (
                <Grid item xs={12} sm={6} md={4} lg={3} key={itemId}>
                  <Card elevation={0} sx={{ height: '100%', borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
                    <CardActionArea
                      onClick={() => handleOpenResult(entry)}
                      sx={{ height: '100%', alignItems: 'stretch', cursor: 'pointer' }}
                    >
                      <Box sx={{ position: 'relative', pt: '56.25%', bgcolor: 'action.hover' }}>
                        {thumbnail ? (
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
                            }}
                          >
                            {duration}
                          </Box>
                        ) : null}
                      </Box>

                      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 0.9 }}>
                        <Typography variant="body1" fontWeight={800} noWrap>
                          {title}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {uploader || t('search.unknownUploader')}
                        </Typography>

                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                          <ServiceIcon serviceKey={serviceKey} size={14} title={serviceLabel} />
                          <Typography variant="caption" fontWeight={700}>{serviceLabel}</Typography>
                        </Box>

                        <Box sx={{ mt: 0.5, display: 'inline-flex', alignItems: 'center', gap: 0.6, color: 'primary.main' }}>
                          <Typography variant="caption" fontWeight={800}>{t('search.openResult')}</Typography>
                          <ArrowRight size={14} />
                        </Box>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
              )
            })}
          </Grid>
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
      </Container>
    </Box>
  )
}
