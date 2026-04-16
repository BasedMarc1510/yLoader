import React from 'react'
import {
  GENERIC_SERVICE_KEY,
  detectService,
  fetchDuration,
  fetchFormats,
  fetchNoembed,
  getApiBase,
  normalizeUrlForNoembed,
} from '../../utils/metadata'
import { AUTO_DOWNLOAD_SETTINGS_DEFAULTS } from './constants'
import {
  normalizeAutoDownloadSettings,
  pickAudioFormatByMaxBitrate,
  pickVideoFormatByMaxHeight,
} from './formatUtils'

function resolveSseErrorMessage(value) {
  try {
    const parsed = JSON.parse(value)
    return parsed?.error || parsed?.message || String(value || '')
  } catch {
    return String(value || '')
  }
}

function parseSseStructuredPayload(value) {
  if (value == null) return null
  if (typeof value === 'object') return value

  const text = String(value || '').trim()
  if (!text) return null

  try {
    const parsed = JSON.parse(text)
    return (parsed && typeof parsed === 'object') ? parsed : null
  } catch {
    return null
  }
}

function extractPercent(input) {
  if (input == null) return null

  if (typeof input === 'object') {
    const objectPercent = Number(input.percent ?? input.progress ?? input.percentage)
    return Number.isFinite(objectPercent) ? objectPercent : null
  }

  const text = String(input || '').trim()
  if (!text) return null

  try {
    const parsed = JSON.parse(text)
    const jsonPercent = Number(parsed?.percent ?? parsed?.progress ?? parsed?.percentage)
    if (Number.isFinite(jsonPercent)) return jsonPercent
  } catch {
    // continue with text parsing
  }

  const downloadMatches = Array.from(text.matchAll(/\[download\][^\r\n]*?(\d+(?:[\.,]\d+)?)%/gi))
  if (downloadMatches.length) {
    let maxDownloadPercent = null
    for (const match of downloadMatches) {
      const parsed = Number.parseFloat(String(match[1] || '').replace(',', '.'))
      if (!Number.isFinite(parsed)) continue
      maxDownloadPercent = maxDownloadPercent == null ? parsed : Math.max(maxDownloadPercent, parsed)
    }
    if (maxDownloadPercent != null) return maxDownloadPercent
  }

  const genericMatches = Array.from(text.matchAll(/(?:download|downloading)[^\r\n%]*?(\d+(?:[\.,]\d+)?)%/gi))
  if (genericMatches.length) {
    let maxGenericPercent = null
    for (const match of genericMatches) {
      const parsed = Number.parseFloat(String(match[1] || '').replace(',', '.'))
      if (!Number.isFinite(parsed)) continue
      maxGenericPercent = maxGenericPercent == null ? parsed : Math.max(maxGenericPercent, parsed)
    }
    if (maxGenericPercent != null) return maxGenericPercent
  }

  return null
}

function readSseBlocks(buffer, processEvent, force = false) {
  let nextBuffer = buffer
  let delimiterIndex = nextBuffer.indexOf('\n\n')

  while (delimiterIndex !== -1) {
    const block = nextBuffer.slice(0, delimiterIndex)
    nextBuffer = nextBuffer.slice(delimiterIndex + 2)

    if (block.trim()) {
      let eventName = 'message'
      const dataLines = []

      for (const rawLine of block.split('\n')) {
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

    delimiterIndex = nextBuffer.indexOf('\n\n')
  }

  if (force && nextBuffer.trim()) {
    let eventName = 'message'
    const dataLines = []

    for (const rawLine of nextBuffer.split('\n')) {
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
    return ''
  }

  return nextBuffer
}

export function useAutoDownload({
  autoDownloadEnabled,
  autoDownloadFormat,
  multiModeEnabled,
  t,
  setIsResolving,
  setFetchError,
  clearInput,
  showNotification,
}) {
  const [autoDownloadInFlight, setAutoDownloadInFlight] = React.useState(false)
  const [autoDownloadProgress, setAutoDownloadProgress] = React.useState(0)
  const [autoDownloadProgressKnown, setAutoDownloadProgressKnown] = React.useState(false)
  const inFlightRef = React.useRef(false)

  const fetchAutoDownloadSettingsFromServer = React.useCallback(async () => {
    const API_BASE = getApiBase()

    try {
      const resp = await fetch(`${API_BASE}/api/auto-download/settings`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      return normalizeAutoDownloadSettings(data)
    } catch {
      return { ...AUTO_DOWNLOAD_SETTINGS_DEFAULTS }
    }
  }, [])

  const startAutoDownload = React.useCallback(async (rawUrl) => {
    const target = String(rawUrl || '').trim()
    const serviceKey = detectService(target)
    if (!autoDownloadEnabled || !serviceKey || !target || multiModeEnabled || inFlightRef.current) return

    inFlightRef.current = true

    setFetchError(null)
    setIsResolving(true)
    setAutoDownloadInFlight(true)
    setAutoDownloadProgress(0)
    setAutoDownloadProgressKnown(false)

    const API_BASE = getApiBase()
    let inputCleared = false
    let completed = false
    let ended = false
    let failed = false
    let explicitErrorMessage = ''

    const applyProgress = (rawPercent) => {
      const nextPercent = Number(rawPercent)
      if (!Number.isFinite(nextPercent)) return false

      const clampedPercent = Math.max(0, Math.min(100, nextPercent))
      setAutoDownloadProgress((prev) => Math.max(prev, clampedPercent))
      setAutoDownloadProgressKnown(true)

      if (!inputCleared) {
        inputCleared = true
        clearInput()
      }
      return true
    }

    try {
      const normalized = normalizeUrlForNoembed(target)
      const [autoSettings, formatsData, noembedData, durationData] = await Promise.all([
        fetchAutoDownloadSettingsFromServer(),
        fetchFormats(normalized).catch(() => ({ audioFormats: [], videoFormats: [] })),
        fetchNoembed(normalized).catch(() => ({})),
        fetchDuration(normalized).catch(() => ({ duration: null, durationString: null })),
      ])

      const isAudio = autoDownloadFormat === 'mp3'
      const payload = {
        url: normalized,
        service: serviceKey || GENERIC_SERVICE_KEY,
        type: isAudio ? 'audio' : 'video',
        duration: durationData?.duration ?? null,
        videoTitle: String(noembedData?.title || '').trim() || target,
        format: isAudio ? 'mp3' : 'mp4',
        audioFormat: isAudio
          ? pickAudioFormatByMaxBitrate(formatsData?.audioFormats, autoSettings.maxAudioBitrateKbps)
          : undefined,
        videoFormat: !isAudio
          ? pickVideoFormatByMaxHeight(formatsData?.videoFormats, autoSettings.maxVideoHeight)
          : undefined,
        metadata: isAudio && autoSettings.useMetadata
          ? {
              title: String(noembedData?.title || '').trim(),
              artist: String(noembedData?.author_name || '').trim(),
              album: '',
            }
          : undefined,
        cover: isAudio
          ? {
              enabled: Boolean(autoSettings.embedCoverArt),
              source: 'video',
            }
          : undefined,
      }

      const response = await fetch(`${API_BASE}/api/download/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let message = `HTTP ${response.status}`
        try {
          const body = await response.json()
          message = body?.error || body?.details || message
        } catch {
          // keep fallback message
        }
        throw new Error(message)
      }

      if (!response.body) {
        throw new Error(t('downloader.errorDownloadFailed'))
      }

      const processEvent = (eventName, rawData) => {
        const dataStr = String(rawData || '')
        const structuredPayload = parseSseStructuredPayload(rawData)

        if (eventName === 'progress') {
          const progressCandidate = Number(
            structuredPayload?.downloadPercent
              ?? structuredPayload?.percent
              ?? structuredPayload?.progress
              ?? structuredPayload?.percentage
          )

          if (!applyProgress(progressCandidate)) {
            applyProgress(extractPercent(dataStr))
          }
          return
        }

        if (eventName === 'info' || eventName === 'message') {
          applyProgress(extractPercent(dataStr))
          return
        }

        if (eventName === 'error') {
          const msg = resolveSseErrorMessage(dataStr) || t('downloader.errorDownloadFailed')
          failed = true
          explicitErrorMessage = msg
          setFetchError({ url: target, message: msg })
          showNotification(msg, 'error')
          return
        }

        if (eventName === 'complete') {
          completed = true
          setAutoDownloadProgressKnown(true)
          setAutoDownloadProgress(100)
          if (!inputCleared) {
            inputCleared = true
            clearInput()
          }

          try {
            const data = structuredPayload || JSON.parse(dataStr)
            if (!data?.filename || !data?.url) return

            const a = document.createElement('a')
            a.href = `${API_BASE}${data.url}`
            a.download = data.filename
            document.body.appendChild(a)
            a.click()
            a.remove()
          } catch {
            // ignore malformed complete payload
          }
          return
        }

        if (eventName === 'end') {
          ended = true
          if (dataStr.trim() === 'failed') {
            failed = true
          }
        }
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value: chunk } = await reader.read()
        if (done) {
          buffer = readSseBlocks(buffer, processEvent, true)
          break
        }

        buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n')
        buffer = readSseBlocks(buffer, processEvent, false)
      }
    } catch (error) {
      const message = error?.message || String(error || '')
      explicitErrorMessage = message
      setFetchError({ url: target, message })
      showNotification(message, 'error')
    } finally {
      inFlightRef.current = false
      if (!completed && !explicitErrorMessage && (failed || !ended)) {
        setFetchError({ url: target, message: t('downloader.errorDownloadFailed') })
      }
      setAutoDownloadInFlight(false)
      setAutoDownloadProgress(0)
      setAutoDownloadProgressKnown(false)
      setIsResolving(false)
    }
  }, [
    autoDownloadEnabled,
    autoDownloadFormat,
    clearInput,
    fetchAutoDownloadSettingsFromServer,
    multiModeEnabled,
    setFetchError,
    setIsResolving,
    showNotification,
    t,
  ])

  return {
    autoDownloadInFlight,
    autoDownloadProgress,
    autoDownloadProgressKnown,
    startAutoDownload,
  }
}
