const { contextBridge, ipcRenderer } = require('electron')

const apiBase = String(process.env.ELECTRON_API_BASE || 'http://127.0.0.1:4000').trim() || 'http://127.0.0.1:4000'
const downloadsPath = String(process.env.ELECTRON_DEFAULT_DOWNLOADS_PATH || '').trim()

const windowControls = {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:maximize-toggle'),
  close: () => ipcRenderer.invoke('window:close'),
  getState: () => ipcRenderer.invoke('window:get-state'),
  onStateChange: (callback) => {
    if (typeof callback !== 'function') return () => {}

    const listener = (_event, state) => {
      callback(state || {})
    }

    ipcRenderer.on('window:state-changed', listener)
    return () => {
      ipcRenderer.removeListener('window:state-changed', listener)
    }
  },
}

const appUpdater = {
  getState: () => ipcRenderer.invoke('app-updater:get-state'),
  checkForUpdates: () => ipcRenderer.invoke('app-updater:check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('app-updater:download-update'),
  quitAndInstall: () => ipcRenderer.invoke('app-updater:quit-and-install'),
  setAutoUpdateEnabled: (enabled) => ipcRenderer.invoke('app-updater:set-auto-update-enabled', {
    enabled: enabled !== false,
  }),
  onEvent: (callback) => {
    if (typeof callback !== 'function') return () => {}

    const listener = (_event, payload) => {
      callback(payload || {})
    }

    ipcRenderer.on('app-updater:event', listener)
    return () => {
      ipcRenderer.removeListener('app-updater:event', listener)
    }
  },
}

const dependencyBootstrap = {
  getState: () => ipcRenderer.invoke('dependency-bootstrap:get-state'),
  ensure: () => ipcRenderer.invoke('dependency-bootstrap:ensure'),
  onEvent: (callback) => {
    if (typeof callback !== 'function') return () => {}

    const listener = (_event, payload) => {
      callback(payload || {})
    }

    ipcRenderer.on('dependency-bootstrap:event', listener)
    return () => {
      ipcRenderer.removeListener('dependency-bootstrap:event', listener)
    }
  },
}

const downloads = {
  pickDirectory: (initialPath = '') => ipcRenderer.invoke('downloads:pick-directory', {
    initialPath: String(initialPath || ''),
  }),
  pickSavePath: (options = {}) => ipcRenderer.invoke('downloads:pick-save-path', {
    initialDirectory: String(options?.initialDirectory || ''),
    suggestedName: String(options?.suggestedName || ''),
  }),
  pickFile: (initialPath = '') => ipcRenderer.invoke('downloads:pick-file', {
    initialPath: String(initialPath || ''),
  }),
  validateDirectory: (pathValue = '') => ipcRenderer.invoke('downloads:validate-directory', {
    path: String(pathValue || ''),
  }),
  validateFile: (pathValue = '') => ipcRenderer.invoke('downloads:validate-file', {
    path: String(pathValue || ''),
  }),
  revealFile: (pathValue = '') => ipcRenderer.invoke('downloads:reveal-file', {
    path: String(pathValue || ''),
  }),
  onDownloadCompleted: (callback) => {
    if (typeof callback !== 'function') return () => {}

    const listener = (_event, payload) => {
      callback(payload || {})
    }

    ipcRenderer.on('downloads:completed', listener)
    return () => {
      ipcRenderer.removeListener('downloads:completed', listener)
    }
  },
  settingsUpdated: () => ipcRenderer.invoke('downloads:settings-updated'),
}

const desktopSettings = {
  get: () => ipcRenderer.invoke('desktop-settings:get'),
  update: (patch = {}) => {
    const payload = {}

    if (Object.prototype.hasOwnProperty.call(patch || {}, 'closeToTrayOnWindowClose')) {
      payload.closeToTrayOnWindowClose = patch.closeToTrayOnWindowClose
    }
    if (Object.prototype.hasOwnProperty.call(patch || {}, 'startOnSystemStartup')) {
      payload.startOnSystemStartup = patch.startOnSystemStartup
    }
    if (Object.prototype.hasOwnProperty.call(patch || {}, 'startupWindowMode')) {
      payload.startupWindowMode = patch.startupWindowMode
    }

    return ipcRenderer.invoke('desktop-settings:update', payload)
  },
  onEvent: (callback) => {
    if (typeof callback !== 'function') return () => {}

    const listener = (_event, payload) => {
      callback(payload || {})
    }

    ipcRenderer.on('desktop-settings:event', listener)
    return () => {
      ipcRenderer.removeListener('desktop-settings:event', listener)
    }
  },
}

const deepLinks = {
  getPending: () => ipcRenderer.invoke('deep-link:get-pending'),
  onEvent: (callback) => {
    if (typeof callback !== 'function') return () => {}

    const listener = (_event, payload) => {
      callback(payload || {})
    }

    ipcRenderer.on('deep-link:event', listener)
    return () => {
      ipcRenderer.removeListener('deep-link:event', listener)
    }
  },
}

ipcRenderer.send('deep-link:renderer-ready')

contextBridge.exposeInMainWorld('yloaderRuntime', {
  apiBase,
  isElectron: true,
  platform: process.platform,
  downloadsPath,
  windowControls,
  appUpdater,
  dependencyBootstrap,
  downloads,
  desktopSettings,
  deepLinks,
})
