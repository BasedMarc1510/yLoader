import React from 'react'
import { Film, Image, Music2 } from 'lucide-react'
import { GENERIC_SERVICE_KEY, getApiBase, normalizeServiceKey } from '../../utils/metadata'
import { formatYtDlpErrorMessage } from '../../utils/ytDlpErrorPresentation'
import { readSseEventsFromResponse } from '../../utils/sse'
import { resolveDesktopDownloadDestination } from '../../utils/desktopDownloadDestination'
import {
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

    setQuickDownloadState({
      active: true,
      entryId,
      format,
      progress: 2,
      stage: 'starting',
      title,
    })

    const apiBase = getApiBase()
    const runtime = window.yloaderRuntime
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
      if (runtime?.kind === 'tauri') {
        const extension = format === 'thumbnail' ? 'jpg' : format
        const destination = await resolveDesktopDownloadDestination({
          apiBase,
          downloadType: format === 'thumbnail' ? 'thumbnail' : payload.type,
          suggestedFilename: `${title}.${extension}`,
        })
        if (destination.canceled) {
          setQuickDownloadState(null)
          return
        }
        payload.desktopSavePath = destination.desktopSavePath
        payload.desktopTargetDirectory = destination.desktopTargetDirectory
        payload.desktopAllowOverwrite = Boolean(destination.desktopSavePath)
      }
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
      if (runtime?.kind === 'tauri' && !streamEndedAsFailed && completedPayload?.savePath) {
        setQuickDownloadState(null)
        showNotification(t('search.quickDownloadCompleted', { filename: completedPayload.filename }), 'success', {
          actionLabel: t('search.openDownloadedFile'),
          onAction: () => runtime.downloads.revealFile(completedPayload.savePath),
        })
        return
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

      setQuickDownloadState((prev) => {
        if (!prev || prev.entryId !== entryId) return prev
        return {
          ...prev,
          progress: 100,
          stage: 'saving',
        }
      })

      quickDownloadResetTimerRef.current = setTimeout(() => {
        setQuickDownloadState(null)
        showNotification(t('search.quickDownloadCompleted', { filename }), 'success')
      }, 500)
      triggerBrowserDownload(resolvedDownloadUrl, filename)
    } catch (error) {
      const message = String(error?.message || t('search.errorGeneric')).trim() || t('search.errorGeneric')
      showNotification(message, 'error')
      setQuickDownloadState(null)

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

  React.useEffect(() => () => {
    if (quickDownloadResetTimerRef.current) {
      clearTimeout(quickDownloadResetTimerRef.current)
      quickDownloadResetTimerRef.current = null
    }
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
