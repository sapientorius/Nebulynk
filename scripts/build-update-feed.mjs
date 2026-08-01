import { createPrivateKey, sign } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadReleaseCatalog, RELEASE_SCHEMA_VERSION, sha256Base64Url } from './release-catalog.mjs'

const rootDir = process.cwd()
const outputRoot = path.resolve(process.env.UPDATE_FEED_OUTPUT_DIR || path.join(rootDir, 'dist-update-feed'))
const outputDir = path.join(outputRoot, 'v1')
const privateKeyPem = process.env.UPDATE_FEED_SIGNING_PRIVATE_KEY
const keyId = process.env.UPDATE_FEED_SIGNING_KEY_ID

if (!privateKeyPem || !keyId) {
  throw new Error('UPDATE_FEED_SIGNING_PRIVATE_KEY and UPDATE_FEED_SIGNING_KEY_ID are required')
}

const catalog = await loadReleaseCatalog(rootDir)
const releases = catalog.releases
const payload = {
  schema_version: RELEASE_SCHEMA_VERSION,
  sequence: catalog.sequence,
  generated_at: new Date().toISOString(),
  releases: releases.map(({ fileName, raw, document }) => ({
    version: document.version,
    revision: document.revision,
    channel: document.channel,
    published_at: document.published_at,
    path: `releases/${fileName}`,
    sha256: sha256Base64Url(raw)
  }))
}
const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8')
const signature = sign(null, payloadBytes, createPrivateKey(privateKeyPem)).toString('base64url')
const envelope = {
  schema_version: RELEASE_SCHEMA_VERSION,
  key_id: keyId,
  payload: payloadBytes.toString('base64url'),
  signature
}

await mkdir(path.join(outputDir, 'releases'), { recursive: true })
for (const release of releases) {
  await writeFile(path.join(outputDir, 'releases', release.fileName), release.raw)
}
await writeFile(path.join(outputDir, 'index.json'), `${JSON.stringify(envelope)}\n`)
await writeFile(path.join(outputRoot, 'CNAME'), 'updates.nebulynk.net\n')
process.stdout.write(`Built signed update feed sequence ${payload.sequence} in ${outputDir}.\n`)
