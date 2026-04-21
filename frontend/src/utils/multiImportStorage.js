export const HOME_MULTI_IMPORT_STORAGE_PREFIX = 'yloader.home.multiImport.'
export const DOWNLOADER_MULTI_IMPORT_STORAGE_PREFIX = 'yloader.downloader.multiImport.'

export function createRuntimeToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function persistMultiImportPayload(storagePrefix, rawText) {
  const prefix = String(storagePrefix || '').trim()
  const text = String(rawText || '').replace(/\r/g, '').trim()
  if (!prefix || !text || typeof window === 'undefined' || !window.sessionStorage) return ''

  const token = createRuntimeToken()
  try {
    window.sessionStorage.setItem(`${prefix}${token}`, text)
    return token
  } catch {
    return ''
  }
}

export function consumeMultiImportPayload(storagePrefix, token) {
  const prefix = String(storagePrefix || '').trim()
  const importToken = String(token || '').trim()
  if (!prefix || !importToken || typeof window === 'undefined' || !window.sessionStorage) return ''

  try {
    const key = `${prefix}${importToken}`
    const value = String(window.sessionStorage.getItem(key) || '')
    window.sessionStorage.removeItem(key)
    return value
  } catch {
    return ''
  }
}
