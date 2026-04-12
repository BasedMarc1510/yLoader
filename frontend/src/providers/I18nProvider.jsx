import React, { createContext, useContext, useMemo } from 'react'
import { SettingsContext } from './SettingsProvider'
import en from '../i18n/locales/en'
import de from '../i18n/locales/de'

const dictionaries = {
  en,
  de,
}

const I18nContext = createContext({
  language: 'en',
  t: (key, params) => key,
})

function getByPath(obj, path) {
  return path.split('.').reduce((acc, part) => (acc && part in acc ? acc[part] : undefined), obj)
}

function interpolate(template, params = {}) {
  if (typeof template !== 'string') return template
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = params[key]
    return value === undefined || value === null ? '' : String(value)
  })
}

export function useI18n() {
  return useContext(I18nContext)
}

export default function I18nProvider({ children }) {
  const { language } = useContext(SettingsContext)

  const value = useMemo(() => {
    const activeLanguage = dictionaries[language] ? language : 'en'
    const dictionary = dictionaries[activeLanguage]

    const t = (key, params = {}) => {
      const raw = getByPath(dictionary, key)
      if (raw === undefined) return key
      return interpolate(raw, params)
    }

    return {
      language: activeLanguage,
      t,
    }
  }, [language])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
