export function clampProgress(value) {
  const raw = Number(value)
  if (!Number.isFinite(raw)) return 0
  return Math.max(0, Math.min(100, Math.round(raw)))
}

export function getTabDomId(tabId) {
  return `yl-tab-${tabId}`
}

export function getPanelDomId(tabId) {
  return `yl-tabpanel-${tabId}`
}
