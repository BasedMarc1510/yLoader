export const adjustColorBrightness = (hex, percent) => {
  let r = parseInt(hex.substring(1, 3), 16)
  let g = parseInt(hex.substring(3, 5), 16)
  let b = parseInt(hex.substring(5, 7), 16)

  r = Math.max(0, Math.min(255, r + percent))
  g = Math.max(0, Math.min(255, g + percent))
  b = Math.max(0, Math.min(255, b + percent))

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

export const getContrastTextColor = (theme, backgroundColor, lightText = '#ffffff', darkText = '#111111') => {
  try {
    const darkContrast = theme.palette.getContrastRatio(backgroundColor, darkText)
    const lightContrast = theme.palette.getContrastRatio(backgroundColor, lightText)
    return darkContrast >= lightContrast ? darkText : lightText
  } catch {
    return lightText
  }
}

export const getSectionButtonBg = (isDark, isOpen) => {
  return isDark ? (isOpen ? '#272727' : '#1a1a1a') : (isOpen ? '#ffffff' : '#f9fafc')
}

export const getSectionButtonHover = (isDark) => {
  return isDark ? '#272727' : '#ffffff'
}
