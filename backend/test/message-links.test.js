import test from 'node:test'
import assert from 'node:assert/strict'
import { extractInternalMessageReference } from '../src/domains/messages/message-links.js'

test('message links: extracts channel and message id from valid links', () => {
  assert.deepEqual(
    extractInternalMessageReference('https://chat.example.test/channels/channel-1?message=message-1'),
    { channelId: 'channel-1', messageId: 'message-1' }
  )
})

test('message links: rejects invalid links', () => {
  assert.equal(extractInternalMessageReference('https://chat.example.test/meetings/meeting-1'), null)
})
