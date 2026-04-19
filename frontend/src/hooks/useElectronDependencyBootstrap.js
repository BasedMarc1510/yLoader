import React from 'react'

const EMPTY_TASK = Object.freeze({
  status: 'pending',
  progress: 0,
  version: '',
  path: '',
  error: '',
})

function normalizeTask(input) {
  const raw = input && typeof input === 'object' ? input : {}
  const progress = Number(raw.progress)

  return {
    status: String(raw.status || 'pending').trim() || 'pending',
    progress: Number.isFinite(progress) ? Math.min(Math.max(progress, 0), 1) : 0,
    version: String(raw.version || '').trim(),
    path: String(raw.path || '').trim(),
    error: String(raw.error || '').trim(),
  }
}

function normalizeBootstrapState(rawState, isAvailable) {
  const raw = rawState && typeof rawState === 'object' ? rawState : {}
  const overallProgress = Number(raw.overallProgress)
  const retryAt = Number(raw.retryAt)
  const startedAt = Number(raw.startedAt)
  const completedAt = Number(raw.completedAt)
  const tasksRaw = raw.tasks && typeof raw.tasks === 'object' ? raw.tasks : {}

  return {
    phase: String(raw.phase || 'idle').trim() || 'idle',
    blocking: isAvailable ? Boolean(raw.blocking) : false,
    overallProgress: Number.isFinite(overallProgress)
      ? Math.min(Math.max(overallProgress, 0), 100)
      : 0,
    activeTask: String(raw.activeTask || '').trim(),
    message: String(raw.message || '').trim(),
    error: String(raw.error || '').trim(),
    retryAt: Number.isFinite(retryAt) ? retryAt : 0,
    startedAt: Number.isFinite(startedAt) ? startedAt : 0,
    completedAt: Number.isFinite(completedAt) ? completedAt : 0,
    tasks: {
      ytdlp: normalizeTask(tasksRaw.ytdlp || EMPTY_TASK),
      ffmpeg: normalizeTask(tasksRaw.ffmpeg || EMPTY_TASK),
    },
  }
}

export default function useElectronDependencyBootstrap() {
  const runtime = typeof window !== 'undefined' ? window.yloaderRuntime : null
  const bootstrapApi = runtime?.dependencyBootstrap
  const isElectronBootstrapAvailable = Boolean(runtime?.isElectron && bootstrapApi)

  const [state, setState] = React.useState(() => normalizeBootstrapState(null, isElectronBootstrapAvailable))

  React.useEffect(() => {
    setState((previous) => normalizeBootstrapState(previous, isElectronBootstrapAvailable))

    if (!isElectronBootstrapAvailable) return undefined

    let mounted = true

    Promise.resolve(bootstrapApi.getState?.())
      .then((snapshot) => {
        if (!mounted) return
        setState(normalizeBootstrapState(snapshot, true))
      })
      .catch(() => {
        // keep fallback state if initial sync fails
      })

    const unsubscribe = bootstrapApi.onEvent?.((eventPayload) => {
      if (!mounted) return
      setState((previous) => normalizeBootstrapState(eventPayload?.state || previous, true))
    })

    return () => {
      mounted = false
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [bootstrapApi, isElectronBootstrapAvailable])

  return {
    state,
    isElectronBootstrapAvailable,
  }
}
