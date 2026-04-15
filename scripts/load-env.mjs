import fs from 'fs'

function stripInlineComment(value) {
  let result = ''
  let quote = ''

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]
    const prev = i > 0 ? value[i - 1] : ''

    if ((char === '"' || char === "'") && prev !== '\\') {
      if (!quote) quote = char
      else if (quote === char) quote = ''
    }

    if (char === '#' && !quote) {
      break
    }

    result += char
  }

  return result.trim()
}

function normalizeValue(rawValue) {
  const trimmed = stripInlineComment(rawValue)
  if (!trimmed) return ''

  const first = trimmed[0]
  const last = trimmed[trimmed.length - 1]

  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    const inner = trimmed.slice(1, -1)
    if (first === '"') {
      return inner
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
    }

    return inner.replace(/\\'/g, "'").replace(/\\\\/g, '\\')
  }

  return trimmed
}

export function loadEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {}
  }

  const env = {}
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const normalized = trimmed.startsWith('export ')
      ? trimmed.slice('export '.length).trim()
      : trimmed

    const separatorIndex = normalized.indexOf('=')
    if (separatorIndex <= 0) continue

    const key = normalized.slice(0, separatorIndex).trim()
    if (!key) continue

    const rawValue = normalized.slice(separatorIndex + 1)
    env[key] = normalizeValue(rawValue)
  }

  return env
}
