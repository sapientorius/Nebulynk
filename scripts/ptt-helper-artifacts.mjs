import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const variants = [
  { platform: 'macos', arch: 'aarch64', beta: true, extension: 'dmg' },
  { platform: 'macos', arch: 'x86_64', beta: true, extension: 'dmg' },
  { platform: 'windows', arch: 'x86_64', beta: false, extension: 'msi' }
]
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const metadataName = variant => `ptt-helper-${variant.platform}-${variant.arch}.json`
const fileName = (variant, version) => `nebulynk-ptt-helper_${version}_${variant.platform}${variant.beta ? '-beta' : ''}_${variant.arch}.${variant.extension}`

async function versions() {
  const json = async name => JSON.parse(await readFile(join(root, name), 'utf8'))
  const [platform, helper, config, cargo] = await Promise.all([
    json('package.json'), json('desktop-ptt-helper/package.json'),
    json('desktop-ptt-helper/src-tauri/tauri.conf.json'),
    readFile(join(root, 'desktop-ptt-helper/src-tauri/Cargo.toml'), 'utf8')
  ])
  const cargoVersion = cargo.match(/^version = "([^"]+)"/m)?.[1]
  if (!/^\d+\.\d+\.\d+$/.test(helper.version) || helper.version !== config.version || helper.version !== cargoVersion) {
    throw new Error('PTT Helper versions must match in npm, Cargo and Tauri')
  }
  return { platformVersion: platform.version, helperVersion: helper.version }
}

function revision(value) {
  if (!/^[a-f0-9]{40}$/i.test(value || '')) throw new Error('A full source commit SHA is required')
  return value
}

export function validateMetadata(metadata, expected) {
  const variant = variants.find(v => v.platform === metadata?.platform && v.arch === metadata?.arch)
  if (!variant || metadata.schemaVersion !== 1 || metadata.beta !== variant.beta
    || metadata.helperVersion !== expected.helperVersion || metadata.platformVersion !== expected.platformVersion
    || metadata.revision !== expected.revision || metadata.file !== fileName(variant, expected.helperVersion)
    || !/^[a-f0-9]{64}$/.test(metadata.sha256 || '') || !Number.isSafeInteger(metadata.size) || metadata.size <= 0) {
    throw new Error('Invalid or conflicting PTT Helper artifact metadata')
  }
  return variant
}

export async function verifyFiles(directory, metadata, expected) {
  validateMetadata(metadata, expected)
  const [bytes, checksum] = await Promise.all([
    readFile(join(directory, metadata.file)), readFile(join(directory, `${metadata.file}.sha256`), 'utf8')
  ])
  if (bytes.length !== metadata.size || sha256(bytes) !== metadata.sha256
    || checksum.trim() !== `${metadata.sha256}  ${metadata.file}`) {
    throw new Error(`PTT Helper checksum mismatch: ${metadata.file}`)
  }
}

export async function packageArtifact({ platform, arch, source, output, revision: commit }) {
  const variant = variants.find(v => v.platform === platform && v.arch === arch)
  if (!variant) throw new Error('Unsupported PTT Helper build variant')
  const expected = { ...await versions(), revision: revision(commit) }
  const entries = await readdir(source, { recursive: true, withFileTypes: true })
  const candidates = entries.filter(e => e.isFile() && e.name.endsWith(`.${variant.extension}`))
  if (candidates.length !== 1) throw new Error(`Expected one ${variant.extension} bundle; found ${candidates.length}`)
  const sourceFile = join(candidates[0].parentPath, candidates[0].name)
  const bytes = await readFile(sourceFile)
  const metadata = { schemaVersion: 1, ...expected, platform, arch, beta: variant.beta,
    file: fileName(variant, expected.helperVersion), sha256: sha256(bytes), size: bytes.length }
  validateMetadata(metadata, expected)
  await mkdir(output, { recursive: true })
  await copyFile(sourceFile, join(output, metadata.file))
  await writeFile(join(output, `${metadata.file}.sha256`), `${metadata.sha256}  ${metadata.file}\n`)
  await writeFile(join(output, metadataName(variant)), JSON.stringify(metadata, null, 2) + '\n')
  await verifyFiles(output, metadata, expected)
  return metadata
}

export async function collectArtifacts(directory, commit) {
  const expected = { ...await versions(), revision: revision(commit) }
  const artifacts = []
  for (const variant of variants) {
    const metadata = JSON.parse(await readFile(join(directory, metadataName(variant)), 'utf8'))
    if (metadata.platform !== variant.platform || metadata.arch !== variant.arch) throw new Error('PTT Helper variant mismatch')
    await verifyFiles(directory, metadata, expected)
    artifacts.push(metadata)
  }
  const manifest = { schemaVersion: 1, ...expected, artifacts }
  await writeFile(join(directory, 'ptt-helper-assets.json'), JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}

export async function verifyPublished(expectedDirectory, publishedDirectory, commit) {
  const expected = await collectArtifacts(expectedDirectory, commit)
  const published = JSON.parse(await readFile(join(publishedDirectory, 'ptt-helper-assets.json'), 'utf8'))
  if (JSON.stringify(published) !== JSON.stringify(expected)) throw new Error('Published PTT Helper manifest conflicts with the verified release')
  for (const metadata of expected.artifacts) await verifyFiles(publishedDirectory, metadata, expected)
}

export async function verifyPublic(directory, commit, { fetchImpl = fetch, repository = process.env.GITHUB_REPOSITORY || 'sapientorius/Nebulynk' } = {}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid release repository')
  const expected = await collectArtifacts(directory, commit)
  const download = async name => {
    const url = `https://github.com/${repository}/releases/download/v${expected.platformVersion}/${encodeURIComponent(name)}`
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(60_000) })
    if (!response.ok) throw new Error(`Public PTT Helper download failed: ${name} (HTTP ${response.status})`)
    return Buffer.from(await response.arrayBuffer())
  }
  const published = JSON.parse((await download('ptt-helper-assets.json')).toString('utf8'))
  if (JSON.stringify(published) !== JSON.stringify(expected)) throw new Error('Public PTT Helper manifest conflicts with the verified release')
  for (const metadata of expected.artifacts) {
    const bytes = await download(metadata.file)
    const checksum = (await download(`${metadata.file}.sha256`)).toString('utf8').trim()
    if (bytes.length !== metadata.size || sha256(bytes) !== metadata.sha256
      || checksum !== `${metadata.sha256}  ${metadata.file}`) throw new Error(`Public PTT Helper checksum mismatch: ${metadata.file}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, ...args] = process.argv.slice(2)
  const commit = process.env.GITHUB_SHA
  if (command === 'package' && args.length === 4) {
    await packageArtifact({ platform: args[0], arch: args[1], source: args[2], output: args[3], revision: commit })
  } else if (command === 'collect' && args.length === 1) {
    await collectArtifacts(args[0], commit)
  } else if (command === 'verify-published' && args.length === 2) {
    await verifyPublished(args[0], args[1], commit)
  } else if (command === 'verify-public' && args.length === 1) {
    await verifyPublic(args[0], commit)
  } else if (command === 'list' && args.length === 1) {
    const manifest = await collectArtifacts(args[0], commit)
    for (const metadata of manifest.artifacts) {
      console.log(join(args[0], basename(metadata.file)))
      console.log(join(args[0], `${basename(metadata.file)}.sha256`))
    }
    console.log(join(args[0], 'ptt-helper-assets.json'))
  } else throw new Error('Usage: ptt-helper-artifacts.mjs package PLATFORM ARCH SOURCE OUTPUT | collect DIR | list DIR | verify-published EXPECTED PUBLISHED')
}
