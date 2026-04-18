import React from 'react'
import { parseVideoTitle } from '../../../utils/metadataParser'
import {
  getApiBase,
  normalizeUrlForNoembed,
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

function normalizeThumbnailDimension(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  const rounded = Math.round(numeric)
  return rounded > 0 ? rounded : 0
}

function probeImageDimensions(url, timeoutMs = 9000) {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(null)
      return
    }

    const image = new Image()
    let settled = false
    let timeoutId = null

    const finalize = (payload) => {
      if (settled) return
      settled = true

      if (timeoutId != null) {
        clearTimeout(timeoutId)
      }

      image.onload = null
      image.onerror = null
      resolve(payload)
    }

    image.onload = () => {
      const width = normalizeThumbnailDimension(image.naturalWidth)
      const height = normalizeThumbnailDimension(image.naturalHeight)
      if (!(width > 0 && height > 0)) {
        finalize(null)
        return
      }

      finalize({ width, height })
    }

    image.onerror = () => {
      finalize(null)
    }

    timeoutId = setTimeout(() => {
      finalize(null)
    }, timeoutMs)

    image.src = url
  })
}

export default function useOptionsTabsData({
  i18nT,
  videoTitle,
  videoAuthor,
  videoUrl,
  videoThumbnail,
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
  const [thumbsResolvedUrl, setThumbsResolvedUrl] = React.useState('')
  const [thumbnailEndpointAvailable, setThumbnailEndpointAvailable] = React.useState(true)
  const thumbnailProbeRequestRef = React.useRef(0)
  const thumbnailProbeCacheRef = React.useRef(new Map())

  const [audioCutsData, setAudioCutsData] = React.useState(null)
  const [videoCutsData, setVideoCutsData] = React.useState(null)

  const [coverEmbedEnabled, setCoverEmbedEnabled] = React.useState(true)
  const [coverSource, setCoverSource] = React.useState('video')
  const [coverUpload, setCoverUpload] = React.useState(null)
  const [coverVideoEdit, setCoverVideoEdit] = React.useState(null)
  const [coverUploadError, setCoverUploadError] = React.useState('')
  const [hasVideoThumbnail, setHasVideoThumbnail] = React.useState(false)
  const [videoThumbnailChecked, setVideoThumbnailChecked] = React.useState(false)
  const [videoThumbnailChecking, setVideoThumbnailChecking] = React.useState(false)
  const normalizedVideoThumbnail = React.useMemo(
    () => String(videoThumbnail || '').trim(),
    [videoThumbnail]
  )
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
      setCoverUpload({
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl,
        originalDataUrl: dataUrl,
      })
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
    setCoverVideoEdit(null)
  }, [videoUrl, normalizedVideoThumbnail])

  React.useEffect(() => {
    setCoverSource('video')
  }, [videoUrl])

  React.useEffect(() => {
    const source = normalizedVideoThumbnail
    let cancelled = false

    if (!source) {
      setHasVideoThumbnail(false)
      setVideoThumbnailChecked(true)
      setVideoThumbnailChecking(false)
      return () => {
        cancelled = true
      }
    }

    setVideoThumbnailChecking(true)
    setVideoThumbnailChecked(false)
    setHasVideoThumbnail(false)

    const probe = new Image()
    probe.onload = () => {
      if (cancelled) return
      setHasVideoThumbnail(true)
      setVideoThumbnailChecked(true)
      setVideoThumbnailChecking(false)
    }
    probe.onerror = () => {
      if (cancelled) return
      setHasVideoThumbnail(false)
      setVideoThumbnailChecked(true)
      setVideoThumbnailChecking(false)
    }

    const cacheBusterSeparator = source.includes('?') ? '&' : '?'
    probe.src = `${source}${cacheBusterSeparator}v=${Date.now()}`

    return () => {
      cancelled = true
    }
  }, [normalizedVideoThumbnail, videoUrl])

  React.useEffect(() => {
    if (!videoThumbnailChecked || videoThumbnailChecking || hasVideoThumbnail) return
    if (coverSource !== 'video') return

    setCoverSource('upload')
    if (coverEmbedEnabled) {
      setCoverEmbedEnabled(false)
    }
  }, [coverEmbedEnabled, coverSource, hasVideoThumbnail, videoThumbnailChecked, videoThumbnailChecking])

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

  const buildThumbnailLabel = React.useCallback((id, width, height) => {
    const normalizedId = String(id || '').trim().toLowerCase()
    const friendlyMap = {
      maxresdefault: i18nT('downloader.maxResolution'),
      sddefault: i18nT('downloader.sd'),
      hqdefault: i18nT('downloader.hq'),
      mqdefault: i18nT('downloader.mq'),
      default: i18nT('downloader.default'),
    }

    const friendly = normalizedId ? friendlyMap[normalizedId] : ''
    if (width > 0 && height > 0) {
      return friendly ? `${friendly} (${width}x${height})` : `${width}x${height}`
    }

    return friendly || i18nT('downloader.originalThumb')
  }, [i18nT])

  const resolveThumbOptionDimensions = React.useCallback(async (options) => {
    const list = Array.isArray(options) ? options : []
    if (list.length === 0) return
    if (typeof Image === 'undefined') return

    const requestId = thumbnailProbeRequestRef.current + 1
    thumbnailProbeRequestRef.current = requestId
    const cache = thumbnailProbeCacheRef.current
    const resolvedByUrl = new Map()

    await Promise.all(list.map(async (option) => {
      const url = String(option?.url || '').trim()
      if (!url) return

      const cached = cache.get(url)
      if (cached?.width > 0 && cached?.height > 0) {
        resolvedByUrl.set(url, cached)
        return
      }

      const probed = await probeImageDimensions(url)
      if (!(probed?.width > 0 && probed?.height > 0)) return

      cache.set(url, probed)
      resolvedByUrl.set(url, probed)
    }))

    if (thumbnailProbeRequestRef.current !== requestId) return
    if (resolvedByUrl.size === 0) return

    setThumbOptions((previous) => previous.map((option) => {
      const url = String(option?.url || '').trim()
      const resolved = resolvedByUrl.get(url)
      if (!(resolved?.width > 0 && resolved?.height > 0)) return option

      if (option.width === resolved.width && option.height === resolved.height) {
        return option
      }

      return {
        ...option,
        width: resolved.width,
        height: resolved.height,
        label: buildThumbnailLabel(option.id, resolved.width, resolved.height),
      }
    }))
  }, [buildThumbnailLabel])

  const applyBackendThumbnails = React.useCallback((thumbnails) => {
    const entries = Array.isArray(thumbnails) ? thumbnails : []
    const seen = new Set()
    const seenUrls = new Set()
    const opts = []

    for (const item of entries) {
      const url = String(item?.url || '').trim()
      if (!url || seenUrls.has(url)) continue

      const widthRaw = Number(item?.width)
      const heightRaw = Number(item?.height)
      const width = Number.isFinite(widthRaw) && widthRaw > 0 ? Math.round(widthRaw) : 0
      const height = Number.isFinite(heightRaw) && heightRaw > 0 ? Math.round(heightRaw) : 0
      const id = String(item?.id || '').trim().toLowerCase()

      const key = width > 0 && height > 0
        ? `${width}x${height}`
        : (id ? `id:${id}` : `url:${url}`)
      if (seen.has(key)) continue

      seen.add(key)
      seenUrls.add(url)

      opts.push({
        value: `${id || 'thumb'}-${width || 'x'}-${height || 'x'}-${opts.length}`,
        label: buildThumbnailLabel(id, width, height),
        description: undefined,
        url,
        id,
        width,
        height,
      })
    }

    if (opts.length > 0) {
      setThumbOptions(opts)
      setSelectedThumbValue((previous) => {
        if (opts.some((option) => option.value === previous)) return previous
        return opts[0]?.value || ''
      })
      void resolveThumbOptionDimensions(opts)
      return
    }

    setThumbOptions([])
    setSelectedThumbValue('')
  }, [buildThumbnailLabel, resolveThumbOptionDimensions])

  React.useEffect(() => {
    thumbnailProbeRequestRef.current += 1
    setThumbOptions([])
    setSelectedThumbValue('')
    setLoadingThumbs(false)
    setThumbsResolvedUrl('')
  }, [videoUrl])

  React.useEffect(() => () => {
    thumbnailProbeRequestRef.current += 1
  }, [])

  React.useEffect(() => {
    setAudioCutsData(null)
    setVideoCutsData(null)
  }, [videoUrl])

  React.useEffect(() => {
    let cancelled = false

    const loadFormats = async () => {
      if (!videoUrl) {
        if (cancelled) return
        setAudioFormats((prev) => (prev.length ? [] : prev))
        setVideoFormats((prev) => (prev.length ? [] : prev))
        setSelectedAudioFormat((prev) => (prev === 'best' ? prev : 'best'))
        setSelectedVideoFormat((prev) => (prev === 'best' ? prev : 'best'))
        return
      }

      if (initialFormats != null) {
        if (cancelled) return
        setAudioFormats(initialFormats.audioFormats || [])
        setVideoFormats(initialFormats.videoFormats || [])
        setLoadingFormats(false)
        return
      }

      try {
        const apiBase = getApiBase()
        const normalized = normalizeUrlForNoembed(videoUrl)
        if (cancelled) return
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
        if (cancelled) return
        setAudioFormats(data.audioFormats || [])
        setVideoFormats(data.videoFormats || [])
      } catch (err) {
        if (cancelled) return
        setAudioFormats([])
        setVideoFormats([])
        const directMessage = String(err?.message || '').trim()
        const message = directMessage || formatYtDlpErrorMessage(i18nT, err, {
          fallbackKey: 'downloader.errorDownloadFailed',
          includeRawForUnknown: true,
        })
        onFetchError?.(videoUrl, message)
      } finally {
        if (!cancelled) {
          setLoadingFormats(false)
        }
      }
    }

    loadFormats()

    return () => {
      cancelled = true
    }
  }, [videoUrl, initialFormats, onFetchError, i18nT])

  React.useEffect(() => {
    let cancelled = false

    const loadThumbs = async () => {
      if (tab !== 'thumbnail') return
      if (!videoUrl) {
        setThumbOptions([])
        setSelectedThumbValue('')
        setThumbsResolvedUrl('')
        return
      }
      if (thumbsResolvedUrl === videoUrl) return

      setLoadingThumbs(true)
      let resolvedForUrl = false

      try {
        const apiBase = getApiBase()
        const normalized = normalizeUrlForNoembed(videoUrl)

        let payload = null

        if (thumbnailEndpointAvailable) {
          const res = await fetch(`${apiBase}/api/meta/thumbnails?url=${encodeURIComponent(normalized)}`)
          if (res.ok) {
            payload = await res.json()
          } else if (res.status === 404) {
            setThumbnailEndpointAvailable(false)
          } else {
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
        }

        if (!payload) {
          const legacyRes = await fetch(`${apiBase}/api/meta/formats?url=${encodeURIComponent(normalized)}`)
          if (!legacyRes.ok) {
            let errorPayload = null
            try {
              errorPayload = await legacyRes.json()
            } catch {
              errorPayload = `HTTP ${legacyRes.status}`
            }
            throw new Error(formatYtDlpErrorMessage(i18nT, errorPayload, {
              fallbackKey: 'downloader.errorDownloadFailed',
              includeRawForUnknown: true,
            }))
          }

          const legacyPayload = await legacyRes.json()
          payload = {
            thumbnails: legacyPayload?.thumbnails || [],
            thumbnail: legacyPayload?.thumbnail || null,
          }
        }

        if (cancelled) return

        applyBackendThumbnails(payload?.thumbnails)
        resolvedForUrl = true
      } catch {
        if (cancelled) return
        setThumbOptions([])
        setSelectedThumbValue('')
      } finally {
        if (!cancelled) {
          setLoadingThumbs(false)
          if (resolvedForUrl) {
            setThumbsResolvedUrl(videoUrl)
          }
        }
      }
    }

    loadThumbs()
    return () => {
      cancelled = true
    }
  }, [tab, videoUrl, thumbsResolvedUrl, i18nT, applyBackendThumbnails, thumbnailEndpointAvailable])

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
    coverVideoEdit,
    coverUploadError,
    hasVideoThumbnail,
    videoThumbnailChecked,
    videoThumbnailChecking,
    videoThumbnailUrl: normalizedVideoThumbnail,
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
    setCoverVideoEdit,
    setCoverUploadError,

    toggleSection,
    handleTabChange,
    handleCoverFileChange,
  }
}
