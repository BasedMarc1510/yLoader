export function formatEditorTime(seconds) {
  const centiseconds = Math.round(Math.max(0, Number(seconds) || 0) * 100)
  const minutes = Math.floor(centiseconds / 6000)
  const remainder = ((centiseconds % 6000) / 100).toFixed(2).padStart(5, '0')
  return `${minutes}:${remainder}`
}

export function clampTrim(value, index, range, duration) {
  const rounded = Math.round(value * 100) / 100
  return index === 0
    ? Math.max(0, Math.min(range[1] - 0.05, rounded))
    : Math.min(duration, Math.max(range[0] + 0.05, rounded))
}
