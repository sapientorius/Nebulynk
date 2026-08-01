import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  parseAndVerifyFeedEnvelope,
  validateReleaseDocument,
  verifyReleaseDigest
} from '../backend/src/lib/platform-update-catalog.js'

const feedRoot = path.resolve(process.env.UPDATE_FEED_OUTPUT_DIR || path.join(process.cwd(), 'dist-update-feed'), 'v1')
const configuredKeys = process.env.UPDATE_FEED_PUBLIC_KEYS_JSON
if (!configuredKeys) throw new Error('UPDATE_FEED_PUBLIC_KEYS_JSON is required')

let publicKeys
try {
  publicKeys = JSON.parse(configuredKeys)
} catch {
  throw new Error('UPDATE_FEED_PUBLIC_KEYS_JSON must be valid JSON')
}

const envelope = JSON.parse(await readFile(path.join(feedRoot, 'index.json'), 'utf8'))
const payload = parseAndVerifyFeedEnvelope(envelope, publicKeys, 0)
for (const descriptor of payload.releases) {
  const bytes = await readFile(path.join(feedRoot, descriptor.path))
  verifyReleaseDigest(bytes, descriptor.sha256)
  validateReleaseDocument(JSON.parse(bytes.toString('utf8')), descriptor)
}
process.stdout.write(`Verified signed update feed sequence ${payload.sequence} with ${payload.releases.length} releases.\n`)
