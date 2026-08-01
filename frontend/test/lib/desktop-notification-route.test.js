import { describe, expect, it } from 'vitest'
import {
  buildDesktopNotificationRoute,
  normalizeDesktopNotificationTarget
} from '../../src/lib/desktop-notification-route.js'

describe('desktop notification routing', () => {
  it('opens meeting invites directly on the meeting route', () => {
    expect(buildDesktopNotificationRoute({
      notification: {
        type: 'meeting_invite',
        meeting_id: 'meeting-1',
        channel_id: 'channel-1'
      }
    })).toBe('/meetings/meeting-1')
  })

  it('resolves meeting chat notifications to their meeting route when indexed', () => {
    expect(buildDesktopNotificationRoute({
      notification: {
        type: 'mention',
        channel_id: 'meeting-chat-1'
      },
      meetingByChatChannelId: {
        'meeting-chat-1': 'meeting-9'
      }
    })).toBe('/meetings/meeting-9')
  })

  it('falls back to the channel route for normal chat notifications', () => {
    expect(buildDesktopNotificationRoute({
      notification: {
        type: 'dm_message',
        channel_id: 'channel-44'
      }
    })).toBe('/channels/channel-44')
  })

  it('deep-links channel notifications with message ids to the source message', () => {
    expect(buildDesktopNotificationRoute({
      notification: {
        type: 'message_reminder',
        channel_id: 'channel-44',
        message_id: 'message-9'
      }
    })).toBe('/channels/channel-44?message=message-9')
  })

  it('normalizes notification-open payloads', () => {
    expect(normalizeDesktopNotificationTarget({
      serverId: 'server-1',
      route: 'meetings/abc'
    })).toEqual({
      serverId: 'server-1',
      route: '/meetings/abc'
    })
  })
})

