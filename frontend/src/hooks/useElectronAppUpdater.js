import React from 'react'
import appPackage from '../../package.json'
import { getApiBase } from '../utils/metadata'

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
    canCheckForUpdates: input.canCheckForUpdates !== undefined
      ? Boolean(input.canCheckForUpdates)
      : Boolean(isElectronUpdaterAvailable),
    canAutoUpdate: input.canAutoUpdate !== undefined
      ? Boolean(input.canAutoUpdate)
      : Boolean(isElectronUpdaterAvailable),
    autoUpdateEnabled: input.autoUpdateEnabled !== undefined
      ? Boolean(input.autoUpdateEnabled)
      : true,
    manualDownloadOnly: Boolean(input.manualDownloadOnly),
    releasePageUrl: String(input.releasePageUrl || '').trim(),
    closeBlocked: Boolean(input.closeBlocked),
    deploymentTarget: String(input.deploymentTarget || '').trim(),
    runtimeTarget: String(input.runtimeTarget || '').trim(),
  }
}

async function fetchWebUpdaterStateSnapshot(apiBase, { forceLatest = false } = {}) {
  const query = forceLatest ? '?forceLatest=1' : ''
  const response = await fetch(`${apiBase}/api/app/update-status${query}`)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return response.json()
}

export default function useElectronAppUpdater() {
  const runtime = typeof window !== 'undefined' ? window.yloaderRuntime : null
  const updaterApi = runtime?.appUpdater
  const isElectronUpdaterAvailable = Boolean(runtime?.isElectron && updaterApi)
  const API_BASE = getApiBase()

  const [state, setState] = React.useState(() => normalizeUpdaterState(null, isElectronUpdaterAvailable))

  React.useEffect(() => {
    setState((previous) => normalizeUpdaterState(previous, isElectronUpdaterAvailable))

    if (!isElectronUpdaterAvailable) {
      let cancelled = false

      const syncWebState = async (forceLatest = false) => {
        try {
          const snapshot = await fetchWebUpdaterStateSnapshot(API_BASE, { forceLatest })
          if (cancelled) return
          setState(normalizeUpdaterState(snapshot, false))
        } catch (error) {
          if (cancelled) return
          setState((previous) => normalizeUpdaterState({
            ...previous,
            phase: 'error',
            error: String(error?.message || error || ''),
          }, false))
        }
      }

      syncWebState(false)
      const interval = window.setInterval(() => {
        syncWebState(false)
      }, 90_000)

      return () => {
        cancelled = true
        window.clearInterval(interval)
      }
    }

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
  }, [API_BASE, isElectronUpdaterAvailable, updaterApi])

  const checkForUpdates = React.useCallback(() => {
    if (isElectronUpdaterAvailable) {
      if (typeof updaterApi?.checkForUpdates !== 'function') {
        return Promise.resolve({ ok: false, reason: 'unsupported' })
      }

      return updaterApi.checkForUpdates()
    }

    return fetchWebUpdaterStateSnapshot(API_BASE, { forceLatest: true })
      .then((snapshot) => {
        setState(normalizeUpdaterState(snapshot, false))
        return { ok: true }
      })
      .catch((error) => {
        const message = String(error?.message || error || '')
        setState((previous) => normalizeUpdaterState({
          ...previous,
          phase: 'error',
          error: message,
        }, false))
        return { ok: false, error: message }
      })
  }, [API_BASE, isElectronUpdaterAvailable, updaterApi])

  const downloadUpdate = React.useCallback(() => {
    if (isElectronUpdaterAvailable) {
      if (typeof updaterApi?.downloadUpdate !== 'function') {
        return Promise.resolve({ ok: false, reason: 'unsupported' })
      }

      return updaterApi.downloadUpdate()
    }

    const url = String(state.releasePageUrl || '').trim()
    if (!url || typeof window === 'undefined') {
      return Promise.resolve({ ok: false, reason: 'unsupported' })
    }

    window.open(url, '_blank', 'noopener,noreferrer')
    return Promise.resolve({ ok: true, manual: true, url })
  }, [isElectronUpdaterAvailable, state.releasePageUrl, updaterApi])

  const quitAndInstall = React.useCallback(() => {
    if (!isElectronUpdaterAvailable || typeof updaterApi?.quitAndInstall !== 'function') {
      return Promise.resolve({ ok: false, reason: 'unsupported' })
    }

    return updaterApi.quitAndInstall()
  }, [isElectronUpdaterAvailable, updaterApi])

  const setAutoUpdateEnabled = React.useCallback((enabled) => {
    if (!isElectronUpdaterAvailable || typeof updaterApi?.setAutoUpdateEnabled !== 'function') {
      return Promise.resolve({ ok: false, reason: 'unsupported' })
    }

    return Promise.resolve(updaterApi.setAutoUpdateEnabled(Boolean(enabled)))
      .then((result) => {
        setState((previous) => normalizeUpdaterState({
          ...previous,
          autoUpdateEnabled: Boolean(result?.autoUpdateEnabled ?? enabled),
        }, true))
        return result
      })
  }, [isElectronUpdaterAvailable, updaterApi])

  return {
    isElectronUpdaterAvailable,
    state,
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
    setAutoUpdateEnabled,
  }
}
