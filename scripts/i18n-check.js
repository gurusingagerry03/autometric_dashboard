/**
 * Report the two ways the Indonesian dictionary can drift from the UI.
 *
 *   ORPHANS      — an entry in src/lib/i18n/id.ts whose English key no longer
 *                  appears in any t(...) call. Usually the English copy was
 *                  reworded; the Indonesian line is now dead weight and the
 *                  screen has silently reverted to English.
 *   UNTRANSLATED — a t(...) key with no entry. Renders in English, which is a
 *                  safe fallback but not a finished translation.
 *
 * Read-only and dependency-free: run it, read it, fix what matters.
 *
 *   node scripts/i18n-check.js
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', 'src')
const DICT = path.join(ROOT, 'lib', 'i18n', 'id.ts')

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
  }
  return out
}

/** Keys passed to t('…') / translate(lang, '…') — single or double quoted. */
function keysIn(src) {
  const out = new Set()
  const call = /\bt\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g
  const srv = /\btranslate\(\s*\w+\s*,\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g
  for (const re of [call, srv]) {
    let m
    while ((m = re.exec(src))) out.add(m[2].replace(/\\'/g, "'").replace(/\\"/g, '"'))
  }
  return out
}

function dictKeys(src) {
  const out = new Set()
  // Entries are `'English key': 'terjemahan',` — take the key half only.
  const re = /^\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*:/gm
  let m
  while ((m = re.exec(src))) out.add(m[2].replace(/\\'/g, "'").replace(/\\"/g, '"'))
  return out
}

const used = new Set()
/**
 * Every source file's raw text, kept for the orphan pass.
 *
 * Plenty of keys never appear inside a `t(...)` call: they are looked up through
 * a variable — `t(item.label)`, `t(MODE_LABEL[mode])`, `t(h)` — with the literal
 * sitting in a table somewhere else. Matching only call sites would report all of
 * those as dead, which is exactly backwards, so an entry also counts as used when
 * its text appears as a quoted literal anywhere in src/.
 */
const corpus = []
for (const file of walk(ROOT)) {
  if (file === DICT) continue
  const src = fs.readFileSync(file, 'utf8')
  corpus.push(src)
  for (const k of keysIn(src)) used.add(k)
}
const allText = corpus.join('\n')

const have = dictKeys(fs.readFileSync(DICT, 'utf8'))

const quotedSomewhere = k =>
  allText.includes(`'${k}'`) || allText.includes(`"${k}"`) || allText.includes(`\`${k}\``)

const orphans = [...have].filter(k => !used.has(k) && !quotedSomewhere(k)).sort()
const missing = [...used].filter(k => !have.has(k)).sort()

const pct = used.size ? Math.round(((used.size - missing.length) / used.size) * 100) : 100
console.log(`i18n: ${used.size - missing.length}/${used.size} strings translated (${pct}%)\n`)

if (orphans.length) {
  console.log(`ORPHANS — in id.ts but no longer used (${orphans.length}):`)
  for (const k of orphans) console.log(`  ${JSON.stringify(k)}`)
  console.log('')
}
if (missing.length) {
  console.log(`UNTRANSLATED — used but missing from id.ts (${missing.length}):`)
  for (const k of missing) console.log(`  ${JSON.stringify(k)}: '',`)
  console.log('')
}
if (!orphans.length && !missing.length) console.log('Dictionary is in sync.')
