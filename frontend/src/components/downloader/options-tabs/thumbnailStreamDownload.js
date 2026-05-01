import { getApiBase, normalizeUrlForNoembed, resolveServiceKey } from '../../../utils/metadata'
import { formatYtDlpErrorMessage } from '../../../utils/ytDlpErrorPresentation'
import { appendDownloadDiagnostic, resolveDownloadDiagnosticMessage } from '../../../utils/downloadStreamDiagnostics'
import { buildSuggestedDownloadFilename, resolveElectronDownloadDestination } from '../../../utils/electronDownloadDestination'
import { getPathDirectory, getPathFilename, resolveFullPathValue } from '../../../utils/downloadPathInput'
import { resolveDownloadFilenamePattern } from '../../../utils/downloadSettings'
import { readSseEventsFromResponse } from '../../../utils/sse'

const METADATA_PLACEHOLDER_VALUES = new Set([
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
  '-',
])
const IMAGE_DOWNLOAD_FORMATS = new Set(['jpg', 'png', 'webp'])

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

function sanitizeHttpUrl(value, maxLen = 4096) {
  const normalized = String(value || '').trim().slice(0, maxLen)
  if (!normalized) return ''
  if (!/^https?:\/\//i.test(normalized)) return ''
  return normalized
}

function normalizeImageDownloadFormat(value, fallback = 'jpg') {
  const normalized = String(value || '').trim().toLowerCase().replace(/^jpeg$/, 'jpg')
  if (IMAGE_DOWNLOAD_FORMATS.has(normalized)) return normalized
  return fallback
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

export async function runThumbnailStreamDownload({
  i18nT,
  notifyDownloadError,
  emitDownloadEvent,
  setActiveDownloadType,
  setDownloading,
  setDownloadProgress,
  setDownloadStage,
  videoUrl,
  serviceKey,
  videoThumbnail,
  videoTitle,
  videoAuthor,
  titleValue,
  thumbnailFilenameValue,
  thumbnailFormat,
  thumbnailUrl,
  downloadSettings,
  thumbnailDownloadTargetSettings,
  forcedDownloadDirectory,
  confirmOverwriteInApp,
}) {
  const type = 'thumbnail'
  const apiBase = getApiBase()
  const normalized = normalizeUrlForNoembed(videoUrl)
  const resolvedThumbnailUrl = sanitizeHttpUrl(thumbnailUrl || videoThumbnail)

  if (!resolvedThumbnailUrl) {
    const message = i18nT('downloader.noThumbnailAvailable')
    notifyDownloadError(message, { persistent: true })
    emitDownloadEvent({ type: 'error', message, downloadType: type, sourceUrl: normalized || videoUrl })
    return false
  }

  const selectedFormat = normalizeImageDownloadFormat(thumbnailFormat, 'jpg')
  const normalizedVideoTitle = sanitizeMetadataValue(
    thumbnailFilenameValue || titleValue || videoTitle || 'thumbnail',
    220,
  ) || 'thumbnail'
  const resolvedServiceKey = resolveServiceKey(serviceKey, normalized || resolvedThumbnailUrl)
  const suggestedBaseName = resolveDownloadFilenamePattern({
    settings: downloadSettings,
    downloadType: type,
    title: normalizedVideoTitle,
    artist: videoAuthor || '',
    uploader: videoAuthor || '',
    service: resolvedServiceKey,
    sourceUrl: normalized || resolvedThumbnailUrl,
    fallbackBaseName: normalizedVideoTitle,
  })
  const suggestedFilename = buildSuggestedDownloadFilename(suggestedBaseName, selectedFormat)
  const runtime = typeof window !== 'undefined' ? window.yloaderRuntime : null
  const isElectronRuntime = Boolean(runtime?.isElectron)
  const normalizedForcedDownloadDirectory = String(forcedDownloadDirectory || '').trim()
  const hasForcedDownloadDirectory = Boolean(
    isElectronRuntime
    && normalizedForcedDownloadDirectory
  )
  const resolvedDownloadTargetSettings = hasForcedDownloadDirectory
    ? {
      directoryPath: normalizedForcedDownloadDirectory,
      alwaysAsk: false,
    }
    : thumbnailDownloadTargetSettings
  const preferredDirectory = String(
    (hasForcedDownloadDirectory
      ? normalizedForcedDownloadDirectory
      : (resolvedDownloadTargetSettings?.directoryPath || runtime?.downloadsPath || ''))
  ).trim()
  const usesFixedPathMode = Boolean(
    isElectronRuntime
    && resolvedDownloadTargetSettings
    && resolvedDownloadTargetSettings.alwaysAsk === false
  )

  setActiveDownloadType(type)
  setDownloading(true)
  setDownloadProgress(0)
  setDownloadStage('starting')

  let completed = false
  let finalized = false
  let completionPayload = null
  let recentDiagnostics = []
  let manualElectronSavePath = ''

  try {
    emitDownloadEvent({ type: 'start', downloadType: type, sourceUrl: normalized || resolvedThumbnailUrl })

    if (usesFixedPathMode) {
      const scopedRawValue = String(thumbnailFilenameValue || '').trim()
      const scopedLooksLikePath = /[\\/]/.test(scopedRawValue)
      const scopedResolvedName = scopedLooksLikePath
        ? String(getPathFilename(scopedRawValue) || '').trim()
        : scopedRawValue
      const normalizedScopedName = sanitizeMetadataValue(
        scopedResolvedName.replace(/\.[^/.\\]+$/, ''),
        180,
      )
      const normalizedDefaultName = sanitizeMetadataValue(videoTitle || titleValue || '', 180)
      const shouldUsePatternFallback = !scopedLooksLikePath
        && (!normalizedScopedName || normalizedScopedName === normalizedDefaultName)

      const fallbackBaseName = shouldUsePatternFallback
        ? suggestedBaseName
        : (thumbnailFilenameValue || titleValue || videoTitle || suggestedBaseName || 'thumbnail')
      const resolvedPathValue = resolveFullPathValue({
        inputValue: shouldUsePatternFallback ? '' : thumbnailFilenameValue,
        defaultDirectory: preferredDirectory,
        fallbackBaseName,
        extension: selectedFormat,
      })
      const resolvedFilename = String(getPathFilename(resolvedPathValue) || '').trim()

      if (!resolvedFilename) {
        const message = i18nT('downloader.errorFilePathRequired')
        notifyDownloadError(message, { persistent: true })
        emitDownloadEvent({ type: 'error', message, downloadType: type, sourceUrl: normalized || resolvedThumbnailUrl })
        return false
      }

      const directoryToValidate = String(getPathDirectory(resolvedPathValue) || preferredDirectory).trim()
      if (!directoryToValidate) {
        const message = i18nT('downloader.errorDownloadPathInvalid', { path: resolvedPathValue })
        notifyDownloadError(message, { persistent: true })
        emitDownloadEvent({ type: 'error', message, downloadType: type, sourceUrl: normalized || resolvedThumbnailUrl })
        return false
      }

      const canValidateDirectory = typeof runtime?.downloads?.validateDirectory === 'function'
      if (canValidateDirectory) {
        try {
          const validation = await runtime.downloads.validateDirectory(directoryToValidate)
          if (!validation?.valid) {
            const message = resolvePathValidationMessage(i18nT, validation, directoryToValidate)
            notifyDownloadError(message, { persistent: true })
            emitDownloadEvent({ type: 'error', message, downloadType: type, sourceUrl: normalized || resolvedThumbnailUrl })
            return false
          }
        } catch {
          const message = i18nT('downloader.errorDownloadPathInvalid', { path: directoryToValidate })
          notifyDownloadError(message, { persistent: true })
          emitDownloadEvent({ type: 'error', message, downloadType: type, sourceUrl: normalized || resolvedThumbnailUrl })
          return false
        }
      }

      manualElectronSavePath = resolvedPathValue
    }

    const payload = {
      url: normalized || resolvedThumbnailUrl,
      thumbnailUrl: resolvedThumbnailUrl,
      format: selectedFormat,
      videoTitle: normalizedVideoTitle,
      service: resolvedServiceKey,
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
        return false
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
          selectedFormat,
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
          emitDownloadEvent({ type: 'error', message, downloadType: type, sourceUrl: normalized || resolvedThumbnailUrl })
          return false
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
            return false
          }

          payload.electronAllowOverwrite = true
        }
      }
    }

    const response = await fetch(`${apiBase}/api/download/thumbnail/stream`, {
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

    const processEvent = (eventName, rawData) => {
      const dataStr = String(rawData || '')

      if (eventName === 'error') {
        const msg = formatYtDlpErrorMessage(i18nT, rawData, {
          fallbackKey: 'downloader.errorDownloadFailed',
          includeRawForUnknown: true,
        })
        notifyDownloadError(msg)
        emitDownloadEvent({ type: 'error', message: msg, downloadType: type, sourceUrl: normalized || resolvedThumbnailUrl })
        return
      }

      if (eventName === 'info' || eventName === 'message') {
        recentDiagnostics = appendDownloadDiagnostic(recentDiagnostics, dataStr)
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

          if (!filename) return

          completed = true
          setDownloadProgress(100)
          setDownloadStage('complete')

          completionPayload = {
            filename,
            savePath: String(data?.savePath || '').trim(),
            relativeUrl,
            downloadUrl: relativeUrl ? `${apiBase}${relativeUrl}` : '',
          }
          emitDownloadEvent({
            type: 'complete',
            downloadType: type,
            sourceUrl: normalized || resolvedThumbnailUrl,
            payload: completionPayload,
          })

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
          const msg = resolveDownloadDiagnosticMessage(i18nT, recentDiagnostics)
          notifyDownloadError(msg)
          emitDownloadEvent({ type: 'error', message: msg, downloadType: type, sourceUrl: normalized || resolvedThumbnailUrl })
        }
      }
    }

    await readSseEventsFromResponse(response, processEvent)

    if (!completed && !finalized) {
      throw new Error(resolveDownloadDiagnosticMessage(i18nT, recentDiagnostics))
    }

    return completionPayload || completed
  } catch (err) {
    const directMessage = String(err?.message || '').trim()
    const msg = directMessage || formatYtDlpErrorMessage(i18nT, err, {
      fallbackKey: 'downloader.errorDownloadFailed',
      includeRawForUnknown: true,
    })
    notifyDownloadError(msg)
    emitDownloadEvent({ type: 'error', message: msg, downloadType: type, sourceUrl: normalized || resolvedThumbnailUrl })
    return false
  } finally {
    if (!completed) {
      setDownloading(false)
      setDownloadProgress(0)
      setDownloadStage('')
      setActiveDownloadType('')
    }
  }
}
