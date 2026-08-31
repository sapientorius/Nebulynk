import { createHash } from 'node:crypto'
import { access, cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { deflateRawSync, inflateRawSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const extensionSourceRoot = path.join(repositoryRoot, 'plesk-extension')
const outputRoot = path.join(repositoryRoot, 'dist', 'plesk')
const stagingRoot = path.join(outputRoot, 'staging')
const packageRoot = path.join(stagingRoot, 'package')
const extensionLogoSource = path.join(repositoryRoot, 'frontend', 'src', 'assets', 'nebulynk.png')
const extensionLogoTarget = path.join(packageRoot, 'htdocs', 'images', 'nebulynk.png')
const extensionIconEntries = [
  { relativePath: '_meta/icons/32x32.png', width: 32, height: 32 },
  { relativePath: '_meta/icons/64x64.png', width: 64, height: 64 },
  { relativePath: '_meta/icons/128x128.png', width: 128, height: 128 }
]
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const payloadEntries = [
  'package.json',
  'package-lock.json',
  'backend',
  'frontend',
  'deploy/plesk',
  'garage.toml',
  'livekit.yaml'
]

const excludedDirectoryNames = new Set([
  '.git',
  '.github',
  '.agents',
  '.codex',
  '.claude',
  '.kilo',
  '.local',
  'coverage',
  '.cache',
  '.vite',
  'dist',
  'dist-plesk',
  'data',
  'node_modules',
  'secrets',
  'storage',
  'tmp',
  'uploads',
  'playwright-report',
  'test-results'
])

const excludedRelativePaths = new Set([
  'frontend/public/vendor',
  'frontend/public/test.html',
  'backend/test',
  'frontend/test'
])

function normalizeRelativePath(value) {
  return value.replace(/\\/g, '/')
}

function compareNames(left, right) {
  if (left.name < right.name) return -1
  if (left.name > right.name) return 1
  return 0
}

function isExcludedPath(relativePath) {
  const normalized = normalizeRelativePath(relativePath)
  const segments = normalized.split('/')

  if (segments.some((segment) => excludedDirectoryNames.has(segment))) {
    return true
  }

  for (const excludedPath of excludedRelativePaths) {
    if (normalized === excludedPath || normalized.startsWith(`${excludedPath}/`)) {
      return true
    }
  }

  const basename = segments.at(-1) || ''
  if (basename === '.env' || basename.startsWith('.env.')) {
    return true
  }
  if (/(?:\.log|\.pem|\.key|\.p12|\.pfx|\.sqlite3?|\.db)$/i.test(basename)) {
    return true
  }

  return false
}

async function pathExists(targetPath) {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(repositoryRoot, relativePath), 'utf8'))
}

async function readReleaseMetadata(version) {
  const releasePath = path.join(repositoryRoot, 'releases', `v${version}.json`)
  const release = JSON.parse(await readFile(releasePath, 'utf8'))
  if (!Number.isInteger(release.revision) || release.revision < 1) {
    throw new Error(`releases/v${version}.json must contain a positive integer revision.`)
  }
  return release
}

function renderMetaXml({ version, release }) {
  return `<?xml version="1.0" encoding="utf-8"?>
<module>
    <id>nebulynk-plesk</id>
    <name>Nebulynk</name>
    <description>Deploy and operate Nebulynk on a Plesk Linux server.</description>
    <category>web_app</category>
    <version>${version}</version>
    <release>${release}</release>
    <vendor>Nebulynk</vendor>
    <url>https://github.com/sapientorius/Nebulynk</url>
    <help_url>https://github.com/sapientorius/Nebulynk/blob/stable/docs/PLESK.md</help_url>
    <support_url>https://github.com/sapientorius/Nebulynk/issues</support_url>
    <plesk_min_version>18.0.53</plesk_min_version>
    <os>unix</os>
</module>
`
}

function readPngDimensions(content, label) {
  if (content.length < 24 || !content.subarray(0, 8).equals(pngSignature) ||
    content.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`Plesk icon is not a valid PNG: ${label}`)
  }

  return {
    width: content.readUInt32BE(16),
    height: content.readUInt32BE(20)
  }
}

function validatePngIcon(content, icon) {
  const dimensions = readPngDimensions(content, icon.relativePath)
  if (dimensions.width !== icon.width || dimensions.height !== icon.height) {
    throw new Error(
      `Plesk icon has unexpected dimensions: ${icon.relativePath} ` +
      `(${dimensions.width}x${dimensions.height}, expected ${icon.width}x${icon.height})`
    )
  }
}

async function validateExtensionIcons(rootPath) {
  for (const icon of extensionIconEntries) {
    const iconPath = path.join(rootPath, icon.relativePath)
    if (!await pathExists(iconPath)) {
      throw new Error(`Required Plesk icon is missing: ${icon.relativePath}`)
    }
    validatePngIcon(await readFile(iconPath), icon)
  }
}

async function collectFiles(rootPath, relativePath = '') {
  const entries = await readdir(rootPath, { withFileTypes: true })
  entries.sort(compareNames)

  const files = []
  for (const entry of entries) {
    const nextRelativePath = relativePath
      ? path.join(relativePath, entry.name)
      : entry.name
    const normalizedPath = normalizeRelativePath(nextRelativePath)

    if (isExcludedPath(normalizedPath)) continue

    const absolutePath = path.join(rootPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath, nextRelativePath))
      continue
    }

    if (!entry.isFile()) {
      throw new Error(`Unsupported non-file entry in package: ${normalizedPath}`)
    }

    files.push({ absolutePath, relativePath: normalizedPath })
  }

  return files
}

async function copyFilteredTree(sourcePath, destinationPath, relativePath = '') {
  const entries = await readdir(sourcePath, { withFileTypes: true })
  entries.sort(compareNames)

  for (const entry of entries) {
    const nextRelativePath = relativePath
      ? path.join(relativePath, entry.name)
      : entry.name
    const normalizedPath = normalizeRelativePath(nextRelativePath)

    if (isExcludedPath(normalizedPath)) continue

    const sourceEntry = path.join(sourcePath, entry.name)
    const destinationEntry = path.join(destinationPath, entry.name)

    if (entry.isDirectory()) {
      await mkdir(destinationEntry, { recursive: true })
      await copyFilteredTree(sourceEntry, destinationEntry, nextRelativePath)
      continue
    }

    if (!entry.isFile()) {
      throw new Error(`Unsupported non-file entry in payload: ${normalizedPath}`)
    }

    await cp(sourceEntry, destinationEntry)
  }
}

async function copyPayload() {
  const payloadRoot = path.join(packageRoot, 'var', 'payload')
  await mkdir(payloadRoot, { recursive: true })

  for (const entry of payloadEntries) {
    const sourcePath = path.join(repositoryRoot, entry)
    if (!await pathExists(sourcePath)) {
      throw new Error(`Required Plesk payload entry does not exist: ${entry}`)
    }

    const destinationPath = path.join(payloadRoot, entry)
    const sourceStats = await stat(sourcePath)
    if (sourceStats.isDirectory()) {
      await mkdir(destinationPath, { recursive: true })
      await copyFilteredTree(sourcePath, destinationPath, entry)
    } else {
      await cp(sourcePath, destinationPath)
    }
  }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function writePayloadManifest(metadata) {
  const payloadRoot = path.join(packageRoot, 'var', 'payload')
  const files = await collectFiles(payloadRoot)
  const manifest = {
    schema_version: 1,
    application_version: metadata.version,
    extension_release: metadata.release,
    files: []
  }

  for (const file of files) {
    const content = await readFile(file.absolutePath)
    manifest.files.push({
      path: file.relativePath,
      bytes: content.length,
      sha256: sha256(content)
    })
  }

  await writeFile(
    path.join(payloadRoot, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  )
}

function parsePayloadManifest(manifestText, metadata) {
  let manifest
  try {
    manifest = JSON.parse(manifestText)
  } catch (error) {
    throw new Error(`Plesk payload manifest is not valid JSON: ${error.message}`)
  }

  if (manifest.schema_version !== 1) {
    throw new Error('Plesk payload manifest has an unsupported schema version.')
  }
  if (manifest.application_version !== metadata.version) {
    throw new Error('Plesk payload manifest version does not match package.json.')
  }
  if (manifest.extension_release !== metadata.release) {
    throw new Error('Plesk payload manifest release does not match release metadata.')
  }
  if (!Array.isArray(manifest.files)) {
    throw new Error('Plesk payload manifest must contain a files array.')
  }

  const records = new Map()
  for (const record of manifest.files) {
    if (!record || typeof record.path !== 'string' || !record.path ||
      path.posix.isAbsolute(record.path) || record.path.split('/').includes('..') ||
      !Number.isInteger(record.bytes) || record.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(record.sha256)) {
      throw new Error('Plesk payload manifest contains an invalid file record.')
    }
    if (records.has(record.path)) {
      throw new Error(`Plesk payload manifest contains a duplicate path: ${record.path}`)
    }
    records.set(record.path, record)
  }

  return records
}

async function validatePayloadManifestOnFilesystem(metadata) {
  const payloadRoot = path.join(packageRoot, 'var', 'payload')
  const manifestPath = path.join(payloadRoot, 'manifest.json')
  const records = parsePayloadManifest(await readFile(manifestPath, 'utf8'), metadata)
  const files = (await collectFiles(payloadRoot))
    .filter((file) => file.relativePath !== 'manifest.json')

  if (records.size !== files.length) {
    throw new Error('Plesk payload manifest file count does not match the staged payload.')
  }

  for (const file of files) {
    const record = records.get(file.relativePath)
    if (!record) {
      throw new Error(`Plesk payload manifest is missing: ${file.relativePath}`)
    }
    const content = await readFile(file.absolutePath)
    if (record.bytes !== content.length || record.sha256 !== sha256(content)) {
      throw new Error(`Plesk payload manifest hash mismatch: ${file.relativePath}`)
    }
  }
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function uint16(value) {
  const buffer = Buffer.allocUnsafe(2)
  buffer.writeUInt16LE(value, 0)
  return buffer
}

function uint32(value) {
  const buffer = Buffer.allocUnsafe(4)
  buffer.writeUInt32LE(value >>> 0, 0)
  return buffer
}

function zipEntryMode(relativePath) {
  return relativePath.startsWith('sbin/') ? 0o100750 : 0o100644
}

async function createZip(sourceRoot, destinationPath) {
  const files = await collectFiles(sourceRoot)
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const file of files) {
    const name = Buffer.from(file.relativePath, 'utf8')
    const input = await readFile(file.absolutePath)
    const compressed = deflateRawSync(input, { level: 9 })
    const checksum = crc32(input)
    const mode = zipEntryMode(file.relativePath)

    const localHeader = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0x0800),
      uint16(8),
      uint16(0),
      uint16(0),
      uint32(checksum),
      uint32(compressed.length),
      uint32(input.length),
      uint16(name.length),
      uint16(0),
      name
    ])
    localParts.push(localHeader, compressed)

    const centralHeader = Buffer.concat([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0x0800),
      uint16(8),
      uint16(0),
      uint16(0),
      uint32(checksum),
      uint32(compressed.length),
      uint32(input.length),
      uint16(name.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(mode << 16),
      uint32(offset),
      name
    ])
    centralParts.push(centralHeader)
    offset += localHeader.length + compressed.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const localDirectory = Buffer.concat(localParts)
  const endOfDirectory = Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(files.length),
    uint16(files.length),
    uint32(centralDirectory.length),
    uint32(localDirectory.length),
    uint16(0)
  ])

  await writeFile(destinationPath, Buffer.concat([localDirectory, centralDirectory, endOfDirectory]))
  return files.length
}

function findEndOfCentralDirectory(zipBuffer) {
  for (let index = zipBuffer.length - 22; index >= 0; index -= 1) {
    if (zipBuffer.readUInt32LE(index) === 0x06054b50) return index
  }
  throw new Error('ZIP end-of-central-directory record is missing.')
}

function parseZipEntries(zipBuffer) {
  const endOffset = findEndOfCentralDirectory(zipBuffer)
  const entryCount = zipBuffer.readUInt16LE(endOffset + 10)
  const centralSize = zipBuffer.readUInt32LE(endOffset + 12)
  const centralOffset = zipBuffer.readUInt32LE(endOffset + 16)
  const entries = []
  let offset = centralOffset

  for (let index = 0; index < entryCount; index += 1) {
    if (zipBuffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('ZIP central-directory record is invalid.')
    }

    const nameLength = zipBuffer.readUInt16LE(offset + 28)
    const extraLength = zipBuffer.readUInt16LE(offset + 30)
    const commentLength = zipBuffer.readUInt16LE(offset + 32)
    const name = zipBuffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    entries.push({
      name,
      method: zipBuffer.readUInt16LE(offset + 10),
      compressedSize: zipBuffer.readUInt32LE(offset + 20),
      uncompressedSize: zipBuffer.readUInt32LE(offset + 24),
      localOffset: zipBuffer.readUInt32LE(offset + 42)
    })
    offset += 46 + nameLength + extraLength + commentLength
  }

  if (offset - centralOffset !== centralSize) {
    throw new Error('ZIP central-directory size does not match its records.')
  }

  return entries
}

function readZipEntry(zipBuffer, entry) {
  const localOffset = entry.localOffset
  if (zipBuffer.readUInt32LE(localOffset) !== 0x04034b50) {
    throw new Error(`ZIP local record is invalid for ${entry.name}.`)
  }

  const nameLength = zipBuffer.readUInt16LE(localOffset + 26)
  const extraLength = zipBuffer.readUInt16LE(localOffset + 28)
  const dataOffset = localOffset + 30 + nameLength + extraLength
  const compressed = zipBuffer.subarray(dataOffset, dataOffset + entry.compressedSize)

  if (compressed.length !== entry.compressedSize) {
    throw new Error(`ZIP entry is truncated: ${entry.name}`)
  }

  let content
  if (entry.method === 0) {
    content = compressed
  } else if (entry.method === 8) {
    content = inflateRawSync(compressed)
  } else {
    throw new Error(`Unsupported ZIP compression method for ${entry.name}: ${entry.method}`)
  }

  if (content.length !== entry.uncompressedSize) {
    throw new Error(`ZIP entry size mismatch: ${entry.name}`)
  }
  return content
}

function validatePayloadManifestInArchive(archive, entries, metadata) {
  const manifestEntry = entries.find((entry) => entry.name === 'var/payload/manifest.json')
  if (!manifestEntry) {
    throw new Error('Plesk ZIP is missing the payload manifest.')
  }

  const records = parsePayloadManifest(
    readZipEntry(archive, manifestEntry).toString('utf8'),
    metadata
  )
  const payloadEntries = entries.filter((entry) =>
    entry.name.startsWith('var/payload/') && entry.name !== 'var/payload/manifest.json'
  )

  if (records.size !== payloadEntries.length) {
    throw new Error('Plesk payload manifest file count does not match the ZIP payload.')
  }

  for (const entry of payloadEntries) {
    const relativePath = entry.name.slice('var/payload/'.length)
    const record = records.get(relativePath)
    if (!record) {
      throw new Error(`Plesk payload manifest is missing from the ZIP: ${relativePath}`)
    }
    const content = readZipEntry(archive, entry)
    if (record.bytes !== content.length || record.sha256 !== sha256(content)) {
      throw new Error(`Plesk ZIP payload hash mismatch: ${relativePath}`)
    }
  }
}

function assertNoForbiddenPackageEntries(entries) {
  const forbiddenPatterns = [
    /(^|\/)\.env(?:\.|$)/i,
    /(^|\/)node_modules(?:\/|$)/i,
    /(^|\/)\.git(?:\/|$)/i,
    /(^|\/)(?:dist|coverage|test-results|playwright-report|data|secrets?|storage|uploads|tmp)(?:\/|$)/i,
    /\.(?:log|pem|key|p12|pfx|sqlite3?|db)$/i
  ]

  const forbidden = entries.filter((entry) => forbiddenPatterns.some((pattern) => pattern.test(entry)))
  if (forbidden.length > 0) {
    throw new Error(`Forbidden entries found in Plesk ZIP: ${forbidden.join(', ')}`)
  }
}

async function getBuildMetadata() {
  const rootPackage = await readJson('package.json')
  const release = await readReleaseMetadata(rootPackage.version)
  return {
    version: rootPackage.version,
    release: release.revision
  }
}

async function stagePackage(metadata) {
  await rm(stagingRoot, { recursive: true, force: true })
  await mkdir(packageRoot, { recursive: true })

  const extensionEntries = ['DESCRIPTION.md', 'CHANGES.md', '_meta', 'htdocs', 'plib', 'sbin']
  for (const entry of extensionEntries) {
    const sourcePath = path.join(extensionSourceRoot, entry)
    if (!await pathExists(sourcePath)) {
      throw new Error(`Required Plesk extension entry does not exist: ${entry}`)
    }
    await cp(sourcePath, path.join(packageRoot, entry), { recursive: true })
  }

  if (!await pathExists(extensionLogoSource)) {
    throw new Error('Required Nebulynk logo asset does not exist: frontend/src/assets/nebulynk.png')
  }
  await mkdir(path.dirname(extensionLogoTarget), { recursive: true })
  await cp(extensionLogoSource, extensionLogoTarget)

  await writeFile(path.join(packageRoot, 'meta.xml'), renderMetaXml(metadata), 'utf8')
  await copyPayload()
  await writePayloadManifest(metadata)
}

async function validateStaging(metadata) {
  const requiredPaths = [
    'meta.xml',
    'DESCRIPTION.md',
    'CHANGES.md',
    'htdocs/index.php',
    'htdocs/images/nebulynk.png',
    ...extensionIconEntries.map((icon) => icon.relativePath),
    'plib/controllers/IndexController.php',
    'plib/views/scripts/index/index.phtml',
    'plib/views/scripts/index/_actions.phtml',
    'plib/views/scripts/index/_prerequisites.phtml',
    'plib/hooks/WebServer.php',
    'plib/hooks/LongTasks.php',
    'sbin/nebulynk-plesk',
    'var/payload/package.json',
    'var/payload/deploy/plesk/docker-compose.yml',
    'var/payload/manifest.json'
  ]

  for (const relativePath of requiredPaths) {
    if (!await pathExists(path.join(packageRoot, relativePath))) {
      throw new Error(`Required staged file is missing: ${relativePath}`)
    }
  }

  await validateExtensionIcons(packageRoot)

  const metaXml = await readFile(path.join(packageRoot, 'meta.xml'), 'utf8')
  if (!metaXml.includes('<id>nebulynk-plesk</id>')) {
    throw new Error('Plesk meta.xml has an unexpected extension id.')
  }
  if (!metaXml.includes(`<version>${metadata.version}</version>`)) {
    throw new Error('Plesk meta.xml version does not match package.json.')
  }
  if (!metaXml.includes(`<release>${metadata.release}</release>`)) {
    throw new Error('Plesk meta.xml release does not match release metadata.')
  }

  const files = await collectFiles(packageRoot)
  assertNoForbiddenPackageEntries(files.map((file) => file.relativePath))
  await validatePayloadManifestOnFilesystem(metadata)
}

async function validateArchive(archivePath, metadata) {
  const archive = await readFile(archivePath)
  const entries = parseZipEntries(archive)
  const entryNames = entries.map((entry) => entry.name)
  assertNoForbiddenPackageEntries(entryNames)

  if (!entryNames.includes('meta.xml')) {
    throw new Error('Plesk ZIP must contain meta.xml at its root.')
  }
  if (!entryNames.includes('sbin/nebulynk-plesk')) {
    throw new Error('Plesk ZIP is missing the privileged helper.')
  }
  if (!entryNames.includes('htdocs/images/nebulynk.png')) {
    throw new Error('Plesk ZIP is missing the Nebulynk logo asset.')
  }
  for (const icon of extensionIconEntries) {
    const entry = entries.find((candidate) => candidate.name === icon.relativePath)
    if (!entry) {
      throw new Error(`Plesk ZIP is missing the extension icon: ${icon.relativePath}`)
    }
    validatePngIcon(readZipEntry(archive, entry), icon)
  }
  if (entryNames.some((entry) => entry.startsWith('package/'))) {
    throw new Error('Plesk ZIP must not contain an enclosing package directory.')
  }

  const endOffset = findEndOfCentralDirectory(archive)
  if (archive.readUInt16LE(endOffset + 8) !== archive.readUInt16LE(endOffset + 10)) {
    throw new Error('ZIP entry count is inconsistent.')
  }

  const metaXml = readZipEntry(archive, entries.find((entry) => entry.name === 'meta.xml')).toString('utf8')
  if (!metaXml.includes('<id>nebulynk-plesk</id>')) {
    throw new Error('Archived Plesk meta.xml has an unexpected extension id.')
  }
  if (!metaXml.includes(`<version>${metadata.version}</version>`)) {
    throw new Error('Archived Plesk metadata version does not match package.json.')
  }
  if (!metaXml.includes(`<release>${metadata.release}</release>`)) {
    throw new Error('Archived Plesk metadata release does not match release metadata.')
  }
  validatePayloadManifestInArchive(archive, entries, metadata)
}

export async function buildPleskExtension() {
  const metadata = await getBuildMetadata()
  await stagePackage(metadata)
  await validateStaging(metadata)

  const archiveName = `nebulynk-plesk-${metadata.version}-${metadata.release}.zip`
  const archivePath = path.join(outputRoot, archiveName)
  await mkdir(outputRoot, { recursive: true })
  const fileCount = await createZip(packageRoot, archivePath)
  await validateArchive(archivePath, metadata)

  const checksum = createHash('sha256').update(await readFile(archivePath)).digest('hex')
  await writeFile(`${archivePath}.sha256`, `${checksum}  ${archiveName}\n`, 'utf8')

  return {
    archivePath,
    checksum,
    fileCount,
    ...metadata
  }
}

export async function validatePleskExtension() {
  const metadata = await getBuildMetadata()
  const archiveName = `nebulynk-plesk-${metadata.version}-${metadata.release}.zip`
  const archivePath = path.join(outputRoot, archiveName)
  if (!await pathExists(archivePath)) {
    throw new Error(`Plesk ZIP does not exist: ${path.relative(repositoryRoot, archivePath)}`)
  }
  await validateArchive(archivePath, metadata)
  const checksumPath = `${archivePath}.sha256`
  if (!await pathExists(checksumPath)) {
    throw new Error(`Plesk ZIP checksum does not exist: ${path.relative(repositoryRoot, checksumPath)}`)
  }
  const expectedChecksum = `${sha256(await readFile(archivePath))}  ${archiveName}\n`
  const checksum = await readFile(checksumPath, 'utf8')
  if (checksum !== expectedChecksum) {
    throw new Error('Plesk ZIP checksum does not match the archive.')
  }

  return { archivePath, ...metadata }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argumentsPassed = process.argv.slice(2)
  const checkOnly = argumentsPassed.includes('--check')
  const unsupportedArguments = argumentsPassed.filter((argument) => argument !== '--check')
  if (unsupportedArguments.length > 0) {
    throw new Error(`Unsupported argument: ${unsupportedArguments.join(', ')}`)
  }

  const result = checkOnly
    ? await validatePleskExtension()
    : await buildPleskExtension()
  const relativeArchive = path.relative(repositoryRoot, result.archivePath)
  process.stdout.write(`${checkOnly ? 'Validated' : 'Built'} ${relativeArchive}\n`)
}
