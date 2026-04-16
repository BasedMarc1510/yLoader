function readVideoHeight(format) {
  const directHeight = Number(format?.height)
  if (Number.isFinite(directHeight) && directHeight > 0) return directHeight

  const resolution = String(format?.resolution || '').toLowerCase()
  const pMatch = resolution.match(/(\d{3,4})p/)
  if (pMatch) return Number(pMatch[1])

  const xMatch = resolution.match(/x(\d{3,4})$/)
  if (xMatch) return Number(xMatch[1])

  return 0
}

export const buildVideoOptions = (formats = [], maxVideoHeight = 0) => {
  const maxHeightCap = Number(maxVideoHeight)
  const byHeight = new Map()

  for (const f of formats || []) {
    const height = readVideoHeight(f)
    if (!height) continue

    const key = `${height}p`
    const existing = byHeight.get(key)
    if (!existing) {
      byHeight.set(key, f)
      continue
    }

    const existingSize = existing?.filesize || 0
    const nextSize = f?.filesize || 0
    if (nextSize && (!existingSize || nextSize > existingSize)) {
      byHeight.set(key, f)
    }
  }

  const allOptions = Array.from(byHeight.entries())
    .map(([label, format]) => ({
      value: format.formatId,
      label,
      height: readVideoHeight(format),
    }))
    .sort((a, b) => b.height - a.height)

  const cappedOptions = Number.isFinite(maxHeightCap) && maxHeightCap > 0
    ? allOptions.filter((option) => option.height > 0 && option.height <= maxHeightCap)
    : allOptions
  const finalOptions = cappedOptions.length ? cappedOptions : allOptions

  return finalOptions.map(({ value, label }) => ({ value, label, description: undefined }))
}

export const buildAudioOptions = (formats = [], maxAudioBitrateKbps = 0) => {
  const maxBitrateCap = Number(maxAudioBitrateKbps)
  const byAbr = new Map()

  for (const f of formats || []) {
    const abr = Math.round(f?.abr || 0)
    if (!abr) continue

    const key = `${abr} kbps`
    const existing = byAbr.get(key)
    if (!existing) {
      byAbr.set(key, f)
      continue
    }

    const existingSize = existing?.filesize || 0
    const nextSize = f?.filesize || 0
    if (nextSize && (!existingSize || nextSize < existingSize)) {
      byAbr.set(key, f)
    }
  }

  const allOptions = Array.from(byAbr.entries())
    .map(([label, format]) => ({
      value: format.formatId,
      label,
      abr: Math.round(Number(format?.abr) || 0),
    }))
    .sort((a, b) => b.abr - a.abr)

  const cappedOptions = Number.isFinite(maxBitrateCap) && maxBitrateCap > 0
    ? allOptions.filter((option) => option.abr > 0 && option.abr <= maxBitrateCap)
    : allOptions
  const finalOptions = cappedOptions.length ? cappedOptions : allOptions

  return finalOptions.map(({ value, label }) => ({ value, label, description: undefined }))
}
