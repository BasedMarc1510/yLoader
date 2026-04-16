const ERROR_PREFIX_REGEX = /^ERROR:\s*/i
const ANSI_ESCAPE_REGEX = /\u001B\[[0-?]*[ -/]*[@-~]/g

export const YT_DLP_ERROR_CODES = Object.freeze({
  UNSUPPORTED_URL: 'unsupported_url',
  GEO_RESTRICTED: 'geo_restricted',
  AUTH_REQUIRED: 'auth_required',
  AGE_RESTRICTED: 'age_restricted',
  PRIVATE_VIDEO: 'private_video',
  VIDEO_DELETED: 'video_deleted',
  VIDEO_UNAVAILABLE: 'video_unavailable',
  RATE_LIMITED: 'rate_limited',
  HTTP_FORBIDDEN: 'http_forbidden',
  HTTP_NOT_FOUND: 'http_not_found',
  CONTENT_TOO_SHORT: 'content_too_short',
  COOKIE_ERROR: 'cookie_error',
  NETWORK_ERROR: 'network_error',
  FFMPEG_REQUIRED: 'ffmpeg_required',
  UNKNOWN: 'unknown',
})

const ERROR_MATCHERS = [
  {
    code: YT_DLP_ERROR_CODES.RATE_LIMITED,
    pattern: /(\b429\b|too many requests|rate\s*limit|rate\s*limited)/i,
  },
  {
    code: YT_DLP_ERROR_CODES.GEO_RESTRICTED,
    pattern: /(geo[-\s]?restrict|not available from your location|not available in your (country|region))/i,
  },
  {
    code: YT_DLP_ERROR_CODES.AGE_RESTRICTED,
    pattern: /(age[-\s]?restricted|confirm your age|age verification|only available for age verified users)/i,
  },
  {
    code: YT_DLP_ERROR_CODES.PRIVATE_VIDEO,
    pattern: /(private video|this video is private|private subreddit|private content)/i,
  },
  {
    code: YT_DLP_ERROR_CODES.AUTH_REQUIRED,
    pattern: /(login required|sign in|log in|authentication (failed|required)|invalid session|subscription required|members?-only|requires? (cookies|account|authentication))/i,
  },
  {
    code: YT_DLP_ERROR_CODES.VIDEO_DELETED,
    pattern: /(video was deleted|has been deleted|has been removed|not available anymore|channel was closed)/i,
  },
  {
    code: YT_DLP_ERROR_CODES.UNSUPPORTED_URL,
    pattern: /(unsupported\s+url|unsupported\s+url\s+scheme|url\s+is\s+not\s+supported)/i,
  },
  {
    code: YT_DLP_ERROR_CODES.HTTP_NOT_FOUND,
    pattern: /(\b404\b|not found)/i,
  },
  {
    code: YT_DLP_ERROR_CODES.HTTP_FORBIDDEN,
    pattern: /(\b403\b|forbidden|access denied)/i,
  },
  {
    code: YT_DLP_ERROR_CODES.CONTENT_TOO_SHORT,
    pattern: /(content too short|incomplete read|did not get any data blocks)/i,
  },
  {
    code: YT_DLP_ERROR_CODES.COOKIE_ERROR,
    pattern: /(failed to load cookies|cookieloaderror|cookie(s)? (missing|invalid|required|rejected))/i,
  },
  {
    code: YT_DLP_ERROR_CODES.NETWORK_ERROR,
    pattern: /(network (is )?unreachable|connection (timed out|refused|reset|aborted)|temporary failure in name resolution|name or service not known|failed to resolve|ssl error|unable to download video data)/i,
  },
  {
    code: YT_DLP_ERROR_CODES.FFMPEG_REQUIRED,
    pattern: /(ffmpeg|ffprobe)(.*)(not found|required|missing|is not configured)/i,
  },
  {
    code: YT_DLP_ERROR_CODES.VIDEO_UNAVAILABLE,
    pattern: /(video unavailable|this video is unavailable|no video formats found|unable to extract .*video)/i,
  },
]

function stripAnsi(text) {
  return String(text || '').replace(ANSI_ESCAPE_REGEX, '')
}

function sanitizeLine(text) {
  return stripAnsi(String(text || ''))
    .replace(ERROR_PREFIX_REGEX, '')
    .replace(/\ufffd/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractYtDlpErrorLine(input) {
  const rawText = String(input || '')
  if (!rawText) return ''

  const lines = rawText
    .split(/\r?\n|\r/)
    .map((line) => stripAnsi(line).trim())
    .filter(Boolean)

  if (!lines.length) return ''

  const explicitErrorLine = lines.find((line) => ERROR_PREFIX_REGEX.test(line))
  if (explicitErrorLine) return explicitErrorLine

  const warningLikeLine = lines.find((line) => /^(error|fatal|exception)\b/i.test(line))
  if (warningLikeLine) return warningLikeLine

  return lines[lines.length - 1]
}

export function classifyYtDlpError(input, fallbackCode = YT_DLP_ERROR_CODES.UNKNOWN) {
  const selectedLine = extractYtDlpErrorLine(input)
  const rawMessage = sanitizeLine(selectedLine || input)

  if (!rawMessage) {
    return {
      code: fallbackCode,
      rawMessage: '',
      normalizedMessage: '',
      matchedBy: '',
    }
  }

  const matched = ERROR_MATCHERS.find((matcher) => matcher.pattern.test(rawMessage))

  return {
    code: matched?.code || fallbackCode,
    rawMessage,
    normalizedMessage: rawMessage.toLowerCase(),
    matchedBy: matched?.pattern?.source || '',
  }
}
