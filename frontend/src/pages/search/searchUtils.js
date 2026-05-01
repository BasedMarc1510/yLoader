import {
  GENERIC_SERVICE_KEY,
  normalizeServiceKey,
} from '../../utils/metadata'

export const SEARCH_SERVICE_OPTIONS = Object.freeze([
  { value: 'youtube', labelKey: 'search.services.youtube', iconKey: 'youtube' },
  { value: 'youtubemusic', labelKey: 'search.services.youtubeMusic', iconKey: 'youtube' },
  { value: 'spotify', labelKey: 'search.services.spotify', iconKey: 'spotify' },
  { value: 'soundcloud', labelKey: 'search.services.soundcloud', iconKey: 'soundcloud' },
])
export const SQUARE_THUMBNAIL_SERVICES = new Set(['spotify', 'soundcloud'])
export const EMBED_PREVIEW_SERVICES = new Set(['youtube', 'soundcloud'])
export const DIRECT_DOWNLOAD_FORMAT_OPTIONS = Object.freeze(['mp4', 'mp3', 'thumbnail'])

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{6,}$/

function sanitizeSearchRuntimeText(value, maxLength = 240) {
  return String(value || '').trim().slice(0, maxLength)
}

function sanitizeYouTubeId(value) {
  const candidate = String(value || '').trim()
  if (!candidate) return ''
  if (!YOUTUBE_ID_PATTERN.test(candidate)) return ''
  return candidate
}

export function toSelectedEntriesMap(entries) {
  const map = new Map()
  for (const entry of entries || []) {
    const identity = sanitizeSearchRuntimeText(entry?.identity, 260)
    const url = toHttpUrl(entry?.url)
    if (!identity || !url) continue
    map.set(identity, {
      identity,
      url,
      service: normalizeServiceKey(entry?.service) || GENERIC_SERVICE_KEY,
      title: sanitizeSearchRuntimeText(entry?.title, 240),
      thumbnail: sanitizeSearchRuntimeText(entry?.thumbnail, 2048),
    })
  }
  return map
}

export function getSearchEntryIdentity(entry) {
  const id = String(entry?.id || '').trim()
  const url = String(entry?.url || '').trim()
  const service = String(entry?.service || '').trim()
  return `${service}::${id || url}`
}

export function triggerBrowserDownload(href, filename = '') {
  const url = String(href || '').trim()
  if (!url) return

  const anchor = document.createElement('a')
  anchor.href = url
  if (filename) {
    anchor.download = String(filename || '').trim()
  }
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export function appendUrlQueryParam(rawUrl, key, value) {
  const targetUrl = String(rawUrl || '').trim()
  const targetKey = String(key || '').trim()
  if (!targetUrl || !targetKey) return targetUrl

  try {
    const base = (typeof window !== 'undefined' && window.location)
      ? window.location.href
      : 'http://localhost'
    const parsed = new URL(targetUrl, base)
    parsed.searchParams.set(targetKey, String(value || ''))
    return parsed.href
  } catch {
    const joinChar = targetUrl.includes('?') ? '&' : '?'
    return `${targetUrl}${joinChar}${encodeURIComponent(targetKey)}=${encodeURIComponent(String(value || ''))}`
  }
}

export function toHttpUrl(rawValue) {
  const value = String(rawValue || '').trim()
  if (!value) return null

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.href
  } catch {
    return null
  }
}

export function mergeUniqueEntries(existingEntries, incomingEntries) {
  const merged = [...existingEntries]
  const seen = new Set(existingEntries.map((entry) => `${String(entry?.id || '')}::${String(entry?.url || '')}`))

  for (const entry of incomingEntries) {
    const key = `${String(entry?.id || '')}::${String(entry?.url || '')}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(entry)
  }

  return merged
}

export function formatDuration(durationSeconds) {
  const numeric = Number(durationSeconds)
  if (!Number.isFinite(numeric) || numeric <= 0) return ''

  const total = Math.max(0, Math.round(numeric))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad2 = (input) => String(input).padStart(2, '0')

  if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(seconds)}`
  return `${pad2(minutes)}:${pad2(seconds)}`
}

function extractYouTubeIdFromUrl(rawUrl) {
  const targetUrl = toHttpUrl(rawUrl)
  if (!targetUrl) return ''

  try {
    const parsed = new URL(targetUrl)
    const host = String(parsed.hostname || '').trim().toLowerCase()
    const pathParts = String(parsed.pathname || '')
      .split('/')
      .map((part) => String(part || '').trim())
      .filter(Boolean)

    if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
      return sanitizeYouTubeId(pathParts[0])
    }

    if (!(host.includes('youtube.com') || host.includes('youtube-nocookie.com'))) {
      return ''
    }

    const watchId = sanitizeYouTubeId(parsed.searchParams.get('v'))
    if (watchId) return watchId

    if (pathParts[0] === 'embed' || pathParts[0] === 'shorts' || pathParts[0] === 'live') {
      return sanitizeYouTubeId(pathParts[1])
    }

    return ''
  } catch {
    return ''
  }
}

function buildYouTubeEmbedUrl(rawUrl, rawId) {
  const id = extractYouTubeIdFromUrl(rawUrl) || sanitizeYouTubeId(rawId)
  if (!id) return ''

  const params = new URLSearchParams({
    autoplay: '1',
    rel: '0',
  })

  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${params.toString()}`
}

function buildSoundcloudEmbedUrl(rawUrl, rawId) {
  const sourceUrl = toHttpUrl(rawUrl)
  if (!sourceUrl) return ''

  try {
    const parsed = new URL(sourceUrl)
    const host = String(parsed.hostname || '').trim().toLowerCase()
    if (!(host === 'soundcloud.com' || host.endsWith('.soundcloud.com'))) {
      return ''
    }

    const normalizedId = String(rawId || '').trim()
    const trackMatch = normalizedId.match(/^(?:soundcloud:tracks:)?(\d+)$/i)
    const embedTargetUrl = trackMatch?.[1]
      ? `https://api.soundcloud.com/tracks/${trackMatch[1]}`
      : parsed.href

    const params = new URLSearchParams({
      url: embedTargetUrl,
      color: '#ff5500',
      auto_play: 'false',
      hide_related: 'false',
      show_comments: 'true',
      show_user: 'true',
      show_reposts: 'false',
      show_teaser: 'true',
    })

    return `https://w.soundcloud.com/player/?${params.toString()}`
  } catch {
    return ''
  }
}

export function resolvePreviewEmbedPayload(entry, fallbackService, getServiceLabel) {
  const resolvedService = normalizeServiceKey(entry?.service || fallbackService)
  const serviceKey = resolvedService || GENERIC_SERVICE_KEY
  if (!EMBED_PREVIEW_SERVICES.has(serviceKey)) return null

  const sourceUrl = toHttpUrl(entry?.url)
  if (!sourceUrl) return null

  const embedUrl = serviceKey === 'youtube'
    ? buildYouTubeEmbedUrl(sourceUrl, entry?.id)
    : buildSoundcloudEmbedUrl(sourceUrl, entry?.id)

  if (!embedUrl) return null

  return {
    serviceKey,
    serviceLabel: getServiceLabel(serviceKey),
    sourceUrl,
    embedUrl,
  }
}
