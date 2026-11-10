if (legacyPreferences && window.top === window && ['/', '/index.html'].includes(location.pathname)) {
  try {
    const marker = 'yloader.desktop.preferences-imported.v1'
    if (!localStorage.getItem(marker)) {
      for (const [key, value] of Object.entries(legacyPreferences)) {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, value)
      }
      localStorage.setItem(marker, 'true')
    }
  } catch {
    // The webview can still start when local storage is unavailable.
  }
}

const invoke = (command, args) => window.__TAURI__.core.invoke(command, args)
const pick = (mode, initialPath = '', suggestedName = '') =>
  invoke('desktop_pick', { mode, initialPath, suggestedName })
runtime.downloads = Object.freeze({
  pickDirectory: (path) => pick('directory', path),
  pickFile: (path) => pick('file', path),
  pickSavePath: ({ initialDirectory, suggestedName }) => pick('save', initialDirectory, suggestedName),
  validateDirectory: async (path) => { const result = await invoke('desktop_inspect', { path }); return { ...result, valid: result.writable } },
  validateFile: async (path) => { const result = await invoke('desktop_inspect', { path }); return { ...result, valid: result.readable } },
  saveDownload: (id) => invoke('desktop_save_download', { id }),
  revealFile: (path) => invoke('desktop_reveal', { path }),
})
runtime.desktopSettings = Object.freeze({
  get: () => invoke('desktop_settings_get'),
  update: (patch) => invoke('desktop_settings_update', { patch }),
  setTrayLabels: (quit) => invoke('desktop_tray_labels', { quit }),
})
const subscribe = (name, handler) => {
  const listener = window.__TAURI__.event.listen(name, ({ payload }) => handler(payload))
  listener.catch(() => {})
  return () => listener.then((unsubscribe) => unsubscribe()).catch(() => {})
}
const currentWindow = () => window.__TAURI__.window.getCurrentWindow()
const getWindowState = async () => ({ isMaximized: await currentWindow().isMaximized() })
runtime.windowControls = Object.freeze({
  minimize: () => currentWindow().minimize(),
  toggleMaximize: async () => {
    await currentWindow().toggleMaximize()
    return getWindowState()
  },
  close: () => currentWindow().close(),
  getState: getWindowState,
  onStateChange: (callback) => subscribe('tauri://resize', () => {
    getWindowState().then(callback).catch(() => {})
  }),
})
runtime.appUpdater = Object.freeze({
  getState: () => invoke('desktop_app_update_get'),
  checkForUpdates: () => invoke('desktop_app_update_check'),
  downloadUpdate: () => invoke('desktop_app_update_download'),
  quitAndInstall: () => invoke('desktop_app_update_install'),
  setAutoUpdateEnabled: (enabled) => invoke('desktop_app_update_auto', { enabled }),
  onEvent: (callback) => subscribe('desktop-app-updater', callback),
})
const getPending = () => invoke('desktop_pending_links')
runtime.deepLinks = Object.freeze({
  getPending,
  onEvent: (callback) => {
    let active = true
    const deliver = async () => {
      const pending = await getPending()
      if (active) pending.forEach(callback)
    }
    const listener = window.__TAURI__.event.listen('desktop-deep-link', () => { deliver().catch(() => {}) })
    listener.then(deliver).catch(() => {})
    return () => {
      active = false
      listener.then((unsubscribe) => unsubscribe()).catch(() => {})
    }
  },
})
Object.defineProperty(window, 'yloaderRuntime', { value: Object.freeze(runtime) })
