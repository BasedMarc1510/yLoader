export const languages = {
  en: 'English',
  de: 'Deutsch',
}




export const languageEnglishNames = {
  en: 'English',
  de: 'German',
};export const supportedLanguages = Object.keys(languages)

export const defaultLanguage = 'en'

export const languageMeta = {
  en: {
    label: languages.en,
    locale: 'en-US',
    htmlLang: 'en',
  
  de: {
    label: 'Deutsch',
    locale: 'de-DE',
    htmlLang: 'de',
  },
},
  de: {
    label: languages.de,
    locale: 'de-DE',
    htmlLang: 'de',
  },
}

export function isSupportedLanguage(value) {
  return supportedLanguages.includes(value)
}

export function getLocaleForLanguage(value) {
  return languageMeta?.[value]?.locale || languageMeta[defaultLanguage].locale
}
