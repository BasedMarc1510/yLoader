import React from 'react'
import { Box } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import DownloaderShell from '../components/downloader/DownloaderShell'
import SimpleBarScrollArea from '../components/SimpleBarScrollArea'
import { detectService, toMetaModel, isLikelyValidUrlFor, fetchDuration, fetchFormats, fetchNoembed, normalizeServiceKey } from '../utils/metadata'
import { useI18n } from '../providers/I18nProvider'
import DownloaderLanding from './downloader/DownloaderLanding'
import FetchErrorPanel from './downloader/FetchErrorPanel'
import buildServices from './downloader/buildServices'
import { FADE_MS, HOLD_MS } from './downloader/constants'
import { openSettingsModal } from './home/settingsBridge'

const MIN_DURATION_LOADING_MS = 380

function normalizeDurationSeconds(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return Math.round(numeric)
}

function normalizeDownloaderMeta(rawMeta) {
  if (!rawMeta || typeof rawMeta !== 'object') return null

  const durationSeconds = normalizeDurationSeconds(rawMeta.durationSeconds)
  const duration = String(rawMeta.duration || '').trim() || null
  const durationLoading = Boolean(rawMeta.durationLoading) && durationSeconds == null
  const durationResolved = durationSeconds != null || Boolean(rawMeta.durationResolved)

  return {
    ...rawMeta,
    duration,
    durationSeconds,
    preloadedFormats: rawMeta.preloadedFormats || null,
    durationLoading,
    durationResolved,
  }
}

export default function SingleDownloader({
  serviceKey = 'generic',
  routeSearch = '',
  routeToken = 0,
  tabsReady = true,
  onNavigate,
  runtimeState = null,
  onTabStateChange,
}) {
  const { t: i18nT } = useI18n()
  const t = useTheme()
  const mode = t.palette.mode
  const inputRef = React.useRef(null)

  const services = React.useMemo(() => buildServices(i18nT, mode), [i18nT, mode])

  const params = React.useMemo(() => new URLSearchParams(routeSearch), [routeSearch])
  const serviceParam = React.useMemo(() => normalizeServiceKey(params.get('service')), [params])
  const queryUrl = React.useMemo(() => String(params.get('source') || params.get('url') || '').trim(), [params])
  const autostartFormat = React.useMemo(() => String(params.get('autostart') || '').trim().toLowerCase(), [params])
  const serviceFromQuery = services[serviceParam] ? serviceParam : null
  const resolvedServiceKey = serviceFromQuery || detectService(queryUrl) || serviceKey || 'generic'
  const cfg = services[resolvedServiceKey] || services.generic
  const [value, setValue] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [meta, setMeta] = React.useState(null)
  const [fetchError, setFetchError] = React.useState(null)
  const lastRuntimePayloadRef = React.useRef('')
  const activeMetaRequestRef = React.useRef(0)
  const activeSourceUrlRef = React.useRef('')

  const invalidateActiveMetaRequest = React.useCallback(() => {
    activeMetaRequestRef.current += 1
  }, [])

  const updateMetaForRequest = React.useCallback((requestId, targetUrl, updater) => {
    if (activeMetaRequestRef.current !== requestId) return

    const normalizedTargetUrl = String(targetUrl || '').trim()
    setMeta((prevMeta) => {
      if (!prevMeta) return prevMeta
      if (String(prevMeta.url || '').trim() !== normalizedTargetUrl) return prevMeta

      const nextMeta = typeof updater === 'function'
        ? updater(prevMeta)
        : { ...prevMeta, ...updater }
      const normalizedNextMeta = normalizeDownloaderMeta(nextMeta)
      if (normalizedNextMeta) {
        activeSourceUrlRef.current = String(normalizedNextMeta.url || normalizedTargetUrl).trim()
      }
      return normalizedNextMeta
    })
  }, [])

  const startFormatsPrefetch = React.useCallback((targetUrl, requestId) => {
    void (async () => {
      const startedAt = Date.now()
      const settleDurationState = (updater) => {
        const elapsedMs = Date.now() - startedAt
        const remainingMs = Math.max(0, MIN_DURATION_LOADING_MS - elapsedMs)
        if (remainingMs <= 0) {
          updateMetaForRequest(requestId, targetUrl, updater)
          return
        }

        setTimeout(() => {
          updateMetaForRequest(requestId, targetUrl, updater)
        }, remainingMs)
      }

      try {
        const payload = await fetchFormats(targetUrl)
        const durationSeconds = normalizeDurationSeconds(payload?.duration)
        const durationLabel = String(payload?.durationString || '').trim() || null

        const preloadedFormats = {
          title: String(payload?.title || '').trim(),
          author: String(payload?.author || '').trim(),
          extractor: String(payload?.extractor || '').trim(),
          thumbnail: String(payload?.thumbnail || '').trim() || null,
          duration: durationSeconds ?? null,
          durationString: durationLabel || null,
          audioFormats: Array.isArray(payload?.audioFormats) ? payload.audioFormats : [],
          videoFormats: Array.isArray(payload?.videoFormats) ? payload.videoFormats : [],
          thumbnails: Array.isArray(payload?.thumbnails) ? payload.thumbnails : [],
        }

        settleDurationState((prevMeta) => ({
          ...prevMeta,
          title: preloadedFormats.title || prevMeta.title,
          author: preloadedFormats.author || prevMeta.author,
          thumbnail: preloadedFormats.thumbnail || prevMeta.thumbnail,
          duration: durationLabel || prevMeta.duration || null,
          durationSeconds: durationSeconds ?? prevMeta.durationSeconds ?? null,
          preloadedFormats,
          durationLoading: false,
          durationResolved: true,
        }))
      } catch {
        try {
          const durationPayload = await fetchDuration(targetUrl)
          const durationSeconds = normalizeDurationSeconds(durationPayload?.duration)
          const durationLabel = String(durationPayload?.durationString || '').trim() || null

          settleDurationState((prevMeta) => ({
            ...prevMeta,
            duration: durationLabel || prevMeta.duration || null,
            durationSeconds: durationSeconds ?? prevMeta.durationSeconds ?? null,
            durationLoading: false,
            durationResolved: true,
          }))
        } catch {
          settleDurationState((prevMeta) => ({
            ...prevMeta,
            durationLoading: false,
            durationResolved: true,
          }))
        }
      }
    })()
  }, [updateMetaForRequest])

  const startNoembedFetch = React.useCallback((targetService, targetUrl, requestId) => {
    void (async () => {
      try {
        const noembed = await fetchNoembed(targetUrl)
        const mappedMeta = toMetaModel(targetService, targetUrl, noembed)

        updateMetaForRequest(requestId, targetUrl, (prevMeta) => ({
          ...prevMeta,
          title: mappedMeta.title || prevMeta.title,
          author: mappedMeta.author || prevMeta.author,
          provider: mappedMeta.provider || prevMeta.provider,
          thumbnail: mappedMeta.thumbnail || prevMeta.thumbnail,
        }))
      } catch {
        // Keep the UI interactive even when noembed data is unavailable.
      }
    })()
  }, [updateMetaForRequest])

  const [idx, setIdx] = React.useState(0)
  const [fading, setFading] = React.useState(false)
  const intervalRef = React.useRef(null)
  const timeoutRef = React.useRef(null)

  React.useEffect(() => {
    setIdx(0)
  }, [resolvedServiceKey])

  React.useEffect(() => {
    if (!tabsReady) return

    const urlParam = params.get('source') || params.get('url')
    if (urlParam && typeof urlParam === 'string') {
      const normalizedUrlParam = String(urlParam || '').trim()
      const cachedSourceUrl = String(runtimeState?.sourceUrl || '').trim()
      const cachedMeta = runtimeState?.meta
      const cachedMetaUrl = String(cachedMeta?.url || '').trim()
      const cachedError = runtimeState?.fetchError
      const cachedErrorUrl = String(cachedError?.url || '').trim()
      const hasMatchingCachedMeta = Boolean(cachedMeta && cachedSourceUrl && cachedSourceUrl === normalizedUrlParam && cachedMetaUrl === normalizedUrlParam)
      const hasMatchingCachedError = Boolean(cachedError && cachedSourceUrl && cachedSourceUrl === normalizedUrlParam && cachedErrorUrl === normalizedUrlParam)
      const effectiveService = detectService(normalizedUrlParam) || serviceFromQuery || serviceKey || 'generic'

      setValue(normalizedUrlParam)

      if (hasMatchingCachedMeta) {
        const cachedRequestId = activeMetaRequestRef.current + 1
        activeMetaRequestRef.current = cachedRequestId
        activeSourceUrlRef.current = normalizedUrlParam

        const normalizedCachedMeta = normalizeDownloaderMeta(cachedMeta)
          || normalizeDownloaderMeta({
            ...toMetaModel(effectiveService, normalizedUrlParam, null),
            duration: null,
            durationSeconds: null,
            preloadedFormats: null,
            durationLoading: true,
            durationResolved: false,
          })
        const hasDurationSeconds = normalizeDurationSeconds(normalizedCachedMeta?.durationSeconds) != null
        const hasPreloadedFormats = Boolean(normalizedCachedMeta?.preloadedFormats)
        const shouldRefreshPrefetch = !hasDurationSeconds || !hasPreloadedFormats
        const hydratedCachedMeta = normalizeDownloaderMeta({
          ...normalizedCachedMeta,
          durationLoading: !hasDurationSeconds,
          durationResolved: hasDurationSeconds ? true : normalizedCachedMeta?.durationResolved,
        })

        setMeta(hydratedCachedMeta)
        setFetchError(null)
        setLoading(false)

        startNoembedFetch(effectiveService, normalizedUrlParam, cachedRequestId)
        if (shouldRefreshPrefetch) {
          startFormatsPrefetch(normalizedUrlParam, cachedRequestId)
        }
        return
      }

      if (hasMatchingCachedError) {
        invalidateActiveMetaRequest()
        activeSourceUrlRef.current = normalizedUrlParam
        setMeta(null)
        setFetchError(cachedError)
        setLoading(false)
        return
      }

      setFetchError(null)

      if (isLikelyValidUrlFor(effectiveService, normalizedUrlParam)) {
        setTimeout(() => handleFetch(normalizedUrlParam), 0)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSearch, routeToken, runtimeState, serviceFromQuery, serviceKey, tabsReady])

  React.useEffect(() => {
    const routeParams = new URLSearchParams(routeSearch)
    const urlParam = routeParams.get('source') || routeParams.get('url')
    if (!urlParam) {
      invalidateActiveMetaRequest()
      activeSourceUrlRef.current = ''
      if (meta) setMeta(null)
      if (value) setValue('')
      if (fetchError) setFetchError(null)
      if (loading) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeToken, resolvedServiceKey, routeSearch])

  React.useEffect(() => {
    if (!tabsReady || loading || meta || fetchError || !value.trim()) return

    const trimmedValue = value.trim()
    const valueService = detectService(trimmedValue) || resolvedServiceKey
    if (!isLikelyValidUrlFor(valueService, trimmedValue)) return

    const timer = setTimeout(() => {
      handleFetch(trimmedValue)
    }, 250)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabsReady, value, resolvedServiceKey])

  const loadingShellMeta = React.useMemo(() => ({
    thumbnail: '',
    title: '',
    author: '',
    duration: null,
    durationSeconds: null,
    preloadedFormats: null,
    durationLoading: true,
    durationResolved: false,
    url: queryUrl || value || '',
  }), [queryUrl, value])

  React.useEffect(() => {
    if (meta) {
      setValue('')
    }
  }, [meta])

  React.useEffect(() => {
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

    if (value && value.length > 0) {
      setFading(false)
      return () => { }
    }

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
  }, [value, resolvedServiceKey, cfg.examples])

  const handleFetch = (urlOverride) => {
    const target = (urlOverride ?? value).trim()
    const targetService = detectService(target) || resolvedServiceKey || 'generic'
    if (!isLikelyValidUrlFor(targetService, target) || loading) return

    const requestId = activeMetaRequestRef.current + 1
    activeMetaRequestRef.current = requestId
    activeSourceUrlRef.current = target

    setLoading(true)
    setMeta(null)
    setFetchError(null)

    const baseMeta = normalizeDownloaderMeta({
      ...toMetaModel(targetService, target, null),
      duration: null,
      durationSeconds: null,
      preloadedFormats: null,
      durationLoading: true,
      durationResolved: false,
    })

    setMeta(baseMeta)
    setLoading(false)

    startNoembedFetch(targetService, target, requestId)
    startFormatsPrefetch(target, requestId)
  }

  const basePath = '/'

  const closeInterface = () => {
    invalidateActiveMetaRequest()
    activeSourceUrlRef.current = ''
    setLoading(false)
    setMeta(null)
    setValue('')
    onNavigate?.(basePath, '')
  }

  const handleFetchError = React.useCallback((url, message) => {
    const normalizedUrl = String(url || '').trim()
    const activeSourceUrl = String(activeSourceUrlRef.current || '').trim()
    if (normalizedUrl && activeSourceUrl && normalizedUrl !== activeSourceUrl) {
      return
    }

    invalidateActiveMetaRequest()
    activeSourceUrlRef.current = normalizedUrl || activeSourceUrl

    setLoading(false)
    setMeta(null)
    setFetchError({ url: normalizedUrl, message })
  }, [invalidateActiveMetaRequest])

  const closeError = () => {
    invalidateActiveMetaRequest()
    activeSourceUrlRef.current = ''
    setLoading(false)
    setFetchError(null)
    onNavigate?.(basePath, '')
  }

  const retryError = () => {
    const url = fetchError?.url
    invalidateActiveMetaRequest()
    activeSourceUrlRef.current = String(url || '').trim()
    setFetchError(null)
    const retryService = detectService(url) || resolvedServiceKey || 'generic'
    onNavigate?.(basePath, `?service=${encodeURIComponent(retryService)}&source=${encodeURIComponent(url)}`)
  }

  const openCookieSettings = React.useCallback(() => {
    openSettingsModal('yt-dlp', 'cookies')
  }, [])

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

  React.useEffect(() => {
    onTabStateChange?.({
      loading: Boolean(loading && !fetchError),
    })
  }, [loading, fetchError, onTabStateChange])

  React.useEffect(() => {
    if (!tabsReady) return

    const runtimePayload = {
      sourceUrl: String(queryUrl || meta?.url || fetchError?.url || '').trim(),
      sourceServiceKey: resolvedServiceKey,
      inputValue: String(value || '').trim(),
      meta: meta ? {
        ...meta,
        preloadedFormats: meta.preloadedFormats || null,
      } : null,
      fetchError: fetchError ? {
        url: String(fetchError.url || '').trim(),
        message: String(fetchError.message || '').trim(),
      } : null,
    }

    const serialized = JSON.stringify(runtimePayload)
    if (serialized === lastRuntimePayloadRef.current) return
    lastRuntimePayloadRef.current = serialized

    onTabStateChange?.({
      downloaderCache: runtimePayload,
    })
  }, [fetchError, meta, onTabStateChange, queryUrl, resolvedServiceKey, tabsReady, value])

  React.useEffect(() => () => {
    invalidateActiveMetaRequest()
    activeSourceUrlRef.current = ''
    onTabStateChange?.({
      loading: false,
      download: {
        active: false,
        progress: 0,
        stage: '',
        title: '',
      },
    })
  }, [invalidateActiveMetaRequest, onTabStateChange])

  React.useEffect(() => {
    if (!meta && !loading && !fetchError) {
      const id = setTimeout(() => {
        if (inputRef.current) {
          try {
            inputRef.current.focus()
            if (inputRef.current.select && (value?.length || 0) > 0) {
              inputRef.current.select()
            }
          } catch { }
        }
      }, 0)
      return () => clearTimeout(id)
    }
  }, [meta, serviceKey, loading, fetchError, value])

  const hasRouteUrl = Boolean(queryUrl)
  const routeService = detectService(queryUrl) || resolvedServiceKey
  const hasValidRouteUrl = hasRouteUrl && isLikelyValidUrlFor(routeService, queryUrl)
  const showLanding = !meta && !fetchError && !hasValidRouteUrl
  const showLoadingShell = !meta && !fetchError && hasValidRouteUrl
  const downloaderScrollNodeProps = React.useMemo(() => (
    showLanding
      ? {
          style: {
            overflowX: 'hidden',
            overflowY: 'hidden',
          },
        }
      : {
          style: {
            overflowX: 'hidden',
          },
        }
  ), [showLanding])

  return (
    <SimpleBarScrollArea
      sx={{ position: 'relative', height: '100%' }}
      hideHorizontal
      scrollableNodeProps={downloaderScrollNodeProps}
    >
      <DownloaderLanding
        showLanding={showLanding}
        cfg={cfg}
        idx={idx}
        value={value}
        setValue={setValue}
        loading={loading}
        inputRef={inputRef}
        fading={fading}
        fadeMs={FADE_MS}
        onFetch={handleFetch}
        i18nT={i18nT}
      />

      {(meta || showLoadingShell) && (
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
            meta={meta || loadingShellMeta}
            onClose={closeInterface}
            serviceKey={resolvedServiceKey}
            onFetchError={handleFetchError}
            onDownloadStateChange={handleDownloadStateChange}
            loadingState={showLoadingShell}
            autostartFormat={autostartFormat}
          />
        </Box>
      )}

      {fetchError && (
        <FetchErrorPanel
          fetchError={fetchError}
          closeError={closeError}
          retryError={retryError}
          onOpenCookieSettings={openCookieSettings}
          i18nT={i18nT}
        />
      )}
    </SimpleBarScrollArea>
  )
}
