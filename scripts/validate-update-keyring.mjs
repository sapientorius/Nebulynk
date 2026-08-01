import { readFile } from 'node:fs/promises'

const keyId = process.env.UPDATE_FEED_SIGNING_KEY_ID
const configuredJson = process.env.UPDATE_FEED_PUBLIC_KEYS_JSON
if (!keyId || !configuredJson) {
  throw new Error('UPDATE_FEED_SIGNING_KEY_ID and UPDATE_FEED_PUBLIC_KEYS_JSON are required')
}
const configured = JSON.parse(configuredJson)
const embedded = JSON.parse(await readFile('backend/config/platform-update-public-keys.json', 'utf8'))
const configuredKey = typeof configured?.[keyId] === 'string' ? configured[keyId].trim() : ''
const embeddedKey = typeof embedded?.[keyId] === 'string' ? embedded[keyId].trim() : ''
if (!configuredKey || !embeddedKey) {
  throw new Error(`Active signing key ${keyId} must exist in both the release keyring and the embedded backend keyring`)
}
if (configuredKey !== embeddedKey) {
  throw new Error(`Embedded public key for ${keyId} does not match the protected release environment`)
}
process.stdout.write(`Validated embedded trust for active update signing key ${keyId}.\n`)
