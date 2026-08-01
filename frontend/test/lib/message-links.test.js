import { describe, expect, it } from 'vitest'
import { buildMessagePath, extractInternalMessageReference } from '../../src/lib/message-links.js'

describe('message-links', () => {
  it('builds a stable message path', () => {
    expect(buildMessagePath('channel-1', 'message-1')).toBe('/channels/channel-1?message=message-1')
  })

  it('extracts internal message links', () => {
    expect(extractInternalMessageReference('https://chat.example.test/channels/channel-1?message=message-1')).toEqual({
      channelId: 'channel-1',
      messageId: 'message-1'
    })
  })

  it('rejects unrelated urls', () => {
    expect(extractInternalMessageReference('https://example.test/elsewhere')).toBeNull()
  })
})
