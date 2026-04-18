function normalizeExtension(value) {
  return String(value || '')
    .trim()
    .replace(/^\./, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function trimPathValue(value) {
  return String(value || '').trim()
}

export function hasPathSeparator(value) {
  return /[\\/]/.test(String(value || ''))
}

export function splitPathValue(value) {
  const raw = trimPathValue(value)
  if (!raw) {
    return {
      directory: '',
      filename: '',
      separator: '/',
    }
  }

  const lastForwardSlash = raw.lastIndexOf('/')
  const lastBackSlash = raw.lastIndexOf('\\')
  const separatorIndex = Math.max(lastForwardSlash, lastBackSlash)

  if (separatorIndex < 0) {
    return {
      directory: '',
      filename: raw,
      separator: '/',
    }
  }

  return {
    directory: raw.slice(0, separatorIndex),
    filename: raw.slice(separatorIndex + 1),
    separator: raw[separatorIndex] === '\\' ? '\\' : '/',
  }
}

export function joinDirectoryAndFilename(directoryPath, filename, separatorHint = '') {
  const directory = trimPathValue(directoryPath).replace(/[\\/]+$/, '')
  const normalizedFilename = trimPathValue(filename)

  if (!directory) return normalizedFilename
  if (!normalizedFilename) return directory

  const separator = separatorHint
    || ((directory.includes('\\') && !directory.includes('/')) ? '\\' : '/')

  return `${directory}${separator}${normalizedFilename}`
}

function stripFilenameExtension(filename) {
  const value = trimPathValue(filename)
  if (!value) return ''

  const dotIndex = value.lastIndexOf('.')
  if (dotIndex <= 0) return value

  return value.slice(0, dotIndex)
}

export function applyExtensionToFilename(filename, extension) {
  const ext = normalizeExtension(extension)
  const normalizedFilename = stripFilenameExtension(filename)
  if (!normalizedFilename) return ext ? `download.${ext}` : 'download'
  if (!ext) return normalizedFilename
  return `${normalizedFilename}.${ext}`
}

export function updatePathExtension(pathValue, extension, fallbackBaseName = 'download') {
  const rawValue = trimPathValue(pathValue)
  const fallbackFilename = applyExtensionToFilename(fallbackBaseName, extension)

  if (!rawValue) return fallbackFilename

  const parts = splitPathValue(rawValue)
  const filename = applyExtensionToFilename(parts.filename || fallbackBaseName, extension)
  if (!parts.directory) return filename

  return joinDirectoryAndFilename(parts.directory, filename, parts.separator)
}

export function resolveFullPathValue({
  inputValue,
  defaultDirectory = '',
  fallbackBaseName = 'download',
  extension = '',
}) {
  const rawInputValue = trimPathValue(inputValue)
  const fallbackFilename = applyExtensionToFilename(fallbackBaseName, extension)

  if (!rawInputValue) {
    if (!defaultDirectory) return fallbackFilename
    return joinDirectoryAndFilename(defaultDirectory, fallbackFilename)
  }

  if (!hasPathSeparator(rawInputValue)) {
    const resolvedFilename = applyExtensionToFilename(rawInputValue, extension)
    if (!defaultDirectory) return resolvedFilename
    return joinDirectoryAndFilename(defaultDirectory, resolvedFilename)
  }

  const parts = splitPathValue(rawInputValue)
  const resolvedFilename = applyExtensionToFilename(parts.filename || fallbackBaseName, extension)

  if (!parts.directory) return resolvedFilename
  return joinDirectoryAndFilename(parts.directory, resolvedFilename, parts.separator)
}

export function getPathDirectory(pathValue) {
  return splitPathValue(pathValue).directory
}

export function getPathFilename(pathValue) {
  return splitPathValue(pathValue).filename
}
