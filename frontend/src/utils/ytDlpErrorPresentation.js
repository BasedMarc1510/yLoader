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
  if (!parsed) return null

  if (parsed.ytDlpError && typeof parsed.ytDlpError === 'object') {
    return {
      ...parsed.ytDlpError,
      message: parsed.message || parsed.ytDlpError.message || '',
      details: parsed.details || parsed.ytDlpError.details || '',
    }
  }

  if (typeof parsed.code === 'string' || parsed.rawMessage || parsed.message || parsed.details) {
    return parsed
  }

  return null
}

export function resolveYtDlpErrorInfo(value) {
  const payload = resolvePayload(value)
  const sourceText = payload?.rawMessage
    || payload?.message
    || payload?.details
    || (typeof value === 'string' ? value : '')

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
