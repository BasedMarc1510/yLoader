import {
  GENERIC_SERVICE_KEY,
  SERVICE_DEFINITIONS,
  getServiceDisplayName,
  getServiceThemeColor,
} from '../../utils/metadata'

function buildExamples(placeholder, service) {
  const examples = [placeholder]
  const serviceExamples = Array.isArray(service.exampleUrls) ? service.exampleUrls.slice(0, 3) : []

  for (const url of serviceExamples) {
    if (!url || examples.includes(url)) continue
    examples.push(url)
  }

  return examples
}

export default function buildServices(i18nT, mode) {
  const placeholder = i18nT('placeholders.genericUrl')
  const services = {}

  for (const service of SERVICE_DEFINITIONS) {
    const isGeneric = service.key === GENERIC_SERVICE_KEY
    const displayName = isGeneric ? i18nT('services.generic') : getServiceDisplayName(service.key)
    const baseColor = getServiceThemeColor(service.key)
    const effectiveColor = (mode === 'dark' && /^#000000$/i.test(baseColor)) ? '#FFFFFF' : baseColor

    services[service.key] = {
      name: displayName,
      examples: buildExamples(placeholder, service),
      icon: service.key,
      yColor: effectiveColor,
    }
  }

  return services
}
