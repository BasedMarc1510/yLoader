const { contextBridge, ipcRenderer } = require('electron')

const apiBase = String(process.env.ELECTRON_API_BASE || 'http://127.0.0.1:4000').trim() || 'http://127.0.0.1:4000'

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

contextBridge.exposeInMainWorld('yloaderRuntime', {
  apiBase,
  isElectron: true,
  platform: process.platform,
  windowControls,
  appUpdater,
})