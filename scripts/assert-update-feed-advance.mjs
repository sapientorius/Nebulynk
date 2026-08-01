import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseAndVerifyFeedEnvelope } from '../backend/src/lib/platform-update-catalog.js'

const publicKeysJson = process.env.UPDATE_FEED_PUBLIC_KEYS_JSON
if (!publicKeysJson) throw new Error('UPDATE_FEED_PUBLIC_KEYS_JSON is required')
const publicKeys = JSON.parse(publicKeysJson)
const outputRoot = path.resolve(process.env.UPDATE_FEED_OUTPUT_DIR || 'dist-update-feed')
const candidateEnvelope = JSON.parse(await readFile(path.join(outputRoot, 'v1', 'index.json'), 'utf8'))
const candidate = parseAndVerifyFeedEnvelope(candidateEnvelope, publicKeys, 0)
const currentIndexUrl = process.env.UPDATE_FEED_CURRENT_INDEX_URL || 'https://updates.nebulynk.net/v1/index.json'

const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 10_000)
let response
let bytes = null
try {
  response = await fetch(currentIndexUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    redirect: 'error',
    signal: controller.signal
  })
  if (response.status === 200) bytes = Buffer.from(await response.arrayBuffer())
} finally {
  clearTimeout(timeout)
}

if (response.status === 404) {
  process.stdout.write(`No existing feed was found; sequence ${candidate.sequence} is eligible for initial publication.\n`)
  process.exit(0)
}
if (response.status !== 200) throw new Error(`Current update feed returned HTTP ${response.status}`)
if (bytes.length > 256 * 1024) throw new Error('Current update feed index exceeds the size limit')
const currentEnvelope = JSON.parse(bytes.toString('utf8'))
const current = parseAndVerifyFeedEnvelope(currentEnvelope, publicKeys, 0)
if (candidate.sequence < current.sequence) {
  throw new Error(`Candidate feed sequence ${candidate.sequence} is lower than published sequence ${current.sequence}`)
}
if (candidate.sequence === current.sequence) {
  if (JSON.stringify(candidate.releases) !== JSON.stringify(current.releases)) {
    throw new Error(`Candidate reuses published sequence ${current.sequence} with different release descriptors`)
  }
  process.stdout.write(`Candidate feed sequence ${candidate.sequence} already describes the published releases; retry is safe.\n`)
  process.exit(0)
}
process.stdout.write(`Candidate feed advances published sequence ${current.sequence} to ${candidate.sequence}.\n`)
