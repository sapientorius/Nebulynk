import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(process.cwd())

function parseLocaleArg() {
  const args = process.argv.slice(2)
  const localeFlagIndex = args.findIndex((arg) => arg === '--locale')
  const locale = localeFlagIndex >= 0 ? args[localeFlagIndex + 1] : args[0]
  if (!locale) {
    throw new Error('Usage: node scripts/i18n-add-locale.mjs <locale> OR --locale <locale>')
  }
  const normalized = locale.trim().toLowerCase()
  if (!/^[a-z]{2}(-[a-z]{2})?$/.test(normalized)) {
    throw new Error(`Invalid locale '${locale}'. Expected format like 'fr' or 'pt-br'.`)
  }
  return normalized
}

function updateSupportedLocales(source, locale) {
  return source.replace(/export const SUPPORTED_LOCALES\s*=\s*\[([^\]]+)\]/, (full, list) => {
    const locales = list
      .split(',')
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
    if (!locales.includes(locale)) locales.push(locale)
    const rendered = locales.map((entry) => `'${entry}'`).join(', ')
    return `export const SUPPORTED_LOCALES = [${rendered}]`
  })
}

function updateLanguageBlocks(source, locale) {
  return source.replace(/languages:\s*\{([\s\S]*?)\n(\s*)\}/g, (full, block, indent) => {
    if (new RegExp(`\\b${locale}\\s*:`).test(block)) return full
    const label = locale.toUpperCase()
    const trimmed = block.replace(/\s+$/, '')
    return `languages: {${trimmed}\n${indent}  ${locale}: '${label}'\n${indent}}`
  })
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function esc(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function renderKey(key) {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) return key
  return `'${esc(key)}'`
}

function renderObject(value, indent = 2) {
  if (typeof value === 'string') return `'${esc(value)}'`
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value)
  const pad = ' '.repeat(indent)
  const entries = Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b))
  return `{\n${entries.map(([k, v]) => `${pad}${renderKey(k)}: ${renderObject(v, indent + 2)}`).join(',\n')}\n${' '.repeat(Math.max(indent - 2, 0))}}`
}

async function run() {
  const locale = parseLocaleArg()

  const frontendI18nPath = join(ROOT, 'frontend/src/lib/i18n.js')
  const backendLocalesPath = join(ROOT, 'backend/src/lib/locales.js')
  const frontendGeneratedPath = join(ROOT, 'frontend/src/lib/generated-ui-messages.js')
  const frontendApiErrorsPath = join(ROOT, 'frontend/src/lib/api-error-messages.js')
  const backendMessagesPath = join(ROOT, 'backend/src/lib/i18n-messages.js')

  let frontendI18nSource = await readFile(frontendI18nPath, 'utf8')
  frontendI18nSource = updateSupportedLocales(frontendI18nSource, locale)
  frontendI18nSource = updateLanguageBlocks(frontendI18nSource, locale)
  await writeFile(frontendI18nPath, frontendI18nSource, 'utf8')

  let backendLocalesSource = await readFile(backendLocalesPath, 'utf8')
  backendLocalesSource = updateSupportedLocales(backendLocalesSource, locale)
  await writeFile(backendLocalesPath, backendLocalesSource, 'utf8')

  const generatedModule = await import(pathToFileURL(frontendGeneratedPath).href + `?v=${Date.now()}`)
  const generatedMessages = cloneJson(generatedModule.generatedUiMessages)
  if (!generatedMessages[locale]) {
    generatedMessages[locale] = cloneJson(generatedMessages.en || {})
  }
  await writeFile(
    frontendGeneratedPath,
    `export const generatedUiMessages = ${renderObject(generatedMessages, 2)}\n`,
    'utf8'
  )

  const apiErrorModule = await import(pathToFileURL(frontendApiErrorsPath).href + `?v=${Date.now()}`)
  const apiErrorMessages = cloneJson(apiErrorModule.apiErrorMessages)
  if (!apiErrorMessages[locale]) {
    apiErrorMessages[locale] = cloneJson(apiErrorMessages.en || {})
  }
  await writeFile(
    frontendApiErrorsPath,
    `export const apiErrorMessages = ${renderObject(apiErrorMessages, 2)}\n`,
    'utf8'
  )

  const backendModule = await import(pathToFileURL(backendMessagesPath).href + `?v=${Date.now()}`)
  const backendMessages = cloneJson(backendModule.backendMessages)
  if (!backendMessages[locale]) {
    backendMessages[locale] = cloneJson(backendMessages.en || {})
  }
  await writeFile(
    backendMessagesPath,
    `export const backendMessages = ${renderObject(backendMessages, 2)}\n`,
    'utf8'
  )

  console.log(`Added locale '${locale}' to frontend/backend catalogs and supported locale lists.`)
}

await run()
