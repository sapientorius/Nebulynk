import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadReleaseCatalog } from './release-catalog.mjs'

const rootDir = process.cwd()
const { releases } = await loadReleaseCatalog(rootDir)
const packagePaths = ['package.json', 'backend/package.json', 'frontend/package.json']
const packageVersions = await Promise.all(packagePaths.map(async (packagePath) => {
  const value = JSON.parse(await readFile(path.join(rootDir, packagePath), 'utf8'))
  return { packagePath, version: value.version }
}))
const latestVersion = releases.at(-1).document.version

for (const entry of packageVersions) {
  if (entry.version !== latestVersion) {
    throw new Error(`${entry.packagePath} version ${entry.version} does not match latest stable release ${latestVersion}`)
  }
}

const expectedTag = process.env.GITHUB_REF_TYPE === 'tag'
  ? String(process.env.GITHUB_REF_NAME || '').replace(/^v/, '')
  : null
if (expectedTag && expectedTag !== latestVersion) {
  throw new Error(`release tag ${expectedTag} does not match catalog version ${latestVersion}`)
}

process.stdout.write(`Validated ${releases.length} stable releases through v${latestVersion}.\n`)
