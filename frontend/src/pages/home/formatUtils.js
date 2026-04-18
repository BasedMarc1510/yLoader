import { AUTO_DOWNLOAD_SETTINGS_DEFAULTS } from './constants'

function normalizeDownloadPath(value, fallbackPath) {
  const fallback = String(fallbackPath || '').trim()
  const raw = String(value || '')
    .replace(/\u0000/g, '')
    .trim()
  return raw || fallback
}

export function normalizeAutoDownloadSettings(value) {
  const input = (value && typeof value === 'object') ? value : {}
  const maxAudioBitrateKbps = Number(input.maxAudioBitrateKbps)
  const maxVideoHeight = Number(input.maxVideoHeight)
  const fixedDownloadPath = normalizeDownloadPath(
    input.fixedDownloadPath,
    AUTO_DOWNLOAD_SETTINGS_DEFAULTS.fixedDownloadPath,
  )

  return {
    useMetadata: input.useMetadata !== undefined ? Boolean(input.useMetadata) : AUTO_DOWNLOAD_SETTINGS_DEFAULTS.useMetadata,
    embedCoverArt: input.embedCoverArt !== undefined ? Boolean(input.embedCoverArt) : AUTO_DOWNLOAD_SETTINGS_DEFAULTS.embedCoverArt,
    maxAudioBitrateKbps: Number.isFinite(maxAudioBitrateKbps) ? maxAudioBitrateKbps : AUTO_DOWNLOAD_SETTINGS_DEFAULTS.maxAudioBitrateKbps,
    maxVideoHeight: Number.isFinite(maxVideoHeight) ? maxVideoHeight : AUTO_DOWNLOAD_SETTINGS_DEFAULTS.maxVideoHeight,
    useFixedDownloadPath: input.useFixedDownloadPath !== undefined
      ? Boolean(input.useFixedDownloadPath)
      : AUTO_DOWNLOAD_SETTINGS_DEFAULTS.useFixedDownloadPath,
    fixedDownloadPath,
  }
}

export function pickAudioFormatByMaxBitrate(formats, maxAudioBitrateKbps) {
  const list = Array.isArray(formats) ? formats : []
  if (!list.length) return 'best'

  const normalizedCap = Number(maxAudioBitrateKbps)
  const cap = Number.isFinite(normalizedCap) ? normalizedCap : 0

  const candidates = list
    .filter((fmt) => fmt && typeof fmt.formatId === 'string' && fmt.formatId.trim())
    .map((fmt) => ({
      formatId: fmt.formatId,
      abr: Number(fmt.abr) || 0,
      filesize: Number(fmt.filesize) || 0,
    }))
    .filter((fmt) => fmt.abr > 0)

  if (!candidates.length) return 'best'

  const bounded = cap > 0 ? candidates.filter((fmt) => fmt.abr <= cap) : candidates
  const pool = bounded.length ? bounded : candidates

  pool.sort((a, b) => {
    if (b.abr !== a.abr) return b.abr - a.abr
    return (a.filesize || 0) - (b.filesize || 0)
  })

  return pool[0]?.formatId || 'best'
}

function readVideoFormatHeight(fmt) {
  const direct = Number(fmt?.height)
  if (Number.isFinite(direct) && direct > 0) return direct

  const resolution = String(fmt?.resolution || '')
  const pMatch = resolution.match(/(\d{3,4})p/i)
  if (pMatch) return Number(pMatch[1])

  const xMatch = resolution.match(/x(\d{3,4})$/i)
  if (xMatch) return Number(xMatch[1])

  return 0
}

export function pickVideoFormatByMaxHeight(formats, maxVideoHeight) {
  const list = Array.isArray(formats) ? formats : []
  if (!list.length) return 'best'

  const normalizedCap = Number(maxVideoHeight)
  const cap = Number.isFinite(normalizedCap) ? normalizedCap : 0

  const candidates = list
    .filter((fmt) => fmt && typeof fmt.formatId === 'string' && fmt.formatId.trim())
    .map((fmt) => ({
      formatId: fmt.formatId,
      height: readVideoFormatHeight(fmt),
      filesize: Number(fmt.filesize) || 0,
    }))
    .filter((fmt) => fmt.height > 0)

  if (!candidates.length) return 'best'

  const bounded = cap > 0 ? candidates.filter((fmt) => fmt.height <= cap) : candidates
  const pool = bounded.length ? bounded : candidates

  pool.sort((a, b) => {
    if (b.height !== a.height) return b.height - a.height
    return (b.filesize || 0) - (a.filesize || 0)
  })

  return pool[0]?.formatId || 'best'
}
