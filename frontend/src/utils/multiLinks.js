export function normalizeMultiLinksValue(rawValue) {
  const text = String(rawValue || '').replace(/\r/g, '')
  if (!text) return ''

  const commaSeparatedAsLines = text.replace(
    /(\S)\s*,\s*(?=\S)/g,
    '$1\n'
  )

  return commaSeparatedAsLines
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
}

export function parseMultiLinks(rawValue) {
  return normalizeMultiLinksValue(rawValue)
    .split('\n')
    .map((line) => String(line || '').trim())
    .filter(Boolean)
}

export function normalizeHttpLink(rawValue) {
  const input = String(rawValue || '').trim()
  if (!input) return ''

  return /^[a-z][a-z\d+.-]*:\/\//i.test(input)
    ? input
    : `https://${input}`
}

export function isLikelyValidHttpLink(rawValue) {
  const candidate = normalizeHttpLink(rawValue)
  if (!candidate) return false

  let parsed
  try {
    parsed = new URL(candidate)
  } catch {
    return false
  }

  const protocol = String(parsed.protocol || '').toLowerCase()
  if (protocol !== 'http:' && protocol !== 'https:') return false

  const hostname = String(parsed.hostname || '').trim().toLowerCase()
  if (!hostname) return false

  if (hostname === 'localhost') return true
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return true
  if (hostname.includes(':')) return true

  return hostname.includes('.')
}
