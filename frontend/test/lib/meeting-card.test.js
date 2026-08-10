import { describe, expect, it } from 'vitest'
import {
  buildMeetingCardState,
  countMeetingEngagedParticipants,
  countMeetingConnectedParticipants,
  resolveMeetingCardStatus
} from '../../src/lib/meeting-card.js'

function t(key, params = {}) {
  const translations = {
    'ui.components.meeting_card_engaged_count': 'Aktiv: {count}',
    'ui.components.meeting_card_live_count': 'Im Call: {count}',
    'ui.components.meeting_card_status_active': 'Aktiv',
    'ui.components.meeting_card_status_ended': 'Beendet',
    'ui.components.meeting_card_status_loading': 'Lade...',
    'ui.views.scheduled': 'Geplant',
    'ui.views.cancelled': 'Abgesagt',
    'ui.views.starts_at': 'Start',
    'meetingHistoryAccess.denied': 'Kein Zugriff gemäß Channel-Einstellungen'
  }

  const template = translations[key] || key
  return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`))
}

describe('meeting card helpers', () => {
  it('counts connected participants from joined meeting participants', () => {
    const count = countMeetingConnectedParticipants({
      participants: [
        { user_id: 'user-1', invite_status: 'joined', left_at: null },
        { user_id: 'user-2', invite_status: 'invited', left_at: null },
        { user_id: 'user-3', invite_status: 'joined', left_at: '2026-03-13T10:00:00.000Z' },
        { user_id: 'user-4', invite_status: 'joined', left_at: null }
      ]
    })

    expect(count).toBe(2)
  })

  it('builds an active joinable card state with readable title and subtitle', () => {
    const state = buildMeetingCardState({
      meetingId: 'meeting-1',
      meeting: {
        status: 'active',
        chat_channel_id: 'meeting-channel-1',
        participants: [{ invite_status: 'joined', left_at: null }]
      },
      title: 'Call mit Alex',
      subtitle: 'Alex',
      tFn: t
    })

    expect(state.meetingId).toBe('meeting-1')
    expect(state.title).toBe('Call mit Alex')
    expect(state.subtitle).toBe('Alex')
    expect(state.statusLabel).toBe('Aktiv')
    expect(state.statusType).toBe('success')
    expect(state.summaryText).toBe('Im Call: 1')
    expect(state.isJoinVisible).toBe(true)
    expect(state.isJoinDisabled).toBe(false)
  })

  it('prefers engaged participant count for ended meetings', () => {
    expect(countMeetingEngagedParticipants({
      engaged_participant_count: 4,
      participants: [
        { user_id: 'user-1', joined_at: '2026-03-13T10:00:00.000Z' }
      ]
    })).toBe(4)

    const endedState = buildMeetingCardState({
      meetingId: 'meeting-3',
      meeting: {
        status: 'ended',
        chat_channel_id: 'meeting-channel-3',
        engaged_participant_count: 3,
        participants: [
          { user_id: 'user-1', joined_at: '2026-03-13T10:00:00.000Z' }
        ]
      },
      tFn: t
    })

    expect(endedState.summaryText).toBe('Aktiv: 3')
    expect(endedState.miniSummary).toBeNull()
    expect(endedState.isJoinVisible).toBe(false)
    expect(endedState.isJoinDisabled).toBe(true)
  })

  it('exposes a meeting mini summary from a ready summary artifact', () => {
    const endedState = buildMeetingCardState({
      meetingId: 'meeting-4',
      meeting: {
        status: 'ended',
        chat_channel_id: 'meeting-channel-4',
        artifacts: [{
          artifact_type: 'summary',
          status: 'ready',
          payload: {
            mini_summary: 'Kurze Mini-Zusammenfassung'
          }
        }]
      },
      tFn: t
    })

    expect(endedState.miniSummary).toBe('Kurze Mini-Zusammenfassung')
  })

  it('disables join when already connected and hides join for ended meetings', () => {
    const activeState = buildMeetingCardState({
      meetingId: 'meeting-2',
      meeting: {
        status: 'active',
        chat_channel_id: 'meeting-channel-2'
      },
      voiceChannelId: 'meeting-channel-2',
      isJoining: true,
      tFn: t
    })

    expect(activeState.isJoinVisible).toBe(true)
    expect(activeState.isJoinDisabled).toBe(true)

    const endedStatus = resolveMeetingCardStatus({ status: 'ended' }, { tFn: t })
    expect(endedStatus).toEqual({
      label: 'Beendet',
      type: 'warning'
    })
  })

  it('surfaces scheduled and cancelled states with the new labels', () => {
    const scheduledState = buildMeetingCardState({
      meetingId: 'meeting-5',
      meeting: {
        status: 'scheduled',
        chat_channel_id: 'meeting-channel-5'
      },
      tFn: t
    })
    const cancelledStatus = resolveMeetingCardStatus({ status: 'cancelled' }, { tFn: t })

    expect(scheduledState.statusLabel).toBe('Geplant')
    expect(scheduledState.statusType).toBe('info')
    expect(scheduledState.isJoinVisible).toBe(true)
    expect(cancelledStatus).toEqual({
      label: 'Abgesagt',
      type: 'error'
    })
  })

  it('builds a non-navigable card without summary or participant count when access is denied', () => {
    const state = buildMeetingCardState({
      meetingId: 'meeting-restricted-1',
      meeting: {
        status: 'ended',
        content_access: {
          allowed: false,
          denial_reason: 'channel_meeting_history_policy'
        },
        engaged_participant_count: 12,
        artifacts: [{
          artifact_type: 'summary',
          status: 'ready',
          payload: { mini_summary: 'Should stay hidden' }
        }]
      },
      tFn: t
    })

    expect(state.summaryText).toBe('Kein Zugriff gemäß Channel-Einstellungen')
    expect(state.miniSummary).toBeNull()
    expect(state.isJoinVisible).toBe(false)
    expect(state.isJoinDisabled).toBe(true)
    expect(state.isAccessDenied).toBe(true)
  })
})
