import { describe, expect, it } from 'vitest'
import {
  getPresenceStatusColor,
  normalizePresenceStatus,
  resolveUserPresenceState
} from '../../src/lib/user-presence.js'

describe('user presence helpers', () => {
  it('normalizes unsupported statuses to offline', () => {
    expect(normalizePresenceStatus('away')).toBe('away')
    expect(normalizePresenceStatus('busy')).toBe('offline')
    expect(normalizePresenceStatus(null)).toBe('offline')
  })

  it('keeps disconnected users offline regardless of stale cached status', () => {
    expect(resolveUserPresenceState({
      user: { id: 'user-1', status: 'away' },
      currentUserId: 'user-self',
      onlineUserIds: []
    })).toEqual({
      isConnected: false,
      displayStatus: 'offline',
      badgeStatus: 'offline',
      isPendingSync: false
    })
  })

  it('keeps manual offline as a visible status while a user is connected', () => {
    expect(resolveUserPresenceState({
      user: { id: 'user-1', status: 'offline' },
      currentUserId: 'user-self',
      onlineUserIds: ['user-1']
    })).toEqual({
      isConnected: true,
      displayStatus: 'offline',
      badgeStatus: 'offline',
      isPendingSync: false
    })
  })

  it('shows a neutral pending state for the current user during startup sync', () => {
    expect(resolveUserPresenceState({
      user: { id: 'user-self', status: 'offline' },
      currentUserId: 'user-self',
      onlineUserIds: [],
      presenceSyncPending: true
    })).toEqual({
      isConnected: true,
      displayStatus: 'online',
      badgeStatus: 'default',
      isPendingSync: true
    })
  })

  it('maps badge colors through the shared palette', () => {
    expect(getPresenceStatusColor('online')).toBe('#52c41a')
    expect(getPresenceStatusColor('away')).toBe('#faad14')
    expect(getPresenceStatusColor('dnd')).toBe('#ff4d4f')
    expect(getPresenceStatusColor('offline')).toBe('#8c8c8c')
    expect(getPresenceStatusColor('default')).toBe('#8c8c8c')
    expect(getPresenceStatusColor('unknown')).toBe('#8c8c8c')
  })
})
