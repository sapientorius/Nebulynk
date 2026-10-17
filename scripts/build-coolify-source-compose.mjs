import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const outputFile = 'docker-compose.coolify.source.yml'
const targets = {
  frontend: { dockerfile: 'frontend/Dockerfile', target: 'production-stage' },
  backend: { dockerfile: 'backend/Dockerfile', target: 'backend' },
  'transcription-worker': { dockerfile: 'backend/Dockerfile', target: 'transcription-worker' }
}

export async function buildCoolifySourceCompose({ check = false } = {}) {
  let source = (await readFile(resolve(root, 'docker-compose.coolify.yml'), 'utf8')).replace(/\r\n/g, '\n')
  for (const [component, { dockerfile, target }] of Object.entries(targets)) {
    const imageLine = new RegExp(`^    image: ghcr\\.io/sapientorius/nebulynk-${component}:.*$`, 'gm')
    if ([...source.matchAll(imageLine)].length !== 1) throw new Error(`Expected exactly one ${component} release image in docker-compose.coolify.yml`)
    source = source.replace(imageLine, [
      '    pull_policy: build',
      '    build:',
      '      context: .',
      `      dockerfile: ${dockerfile}`,
      `      target: ${target}`,
      '      args:',
      '        BUILD_SHA: ${NEBULYNK_BUILD_SHA:-${SOURCE_COMMIT:-}}',
      '        BUILD_TIME: ${NEBULYNK_BUILD_TIME:-}'
    ].join('\n'))
  }
  const generated = [
    '# Generated from docker-compose.coolify.yml by npm run coolify:source.',
    '# Standalone source-build deployment for Coolify branch tests/custom changes.',
    '# Select this file and the desired Git branch; NEBULYNK_VERSION is unused.',
    '# Edit the shared configuration or generator, then regenerate this file.',
    source
  ].join('\n')
  if (check) {
    const current = (await readFile(resolve(root, outputFile), 'utf8')).replace(/\r\n/g, '\n')
    if (current !== generated) throw new Error(`${outputFile} is stale; run npm run coolify:source`)
  } else {
    await writeFile(resolve(root, outputFile), generated)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await buildCoolifySourceCompose({ check: process.argv.includes('--check') })
}
