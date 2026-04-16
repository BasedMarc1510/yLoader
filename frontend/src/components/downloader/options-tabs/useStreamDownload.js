import React from 'react'
import { getApiBase, normalizeUrlForNoembed, resolveServiceKey } from '../../../utils/metadata'

export default function useStreamDownload({
  i18nT,
  showNotification,
  onDownloadStateChange,
  videoUrl,
  serviceKey,
  durationSeconds,
  videoTitle,
  videoAuthor,
  audioFilenameValue,
  videoFilenameValue,
  titleValue,
  artistValue,
  albumValue,
  videoContainer,
  audioContainer,
  selectedAudioFormat,
  selectedVideoFormat,
  audioCutsData,
  videoCutsData,
  coverEmbedEnabled,
  coverSource,
  coverUpload,
}) {
  const [downloading, setDownloading] = React.useState(false)
  const [downloadProgress, setDownloadProgress] = React.useState(0)
  const [downloadStage, setDownloadStage] = React.useState('')
  const [downloadError, setDownloadError] = React.useState(null)
  const [activeDownloadType, setActiveDownloadType] = React.useState('')

  const resolvedDownloadTitle = React.useMemo(() => {
    const typeScopedFilename = activeDownloadType === 'video'
      ? videoFilenameValue
      : audioFilenameValue
    return String(typeScopedFilename || titleValue || videoTitle || '').trim().slice(0, 180)
  }, [activeDownloadType, audioFilenameValue, videoFilenameValue, titleValue, videoTitle])

  React.useEffect(() => {
    onDownloadStateChange?.({
      active: downloading,
      progress: downloading ? Math.round(downloadProgress || 0) : 0,
      stage: downloadStage || '',
      title: resolvedDownloadTitle,
    })
  }, [downloading, downloadProgress, downloadStage, resolvedDownloadTitle, onDownloadStateChange])

  React.useEffect(() => {
    return () => {
      onDownloadStateChange?.({
        active: false,
        progress: 0,
        stage: '',
        title: '',
      })
    }
  }, [onDownloadStateChange])

  const handleDownload = React.useCallback(async (type) => {
    if (downloading) return

    if (type === 'audio' && coverEmbedEnabled && coverSource === 'upload' && !coverUpload?.dataUrl) {
      setDownloadError(i18nT('downloader.errorSelectCover'))
      return
    }

    setActiveDownloadType(type)
    setDownloading(true)
    setDownloadProgress(0)
    setDownloadStage('starting')
    setDownloadError(null)

    let completed = false
    let finalized = false

    try {
      const apiBase = getApiBase()
      const normalized = normalizeUrlForNoembed(videoUrl)
      const selectedCuts = type === 'audio' ? audioCutsData : videoCutsData
      const normalizedSegments = Array.isArray(selectedCuts?.segments)
        ? selectedCuts.segments
            .filter((s) => typeof s?.start === 'number' && typeof s?.end === 'number' && s.end > s.start)
            .map((s) => ({ start: Math.max(0, s.start), end: Math.max(0, s.end) }))
        : []
      const normalizedRemovals = Array.isArray(selectedCuts?.removals)
        ? selectedCuts.removals
            .filter((s) => typeof s?.start === 'number' && typeof s?.end === 'number' && s.end > s.start)
            .map((s) => ({ start: Math.max(0, s.start), end: Math.max(0, s.end) }))
        : []

      const cutsPayload = selectedCuts?.enabled
        ? {
          enabled: true,
          mode: selectedCuts?.mode === 'keep' ? 'keep' : 'remove',
          trimStart: selectedCuts?.trimStart ?? 0,
          trimEnd: selectedCuts?.trimEnd ?? (durationSeconds || 0),
          segments: normalizedSegments,
          removals: normalizedRemovals,
        }
        : undefined

      const scopedFilename = type === 'video' ? videoFilenameValue : audioFilenameValue

      const payload = {
        url: normalized,
        service: resolveServiceKey(serviceKey, normalized),
        type,
        duration: durationSeconds,
        videoTitle: scopedFilename || titleValue || videoTitle,
        format: type === 'video' ? videoContainer : (type === 'audio' ? audioContainer : undefined),
        audioFormat: type === 'audio' ? selectedAudioFormat : undefined,
        videoFormat: type === 'video' ? selectedVideoFormat : undefined,
        metadata: type === 'audio'
          ? {
            title: titleValue || videoTitle,
            artist: artistValue || videoAuthor,
            album: albumValue,
          }
          : undefined,
        cover: type === 'audio'
          ? {
            enabled: coverEmbedEnabled,
            source: coverSource,
            upload: coverEmbedEnabled && coverSource === 'upload' && coverUpload?.dataUrl
              ? {
                name: coverUpload.name || 'cover',
                type: coverUpload.type || '',
                dataUrl: coverUpload.dataUrl,
              }
              : undefined,
          }
          : undefined,
        cuts: cutsPayload,
        audioCuts: type === 'audio' && cutsPayload && cutsPayload.mode !== 'keep'
          ? {
            enabled: true,
            trimStart: cutsPayload.trimStart,
            trimEnd: cutsPayload.trimEnd,
            removals: cutsPayload.removals,
          }
          : undefined,
        videoCuts: type === 'video' && videoCutsData?.enabled
          ? {
            enabled: true,
            trimStart: videoCutsData.trimStart ?? 0,
            trimEnd: videoCutsData.trimEnd ?? (durationSeconds || 0),
            removals: videoCutsData.removals ?? [],
          }
          : undefined,
      }

      const response = await fetch(`${apiBase}/api/download/stream`, {
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
          // keep fallback status
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
              a.href = `${apiBase}${data.url}`
              a.download = data.filename
              document.body.appendChild(a)
              a.click()
              a.remove()

              setTimeout(() => {
                setDownloading(false)
                setDownloadProgress(0)
                setDownloadStage('')
                setActiveDownloadType('')
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
      setDownloadError(err.message || i18nT('downloader.errorDownloadFailed'))
      showNotification(err.message || i18nT('downloader.errorDownloadFailed'), 'error')
    } finally {
      if (!completed) {
        setDownloading(false)
        setDownloadProgress(0)
        setDownloadStage('')
        setActiveDownloadType('')
      }
    }
  }, [
    downloading,
    coverEmbedEnabled,
    coverSource,
    coverUpload,
    i18nT,
    videoUrl,
    audioCutsData,
    videoCutsData,
    durationSeconds,
    serviceKey,
    audioFilenameValue,
    videoFilenameValue,
    titleValue,
    videoTitle,
    videoContainer,
    audioContainer,
    selectedAudioFormat,
    selectedVideoFormat,
    artistValue,
    videoAuthor,
    albumValue,
    showNotification,
  ])

  return {
    downloading,
    downloadProgress,
    downloadStage,
    downloadError,
    setDownloadError,
    handleDownload,
  }
}
