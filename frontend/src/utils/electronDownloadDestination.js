import {
  normalizeDownloadSettings,
  resolveDownloadTargetSettings,
} from './downloadSettings'

function getRuntimeBridge() {
  if (typeof window === 'undefined') return null
  const runtime = window?.yloaderRuntime
  if (!runtime?.isElectron) return null
  if (!runtime?.downloads) return null
  return runtime
}

function sanitizeFilenamePart(value, fallback = 'download') {
  const normalized = String(value || '')
    .replace(/\u0000/g, '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized || normalized === '.' || normalized === '..') return fallback
  return normalized
}

function normalizeExtension(value) {
  const normalized = String(value || '').trim().replace(/^\./, '').toLowerCase()
  if (!normalized) return ''
  return normalized.replace(/[^a-z0-9]+/g, '')
}

function isMissingHandlerError(channelName, error) {
  const message = String(error?.message || error || '').trim().toLowerCase()
  if (!message) return false
  const normalizedChannelName = String(channelName || '').trim().toLowerCase()
  if (!normalizedChannelName) return false
  return message.includes(`no handler registered for '${normalizedChannelName}'`)
}

function joinDirectoryAndFilename(directoryPath, filename) {
  const cleanDirectory = String(directoryPath || '').trim().replace(/[\\/]+$/, '')
  const safeFilename = sanitizeFilenamePart(filename || '', 'download')
  if (!cleanDirectory) return safeFilename

  const separator = cleanDirectory.includes('\\') && !cleanDirectory.includes('/') ? '\\' : '/'
  return `${cleanDirectory}${separator}${safeFilename}`
}

async function pickSavePathWithFallback(runtime, { initialDirectory, suggestedName }) {
  const downloadsBridge = runtime?.downloads
  const canPickSavePath = typeof downloadsBridge?.pickSavePath === 'function'
  const canPickDirectory = typeof downloadsBridge?.pickDirectory === 'function'

  if (canPickSavePath) {
    try {
      const pickedSavePath = await downloadsBridge.pickSavePath({
        initialDirectory,
        suggestedName,
      })
      return {
        canceled: Boolean(pickedSavePath?.canceled),
        path: String(pickedSavePath?.path || '').trim(),
      }
    } catch (error) {
      if (!isMissingHandlerError('downloads:pick-save-path', error)) {
        throw error
      }
    }
  }

  if (!canPickDirectory) {
    return { canceled: false, path: '' }
  }

  let pickedDirectory = null
  try {
    pickedDirectory = await downloadsBridge.pickDirectory(initialDirectory)
  } catch (error) {
    if (!isMissingHandlerError('downloads:pick-directory', error)) {
      throw error
    }
    return { canceled: false, path: '' }
  }

  if (!pickedDirectory || pickedDirectory.canceled || !pickedDirectory.path) {
    return { canceled: true, path: '' }
  }

  return {
    canceled: false,
    path: joinDirectoryAndFilename(pickedDirectory.path, suggestedName),
  }
}

export function buildSuggestedDownloadFilename(baseName, extension = '') {
  const safeBase = sanitizeFilenamePart(baseName, 'download').replace(/\.[^/.]+$/, '')
  const ext = normalizeExtension(extension)
  if (!ext) return safeBase
  return `${safeBase}.${ext}`
}

async function parseApiError(response) {
  let message = `HTTP ${response?.status || 500}`
  try {
    const payload = await response.json()
    message = String(payload?.error || payload?.details || message)
  } catch {
    // keep default fallback message
  }
  return message
}

async function fetchDownloadSettings(apiBase) {
  const response = await fetch(`${apiBase}/api/download/settings`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  const payload = await response.json()
  return normalizeDownloadSettings(payload)
}

export async function resolveElectronDownloadDestination({
  apiBase,
  downloadType,
  suggestedFilename,
  preferredDirectory = '',
}) {
  const runtime = getRuntimeBridge()
  if (!runtime) {
    return { enabled: false, canceled: false, electronSavePath: '', electronTargetDirectory: '' }
  }

  const settings = await fetchDownloadSettings(apiBase)
  const target = resolveDownloadTargetSettings(settings, downloadType)
  const configuredDirectory = String(preferredDirectory || '').trim()
    || String(target.directoryPath || '').trim()
    || String(runtime.downloadsPath || '').trim()

  if (target.alwaysAsk) {
    const safeSuggestedFilename = sanitizeFilenamePart(suggestedFilename || '', 'download')
    const picked = await pickSavePathWithFallback(runtime, {
      initialDirectory: configuredDirectory,
      suggestedName: safeSuggestedFilename,
    })

    if (!picked || picked.canceled || !picked.path) {
      if (!picked || picked.canceled) {
        return { enabled: true, canceled: true, electronSavePath: '', electronTargetDirectory: '' }
      }

      return {
        enabled: true,
        canceled: false,
        electronSavePath: '',
        electronTargetDirectory: configuredDirectory,
      }
    }

    return {
      enabled: true,
      canceled: false,
      electronSavePath: String(picked.path || '').trim(),
      electronTargetDirectory: '',
    }
  }

  return {
    enabled: true,
    canceled: false,
    electronSavePath: '',
    electronTargetDirectory: configuredDirectory,
  }
}
