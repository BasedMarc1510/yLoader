import React from 'react'
import './styles.css'
import { createRoot } from 'react-dom/client'
import App from './App'
import ColorModeProvider from './providers/ColorModeProvider'
import SettingsProvider from './providers/SettingsProvider'
import NotificationProvider from './providers/NotificationProvider'
import I18nProvider from './providers/I18nProvider'

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
