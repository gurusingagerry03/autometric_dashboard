'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import {
  DEFAULT_LANG, LANG_COOKIE, isLang, translatorFor,
  type Lang, type Translator,
} from './translate'

/**
 * The language the whole UI reads from.
 *
 * The initial value is resolved on the SERVER (from the `kepiai_lang` cookie) and
 * handed in as `initial`, so the first paint is already in the right language —
 * reading localStorage in an effect instead would flash English at an Indonesian
 * user on every navigation.
 *
 * Switching writes the cookie (a year, site-wide) so the choice survives reloads
 * and is visible to API routes, which build their insight sentences server-side.
 */

interface Ctx {
  lang: Lang
  setLang: (l: Lang) => void
  t: Translator
}

const LanguageContext = createContext<Ctx>({
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: translatorFor(DEFAULT_LANG),
})

export function LanguageProvider({ initial, children }: {
  initial?: Lang
  children: React.ReactNode
}) {
  const [lang, setLangState] = useState<Lang>(isLang(initial) ? initial : DEFAULT_LANG)

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    if (typeof document !== 'undefined') {
      document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
      document.documentElement.lang = l
    }
  }, [])

  const value = useMemo<Ctx>(() => ({ lang, setLang, t: translatorFor(lang) }), [lang, setLang])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  return useContext(LanguageContext)
}

/** Shorthand for the common case: `const t = useT()`. */
export function useT(): Translator {
  return useContext(LanguageContext).t
}
