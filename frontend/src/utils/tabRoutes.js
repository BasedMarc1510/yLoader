import {
  GENERIC_SERVICE_KEY,
  SERVICE_KEYS,
  detectService,
  getServiceDisplayName,
  normalizeServiceKey,
} from './metadata'
import {
  normalizeTabPath,
  normalizeTabSearch,
} from '../../../shared/tabs/tabRuntime.js'

export const SERVICE_TO_PATH = Object.freeze(
  SERVICE_KEYS.reduce((accumulator, key) => {
    accumulator[key] = '/'
    return accumulator
  }, {})
)

const VALID_SERVICE_KEYS = new Set(Object.keys(SERVICE_TO_PATH))

const DOWNLOADER_SOURCE_PARAM = 'source'
const LEGACY_DOWNLOADER_SOURCE_PARAM = 'url'

export const DOWNLOADER_PATHS = new Set()

function getDownloaderSourceFromParams(params) {
  return String(
    params.get(DOWNLOADER_SOURCE_PARAM)
    || params.get(LEGACY_DOWNLOADER_SOURCE_PARAM)
    || ''
  ).trim()
}

function hasUrlInSearch(search) {
  const normalizedSearch = normalizeTabSearch(search)
  if (!normalizedSearch) return false

  const params = new URLSearchParams(normalizedSearch)
  return Boolean(getDownloaderSourceFromParams(params))
}

function hasMultiDownloadInSearch(search) {
  const normalizedSearch = normalizeTabSearch(search)
  if (!normalizedSearch) return false

  const params = new URLSearchParams(normalizedSearch)
  const multiFlag = String(params.get('multiDownload') || '').trim()
  if (multiFlag !== '1') return false

  const token = String(params.get('multiImportToken') || '').trim()
  const inlineLinks = String(params.get('links') || '').trim()
  return Boolean(token || inlineLinks)
}

function hasDownloaderInSearch(search) {
  return hasUrlInSearch(search) || hasMultiDownloadInSearch(search)
}

function getServiceFromSearch(search) {
  const normalizedSearch = normalizeTabSearch(search)
  if (!normalizedSearch) return null

  const params = new URLSearchParams(normalizedSearch)
  const serviceParam = normalizeServiceKey(params.get('service'))
  if (serviceParam && VALID_SERVICE_KEYS.has(serviceParam)) return serviceParam

  const urlParam = getDownloaderSourceFromParams(params)
  if (!urlParam) return null
  return detectService(urlParam) || GENERIC_SERVICE_KEY
}

export { normalizeTabPath, normalizeTabSearch }

export function isDownloaderPath(path) {
  return DOWNLOADER_PATHS.has(normalizeTabPath(path))
}

export function getPathForService(serviceKey) {
  const normalizedService = normalizeServiceKey(serviceKey)
  return SERVICE_TO_PATH[normalizedService || GENERIC_SERVICE_KEY] || '/'
}

export function getServiceForPath(path, search = '') {
  if (normalizeTabPath(path) !== '/' || !hasUrlInSearch(search)) return null
  return getServiceFromSearch(search)
}

export function getRouteTitle(path, t, search = '') {
  const normalized = normalizeTabPath(path)
  if (normalized === '/search') return t('routes.search')
  if (normalized === '/downloads') return t('routes.downloads')
  if (normalized === '/support') return t('routes.support')
  if (normalized === '/' && hasDownloaderInSearch(search)) {
    if (!hasUrlInSearch(search)) return t('routes.downloader')

    const service = getServiceFromSearch(search) || GENERIC_SERVICE_KEY
    if (service === GENERIC_SERVICE_KEY) return t('routes.genericDownloader')
    return t('downloader.title', { service: getServiceDisplayName(service) })
  }
  return t('routes.home')
}

export function getRouteIconKey(path, search = '') {
  const normalized = normalizeTabPath(path)
  if (normalized === '/search') return 'search'
  if (normalized === '/downloads') return 'downloads'
  if (normalized === '/support') return 'support'
  if (normalized === '/' && hasDownloaderInSearch(search)) {
    if (!hasUrlInSearch(search)) return 'downloads'
    return getServiceFromSearch(search) || GENERIC_SERVICE_KEY
  }
  return 'home'
}
