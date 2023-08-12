import {
  dateEnUS,
  dateJaJP,
  dateKoKR,
  dateZhCN,
  dateZhTW,
  enUS,
  jaJP,
  koKR,
  zhCN,
  zhTW,
} from 'naive-ui'

export enum LANGUAGES {
  EN = 'en',
  JA = 'ja',
  KO = 'ko',
  ZH_TW = 'zh-tw',
  ZH = 'zh',
}

export function getLanguage() {
  const language = navigator.language.toLowerCase()
  const locales = [
    LANGUAGES.EN,
    LANGUAGES.JA,
    LANGUAGES.KO,
    LANGUAGES.ZH_TW,
    LANGUAGES.ZH,
  ]
  for (const locale of locales) {
    if (language.includes(locale))
      return locale
  }

  return LANGUAGES.ZH
}

export function getNaiveUILocale() {
  const language = getLanguage()
  switch (language) {
    case LANGUAGES.EN:
      return { locale: enUS, dateLocale: dateEnUS }
    case LANGUAGES.JA:
      return { locale: jaJP, dateLocale: dateJaJP }
    case LANGUAGES.KO:
      return { locale: koKR, dateLocale: dateKoKR }
    case LANGUAGES.ZH_TW:
      return { locale: zhTW, dateLocale: dateZhTW }
    case LANGUAGES.ZH:
      return { locale: zhCN, dateLocale: dateZhCN }
    default:
      return { locale: zhCN, dateLocale: dateZhCN }
  }
}
