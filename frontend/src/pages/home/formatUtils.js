import { AUTO_DOWNLOAD_SETTINGS_DEFAULTS, normalizeAutoDownloadSettings } from '../../utils/autoDownloadSettings'
import { isUsableVideoFormat } from '../../utils/videoFormatSupport'

export { normalizeAutoDownloadSettings }

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

  pool.sort((left, right) => {
    if (right.abr !== left.abr) return right.abr - left.abr
    return (left.filesize || 0) - (right.filesize || 0)
  })

  return pool[0]?.formatId || 'best'
}

function readVideoFormatHeight(format) {
  const direct = Number(format?.height)
  if (Number.isFinite(direct) && direct > 0) return direct

  const resolution = String(format?.resolution || '')
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
    .filter((fmt) => fmt && typeof fmt.formatId === 'string' && fmt.formatId.trim() && isUsableVideoFormat(fmt))
    .map((fmt) => ({
      formatId: fmt.formatId,
      height: readVideoFormatHeight(fmt),
      filesize: Number(fmt.filesize) || 0,
    }))
    .filter((fmt) => fmt.height > 0)

  if (!candidates.length) return 'best'

  const bounded = cap > 0 ? candidates.filter((fmt) => fmt.height <= cap) : candidates
  const pool = bounded.length ? bounded : candidates

  pool.sort((left, right) => {
    if (right.height !== left.height) return right.height - left.height
    return (right.filesize || 0) - (left.filesize || 0)
  })

  return pool[0]?.formatId || 'best'
}
