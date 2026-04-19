import React from 'react'
import './styles.css'
import 'simplebar-react/dist/simplebar.min.css'
import { createRoot } from 'react-dom/client'
import App from './App'
import ColorModeProvider from './providers/ColorModeProvider'
import SettingsProvider from './providers/SettingsProvider'
import NotificationProvider from './providers/NotificationProvider'
import I18nProvider from './providers/I18nProvider'

const runtime = typeof window !== 'undefined' ? window.yloaderRuntime : null
const runtimeTarget = runtime?.isElectron ? 'electron' : 'web'

if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-runtime-target', runtimeTarget)
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ColorModeProvider>
      <SettingsProvider>
        <I18nProvider>
          <NotificationProvider>
            <App />
          </NotificationProvider>
        </I18nProvider>
      </SettingsProvider>
    </ColorModeProvider>
  </React.StrictMode>
)
