import assert from 'node:assert/strict'
import test from 'node:test'
import { getPlatformBuildInfo, PLATFORM_VERSION } from '../src/lib/build-info.js'

test('container provenance takes priority over metadata from old deployment environments', () => {
  const env = { NEBULYNK_BUILD_SHA: 'obsolete-source-commit', NEBULYNK_BUILD_TIME: 'old-source-date' }
  const image = { sha: 'a'.repeat(40), built_at: '2026-10-05T10:00:00Z' }
  assert.deepEqual(getPlatformBuildInfo(env, image), { version: PLATFORM_VERSION, ...image })
  assert.deepEqual(getPlatformBuildInfo(env, { sha: null, built_at: null }), {
    version: PLATFORM_VERSION, sha: null, built_at: null
  })
})

test('source deployments continue accepting environment build metadata', () => {
  assert.deepEqual(getPlatformBuildInfo({ NEBULYNK_BUILD_SHA: ' source ', NEBULYNK_BUILD_TIME: ' date ' }, null), {
    version: PLATFORM_VERSION, sha: 'source', built_at: 'date'
  })
  assert.deepEqual(getPlatformBuildInfo({}, null), { version: PLATFORM_VERSION, sha: null, built_at: null })
})
