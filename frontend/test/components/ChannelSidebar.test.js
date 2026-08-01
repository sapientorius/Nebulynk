import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('ChannelSidebar', () => {
  it('navigates via router instead of mutating channel state directly on sidebar selection', () => {
    const source = readFileSync(resolve('src/components/ChannelSidebar.vue'), 'utf8')

    expect(source).toContain("import { getEffectiveMeetingStatus } from '../lib/meeting-lifecycle.js'")
    expect(source).toContain("import { resolveSidebarChannelRoute } from '../lib/channel-navigation.js'")
    expect(source).toContain('const leftStatus = getEffectiveMeetingStatus(left)')
    expect(source).toContain('const targetRoute = await resolveSidebarChannelRoute(channelId, {')
    expect(source).toContain("this.$emit('channel-selected', targetRoute)")
    expect(source).toContain("this.$emit('channel-selected', '/meetings')")
    expect(source).toContain("this.$emit('channel-selected', `/meetings/${meetingId}`)")
    expect(source).not.toContain('this.$router.push(')
    expect(source).not.toContain('onSelectChannel(channelId) {\n      this.channelsStore.select(channelId)')
  })

  it('uses persisted disclosure sections and keeps header actions separate from toggles', () => {
    const source = readFileSync(resolve('src/components/ChannelSidebar.vue'), 'utf8')

    expect(source).toContain('useUiStore,')
    expect(source).toContain("sectionToggleTestId(section)")
    expect(source).toContain("sectionContentTestId(section)")
    expect(source).toContain("this.uiStore.toggleSidebarSection(section)")
    expect(source).toContain("@click.stop=\"openChannelBrowser\"")
    expect(source).toContain("@click.stop=\"openMeetingsOverview\"")
    expect(source).toContain("@click.stop=\"openNewDm\"")
  })

  it('limits sidebar meetings and direct messages to compact overview slices', () => {
    const source = readFileSync(resolve('src/components/ChannelSidebar.vue'), 'utf8')

    expect(source).toContain("import { getPresenceStatusColor } from '../lib/user-presence.js'")
    expect(source).toContain('const SIDEBAR_DM_LIMIT = 7')
    expect(source).toContain('const SIDEBAR_MEETING_LIMIT = 4')
    expect(source).toContain("['active', 'scheduled'].includes(getEffectiveMeetingStatus(meeting))")
    expect(source).toContain('return this.dmItems.slice(0, SIDEBAR_DM_LIMIT)')
    expect(source).toContain('.slice(0, SIDEBAR_MEETING_LIMIT)')
    expect(source).toContain('data-testid="sidebar-dms-overflow-toggle"')
    expect(source).toContain("$t('sidebar.noMeetings')")
    expect(source).toContain("dateStyle: 'short'")
    expect(source).toContain("timeStyle: 'short'")
    expect(source).toContain('statusColor: getPresenceStatusColor(info.badgeStatus || info.status)')
  })

  it('uses a shared item scale for channels, voice channels, and direct messages on every layout', () => {
    const source = readFileSync(resolve('src/components/ChannelSidebar.vue'), 'utf8')

    expect(source).toContain(':root-indent="18"')
    expect(source).toContain(':theme-overrides="sidebarMenuThemeOverrides"')
    expect(source).toContain('const SIDEBAR_MENU_THEME_OVERRIDES = Object.freeze({')
    expect(source).toContain('return SIDEBAR_MENU_THEME_OVERRIDES')
    expect(source).toContain("fontSize: '14px'")
    expect(source).toContain("itemHeight: '44px'")
    expect(source).toContain(':deep(.n-menu .n-menu-item)')
    expect(source).toContain('height: 44px;')
    expect(source).toContain('padding: 0 10px;')
    expect(source).not.toContain("from '../lib/mobile-layout.js'")
    expect(source).not.toContain('@media (max-width: 900px)')
  })
})
