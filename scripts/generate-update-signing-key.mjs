import { generateKeyPairSync } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const [outputArgument, keyIdArgument] = process.argv.slice(2)
if (!outputArgument || !keyIdArgument) {
  throw new Error('Usage: node scripts/generate-update-signing-key.mjs <outside-repository-directory> <key-id>')
}
if (!/^[a-z0-9][a-z0-9._-]{2,63}$/i.test(keyIdArgument)) {
  throw new Error('key-id must contain 3-64 letters, digits, dots, underscores, or hyphens')
}

const repositoryRoot = path.resolve(process.cwd())
const outputDirectory = path.resolve(outputArgument)
const relative = path.relative(repositoryRoot, outputDirectory)
if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
  throw new Error('Refusing to create a release signing key inside the repository')
}

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
const keyring = JSON.stringify({ [keyIdArgument]: publicPem })

await mkdir(outputDirectory, { recursive: true, mode: 0o700 })
await Promise.all([
  writeFile(path.join(outputDirectory, `${keyIdArgument}.private.pem`), privatePem, { flag: 'wx', mode: 0o600 }),
  writeFile(path.join(outputDirectory, `${keyIdArgument}.public.pem`), publicPem, { flag: 'wx', mode: 0o644 }),
  writeFile(path.join(outputDirectory, `${keyIdArgument}.keyring.json`), `${keyring}\n`, { flag: 'wx', mode: 0o644 })
])

process.stdout.write(`Created Ed25519 key ${keyIdArgument} in ${outputDirectory}. The private PEM must only be copied to the protected GitHub release environment.\n`)
