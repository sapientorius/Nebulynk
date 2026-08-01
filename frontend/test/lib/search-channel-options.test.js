import { describe, expect, it, vi } from 'vitest'
import { formatSearchChannelOption, formatSearchResultChannelLabel } from '../../src/lib/search-channel-options.js'

describe('search channel option helpers', () => {
  it('formats dm and group options with a single @ prefix and friendly names', () => {
    const dmsStore = {
      dmChannels: [
        {
          id: 'dm-1',
          type: 'dm',
          participants: [{ user_id: 'self' }, { user_id: 'user-2', display_name: 'Alex' }]
        },
        {
          id: 'group-1',
          type: 'group',
          name: 'group-group-1',
          participants: [{ user_id: 'self' }, { user_id: 'user-2', display_name: 'Alex' }, { user_id: 'user-3', display_name: 'Sam' }]
        }
      ],
      displayInfo(channel) {
        if (channel.id === 'dm-1') return { name: 'Alex' }
        if (channel.id === 'group-1') return { name: 'Alex, Sam' }
        return { name: channel.name }
      }
    }

    expect(formatSearchChannelOption({ id: 'dm-1', type: 'dm' }, { dmsStore })).toEqual({
      label: '@ Alex',
      value: 'dm-1'
    })
    expect(formatSearchChannelOption({ id: 'group-1', type: 'group' }, { dmsStore })).toEqual({
      label: '@ Alex, Sam',
      value: 'group-1'
    })
  })

  it('formats meetings and result labels with readable names', () => {
    const meetingsStore = {
      resolveDisplayName: vi.fn().mockReturnValue('Sprint Planning')
    }
    const tFn = (key, params) => {
      if (key === 'search.option_labels.call') return `Call ${params.name}`
      if (key === 'ui.views.group_chat_source') return 'Group chat'
      return key
    }
    const dmsStore = {
      dmChannels: [
        { id: 'group-1', type: 'group', name: 'group-group-1' }
      ],
      displayInfo() {
        return { name: 'Team Leads' }
      }
    }

    expect(formatSearchChannelOption({
      id: 'meeting-chat-1',
      kind: 'meeting',
      meeting: {
        id: 'meeting-1',
        chat_channel_id: 'meeting-chat-1'
      }
    }, { meetingsStore, tFn })).toEqual({
      label: 'Call Sprint Planning',
      value: 'meeting-chat-1'
    })

    expect(formatSearchResultChannelLabel({ id: 'group-1', type: 'group', name: 'group-group-1' }, { dmsStore, tFn })).toBe('@ Team Leads')
    expect(formatSearchResultChannelLabel({ id: 'group-2', type: 'group', name: 'group-group-2' }, { dmsStore: { dmChannels: [] }, tFn })).toBe('@ Group chat')
    expect(formatSearchResultChannelLabel({ id: 'channel-1', type: 'public', name: 'general' })).toBe('# general')
  })
})
