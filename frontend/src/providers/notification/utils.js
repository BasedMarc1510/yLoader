export const HISTORY_STORAGE_KEY = 'yloader.notification-history.v2'
export const HISTORY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
export const HISTORY_MAX_ITEMS = 120
export const DEFAULT_DURATION_MS = 5000
export const MIN_DURATION_MS = 1000
export const CLEANUP_INTERVAL_MS = 60 * 60 * 1000

export function createNotificationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function normalizeSeverity(value) {
  const severity = String(value || '').trim().toLowerCase()
  if (severity === 'success' || severity === 'warning' || severity === 'error') return severity
  return 'info'
}

export function normalizeMessage(value) {
  return String(value || '').trim().slice(0, 1600)
}

export function normalizeDuration(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_DURATION_MS
  if (parsed <= 0) return 0
  return Math.max(MIN_DURATION_MS, Math.round(parsed))
}

function normalizeAction(action, fallbackId) {
  const label = String(action?.label || action?.actionLabel || '').trim()
  if (!label) return null

  const onClick = typeof action?.onClick === 'function'
    ? action.onClick
    : (typeof action?.onAction === 'function' ? action.onAction : null)

  if (!onClick) return null

  return {
    id: String(action?.id || fallbackId),
    label,
    onClick,
    autoClose: action?.autoClose !== false && action?.actionAutoClose !== false,
  }
}

export function normalizeActions(options = {}) {
  const actions = []

  if (Array.isArray(options?.actions)) {
    options.actions.forEach((action, index) => {
      const normalized = normalizeAction(action, `action-${index + 1}`)
      if (normalized) actions.push(normalized)
    })
  }

  const legacyAction = normalizeAction({
    id: 'legacy-action',
    label: options?.actionLabel,
    onAction: options?.onAction,
    actionAutoClose: options?.actionAutoClose,
  }, 'legacy-action')
  if (legacyAction) actions.push(legacyAction)

  return actions
}

export function pruneEntries(entries, now = Date.now()) {
  const filtered = entries
    .filter((entry) => entry && typeof entry === 'object')
    .filter((entry) => Number.isFinite(entry.createdAt))
    .filter((entry) => (now - entry.createdAt) <= HISTORY_RETENTION_MS)
    .sort((a, b) => b.createdAt - a.createdAt)

  return filtered.slice(0, HISTORY_MAX_ITEMS)
}

export function toStoredEntry(entry) {
  return {
    id: String(entry.id || createNotificationId()),
    message: normalizeMessage(entry.message),
    severity: normalizeSeverity(entry.severity),
    createdAt: Number(entry.createdAt) || Date.now(),
    read: Boolean(entry.read),
    status: 'dismissed',
  }
}

export function loadStoredEntries() {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const now = Date.now()
    const entries = parsed
      .map((entry) => ({
        id: String(entry?.id || createNotificationId()),
        message: normalizeMessage(entry?.message),
        severity: normalizeSeverity(entry?.severity),
        createdAt: Number(entry?.createdAt) || now,
        read: entry?.read !== false,
        status: 'dismissed',
        duration: 0,
        persistent: true,
        startTimerOnFocus: false,
        actions: [],
      }))
      .filter((entry) => Boolean(entry.message))

    return pruneEntries(entries, now)
  } catch {
    return []
  }
}

export function formatTimestamp(value, language) {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp)) return ''

  try {
    return new Intl.DateTimeFormat(language || undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp))
  } catch {
    return new Date(timestamp).toLocaleString()
  }
}
