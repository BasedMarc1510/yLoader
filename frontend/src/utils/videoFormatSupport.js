export function isUsableVideoFormat(value) {
  const formatId = String(value?.formatId || '').trim().toLowerCase()
  const ext = String(value?.ext || '').trim().toLowerCase()
  const vcodec = String(value?.vcodec || 'none').trim().toLowerCase() || 'none'
  const acodec = String(value?.acodec || 'none').trim().toLowerCase() || 'none'

  if (!formatId) return false
  if (formatId.startsWith('sb')) return false
  if (ext === 'mhtml') return false
  if (vcodec === 'none' && acodec === 'none') return false

  return true
}
