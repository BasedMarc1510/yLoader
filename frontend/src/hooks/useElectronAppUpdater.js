import React from 'react'
import appPackage from '../../package.json'

const FALLBACK_APP_VERSION = String(appPackage?.version || '-').trim() || '-'
const EMPTY_PROGRESS = Object.freeze({
  percent: 0,
  bytesPerSecond: 0,
  transferred: 0,
  total: 0,
})

function normalizeNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function normalizeProgress(progress) {
  const input = progress && typeof progress === 'object' ? progress : {}
  return {
    percent: Math.min(Math.max(normalizeNumber(input.percent), 0), 100),
    bytesPerSecond: Math.max(0, Math.round(normalizeNumber(input.bytesPerSecond))),
    transferred: Math.max(0, Math.round(normalizeNumber(input.transferred))),
    total: Math.max(0, Math.round(normalizeNumber(input.total))),
  }
}

function normalizeUpdaterState(rawState, isElectronUpdaterAvailable) {
  const input = rawState && typeof rawState === 'object' ? rawState : {}
  const currentVersionRaw = String(input.currentVersion || FALLBACK_APP_VERSION).trim()
  const availableVersionRaw = String(input.availableVersion || '').trim()
  const downloadedVersionRaw = String(input.downloadedVersion || '').trim()
  const phaseRaw = String(input.phase || 'idle').trim()

  return {
    phase: phaseRaw || 'idle',
    currentVersion: currentVersionRaw || FALLBACK_APP_VERSION,
    availableVersion: availableVersionRaw,
    downloadedVersion: downloadedVersionRaw,
    progress: normalizeProgress(input.progress || EMPTY_PROGRESS),
    error: String(input.error || '').trim(),
    canAutoUpdate: input.canAutoUpdate !== undefined
      ? Boolean(input.canAutoUpdate)
      : Boolean(isElectronUpdaterAvailable),
    closeBlocked: Boolean(input.closeBlocked),
  }
}

export default function useElectronAppUpdater() {
  const runtime = typeof window !== 'undefined' ? window.yloaderRuntime : null
  const updaterApi = runtime?.appUpdater
  const isElectronUpdaterAvailable = Boolean(runtime?.isElectron && updaterApi)

  const [state, setState] = React.useState(() => normalizeUpdaterState(null, isElectronUpdaterAvailable))

  React.useEffect(() => {
    setState((previous) => normalizeUpdaterState(previous, isElectronUpdaterAvailable))

    if (!isElectronUpdaterAvailable) return undefined

    let mounted = true

    Promise.resolve(updaterApi.getState?.())
      .then((snapshot) => {
        if (!mounted) return
        setState(normalizeUpdaterState(snapshot, true))
      })
      .catch(() => {
        // keep fallback state if initial sync fails
      })

    const unsubscribe = updaterApi.onEvent?.((eventEnvelope) => {
      if (!mounted) return
      if (!eventEnvelope || typeof eventEnvelope !== 'object') return
      setState(normalizeUpdaterState(eventEnvelope.state, true))
    })

    return () => {
      mounted = false
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [isElectronUpdaterAvailable, updaterApi])

  const checkForUpdates = React.useCallback(() => {
    if (!isElectronUpdaterAvailable || typeof updaterApi?.checkForUpdates !== 'function') {
      return Promise.resolve({ ok: false, reason: 'unsupported' })
    }

    return updaterApi.checkForUpdates()
  }, [isElectronUpdaterAvailable, updaterApi])

  const downloadUpdate = React.useCallback(() => {
    if (!isElectronUpdaterAvailable || typeof updaterApi?.downloadUpdate !== 'function') {
      return Promise.resolve({ ok: false, reason: 'unsupported' })
    }

    return updaterApi.downloadUpdate()
  }, [isElectronUpdaterAvailable, updaterApi])

  const quitAndInstall = React.useCallback(() => {
    if (!isElectronUpdaterAvailable || typeof updaterApi?.quitAndInstall !== 'function') {
      return Promise.resolve({ ok: false, reason: 'unsupported' })
    }

    return updaterApi.quitAndInstall()
  }, [isElectronUpdaterAvailable, updaterApi])

  return {
    isElectronUpdaterAvailable,
    state,
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
  }
}
