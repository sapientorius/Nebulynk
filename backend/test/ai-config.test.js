import test from 'node:test'
import assert from 'node:assert/strict'
import { BadRequest } from '@feathersjs/errors'
import {
  assertProviderBaseUrlAllowed,
  normalizeProviderBaseUrl,
  normalizeProviderBaseUrlForStorage,
  validateProviderConfig
} from '../src/lib/ai-config.js'

test('normalizeProviderBaseUrl trims input, strips trailing slash, and preserves path segments', () => {
  assert.equal(
    normalizeProviderBaseUrl('  https://api.example.com/v1/  '),
    'https://api.example.com/v1'
  )
  assert.equal(
    normalizeProviderBaseUrl('https://api.example.com'),
    'https://api.example.com'
  )
})

test('normalizeProviderBaseUrl rejects credentials, query strings, and hash fragments', () => {
  for (const value of [
    'https://user:pass@example.com/v1',
    'https://example.com/v1?token=abc',
    'https://example.com/v1#fragment'
  ]) {
    assert.throws(
      () => normalizeProviderBaseUrl(value),
      (error) => {
        assert.ok(error instanceof BadRequest)
        assert.equal(error.data?.error_code, 'api.ai.base_url_invalid')
        return true
      }
    )
  }
})

test('validateProviderConfig rejects custom base_url values for built-in providers', () => {
  assert.throws(
    () => validateProviderConfig({
      providerType: 'openai',
      baseUrl: 'https://proxy.example.com/v1'
    }),
    (error) => {
      assert.ok(error instanceof BadRequest)
      assert.equal(error.data?.error_code, 'api.ai.base_url_not_supported_for_provider')
      return true
    }
  )
})

test('normalizeProviderBaseUrlForStorage collapses built-in provider defaults to null', () => {
  assert.equal(
    normalizeProviderBaseUrlForStorage('openai', 'https://api.openai.com/v1'),
    null
  )
  assert.equal(
    normalizeProviderBaseUrlForStorage('openai_compatible', 'https://proxy.example.com/v1'),
    'https://proxy.example.com/v1'
  )
})

test('assertProviderBaseUrlAllowed allows local http endpoints outside production', async () => {
  const result = await assertProviderBaseUrlAllowed({
    providerType: 'openai_compatible',
    baseUrl: 'http://127.0.0.1:8080/v1',
    env: { NODE_ENV: 'development' }
  })

  assert.equal(result, 'http://127.0.0.1:8080/v1')
})

test('assertProviderBaseUrlAllowed blocks private DNS targets in production', async () => {
  await assert.rejects(
    assertProviderBaseUrlAllowed({
      providerType: 'openai_compatible',
      baseUrl: 'https://llm.internal.example/v1',
      env: { NODE_ENV: 'production' },
      lookupFn: async () => [{ address: '10.24.3.9' }]
    }),
    (error) => {
      assert.ok(error instanceof BadRequest)
      assert.equal(error.data?.error_code, 'api.ai.base_url_private_host_forbidden')
      return true
    }
  )
})

test('assertProviderBaseUrlAllowed permits exact allowlisted production URLs', async () => {
  const result = await assertProviderBaseUrlAllowed({
    providerType: 'openai_compatible',
    baseUrl: 'https://llm.internal.example/v1/',
    env: {
      NODE_ENV: 'production',
      AI_PROVIDER_BASE_URL_ALLOWLIST: 'https://llm.internal.example/v1'
    },
    lookupFn: async () => [{ address: '10.24.3.9' }]
  })

  assert.equal(result, 'https://llm.internal.example/v1')
})

test('assertProviderBaseUrlAllowed rejects unresolved production hosts', async () => {
  await assert.rejects(
    assertProviderBaseUrlAllowed({
      providerType: 'openai_compatible',
      baseUrl: 'https://does-not-resolve.example/v1',
      env: { NODE_ENV: 'production' },
      lookupFn: async () => {
        throw new Error('ENOTFOUND')
      }
    }),
    (error) => {
      assert.ok(error instanceof BadRequest)
      assert.equal(error.data?.error_code, 'api.ai.base_url_dns_lookup_failed')
      return true
    }
  )
})
