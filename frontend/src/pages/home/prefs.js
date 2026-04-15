import { HOME_AUTO_PREFS_KEY } from './constants'

export function readHomeAutoDownloadPrefs() {
  if (typeof window === 'undefined') {
    return { enabled: false, format: 'mp4' }
  }

  try {
    const raw = localStorage.getItem(HOME_AUTO_PREFS_KEY)
    if (!raw) return { enabled: false, format: 'mp4' }

    const parsed = JSON.parse(raw)
    return {
      enabled: Boolean(parsed?.enabled),
      format: parsed?.format === 'mp3' ? 'mp3' : 'mp4',
    }
  } catch {
    return { enabled: false, format: 'mp4' }
  }
}

export function persistHomeAutoDownloadPrefs(enabled, format) {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(HOME_AUTO_PREFS_KEY, JSON.stringify({
      enabled: Boolean(enabled),
      format: format === 'mp3' ? 'mp3' : 'mp4',
    }))
  } catch {
    // ignore local persistence errors
  }
}
