import { describe, expect, it } from 'vitest'
import {
  parseLegacyMeetingInviteSnippet,
  resolveNotificationMeetingId
} from '../../src/lib/notification-meeting.js'

describe('notification meeting helpers', () => {
  it('prefers structured meeting_id when present', () => {
    expect(resolveNotificationMeetingId({
      type: 'meeting_invite',
      meeting_id: 'meeting-structured',
      message_snippet: 'Meeting invite: /meetings/meeting-legacy'
    })).toBe('meeting-structured')
  })

  it('parses legacy meeting invite snippets as fallback', () => {
    expect(parseLegacyMeetingInviteSnippet('Meeting invite: /meetings/meeting-legacy')).toBe('meeting-legacy')
    expect(resolveNotificationMeetingId({
      type: 'meeting_invite',
      message_snippet: 'Meeting invite: /meetings/meeting-legacy'
    })).toBe('meeting-legacy')
  })

  it('ignores non-meeting notifications and invalid snippets', () => {
    expect(resolveNotificationMeetingId({
      type: 'mention',
      message_snippet: 'Meeting invite: /meetings/meeting-legacy'
    })).toBeNull()
    expect(parseLegacyMeetingInviteSnippet('Meeting invite: /channels/general')).toBeNull()
  })
})
