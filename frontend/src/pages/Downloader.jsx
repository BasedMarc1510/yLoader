import React from 'react'
import { Box } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import DownloaderShell from '../components/downloader/DownloaderShell'
import { detectService, toMetaModel, isLikelyValidUrlFor, fetchFormats, normalizeServiceKey } from '../utils/metadata'
import { useI18n } from '../providers/I18nProvider'
import DownloaderLanding from './downloader/DownloaderLanding'
import FetchErrorPanel from './downloader/FetchErrorPanel'
import buildServices from './downloader/buildServices'
import { FADE_MS, HOLD_MS } from './downloader/constants'
import { formatYtDlpErrorMessage } from '../utils/ytDlpErrorPresentation'
import { openSettingsModal } from './home/settingsBridge'

export default function Downloader({
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
  const [meta, setMeta] = React.useState(null) // when set -> show downloader UI
  const [fetchError, setFetchError] = React.useState(null) // { url, message } when set -> show error panel
  const lastRuntimePayloadRef = React.useRef('')

  // Placeholder cycling (fade + hold)
  const [idx, setIdx] = React.useState(0)
  const [fading, setFading] = React.useState(false)
  const intervalRef = React.useRef(null)
  const timeoutRef = React.useRef(null)

  // Reset index when service changes
  React.useEffect(() => {
    setIdx(0)
  }, [resolvedServiceKey])

  // Read source URL param and prefill.
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

      setValue(normalizedUrlParam)

      if (hasMatchingCachedMeta) {
        setMeta(cachedMeta)
        setFetchError(null)
        setLoading(false)
        return
      }

      if (hasMatchingCachedError) {
        setMeta(null)
        setFetchError(cachedError)
        setLoading(false)
        return
      }

      setFetchError(null)
      const effectiveService = detectService(normalizedUrlParam) || serviceFromQuery || serviceKey || 'generic'

      // If a valid URL is provided via query, auto-fetch meta on mount.
      if (isLikelyValidUrlFor(effectiveService, normalizedUrlParam)) {
        // delay a tick so input shows value before spinner kicks in
        setTimeout(() => handleFetch(normalizedUrlParam), 0)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSearch, routeToken, runtimeState, serviceFromQuery, serviceKey, tabsReady])

  // Reset to input bar when navigating to the downloader base route (no source URL)
  // This also covers clicking the same downloader again in the sidebar.
  React.useEffect(() => {
    const params = new URLSearchParams(routeSearch)
    const urlParam = params.get('source') || params.get('url')
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
    if (!tabsReady || loading || meta || fetchError || !value.trim()) return

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
  }, [tabsReady, value, resolvedServiceKey])

  const loadingShellMeta = React.useMemo(() => ({
    thumbnail: '',
    title: '',
    author: '',
    duration: null,
    durationSeconds: null,
    preloadedFormats: null,
    url: queryUrl || value || '',
  }), [queryUrl, value])

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
      const formats = await fetchFormats(target)
      const model = toMetaModel(targetService, target, {
        title: formats?.title || '',
        author_name: formats?.author || '',
        provider_name: formats?.extractor || '',
        thumbnail_url: formats?.thumbnail || '',
      })
      model.duration = formats?.durationString || null
      model.durationSeconds = formats?.duration || null
      model.preloadedFormats = formats
      setMeta(model)
    } catch (e) {
      const message = formatYtDlpErrorMessage(i18nT, e?.payload || e?.message || e, {
        fallbackKey: 'downloader.errorDownloadFailed',
        includeRawForUnknown: true,
      })
      setFetchError({ url: target, message })
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
    onTabStateChange?.({
      loading: false,
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
  const routeService = detectService(queryUrl) || resolvedServiceKey
  const hasValidRouteUrl = hasRouteUrl && isLikelyValidUrlFor(routeService, queryUrl)
  const showLanding = !meta && !fetchError && !hasValidRouteUrl
  const showLoadingShell = !meta && !fetchError && hasValidRouteUrl

  return (
    <Box
      className="yl-native-scroll"
      sx={{ position: 'relative', height: '100%', overflowX: 'hidden', overflowY: showLanding ? 'hidden' : 'auto' }}
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

      {/* Downloader UI (appears after metadata is loaded) */}
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
    </Box>
  )
}
