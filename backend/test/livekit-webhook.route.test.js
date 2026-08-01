import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { feathers } from '@feathersjs/feathers'
import { koa } from '@feathersjs/koa'
import { configureLivekitWebhook } from '../src/routes/livekit-webhook.js'
import { createMemoryDb } from './helpers/memory-db.js'

async function createHarness(options = {}) {
  const app = koa(feathers())
  app.set('postgresqlClient', createMemoryDb())
  configureLivekitWebhook(app, options)

  const server = createServer(app.callback())
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  }
}

test('livekit webhook route rejects invalid receiver verification without side effects', async () => {
  let sideEffectCalls = 0
  const harness = await createHarness({
    getWebhookReceiver: () => ({
      async receive() {
        throw new Error('invalid signature')
      }
    }),
    async removeVoiceParticipant() {
      sideEffectCalls += 1
    }
  })

  try {
    const response = await fetch(`${harness.baseUrl}/livekit-webhook`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer invalid'
      },
      body: JSON.stringify({ event: 'participant_left' })
    })
    const payload = await response.json()

    assert.equal(response.status, 401)
    assert.equal(payload.error_code, 'api.livekit_webhook.unauthorized')
    assert.equal(sideEffectCalls, 0)
  } finally {
    await harness.close()
  }
})

test('livekit webhook route runs participant side effects only after receiver validation', async () => {
  const calls = []
  const harness = await createHarness({
    getWebhookReceiver: () => ({
      async receive(rawBody, authHeader) {
        calls.push({ type: 'receive', rawBody, authHeader })
        return {
          event: 'participant_left',
          participant: { identity: 'user-1' }
        }
      }
    }),
    async removeVoiceParticipant(app, userId) {
      calls.push({ type: 'removeVoiceParticipant', userId })
    }
  })

  try {
    const response = await fetch(`${harness.baseUrl}/livekit-webhook`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-signature'
      },
      body: '{"event":"participant_left"}'
    })
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.deepEqual(payload, { ok: true })
    assert.deepEqual(calls, [
      {
        type: 'receive',
        rawBody: '{"event":"participant_left"}',
        authHeader: 'Bearer valid-signature'
      },
      {
        type: 'removeVoiceParticipant',
        userId: 'user-1'
      }
    ])
  } finally {
    await harness.close()
  }
})

test('livekit webhook route queues transcript work after validated egress updates', async () => {
  const calls = []
  const harness = await createHarness({
    getWebhookReceiver: () => ({
      async receive() {
        calls.push('receive')
        return {
          event: 'egress_updated',
          egressInfo: { egressId: 'egress-1' }
        }
      }
    }),
    async applyEgressUpdate(app, egressInfo) {
      calls.push(`apply:${egressInfo.egressId}`)
      return { id: 'recording-1' }
    },
    async processPendingMeetingTranscripts() {
      calls.push('transcripts')
    },
    async processPendingMeetingSummaries() {
      calls.push('summaries')
    }
  })

  try {
    const response = await fetch(`${harness.baseUrl}/livekit-webhook`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-signature'
      },
      body: '{"event":"egress_updated"}'
    })

    assert.equal(response.status, 200)
    assert.deepEqual(calls, [
      'receive',
      'apply:egress-1',
      'transcripts',
      'summaries'
    ])
  } finally {
    await harness.close()
  }
})
