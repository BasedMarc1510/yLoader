export const buildVideoOptions = (formats = []) => {
  const byHeight = new Map()

  for (const f of formats || []) {
    let height = f?.height
    if (!height) {
      const res = String(f?.resolution || '').toLowerCase()
      const m1 = res.match(/(\d{3,4})p/)
      const m2 = res.match(/x(\d{3,4})$/)
      height = m1 ? parseInt(m1[1], 10) : (m2 ? parseInt(m2[1], 10) : undefined)
    }
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

  const entries = Array.from(byHeight.entries()).sort((a, b) => parseInt(b[0], 10) - parseInt(a[0], 10))
  return entries.map(([label, f]) => ({ value: f.formatId, label, description: undefined }))
}

export const buildAudioOptions = (formats = []) => {
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

  const entries = Array.from(byAbr.entries()).sort((a, b) => parseInt(b[0], 10) - parseInt(a[0], 10))
  return entries.map(([label, f]) => ({ value: f.formatId, label, description: undefined }))
}
