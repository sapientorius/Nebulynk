import { afterEach, describe, expect, it } from 'vitest'
import { setLocale, t } from '../../src/lib/i18n.js'
import {
  DEFAULT_MEETING_HISTORY_ACCESS,
  getMeetingHistoryAccessOptions
} from '../../src/lib/meeting-history-access.js'

describe('meeting history access options', () => {
  afterEach(() => setLocale('en', { persist: false }))

  it('uses all channel members as the default and exposes complete German explanations', () => {
    setLocale('de', { persist: false })
    const options = getMeetingHistoryAccessOptions(t)

    expect(DEFAULT_MEETING_HISTORY_ACCESS).toBe('all_channel_members')
    expect(options.map((option) => option.value)).toEqual([
      'all_channel_members',
      'meeting_start_members',
      'active_participants'
    ])
    expect(options[0].description).toContain('erst nach dem Meeting hinzugefügt')
    expect(options[1].description).toContain('beim tatsächlichen Start')
    expect(options[2].description).toContain('Eine Einladung oder Channel-Mitgliedschaft allein reicht nicht')
    expect(t('meetingHistoryAccess.active_participant_retention')).toContain('nach dem Verlassen des Channels')
    expect(t('meetingHistoryAccess.global_copy_help')).toContain('neu erstellte Channels und Gruppen-Chats')
  })
})
