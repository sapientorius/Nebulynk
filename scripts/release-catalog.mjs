import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import semver from 'semver'

export const RELEASE_SCHEMA_VERSION = 1
export const RELEASE_CATEGORIES = new Set(['feature', 'improvement', 'fix', 'breaking', 'security'])
export const SECURITY_SEVERITIES = new Set(['low', 'medium', 'high', 'critical'])
const releaseSchema = JSON.parse(await readFile(new URL('../releases/schema-v1.json', import.meta.url), 'utf8'))
const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv)
const validateSchema = ajv.compile(releaseSchema)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertLocalizedText(value, field) {
  assert(value && typeof value === 'object', `${field} must be an object`)
  assert(typeof value.en === 'string' && value.en.trim(), `${field}.en must be a non-empty string`)
  if (value.de !== undefined) assert(typeof value.de === 'string' && value.de.trim(), `${field}.de must be a non-empty string`)
}

function assertManualSteps(value, field) {
  assert(value && typeof value === 'object', `${field} must be an object`)
  assert(Array.isArray(value.en), `${field}.en must be an array`)
  assert(value.en.every((entry) => typeof entry === 'string' && entry.trim()), `${field}.en contains invalid entries`)
  if (value.de !== undefined) {
    assert(Array.isArray(value.de), `${field}.de must be an array`)
    assert(value.de.every((entry) => typeof entry === 'string' && entry.trim()), `${field}.de contains invalid entries`)
  }
}

function hasLegacyGermanFields(document) {
  const localizedValues = [
    document.title,
    document.summary,
    ...document.changes.flatMap((change) => [change.title, change.description]),
    ...document.security.map((advisory) => advisory.summary)
  ]
  return localizedValues.every((value) => Object.hasOwn(value, 'de'))
    && Object.hasOwn(document.upgrade.manual_steps, 'de')
}

export function normalizeReleaseDocumentForFeed(document) {
  const normalized = structuredClone(document)
  const localizedValues = [
    normalized.title,
    normalized.summary,
    ...normalized.changes.flatMap((change) => [change.title, change.description]),
    ...normalized.security.map((advisory) => advisory.summary)
  ]
  for (const value of localizedValues) {
    if (!Object.hasOwn(value, 'de')) value.de = value.en
  }
  if (!Object.hasOwn(normalized.upgrade.manual_steps, 'de')) {
    normalized.upgrade.manual_steps.de = [...normalized.upgrade.manual_steps.en]
  }
  return normalized
}

export function prepareReleaseForFeed(document, raw) {
  if (hasLegacyGermanFields(document)) return { document, raw }
  const normalized = normalizeReleaseDocumentForFeed(document)
  return {
    document: normalized,
    raw: Buffer.from(`${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  }
}

function assertHttpsUrl(value, field) {
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${field} must be a valid URL`)
  }
  assert(parsed.protocol === 'https:', `${field} must use HTTPS`)
}

export function validateReleaseDocument(document, fileName = 'release') {
  if (!validateSchema(document)) {
    const details = validateSchema.errors.map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ')
    throw new Error(`${fileName}: release schema validation failed: ${details}`)
  }
  assert(document?.schema_version === RELEASE_SCHEMA_VERSION, `${fileName}: unsupported schema_version`)
  assert(semver.valid(document.version) === document.version, `${fileName}: version must be canonical SemVer`)
  assert(!semver.prerelease(document.version), `${fileName}: stable catalog cannot contain prereleases`)
  assert(Number.isInteger(document.revision) && document.revision > 0, `${fileName}: revision must be a positive integer`)
  assert(document.channel === 'stable', `${fileName}: channel must be stable`)
  assert(!Number.isNaN(Date.parse(document.published_at)), `${fileName}: published_at must be an ISO date`)
  assertLocalizedText(document.title, `${fileName}.title`)
  assertLocalizedText(document.summary, `${fileName}.summary`)
  assert(Array.isArray(document.changes), `${fileName}: changes must be an array`)
  for (const [index, change] of document.changes.entries()) {
    assert(RELEASE_CATEGORIES.has(change?.category), `${fileName}.changes[${index}]: invalid category`)
    assertLocalizedText(change.title, `${fileName}.changes[${index}].title`)
    assertLocalizedText(change.description, `${fileName}.changes[${index}].description`)
  }
  assert(Array.isArray(document.security), `${fileName}: security must be an explicit array`)
  for (const [index, advisory] of document.security.entries()) {
    assert(SECURITY_SEVERITIES.has(advisory?.severity), `${fileName}.security[${index}]: invalid severity`)
    assert(typeof advisory.affected_versions === 'string' && semver.validRange(advisory.affected_versions), `${fileName}.security[${index}]: invalid affected_versions`)
    assertLocalizedText(advisory.summary, `${fileName}.security[${index}].summary`)
    if (advisory.advisory_url) assertHttpsUrl(advisory.advisory_url, `${fileName}.security[${index}].advisory_url`)
  }
  assert(document.upgrade && typeof document.upgrade === 'object', `${fileName}: upgrade must be an object`)
  for (const field of ['backup_required', 'downtime_expected', 'breaking']) {
    assert(typeof document.upgrade[field] === 'boolean', `${fileName}.upgrade.${field} must be boolean`)
  }
  assert(document.upgrade.manual_steps && typeof document.upgrade.manual_steps === 'object', `${fileName}.upgrade.manual_steps must be an object`)
  assertManualSteps(document.upgrade.manual_steps, `${fileName}.upgrade.manual_steps`)
  assertHttpsUrl(document.upgrade.docs_url, `${fileName}.upgrade.docs_url`)
  return document
}

export async function loadReleaseCatalog(rootDir = process.cwd()) {
  const releaseDir = path.join(rootDir, 'releases')
  const catalogDocument = JSON.parse(await readFile(path.join(releaseDir, 'catalog.json'), 'utf8'))
  assert(catalogDocument?.schema_version === RELEASE_SCHEMA_VERSION, 'catalog.json: unsupported schema_version')
  assert(catalogDocument.channel === 'stable', 'catalog.json: channel must be stable')
  assert(Number.isInteger(catalogDocument.sequence) && catalogDocument.sequence > 0, 'catalog.json: sequence must be a positive integer')
  const fileNames = (await readdir(releaseDir))
    .filter((fileName) => /^v\d+\.\d+\.\d+\.json$/.test(fileName))
    .sort((left, right) => semver.compare(left.slice(1, -5), right.slice(1, -5)))
  assert(fileNames.length > 0, 'release catalog is empty')

  const releases = []
  for (const fileName of fileNames) {
    const raw = await readFile(path.join(releaseDir, fileName))
    const document = validateReleaseDocument(JSON.parse(raw.toString('utf8')), fileName)
    assert(fileName === `v${document.version}.json`, `${fileName}: filename does not match version`)
    releases.push({ fileName, raw, document })
  }
  assert(catalogDocument.sequence >= releases.length, 'catalog.json: sequence cannot be lower than the release count')
  return { sequence: catalogDocument.sequence, releases }
}

export function sha256Base64Url(value) {
  return createHash('sha256').update(value).digest('base64url')
}
