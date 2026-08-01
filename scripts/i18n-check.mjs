import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(process.cwd())
const FRONTEND_SRC = join(ROOT, 'frontend/src')
const BACKEND_SRC = join(ROOT, 'backend/src')

const failures = []

async function walk(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(full, out)
      continue
    }
    out.push(full)
  }
  return out
}

function parseSupportedLocales(source, fileLabel) {
  const match = source.match(/export const SUPPORTED_LOCALES\s*=\s*\[([^\]]+)\]/)
  if (!match) {
    failures.push(`${fileLabel}: SUPPORTED_LOCALES not found`)
    return []
  }
  return match[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
}

function flattenKeys(obj, prefix = '', set = new Set()) {
  for (const [key, value] of Object.entries(obj || {})) {
    const next = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenKeys(value, next, set)
    } else {
      set.add(next)
    }
  }
  return set
}

function compareLocaleShapes(label, catalog, locales) {
  const baseline = flattenKeys(catalog.en || {})
  if (baseline.size === 0) {
    failures.push(`${label}: missing baseline locale 'en'`)
    return
  }

  for (const locale of locales) {
    if (!catalog[locale]) {
      failures.push(`${label}: locale '${locale}' missing`)
      continue
    }
    const keys = flattenKeys(catalog[locale])
    for (const key of baseline) {
      if (!keys.has(key)) failures.push(`${label}: locale '${locale}' missing key '${key}'`)
    }
    for (const key of keys) {
      if (!baseline.has(key)) failures.push(`${label}: locale '${locale}' has extra key '${key}'`)
    }
  }
}

async function run() {
  const frontendFiles = await walk(FRONTEND_SRC)
  const usedTranslationKeys = new Set()
  for (const file of frontendFiles) {
    if (!file.endsWith('.js') && !file.endsWith('.vue')) continue
    const source = await readFile(file, 'utf8')
    if (/\$tr\s*\(/.test(source)) {
      failures.push(`${file}: forbidden $tr(...) usage`)
    }
    if (/(^|[^A-Za-z0-9_$.])tr\s*\(/m.test(source)) {
      failures.push(`${file}: forbidden tr(...) usage`)
    }

    const keyRegex = /\$t\('([^']+)'\)|this\.\$t\('([^']+)'\)/g
    let keyMatch
    while ((keyMatch = keyRegex.exec(source)) !== null) {
      const key = keyMatch[1] || keyMatch[2]
      if (key) usedTranslationKeys.add(key)
    }
  }

  const backendFiles = await walk(BACKEND_SRC)
  const backendApiCodes = new Set()
  for (const file of backendFiles) {
    if (!file.endsWith('.js')) continue
    const source = await readFile(file, 'utf8')
    if (/ctx\.body\s*=\s*\{\s*error\s*:/.test(source)) {
      failures.push(`${file}: raw ctx.body.error payload is forbidden`)
    }
    if (/new\s+(BadRequest|Forbidden|NotFound|Conflict)\s*\(/.test(source)) {
      failures.push(`${file}: direct Feathers error constructor usage is forbidden; use lib/errors helpers`)
    }

    const codeMatches = source.match(/api\.[a-z0-9_.]+/g) || []
    for (const code of codeMatches) backendApiCodes.add(code)
  }

  const frontendI18nSource = await readFile(join(ROOT, 'frontend/src/lib/i18n.js'), 'utf8')
  const backendLocalesSource = await readFile(join(ROOT, 'backend/src/lib/locales.js'), 'utf8')
  const frontendSupported = parseSupportedLocales(frontendI18nSource, 'frontend/src/lib/i18n.js')
  const backendSupported = parseSupportedLocales(backendLocalesSource, 'backend/src/lib/locales.js')

  const frontendSupportedSorted = [...frontendSupported].sort()
  const backendSupportedSorted = [...backendSupported].sort()
  if (frontendSupportedSorted.join(',') !== backendSupportedSorted.join(',')) {
    failures.push(
      `supported locale mismatch: frontend=[${frontendSupportedSorted.join(', ')}] backend=[${backendSupportedSorted.join(', ')}]`
    )
  }

  const { generatedUiMessages } = await import(pathToFileURL(join(ROOT, 'frontend/src/lib/generated-ui-messages.js')).href)
  const { backendMessages } = await import(pathToFileURL(join(ROOT, 'backend/src/lib/i18n-messages.js')).href)
  const { apiErrorMessages } = await import(pathToFileURL(join(ROOT, 'frontend/src/lib/api-error-messages.js')).href)

  compareLocaleShapes('frontend generated ui messages', generatedUiMessages, frontendSupported)
  compareLocaleShapes('frontend api error messages', apiErrorMessages, frontendSupported)
  compareLocaleShapes('backend i18n messages', backendMessages, backendSupported)

  const generatedUiKeys = flattenKeys(generatedUiMessages.en || {})
  for (const key of usedTranslationKeys) {
    if (!key.startsWith('ui.')) continue
    if (!generatedUiKeys.has(key)) {
      failures.push(`frontend key '${key}' missing in generated UI messages`)
    }
  }

  const frontendApiKeys = flattenKeys(apiErrorMessages.en || {})
  for (const code of backendApiCodes) {
    if (!code.startsWith('api.')) continue
    if (!frontendApiKeys.has(code)) {
      failures.push(`backend api code '${code}' missing in frontend api error messages`)
    }
  }

  if (failures.length > 0) {
    console.error('i18n check failed:')
    for (const failure of failures) {
      console.error(`- ${failure}`)
    }
    process.exit(1)
  }

  console.log('i18n check passed')
}

await run()
