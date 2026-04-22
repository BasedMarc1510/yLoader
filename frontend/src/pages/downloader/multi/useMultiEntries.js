import React from 'react'
import { fetchFormats, fetchNoembed, detectService, toMetaModel } from '../../../utils/metadata'
import { parseMultiLinks, isLikelyValidHttpLink, normalizeHttpLink } from '../../../utils/multiLinks'
import { formatYtDlpErrorMessage } from '../../../utils/ytDlpErrorPresentation'
import {
  ENTRY_DOWNLOAD_STATUS,
  ENTRY_META_STATE,
  createMultiEntryId,
  formatDurationLabel,
  normalizeDurationSeconds,
  normalizeDownloadType,
  resolveEntryDownloadType,
  resolveSupportedDownloadTypes,
} from './entryUtils'

const DEFAULT_METADATA_CONCURRENCY = 4
const NOEMBED_TIMEOUT_MS = 2200
const FORMATS_TIMEOUT_MS = 12000

async function fetchNoembedWithTimeout(url, timeoutMs = NOEMBED_TIMEOUT_MS) {
  const supportsAbort = typeof AbortController !== 'undefined'
  const controller = supportsAbort ? new AbortController() : null
  let timeoutId = null

  if (controller && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      controller.abort()
    }, timeoutMs)
  }

  try {
    return await fetchNoembed(url, controller ? { signal: controller.signal } : undefined)
  } catch {
    return null
  } finally {
    if (timeoutId != null) {
      clearTimeout(timeoutId)
    }
  }
}

async function fetchFormatsWithTimeout(url, timeoutMs = FORMATS_TIMEOUT_MS) {
  const supportsAbort = typeof AbortController !== 'undefined'
  const controller = supportsAbort ? new AbortController() : null
  let timeoutId = null

  if (controller && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      controller.abort()
    }, timeoutMs)
  }

  try {
    return await fetchFormats(url, controller ? { signal: controller.signal } : undefined)
  } catch (error) {
    if (controller?.signal?.aborted) {
      const timeoutError = new Error('formats timeout')
      timeoutError.cause = error
      throw timeoutError
    }
    throw error
  } finally {
    if (timeoutId != null) {
      clearTimeout(timeoutId)
    }
  }
}

function createEmptyDownloadState() {
  return {
    status: ENTRY_DOWNLOAD_STATUS.idle,
    active: false,
    progress: 0,
    stage: '',
    errorMessage: '',
    completedFile: null,
  }
}

function createBaseEntry(rawLink, preferredDownloadType, i18nT) {
  const originalValue = String(rawLink || '').trim()
  const validUrl = isLikelyValidHttpLink(originalValue)
  const normalizedUrl = validUrl ? normalizeHttpLink(originalValue) : ''
  const serviceKey = validUrl ? (detectService(normalizedUrl) || 'generic') : 'generic'
  const mappedMeta = validUrl
    ? toMetaModel(serviceKey, normalizedUrl, null)
    : null

  return {
    id: createMultiEntryId(),
    rawInput: originalValue,
    url: normalizedUrl,
    serviceKey,
    metaState: validUrl ? ENTRY_META_STATE.loading : ENTRY_META_STATE.invalid,
    errorMessage: validUrl ? '' : i18nT('multiDownloader.entryInvalidLink'),
    meta: {
      thumbnail: mappedMeta?.thumbnail || '',
      title: mappedMeta?.title || originalValue,
      author: mappedMeta?.author || '',
      duration: null,
      durationSeconds: null,
      preloadedFormats: null,
      durationLoading: validUrl,
      durationResolved: !validUrl,
      url: normalizedUrl,
    },
    supportedTypes: [],
    selectedType: normalizeDownloadType(preferredDownloadType, 'audio'),
    expanded: false,
    download: createEmptyDownloadState(),
  }
}

function normalizePreloadedFormats(payload, fallbackMeta) {
  const durationSeconds = normalizeDurationSeconds(payload?.duration)
  const durationLabel = String(payload?.durationString || '').trim() || formatDurationLabel(durationSeconds)

  return {
    title: String(payload?.title || fallbackMeta?.title || '').trim(),
    author: String(payload?.author || fallbackMeta?.author || '').trim(),
    extractor: String(payload?.extractor || '').trim(),
    thumbnail: String(payload?.thumbnail || fallbackMeta?.thumbnail || '').trim() || null,
    duration: durationSeconds ?? null,
    durationString: durationLabel || null,
    audioFormats: Array.isArray(payload?.audioFormats) ? payload.audioFormats : [],
    videoFormats: Array.isArray(payload?.videoFormats) ? payload.videoFormats : [],
    thumbnails: Array.isArray(payload?.thumbnails) ? payload.thumbnails : [],
  }
}

export default function useMultiEntries({
  i18nT,
  initialDownloadType = 'audio',
  metadataConcurrency = DEFAULT_METADATA_CONCURRENCY,
}) {
  const [entries, setEntries] = React.useState([])
  const entriesRef = React.useRef(entries)
  const sessionRef = React.useRef(1)
  const pendingQueueRef = React.useRef([])
  const activeCountRef = React.useRef(0)

  React.useEffect(() => {
    entriesRef.current = entries
  }, [entries])

  const resolveEntryMetadata = React.useCallback(async (entryId, sessionId) => {
    const currentEntry = entriesRef.current.find((entry) => entry.id === entryId)
    if (!currentEntry || currentEntry.metaState !== ENTRY_META_STATE.loading || !currentEntry.url) return

    const entryService = currentEntry.serviceKey || detectService(currentEntry.url) || 'generic'
    const noembedPromise = fetchNoembedWithTimeout(currentEntry.url)
    let formatsPayload = null

    try {
      formatsPayload = await fetchFormatsWithTimeout(currentEntry.url)
    } catch (reason) {
      const message = formatYtDlpErrorMessage(i18nT, reason, {
        fallbackKey: 'multiDownloader.entryNotRetrievable',
        includeRawForUnknown: true,
      })

      if (sessionRef.current !== sessionId) return

      const fallbackMeta = toMetaModel(entryService, currentEntry.url, null)

      setEntries((previousEntries) => previousEntries.map((entry) => {
        if (entry.id !== entryId) return entry

        return {
          ...entry,
          serviceKey: entryService,
          metaState: ENTRY_META_STATE.error,
          errorMessage: message || i18nT('multiDownloader.entryNotRetrievable'),
          meta: {
            ...entry.meta,
            thumbnail: fallbackMeta?.thumbnail || entry.meta.thumbnail || '',
            title: fallbackMeta?.title || entry.meta.title || entry.rawInput,
            author: fallbackMeta?.author || entry.meta.author || '',
            durationLoading: false,
            durationResolved: true,
            preloadedFormats: null,
          },
          supportedTypes: [],
        }
      }))
      return
    }

    if (sessionRef.current !== sessionId) return

    const noembedPayload = await noembedPromise
    const fallbackMeta = toMetaModel(entryService, currentEntry.url, noembedPayload)
    const preloadedFormats = normalizePreloadedFormats(formatsPayload, fallbackMeta)
    const supportedTypes = resolveSupportedDownloadTypes(entryService, preloadedFormats)
    const durationLabel = String(preloadedFormats.durationString || '').trim() || null

    setEntries((previousEntries) => previousEntries.map((entry) => {
      if (entry.id !== entryId) return entry

      if (!supportedTypes.length) {
        return {
          ...entry,
          serviceKey: entryService,
          metaState: ENTRY_META_STATE.error,
          errorMessage: i18nT('multiDownloader.entryNoSupportedDownloadTypes'),
          meta: {
            ...entry.meta,
            thumbnail: preloadedFormats.thumbnail || entry.meta.thumbnail || '',
            title: preloadedFormats.title || entry.meta.title || entry.rawInput,
            author: preloadedFormats.author || entry.meta.author || '',
            duration: durationLabel,
            durationSeconds: preloadedFormats.duration,
            durationLoading: false,
            durationResolved: true,
            preloadedFormats,
          },
          supportedTypes: [],
        }
      }

      const selectedType = resolveEntryDownloadType(supportedTypes, entry.selectedType)

      return {
        ...entry,
        serviceKey: entryService,
        metaState: ENTRY_META_STATE.ready,
        errorMessage: '',
        selectedType,
        supportedTypes,
        meta: {
          ...entry.meta,
          thumbnail: preloadedFormats.thumbnail || entry.meta.thumbnail || '',
          title: preloadedFormats.title || entry.meta.title || entry.rawInput,
          author: preloadedFormats.author || entry.meta.author || '',
          duration: durationLabel,
          durationSeconds: preloadedFormats.duration,
          durationLoading: false,
          durationResolved: true,
          preloadedFormats,
        },
      }
    }))
  }, [i18nT])

  const pumpQueue = React.useCallback(() => {
    while (activeCountRef.current < metadataConcurrency && pendingQueueRef.current.length > 0) {
      const nextItem = pendingQueueRef.current.shift()
      if (!nextItem) continue

      const { entryId, sessionId } = nextItem
      if (!entryId) continue

      activeCountRef.current += 1
      void resolveEntryMetadata(entryId, sessionId)
        .finally(() => {
          activeCountRef.current = Math.max(0, activeCountRef.current - 1)
          pumpQueue()
        })
    }
  }, [metadataConcurrency, resolveEntryMetadata])

  const enqueueMetadata = React.useCallback((entryIds, sessionId) => {
    const normalizedIds = Array.isArray(entryIds)
      ? entryIds.filter(Boolean)
      : []
    if (!normalizedIds.length) return

    for (const entryId of normalizedIds) {
      pendingQueueRef.current.push({ entryId, sessionId })
    }

    pumpQueue()
  }, [pumpQueue])

  const appendLinks = React.useCallback((rawInput, preferredDownloadType = initialDownloadType) => {
    const parsedLinks = parseMultiLinks(rawInput)
    if (!parsedLinks.length) return 0

    const nextEntries = parsedLinks.map((link) => createBaseEntry(link, preferredDownloadType, i18nT))
    const activeSession = sessionRef.current

    setEntries((previousEntries) => ([...previousEntries, ...nextEntries]))

    enqueueMetadata(
      nextEntries
        .filter((entry) => entry.metaState === ENTRY_META_STATE.loading)
        .map((entry) => entry.id),
      activeSession,
    )

    return nextEntries.length
  }, [enqueueMetadata, i18nT, initialDownloadType])

  const replaceLinks = React.useCallback((rawInput, preferredDownloadType = initialDownloadType) => {
    const parsedLinks = parseMultiLinks(rawInput)
    const nextEntries = parsedLinks.map((link) => createBaseEntry(link, preferredDownloadType, i18nT))
    const nextSession = sessionRef.current + 1
    sessionRef.current = nextSession
    pendingQueueRef.current = []

    setEntries(nextEntries)

    enqueueMetadata(
      nextEntries
        .filter((entry) => entry.metaState === ENTRY_META_STATE.loading)
        .map((entry) => entry.id),
      nextSession,
    )

    return nextEntries.length
  }, [enqueueMetadata, i18nT, initialDownloadType])

  const removeEntry = React.useCallback((entryId) => {
    const normalizedId = String(entryId || '').trim()
    if (!normalizedId) return

    setEntries((previousEntries) => previousEntries.filter((entry) => entry.id !== normalizedId))
    pendingQueueRef.current = pendingQueueRef.current.filter((item) => item?.entryId !== normalizedId)
  }, [])

  return {
    entries,
    setEntries,
    appendLinks,
    replaceLinks,
    removeEntry,
  }
}
