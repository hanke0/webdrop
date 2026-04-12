import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'

export const WEBDROP_LOCALE_KEY = 'webdrop-locale'

function syncDocumentLang(lng: string) {
  if (typeof document === 'undefined') {
    return
  }
  document.documentElement.lang = lng.startsWith('zh') ? 'zh-CN' : 'en'
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      'zh-CN': { translation: zhCN },
      zh: { translation: zhCN },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'zh-CN', 'zh'],
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: WEBDROP_LOCALE_KEY,
    },
    interpolation: { escapeValue: false },
  })
  .then(() => {
    syncDocumentLang(i18n.language)
  })

i18n.on('languageChanged', (lng) => {
  syncDocumentLang(lng)
})

export default i18n
