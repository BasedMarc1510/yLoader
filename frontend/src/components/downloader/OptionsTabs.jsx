import React from 'react'
import { Box, Button, Collapse, MenuItem, Select, Typography, useTheme, CircularProgress } from '@mui/material'
import { Image as ImageIcon, Music2, Video, Tag, Scissors, TrendingUp, Download, Info, X } from 'lucide-react'
import MetadataInput from './MetadataInput'
import CustomSelect from './CustomSelect'
import CombinedFilenameInput from './CombinedFilenameInput'
import AudioCutSection from './AudioCutSection'
import { useNotification } from '../../providers/NotificationProvider'
import { parseVideoTitle } from '../../utils/metadataParser'
import { getApiBase, normalizeUrlForNoembed, detectService, extractYouTubeId, youtubeThumb, fetchNoembed } from '../../utils/metadata'
import { useI18n } from '../../providers/I18nProvider'

// Helper function to darken color for border
const adjustColorBrightness = (hex, percent) => {
  let r = parseInt(hex.substring(1, 3), 16)
  let g = parseInt(hex.substring(3, 5), 16)
  let b = parseInt(hex.substring(5, 7), 16)
  r = Math.max(0, Math.min(255, r + percent))
  g = Math.max(0, Math.min(255, g + percent))
  b = Math.max(0, Math.min(255, b + percent))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

// Custom ChevronIcon component
const ChevronIcon = ({ isOpen = false, theme }) => (
  <Box
    sx={{
      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
      transition: 'transform 250ms cubic-bezier(0.4, 0, 0.2, 1)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '24px',
      height: '24px',
    }}
  >
    <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
      <path
        d="m98.9 184.7 1.8 2.1 136 156.5c4.6 5.3 11.5 8.6 19.2 8.6 7.7 0 14.6-3.4 19.2-8.6L411 187.1l2.3-2.6c1.7-2.5 2.7-5.5 2.7-8.7 0-8.7-7.4-15.8-16.6-15.8H112.6c-9.2 0-16.6 7.1-16.6 15.8 0 3.3 1.1 6.4 2.9 8.9z"
        fill={theme.palette.mode === 'dark' ? '#ffffff' : '#000000'}
      />
    </svg>
  </Box>
)

export default function OptionsTabs({ brandColor = '#df2f2f', videoTitle = '', videoAuthor = '', videoUrl = '', durationSeconds = null, serviceKey = null, initialFormats = null, onFetchError = null }) {
  const theme = useTheme()
  const { t: i18nT } = useI18n()
  const { showNotification } = useNotification()
  const [tab, setTab] = React.useState('audio')

  const [activeSection, setActiveSection] = React.useState(null)

  const toggleSection = (section) => {
    setActiveSection(prev => prev === section ? null : section)
  }

  // Metadata input states
  const [titleValue, setTitleValue] = React.useState('')
  const [artistValue, setArtistValue] = React.useState('')
  const [albumValue, setAlbumValue] = React.useState('')
  const [videoContainer, setVideoContainer] = React.useState('mp4')
  const [audioContainer, setAudioContainer] = React.useState('mp3') // New state for audio container // New state for video container

  // Filename input state (shared across all tabs)
  // Filename input state (shared across all tabs)
  const [filenameValue, setFilenameValue] = React.useState('')

  // Format states
  const [audioFormats, setAudioFormats] = React.useState([])
  const [videoFormats, setVideoFormats] = React.useState([])
  const [selectedAudioFormat, setSelectedAudioFormat] = React.useState('best')
  const [selectedVideoFormat, setSelectedVideoFormat] = React.useState('best')
  const [loadingFormats, setLoadingFormats] = React.useState(false)

  // Thumbnail states
  const [thumbOptions, setThumbOptions] = React.useState([]) // [{ value, label, description, url, width, height }]
  const [selectedThumbValue, setSelectedThumbValue] = React.useState('')
  const [selectedThumbFormat, setSelectedThumbFormat] = React.useState('jpg')
  const [loadingThumbs, setLoadingThumbs] = React.useState(false)

  // Audio cut states
  const [audioCutsData, setAudioCutsData] = React.useState(null)
  const [videoCutsData, setVideoCutsData] = React.useState(null)

  // Album cover states (audio)
  const [coverEmbedEnabled, setCoverEmbedEnabled] = React.useState(true)
  const [coverSource, setCoverSource] = React.useState('video') // video | upload
  const [coverUpload, setCoverUpload] = React.useState(null) // { name, type, size, dataUrl }
  const [coverUploadError, setCoverUploadError] = React.useState('')

  // Download states
  const [downloading, setDownloading] = React.useState(false)
  const [downloadProgress, setDownloadProgress] = React.useState(0)
  const [downloadStage, setDownloadStage] = React.useState('')
  const [downloadError, setDownloadError] = React.useState(null)

  // Helpers: format sizes and build compact, deduped option lists
  const formatMB = (bytes) => {
    if (!bytes || typeof bytes !== 'number' || !isFinite(bytes) || bytes <= 0) return ''
    const mb = bytes / 1024 / 1024
    if (mb >= 100) return `${Math.round(mb)} MB`
    return `${mb.toFixed(1)} MB`
  }

  // Build unique video options by resolution height (e.g., 2160p, 1080p)
  const buildVideoOptions = React.useCallback((formats = []) => {
    const byHeight = new Map()
    for (const f of formats || []) {
      let height = f?.height
      if (!height) {
        // Try to derive from resolution string
        const res = String(f?.resolution || '').toLowerCase()
        const m1 = res.match(/(\d{3,4})p/) // e.g., 1080p
        const m2 = res.match(/x(\d{3,4})$/) // e.g., 1920x1080
        height = m1 ? parseInt(m1[1], 10) : (m2 ? parseInt(m2[1], 10) : undefined)
      }
      if (!height) continue

      const key = `${height}p`
      const existing = byHeight.get(key)
      // Prefer an entry with filesize; among those, pick the largest (assume highest quality)
      if (!existing) {
        byHeight.set(key, f)
      } else {
        const a = existing?.filesize || 0
        const b = f?.filesize || 0
        if (b && (!a || b > a)) byHeight.set(key, f)
      }
    }
    // Sort desc by height numeric
    const entries = Array.from(byHeight.entries()).sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
    return entries.map(([key, f]) => ({
      value: f.formatId,
      label: key, // e.g., 1080p
      description: undefined, // Simpler design requested
    }))
  }, [])

  // Build unique audio options by bitrate (rounded kbps)
  const buildAudioOptions = React.useCallback((formats = []) => {
    const byAbr = new Map()
    for (const f of formats || []) {
      const abr = Math.round(f?.abr || 0)
      if (!abr) continue
      const key = `${abr} kbps`
      const existing = byAbr.get(key)
      if (!existing) {
        byAbr.set(key, f)
      } else {
        const a = existing?.filesize || 0
        const b = f?.filesize || 0
        if (b && (!a || b < a)) byAbr.set(key, f) // pick smaller filesize for same bitrate
      }
    }
    // Sort desc by bitrate numeric
    const entries = Array.from(byAbr.entries()).sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
    return entries.map(([key, f]) => ({
      value: f.formatId,
      label: key, // e.g., 320 kbps
      description: undefined,
    }))
  }, [])

  // Auto-populate metadata fields when videoTitle changes
  React.useEffect(() => {
    if (videoTitle) {
      const parsed = parseVideoTitle(videoTitle)
      setTitleValue(parsed.title || videoTitle)
      setArtistValue(parsed.artist || videoAuthor || '')
      setAlbumValue(parsed.album || '')
      setFilenameValue(videoTitle) // Set default filename
    }
  }, [videoTitle, videoAuthor])

  // Shared helper: apply backend thumbnail list into dropdown options
  const applyBackendThumbnails = React.useCallback((thumbnails) => {
    const valid = (thumbnails || []).filter(t => t.width && t.height && t.width > 0 && t.height > 0)
    valid.sort((a, b) => (b.height || 0) - (a.height || 0))
    const seen = new Set()
    const opts = []
    const friendlyMap = {
      'maxresdefault': i18nT('downloader.maxResolution'),
      'sddefault': i18nT('downloader.sd'),
      'hqdefault': i18nT('downloader.hq'),
      'mqdefault': i18nT('downloader.mq'),
      'default': i18nT('downloader.default'),
    }
    for (const t of valid) {
      const dimLabel = `${t.width}x${t.height}`
      if (seen.has(dimLabel)) continue
      seen.add(dimLabel)
      const label = (t.id && friendlyMap[t.id]) ? `${friendlyMap[t.id]} (${dimLabel})` : dimLabel
      opts.push({ value: t.id || `thumb-${opts.length}`, label, description: undefined, url: t.url, width: t.width, height: t.height })
    }
    if (opts.length > 0) {
      setThumbOptions(opts)
      setSelectedThumbValue(opts[0]?.value || '')
    } else {
      setThumbOptions([])
      setSelectedThumbValue('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18nT])

  // Load available formats when videoUrl changes
  React.useEffect(() => {
    const load = async () => {
      if (!videoUrl) {
        setAudioFormats([])
        setVideoFormats([])
        setSelectedAudioFormat('best')
        setSelectedVideoFormat('best')
        // Clear thumbnails too
        setThumbOptions([])
        setSelectedThumbValue('')
        return
      }
      // Use pre-loaded formats if provided (avoids a second round-trip and prevents UI flash)
      if (initialFormats != null) {
        setAudioFormats(initialFormats.audioFormats || [])
        setVideoFormats(initialFormats.videoFormats || [])
        const isYouTube = !!extractYouTubeId(videoUrl)
        if (!isYouTube && Array.isArray(initialFormats.thumbnails) && initialFormats.thumbnails.length) {
          applyBackendThumbnails(initialFormats.thumbnails)
        } else {
          setThumbOptions([])
          setSelectedThumbValue('')
        }
        return
      }
      try {
        const API_BASE = getApiBase()
        const normalized = normalizeUrlForNoembed(videoUrl)
        console.log('Loading formats for URL:', normalized)
        setLoadingFormats(true)
        const res = await fetch(`${API_BASE}/api/meta/formats?url=${encodeURIComponent(normalized)}`)
        if (!res.ok) {
          let errMsg = `HTTP ${res.status}`
          try {
            const body = await res.json()
            errMsg = body?.details || body?.error || errMsg
          } catch { }
          throw new Error(errMsg)
        }
        const data = await res.json()
        console.log('Formats received:', data)
        setAudioFormats(data.audioFormats || [])
        setVideoFormats(data.videoFormats || [])

        // If backend supplied thumbnails, prefer those over client probing.
        // Exception: For YouTube, use client-side probing for accurate dimensions.
        const isYouTube = !!extractYouTubeId(videoUrl)
        if (!isYouTube && Array.isArray(data.thumbnails) && data.thumbnails.length) {
          applyBackendThumbnails(data.thumbnails)
        } else {
          // Ensure cleared if none
          setThumbOptions([])
          setSelectedThumbValue('')
        }
      } catch (err) {
        console.error('Failed to load formats:', err)
        setAudioFormats([])
        setVideoFormats([])
        setThumbOptions([])
        setSelectedThumbValue('')
        onFetchError?.(videoUrl, err.message || String(err))
      } finally {
        setLoadingFormats(false)
      }
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl, initialFormats])

  // Load available thumbnails when videoUrl changes
  React.useEffect(() => {
    let cancelled = false
    const loadThumbs = async () => {
      // If thumbnails already loaded from backend formats endpoint, skip probing
      if (thumbOptions.length > 0) return
      setLoadingThumbs(true)
      try {
        // Be tolerant: first try to parse a YouTube id directly (works with m.youtube.com, music.youtube.com, etc.)
        const ytId = extractYouTubeId(videoUrl)
        const service = ytId ? 'youtube' : detectService(videoUrl)
        const options = []
        if (!videoUrl || !service) {
          setThumbOptions([])
          setSelectedThumbValue('')
          return
        }

        if (service === 'youtube') {
          const id = ytId || extractYouTubeId(videoUrl)
          if (!id) {
            setThumbOptions([])
            setSelectedThumbValue('')
            return
          }
          const candidates = [
            { key: 'maxresdefault', label: i18nT('downloader.maxResolution'), width: 1280, height: 720 },
            { key: 'sddefault', label: i18nT('downloader.sd'), width: 640, height: 480 },
            { key: 'hqdefault', label: i18nT('downloader.hq'), width: 480, height: 360 },
            { key: 'mqdefault', label: i18nT('downloader.mq'), width: 320, height: 180 },
            { key: 'default', label: i18nT('downloader.default'), width: 120, height: 90 },
          ]

          // Pre-populate options immediately so the dropdown isn't empty
          const preOptions = candidates.map(c => ({
            value: c.key,
            label: `${c.label} (${c.width}x${c.height})`,
            description: undefined,
            url: youtubeThumb(id, c.key),
            width: c.width,
            height: c.height,
          }))
          if (!cancelled) {
            setThumbOptions(preOptions)
            setSelectedThumbValue(preOptions[0]?.value || '')
          }

          // In the background, probe actual availability and refine the list
          try {
            const probes = await Promise.all(
              candidates.map((c) => new Promise((resolve) => {
                const url = youtubeThumb(id, c.key)
                const img = new Image()
                img.onload = () => resolve({ ok: true, url, key: c.key, label: c.label, width: img.naturalWidth, height: img.naturalHeight })
                img.onerror = () => resolve({ ok: false })
                img.src = `${url}?v=${Date.now()}`
              }))
            )
            const available = probes
              .filter(p => p.ok && p.width && p.height)
              .sort((a, b) => (b.height || 0) - (a.height || 0))
              .map((p) => ({
                value: p.key,
                label: `${p.label} (${p.width}x${p.height})`,
                description: undefined,
                url: p.url,
                width: p.width,
                height: p.height,
              }))
            if (!cancelled && available.length) {
              setThumbOptions(available)
              setSelectedThumbValue(available[0]?.value || '')
            }
          } catch (e) {
            // If probing fails, keep preOptions
            console.warn('Thumbnail probe failed', e)
          }
        } else {
          // Fallback to noembed thumbnail if available
          try {
            const ne = await fetchNoembed(normalizeUrlForNoembed(videoUrl))
            const url = ne?.thumbnail_url || ''
            if (url) {
              // Try to get dimensions
              const dim = await new Promise((resolve) => {
                const img = new Image()
                img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
                img.onerror = () => resolve({ w: 0, h: 0 })
                img.src = `${url}`
              })
              options.push({
                value: 'original',
                label: dim.w && dim.h ? `${i18nT('downloader.originalThumb')} (${dim.w}x${dim.h})` : i18nT('downloader.originalThumb'),
                description: undefined,
                url,
                width: dim.w,
                height: dim.h,
              })
            }
          } catch (e) {
            console.warn('noembed failed for thumbnail', e)
          }
        }

        if (!cancelled && thumbOptions.length === 0) { // only set if still empty
          setThumbOptions(options)
          setSelectedThumbValue(options[0]?.value || '')
        }
      } finally {
        if (!cancelled) setLoadingThumbs(false)
      }
    }

    loadThumbs()
    return () => { cancelled = true }
  }, [videoUrl, thumbOptions.length])

  const handleTabChange = (newTab) => {
    setTab(newTab)
    setActiveSection(null)
  }

  const handleCoverFileChange = (event) => {
    const file = event?.target?.files?.[0]
    if (!file) return

    if (!file.type || !file.type.startsWith('image/')) {
      setCoverUpload(null)
      setCoverUploadError(i18nT('downloader.errorSelectImageFile'))
      if (event?.target) event.target.value = ''
      return
    }

    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      setCoverUpload(null)
      setCoverUploadError(i18nT('downloader.errorImageTooLarge'))
      if (event?.target) event.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      setCoverUpload({ name: file.name, type: file.type, size: file.size, dataUrl })
      setCoverUploadError('')
      if (event?.target) event.target.value = ''
    }
    reader.onerror = () => {
      setCoverUpload(null)
      setCoverUploadError(i18nT('downloader.errorImageRead'))
      if (event?.target) event.target.value = ''
    }
    reader.readAsDataURL(file)
  }

  // Download handler with SSE progress tracking
  const handleDownload = async (type) => {
    if (downloading) return

    if (type === 'audio' && coverEmbedEnabled && coverSource === 'upload' && !coverUpload?.dataUrl) {
      setDownloadError(i18nT('downloader.errorSelectCover'))
      return
    }

    setDownloading(true)
    setDownloadProgress(0)
    setDownloadStage('starting')
    setDownloadError(null)

    let completed = false
    let finalized = false

    try {
      const API_BASE = getApiBase()
      const normalized = normalizeUrlForNoembed(videoUrl)
      const selectedCuts = type === 'audio' ? audioCutsData : videoCutsData
      const normalizedSegments = Array.isArray(selectedCuts?.segments)
        ? selectedCuts.segments
            .filter(s => typeof s?.start === 'number' && typeof s?.end === 'number' && s.end > s.start)
            .map(s => ({ start: Math.max(0, s.start), end: Math.max(0, s.end) }))
        : []
      const normalizedRemovals = Array.isArray(selectedCuts?.removals)
        ? selectedCuts.removals
            .filter(s => typeof s?.start === 'number' && typeof s?.end === 'number' && s.end > s.start)
            .map(s => ({ start: Math.max(0, s.start), end: Math.max(0, s.end) }))
        : []

      const cutsPayload = selectedCuts?.enabled ? {
        enabled: true,
        mode: selectedCuts?.mode === 'keep' ? 'keep' : 'remove',
        trimStart: selectedCuts?.trimStart ?? 0,
        trimEnd: selectedCuts?.trimEnd ?? (durationSeconds || 0),
        segments: normalizedSegments,
        removals: normalizedRemovals,
      } : undefined

      const payload = {
        url: normalized,
        service: serviceKey || detectService(normalized) || 'other',
        type,
        duration: durationSeconds,
        videoTitle: filenameValue || titleValue || videoTitle,
        format: type === 'video' ? videoContainer : (type === 'audio' ? audioContainer : undefined),
        audioFormat: type === 'audio' ? selectedAudioFormat : undefined,
        videoFormat: type === 'video' ? selectedVideoFormat : undefined,
        metadata: type === 'audio' ? {
          title: titleValue || videoTitle,
          artist: artistValue || videoAuthor,
          album: albumValue,
        } : undefined,
        cover: type === 'audio' ? {
          enabled: coverEmbedEnabled,
          source: coverSource,
          upload: coverEmbedEnabled && coverSource === 'upload' && coverUpload?.dataUrl ? {
            name: coverUpload.name || 'cover',
            type: coverUpload.type || '',
            dataUrl: coverUpload.dataUrl,
          } : undefined,
        } : undefined,
        cuts: cutsPayload,
        // Keep legacy field for older backend compatibility.
        audioCuts: type === 'audio' && cutsPayload && cutsPayload.mode !== 'keep' ? {
          enabled: true,
          trimStart: cutsPayload.trimStart,
          trimEnd: cutsPayload.trimEnd,
          removals: cutsPayload.removals,
        } : undefined,
      }

      const response = await fetch(`${API_BASE}/api/download/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let message = `HTTP ${response.status}`
        try {
          const errBody = await response.json()
          message = errBody?.error || errBody?.message || message
        } catch {
          // keep fallback
        }
        throw new Error(message)
      }

      if (!response.body) {
        throw new Error(i18nT('downloader.errorDownloadFailed'))
      }

      const resolveErrorMessage = (value) => {
        try {
          const parsed = JSON.parse(value)
          return parsed?.error || parsed?.message || value
        } catch {
          return value
        }
      }

      const processEvent = (eventName, rawData) => {
        const dataStr = String(rawData || '')

        if (eventName === 'error') {
          const msg = resolveErrorMessage(dataStr) || i18nT('downloader.errorDownloadFailed')
          setDownloadError(msg)
          showNotification(msg, 'error')
          return
        }

        if (eventName === 'progress') {
          try {
            const data = JSON.parse(dataStr)
            if (data.percent !== undefined) {
              setDownloadProgress(data.percent)
              setDownloadStage(data.stage || 'downloading')
            }
          } catch {
            // ignore malformed progress payload
          }
          return
        }

        if (eventName === 'complete') {
          try {
            const data = JSON.parse(dataStr)
            if (data.filename && data.url) {
              completed = true
              setDownloadProgress(100)
              setDownloadStage('complete')

              const a = document.createElement('a')
              a.href = `${API_BASE}${data.url}`
              a.download = data.filename
              document.body.appendChild(a)
              a.click()
              a.remove()

              // Keep success state briefly visible, then reset controls.
              setTimeout(() => {
                setDownloading(false)
                setDownloadProgress(0)
                setDownloadStage('')
              }, 1200)
            }
          } catch {
            // ignore malformed completion payload
          }
          return
        }

        if (eventName === 'end') {
          finalized = true
          if (dataStr.trim() === 'failed' && !completed) {
            const msg = i18nT('downloader.errorDownloadFailed')
            setDownloadError(msg)
            showNotification(msg, 'error')
          }
        }
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
            processEvent(eventName, dataLines.join('\n'))
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
          processEvent(eventName, dataLines.join('\n'))
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

      if (!completed && !finalized) {
        throw new Error(i18nT('downloader.errorDownloadFailed'))
      }
    } catch (err) {
      console.error('Download error:', err)
      setDownloadError(err.message || i18nT('downloader.errorDownloadFailed'))
      showNotification(err.message || i18nT('downloader.errorDownloadFailed'), 'error')
    } finally {
      if (!completed) {
        setDownloading(false)
        setDownloadProgress(0)
        setDownloadStage('')
      }
    }
  }

  // Render audio tab content
  const renderAudioTabContent = () => {
    const isDark = theme.palette.mode === 'dark'
    const collapseBg = isDark ? '#272727' : '#f9f9f9'
    const selectBg = isDark ? '#1a1a1a' : '#ffffff'
    const textColor = isDark ? '#ffffff' : theme.palette.text.primary

    const getButtonBg = (isOpen) => isDark ? (isOpen ? '#272727' : '#1a1a1a') : (isOpen ? '#e8e8e8' : '#ffffff')
    const getButtonHover = (isOpen) => isDark ? '#272727' : '#f0f0f0'

    return (
      <Box>

        {/* Metadata Dropdown */}
        <Button
          fullWidth
          disabled={downloading}
          onClick={() => toggleSection('metadata')}
          endIcon={<ChevronIcon isOpen={activeSection === 'metadata'} theme={theme} />}
          sx={{
            bgcolor: getButtonBg(activeSection === 'metadata'),
            color: textColor,
            borderRadius: activeSection === 'metadata' ? '12px 12px 0 0' : '12px',
            padding: '8px 16px',
            textTransform: 'none',
            justifyContent: 'space-between',
            minHeight: 'auto',
            mb: activeSection === 'metadata' ? 0 : 0.75,
            opacity: downloading ? 0.6 : 1,
            '&:hover': {
              bgcolor: getButtonHover(activeSection === 'metadata'),
            },
            '& .MuiTypography-root': {
              fontWeight: 600,
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Info size={18} />
            <Typography>{i18nT('downloader.metadata')}</Typography>
          </Box>
        </Button>
        <Collapse in={activeSection === 'metadata'} timeout={250}>
          <Box
            sx={{
              padding: 1.5,
              mb: 1.25,
              bgcolor: collapseBg,
              borderRadius: '0 0 12px 12px',
            }}
          >
            <MetadataInput
              id="title_input"
              label={i18nT('downloader.titleLabel')}
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              maxLength={120}
              isDark={isDark}
              disabled={downloading}
            />
            <MetadataInput
              id="artist_input"
              label={i18nT('downloader.artistLabel')}
              value={artistValue}
              onChange={(e) => setArtistValue(e.target.value)}
              maxLength={120}
              isDark={isDark}
              disabled={downloading}
            />
            <MetadataInput
              id="album_input"
              label={i18nT('downloader.albumLabel')}
              value={albumValue}
              onChange={(e) => setAlbumValue(e.target.value)}
              maxLength={120}
              isDark={isDark}
              disabled={downloading}
            />
          </Box>
        </Collapse>

        {/* Cut Audio Dropdown */}
        <Button
          fullWidth
          disabled={downloading}
          onClick={() => toggleSection('cut')}
          endIcon={<ChevronIcon isOpen={activeSection === 'cut'} theme={theme} />}
          sx={{
            bgcolor: getButtonBg(activeSection === 'cut'),
            color: textColor,
            borderRadius: activeSection === 'cut' ? '12px 12px 0 0' : '12px',
            padding: '8px 16px',
            textTransform: 'none',
            justifyContent: 'space-between',
            minHeight: 'auto',
            mb: activeSection === 'cut' ? 0 : 0.75,
            opacity: downloading ? 0.6 : 1,
            '&:hover': {
              bgcolor: getButtonHover(activeSection === 'cut'),
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Scissors size={18} />
            <Typography sx={{ fontWeight: 600 }}>{i18nT('downloader.cutAudio')}</Typography>
          </Box>
        </Button>
        <Collapse in={activeSection === 'cut'} timeout={250}>
          <Box
            sx={{
              padding: 1.5,
              mb: 1.25,
              bgcolor: collapseBg,
              borderRadius: '0 0 12px 12px',
            }}
          >
            <AudioCutSection
              duration={durationSeconds}
              brandColor={brandColor}
              isDark={isDark}
              disabled={downloading}
              onChange={setAudioCutsData}
              mediaType="audio"
            />
          </Box>
        </Collapse>

        {/* Album Cover Dropdown */}
        <Button
          fullWidth
          disabled={downloading}
          onClick={() => toggleSection('cover')}
          endIcon={<ChevronIcon isOpen={activeSection === 'cover'} theme={theme} />}
          sx={{
            bgcolor: getButtonBg(activeSection === 'cover'),
            color: textColor,
            borderRadius: activeSection === 'cover' ? '12px 12px 0 0' : '12px',
            padding: '8px 16px',
            textTransform: 'none',
            justifyContent: 'space-between',
            minHeight: 'auto',
            mb: activeSection === 'cover' ? 0 : 0.75,
            opacity: downloading ? 0.6 : 1,
            '&:hover': {
              bgcolor: getButtonHover(activeSection === 'cover'),
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <ImageIcon size={18} />
            <Typography sx={{ fontWeight: 600 }}>{i18nT('downloader.albumCover')}</Typography>
          </Box>
        </Button>
        <Collapse in={activeSection === 'cover'} timeout={250}>
          <Box
            sx={{
              padding: 1.5,
              mb: 1.25,
              bgcolor: collapseBg,
              borderRadius: '0 0 12px 12px',
            }}
          >
            {/* Embed Switch at Top */}
            <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 700, color: textColor }}>{i18nT('downloader.embedCoverArt')}</Typography>
                <Typography variant="caption" sx={{ color: isDark ? '#888' : '#666', lineHeight: 1 }}>{i18nT('downloader.includeArtwork')}</Typography>
              </Box>
              <Box
                onClick={() => setCoverEmbedEnabled(!coverEmbedEnabled)}
                sx={{
                  width: 40,
                  height: 22,
                  borderRadius: 12,
                  bgcolor: coverEmbedEnabled ? brandColor : (isDark ? '#444' : '#ccc'),
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
              >
                <Box sx={{
                  width: 18, height: 18, borderRadius: '50%', bgcolor: '#fff',
                  position: 'absolute', top: 2, left: coverEmbedEnabled ? 20 : 2,
                  transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                }} />
              </Box>
            </Box>

            {/* Selection Grid (Conditional) */}
            <Collapse in={coverEmbedEnabled}>
              <Box sx={{ mb: 1.5, display: 'flex', gap: 1.5 }}>
                {/* Option 1: From Video */}
                <Box
                  onClick={() => !downloading && setCoverSource('video')}
                  sx={{
                    flex: 1,
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: coverSource === 'video' ? (isDark ? 'rgba(255,255,255,0.05)' : '#e0e0e0') : 'transparent',
                    border: `2px solid ${coverSource === 'video' ? brandColor : (isDark ? '#333' : '#ccc')}`,
                    cursor: downloading ? 'default' : 'pointer',
                    opacity: downloading ? 0.6 : 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 1,
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      bgcolor: coverSource === 'video' ? undefined : (isDark ? '#222' : '#f0f0f0'),
                      borderColor: coverSource === 'video' ? undefined : (isDark ? '#555' : '#aaa'),
                    }
                  }}
                >
                  <ImageIcon size={28} strokeWidth={1.5} color={coverSource === 'video' ? brandColor : (isDark ? '#666' : '#999')} />
                  <Typography variant="body2" sx={{ fontWeight: 700, color: textColor, fontSize: '0.85rem' }}>{i18nT('downloader.coverFromVideo')}</Typography>
                </Box>

                {/* Option 2: Upload */}
                <Box
                  onClick={() => !downloading && setCoverSource('upload')}
                  sx={{
                    flex: 1,
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: coverSource === 'upload' ? (isDark ? 'rgba(255,255,255,0.05)' : '#e0e0e0') : 'transparent',
                    border: `2px solid ${coverSource === 'upload' ? brandColor : (isDark ? '#333' : '#ccc')}`,
                    cursor: downloading ? 'default' : 'pointer',
                    opacity: downloading ? 0.6 : 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 1,
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      bgcolor: coverSource === 'upload' ? undefined : (isDark ? '#222' : '#f0f0f0'),
                      borderColor: coverSource === 'upload' ? undefined : (isDark ? '#555' : '#aaa'),
                    }
                  }}
                >
                  <Download size={28} strokeWidth={1.5} color={coverSource === 'upload' ? brandColor : (isDark ? '#666' : '#999')} />
                  <Typography variant="body2" sx={{ fontWeight: 700, color: textColor, fontSize: '0.85rem' }}>{i18nT('downloader.coverUploadCustom')}</Typography>
                </Box>
              </Box>

              {coverSource === 'upload' && (
                <Box sx={{ mt: 2, mb: 1 }}>
                  {/* Drag & Drop Zone */}
                  <Box
                    component="label"
                    sx={{
                      width: '100%',
                      minHeight: 140,
                      borderRadius: 2,
                      border: `1px dashed ${isDark ? '#444' : '#bbb'}`,
                      bgcolor: isDark ? '#1a1a1a' : '#f0f0f0',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: downloading ? 'default' : 'pointer',
                      position: 'relative',
                      overflow: 'hidden',
                      transition: 'all 0.2s',
                      '&:hover': {
                        bgcolor: isDark ? '#222' : '#e8e8e8',
                        borderColor: isDark ? '#666' : '#999',
                      }
                    }}
                  >
                    <input
                      hidden
                      type="file"
                      accept="image/*"
                      onChange={handleCoverFileChange}
                      disabled={downloading}
                      onClick={(e) => {
                        if (coverUpload?.dataUrl) e.preventDefault() // prevent opening selector if image exists (use remove btn first)
                      }}
                    />

                    {coverUpload?.dataUrl ? (
                      <>
                        <Box
                          component="img"
                          src={coverUpload.dataUrl}
                          alt={i18nT('downloader.coverPreviewAlt')}
                          sx={{
                            width: '100%',
                            height: '100%',
                            maxHeight: 200,
                            objectFit: 'contain',
                            display: 'block',
                            p: 1
                          }}
                        />
                        <Box
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setCoverUpload(null);
                            setCoverUploadError('');
                          }}
                          sx={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            bgcolor: 'rgba(0,0,0,0.6)',
                            borderRadius: '50%',
                            p: 0.5,
                            color: '#fff',
                            display: 'flex',
                            cursor: 'pointer',
                            zIndex: 10,
                            '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' }
                          }}
                        >
                          <X size={16} />
                        </Box>
                        <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, bgcolor: 'rgba(0,0,0,0.6)', p: 0.5, textAlign: 'center' }}>
                          <Typography variant="caption" sx={{ color: '#fff' }}>{coverUpload.name}</Typography>
                        </Box>
                      </>
                    ) : (
                      <Box sx={{ textAlign: 'center', p: 2 }}>
                        <Download size={24} color={isDark ? '#666' : '#999'} style={{ marginBottom: 8 }} />
                        <Typography variant="body2" sx={{ fontWeight: 600, color: textColor }}>{i18nT('downloader.clickUpload')}</Typography>
                        <Typography variant="caption" sx={{ color: isDark ? '#888' : '#777' }}>{i18nT('downloader.dragDrop')}</Typography>
                      </Box>
                    )}
                  </Box>
                  {coverUploadError && <Typography color="error" variant="caption" sx={{ mt: 0.5, display: 'block' }}>{coverUploadError}</Typography>}
                </Box>
              )}
            </Collapse>
          </Box>
        </Collapse>

        {/* Audio Bitrate Dropdown */}
        <Button
          fullWidth
          disabled={downloading}
          onClick={() => toggleSection('bitrate')}
          endIcon={<ChevronIcon isOpen={activeSection === 'bitrate'} theme={theme} />}
          sx={{
            bgcolor: getButtonBg(activeSection === 'bitrate'),
            color: textColor,
            borderRadius: activeSection === 'bitrate' ? '12px 12px 0 0' : '12px',
            padding: '8px 16px',
            textTransform: 'none',
            justifyContent: 'space-between',
            minHeight: 'auto',
            mb: activeSection === 'bitrate' ? 0 : 0.75,
            opacity: downloading ? 0.6 : 1,
            '&:hover': {
              bgcolor: getButtonHover(activeSection === 'bitrate'),
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <TrendingUp size={18} />
            <Typography sx={{ fontWeight: 600 }}>{i18nT('downloader.audioBitrate')}</Typography>
          </Box>
        </Button>
        <Collapse in={activeSection === 'bitrate'} timeout={250}>
          <Box
            sx={{
              padding: 1.5,
              mb: 1.25,
              bgcolor: collapseBg,
              borderRadius: '0 0 12px 12px',
            }}
          >
            <CustomSelect
              value={selectedAudioFormat}
              onChange={setSelectedAudioFormat}
              options={[
                { value: 'best', label: i18nT('downloader.bestQuality'), description: undefined },
                ...buildAudioOptions(audioFormats),
              ]}
              label={i18nT('downloader.quality')}
              isDark={isDark}
              disabled={loadingFormats || downloading}
            />
          </Box>
        </Collapse>

        {/* Filename Dropdown */}
        <Button
          fullWidth
          disabled={downloading}
          onClick={() => toggleSection('filename')}
          endIcon={<ChevronIcon isOpen={activeSection === 'filename'} theme={theme} />}
          sx={{
            bgcolor: getButtonBg(activeSection === 'filename'),
            color: textColor,
            borderRadius: activeSection === 'filename' ? '12px 12px 0 0' : '12px',
            padding: '8px 16px',
            textTransform: 'none',
            justifyContent: 'space-between',
            minHeight: 'auto',
            mb: activeSection === 'filename' ? 0 : 0.75,
            opacity: downloading ? 0.6 : 1,
            '&:hover': {
              bgcolor: getButtonHover(activeSection === 'filename'),
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Tag size={18} />
            <Typography sx={{ fontWeight: 600 }}>{i18nT('downloader.filename')}</Typography>
          </Box>
        </Button>
        <Collapse in={activeSection === 'filename'} timeout={250}>
          <Box
            sx={{
              padding: 1.5,
              mb: 1.25,
              bgcolor: collapseBg,
              borderRadius: '0 0 12px 12px',
            }}
          >
            <CombinedFilenameInput
              value={filenameValue}
              onChange={setFilenameValue}
              extension={audioContainer}
              onExtensionChange={setAudioContainer}
              extensions={[
                { value: 'mp3', label: 'mp3' },
                { value: 'm4a', label: 'm4a' },
                { value: 'wav', label: 'wav' },
                { value: 'ogg', label: 'ogg' },
                { value: 'flac', label: 'flac' },
                { value: 'opus', label: 'opus' },
              ]}
              placeholder={i18nT('downloader.filename')}
              isDark={isDark}
              disabled={downloading}
            />
          </Box>
        </Collapse>

        {/* Download Button with Integrated Progress (Audio) */}
        <Box sx={{ position: 'relative', mt: 2 }}>
          <Button
            fullWidth
            onClick={() => handleDownload('audio')}
            disabled={downloading}
            sx={{
              position: 'relative',
              overflow: 'hidden',
              bgcolor: brandColor,
              borderRadius: '999px', // Fully rounded pill shape
              textTransform: 'none',
              padding: '14px 20px',
              fontWeight: 700,
              color: '#ffffff',
              fontSize: '1.125rem',
              border: `2px solid ${adjustColorBrightness(brandColor, -20)}`,
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)', // Cleaner, softer shadow
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: adjustColorBrightness(brandColor, -10),
                boxShadow: '0 6px 16px rgba(0,0,0,0.25)',
                // No transform
              },
              '&:active': {
                // No scale effect
                bgcolor: adjustColorBrightness(brandColor, -15),
              },
              '&:disabled': {
                bgcolor: '#444',
                color: 'rgba(255,255,255,0.9)',
                borderColor: '#444',
                boxShadow: 'none',
              }
            }}
          >
            {/* Progress Background */}
            {downloading && tab === 'audio' && (
              <Box
                sx={{
                  position: 'absolute',
                  top: '-2px',
                  left: '-2px',
                  bottom: '-2px',
                  width: `calc(${downloadProgress}% + 4px)`,
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)', // Neutral progress
                  transition: 'width 0.2s linear',
                  zIndex: 0,
                  height: 'calc(100% + 4px)',
                }}
              />
            )}

            <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {downloading && tab === 'audio' ? (
                <>
                  <CircularProgress size={22} sx={{ color: '#ffffff' }} thickness={5} />
                  <Typography sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                    {downloadStage === 'merging' ? i18nT('downloader.merging') :
                      downloadStage === 'processing' ? i18nT('downloader.processing') :
                        `${Math.round(downloadProgress)}%`}
                  </Typography>
                </>
              ) : (
                <>
                  <Download size={22} strokeWidth={2.5} />
                  <span>{i18nT('downloader.downloadAudio')}</span>
                </>
              )}
            </Box>
          </Button>
        </Box>
        {downloadError && tab === 'audio' && (
          <Typography sx={{ color: 'error.main', fontSize: '0.875rem', mt: 1, textAlign: 'center' }}>
            {downloadError}
          </Typography>
        )}
      </Box>
    )
  }

  // Render video tab content
  const renderVideoTabContent = () => {
    const isDark = theme.palette.mode === 'dark'
    const collapseBg = isDark ? '#272727' : '#f9f9f9'
    const selectBg = isDark ? '#1a1a1a' : '#ffffff'
    const textColor = isDark ? '#ffffff' : theme.palette.text.primary

    const getButtonBg = (isOpen) => isDark ? (isOpen ? '#272727' : '#1a1a1a') : (isOpen ? '#e8e8e8' : '#ffffff')
    const getButtonHover = (isOpen) => isDark ? '#272727' : '#f0f0f0'

    return (
      <Box>


        {/* Video Quality Dropdown */}
        <Button
          fullWidth
          onClick={() => toggleSection('quality')}
          endIcon={<ChevronIcon isOpen={activeSection === 'quality'} theme={theme} />}
          sx={{
            bgcolor: getButtonBg(activeSection === 'quality'),
            color: textColor,
            borderRadius: activeSection === 'quality' ? '12px 12px 0 0' : '12px',
            padding: '8px 16px',
            textTransform: 'none',
            justifyContent: 'space-between',
            minHeight: 'auto',
            mb: activeSection === 'quality' ? 0 : 0.75,
            '&:hover': {
              bgcolor: getButtonHover(activeSection === 'quality'),
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Video size={18} />
            <Typography sx={{ fontWeight: 600 }}>{i18nT('downloader.quality')}</Typography>
          </Box>
        </Button>
        <Collapse in={activeSection === 'quality'} timeout={250}>
          <Box
            sx={{
              padding: 1.5,
              mb: 1.25,
              bgcolor: collapseBg,
              borderRadius: '0 0 12px 12px',
            }}
          >
            <CustomSelect
              value={selectedVideoFormat}
              onChange={setSelectedVideoFormat}
              options={[
                { value: 'best', label: i18nT('downloader.bestQuality'), description: undefined },
                ...buildVideoOptions(videoFormats),
              ]}
              label={i18nT('downloader.quality')}
              isDark={isDark}
              disabled={loadingFormats}
            />
          </Box>
        </Collapse>

        {/* Cut Video Dropdown */}
        <Button
          fullWidth
          disabled={downloading}
          onClick={() => toggleSection('video-cut')}
          endIcon={<ChevronIcon isOpen={activeSection === 'video-cut'} theme={theme} />}
          sx={{
            bgcolor: getButtonBg(activeSection === 'video-cut'),
            color: textColor,
            borderRadius: activeSection === 'video-cut' ? '12px 12px 0 0' : '12px',
            padding: '8px 16px',
            textTransform: 'none',
            justifyContent: 'space-between',
            minHeight: 'auto',
            mb: activeSection === 'video-cut' ? 0 : 0.75,
            opacity: downloading ? 0.6 : 1,
            '&:hover': {
              bgcolor: getButtonHover(activeSection === 'video-cut'),
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Scissors size={18} />
            <Typography sx={{ fontWeight: 600 }}>{i18nT('downloader.cutVideo')}</Typography>
          </Box>
        </Button>
        <Collapse in={activeSection === 'video-cut'} timeout={250}>
          <Box
            sx={{
              padding: 1.5,
              mb: 1.25,
              bgcolor: collapseBg,
              borderRadius: '0 0 12px 12px',
            }}
          >
            <AudioCutSection
              duration={durationSeconds}
              brandColor={brandColor}
              isDark={isDark}
              disabled={downloading}
              onChange={setVideoCutsData}
              mediaType="video"
            />
          </Box>
        </Collapse>

        {/* Combined Filename + Format Input (Video) */}
        <Box sx={{ mb: 2 }}>
          <CombinedFilenameInput
            value={filenameValue}
            onChange={setFilenameValue}
            extension={videoContainer}
            onExtensionChange={setVideoContainer}
            extensions={[
              { value: 'mp4', label: 'mp4' },
              { value: 'webm', label: 'webm' },
              { value: 'mkv', label: 'mkv' },
            ]}
            placeholder={i18nT('downloader.filename')}
            isDark={isDark}
            disabled={downloading}
          />
        </Box>

        {/* Download Button with Integrated Progress (Video) */}
        <Box sx={{ position: 'relative', mt: 2 }}>
          <Button
            fullWidth
            onClick={() => handleDownload('video')}
            disabled={downloading}
            sx={{
              position: 'relative',
              overflow: 'hidden',
              bgcolor: brandColor,
              borderRadius: '999px', // Fully rounded pill shape
              textTransform: 'none',
              padding: '14px 20px',
              fontWeight: 700,
              color: '#ffffff',
              fontSize: '1.125rem',
              border: `2px solid ${adjustColorBrightness(brandColor, -20)}`,
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)', // Cleaner, softer shadow
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: adjustColorBrightness(brandColor, -10),
                boxShadow: '0 6px 16px rgba(0,0,0,0.25)',
                // No transform
              },
              '&:active': {
                // No scale effect
                bgcolor: adjustColorBrightness(brandColor, -15),
              },
              '&:disabled': {
                bgcolor: '#444',
                color: 'rgba(255,255,255,0.9)',
                borderColor: '#444',
                boxShadow: 'none',
              }
            }}
          >
            {/* Progress Background */}
            {downloading && tab === 'video' && (
              <Box
                sx={{
                  position: 'absolute',
                  top: '-2px',
                  left: '-2px',
                  bottom: '-2px',
                  width: `calc(${downloadProgress}% + 4px)`,
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)', // Neutral progress
                  transition: 'width 0.2s linear',
                  zIndex: 0,
                  height: 'calc(100% + 4px)',
                }}
              />
            )}

            <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {downloading && tab === 'video' ? (
                <>
                  <CircularProgress size={22} sx={{ color: '#ffffff' }} thickness={5} />
                  <Typography sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                    {downloadStage === 'merging' ? i18nT('downloader.merging') :
                      downloadStage === 'processing' ? i18nT('downloader.processing') :
                        `${Math.round(downloadProgress)}%`}
                  </Typography>
                </>
              ) : (
                <>
                  <Download size={22} strokeWidth={2.5} />
                  <span>{i18nT('downloader.downloadVideo')}</span>
                </>
              )}
            </Box>
          </Button>
        </Box>
        {downloadError && tab === 'video' && (
          <Typography sx={{ color: 'error.main', fontSize: '0.875rem', mt: 1, textAlign: 'center' }}>
            {downloadError}
          </Typography>
        )}
      </Box>
    )
  }

  // Render thumbnail tab content
  const renderThumbnailTabContent = () => {
    const isDark = theme.palette.mode === 'dark'
    const textColor = isDark ? '#ffffff' : theme.palette.text.primary
    const borderColor = isDark ? '#3a3a3a' : '#d0d0d0'
    const API_BASE = getApiBase()
    const selectedThumb = thumbOptions.find((o) => o.value === selectedThumbValue) || null

    const handleDownloadThumb = async () => {
      if (!selectedThumb) return
      const rawName = filenameValue || videoTitle || 'thumbnail'
      const safeTitle = rawName
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 120)

      const ext = selectedThumbFormat
      const filename = `${safeTitle}.${ext}`
      const url = `${API_BASE}/api/proxy-image?url=${encodeURIComponent(selectedThumb.url)}&filename=${encodeURIComponent(filename)}&format=${encodeURIComponent(ext)}`
      // Trigger browser download
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
    }

    return (
      <Box>
        <Box sx={{ mb: 1.5 }}>
          <CustomSelect
            value={selectedThumbValue}
            onChange={setSelectedThumbValue}
            options={thumbOptions}
            label={i18nT('downloader.thumbSize')}
            isDark={isDark}
            disabled={thumbOptions.length === 0}
          />
        </Box>

        {/* Thumbnail Preview */}
        <Box sx={{ mb: 2, borderRadius: 2, overflow: 'hidden', border: `1px solid ${borderColor}`, bgcolor: isDark ? '#121212' : '#fafafa', position: 'relative' }}>
          {selectedThumb ? (
            <Box component="img" src={selectedThumb.url} alt={videoTitle || i18nT('downloader.thumbnailAltFallback')} sx={{ width: '100%', display: 'block' }} />
          ) : (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: textColor }}>
                {loadingThumbs ? i18nT('downloader.loadingThumbnails') : i18nT('downloader.noThumbnailAvailable')}
              </Typography>
            </Box>
          )}
          {selectedThumb && (
            <Box sx={{ position: 'absolute', bottom: 6, right: 6, bgcolor: 'rgba(0,0,0,0.7)', px: 0.8, py: 0.2, borderRadius: 1, color: '#fff', fontSize: '11px', fontWeight: 600 }}>
              {selectedThumb.width}x{selectedThumb.height}
            </Box>
          )}
        </Box>

        {/* Combined Filename + Format Input */}
        <Box sx={{ mb: 2 }}>
          <CombinedFilenameInput
            value={filenameValue}
            onChange={setFilenameValue}
            extension={selectedThumbFormat}
            onExtensionChange={setSelectedThumbFormat}
            extensions={[
              { value: 'jpg', label: 'jpg' },
              { value: 'png', label: 'png' },
              { value: 'webp', label: 'webp' },
            ]}
            placeholder={i18nT('downloader.filename')}
            isDark={isDark}
            disabled={downloading || thumbOptions.length === 0}
          />
        </Box>

        {/* Download Button */}
        <Button
          fullWidth
          startIcon={<Download size={20} />} // Using 20 to match generic icon size, but text size will be matched
          onClick={handleDownloadThumb}
          disabled={!selectedThumb}
          sx={{
            bgcolor: brandColor,
            borderRadius: '999px', // Fully rounded pill shape (Matched)
            textTransform: 'none',
            padding: '14px 20px', // Matched padding
            fontWeight: 700,
            color: '#ffffff',
            fontSize: '1.125rem', // Matched font size
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)', // Matched shadow
            border: `2px solid ${adjustColorBrightness(brandColor, -20)}`, // Matched border
            opacity: selectedThumb ? 1 : 0.6,
            transition: 'all 0.2s ease', // Matched transition
            '&:hover': {
              bgcolor: adjustColorBrightness(brandColor, -10),
              boxShadow: '0 6px 16px rgba(0,0,0,0.25)', // Matched hover shadow
            },
            '&:active': {
              bgcolor: adjustColorBrightness(brandColor, -15),
            }
          }}
        >
          {i18nT('downloader.downloadThumbnail')}
        </Button>
      </Box>
    )
  }

  const isDark = theme.palette.mode === 'dark'
  const tabActiveBg = isDark ? '#272727' : '#e0e0e0'
  const tabInactiveBg = isDark ? '#1a1a1a' : '#f5f5f5'
  const tabActiveBorder = isDark ? '#424242' : '#a0a0a0'
  const tabInactiveBorder = isDark ? '#1a1a1a' : '#f5f5f5'
  const tabHoverBorder = isDark ? '#555555' : '#909090'
  const tabTextColor = isDark ? '#ffffff' : theme.palette.text.primary

  return (
    <Box>
      {/* Options Buttons Panel (Tabs) */}
      <Box
        sx={{
          margin: theme.spacing(1.5, 1.5, 0, 1.5),
          padding: theme.spacing(1.5),
          borderRadius: '12px 12px 0 0',
          bgcolor: theme.palette.mode === 'dark' ? '#0a0a0a' : '#f0f0f0',
          boxShadow: theme.palette.mode === 'dark' ? '0 2px 4px rgba(0, 0, 0, 0.2)' : 'none',
          display: 'flex',
          gap: theme.spacing(1),
          opacity: downloading ? 0.6 : 1,
          pointerEvents: downloading ? 'none' : 'auto', // Disable interactions
        }}
      >
        {/* Audio Button */}
        <Button
          variant="contained"
          startIcon={<Music2 size={20} />}
          onClick={() => handleTabChange('audio')}
          disabled={downloading}
          sx={{
            borderRadius: '28px',
            textTransform: 'none',
            padding: '12px 16px',
            fontWeight: 600,
            flex: 1,
            height: '48px',
            bgcolor: tab === 'audio' ? tabActiveBg : tabInactiveBg,
            color: tabTextColor,
            fontSize: '1.125rem',
            border: tab === 'audio' ? `2px solid ${tabActiveBorder}` : `2px solid ${tabInactiveBorder}`,
            boxSizing: 'border-box',
            '&:hover': {
              bgcolor: tabActiveBg,
              borderColor: tab === 'audio' ? tabHoverBorder : tabInactiveBorder,
            },
          }}
        >
          {i18nT('downloader.tabAudio')}
        </Button>

        {/* Video Button */}
        <Button
          variant="contained"
          startIcon={<Video size={20} />}
          onClick={() => handleTabChange('video')}
          disabled={downloading}
          sx={{
            borderRadius: '28px',
            textTransform: 'none',
            padding: '12px 16px',
            fontWeight: 600,
            flex: 1,
            height: '48px',
            bgcolor: tab === 'video' ? tabActiveBg : tabInactiveBg,
            color: tabTextColor,
            fontSize: '1.125rem',
            border: tab === 'video' ? `2px solid ${tabActiveBorder}` : `2px solid ${tabInactiveBorder}`,
            boxSizing: 'border-box',
            '&:hover': {
              bgcolor: tabActiveBg,
              borderColor: tab === 'video' ? tabHoverBorder : tabInactiveBorder,
            },
          }}
        >
          {i18nT('downloader.tabVideo')}
        </Button>

        {/* Thumbnail Button (Round) */}
        <Button
          variant="contained"
          onClick={() => handleTabChange('thumbnail')}
          disabled={downloading}
          sx={{
            borderRadius: '50%',
            minWidth: '48px',
            width: '48px',
            height: '48px',
            padding: 0,
            bgcolor: tab === 'thumbnail' ? tabActiveBg : tabInactiveBg,
            color: tabTextColor,
            fontSize: '1.125rem',
            border: tab === 'thumbnail' ? `2px solid ${tabActiveBorder}` : `2px solid ${tabInactiveBorder}`,
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            '&:hover': {
              bgcolor: tabActiveBg,
              borderColor: tab === 'thumbnail' ? tabHoverBorder : tabInactiveBorder,
            },
          }}
        >
          <ImageIcon size={20} />
        </Button>
      </Box>

      {/* Tab Content Container */}
      <Box
        sx={{
          margin: theme.spacing(0, 1.5, 1.5, 1.5),
          padding: theme.spacing(0.75, 1.5, 1.5, 1.5),
          borderRadius: '0 0 12px 12px',
          bgcolor: theme.palette.mode === 'dark' ? '#0a0a0a' : '#f0f0f0',
          boxShadow: theme.palette.mode === 'dark' ? '0 2px 4px rgba(0, 0, 0, 0.2)' : 'none',
          minHeight: '120px',
          opacity: downloading ? 0.8 : 1, // Dim content during download
          pointerEvents: downloading ? 'none' : 'auto',
        }}
      >
        {tab === 'audio' && renderAudioTabContent()}
        {tab === 'video' && renderVideoTabContent()}
        {tab === 'thumbnail' && renderThumbnailTabContent()}
      </Box>
    </Box>
  )
}