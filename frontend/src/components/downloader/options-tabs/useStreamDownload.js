import React from 'react'
import { getApiBase, normalizeUrlForNoembed, resolveServiceKey } from '../../../utils/metadata'
import {
  formatYtDlpErrorMessage,
  shouldSuggestCookieSettings,
} from '../../../utils/ytDlpErrorPresentation'
import {
  buildSuggestedDownloadFilename,
  resolveElectronDownloadDestination,
} from '../../../utils/electronDownloadDestination'
import {
  getPathDirectory,
  getPathFilename,
  resolveFullPathValue,
} from '../../../utils/downloadPathInput'

const METADATA_PLACEHOLDER_VALUES = new Set([
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
  '-',
])

function sanitizeMetadataValue(value, maxLen = 180) {
  const normalized = String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)

  if (!normalized) return ''

  const lowered = normalized.toLowerCase()
  if (METADATA_PLACEHOLDER_VALUES.has(lowered)) return ''

  return normalized
}

function buildAudioMetadataPayload({
  titleValue,
  artistValue,
  albumValue,
  fallbackTitle,
  fallbackArtist,
}) {
  const title = sanitizeMetadataValue(titleValue, 220) || sanitizeMetadataValue(fallbackTitle, 220)
  const artist = sanitizeMetadataValue(artistValue, 220) || sanitizeMetadataValue(fallbackArtist, 220)
  const album = sanitizeMetadataValue(albumValue, 220)

  return {
    title,
    artist,
    album,
    hasAny: Boolean(title || artist || album),
  }
}

function resolveExpectedElectronSavePath(rawPath, extension, fallbackBaseName = 'download') {
  const input = String(rawPath || '').trim()
  if (!input) return ''

  return resolveFullPathValue({
    inputValue: input,
    defaultDirectory: getPathDirectory(input),
    fallbackBaseName,
    extension,
  })
}

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
  confirmOverwriteInApp,
  onOpenCookieSettings,
}) {
  const [downloading, setDownloading] = React.useState(false)
  const [downloadProgress, setDownloadProgress] = React.useState(0)
  const [downloadStage, setDownloadStage] = React.useState('')
  const [activeDownloadType, setActiveDownloadType] = React.useState('')

  const resolvedDownloadTitle = React.useMemo(() => {
    const typeScopedFilename = activeDownloadType === 'video'
      ? videoFilenameValue
      : audioFilenameValue

    const scopedRawValue = String(typeScopedFilename || '').trim()
    const scopedLooksLikePath = /[\\/]/.test(scopedRawValue)
    const scopedFileName = scopedLooksLikePath
      ? String(getPathFilename(scopedRawValue) || '').trim()
      : scopedRawValue

    const cleanScopedTitle = sanitizeMetadataValue(
      scopedFileName.replace(/\.[^/.\\]+$/, ''),
      180,
    )
    const fallbackTitle = sanitizeMetadataValue(titleValue || videoTitle || '', 180)

    return scopedLooksLikePath
      ? fallbackTitle
      : (cleanScopedTitle || fallbackTitle)
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

  const notifyDownloadError = React.useCallback((message, options = {}) => {
    const normalizedMessage = String(message || '').trim()
    if (!normalizedMessage) return

    const actions = Array.isArray(options?.actions)
      ? [...options.actions]
      : []

    if (
      shouldSuggestCookieSettings(normalizedMessage, { i18nT })
      && typeof onOpenCookieSettings === 'function'
    ) {
      const cookieActionLabel = i18nT('downloader.cookieSettingsAction')
      const hasCookieAction = actions.some(
        (action) => String(action?.label || '').trim() === String(cookieActionLabel || '').trim()
      )

      if (!hasCookieAction) {
        actions.push({
          id: 'open-cookie-settings',
          label: cookieActionLabel,
          onClick: onOpenCookieSettings,
          autoClose: false,
        })
      }
    }

    showNotification(normalizedMessage, 'error', {
      duration: Number.isFinite(Number(options?.duration))
        ? Number(options.duration)
        : 7000,
      persistent: Boolean(options?.persistent),
      startTimerOnFocus: options?.startTimerOnFocus !== false,
      actions,
    })
  }, [i18nT, onOpenCookieSettings, showNotification])

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
      notifyDownloadError(i18nT('downloader.errorVideoThumbUnavailable'), { persistent: true })
      return
    }

    if (type === 'audio' && coverEmbedEnabled && effectiveCoverSource === 'upload' && !effectiveCoverUpload?.dataUrl) {
      notifyDownloadError(i18nT('downloader.errorSelectCover'), { persistent: true })
      return
    }

    setActiveDownloadType(type)
    setDownloading(true)
    setDownloadProgress(0)
    setDownloadStage('starting')

    let completed = false
    let finalized = false

    try {
      const apiBase = getApiBase()
      const normalized = normalizeUrlForNoembed(videoUrl)
      const selectedCuts = type === 'audio' ? audioCutsData : videoCutsData
      const numericDurationSeconds = Number(durationSeconds)
      const hasDurationSeconds = Number.isFinite(numericDurationSeconds) && numericDurationSeconds > 0
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

      const cutsPayload = selectedCuts?.enabled && hasDurationSeconds
        ? {
          enabled: true,
          mode: selectedCuts?.mode === 'keep' ? 'keep' : 'remove',
          trimStart: selectedCuts?.trimStart ?? 0,
          trimEnd: selectedCuts?.trimEnd ?? numericDurationSeconds,
          segments: normalizedSegments,
          removals: normalizedRemovals,
        }
        : undefined

      const scopedFilename = type === 'video' ? videoFilenameValue : audioFilenameValue
      const suggestedExtension = type === 'video'
        ? String(videoContainer || 'mp4')
        : String(audioContainer || 'mp3')
      const normalizedVideoTitle = sanitizeMetadataValue(
        scopedFilename || titleValue || videoTitle || 'download',
        220,
      ) || 'download'
      const audioMetadataPayload = type === 'audio'
        ? buildAudioMetadataPayload({
          titleValue,
          artistValue,
          albumValue,
          fallbackTitle: normalizedVideoTitle,
          fallbackArtist: videoAuthor,
        })
        : null
      const suggestedFilename = buildSuggestedDownloadFilename(
        normalizedVideoTitle,
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
          notifyDownloadError(message, { persistent: true })
          return
        }

        const directoryToValidate = String(getPathDirectory(resolvedPathValue) || preferredDirectory).trim()
        if (!directoryToValidate) {
          const message = i18nT('downloader.errorDownloadPathInvalid', { path: resolvedPathValue })
          notifyDownloadError(message, { persistent: true })
          return
        }

        const canValidateDirectory = typeof runtime?.downloads?.validateDirectory === 'function'
        if (canValidateDirectory) {
          try {
            const validation = await runtime.downloads.validateDirectory(directoryToValidate)
            if (!validation?.valid) {
              const message = resolvePathValidationMessage(i18nT, validation, directoryToValidate)
              notifyDownloadError(message, { persistent: true })
              return
            }
          } catch {
            const message = i18nT('downloader.errorDownloadPathInvalid', { path: directoryToValidate })
            notifyDownloadError(message, { persistent: true })
            return
          }
        }

        manualElectronSavePath = resolvedPathValue
      }

      const payload = {
        url: normalized,
        service: resolveServiceKey(serviceKey, normalized),
        type,
        duration: hasDurationSeconds ? numericDurationSeconds : null,
        videoTitle: normalizedVideoTitle,
        videoAuthor: sanitizeMetadataValue(videoAuthor, 220),
        format: type === 'video' ? videoContainer : (type === 'audio' ? audioContainer : undefined),
        audioFormat: type === 'audio' ? selectedAudioFormat : undefined,
        videoFormat: type === 'video' ? selectedVideoFormat : undefined,
        metadata: type === 'audio'
          ? (audioMetadataPayload?.hasAny
            ? {
              title: audioMetadataPayload.title,
              artist: audioMetadataPayload.artist,
              album: audioMetadataPayload.album,
            }
            : undefined)
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
        videoCuts: type === 'video' && videoCutsData?.enabled && hasDurationSeconds
          ? {
            enabled: true,
            trimStart: videoCutsData.trimStart ?? 0,
            trimEnd: videoCutsData.trimEnd ?? numericDurationSeconds,
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

        const overwriteTargetPath = payload.electronSavePath
          ? resolveExpectedElectronSavePath(
            payload.electronSavePath,
            suggestedExtension,
            normalizedVideoTitle,
          )
          : ''

        if (overwriteTargetPath && typeof runtime?.downloads?.validateFile === 'function') {
          let overwriteValidation = null
          try {
            overwriteValidation = await runtime.downloads.validateFile(overwriteTargetPath)
          } catch {
            overwriteValidation = null
          }

          const overwriteTargetExists = Boolean(overwriteValidation?.exists)
          const overwriteTargetIsFile = Boolean(overwriteValidation?.isFile)

          if (overwriteTargetExists && !overwriteTargetIsFile) {
            const message = i18nT('downloader.errorDownloadPathInvalid', { path: overwriteTargetPath })
            notifyDownloadError(message, { persistent: true })
            return
          }

          if (overwriteTargetExists && overwriteTargetIsFile) {
            const overwriteFilename = String(getPathFilename(overwriteTargetPath) || '').trim() || overwriteTargetPath
            let overwriteAction = 'cancel'

            if (typeof confirmOverwriteInApp === 'function') {
              try {
                const overwriteResult = await confirmOverwriteInApp({
                  path: overwriteTargetPath,
                  title: i18nT('downloader.confirmOverwriteTitle'),
                  message: i18nT('downloader.confirmOverwriteMessage', { filename: overwriteFilename }),
                  detail: i18nT('downloader.confirmOverwriteDetail'),
                  replaceLabel: i18nT('downloader.confirmOverwriteReplace'),
                  keepLabel: i18nT('downloader.confirmOverwriteKeep'),
                  cancelLabel: i18nT('downloader.confirmOverwriteCancel'),
                })
                overwriteAction = String(overwriteResult || '').trim().toLowerCase()
              } catch {
                overwriteAction = 'cancel'
              }
            }

            if (overwriteAction !== 'replace') {
              return
            }

            payload.electronAllowOverwrite = true
          }
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
          notifyDownloadError(msg)
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
            notifyDownloadError(msg)
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
      notifyDownloadError(msg)
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
    notifyDownloadError,
    audioDownloadTargetSettings,
    videoDownloadTargetSettings,
    confirmOverwriteInApp,
  ])

  return {
    downloading,
    downloadProgress,
    downloadStage,
    handleDownload,
  }
}
