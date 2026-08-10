import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('MeetingSettings source contract', () => {
  it('contains all meeting-related platform settings and saves them together', () => {
    const source = readFileSync(resolve('src/components/admin/MeetingSettings.vue'), 'utf8')

    expect(source).toContain('data-testid="meeting-settings-panel"')
    expect(source).toContain('data-testid="meeting-default-meeting-language"')
    expect(source).toContain('data-testid="meeting-video-enabled"')
    expect(source).toContain('data-testid="meeting-default-meeting-history-access"')
    expect(source).toContain('defaultMeetingLanguage: DEFAULT_MEETING_LANGUAGE')
    expect(source).toContain('meetingVideoEnabled: true')
    expect(source).toContain('defaultMeetingHistoryAccess: DEFAULT_MEETING_HISTORY_ACCESS')
    expect(source).toContain('await this.adminStore.updatePlatformSettings({')
    expect(source).toContain('defaultMeetingLanguage: this.defaultMeetingLanguage')
    expect(source).toContain('meetingVideoEnabled: this.meetingVideoEnabled')
    expect(source).toContain('defaultMeetingHistoryAccess: this.defaultMeetingHistoryAccess')
    expect(source).toContain("ui.components.admin.platform_settings_updated")
  })
})
