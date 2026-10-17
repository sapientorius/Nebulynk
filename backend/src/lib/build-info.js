import { readFileSync } from 'node:fs'

const packageDocument = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
let containerBuildInfo = null
try {
  containerBuildInfo = JSON.parse(readFileSync(new URL('../../container-build-info.json', import.meta.url), 'utf8'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

export const PLATFORM_VERSION = packageDocument.version

export function getPlatformBuildInfo(env = process.env, image = containerBuildInfo) {
  // Existing .env files can still contain source-build metadata. A prebuilt
  // image always describes its own commit, regardless of those legacy values.
  const metadata = image ? { NEBULYNK_BUILD_SHA: image.sha, NEBULYNK_BUILD_TIME: image.built_at } : env
  return {
    version: PLATFORM_VERSION,
    sha: typeof metadata.NEBULYNK_BUILD_SHA === 'string' && metadata.NEBULYNK_BUILD_SHA.trim()
      ? metadata.NEBULYNK_BUILD_SHA.trim()
      : null,
    built_at: typeof metadata.NEBULYNK_BUILD_TIME === 'string' && metadata.NEBULYNK_BUILD_TIME.trim()
      ? metadata.NEBULYNK_BUILD_TIME.trim()
      : null
  }
}
