import {
  classifyYtDlpError,
  YT_DLP_ERROR_CODES,
} from '../../../shared/errors/ytDlpErrorCatalog.js'

const TRANSLATION_KEY_BY_CODE = Object.freeze({
  [YT_DLP_ERROR_CODES.UNSUPPORTED_URL]: 'downloader.errorUnsupportedUrl',
  [YT_DLP_ERROR_CODES.GEO_RESTRICTED]: 'downloader.errorGeoRestricted',
  [YT_DLP_ERROR_CODES.AUTH_REQUIRED]: 'downloader.errorAuthRequired',
  [YT_DLP_ERROR_CODES.AGE_RESTRICTED]: 'downloader.errorAgeRestricted',
  [YT_DLP_ERROR_CODES.PRIVATE_VIDEO]: 'downloader.errorPrivateVideo',
  [YT_DLP_ERROR_CODES.VIDEO_DELETED]: 'downloader.errorVideoDeleted',
  [YT_DLP_ERROR_CODES.VIDEO_UNAVAILABLE]: 'downloader.errorVideoUnavailable',
  [YT_DLP_ERROR_CODES.RATE_LIMITED]: 'downloader.errorRateLimited',
  [YT_DLP_ERROR_CODES.HTTP_FORBIDDEN]: 'downloader.errorHttpForbidden',
  [YT_DLP_ERROR_CODES.HTTP_NOT_FOUND]: 'downloader.errorNotFound',
  [YT_DLP_ERROR_CODES.CONTENT_TOO_SHORT]: 'downloader.errorContentTooShort',
  [YT_DLP_ERROR_CODES.COOKIE_ERROR]: 'downloader.errorCookieError',
  [YT_DLP_ERROR_CODES.NETWORK_ERROR]: 'downloader.errorNetwork',
  [YT_DLP_ERROR_CODES.FFMPEG_REQUIRED]: 'downloader.errorFfmpegRequired',
})

const COOKIE_SETTINGS_HINT_CODES = new Set([
  YT_DLP_ERROR_CODES.COOKIE_ERROR,
  YT_DLP_ERROR_CODES.AUTH_REQUIRED,
  YT_DLP_ERROR_CODES.AGE_RESTRICTED,
])

function parseStructuredValue(value) {
  if (!value) return null
  if (typeof value === 'object') return value

  const text = String(value || '').trim()
  if (!text) return null

  try {
    const parsed = JSON.parse(text)
    return (parsed && typeof parsed === 'object') ? parsed : null
  } catch {
    return null
  }
}

function resolvePayload(value) {
  const parsed = parseStructuredValue(value)
  if (!parsed) {
    return null
  }

  if (parsed.ytDlpError && typeof parsed.ytDlpError === 'object') {
    const res = {
      ...parsed.ytDlpError,
      message: parsed.message || parsed.error || parsed.ytDlpError.message || '',
      details: parsed.details || parsed.ytDlpError.details || '',
    }
    return res
  }

  if (typeof parsed.code === 'string' || parsed.rawMessage || parsed.message || parsed.details || parsed.error) {
    if (parsed.error && !parsed.message) {
      parsed.message = parsed.error
    }
    return parsed
  }
  return null
}

export function resolveYtDlpErrorInfo(value) {
  const payload = resolvePayload(value)
  
  const parts = []
  if (payload?.rawMessage) parts.push(payload.rawMessage)
  if (payload?.message) parts.push(payload.message)
  if (payload?.error) parts.push(payload.error)
  if (payload?.details) parts.push(payload.details)

  const sourceText = parts.length > 0 
    ? parts.join('\n') 
    : (typeof value === 'string' ? value : '')

  const classified = classifyYtDlpError(sourceText)

  return {
    code: payload?.code || classified.code,
    rawMessage: payload?.rawMessage || classified.rawMessage || '',
  }
}

export function formatYtDlpErrorMessage(i18nT, value, options = {}) {
  const fallbackKey = options.fallbackKey || 'downloader.errorDownloadFailed'
  const includeRawForUnknown = Boolean(options.includeRawForUnknown)
  const fallbackText = i18nT(fallbackKey)

  const { code, rawMessage } = resolveYtDlpErrorInfo(value)

  const translationKey = TRANSLATION_KEY_BY_CODE[code]
  if (translationKey) {
    return i18nT(translationKey)
  }

  if (includeRawForUnknown && rawMessage) {
    if (rawMessage.toLowerCase() === String(fallbackText || '').toLowerCase()) {
      return fallbackText
    }
    return i18nT('downloader.errorDownloadFailedWithReason', { reason: rawMessage })
  }
  return fallbackText
}

export function shouldSuggestCookieSettings(value, options = {}) {
  const { i18nT } = options
  const { code, rawMessage } = resolveYtDlpErrorInfo(value)

  if (COOKIE_SETTINGS_HINT_CODES.has(code)) return true

  const sourceText = String(rawMessage || value || '').trim()
  if (!sourceText) return false

  const normalizedText = sourceText.toLowerCase()
  if (/(cookie|login required|sign in|log in|authentication|age[-\s]?restrict)/i.test(normalizedText)) {
    return true
  }

  if (typeof i18nT === 'function') {
    const knownLocalizedMessages = [
      i18nT('downloader.errorCookieError'),
      i18nT('downloader.errorAuthRequired'),
      i18nT('downloader.errorAgeRestricted'),
    ]
      .map((entry) => String(entry || '').trim().toLowerCase())
      .filter(Boolean)

    return knownLocalizedMessages.includes(normalizedText)
  }

  return false
}
