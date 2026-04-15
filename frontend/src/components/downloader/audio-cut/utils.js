export const formatTime = (totalSec) => {
  const s = Math.max(0, Math.round(totalSec || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`
  return `${m}:${ss.toString().padStart(2, '0')}`
}

export const parseTime = (str, max) => {
  if (!str || typeof str !== 'string') return 0
  const parts = str.trim().split(':').map((p) => {
    const n = parseInt(p, 10)
    return isNaN(n) ? 0 : n
  })

  let v = 0
  if (parts.length >= 3) v = parts[0] * 3600 + parts[1] * 60 + parts[2]
  else if (parts.length === 2) v = parts[0] * 60 + parts[1]
  else v = parts[0]

  return Math.max(0, Math.min(max, v))
}

export const mergeSegments = (segments) => {
  const sorted = [...(segments || [])]
    .filter((s) => s && typeof s.start === 'number' && typeof s.end === 'number' && s.end > s.start)
    .sort((a, b) => a.start - b.start)

  const merged = []
  for (const seg of sorted) {
    const prev = merged[merged.length - 1]
    if (!prev) {
      merged.push({ start: seg.start, end: seg.end })
      continue
    }
    if (seg.start <= prev.end) {
      prev.end = Math.max(prev.end, seg.end)
    } else {
      merged.push({ start: seg.start, end: seg.end })
    }
  }

  return merged
}

export const invertSegments = (segments, start, end) => {
  if (end <= start) return []

  const merged = mergeSegments(segments)
  if (!merged.length) return [{ start, end }]

  const inverted = []
  let cursor = start
  for (const seg of merged) {
    const clampedStart = Math.max(start, seg.start)
    const clampedEnd = Math.min(end, seg.end)
    if (clampedEnd <= clampedStart) continue
    if (clampedStart > cursor) {
      inverted.push({ start: cursor, end: clampedStart })
    }
    cursor = Math.max(cursor, clampedEnd)
  }

  if (cursor < end) {
    inverted.push({ start: cursor, end })
  }

  return inverted
}

export const buildRailGradient = (zones, sliderMin, sliderMax, baseColor, zoneColor) => {
  const span = sliderMax - sliderMin
  if (!span || !zones || !zones.length) return baseColor

  const valid = zones
    .filter((z) => z && typeof z.start === 'number' && typeof z.end === 'number' && z.end > z.start)
    .sort((a, b) => a.start - b.start)

  if (!valid.length) return baseColor

  const stops = [`${baseColor} 0%`]
  for (const z of valid) {
    const cs = Math.max(z.start, sliderMin)
    const ce = Math.min(z.end, sliderMax)
    if (ce <= cs) continue
    const sp = (((cs - sliderMin) / span) * 100).toFixed(3)
    const ep = (((ce - sliderMin) / span) * 100).toFixed(3)
    stops.push(
      `${baseColor} ${sp}%`,
      `${zoneColor} ${sp}%`,
      `${zoneColor} ${ep}%`,
      `${baseColor} ${ep}%`
    )
  }
  stops.push(`${baseColor} 100%`)

  return `linear-gradient(to right, ${stops.join(', ')})`
}
