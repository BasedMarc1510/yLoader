// Utilities for URL detection, normalization and metadata fetching via noembed

const NOEMBED_ENDPOINT = 'https://noembed.com/embed?url='

export function detectService(url) {
  if (!url) return null
  const lower = String(url).trim().toLowerCase()
  if (/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//.test(lower)) return 'youtube'
  if (/^(https?:\/\/)?(www\.)?(reddit\.com|redd\.it)\//.test(lower)) return 'reddit'
  if (/^(https?:\/\/)?(www\.)?(x\.com|twitter\.com)\//.test(lower)) return 'x'
  // Generic: any http(s) URL that doesn't match the above
  if (/^https?:\/\//i.test(lower)) return 'generic'
  return null
}

export function normalizeUrlForNoembed(url) {
  if (!url) return url
  let u = String(url).trim()
  // X uses x.com now; noembed generally handles twitter.com better
  if (/https?:\/\/x\.com\//i.test(u)) {
    u = u.replace(/https?:\/\/x\.com\//i, 'https://twitter.com/')
  }
  return u
}

export function extractYouTubeId(url) {
  if (!url) return null
  // Support youtu.be/ID, youtube.com/watch?v=ID, /embed/ID, /shorts/ID
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{6,})/,
    /v=([A-Za-z0-9_-]{6,})/, // watch?v=
    /\/embed\/([A-Za-z0-9_-]{6,})/,
    /\/shorts\/([A-Za-z0-9_-]{6,})/,
    /\/live\/([A-Za-z0-9_-]{6,})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m && m[1]) return m[1]
  }
  return null
}

export function youtubeThumb(id, size = 'mqdefault') {
  if (!id) return null
  // sizes: default, mqdefault, hqdefault, sddefault, maxresdefault
  return `https://img.youtube.com/vi/${id}/${size}.jpg`
}

export async function fetchNoembed(rawUrl) {
  const url = normalizeUrlForNoembed(rawUrl)
  const endpoint = `${NOEMBED_ENDPOINT}${encodeURIComponent(url)}`
  const res = await fetch(endpoint)
  if (!res.ok) throw new Error(`noembed HTTP ${res.status}`)
  const data = await res.json()
  return data
}

export function getApiBase() {
  if (import.meta && import.meta.env && import.meta.env.VITE_API_BASE) return import.meta.env.VITE_API_BASE
  if (import.meta && import.meta.env && import.meta.env.DEV) return ''
  return `${window.location.protocol}//${window.location.hostname}:4000`
}

export async function fetchDuration(rawUrl) {
  const API_BASE = getApiBase()
  const url = normalizeUrlForNoembed(rawUrl)
  const res = await fetch(`${API_BASE}/api/meta/duration?url=${encodeURIComponent(url)}`)
  if (!res.ok) throw new Error(`duration HTTP ${res.status}`)
  const data = await res.json()
  return data // { duration, durationString }
}

export async function fetchFormats(rawUrl) {
  const API_BASE = getApiBase()
  const url = normalizeUrlForNoembed(rawUrl)
  const res = await fetch(`${API_BASE}/api/meta/formats?url=${encodeURIComponent(url)}`)
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`
    try {
      const body = await res.json()
      errMsg = body?.details || body?.error || errMsg
    } catch { }
    throw new Error(errMsg)
  }
  return res.json()
}

export function toMetaModel(service, rawUrl, noembed) {
  const common = {
    service,
    url: rawUrl,
    title: noembed?.title || '',
    author: noembed?.author_name || '',
    provider: noembed?.provider_name || '',
    thumbnail: noembed?.thumbnail_url || '',
    duration: null, // noembed often lacks this; may fill later via backend if needed
  }

  if (service === 'youtube') {
    const id = extractYouTubeId(rawUrl)
    return {
      ...common,
      id,
      // Prefer deterministic image based on id to avoid size changes
      thumbnail: id ? youtubeThumb(id, 'mqdefault') : (common.thumbnail || null),
    }
  }

  return common
}

export function isLikelyValidUrlFor(service, url) {
  if (!service) return false
  const u = String(url || '').trim()
  if (!u) return false
  switch (service) {
    case 'youtube':
      return /(youtube\.com|youtu\.be)/i.test(u)
    case 'reddit':
      return /(reddit\.com|redd\.it)/i.test(u)
    case 'x':
      return /(x\.com|twitter\.com)/i.test(u)
    case 'generic':
      return /^https?:\/\//i.test(u)
    default:
      return false
  }
}
