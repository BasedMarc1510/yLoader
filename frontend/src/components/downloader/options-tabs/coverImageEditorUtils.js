export const COVER_EDITOR_ASPECT_OPTIONS = Object.freeze([
  { value: '1:1', ratio: 1, labelKey: 'downloader.coverEditorAspectSquare' },
  { value: '4:3', ratio: 4 / 3, labelKey: 'downloader.coverEditorAspectClassic' },
  { value: '16:9', ratio: 16 / 9, labelKey: 'downloader.coverEditorAspectWide' },
  { value: 'free', ratio: null, labelKey: 'downloader.coverEditorAspectFree' },
])

export function resolveCoverEditedFilename(value) {
  const raw = String(value || 'cover').trim()
  const cleaned = raw
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const baseName = (cleaned || 'cover').replace(/\.[^/.]+$/, '')
  return `${baseName}.jpg`
}

export function resolveCoverAspectRatio(mode) {
  const selectedOption = COVER_EDITOR_ASPECT_OPTIONS.find((option) => option.value === mode)
  if (!selectedOption) return 1
  if (selectedOption.value === 'free') return Number.NaN
  if (Number.isFinite(selectedOption.ratio) && selectedOption.ratio > 0) return selectedOption.ratio
  return 1
}
