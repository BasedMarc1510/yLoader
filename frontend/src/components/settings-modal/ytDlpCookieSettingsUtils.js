export const CHROMIUM_COOKIE_BROWSERS = new Set(['brave', 'chrome', 'chromium', 'edge', 'opera', 'vivaldi', 'whale'])

export function resolveBrowserLabel(t, value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return ''
  const key = `settings.cookieBrowserName.${normalized}`
  const translated = t(key)
  return translated === key ? normalized : translated
}

export function resolveKeyringLabel(t, value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return ''
  const key = `settings.cookieKeyringName.${normalized}`
  const translated = t(key)
  return translated === key ? normalized : translated
}

export function resolveCookieFileValidationMessage(t, validationState, resolvedPath) {
  if (!validationState) return ''

  if (validationState === 'missing') {
    return t('settings.cookieFileMissing', { path: resolvedPath || '' })
  }
  if (validationState === 'not-file') {
    return t('settings.cookieFileNotFile', { path: resolvedPath || '' })
  }
  if (validationState === 'not-readable') {
    return t('settings.cookieFileNotReadable', { path: resolvedPath || '' })
  }
  if (validationState === 'invalid') {
    return t('settings.cookieFileInvalid', { path: resolvedPath || '' })
  }

  return ''
}
