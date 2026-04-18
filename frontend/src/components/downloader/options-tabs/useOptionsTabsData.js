import React from 'react'
import { parseVideoTitle } from '../../../utils/metadataParser'
import {
  getApiBase,
  normalizeUrlForNoembed,
  detectService,
  extractYouTubeId,
  youtubeThumb,
  fetchNoembed,
} from '../../../utils/metadata'
import {
  DOWNLOAD_SETTINGS_DEFAULTS,
  normalizeDownloadSettings,
  resolveDownloadTargetSettings,
} from '../../../utils/downloadSettings'
import { formatYtDlpErrorMessage } from '../../../utils/ytDlpErrorPresentation'

const DOWNLOAD_TAB_ORDER = Object.freeze(['audio', 'video', 'thumbnail'])

function normalizeDownloadType(value, fallback = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (DOWNLOAD_TAB_ORDER.includes(normalized)) return normalized
  return fallback
}

function normalizeDisabledDownloadTypes(values) {
  if (!Array.isArray(values)) return []

  const seen = new Set()
  const result = []

  for (const value of values) {
    const normalized = normalizeDownloadType(value, '')
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }

  if (result.length >= DOWNLOAD_TAB_ORDER.length) return []
  return result
}

export default function useOptionsTabsData({
  i18nT,
  videoTitle,
  videoAuthor,
  videoUrl,
  initialFormats,
  onFetchError,
  defaultDownloadType = 'video',
  disabledDownloadTypes = [],
}) {
  const normalizedDisabledDownloadTypes = React.useMemo(
    () => normalizeDisabledDownloadTypes(disabledDownloadTypes),
    [disabledDownloadTypes]
  )
  const disabledDownloadTypeSet = React.useMemo(
    () => new Set(normalizedDisabledDownloadTypes),
    [normalizedDisabledDownloadTypes]
  )
  const availableDownloadTypes = React.useMemo(() => {
    const allowed = DOWNLOAD_TAB_ORDER.filter((type) => !disabledDownloadTypeSet.has(type))
    return allowed.length ? allowed : [...DOWNLOAD_TAB_ORDER]
  }, [disabledDownloadTypeSet])
  const resolvedDefaultDownloadType = React.useMemo(() => {
    const normalizedDefault = normalizeDownloadType(defaultDownloadType, 'video')
    if (availableDownloadTypes.includes(normalizedDefault)) return normalizedDefault
    return availableDownloadTypes[0] || 'video'
  }, [availableDownloadTypes, defaultDownloadType])

  const [tab, setTab] = React.useState(() => resolvedDefaultDownloadType)
  const [activeSections, setActiveSections] = React.useState(() => ({
    audio: null,
    video: null,
    thumbnail: null,
  }))

  const [titleValue, setTitleValue] = React.useState('')
  const [artistValue, setArtistValue] = React.useState('')
  const [albumValue, setAlbumValue] = React.useState('')
  const [videoContainer, setVideoContainer] = React.useState('mp4')
  const [audioContainer, setAudioContainer] = React.useState('mp3')
  const [audioFilenameValue, setAudioFilenameValue] = React.useState('')
  const [videoFilenameValue, setVideoFilenameValue] = React.useState('')
  const [thumbnailFilenameValue, setThumbnailFilenameValue] = React.useState('')

  const [audioFormats, setAudioFormats] = React.useState([])
  const [videoFormats, setVideoFormats] = React.useState([])
  const [selectedAudioFormat, setSelectedAudioFormat] = React.useState('best')
  const [selectedVideoFormat, setSelectedVideoFormat] = React.useState('best')
  const [loadingFormats, setLoadingFormats] = React.useState(false)

  const [thumbOptions, setThumbOptions] = React.useState([])
  const [selectedThumbValue, setSelectedThumbValue] = React.useState('')
  const [selectedThumbFormat, setSelectedThumbFormat] = React.useState('jpg')
  const [loadingThumbs, setLoadingThumbs] = React.useState(false)

  const [audioCutsData, setAudioCutsData] = React.useState(null)
  const [videoCutsData, setVideoCutsData] = React.useState(null)

  const [coverEmbedEnabled, setCoverEmbedEnabled] = React.useState(true)
  const [coverSource, setCoverSource] = React.useState('video')
  const [coverUpload, setCoverUpload] = React.useState(null)
  const [coverUploadError, setCoverUploadError] = React.useState('')
  const [downloadSettings, setDownloadSettings] = React.useState(() => ({ ...DOWNLOAD_SETTINGS_DEFAULTS }))
  const [downloadSettingsLoaded, setDownloadSettingsLoaded] = React.useState(false)
  const defaultsAppliedRef = React.useRef(false)
  const previousVideoUrlRef = React.useRef(videoUrl)
  const activeSection = activeSections[tab] || null

  React.useEffect(() => {
    if (availableDownloadTypes.includes(tab)) return
    setTab((prev) => (prev === resolvedDefaultDownloadType ? prev : resolvedDefaultDownloadType))
  }, [availableDownloadTypes, resolvedDefaultDownloadType, tab])

  React.useEffect(() => {
    if (previousVideoUrlRef.current === videoUrl) return
    previousVideoUrlRef.current = videoUrl
    setTab((prev) => (prev === resolvedDefaultDownloadType ? prev : resolvedDefaultDownloadType))
  }, [resolvedDefaultDownloadType, videoUrl])

  const toggleSection = React.useCallback((section) => {
    setActiveSections((prev) => {
      const currentTabSection = prev[tab] || null
      return {
        ...prev,
        [tab]: currentTabSection === section ? null : section,
      }
    })
  }, [tab])

  const handleTabChange = React.useCallback((newTab) => {
    const normalized = normalizeDownloadType(newTab, '')
    if (!normalized || !availableDownloadTypes.includes(normalized)) return
    setTab(normalized)
  }, [availableDownloadTypes])

  const handleCoverFileChange = React.useCallback((event) => {
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
  }, [i18nT])

  React.useEffect(() => {
    if (!videoTitle) return

    const parsed = parseVideoTitle(videoTitle)
    setTitleValue(parsed.title || videoTitle)
    setArtistValue(parsed.artist || videoAuthor || '')
    setAlbumValue(parsed.album || '')
    setAudioFilenameValue(videoTitle)
    setVideoFilenameValue(videoTitle)
    setThumbnailFilenameValue(videoTitle)
  }, [videoTitle, videoAuthor])

  React.useEffect(() => {
    let cancelled = false

    const loadDownloadSettings = async () => {
      const apiBase = getApiBase()
      try {
        const resp = await fetch(`${apiBase}/api/download/settings`)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const data = await resp.json()
        if (!cancelled) setDownloadSettings(normalizeDownloadSettings(data))
      } catch {
        if (!cancelled) setDownloadSettings({ ...DOWNLOAD_SETTINGS_DEFAULTS })
      } finally {
        if (!cancelled) setDownloadSettingsLoaded(true)
      }
    }

    loadDownloadSettings()

    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!downloadSettingsLoaded || defaultsAppliedRef.current) return

    setAudioContainer(downloadSettings.defaultAudioContainer)
    setVideoContainer(downloadSettings.defaultVideoContainer)
    setCoverEmbedEnabled(Boolean(downloadSettings.defaultEmbedCoverArt))

    defaultsAppliedRef.current = true
  }, [
    downloadSettings,
    downloadSettingsLoaded,
  ])

  React.useEffect(() => {
    const maxAudioBitrate = Number(downloadSettings.maxAudioBitrateKbps)
    if (!Number.isFinite(maxAudioBitrate) || maxAudioBitrate <= 0) return
    if (!selectedAudioFormat || selectedAudioFormat === 'best') return

    const selected = audioFormats.find((fmt) => fmt?.formatId === selectedAudioFormat)
    const selectedAbr = Number(selected?.abr) || Number(selected?.tbr) || 0
    if (selectedAbr > 0 && selectedAbr <= maxAudioBitrate) return

    setSelectedAudioFormat('best')
  }, [audioFormats, downloadSettings.maxAudioBitrateKbps, selectedAudioFormat])

  React.useEffect(() => {
    const maxVideoHeight = Number(downloadSettings.maxVideoHeight)
    if (!Number.isFinite(maxVideoHeight) || maxVideoHeight <= 0) return
    if (!selectedVideoFormat || selectedVideoFormat === 'best') return

    const selected = videoFormats.find((fmt) => fmt?.formatId === selectedVideoFormat)
    let selectedHeight = Number(selected?.height) || 0

    if (!selectedHeight) {
      const resolution = String(selected?.resolution || '').toLowerCase()
      const pMatch = resolution.match(/(\d{3,4})p/)
      const xMatch = resolution.match(/x(\d{3,4})$/)
      selectedHeight = pMatch ? Number(pMatch[1]) : (xMatch ? Number(xMatch[1]) : 0)
    }

    if (selectedHeight > 0 && selectedHeight <= maxVideoHeight) return

    setSelectedVideoFormat('best')
  }, [videoFormats, downloadSettings.maxVideoHeight, selectedVideoFormat])

  const audioDownloadTargetSettings = React.useMemo(
    () => resolveDownloadTargetSettings(downloadSettings, 'audio'),
    [downloadSettings]
  )

  const videoDownloadTargetSettings = React.useMemo(
    () => resolveDownloadTargetSettings(downloadSettings, 'video'),
    [downloadSettings]
  )

  const applyBackendThumbnails = React.useCallback((thumbnails) => {
    const valid = (thumbnails || []).filter((item) => item.width && item.height && item.width > 0 && item.height > 0)
    valid.sort((a, b) => (b.height || 0) - (a.height || 0))

    const seen = new Set()
    const opts = []
    const friendlyMap = {
      maxresdefault: i18nT('downloader.maxResolution'),
      sddefault: i18nT('downloader.sd'),
      hqdefault: i18nT('downloader.hq'),
      mqdefault: i18nT('downloader.mq'),
      default: i18nT('downloader.default'),
    }

    for (const item of valid) {
      const dimLabel = `${item.width}x${item.height}`
      if (seen.has(dimLabel)) continue
      seen.add(dimLabel)

      const label = (item.id && friendlyMap[item.id])
        ? `${friendlyMap[item.id]} (${dimLabel})`
        : dimLabel

      opts.push({
        value: item.id || `thumb-${opts.length}`,
        label,
        description: undefined,
        url: item.url,
        width: item.width,
        height: item.height,
      })
    }

    if (opts.length > 0) {
      setThumbOptions(opts)
      setSelectedThumbValue(opts[0]?.value || '')
      return
    }

    setThumbOptions([])
    setSelectedThumbValue('')
  }, [i18nT])

  React.useEffect(() => {
    const loadFormats = async () => {
      if (!videoUrl) {
        setAudioFormats((prev) => (prev.length ? [] : prev))
        setVideoFormats((prev) => (prev.length ? [] : prev))
        setSelectedAudioFormat((prev) => (prev === 'best' ? prev : 'best'))
        setSelectedVideoFormat((prev) => (prev === 'best' ? prev : 'best'))
        setThumbOptions((prev) => (prev.length ? [] : prev))
        setSelectedThumbValue((prev) => (prev ? '' : prev))
        return
      }

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
        const apiBase = getApiBase()
        const normalized = normalizeUrlForNoembed(videoUrl)
        setLoadingFormats(true)

        const res = await fetch(`${apiBase}/api/meta/formats?url=${encodeURIComponent(normalized)}`)
        if (!res.ok) {
          let errorPayload = null
          try {
            errorPayload = await res.json()
          } catch {
            errorPayload = `HTTP ${res.status}`
          }
          throw new Error(formatYtDlpErrorMessage(i18nT, errorPayload, {
            fallbackKey: 'downloader.errorDownloadFailed',
            includeRawForUnknown: true,
          }))
        }

        const data = await res.json()
        setAudioFormats(data.audioFormats || [])
        setVideoFormats(data.videoFormats || [])

        const isYouTube = !!extractYouTubeId(videoUrl)
        if (!isYouTube && Array.isArray(data.thumbnails) && data.thumbnails.length) {
          applyBackendThumbnails(data.thumbnails)
        } else {
          setThumbOptions([])
          setSelectedThumbValue('')
        }
      } catch (err) {
        setAudioFormats([])
        setVideoFormats([])
        setThumbOptions([])
        setSelectedThumbValue('')
        const directMessage = String(err?.message || '').trim()
        const message = directMessage || formatYtDlpErrorMessage(i18nT, err, {
          fallbackKey: 'downloader.errorDownloadFailed',
          includeRawForUnknown: true,
        })
        onFetchError?.(videoUrl, message)
      } finally {
        setLoadingFormats(false)
      }
    }

    loadFormats()
  }, [videoUrl, initialFormats, applyBackendThumbnails, onFetchError])

  React.useEffect(() => {
    let cancelled = false

    const loadThumbs = async () => {
      if (thumbOptions.length > 0) return
      setLoadingThumbs(true)

      try {
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

          const preOptions = candidates.map((candidate) => ({
            value: candidate.key,
            label: `${candidate.label} (${candidate.width}x${candidate.height})`,
            description: undefined,
            url: youtubeThumb(id, candidate.key),
            width: candidate.width,
            height: candidate.height,
          }))

          if (!cancelled) {
            setThumbOptions(preOptions)
            setSelectedThumbValue(preOptions[0]?.value || '')
          }

          try {
            const probes = await Promise.all(
              candidates.map((candidate) => new Promise((resolve) => {
                const url = youtubeThumb(id, candidate.key)
                const img = new Image()
                img.onload = () => resolve({
                  ok: true,
                  url,
                  key: candidate.key,
                  label: candidate.label,
                  width: img.naturalWidth,
                  height: img.naturalHeight,
                })
                img.onerror = () => resolve({ ok: false })
                img.src = `${url}?v=${Date.now()}`
              }))
            )

            const available = probes
              .filter((probe) => probe.ok && probe.width && probe.height)
              .sort((a, b) => (b.height || 0) - (a.height || 0))
              .map((probe) => ({
                value: probe.key,
                label: `${probe.label} (${probe.width}x${probe.height})`,
                description: undefined,
                url: probe.url,
                width: probe.width,
                height: probe.height,
              }))

            if (!cancelled && available.length) {
              setThumbOptions(available)
              setSelectedThumbValue(available[0]?.value || '')
            }
          } catch {
            // keep preloaded options
          }
        } else {
          try {
            const noembed = await fetchNoembed(normalizeUrlForNoembed(videoUrl))
            const url = noembed?.thumbnail_url || ''
            if (url) {
              const dim = await new Promise((resolve) => {
                const img = new Image()
                img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
                img.onerror = () => resolve({ w: 0, h: 0 })
                img.src = `${url}`
              })

              options.push({
                value: 'original',
                label: dim.w && dim.h
                  ? `${i18nT('downloader.originalThumb')} (${dim.w}x${dim.h})`
                  : i18nT('downloader.originalThumb'),
                description: undefined,
                url,
                width: dim.w,
                height: dim.h,
              })
            }
          } catch {
            // ignore noembed probe failures
          }
        }

        if (!cancelled && thumbOptions.length === 0) {
          setThumbOptions(options)
          setSelectedThumbValue(options[0]?.value || '')
        }
      } finally {
        if (!cancelled) setLoadingThumbs(false)
      }
    }

    loadThumbs()
    return () => {
      cancelled = true
    }
  }, [videoUrl, thumbOptions.length, i18nT])

  return {
    tab,
    activeSection,
    titleValue,
    artistValue,
    albumValue,
    videoContainer,
    audioContainer,
    audioFilenameValue,
    videoFilenameValue,
    thumbnailFilenameValue,
    audioFormats,
    videoFormats,
    selectedAudioFormat,
    selectedVideoFormat,
    loadingFormats,
    thumbOptions,
    selectedThumbValue,
    selectedThumbFormat,
    loadingThumbs,
    audioCutsData,
    videoCutsData,
    coverEmbedEnabled,
    coverSource,
    coverUpload,
    coverUploadError,
    audioDownloadTargetSettings,
    videoDownloadTargetSettings,
    maxAudioBitrateKbps: downloadSettings.maxAudioBitrateKbps,
    maxVideoHeight: downloadSettings.maxVideoHeight,

    setTab,
    setActiveSections,
    setTitleValue,
    setArtistValue,
    setAlbumValue,
    setVideoContainer,
    setAudioContainer,
    setAudioFilenameValue,
    setVideoFilenameValue,
    setThumbnailFilenameValue,
    setSelectedAudioFormat,
    setSelectedVideoFormat,
    setSelectedThumbValue,
    setSelectedThumbFormat,
    setAudioCutsData,
    setVideoCutsData,
    setCoverEmbedEnabled,
    setCoverSource,
    setCoverUpload,
    setCoverUploadError,

    toggleSection,
    handleTabChange,
    handleCoverFileChange,
  }
}
