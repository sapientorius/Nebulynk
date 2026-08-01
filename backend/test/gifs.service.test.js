import test from 'node:test'
import assert from 'node:assert/strict'
import { GifsService } from '../src/services/gifs/gifs.js'

function createGifResult({ id = 'gif-1', url = 'https://cdn.example.com/gif-1.gif', previewUrl = 'https://cdn.example.com/gif-1-tiny.gif' } = {}) {
  return {
    id,
    content_description: 'Celebration',
    media_formats: {
      gif: {
        url,
        dims: [320, 240]
      },
      tinygif: {
        url: previewUrl,
        dims: [96, 72]
      }
    }
  }
}

test('gifs service: featured and search calls are normalized through the KLIPY v2 endpoints', async () => {
  const calls = []
  const service = new GifsService({
    env: { KLIPY_API_KEY: 'test-key' },
    fetchFn: async (url) => {
      calls.push(url)
      return {
        ok: true,
        async json() {
          return {
            results: [createGifResult()]
          }
        }
      }
    },
    logger: { debug() {} }
  })

  const featured = await service.find({ query: { limit: 10 } })
  const search = await service.find({ query: { q: 'cat party', limit: 25 } })

  assert.equal(calls.length, 2)
  assert.match(calls[0], /^https:\/\/api\.klipy\.com\/v2\/featured\?/)
  assert.match(calls[0], /key=test-key/)
  assert.match(calls[0], /limit=10/)
  assert.match(calls[1], /^https:\/\/api\.klipy\.com\/v2\/search\?/)
  assert.match(calls[1], /q=cat%20party/)
  assert.match(calls[1], /limit=25/)
  assert.deepEqual(featured, {
    data: [{
      id: 'gif-1',
      url: 'https://cdn.example.com/gif-1.gif',
      preview_url: 'https://cdn.example.com/gif-1-tiny.gif',
      width: 320,
      height: 240,
      description: 'Celebration'
    }]
  })
  assert.deepEqual(search, featured)
})

test('gifs service: get normalizes the first returned post', async () => {
  const service = new GifsService({
    env: { KLIPY_API_KEY: 'test-key' },
    fetchFn: async (url) => {
      assert.match(url, /^https:\/\/api\.klipy\.com\/v2\/posts\?/)
      assert.match(url, /ids=gif-42/)
      return {
        ok: true,
        async json() {
          return {
            results: [createGifResult({ id: 'gif-42' })]
          }
        }
      }
    },
    logger: { debug() {} }
  })

  const result = await service.get('gif-42')

  assert.deepEqual(result, {
    id: 'gif-42',
    url: 'https://cdn.example.com/gif-1.gif',
    preview_url: 'https://cdn.example.com/gif-1-tiny.gif',
    width: 320,
    height: 240,
    description: 'Celebration'
  })
})

test('gifs service: missing KLIPY_API_KEY returns empty results and null lookups', async () => {
  const service = new GifsService({
    env: {},
    fetchFn: async () => {
      throw new Error('fetch should not be called without an API key')
    },
    logger: { debug() {} }
  })

  const featured = await service.find({ query: {} })
  const item = await service.get('gif-1')

  assert.deepEqual(featured, { data: [] })
  assert.equal(item, null)
})
