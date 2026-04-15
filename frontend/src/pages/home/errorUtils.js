export function extractYtDlpError(msg) {
  if (!msg) return ''

  const lines = String(msg)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const errorLine = lines.find((line) => line.startsWith('ERROR:'))
  const raw = errorLine ? errorLine.replace(/^ERROR:\s*/, '') : (lines[0] || msg)
  return raw.replace(/\ufffd/g, '\u2019')
}
