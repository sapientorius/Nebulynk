import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const deploymentFiles = [
  'docker-compose.self-hosted.yml', 'docker-compose.coolify.yml', 'docker-compose.dokploy.yml',
  'dokploy-template/docker-compose.yml', 'deploy/plesk/docker-compose.yml'
]
const root = fileURLToPath(new URL('../', import.meta.url))

export async function syncContainerVersion({ check = false } = {}) {
  const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  for (const file of [...deploymentFiles, 'dokploy-template/template.toml']) {
    const target = resolve(root, file)
    const source = await readFile(target, 'utf8')
    const next = source.replace(/NEBULYNK_VERSION:-\d+\.\d+\.\d+/g, `NEBULYNK_VERSION:-${version}`)
      .replace(/^image_version = "\d+\.\d+\.\d+"/m, `image_version = "${version}"`)
    if (check && next !== source) throw new Error(`${file} has stale image defaults; run npm run containers:version`)
    if (!check && next !== source) await writeFile(target, next)
    if (file.endsWith('docker-compose.yml') || file.startsWith('docker-compose.')) {
      for (const component of ['backend', 'frontend', 'transcription-worker']) {
        if (!source.includes(`ghcr.io/sapientorius/nebulynk-${component}:`)) throw new Error(`${file} is missing ${component}`)
      }
      if (/^\s+build:/m.test(source)) throw new Error(`${file} must not build production images`)
    }
  }
  return version
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await syncContainerVersion({ check: process.argv.includes('--check') })
}
