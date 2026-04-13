export const SERVICE_TO_PATH = {
  youtube: '/youtube-downloader',
  reddit: '/reddit-downloader',
  x: '/x-downloader',
  generic: '/generic-downloader',
}

export const PATH_TO_SERVICE = {
  '/youtube-downloader': 'youtube',
  '/reddit-downloader': 'reddit',
  '/x-downloader': 'x',
  '/generic-downloader': 'generic',
}

const ALLOWED_PATHS = new Set([
  '/',
  '/downloads',
  '/support',
  ...Object.keys(PATH_TO_SERVICE),
])

export const DOWNLOADER_PATHS = new Set(Object.keys(PATH_TO_SERVICE))

export function normalizeTabPath(path) {
  const normalized = String(path || '').trim()
  return ALLOWED_PATHS.has(normalized) ? normalized : '/'
}

export function normalizeTabSearch(search) {
  const raw = String(search || '').trim()
  if (!raw) return ''
  const prefixed = raw.startsWith('?') ? raw : `?${raw}`
  return prefixed.slice(0, 1024)
}

export function isDownloaderPath(path) {
  return DOWNLOADER_PATHS.has(normalizeTabPath(path))
}

export function getPathForService(serviceKey) {
  return SERVICE_TO_PATH[String(serviceKey || '').trim()] || SERVICE_TO_PATH.generic
}

export function getServiceForPath(path) {
  return PATH_TO_SERVICE[normalizeTabPath(path)] || null
}

export function getRouteTitle(path, t) {
  const normalized = normalizeTabPath(path)
  if (normalized === '/downloads') return t('routes.downloads')
  if (normalized === '/support') return t('routes.support')
  if (normalized === '/youtube-downloader') return t('routes.youtubeDownloader')
  if (normalized === '/reddit-downloader') return t('routes.redditDownloader')
  if (normalized === '/x-downloader') return t('routes.xDownloader')
  if (normalized === '/generic-downloader') return t('routes.genericDownloader')
  return t('routes.home')
}

export function getRouteIconKey(path) {
  const normalized = normalizeTabPath(path)
  if (normalized === '/downloads') return 'downloads'
  if (normalized === '/support') return 'support'
  if (normalized === '/youtube-downloader') return 'youtube'
  if (normalized === '/reddit-downloader') return 'reddit'
  if (normalized === '/x-downloader') return 'x'
  if (normalized === '/generic-downloader') return 'generic'
  return 'home'
}
