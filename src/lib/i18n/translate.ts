import { ID } from './id'

/**
 * Bilingual UI: English is the source language, Indonesian is a lookup.
 *
 * The translation KEY is the English sentence itself, so a component reads the
 * way it always did — `t('Connect social accounts')` — and a key with no entry
 * in `ID` renders its English self rather than a `missing.key.name` placeholder.
 * That matters on a dashboard: an untranslated label is a small blemish, a raw
 * key is a broken screen.
 *
 * The trade-off is that changing English copy orphans its Indonesian entry. That
 * is the right way round here — the orphan degrades to correct English, and
 * `npm run i18n:check` (scripts/i18n-check.js) lists both orphans and untranslated
 * strings so the pair can be re-synced deliberately.
 */

export const LANGS = ['en', 'id'] as const
export type Lang = (typeof LANGS)[number]

export const DEFAULT_LANG: Lang = 'en'

/** Name of each language, written in that language. */
export const LANG_LABEL: Record<Lang, string> = {
  en: 'English',
  id: 'Bahasa Indonesia',
}

/** Two-letter badge for the compact switcher. */
export const LANG_SHORT: Record<Lang, string> = { en: 'EN', id: 'ID' }

export function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'id'
}

/** Cookie the client writes and the server reads, so API copy matches the UI. */
export const LANG_COOKIE = 'kepiai_lang'

export type Vars = Record<string, string | number>

/**
 * Translate `key` into `lang`, filling `{placeholders}` from `vars`.
 *
 * Works on the server too (payload builders translate their insight strings),
 * which is why it lives in lib/ and takes `lang` explicitly rather than reading
 * a React context.
 */
export function translate(lang: Lang, key: string, vars?: Vars): string {
  const raw = lang === 'id' ? (ID[key] ?? key) : key
  if (!vars) return raw
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  )
}

/** A bound translator — what `useT()` hands components, and what payload builders take. */
export type Translator = (key: string, vars?: Vars) => string

export function translatorFor(lang: Lang): Translator {
  return (key, vars) => translate(lang, key, vars)
}
