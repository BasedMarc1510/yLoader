import React from 'react'
import { Box, Stack, Typography, TextField, InputAdornment, IconButton, CircularProgress, Paper, Button } from '@mui/material'
import { ArrowRight, X, AlertTriangle } from 'lucide-react'
import { useTheme } from '@mui/material/styles'
import DownloaderShell from '../components/downloader/DownloaderShell'
import ServiceIcon from '../components/ServiceIcon'
import { detectService, fetchNoembed, toMetaModel, isLikelyValidUrlFor, fetchDuration, fetchFormats } from '../utils/metadata'
import { useI18n } from '../providers/I18nProvider'

const HOME_PREFETCH_CACHE_KEY = 'yloader.home.prefetch.v1'

function extractYtDlpError(msg) {
  if (!msg) return ''
  const lines = String(msg).split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const errorLine = lines.find(l => l.startsWith('ERROR:'))
  const raw = errorLine ? errorLine.replace(/^ERROR:\s*/, '') : (lines[0] || msg)
  // Sanitize Windows-1252 bytes misread as UTF-8 replacement chars (e.g. curly apostrophe → ')
  return raw.replace(/\ufffd/g, '\u2019')
}

export default function Downloader({
  serviceKey = 'generic',
  routeSearch = '',
  routeToken = 0,
  onNavigate,
  onTabStateChange,
}) {
  const { t: i18nT } = useI18n()
  const t = useTheme()
  const mode = t.palette.mode
  const inputRef = React.useRef(null)

  const services = {
    youtube: {
      name: 'YouTube',
      examples: [
        i18nT('placeholders.youtubeUrl'),
        'https://www.youtube.com/watch?v=PsO6ZnUZI0g',
        'https://youtu.be/PsO6ZnUZI0g',
        'https://www.youtube.com/shorts/PsO6ZnUZI0g',
      ],
      icon: 'youtube',
      yColor: '#df2f2f',
    },
    reddit: {
      name: 'Reddit',
      examples: [
        i18nT('placeholders.redditUrl'),
        'https://www.reddit.com/r/aww/comments/abc123/cute_puppy/',
        'https://redd.it/abc123',
        'https://www.reddit.com/comments/abc123',
      ],
      icon: 'reddit',
      yColor: '#ff4500',
    },
    x: {
      name: 'X/Twitter',
      examples: [
        i18nT('placeholders.xUrl'),
        'https://x.com/elonmusk/status/1234567890123456789',
        'https://twitter.com/elonmusk/status/1234567890123456789',
        'https://x.com/i/status/1234567890123456789',
      ],
      icon: 'x',
      // X brand is black/white; adapt for contrast by theme
      yColor: mode === 'dark' ? '#ffffff' : '#000000',
    },
    generic: {
      name: 'Generic',
      examples: [
        i18nT('placeholders.genericUrl'),
        'https://www.example.com/video/12345',
        'https://vimeo.com/123456789',
        'https://www.dailymotion.com/video/x8abc12',
        'https://www.twitch.tv/videos/1234567890',
      ],
      icon: 'generic',
      yColor: '#6366f1',
    },
  }

  const params = React.useMemo(() => new URLSearchParams(routeSearch), [routeSearch])
  const serviceParam = React.useMemo(() => String(params.get('service') || '').trim().toLowerCase(), [params])
  const queryUrl = React.useMemo(() => String(params.get('url') || '').trim(), [params])
  const serviceFromQuery = services[serviceParam] ? serviceParam : null
  const resolvedServiceKey = serviceFromQuery || detectService(queryUrl) || serviceKey || 'generic'
  const cfg = services[resolvedServiceKey] || services.generic
  const [value, setValue] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [meta, setMeta] = React.useState(null) // when set -> show downloader UI
  const [fetchError, setFetchError] = React.useState(null) // { url, message } when set -> show error panel

  // Placeholder cycling (fade + hold)
  const FADE_MS = 400
  const HOLD_MS = 4200
  const [idx, setIdx] = React.useState(0)
  const [fading, setFading] = React.useState(false)
  const intervalRef = React.useRef(null)
  const timeoutRef = React.useRef(null)

  // Reset index when service changes
  React.useEffect(() => {
    setIdx(0)
  }, [resolvedServiceKey])

  // Read ?url= param and prefill
  React.useEffect(() => {
    const urlParam = params.get('url')
    const shouldUsePrefetch = params.get('prefetch') === '1'
    const shouldUsePrefetchError = params.get('prefetchError') === '1'
    if (urlParam && typeof urlParam === 'string') {
      setValue(urlParam)
      const effectiveService = detectService(urlParam) || serviceFromQuery || serviceKey || 'generic'

      if (shouldUsePrefetch || shouldUsePrefetchError) {
        try {
          const raw = sessionStorage.getItem(HOME_PREFETCH_CACHE_KEY)
          if (raw) {
            const parsed = JSON.parse(raw)
            if (parsed?.url === urlParam) {
              if (parsed?.type === 'error' || shouldUsePrefetchError) {
                setMeta(null)
                setFetchError({
                  url: urlParam,
                  message: parsed?.errorMessage || i18nT('downloader.errorDownloadFailed'),
                })
                setLoading(false)
                try {
                  sessionStorage.removeItem(HOME_PREFETCH_CACHE_KEY)
                } catch {
                  // ignore sessionStorage cleanup errors
                }
                return
              }

              const model = toMetaModel(parsed.service || effectiveService, urlParam, parsed.noembed || {})
              model.duration = parsed?.duration?.durationString || null
              model.durationSeconds = parsed?.duration?.duration || null
              model.preloadedFormats = parsed?.formats
              setMeta(model)
              setFetchError(null)
              setLoading(false)
              try {
                sessionStorage.removeItem(HOME_PREFETCH_CACHE_KEY)
              } catch {
                // ignore sessionStorage cleanup errors
              }
              return
            }
          }
        } catch {
          // ignore prefetched payload parse errors
        }
      }

      // If a valid URL is provided via query, auto-fetch meta on mount
      if (isLikelyValidUrlFor(effectiveService, urlParam)) {
        // delay a tick so input shows value before spinner kicks in
        setTimeout(() => handleFetch(urlParam), 0)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSearch, routeToken, serviceFromQuery, serviceKey])

  // Reset to input bar when navigating to the downloader base route (no ?url)
  // This also covers clicking the same downloader again in the sidebar.
  React.useEffect(() => {
    const params = new URLSearchParams(routeSearch)
    const urlParam = params.get('url')
    if (!urlParam) {
      if (meta) setMeta(null)
      if (value) setValue('')
      if (fetchError) setFetchError(null)
    }
    // We intentionally only depend on route token and service key to capture repeated route clicks
    // without causing re-runs while typing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeToken, resolvedServiceKey, routeSearch])

  // Auto-fetch metadata when a valid URL is entered (like on the start page)
  React.useEffect(() => {
    // Don't auto-fetch if already loading, if meta is already set, or if value is empty
    if (loading || meta || fetchError || !value.trim()) return

    // Check if the current value is a valid URL for this service
    const trimmedValue = value.trim()
    const valueService = detectService(trimmedValue) || resolvedServiceKey
    if (!isLikelyValidUrlFor(valueService, trimmedValue)) return

    // Debounce the fetch to avoid excessive calls while typing
    const timer = setTimeout(() => {
      handleFetch(trimmedValue)
    }, 250)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, resolvedServiceKey])

  // Clear input bar after metadata is successfully loaded
  React.useEffect(() => {
    if (meta) {
      setValue('')
    }
  }, [meta])

  // Start/stop cycling depending on whether the input is empty
  React.useEffect(() => {
    // clear timers first
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    const examples = cfg.examples || []
    if (!examples.length) return undefined

    // If user typed, stop cycling
    if (value && value.length > 0) {
      setFading(false)
      return () => { }
    }

    // Cycle while input empty
    intervalRef.current = setInterval(() => {
      setFading(true)
      timeoutRef.current = setTimeout(() => {
        setIdx((i) => (i + 1) % examples.length)
        setFading(false)
      }, FADE_MS)
    }, HOLD_MS + FADE_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [value, resolvedServiceKey])

  const handleFetch = async (urlOverride) => {
    const target = (urlOverride ?? value).trim()
    const targetService = detectService(target) || resolvedServiceKey || 'generic'
    if (!isLikelyValidUrlFor(targetService, target) || loading) return
    setLoading(true)
    setMeta(null)
    setFetchError(null)
    try {
      // Start all three in parallel; formats is required - let it throw on error
      const noembedP = fetchNoembed(target).catch(() => ({}))
      const durationP = fetchDuration(target).catch(() => ({ duration: null, durationString: null }))
      const [noembed, duration, formats] = await Promise.all([noembedP, durationP, fetchFormats(target)])
      const model = toMetaModel(targetService, target, noembed)
      model.duration = duration?.durationString || null
      model.durationSeconds = duration?.duration || null
      model.preloadedFormats = formats
      setMeta(model)
    } catch (e) {
      setFetchError({ url: target, message: e.message || String(e) })
    } finally {
      setLoading(false)
    }
  }

  const basePath = '/'

  const closeInterface = () => {
    setMeta(null)
    setValue('') // Clear input bar when closing
    onNavigate?.(basePath, '')
  }

  const handleFetchError = React.useCallback((url, message) => {
    setMeta(null)
    setFetchError({ url, message })
  }, [])

  const closeError = () => {
    setFetchError(null)
    onNavigate?.(basePath, '')
  }

  const retryError = () => {
    const url = fetchError?.url
    setFetchError(null)
    const retryService = detectService(url) || resolvedServiceKey || 'generic'
    onNavigate?.(basePath, `?service=${encodeURIComponent(retryService)}&url=${encodeURIComponent(url)}`)
  }

  const handleDownloadStateChange = React.useCallback((state) => {
    const fallbackTitle = String(meta?.title || '').trim().slice(0, 180)
    const progressRaw = Number(state?.progress)
    const progress = Number.isFinite(progressRaw)
      ? Math.max(0, Math.min(100, Math.round(progressRaw)))
      : 0

    onTabStateChange?.({
      pageTitle: fallbackTitle,
      download: {
        active: Boolean(state?.active),
        progress,
        stage: String(state?.stage || '').trim(),
        title: String(state?.title || fallbackTitle).trim().slice(0, 180),
      },
    })
  }, [meta?.title, onTabStateChange])

  React.useEffect(() => {
    onTabStateChange?.({
      pageTitle: String(meta?.title || '').trim().slice(0, 180),
    })
  }, [meta?.title, onTabStateChange])

  React.useEffect(() => () => {
    onTabStateChange?.({
      download: {
        active: false,
        progress: 0,
        stage: '',
        title: '',
      },
    })
  }, [onTabStateChange])

  // Ensure the URL input gets focus when navigating here or after closing the interface
  React.useEffect(() => {
    if (!meta && !loading && !fetchError) {
      // slight delay to ensure element is mounted and visible
      const id = setTimeout(() => {
        if (inputRef.current) {
          try {
            inputRef.current.focus()
            // If empty, nothing to select; if prefilled, select for quick replace
            if (inputRef.current.select && (value?.length || 0) > 0) {
              inputRef.current.select()
            }
          } catch { }
        }
      }, 0)
      return () => clearTimeout(id)
    }
  }, [meta, serviceKey, loading, fetchError])

  const hasRouteUrl = Boolean(queryUrl)
  const showLanding = !meta && !fetchError && !hasRouteUrl
  const showRouteLoading = !showLanding && loading && !meta && !fetchError

  return (
    <Box sx={{ position: 'relative', height: '100%', overflowY: showLanding ? 'hidden' : 'auto' }}>
      {/* Centered input bar */}
      <Box sx={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: '100%',
        maxWidth: 780,
        px: 2,
        opacity: showLanding ? 1 : 0,
        pointerEvents: showLanding ? 'auto' : 'none',
        transition: 'opacity 220ms ease',
      }}>
        <TextField
          placeholder={(cfg.examples && cfg.examples[idx]) || ''}
          variant="outlined"
          fullWidth
          size="medium"
          autoFocus
          inputRef={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          onClick={(e) => e.target.select()}
          onMouseUp={(e) => e.preventDefault()}
          onKeyDown={(e) => { if (e.key === 'Enter') handleFetch() }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start" sx={{ mr: 0.25 }}>
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 44,
                    height: 44,
                    ml: 0,
                  }}
                >
                  <ServiceIcon serviceKey={cfg.icon} size={32} title={i18nT('sidebar.iconAlt', { name: cfg.name })} />
                </Box>
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                {loading ? (
                  <IconButton
                    size="small"
                    edge="end"
                    disableRipple
                    disabled
                    aria-label={i18nT('app.loadingAria')}
                    sx={(t) => ({
                      width: 36,
                      height: 36,
                      bgcolor: t.palette.mode === 'dark' ? '#ffffff' : '#000000',
                      color: t.palette.mode === 'dark' ? '#000000' : '#ffffff',
                      borderRadius: '50%',
                      boxShadow: t.palette.mode === 'dark'
                        ? '0 2px 6px rgba(0,0,0,0.4)'
                        : '0 2px 6px rgba(0,0,0,0.25)',
                      opacity: 1,
                      '&.Mui-disabled': {
                        opacity: 1,
                        color: t.palette.mode === 'dark' ? '#000000' : '#ffffff',
                        bgcolor: t.palette.mode === 'dark' ? '#ffffff' : '#000000',
                      },
                    })}
                  >
                    <CircularProgress
                      size={18}
                      thickness={4}
                      sx={(t) => ({
                        color: t.palette.mode === 'dark' ? '#000000' : '#ffffff',
                      })}
                    />
                  </IconButton>
                ) : (
                  <IconButton
                    size="small"
                    aria-label={i18nT('app.loadMetadataAria')}
                    edge="end"
                    onClick={() => handleFetch()}
                    sx={(t) => ({
                      width: 36,
                      height: 36,
                      bgcolor: t.palette.mode === 'dark' ? '#ffffff' : '#000000',
                      color: t.palette.mode === 'dark' ? '#000000' : '#ffffff',
                      borderRadius: '50%',
                      boxShadow: t.palette.mode === 'dark'
                        ? '0 2px 6px rgba(0,0,0,0.4)'
                        : '0 2px 6px rgba(0,0,0,0.25)',
                      '&:hover': {
                        bgcolor: t.palette.mode === 'dark' ? '#f5f5f5' : '#111111',
                      },
                    })}
                  >
                    <ArrowRight size={18} />
                  </IconButton>
                )}
              </InputAdornment>
            ),
          }}
          sx={(t) => ({
            '& .MuiOutlinedInput-root': {
              borderRadius: 9999,
              backgroundColor: t.palette.mode === 'dark' ? '#303030' : '#f9f9f9',
              outline: 'none',

              '&:focus-within': {
                outline: 'none',
                boxShadow: 'none',
              },
              '& fieldset': {
                borderColor: t.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0',
                borderWidth: '1px !important',
              },
              '&:hover fieldset': {
                borderColor: t.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0',
              },
              '&.Mui-focused fieldset': {
                borderColor: t.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0',
                borderWidth: '1px !important',
              },
              '&.Mui-disabled fieldset': {
                borderColor: t.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0',
                borderWidth: '1px !important',
              },
              boxShadow: t.palette.mode === 'dark' ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
            },
            '& .MuiOutlinedInput-input': {
              paddingLeft: '4px',
              paddingRight: '16px',
              color: t.palette.text.primary,
              fontWeight: 700,
              outline: 'none',
              transition: `opacity ${FADE_MS}ms ease`,
              opacity: fading ? 0 : 1,
            },
            '& .MuiOutlinedInput-input::placeholder': {
              color: t.palette.text.secondary,
              fontWeight: 700,
            },
            '& .MuiOutlinedInput-input:focus': {
              outline: 'none',
            },
          })}
          inputProps={{ 'aria-label': i18nT('app.urlInputAria', { service: cfg.name }) }}
          disabled={loading}
        />
      </Box>

      {/* Title and subtitle above the input bar */}
      <Stack spacing={0} sx={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 'calc(50% + 56px + 16px)',
        width: '100%',
        maxWidth: 780,
        px: 2,
        opacity: showLanding ? 1 : 0,
        pointerEvents: showLanding ? 'auto' : 'none',
        transition: 'opacity 220ms ease',
      }}>
        <Typography variant="h1" component="h1" align="center" className="youtube-title" sx={{ fontSize: { xs: '3.5rem', sm: '5rem', md: '6rem' } }}>
          <span style={{ color: cfg.yColor }}>y</span>Loader
        </Typography>
        <Typography variant="h4" align="center" sx={{ color: 'text.secondary', fontWeight: 700, mt: 0.5, fontSize: { xs: '1.25rem', sm: '1.5rem', md: '1.75rem' } }}>
          {i18nT('app.subtitleService', { service: cfg.name })}
        </Typography>
      </Stack>

      {/* Downloader UI (appears after metadata is loaded) */}
      {meta && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            minHeight: '100%',
            boxSizing: 'border-box',
            py: { xs: 2, sm: 3 },
          }}
        >
          <DownloaderShell
            brand={cfg}
            meta={meta}
            onClose={closeInterface}
            serviceKey={serviceKey}
            onFetchError={handleFetchError}
            onDownloadStateChange={handleDownloadStateChange}
          />
        </Box>
      )}

      {showRouteLoading && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            minHeight: '100%',
          }}
        >
          <CircularProgress size={28} />
        </Box>
      )}

      {/* Error panel (appears when format fetch fails) */}
      {fetchError && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            minHeight: '100%',
            boxSizing: 'border-box',
            py: { xs: 2, sm: 3 },
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
            <Paper elevation={0} sx={(t) => ({
              width: '100%',
              maxWidth: 450,
              borderRadius: 2,
              border: 'none',
              overflow: 'hidden',
              bgcolor: t.palette.mode === 'dark' ? '#181818' : '#ffffff',
              boxShadow: t.palette.mode === 'dark' ? '0 8px 16px rgba(0, 0, 0, 0.2)' : '0 4px 24px rgba(0, 0, 0, 0.06)',
            })}>
              {/* Header */}
              <Box sx={(t) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 2,
                py: 1.5,
                borderBottom: `1px solid ${t.palette.mode === 'dark' ? '#2a2a2a' : '#f0f0f0'}`,
              })}>
                <AlertTriangle size={18} style={{ color: '#e8a420', flexShrink: 0 }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1 }}>
                  {i18nT('fetchError.title')}
                </Typography>
                <IconButton
                  size="small"
                  aria-label={i18nT('fetchError.closeAria')}
                  onClick={closeError}
                  sx={{ cursor: 'pointer' }}
                >
                  <X size={16} />
                </IconButton>
              </Box>
              {/* Error details - full-bleed scrollable, scrollbar at panel edge, no padding gaps */}
              <Box
                sx={(t) => ({
                  maxHeight: 160,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  bgcolor: t.palette.mode === 'dark' ? '#111' : '#f5f5f5',
                })}
              >
                <Typography variant="body2" sx={(t) => ({
                  display: 'block',
                  pl: 2,
                  pr: 1.5,
                  py: 1.5,
                  color: t.palette.text.secondary,
                  wordBreak: 'break-word',
                  fontFamily: 'monospace',
                  fontSize: '0.78rem',
                  lineHeight: 1.6,
                })}>
                  {extractYtDlpError(fetchError.message)}
                </Typography>
              </Box>
              {/* Retry button */}
              <Box sx={{ px: 2, pb: 2 }}>
                <Button
                  fullWidth
                  variant="contained"
                  disableElevation
                  onClick={retryError}
                  sx={(t) => ({
                    borderRadius: 9999,
                    fontWeight: 700,
                    textTransform: 'none',
                    bgcolor: t.palette.mode === 'dark' ? '#ffffff' : '#000000',
                    color: t.palette.mode === 'dark' ? '#000000' : '#ffffff',
                    '&:hover': {
                      bgcolor: t.palette.mode === 'dark' ? '#f0f0f0' : '#111111',
                    },
                    cursor: 'pointer',
                  })}
                >
                  {i18nT('fetchError.retry')}
                </Button>
              </Box>
            </Paper>
          </Box>
        </Box>
      )}
    </Box>
  )
}
