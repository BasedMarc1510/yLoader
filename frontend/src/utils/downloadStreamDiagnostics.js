import { formatYtDlpErrorMessage } from './ytDlpErrorPresentation'

function normalizeDiagnosticLine(value) {
  const text = String(value || '').trim()
  if (!text) return ''

  if (/^\[download\][^\n\r]*\d+(?:[\.,]\d+)?%/i.test(text)) return ''

  return text
}

export function appendDownloadDiagnostic(lines, rawValue, limit = 8) {
  const nextLines = Array.isArray(lines) ? [...lines] : []
  const chunks = String(rawValue || '')
    .split(/\r?\n/)
    .map(normalizeDiagnosticLine)
    .filter(Boolean)

  for (const line of chunks) {
    nextLines.push(line)
    if (nextLines.length > limit) {
      nextLines.shift()
    }
  }

  return nextLines
}

export function resolveDownloadDiagnosticMessage(i18nT, lines, fallbackKey = 'downloader.errorDownloadFailed') {
  const diagnosticText = Array.isArray(lines)
    ? lines.slice(-4).join('\n').trim()
    : ''

  if (!diagnosticText) {
    return i18nT(fallbackKey)
  }

  return formatYtDlpErrorMessage(i18nT, diagnosticText, {
    fallbackKey,
    includeRawForUnknown: true,
  })
}
