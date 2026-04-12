import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react'

const LANG_KEY = 'app-language'

export const SettingsContext = createContext({
  language: 'en',
  setLanguage: () => {},
})

export default function SettingsProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    try {
      const stored = localStorage.getItem(LANG_KEY)
      return stored || 'en'
    } catch {
      return 'en'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(LANG_KEY, language)
    } catch {}
  }, [language])

  const setLanguageSafe = useCallback((lang) => {
    setLanguage(lang || 'en')
  }, [])

  const value = useMemo(() => ({ language, setLanguage: setLanguageSafe }), [language, setLanguageSafe])

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  )
}
