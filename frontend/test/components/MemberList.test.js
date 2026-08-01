import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('MemberList direct-chat removal guard', () => {
  it('only shows remove controls for managed membership channels', () => {
    const source = readFileSync(resolve('src/components/MemberList.vue'), 'utf8')

    expect(source).toContain('v-if="canRemoveMembers && !isSelf(member)"')
    expect(source).toContain('canRemoveMembers() {')
    expect(source).toContain('return this.isManagedMembershipChannel && this.canManageMembers')
  })

  it('guards the remove action method behind the same computed flag', () => {
    const source = readFileSync(resolve('src/components/MemberList.vue'), 'utf8')

    expect(source).toContain('if (!this.canRemoveMembers) return')
  })

  it('hides direct-message actions when a guest account is involved and seeds the profile drawer with member data', () => {
    const source = readFileSync(resolve('src/components/MemberList.vue'), 'utf8')

    expect(source).toContain('v-if="canStartDmWith(member)"')
    expect(source).toContain('canStartDmWith(member) {')
    expect(source).toContain("this.sessionStore.user?.account_type !== 'guest'")
    expect(source).toContain("member?.account_type !== 'guest'")
    expect(source).toContain('if (!this.canStartDmWith(member)) return')
    expect(source).toContain('seedUser: member ? { id: userId, ...member } : null')
  })

  it('uses meeting participants instead of raw channel members in meeting chat context', () => {
    const source = readFileSync(resolve('src/components/MemberList.vue'), 'utf8')

    expect(source).toContain("import { getPresenceStatusColor } from '../lib/user-presence.js'")
    expect(source).toContain('this.sessionStore.resolveUserPresence({')
    expect(source).toContain('return this.meetingsStore.activeMeeting')
    expect(source).toContain("return this.currentChannel?.purpose === 'meeting' && !!this.currentMeeting")
    expect(source).toContain('meetingVoiceParticipants() {')
    expect(source).toContain('meetingVisibleParticipantIds() {')
    expect(source).toContain('for (const participant of this.currentMeeting?.participants || [])')
    expect(source).toContain('for (const participant of this.meetingVoiceParticipants)')
    expect(source).toContain('if (!this.meetingVisibleParticipantIds.has(participant.user_id)) continue')
    expect(source).toContain("participant.invite_status === 'joined'")
    expect(source).toContain('|| participant.user_id === selfUserId')
    expect(source).toContain('|| !!participant?.chat_last_read_at')
    expect(source).toContain('this.voiceParticipantIds.has(participant.user_id)')
    expect(source).toContain('|| presenceState.isConnected')
    expect(source).toContain('hasJoinedMeeting: !!participant.joined_at')
  })

  it('hydrates meeting participant profiles with the active channel scope and keeps offline joined participants visible', () => {
    const source = readFileSync(resolve('src/components/MemberList.vue'), 'utf8')

    expect(source).toContain('currentMeeting.participants')
    expect(source).toContain('{ channelId: this.channelsStore.activeChannelId }')
    expect(source).toContain('const accountType = participant.account_type || user.account_type || null')
    expect(source).toContain('account_type: accountType')
    expect(source).toContain('account_type: user.account_type || null')
    expect(source).toContain('badgeStatus: presenceState.badgeStatus')
    expect(source).toContain('return !member.isOnline')
  })

  it('treats joined guest meeting participants as online before voice presence arrives', () => {
    const source = readFileSync(resolve('src/components/MemberList.vue'), 'utf8')

    expect(source).toContain('const accountType = participant.account_type || user.account_type || null')
    expect(source).toContain("accountType === 'guest'")
    expect(source).toContain("status: participant.status || (isJoinedGuestParticipant ? 'online' : 'offline')")
    expect(source).toContain('isJoinedGuestParticipant')
    expect(source).toContain("participant.invite_status === 'joined'")
  })

  it('renders a localized guest badge after guest display names', () => {
    const source = readFileSync(resolve('src/components/MemberList.vue'), 'utf8')
    const messages = readFileSync(resolve('src/lib/generated-ui-messages.js'), 'utf8')

    expect(source).toContain("isGuestMember(member)")
    expect(source).toContain("member?.account_type === 'guest'")
    expect(source).toContain("$t('ui.components.guest_badge')")
    expect(source).toContain('<sup v-if="isGuestMember(member)" class="member-guest-badge">')
    expect(source).toContain('padding-left: 5px;')
    expect(source).not.toContain('line-height: 1;')
    expect(messages).toContain("guest_badge: 'Gast'")
    expect(messages).toContain("guest_badge: 'Guest'")
  })
})
