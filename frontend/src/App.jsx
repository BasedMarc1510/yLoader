import React from 'react'
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom'
import { Box, Stack, Typography, TextField, Paper, InputAdornment, IconButton } from '@mui/material'
import { ArrowRight } from 'lucide-react'
import AppLayout from './layout/AppLayout'
import Downloader from './pages/Downloader'
import { useI18n } from './providers/I18nProvider'

function HomePage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const platforms = [
    { key: 'youtube', placeholder: t('placeholders.youtubeUrl'), icon: '/dl-icons/youtube-icon.svg' },
    { key: 'x', placeholder: t('placeholders.xUrl'), icon: '/dl-icons/x-icon.svg' },
    { key: 'reddit', placeholder: t('placeholders.redditUrl'), icon: '/dl-icons/reddit-icon.svg' },
    { key: 'generic', placeholder: t('placeholders.genericUrl'), icon: '/dl-icons/generic-icon.svg' },
  ]

  // Animation timing (slower than before)
  const FADE_MS = 400
  const HOLD_MS = 4200

  const [idx, setIdx] = React.useState(0)
  const [fading, setFading] = React.useState(false)
  const [value, setValue] = React.useState('')

  const intervalRef = React.useRef(null)
  const timeoutRef = React.useRef(null)

  // Start/stop cycling depending on whether the input is empty
  React.useEffect(() => {
    // clear any previous timers
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    // If user typed something, stop cycling and ensure no fading
    if (value && value.length > 0) {
      setFading(false)
      return () => { }
    }

    // Resume cycling when empty
    intervalRef.current = setInterval(() => {
      setFading(true)
      timeoutRef.current = setTimeout(() => {
        setIdx((i) => (i + 1) % platforms.length)
        setFading(false)
      }, FADE_MS)
    }, HOLD_MS + FADE_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [value])

  // --- URL detection & auto-redirect ---
  const detectServiceFromUrl = React.useCallback((raw) => {
    if (!raw) return null
    const url = raw.trim()
    // Basic quick checks by domain
    const lower = url.toLowerCase()
    const isYouTube = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(lower)
    const isReddit = /^(https?:\/\/)?(www\.)?(reddit\.com|redd\.it)\//i.test(lower)
    const isX = /^(https?:\/\/)?(www\.)?(x\.com|twitter\.com)\//i.test(lower)

    if (isYouTube) {
      // Ensure likely video/shorts/watch
      const ytOk = /(watch\?v=|shorts\/|youtu\.be\/|live\/)/i.test(lower)
      return ytOk ? 'youtube' : 'youtube'
    }
    if (isReddit) return 'reddit'
    if (isX) {
      const xOk = /(\/status\/\d+|x\.com\/i\/status\/\d+)/i.test(lower)
      return xOk ? 'x' : 'x'
    }
    // Generic: any http(s) URL that doesn't match known services
    if (/^https?:\/\//i.test(lower)) return 'generic'
    return null
  }, [])

  const goToDownloader = React.useCallback((svc, url) => {
    if (!svc) return
    const pathMap = { youtube: '/youtube-downloader', reddit: '/reddit-downloader', x: '/x-downloader', generic: '/generic-downloader' }
    const dlPath = pathMap[svc] || '/generic-downloader'
    navigate(`${dlPath}?url=${encodeURIComponent(url.trim())}`)
  }, [navigate])

  // Debounced navigation when typing a valid URL
  React.useEffect(() => {
    const svc = detectServiceFromUrl(value)
    if (!svc) return
    const timer = setTimeout(() => {
      goToDownloader(svc, value)
    }, 250)
    return () => clearTimeout(timer)
  }, [value, detectServiceFromUrl, goToDownloader])

  // Handle Enter key or button click as fallback
  const handleSubmit = React.useCallback(() => {
    const svc = detectServiceFromUrl(value)
    if (svc) goToDownloader(svc, value)
  }, [value, detectServiceFromUrl, goToDownloader])

  return (
    <Box sx={{ position: 'relative', height: '100%' }}>
      {/* Centered input bar (defines the vertical middle) */}
      <Box sx={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '100%', maxWidth: 780, px: 2 }}>
        <TextField
          placeholder={platforms[idx].placeholder}
          variant="outlined"
          fullWidth
          size="medium"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
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
                    opacity: fading ? 0 : 1,
                    transition: `opacity ${FADE_MS}ms ease`,
                  }}
                >
                  <Box component="img" src={platforms[idx].icon} alt={t('app.platformIconAlt')} sx={{ width: 32, height: 32, display: 'block' }} />
                </Box>
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  aria-label={t('app.startDownloadAria')}
                  edge="end"
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
              </InputAdornment>
            ),
          }}
          onPaste={(e) => {
            // If the pasted text is a valid URL, navigate immediately
            const pasted = e.clipboardData.getData('text')
            const svc = detectServiceFromUrl(pasted)
            if (svc) {
              // Set value for visual feedback, then navigate
              setValue(pasted)
              // slight delay to allow state to update UI
              setTimeout(() => goToDownloader(svc, pasted), 0)
            }
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
          inputProps={{ 'aria-label': t('app.urlInputAria', { service: 'YouTube' }) }}
        />
      </Box>
      {/* Title and subtitle rendered just above the input bar */}
      <Stack spacing={0} sx={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(50% + 56px + 16px)', width: '100%', maxWidth: 780, px: 2 }}>
        <Typography variant="h1" component="h1" align="center" className="youtube-title" sx={{ fontSize: { xs: '3.5rem', sm: '5rem', md: '6rem' } }}>
          <span style={{ color: '#df2f2f' }}>y</span>Loader
        </Typography>
        <Typography variant="h4" align="center" sx={{ color: 'text.secondary', fontWeight: 700, mt: 0.5, fontSize: { xs: '1.25rem', sm: '1.5rem', md: '1.75rem' } }}>
          {t('app.subtitle')}
        </Typography>
      </Stack>
    </Box>
  )
}

import DownloadsPage from './pages/Downloads'

export default function App() {
  return (
    <Router>
      <AppLayout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/downloads" element={<DownloadsPage />} />
          <Route path="/youtube-downloader" element={<Downloader serviceKey="youtube" />} />
          <Route path="/reddit-downloader" element={<Downloader serviceKey="reddit" />} />
          <Route path="/x-downloader" element={<Downloader serviceKey="x" />} />
          <Route path="/generic-downloader" element={<Downloader serviceKey="generic" />} />
        </Routes>
      </AppLayout>
    </Router>
  )
}
