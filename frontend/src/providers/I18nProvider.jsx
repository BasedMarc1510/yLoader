import React, { createContext, useContext, useMemo } from 'react'
import { SettingsContext } from './SettingsProvider'
import { defaultLanguage, supportedLanguages } from '../i18n/config'

const localeModules = import.meta.glob('../i18n/locales/*.js', { eager: true })
const fallbackDictionary = localeModules[`../i18n/locales/${defaultLanguage}.js`]?.default || {}
const dictionaries = Object.fromEntries(
  supportedLanguages.map((lang) => {
    const moduleKey = `../i18n/locales/${lang}.js`
    const dictionary = localeModules[moduleKey]?.default || fallbackDictionary
    return [lang, dictionary]
  })
)

const I18nContext = createContext({
  language: defaultLanguage,
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
    const activeLanguage = dictionaries[language] ? language : defaultLanguage
    const dictionary = dictionaries[activeLanguage] || fallbackDictionary

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
