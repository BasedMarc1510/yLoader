import React from 'react'
import { Film, Image, Music2 } from 'lucide-react'
import { GENERIC_SERVICE_KEY, getApiBase, normalizeServiceKey } from '../../utils/metadata'
import { formatYtDlpErrorMessage } from '../../utils/ytDlpErrorPresentation'
import { readSseEventsFromResponse } from '../../utils/sse'
import {
  appendUrlQueryParam,
  DIRECT_DOWNLOAD_FORMAT_OPTIONS,
  getSearchEntryIdentity,
  resolvePreviewEmbedPayload,
  toHttpUrl,
  triggerBrowserDownload,
} from './searchUtils'

export default function useSearchQuickDownload({
  actionEntry,
  closeDownloadDropdown,
  getServiceLabel,
  lastService,
  showNotification,
  t,
}) {
  const quickDownloadResetTimerRef = React.useRef(null)
  const pendingElectronDownloadRef = React.useRef(null)
  const [embedPreview, setEmbedPreview] = React.useState(null)
  const [quickDownloadState, setQuickDownloadState] = React.useState(null)

  const isQuickDownloadActive = Boolean(quickDownloadState?.active)

  const handleDownloadQuick = React.useCallback(async (requestedFormat) => {
    const format = String(requestedFormat || '').trim().toLowerCase()
    if (!DIRECT_DOWNLOAD_FORMAT_OPTIONS.includes(format)) return
    if (!actionEntry || isQuickDownloadActive) return

    closeDownloadDropdown()

    const entryId = getSearchEntryIdentity(actionEntry)
    const sourceUrl = toHttpUrl(actionEntry?.url)
    const serviceValue = normalizeServiceKey(actionEntry?.service || lastService) || GENERIC_SERVICE_KEY
    const title = String(actionEntry?.title || actionEntry?.url || '').trim() || 'download'
    const uploader = String(actionEntry?.uploader || '').trim()
    const thumbnailUrl = String(actionEntry?.thumbnail || '').trim()

    if (!sourceUrl) {
      showNotification(t('search.errorGeneric'), 'error')
      return
    }

    if (format === 'thumbnail' && !toHttpUrl(thumbnailUrl)) {
      showNotification(t('search.quickThumbnailMissing'), 'warning')
      return
    }

    if (quickDownloadResetTimerRef.current) {
      clearTimeout(quickDownloadResetTimerRef.current)
      quickDownloadResetTimerRef.current = null
    }
    if (pendingElectronDownloadRef.current?.fallbackTimeout) {
      clearTimeout(pendingElectronDownloadRef.current.fallbackTimeout)
    }
    pendingElectronDownloadRef.current = null

    setQuickDownloadState({
      active: true,
      entryId,
      format,
      progress: 2,
      stage: 'starting',
      title,
    })

    const apiBase = getApiBase()
    const streamEndpoint = format === 'thumbnail'
      ? '/api/download/thumbnail/stream'
      : '/api/download/stream'
    const payload = format === 'thumbnail'
      ? {
        url: sourceUrl,
        thumbnailUrl,
        format: 'jpg',
        videoTitle: title,
        service: serviceValue,
      }
      : {
        url: sourceUrl,
        service: serviceValue,
        type: format === 'mp3' ? 'audio' : 'video',
        format,
        videoTitle: title,
        metadata: format === 'mp3'
          ? {
            title,
            artist: uploader,
          }
          : undefined,
      }

    let streamError = ''
    let streamEndedAsFailed = false
    let completedPayload = null

    try {
      const response = await fetch(`${apiBase}${streamEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        if (format === 'thumbnail' && response.status === 404) {
          setQuickDownloadState((prev) => {
            if (!prev || prev.entryId !== entryId) return prev
            return {
              ...prev,
              progress: 86,
              stage: 'processing',
            }
          })

          completedPayload = {
            filename: `${title}.jpg`,
            directUrl: `${apiBase}/api/proxy-image?url=${encodeURIComponent(thumbnailUrl)}&filename=${encodeURIComponent(title)}&format=jpg`,
          }
        } else {
          let errorPayload = null
          try {
            errorPayload = await response.json()
          } catch {
            errorPayload = null
          }
          const message = formatYtDlpErrorMessage(t, errorPayload || `HTTP ${response.status}`, {
            fallbackKey: 'search.errorGeneric',
            includeRawForUnknown: true,
          })
          throw new Error(message)
        }
      } else {
        await readSseEventsFromResponse(response, (eventName, rawData) => {
          if (eventName === 'progress') {
            try {
              const data = JSON.parse(String(rawData || '{}'))
              const numericPercent = Number(data?.percent)
              const percent = Number.isFinite(numericPercent) ? Math.max(0, Math.min(100, numericPercent)) : 0
              setQuickDownloadState((prev) => {
                if (!prev || prev.entryId !== entryId) return prev
                return {
                  ...prev,
                  progress: percent,
                  stage: String(data?.stage || prev.stage || 'downloading'),
                }
              })
            } catch {
              // ignore malformed progress payloads
            }
            return
          }

          if (eventName === 'complete') {
            try {
              const data = JSON.parse(String(rawData || '{}'))
              completedPayload = data && typeof data === 'object' ? data : null
            } catch {
              completedPayload = null
            }
            return
          }

          if (eventName === 'error') {
            const parsed = (() => {
              try {
                return JSON.parse(String(rawData || '{}'))
              } catch {
                return rawData
              }
            })()
            streamError = formatYtDlpErrorMessage(t, parsed, {
              fallbackKey: 'search.errorGeneric',
              includeRawForUnknown: true,
            })
            return
          }

          if (eventName === 'end') {
            const endState = String(rawData || '').trim().toLowerCase()
            if (endState === 'failed') {
              streamEndedAsFailed = true
            }
          }
        })
      }

      if (streamError) {
        throw new Error(streamError)
      }
      if (streamEndedAsFailed || (!completedPayload?.url && !completedPayload?.directUrl)) {
        throw new Error(t('search.errorGeneric'))
      }

      const filename = String(completedPayload.filename || '').trim() || `${title}.${format === 'thumbnail' ? 'jpg' : format}`
      const directUrl = String(completedPayload.directUrl || '').trim()
      const resolvedDownloadUrl = directUrl || `${apiBase}${String(completedPayload.url || '').trim()}`
      if (!resolvedDownloadUrl) {
        throw new Error(t('search.errorGeneric'))
      }

      const runtime = (typeof window !== 'undefined' && window.yloaderRuntime) ? window.yloaderRuntime : null
      const isElectronRuntime = Boolean(runtime?.isElectron)
      const quickToken = isElectronRuntime
        ? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
        : ''
      const downloadUrl = quickToken
        ? appendUrlQueryParam(resolvedDownloadUrl, 'quickToken', quickToken)
        : resolvedDownloadUrl

      setQuickDownloadState((prev) => {
        if (!prev || prev.entryId !== entryId) return prev
        return {
          ...prev,
          progress: 100,
          stage: 'saving',
        }
      })

      if (isElectronRuntime) {
        const fallbackTimeout = setTimeout(() => {
          const pending = pendingElectronDownloadRef.current
          if (!pending || pending.sourceUrl !== downloadUrl) return
          pendingElectronDownloadRef.current = null
          setQuickDownloadState(null)
          showNotification(t('search.quickDownloadCompleted', { filename }), 'success')
        }, 12000)

        pendingElectronDownloadRef.current = {
          sourceUrl: downloadUrl,
          filename,
          fallbackTimeout,
        }
      } else {
        quickDownloadResetTimerRef.current = setTimeout(() => {
          setQuickDownloadState(null)
          showNotification(t('search.quickDownloadCompleted', { filename }), 'success')
        }, 500)
      }

      triggerBrowserDownload(downloadUrl, filename)
    } catch (error) {
      const message = String(error?.message || t('search.errorGeneric')).trim() || t('search.errorGeneric')
      showNotification(message, 'error')
      setQuickDownloadState(null)

      if (pendingElectronDownloadRef.current?.fallbackTimeout) {
        clearTimeout(pendingElectronDownloadRef.current.fallbackTimeout)
      }
      pendingElectronDownloadRef.current = null
    }
  }, [actionEntry, closeDownloadDropdown, isQuickDownloadActive, lastService, showNotification, t])

  const handleCloseEmbedPreview = React.useCallback(() => {
    setEmbedPreview(null)
  }, [])

  const handleOpenEmbedPreview = React.useCallback((entry) => {
    const previewPayload = resolvePreviewEmbedPayload(entry, lastService, getServiceLabel)
    if (!previewPayload) return
    setEmbedPreview(previewPayload)
  }, [getServiceLabel, lastService])

  React.useEffect(() => {
    const runtime = (typeof window !== 'undefined' && window.yloaderRuntime) ? window.yloaderRuntime : null
    const subscribeDownloadCompleted = runtime?.downloads?.onDownloadCompleted
    if (typeof subscribeDownloadCompleted !== 'function') return undefined

    return subscribeDownloadCompleted((payload) => {
      const pending = pendingElectronDownloadRef.current
      if (!pending) return

      const payloadSourceUrl = String(payload?.sourceUrl || '').trim()
      if (pending.sourceUrl && payloadSourceUrl && pending.sourceUrl !== payloadSourceUrl) {
        const payloadFilename = String(payload?.filename || '').trim().toLowerCase()
        const pendingFilename = String(pending.filename || '').trim().toLowerCase()
        if (!payloadFilename || !pendingFilename || payloadFilename !== pendingFilename) return
      }

      if (pending.fallbackTimeout) {
        clearTimeout(pending.fallbackTimeout)
      }
      pendingElectronDownloadRef.current = null

      const state = String(payload?.state || '').trim().toLowerCase()
      if (state === 'cancelled') {
        setQuickDownloadState(null)
        showNotification(t('search.quickDownloadCancelled'), 'warning')
        return
      }
      if (state !== 'completed') return

      const filename = String(payload?.filename || pending.filename || '').trim() || pending.filename || ''
      const savePath = String(payload?.savePath || '').trim()
      const revealFile = runtime?.downloads?.revealFile
      setQuickDownloadState(null)

      if (savePath && typeof revealFile === 'function') {
        showNotification(t('search.quickDownloadCompleted', { filename }), 'success', {
          actionLabel: t('search.openDownloadedFile'),
          onAction: async () => {
            await revealFile(savePath)
          },
        })
        return
      }

      showNotification(t('search.quickDownloadCompleted', { filename }), 'success')
    })
  }, [showNotification, t])

  React.useEffect(() => () => {
    if (quickDownloadResetTimerRef.current) {
      clearTimeout(quickDownloadResetTimerRef.current)
      quickDownloadResetTimerRef.current = null
    }
    if (pendingElectronDownloadRef.current?.fallbackTimeout) {
      clearTimeout(pendingElectronDownloadRef.current.fallbackTimeout)
    }
    pendingElectronDownloadRef.current = null
  }, [])

  const quickDownloadOptions = React.useMemo(() => ([
    {
      key: 'mp4',
      label: t('search.downloadFormat', { format: 'MP4' }),
      icon: Film,
    },
    {
      key: 'mp3',
      label: t('search.downloadFormat', { format: 'MP3' }),
      icon: Music2,
    },
    {
      key: 'thumbnail',
      label: t('search.downloadThumbnail'),
      icon: Image,
    },
  ]), [t])

  const activeQuickDownloadFormat = String(quickDownloadState?.format || '').trim().toLowerCase()
  const activeQuickDownloadProgress = Number.isFinite(Number(quickDownloadState?.progress))
    ? Math.max(0, Math.min(100, Number(quickDownloadState.progress)))
    : 0
  const quickDownloadTitle = String(quickDownloadState?.title || '').trim()

  const quickDownloadFormatLabel = React.useMemo(() => {
    if (activeQuickDownloadFormat === 'mp4') return t('search.downloadFormat', { format: 'MP4' })
    if (activeQuickDownloadFormat === 'mp3') return t('search.downloadFormat', { format: 'MP3' })
    if (activeQuickDownloadFormat === 'thumbnail') return t('search.downloadThumbnail')
    return t('search.download')
  }, [activeQuickDownloadFormat, t])

  const quickDownloadStageLabel = React.useMemo(() => {
    const stage = String(quickDownloadState?.stage || '').trim().toLowerCase()
    if (stage === 'starting') return t('search.quickDownloadStageStarting')
    if (stage === 'downloading') return t('search.quickDownloadStageDownloading')
    if (stage === 'processing') return t('search.quickDownloadStageProcessing')
    if (stage === 'saving') return t('search.quickDownloadStageSaving')
    if (stage === 'complete') return t('search.quickDownloadStageComplete')
    return t('search.quickDownloadStageWorking')
  }, [quickDownloadState?.stage, t])

  return {
    activeQuickDownloadProgress,
    embedPreview,
    handleCloseEmbedPreview,
    handleDownloadQuick,
    handleOpenEmbedPreview,
    isQuickDownloadActive,
    quickDownloadFormatLabel,
    quickDownloadOptions,
    quickDownloadStageLabel,
    quickDownloadTitle,
  }
}
