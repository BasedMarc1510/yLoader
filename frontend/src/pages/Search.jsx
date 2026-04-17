import React from 'react'
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CircularProgress,
  Container,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { ArrowRight, Search as SearchIcon, X, ChevronDown } from 'lucide-react'
import ServiceIcon from '../components/ServiceIcon'
import { useI18n } from '../providers/I18nProvider'
import {
  GENERIC_SERVICE_KEY,
  detectService,
  getApiBase,
  getServiceDisplayName,
  normalizeServiceKey,
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
  const [serviceMenuAnchor, setServiceMenuAnchor] = React.useState(null)

  const [hasMeasured, setHasMeasured] = React.useState(false)
  const [enableAnimation, setEnableAnimation] = React.useState(false)
  const [availableHeight, setAvailableHeight] = React.useState(0)

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

  const handleOpenResult = React.useCallback((entry) => {
    openDownloaderForUrl(entry?.url, entry?.service || lastService)
  }, [lastService, openDownloaderForUrl])

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
  const selectedServiceOption = SEARCH_SERVICE_OPTIONS.find((o) => o.value === selectedService) || SEARCH_SERVICE_OPTIONS[0]

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
              setSelectedService(option.value)
              setServiceMenuAnchor(null)
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
        }}
      />
    </>
  )

  return (
    <SimpleBarScrollArea
      sx={{ height: '100%', opacity: hasMeasured ? 1 : 0, transition: 'opacity 0.2s' }}
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
            {searchBarJsx}
          </Box>

          {Boolean(lastQuery) && !loadingInitial && !errorMessage && results.length > 0 && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, px: 0.5 }}>
              {t('search.resultsFor', { query: lastQuery })}
            </Typography>
          )}

          {errorMessage && (
            <Typography sx={{ color: 'error.main', mb: 2, fontWeight: 700, px: 0.5 }}>
              {errorMessage}
            </Typography>
          )}

          {showInitialLoading && (
            <Stack spacing={2} sx={{ mt: 2 }}>
              {[1, 2, 3, 4, 5].map(i => (
                <Card elevation={0} key={i} sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider', display: 'flex', overflow: 'hidden', height: { xs: 100, sm: 120 } }}>
                  <Skeleton variant="rectangular" width={{ xs: 140, sm: 200 }} height="100%" sx={{ flexShrink: 0 }} />
                  <CardContent sx={{ flex: 1, p: { xs: 1.5, sm: 2 }, display: 'flex', flexDirection: 'column', gap: 1, justifyContent: 'center' }}>
                    <Skeleton variant="text" width="70%" height={24} />
                    <Skeleton variant="text" width="40%" height={20} />
                  </CardContent>
                </Card>
              ))}
            </Stack>
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
                const duration = entry?.durationString || formatDuration(entry?.duration)
                const title = String(entry?.title || '').trim() || String(entry?.url || '').trim()
                const uploader = String(entry?.uploader || '').trim()
                const thumbnail = String(entry?.thumbnail || '').trim()
                const itemId = String(entry?.id || entry?.url || `${serviceKey}-${title}`).trim()

                return (
                  <Card elevation={0} key={itemId} sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider', display: 'flex', overflow: 'hidden', height: { xs: 110, sm: 130 } }}>
                    <Box
                      onClick={() => handleOpenResult(entry)}
                      sx={{ display: 'flex', alignItems: 'stretch', width: '100%', justifyContent: 'flex-start', cursor: 'pointer' }}
                    >
                      <Box sx={{ width: { xs: 140, sm: 230 }, minWidth: { xs: 140, sm: 230 }, position: 'relative', bgcolor: 'action.hover', flexShrink: 0 }}>
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

                      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, p: { xs: 1.5, sm: 2 }, overflow: 'hidden', justifyContent: 'center' }}>
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
        </Box>
      </Container>
    </SimpleBarScrollArea>
  )
}
