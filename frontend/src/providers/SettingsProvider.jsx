import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import { defaultLanguage, isSupportedLanguage } from '../i18n/config'

const LANG_KEY = 'app-language'

export const SettingsContext = createContext({
  language: defaultLanguage,
  setLanguage: () => {},
})

export default function SettingsProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    try {
      const stored = localStorage.getItem(LANG_KEY)
      if (isSupportedLanguage(stored)) {
        return stored
      }
      return defaultLanguage
    } catch {
      return defaultLanguage
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(LANG_KEY, language)
    } catch {}
  }, [language])

  const setLanguageSafe = useCallback((lang) => {
    const normalized = String(lang || '').trim().toLowerCase()
    setLanguage(isSupportedLanguage(normalized) ? normalized : defaultLanguage)
  }, [])

  const value = useMemo(() => ({ language, setLanguage: setLanguageSafe }), [language, setLanguageSafe])

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  )
}
