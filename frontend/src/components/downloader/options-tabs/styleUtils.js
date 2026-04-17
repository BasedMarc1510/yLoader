export const adjustColorBrightness = (hex, percent) => {
  let r = parseInt(hex.substring(1, 3), 16)
  let g = parseInt(hex.substring(3, 5), 16)
  let b = parseInt(hex.substring(5, 7), 16)

  r = Math.max(0, Math.min(255, r + percent))
  g = Math.max(0, Math.min(255, g + percent))
  b = Math.max(0, Math.min(255, b + percent))

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

const normalizeHexColor = (value) => {
  const raw = String(value || '').trim()
  if (!raw.startsWith('#')) return null

  const hex = raw.slice(1)
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    const [r, g, b] = hex
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }

  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex}`.toLowerCase()
  }

  return null
}

const toLinearChannel = (channel) => {
  const normalized = channel / 255
  if (normalized <= 0.03928) return normalized / 12.92
  return ((normalized + 0.055) / 1.055) ** 2.4
}

const getRelativeLuminance = (hexColor) => {
  const r = parseInt(hexColor.slice(1, 3), 16)
  const g = parseInt(hexColor.slice(3, 5), 16)
  const b = parseInt(hexColor.slice(5, 7), 16)

  const lr = toLinearChannel(r)
  const lg = toLinearChannel(g)
  const lb = toLinearChannel(b)

  return (0.2126 * lr) + (0.7152 * lg) + (0.0722 * lb)
}

const getContrastRatio = (firstHex, secondHex) => {
  const first = getRelativeLuminance(firstHex)
  const second = getRelativeLuminance(secondHex)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

export const getContrastTextColor = (theme, backgroundColor, lightText = '#ffffff', darkText = '#111111') => {
  const normalizedBackground = normalizeHexColor(backgroundColor)
  const normalizedLight = normalizeHexColor(lightText)
  const normalizedDark = normalizeHexColor(darkText)

  if (normalizedBackground && normalizedLight && normalizedDark) {
    const darkContrast = getContrastRatio(normalizedBackground, normalizedDark)
    const lightContrast = getContrastRatio(normalizedBackground, normalizedLight)
    return darkContrast >= lightContrast ? darkText : lightText
  }

  try {
    return theme?.palette?.getContrastText?.(backgroundColor) || lightText
  } catch {
    return lightText
  }
}

export const getSectionButtonBg = (isDark, isOpen) => {
  return isDark ? (isOpen ? '#272727' : '#1a1a1a') : '#ffffff'
}

export const getSectionButtonHover = (isDark) => {
  return isDark ? '#272727' : '#f7f8fa'
}

export const getSectionButtonBorder = (isDark, isOpen) => {
  if (isDark) return 'none'
  return isOpen ? '1px solid #dcdee2' : '1px solid #e2e4e8'
}

export const getSectionButtonShadow = (isDark) => {
  if (isDark) return 'none'
  return '0 1px 3px rgba(0,0,0,0.04)'
}
