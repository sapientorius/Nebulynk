import test from 'node:test'
import assert from 'node:assert/strict'
import { generateImage, transcribeAudio } from '../src/lib/ai-provider-adapters.js'

test('transcribeAudio keeps mp4 uploads as .mp4 files', async () => {
  let uploadedFilename = null

  await transcribeAudio({
    providerType: 'openai',
    apiKey: 'test-key',
    baseUrl: 'https://api.openai.com/v1',
    model: 'whisper-1',
    file: {
      buffer: Buffer.from([1, 2, 3]),
      mime: 'video/mp4'
    },
    fetchFn: async (_url, options) => {
      const form = options.body
      for (const [name, value] of form.entries()) {
        if (name === 'file') {
          uploadedFilename = value.name
        }
      }

      return {
        ok: true,
        async json() {
          return {
            text: 'Hallo Welt',
            language: 'german',
            segments: [
              { start: 0, end: 1, text: 'Hallo Welt' }
            ]
          }
        }
      }
    }
  })

  assert.equal(uploadedFilename, 'meeting-recording.mp4')
})

test('generateImage calls OpenAI image generations endpoint and decodes b64_json', async () => {
  let requestedUrl = null
  let requestedBody = null
  const expectedBuffer = Buffer.from([1, 2, 3, 4])

  const result = await generateImage({
    providerType: 'openai',
    apiKey: 'test-key',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-image-1',
    prompt: 'A calm office background',
    fetchFn: async (url, options) => {
      requestedUrl = url
      requestedBody = JSON.parse(options.body)
      return {
        ok: true,
        async json() {
          return {
            data: [{
              b64_json: expectedBuffer.toString('base64'),
              revised_prompt: 'A calm office background'
            }]
          }
        }
      }
    }
  })

  assert.equal(requestedUrl, 'https://api.openai.com/v1/images/generations')
  assert.deepEqual(requestedBody, {
    model: 'gpt-image-1',
    prompt: 'A calm office background',
    n: 1,
    size: '1536x1024',
    quality: 'auto'
  })
  assert.deepEqual(result.buffer, expectedBuffer)
  assert.equal(result.revisedPrompt, 'A calm office background')
})

test('transcribeAudio keeps browser webm uploads as .webm files', async () => {
  let uploadedFilename = null

  await transcribeAudio({
    providerType: 'openai',
    apiKey: 'test-key',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-transcribe',
    file: {
      buffer: Buffer.from([1, 2, 3]),
      mime: 'audio/webm;codecs=opus'
    },
    fetchFn: async (_url, options) => {
      const form = options.body
      for (const [name, value] of form.entries()) {
        if (name === 'file') {
          uploadedFilename = value.name
        }
      }

      return {
        ok: true,
        async json() {
          return {
            text: 'Hello world'
          }
        }
      }
    }
  })

  assert.equal(uploadedFilename, 'meeting-recording.webm')
})

test('transcribeAudio requests whisper timestamps via verbose_json', async () => {
  const formEntries = []

  const result = await transcribeAudio({
    providerType: 'openai',
    apiKey: 'test-key',
    baseUrl: 'https://api.openai.com/v1',
    model: 'whisper-1',
    file: {
      buffer: Buffer.from([1, 2, 3]),
      mime: 'audio/mp3'
    },
    fetchFn: async (_url, options) => {
      for (const [name, value] of options.body.entries()) {
        formEntries.push([name, typeof value === 'string' ? value : value.name])
      }

      return {
        ok: true,
        async json() {
          return {
            text: 'Hallo Welt',
            language: 'de',
            segments: [
              {
                start: 0,
                end: 1,
                text: 'Hallo Welt',
                avg_logprob: -0.25,
                no_speech_prob: 0.03,
                compression_ratio: 1.2
              }
            ]
          }
        }
      }
    }
  })

  assert.ok(formEntries.some(([name, value]) => name === 'response_format' && value === 'verbose_json'))
  assert.ok(formEntries.some(([name, value]) => name === 'timestamp_granularities[]' && value === 'segment'))
  assert.equal(formEntries.some(([name]) => name === 'chunking_strategy'), false)
  assert.deepEqual(result.segments, [{
    start: 0,
    end: 1,
    text: 'Hallo Welt',
    avg_logprob: -0.25,
    no_speech_prob: 0.03,
    compression_ratio: 1.2
  }])
})

test('transcribeAudio does not force OpenAI server chunking for openai-compatible whisper endpoints', async () => {
  const formEntries = []

  await transcribeAudio({
    providerType: 'openai_compatible',
    apiKey: 'test-key',
    baseUrl: 'https://example.test/v1',
    model: 'whisper-1',
    file: {
      buffer: Buffer.from([1, 2, 3]),
      mime: 'audio/mp3'
    },
    fetchFn: async (_url, options) => {
      for (const [name, value] of options.body.entries()) {
        formEntries.push([name, typeof value === 'string' ? value : value.name])
      }

      return {
        ok: true,
        async json() {
          return {
            text: 'Hallo Welt',
            language: 'de',
            segments: [
              { start: 0, end: 1, text: 'Hallo Welt' }
            ]
          }
        }
      }
    }
  })

  assert.equal(formEntries.some(([name]) => name === 'chunking_strategy'), false)
})

test('transcribeAudio enables server chunking for diarized OpenAI transcription models', async () => {
  const formEntries = []

  await transcribeAudio({
    providerType: 'openai',
    apiKey: 'test-key',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-transcribe-diarize',
    file: {
      buffer: Buffer.from([1, 2, 3]),
      mime: 'audio/mp3'
    },
    fetchFn: async (_url, options) => {
      for (const [name, value] of options.body.entries()) {
        formEntries.push([name, typeof value === 'string' ? value : value.name])
      }

      return {
        ok: true,
        async json() {
          return {
            text: 'Hallo Welt',
            language: 'de'
          }
        }
      }
    }
  })

  assert.ok(formEntries.some(([name, value]) => name === 'chunking_strategy' && value === 'auto'))
})

test('transcribeAudio requests json without timestamp granularity for gpt-4o transcription models', async () => {
  const formEntries = []

  const result = await transcribeAudio({
    providerType: 'openai',
    apiKey: 'test-key',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-transcribe',
    file: {
      buffer: Buffer.from([1, 2, 3]),
      mime: 'audio/mp3'
    },
    language: 'de',
    fetchFn: async (_url, options) => {
      for (const [name, value] of options.body.entries()) {
        formEntries.push([name, typeof value === 'string' ? value : value.name])
      }

      return {
        ok: true,
        async json() {
          return {
            text: 'Hallo Welt',
            language: 'de'
          }
        }
      }
    }
  })

  assert.ok(formEntries.some(([name, value]) => name === 'response_format' && value === 'json'))
  assert.ok(formEntries.some(([name, value]) => name === 'language' && value === 'de'))
  assert.equal(formEntries.some(([name]) => name === 'timestamp_granularities[]'), false)
  assert.deepEqual(result.segments, [])
  assert.equal(result.text, 'Hallo Welt')
})
