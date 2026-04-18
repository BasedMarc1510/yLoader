import React from 'react'
import { getApiBase, normalizeUrlForNoembed, resolveServiceKey } from '../../../utils/metadata'
import { formatYtDlpErrorMessage } from '../../../utils/ytDlpErrorPresentation'
import {
  buildSuggestedDownloadFilename,
  resolveElectronDownloadDestination,
} from '../../../utils/electronDownloadDestination'
import {
  getPathDirectory,
  getPathFilename,
  resolveFullPathValue,
} from '../../../utils/downloadPathInput'

function resolvePathValidationMessage(i18nT, validationResult, fallbackPath = '') {
  const resolvedPath = String(validationResult?.path || fallbackPath || '').trim()
  const exists = Boolean(validationResult?.exists)
  const isDirectory = Boolean(validationResult?.isDirectory)
  const writable = Boolean(validationResult?.writable)

  if (!exists) {
    return i18nT('downloader.errorDownloadPathMissing', { path: resolvedPath })
  }
  if (!isDirectory) {
    return i18nT('downloader.errorDownloadPathNotDirectory', { path: resolvedPath })
  }
  if (!writable) {
    return i18nT('downloader.errorDownloadPathNotWritable', { path: resolvedPath })
  }

  return i18nT('downloader.errorDownloadPathInvalid', { path: resolvedPath })
}

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
  coverVideoEdit,
  hasVideoThumbnail,
  audioDownloadTargetSettings,
  videoDownloadTargetSettings,
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

    const editedVideoCoverUpload = coverEmbedEnabled
      && coverSource === 'video'
      && coverVideoEdit?.dataUrl
      ? {
        name: coverVideoEdit.name || 'video-thumbnail-cover.jpg',
        type: coverVideoEdit.type || 'image/jpeg',
        dataUrl: coverVideoEdit.dataUrl,
      }
      : null

    const selectedUploadCover = coverEmbedEnabled
      && coverSource === 'upload'
      && coverUpload?.dataUrl
      ? {
        name: coverUpload.name || 'cover',
        type: coverUpload.type || '',
        dataUrl: coverUpload.dataUrl,
      }
      : null

    const effectiveCoverSource = editedVideoCoverUpload ? 'upload' : coverSource
    const effectiveCoverUpload = editedVideoCoverUpload || selectedUploadCover
    const effectiveCoverEnabled = coverEmbedEnabled
      && (effectiveCoverSource !== 'video' || hasVideoThumbnail)

    if (type === 'audio' && coverEmbedEnabled && effectiveCoverSource === 'video' && !hasVideoThumbnail) {
      setDownloadError(i18nT('downloader.errorVideoThumbUnavailable'))
      return
    }

    if (type === 'audio' && coverEmbedEnabled && effectiveCoverSource === 'upload' && !effectiveCoverUpload?.dataUrl) {
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
      const suggestedExtension = type === 'video'
        ? String(videoContainer || 'mp4')
        : String(audioContainer || 'mp3')
      const suggestedFilename = buildSuggestedDownloadFilename(
        scopedFilename || titleValue || videoTitle || 'download',
        suggestedExtension,
      )
      const runtime = typeof window !== 'undefined' ? window.yloaderRuntime : null
      const isElectronRuntime = Boolean(runtime?.isElectron)
      const resolvedDownloadTargetSettings = type === 'video'
        ? videoDownloadTargetSettings
        : audioDownloadTargetSettings
      const preferredDirectory = String(
        resolvedDownloadTargetSettings?.directoryPath || runtime?.downloadsPath || ''
      ).trim()
      const usesFixedPathMode = Boolean(
        isElectronRuntime
        && resolvedDownloadTargetSettings
        && resolvedDownloadTargetSettings.alwaysAsk === false
      )

      let manualElectronSavePath = ''

      if (usesFixedPathMode) {
        const fallbackBaseName = scopedFilename || titleValue || videoTitle || 'download'
        const resolvedPathValue = resolveFullPathValue({
          inputValue: scopedFilename,
          defaultDirectory: preferredDirectory,
          fallbackBaseName,
          extension: suggestedExtension,
        })
        const resolvedFilename = String(getPathFilename(resolvedPathValue) || '').trim()

        if (!resolvedFilename) {
          const message = i18nT('downloader.errorFilePathRequired')
          setDownloadError(message)
          showNotification(message, 'error')
          return
        }

        const directoryToValidate = String(getPathDirectory(resolvedPathValue) || preferredDirectory).trim()
        if (!directoryToValidate) {
          const message = i18nT('downloader.errorDownloadPathInvalid', { path: resolvedPathValue })
          setDownloadError(message)
          showNotification(message, 'error')
          return
        }

        const canValidateDirectory = typeof runtime?.downloads?.validateDirectory === 'function'
        if (canValidateDirectory) {
          try {
            const validation = await runtime.downloads.validateDirectory(directoryToValidate)
            if (!validation?.valid) {
              const message = resolvePathValidationMessage(i18nT, validation, directoryToValidate)
              setDownloadError(message)
              showNotification(message, 'error')
              return
            }
          } catch {
            const message = i18nT('downloader.errorDownloadPathInvalid', { path: directoryToValidate })
            setDownloadError(message)
            showNotification(message, 'error')
            return
          }
        }

        manualElectronSavePath = resolvedPathValue
      }

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
            enabled: effectiveCoverEnabled,
            source: effectiveCoverSource,
            upload: effectiveCoverEnabled && effectiveCoverSource === 'upload' && effectiveCoverUpload?.dataUrl
              ? effectiveCoverUpload
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

      const electronDestination = await resolveElectronDownloadDestination({
        apiBase,
        downloadType: type,
        suggestedFilename,
        preferredDirectory,
        targetSettings: resolvedDownloadTargetSettings,
      })

      if (electronDestination.enabled) {
        if (electronDestination.canceled) {
          return
        }

        if (usesFixedPathMode && manualElectronSavePath) {
          payload.electronSavePath = manualElectronSavePath
          payload.electronTargetDirectory = undefined
        } else {
          payload.electronSavePath = electronDestination.electronSavePath || undefined
          payload.electronTargetDirectory = electronDestination.electronTargetDirectory || undefined
        }
      }

      const response = await fetch(`${apiBase}/api/download/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let errorPayload = null
        try {
          errorPayload = await response.json()
        } catch {
          errorPayload = `HTTP ${response.status}`
        }
        const message = formatYtDlpErrorMessage(i18nT, errorPayload, {
          fallbackKey: 'downloader.errorDownloadFailed',
          includeRawForUnknown: true,
        })
        throw new Error(message)
      }

      if (!response.body) {
        throw new Error(i18nT('downloader.errorDownloadFailed'))
      }

      const processEvent = (eventName, rawData) => {
        const dataStr = String(rawData || '')

        if (eventName === 'error') {
          const msg = formatYtDlpErrorMessage(i18nT, rawData, {
            fallbackKey: 'downloader.errorDownloadFailed',
            includeRawForUnknown: true,
          })
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
            const filename = String(data?.filename || '').trim()
            const relativeUrl = String(data?.url || '').trim()
            const runtime = typeof window !== 'undefined' ? window.yloaderRuntime : null
            const isElectronRuntime = Boolean(runtime?.isElectron)

            if (!filename) return

            completed = true
            setDownloadProgress(100)
            setDownloadStage('complete')

            if (!isElectronRuntime && relativeUrl) {
              const a = document.createElement('a')
              a.href = `${apiBase}${relativeUrl}`
              a.download = filename
              document.body.appendChild(a)
              a.click()
              a.remove()
            }

            setTimeout(() => {
              setDownloading(false)
              setDownloadProgress(0)
              setDownloadStage('')
              setActiveDownloadType('')
            }, 1200)
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
      const directMessage = String(err?.message || '').trim()
      const msg = directMessage || formatYtDlpErrorMessage(i18nT, err, {
        fallbackKey: 'downloader.errorDownloadFailed',
        includeRawForUnknown: true,
      })
      setDownloadError(msg)
      showNotification(msg, 'error')
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
    coverVideoEdit,
    hasVideoThumbnail,
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
    audioDownloadTargetSettings,
    videoDownloadTargetSettings,
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
