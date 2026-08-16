import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const supportedArguments = new Set(['--check'])
const argumentsPassed = process.argv.slice(2)

for (const argument of argumentsPassed) {
  if (!supportedArguments.has(argument)) {
    throw new Error(`Unsupported argument: ${argument}`)
  }
}

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const templateDirectory = join(repositoryRoot, 'dokploy-template')
const composePath = join(templateDirectory, 'docker-compose.yml')
const configPath = join(templateDirectory, 'template.toml')
const metaPath = join(templateDirectory, 'meta.json')
const packagePath = join(repositoryRoot, 'package.json')
const outputPath = join(templateDirectory, 'import.base64')
const check = argumentsPassed.includes('--check')

const [compose, config, metaRaw, packageRaw] = await Promise.all([
  readFile(composePath, 'utf8'),
  readFile(configPath, 'utf8'),
  readFile(metaPath, 'utf8'),
  readFile(packagePath, 'utf8')
])

const meta = JSON.parse(metaRaw)
const rootPackage = JSON.parse(packageRaw)
if (meta.version !== 'stable' && meta.version !== rootPackage.version) {
  throw new Error(`dokploy-template/meta.json version ${meta.version} must be stable or match package.json version ${rootPackage.version}.`)
}

const normalizeLineEndings = (value) => value.replace(/\r\n?/g, '\n')
const encoded = Buffer.from(JSON.stringify({
  compose: normalizeLineEndings(compose),
  config: normalizeLineEndings(config)
}), 'utf8').toString('base64')
const output = `${encoded}\n`

if (check) {
  const existing = await readFile(outputPath, 'utf8')
  if (existing !== output) {
    throw new Error('dokploy-template/import.base64 is out of date. Run npm run dokploy:template.')
  }
} else {
  await writeFile(outputPath, output, 'utf8')
  console.log('Updated dokploy-template/import.base64')
}
