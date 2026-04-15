export default function extractYtDlpError(msg) {
  if (!msg) return ''

  const lines = String(msg)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const errorLine = lines.find((line) => line.startsWith('ERROR:'))
  const raw = errorLine ? errorLine.replace(/^ERROR:\s*/, '') : (lines[0] || msg)

  // Sanitize Windows-1252 bytes misread as UTF-8 replacement chars (e.g. curly apostrophe -> ').
  return raw.replace(/\ufffd/g, '\u2019')
}
