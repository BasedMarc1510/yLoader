import React from 'react'
import { Box, Stack, Typography, TextField, InputAdornment, IconButton, CircularProgress } from '@mui/material'
import { ArrowRight } from 'lucide-react'
import { useTheme } from '@mui/material/styles'
import { useLocation, useNavigate } from 'react-router-dom'
import DownloaderShell from '../components/downloader/DownloaderShell'
import { fetchNoembed, toMetaModel, isLikelyValidUrlFor, fetchDuration } from '../utils/metadata'
import { useI18n } from '../providers/I18nProvider'

// serviceKey: 'youtube' | 'reddit' | 'x'
export default function Downloader({ serviceKey = 'youtube' }) {
  const { t: i18nT } = useI18n()
  const t = useTheme()
  const mode = t.palette.mode
  const navigate = useNavigate()
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
      icon: '/dl-icons/youtube-icon.svg',
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
      icon: '/dl-icons/reddit-icon.svg',
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
      icon: '/dl-icons/x-icon.svg',
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
      icon: '/dl-icons/generic-icon.svg',
      yColor: '#6366f1',
    },
  }

  const cfg = services[serviceKey] || services.youtube
  const [value, setValue] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [meta, setMeta] = React.useState(null) // when set -> show downloader UI

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
  }, [serviceKey])

  // Read ?url= param and prefill
  const location = useLocation()
  React.useEffect(() => {
    const params = new URLSearchParams(location.search)
    const urlParam = params.get('url')
    if (urlParam && typeof urlParam === 'string') {
      setValue(urlParam)
      // If a valid URL is provided via query, auto-fetch meta on mount
      if (isLikelyValidUrlFor(serviceKey, urlParam)) {
        // delay a tick so input shows value before spinner kicks in
        setTimeout(() => handleFetch(urlParam), 0)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, serviceKey])

  // Reset to input bar when navigating to the downloader base route (no ?url)
  // This also covers clicking the same downloader again in the sidebar.
  React.useEffect(() => {
    const params = new URLSearchParams(location.search)
    const urlParam = params.get('url')
    if (!urlParam) {
      if (meta) setMeta(null)
      if (value) setValue('')
    }
    // We intentionally only depend on location.key and serviceKey to capture route clicks
    // without causing re-runs while typing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, serviceKey])

  // Auto-fetch metadata when a valid URL is entered (like on the start page)
  React.useEffect(() => {
    // Don't auto-fetch if already loading, if meta is already set, or if value is empty
    if (loading || meta || !value.trim()) return

    // Check if the current value is a valid URL for this service
    const trimmedValue = value.trim()
    if (!isLikelyValidUrlFor(serviceKey, trimmedValue)) return

    // Debounce the fetch to avoid excessive calls while typing
    const timer = setTimeout(() => {
      handleFetch(trimmedValue)
    }, 250)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, serviceKey])

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
  }, [value, serviceKey])

  const handleFetch = async (urlOverride) => {
    const target = (urlOverride ?? value).trim()
    if (!isLikelyValidUrlFor(serviceKey, target) || loading) return
    setLoading(true)
    setMeta(null)
    try {
      // Start both in parallel to minimize wait time
      const noembedP = fetchNoembed(target).catch(() => ({}))
      const durationP = fetchDuration(target).catch(() => ({ duration: null, durationString: null }))
      const [noembed, duration] = await Promise.all([noembedP, durationP])
      const model = toMetaModel(serviceKey, target, noembed)
      model.duration = duration?.durationString || null
      model.durationSeconds = duration?.duration || null
      setMeta(model)
    } catch (e) {
      const model = toMetaModel(serviceKey, target, {})
      setMeta(model)
    } finally {
      setLoading(false)
    }
  }

  const closeInterface = () => {
    setMeta(null)
    setValue('') // Clear input bar when closing
    // remove query string and go back to service root
    const basePath = serviceKey === 'youtube' ? '/youtube-downloader' : serviceKey === 'reddit' ? '/reddit-downloader' : serviceKey === 'x' ? '/x-downloader' : '/generic-downloader'
    navigate(basePath)
  }

  // Ensure the URL input gets focus when navigating here or after closing the interface
  React.useEffect(() => {
    if (!meta && !loading) {
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
  }, [meta, serviceKey, loading])

  return (
    <Box sx={{ position: 'relative', height: '100%' }}>
      {/* Centered input bar */}
      <Box sx={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: '100%',
        maxWidth: 780,
        px: 2,
        opacity: meta ? 0 : 1,
        pointerEvents: meta ? 'none' : 'auto',
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
                  <Box component="img" src={cfg.icon} alt={i18nT('sidebar.iconAlt', { name: cfg.name })} sx={{ width: 32, height: 32, display: 'block' }} />
                </Box>
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                {loading ? (
                  <Box
                    aria-label={i18nT('app.loadingAria')}
                    sx={(t) => ({
                      width: 36,
                      height: 36,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    })}
                  >
                    <CircularProgress
                      size={36}
                      thickness={3.5}
                      sx={(t) => ({
                        color: t.palette.mode === 'dark' ? t.palette.grey[400] : t.palette.grey[600],
                      })}
                    />
                  </Box>
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
        opacity: meta ? 0 : 1,
        pointerEvents: meta ? 'none' : 'auto',
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
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          transform: meta ? 'translateY(-50%)' : 'translateY(-42%)',
          opacity: meta ? 1 : 0,
          pointerEvents: meta ? 'auto' : 'none',
          transition: 'opacity 220ms ease, transform 220ms ease',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {meta && (
          <DownloaderShell
            brand={cfg}
            meta={meta}
            onClose={closeInterface}
            serviceKey={serviceKey}
          />
        )}
      </Box>
    </Box>
  )
}
