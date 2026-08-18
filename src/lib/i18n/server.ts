import { cookies } from 'next/headers'
import { DEFAULT_LANG, LANG_COOKIE, isLang, translatorFor, type Lang, type Translator } from './translate'

/**
 * Server-side counterpart to `useT()`.
 *
 * Two entry points, because the language reaches the server two different ways:
 * a server component reads the cookie the switcher wrote, while an API route is
 * told explicitly by the fetch that called it (`?lang=id`) and falls back to the
 * cookie when the caller says nothing.
 */

export async function langFromCookie(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value
  return isLang(v) ? v : DEFAULT_LANG
}

export async function serverT(): Promise<Translator> {
  return translatorFor(await langFromCookie())
}

/** Language for an API request: explicit `?lang=` wins, else the cookie. */
export async function langFromRequest(url: URL): Promise<Lang> {
  const q = url.searchParams.get('lang')
  if (isLang(q)) return q
  return langFromCookie()
}
