import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('ChannelHeader call action visibility', () => {
  it('keeps the meeting call action available for regular and voice channels but not meeting chat channels', () => {
    const source = readFileSync(resolve('src/components/ChannelHeader.vue'), 'utf8')

    expect(source).toContain("import { getPresenceStatusColor } from '../lib/user-presence.js'")
    expect(source).toContain('return getPresenceStatusColor(this.dmDisplayInfo.badgeStatus || this.dmDisplayInfo.status)')
    expect(source).toContain("this.channel.purpose !== 'meeting'")
    expect(source).toContain('v-if="canShowMeetingCallAction"')
    expect(source).not.toContain('&& !this.channel.is_voice')
  })

  it('moves secondary mobile actions into a dedicated overflow menu while keeping call primary', () => {
    const source = readFileSync(resolve('src/components/ChannelHeader.vue'), 'utf8')

    expect(source).toContain('v-if="!isMobileLayout"')
    expect(source).toContain('v-else class="channel-header-actions mobile-actions"')
    expect(source).toContain('data-testid="channel-header-mobile-call"')
    expect(source).toContain('data-testid="channel-header-mobile-meetings-trigger"')
    expect(source).toContain('data-testid="channel-header-mobile-overflow-trigger"')
    expect(source).toContain('data-testid="channel-header-mobile-members"')
    expect(source).toContain('data-testid="channel-header-mobile-pins"')
    expect(source).toContain('data-testid="channel-header-mobile-leave"')
    expect(source).toContain("@click=\"onToggleMembersFromMenu\"")
    expect(source).toContain('v-model:show="showMobileOverflowMenu"')
    expect(source).toContain('data-testid="channel-header-mobile-summary-toggle"')
    expect(source).toContain('mobileSummaryActionsExpanded: false')
    expect(source).toContain(':aria-expanded="mobileSummaryActionsExpanded ? \'true\' : \'false\'"')
    expect(source).toContain('aria-controls="channel-header-mobile-summary-actions"')
    expect(source).toContain('v-if="mobileSummaryActionsExpanded"')
    expect(source).toContain('toggleMobileSummaryActions()')
    expect(source).toContain('data-testid="channel-header-mobile-summary-actions"')
    expect(source).toContain('summary-presets')
    expect(source).not.toContain('data-testid="channel-header-mobile-schedule"')
  })

  it('exposes AI summary actions for presets, custom range, and selection mode inside the overflow menus', () => {
    const source = readFileSync(resolve('src/components/ChannelHeader.vue'), 'utf8')

    expect(source).toContain('data-testid="channel-header-summary-toggle"')
    expect(source).toContain('data-testid="channel-header-summary-actions"')
    expect(source).toContain('data-testid="channel-header-mobile-summary-toggle"')
    expect(source).toContain('data-testid="channel-header-mobile-summary-actions"')
    expect(source).toContain("onRequestPresetSummaryFromMenu('last_hour')")
    expect(source).toContain("onRequestPresetSummaryFromMenu('last_24h')")
    expect(source).toContain("onRequestPresetSummaryFromMenu('last_48h')")
    expect(source).toContain("onRequestPresetSummaryFromMenu('last_7d')")
    expect(source).toContain('onRequestCustomSummaryFromMenu')
    expect(source).toContain('onStartMessageSelectionFromMenu')
    expect(source).toContain('useMessageSummariesStore')
    expect(source).not.toContain("customSummaryRangeUnit === 'days' ? 7 : 168")
  })

  it('groups schedule and past meetings under a shared meetings entry point and keeps past meetings on the shared side panel flow', () => {
    const source = readFileSync(resolve('src/components/ChannelHeader.vue'), 'utf8')

    expect(source).toContain("ui.views.schedule_meeting")
    expect(source).toContain("ui.views.meeting_language")
    expect(source).toContain('openScheduleMeetingModal')
    expect(source).toContain('showScheduleMeetingModal')
    expect(source).toContain('submitScheduledMeeting')
    expect(source).toContain('scheduleInviteOptions')
    expect(source).toContain('scheduleForm.language')
    expect(source).toContain('platformMeetingLanguageDefault: DEFAULT_MEETING_LANGUAGE')
    expect(source).toContain('loadPlatformMeetingLanguageDefault()')
    expect(source).toContain("import { getPlatformStatus } from '../lib/api.js'")
    expect(source).toContain('const data = await getPlatformStatus()')
    expect(source).toContain('default_meeting_language')
    expect(source).toContain("emits: ['toggle-members', 'toggle-past-meetings']")
    expect(source).toContain('data-testid="channel-header-meetings-trigger"')
    expect(source).toContain('data-testid="channel-header-meetings-schedule"')
    expect(source).toContain('data-testid="channel-header-past-meetings"')
    expect(source).toContain('data-testid="channel-header-mobile-meetings-trigger"')
    expect(source).toContain('data-testid="channel-header-mobile-meetings-schedule"')
    expect(source).toContain('data-testid="channel-header-mobile-past-meetings"')
    expect(source).toContain('showDesktopMeetingsMenu: false')
    expect(source).toContain('showMobileMeetingsMenu: false')
    expect(source).toContain('onTogglePastMeetingsAction()')
    expect(source).toContain('onOpenScheduleMeetingFromMenu()')
    expect(source).not.toContain('channel-meeting-strip')
    expect(source).not.toContain('channel-meeting-pill')
  })

  it('keeps leave behind the overflow menu instead of the direct desktop action row', () => {
    const source = readFileSync(resolve('src/components/ChannelHeader.vue'), 'utf8')

    expect(source).toContain('data-testid="channel-header-overflow-trigger"')
    expect(source).toContain('data-testid="leave-current-channel"')
    expect(source).toContain("'confirm-leave-channel'")
    expect(source).toContain('data-testid="channel-header-mobile-leave"')
    expect(source).not.toContain('showAiSummaryMenu: false')
  })

  it('loads and saves meeting history access for channels and owner-managed groups', () => {
    const source = readFileSync(resolve('src/components/ChannelHeader.vue'), 'utf8')

    expect(source).toContain('data-testid="channel-meeting-history-access"')
    expect(source).toContain('membership?.role === \'owner\'')
    expect(source).toContain('this.channel.meeting_history_access || DEFAULT_MEETING_HISTORY_ACCESS')
    expect(source).toContain('meeting_history_access: this.settingsForm.meetingHistoryAccess')
    expect(source).toContain('this.meetingsStore.handleSourceHistoryAccessChanged(this.channel.id)')
  })
})
