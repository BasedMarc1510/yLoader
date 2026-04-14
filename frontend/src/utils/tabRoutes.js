import { detectService } from './metadata'

export const SERVICE_TO_PATH = {
  youtube: '/',
  reddit: '/',
  x: '/',
  generic: '/',
}

const LEGACY_PATH_TO_SERVICE = {
  '/downloader': 'generic',
  '/youtube-downloader': 'youtube',
  '/reddit-downloader': 'reddit',
  '/x-downloader': 'x',
  '/generic-downloader': 'generic',
}

const VALID_SERVICE_KEYS = new Set(Object.keys(SERVICE_TO_PATH))

const ALLOWED_PATHS = new Set([
  '/',
  '/downloads',
  '/support',
])

export const DOWNLOADER_PATHS = new Set()

function normalizeLegacyPath(path) {
  const normalized = String(path || '').trim()
  if (Object.prototype.hasOwnProperty.call(LEGACY_PATH_TO_SERVICE, normalized)) {
    return '/'
  }
  return normalized
}

function hasUrlInSearch(search) {
  const normalizedSearch = normalizeTabSearch(search)
  if (!normalizedSearch) return false

  const params = new URLSearchParams(normalizedSearch)
  return Boolean(String(params.get('url') || '').trim())
}

function getServiceFromSearch(search) {
  const normalizedSearch = normalizeTabSearch(search)
  if (!normalizedSearch) return null

  const params = new URLSearchParams(normalizedSearch)
  const serviceParam = String(params.get('service') || '').trim().toLowerCase()
  if (VALID_SERVICE_KEYS.has(serviceParam)) return serviceParam

  const urlParam = String(params.get('url') || '').trim()
  if (!urlParam) return null
  return detectService(urlParam) || 'generic'
}

export function normalizeTabPath(path) {
  const normalized = normalizeLegacyPath(path)
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

export function getServiceForPath(path, search = '') {
  if (normalizeTabPath(path) !== '/' || !hasUrlInSearch(search)) return null
  return getServiceFromSearch(search)
}

export function getRouteTitle(path, t, search = '') {
  const normalized = normalizeTabPath(path)
  if (normalized === '/downloads') return t('routes.downloads')
  if (normalized === '/support') return t('routes.support')
  if (normalized === '/' && hasUrlInSearch(search)) {
    return t('routes.downloader')
  }
  return t('routes.home')
}

export function getRouteIconKey(path, search = '') {
  const normalized = normalizeTabPath(path)
  if (normalized === '/downloads') return 'downloads'
  if (normalized === '/support') return 'support'
  if (normalized === '/' && hasUrlInSearch(search)) {
    return getServiceFromSearch(search) || 'generic'
  }
  return 'home'
}
