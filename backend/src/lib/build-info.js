import { readFileSync } from 'node:fs'

const packageDocument = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))

export const PLATFORM_VERSION = packageDocument.version

export function getPlatformBuildInfo(env = process.env) {
  return {
    version: PLATFORM_VERSION,
    sha: typeof env.NEBULYNK_BUILD_SHA === 'string' && env.NEBULYNK_BUILD_SHA.trim()
      ? env.NEBULYNK_BUILD_SHA.trim()
      : null,
    built_at: typeof env.NEBULYNK_BUILD_TIME === 'string' && env.NEBULYNK_BUILD_TIME.trim()
      ? env.NEBULYNK_BUILD_TIME.trim()
      : null
  }
}
