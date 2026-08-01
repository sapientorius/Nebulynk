<template>
  <div class="member-list">
    <div class="member-list-header">
      <span>{{ $t('ui.components.members') }}</span>
      <n-button
        v-if="isManagedMembershipChannel && canManageMembers"
        quaternary
        size="tiny"
        @click="showAddMember = true"
        :title="$t('ui.components.add_member')"
      >
        <template #icon><n-icon size="16"><add-icon /></n-icon></template>
      </n-button>
    </div>

    <div v-if="onlineMembers.length > 0" class="member-section">
      <div class="section-label">{{ $t('ui.components.online') }} - {{ onlineMembers.length }}</div>
      <div
        v-for="member in onlineMembers"
        :key="member.user_id"
        class="member-item"
        :class="{ 'member-item-speaking': isSpeaking(member.user_id) }"
        @click="openProfile(member.user_id, member)"
      >
        <n-badge :color="statusColor(member.badgeStatus || member.status)" dot :offset="[-3, -3]">
          <UserAvatar :size="28" :user="member" :avatar-url="member.avatar_url" />
        </n-badge>
        <div class="member-info">
          <span class="member-name">{{ member.display_name }}<sup v-if="isGuestMember(member)" class="member-guest-badge">{{ $t('ui.components.guest_badge') }}</sup></span>
          <span v-if="member.custom_status" class="member-status">
            {{ member.custom_status_emoji }} {{ member.custom_status }}
          </span>
        </div>
        <span
          v-if="isVoiceConnected(member.user_id)"
          class="member-voice-state"
          data-testid="member-voice-connected-indicator"
          :data-user-id="member.user_id"
          :title="$t('ui.components.voice_connected')"
          :aria-label="$t('ui.components.voice_connected')"
        >
          <n-icon size="13"><headset-icon /></n-icon>
        </span>
        <span
          v-if="isPresenting(member.user_id)"
          class="member-voice-state member-screen-share-state"
          data-testid="member-screen-share-indicator"
          :data-user-id="member.user_id"
          :title="$t('ui.views.presenting_screen')"
          :aria-label="$t('ui.views.presenting_screen')"
        >
          <n-icon size="13"><desktop-icon /></n-icon>
        </span>
        <button
          v-if="canStartDmWith(member)"
          class="member-dm"
          :title="$t('ui.components.send_message')"
          @click.stop="startDm(member)"
        >
          <n-icon size="14"><chatbubble-icon /></n-icon>
        </button>
        <n-popconfirm
          v-if="canRemoveMembers && !isSelf(member)"
          :positive-text="$t('ui.components.remove')"
          :negative-text="$t('ui.components.admin.cancel')"
          @positive-click="removeMember(member)"
        >
          <template #trigger>
            <button
              class="member-remove"
              :title="$t('ui.components.remove')"
              @click.stop
            >
              <n-icon size="14"><close-icon /></n-icon>
            </button>
          </template>
          <span>{{ $t('ui.components.remove_from_channel') }} {{ member.display_name }}</span>
        </n-popconfirm>
      </div>
    </div>

    <div v-if="offlineMembers.length > 0" class="member-section">
      <div class="section-label">{{ $t('ui.components.offline') }} - {{ offlineMembers.length }}</div>
      <div
        v-for="member in offlineMembers"
        :key="member.user_id"
        class="member-item offline"
        :class="{ 'member-item-speaking': isSpeaking(member.user_id) }"
        @click="openProfile(member.user_id, member)"
      >
        <n-badge :color="statusColor(member.badgeStatus || 'offline')" dot :offset="[-3, -3]">
          <UserAvatar :size="28" :user="member" :avatar-url="member.avatar_url" />
        </n-badge>
        <div class="member-info">
          <span class="member-name">{{ member.display_name }}<sup v-if="isGuestMember(member)" class="member-guest-badge">{{ $t('ui.components.guest_badge') }}</sup></span>
        </div>
        <span
          v-if="isVoiceConnected(member.user_id)"
          class="member-voice-state"
          data-testid="member-voice-connected-indicator"
          :data-user-id="member.user_id"
          :title="$t('ui.components.voice_connected')"
          :aria-label="$t('ui.components.voice_connected')"
        >
          <n-icon size="13"><headset-icon /></n-icon>
        </span>
        <span
          v-if="isPresenting(member.user_id)"
          class="member-voice-state member-screen-share-state"
          data-testid="member-screen-share-indicator"
          :data-user-id="member.user_id"
          :title="$t('ui.views.presenting_screen')"
          :aria-label="$t('ui.views.presenting_screen')"
        >
          <n-icon size="13"><desktop-icon /></n-icon>
        </span>
        <n-popconfirm
          v-if="canRemoveMembers && !isSelf(member)"
          :positive-text="$t('ui.components.remove')"
          :negative-text="$t('ui.components.admin.cancel')"
          @positive-click="removeMember(member)"
        >
          <template #trigger>
            <button
              class="member-remove"
              :title="$t('ui.components.remove')"
              @click.stop
            >
              <n-icon size="14"><close-icon /></n-icon>
            </button>
          </template>
          <span>{{ $t('ui.components.remove_from_channel') }} {{ member.display_name }}</span>
        </n-popconfirm>
      </div>
    </div>

    <div v-if="enrichedMembers.length === 0" style="padding: 16px; text-align: center; opacity: 0.5">
      {{ $t('ui.components.no_members') }}
    </div>

    <n-modal v-model:show="showAddMember" preset="card" :title="$t('ui.components.add_member')" style="max-width: 400px;">
      <n-input
        v-model:value="searchTerm"
        :placeholder="$t('ui.components.search_users')"
        clearable
        size="small"
        style="margin-bottom: 12px"
      />
      <div class="add-member-list">
        <div
          v-for="user in availableUsers"
          :key="user.id"
          class="add-member-item"
          @click="addMember(user)"
        >
          <UserAvatar :size="24" :user="user" :avatar-url="user.avatar_url" />
          <span class="add-member-name">{{ user.display_name }}</span>
        </div>
        <div v-if="availableUsers.length === 0" style="padding: 12px; text-align: center; opacity: 0.5; font-size: 13px;">
          {{ searchTerm
            ? $t('ui.components.no_results')
            : $t('ui.components.all_users_are_already_members') }}
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script>
import {
  AddOutline as AddIcon,
  CloseOutline as CloseIcon,
  ChatbubbleOutline as ChatbubbleIcon,
  HeadsetOutline as HeadsetIcon,
  DesktopOutline as DesktopIcon
} from '@vicons/ionicons5'
import { navigateToDmChannel } from '../lib/dm-navigation.js'
import { getPresenceStatusColor } from '../lib/user-presence.js'
import {
  useSessionStore,
  useChannelsStore,
  useDmsStore,
  useUiStore,
  useChannelMembersStore,
  useVoiceStore,
  useMeetingsStore
} from '../stores/index.js'
import UserAvatar from './UserAvatar.vue'

export default {
  name: 'MemberList',
  components: { AddIcon, CloseIcon, ChatbubbleIcon, HeadsetIcon, DesktopIcon, UserAvatar },
  data() {
    return {
      showAddMember: false,
      searchTerm: '',
      searchResults: [],
      searchLoading: false,
      searchTimer: null
    }
  },
  computed: {
    sessionStore() {
      return useSessionStore()
    },
    channelsStore() {
      return useChannelsStore()
    },
    dmsStore() {
      return useDmsStore()
    },
    uiStore() {
      return useUiStore()
    },
    channelMembersStore() {
      return useChannelMembersStore()
    },
    voiceStore() {
      return useVoiceStore()
    },
    meetingsStore() {
      return useMeetingsStore()
    },
    currentChannel() {
      return this.channelsStore.channels.find((c) => c.id === this.channelsStore.activeChannelId)
        || this.dmsStore.dmChannels.find((d) => d.id === this.channelsStore.activeChannelId)
    },
    currentMeeting() {
      if (this.currentChannel?.purpose !== 'meeting') return null
      return this.meetingsStore.activeMeeting
    },
    isMeetingContext() {
      return this.currentChannel?.purpose === 'meeting' && !!this.currentMeeting
    },
    isVoiceContext() {
      return !!this.currentChannel?.is_voice
    },
    voiceParticipantIds() {
      if (!this.isVoiceContext || !this.channelsStore.activeChannelId) return new Set()
      return new Set((this.voiceStore.participants[this.channelsStore.activeChannelId] || []).map((entry) => entry.user_id))
    },
    meetingVoiceParticipants() {
      if (!this.isMeetingContext || !this.channelsStore.activeChannelId) return []
      return this.voiceStore.participants[this.channelsStore.activeChannelId] || []
    },
    activeSpeakerIds() {
      return new Set(this.voiceStore.activeSpeakers || [])
    },
    screenShareParticipantIds() {
      if (!this.channelsStore.activeChannelId) return new Set()
      const shares = this.voiceStore.screenSharesByChannel[this.channelsStore.activeChannelId] || []
      return new Set(shares.map((entry) => entry.participantId).filter(Boolean))
    },
    isManagedMembershipChannel() {
      return this.currentChannel?.type === 'private' || this.currentChannel?.type === 'public'
    },
    canManageMembers() {
      return this.channelsStore.can('manage_channel_members')
    },
    canRemoveMembers() {
      return this.isManagedMembershipChannel && this.canManageMembers
    },
    meetingVisibleParticipantIds() {
      if (!this.isMeetingContext) return new Set()
      const selfUserId = this.sessionStore.user?.id
      const visibleUserIds = new Set((this.currentMeeting?.participants || [])
        .filter((participant) => (
          !!participant?.user_id && (
            participant.invite_status === 'joined'
            || !!participant?.joined_at
            || !!participant?.chat_last_read_at
            || participant.user_id === selfUserId
          )
        ))
        .map((participant) => participant.user_id))
      for (const participant of this.meetingVoiceParticipants) {
        if (participant?.user_id) {
          visibleUserIds.add(participant.user_id)
        }
      }
      return visibleUserIds
    },
    enrichedMembers() {
      if (this.isMeetingContext) {
        const membersByUserId = new Map()
        for (const participant of this.currentMeeting?.participants || []) {
          if (!participant?.user_id || membersByUserId.has(participant.user_id)) continue
          if (!this.meetingVisibleParticipantIds.has(participant.user_id)) continue
          const user = this.sessionStore.getUserById(participant.user_id) || {}
          const accountType = participant.account_type || user.account_type || null
          const isJoinedGuestParticipant = !participant.left_at
            && accountType === 'guest'
            && (
              participant.invite_status === 'joined'
              || !!participant.joined_at
            )
          const presenceState = this.sessionStore.resolveUserPresence({
            ...user,
            id: participant.user_id,
            status: participant.status || (isJoinedGuestParticipant ? 'online' : 'offline')
          })
          const isOnline = !participant.left_at && (
            isJoinedGuestParticipant
            || this.voiceParticipantIds.has(participant.user_id)
            || presenceState.isConnected
            || ['online', 'away', 'dnd'].includes(participant.status)
          )
          membersByUserId.set(participant.user_id, {
            ...participant,
            display_name: participant.display_name || this.$t('ui.components.unknown'),
            avatar_url: participant.avatar_url || user.avatar_url || null,
            account_type: accountType,
            status: isJoinedGuestParticipant && !participant.status
              ? 'online'
              : presenceState.displayStatus,
            badgeStatus: isJoinedGuestParticipant && !participant.status
              ? 'online'
              : presenceState.badgeStatus,
            custom_status: null,
            custom_status_emoji: null,
            isOnline,
            hasJoinedMeeting: !!participant.joined_at || this.voiceParticipantIds.has(participant.user_id)
          })
        }

        for (const participant of this.meetingVoiceParticipants) {
          if (!participant?.user_id || !this.meetingVisibleParticipantIds.has(participant.user_id)) continue
          const existing = membersByUserId.get(participant.user_id)
          const user = this.sessionStore.getUserById(participant.user_id) || {}
          const presenceState = this.sessionStore.resolveUserPresence({
            ...user,
            id: participant.user_id,
            status: participant.status || existing?.status || user.status || 'online'
          })
          const nextMember = {
            ...(existing || participant),
            user_id: participant.user_id,
            display_name: existing?.display_name || participant.display_name || user.display_name || this.$t('ui.components.unknown'),
            avatar_url: existing?.avatar_url || participant.avatar_url || user.avatar_url || null,
            account_type: existing?.account_type || participant.account_type || user.account_type || null,
            status: presenceState.displayStatus,
            badgeStatus: presenceState.badgeStatus === 'default'
              ? 'online'
              : presenceState.badgeStatus,
            custom_status: existing?.custom_status || user.custom_status || null,
            custom_status_emoji: existing?.custom_status_emoji || user.custom_status_emoji || null,
            isOnline: true,
            hasJoinedMeeting: true
          }
          membersByUserId.set(participant.user_id, nextMember)
        }

        return [...membersByUserId.values()]
      }

      return this.channelsStore.members.map((m) => {
        const user = this.sessionStore.getUserById(m.user_id) || {}
        const presenceState = this.sessionStore.resolveUserPresence({
          ...user,
          id: m.user_id,
          status: user.status || 'offline'
        })
        return {
          ...m,
          display_name: user.display_name || this.$t('ui.components.unknown'),
          avatar_url: user.avatar_url,
          account_type: user.account_type || null,
          status: presenceState.displayStatus,
          badgeStatus: presenceState.badgeStatus,
          custom_status: user.custom_status,
          custom_status_emoji: user.custom_status_emoji,
          isOnline: presenceState.isConnected
        }
      })
    },
    onlineMembers() {
      return this.enrichedMembers
        .filter((member) => {
          if (this.isMeetingContext) {
            return member.isOnline
          }
          return member.isOnline
        })
        .sort((a, b) => a.display_name.localeCompare(b.display_name))
    },
    offlineMembers() {
      return this.enrichedMembers
        .filter((member) => {
          if (this.isMeetingContext) {
            return !member.isOnline
          }
          return !member.isOnline
        })
        .sort((a, b) => a.display_name.localeCompare(b.display_name))
    },
    memberUserIds() {
      return new Set(this.channelsStore.members.map((m) => m.user_id))
    },
    availableUsers() {
      const source = this.searchTerm.trim()
        ? this.searchResults
        : this.sessionStore.getDefaultDirectoryUsers(20)
      return source
        .filter((u) => !this.memberUserIds.has(u.id))
        .slice(0, 20)
    }
  },
  watch: {
    'channelsStore.members': {
      immediate: true,
      deep: true,
      handler(members) {
        if (this.isMeetingContext) {
          this.sessionStore.ensureUsersByIds(
            (this.currentMeeting?.participants || []).map((participant) => participant.user_id),
            { channelId: this.channelsStore.activeChannelId }
          ).catch(() => {})
          return
        }
        this.sessionStore.ensureUsersByIds((members || []).map((member) => member.user_id)).catch(() => {})
      }
    },
    'currentMeeting.participants': {
      immediate: true,
      deep: true,
      handler(participants) {
        if (!this.isMeetingContext) return
        this.sessionStore.ensureUsersByIds(
          (participants || []).map((participant) => participant.user_id),
          { channelId: this.channelsStore.activeChannelId }
        ).catch(() => {})
      }
    },
    async showAddMember(val) {
      if (val) {
        await this.sessionStore.ensureDirectoryUsersLoaded({ limit: 20 })
        this.searchResults = this.sessionStore.getDefaultDirectoryUsers(20)
        return
      }

      this.clearSearchTimer()
      this.searchTerm = ''
      this.searchResults = []
      this.searchLoading = false
    },
    searchTerm() {
      this.scheduleSearch()
    }
  },
  methods: {
    clearSearchTimer() {
      if (!this.searchTimer) return
      clearTimeout(this.searchTimer)
      this.searchTimer = null
    },
    scheduleSearch() {
      this.clearSearchTimer()
      const term = this.searchTerm.trim()
      if (!term) {
        this.searchLoading = false
        this.searchResults = this.sessionStore.getDefaultDirectoryUsers(20)
        return
      }
      this.searchTimer = setTimeout(() => {
        this.searchUsers(term)
      }, 150)
    },
    async searchUsers(term) {
      this.searchLoading = true
      try {
        this.searchResults = await this.sessionStore.searchUsers(term, { limit: 20 })
      } finally {
        this.searchLoading = false
      }
    },
    getInitial(member) {
      return (member.display_name || '?')[0].toUpperCase()
    },
    statusColor(status) {
      return getPresenceStatusColor(status)
    },
    openProfile(userId, member = null) {
      this.uiStore.openProfile(userId, {
        channelId: this.channelsStore.activeChannelId,
        seedUser: member ? { id: userId, ...member } : null
      })
    },
    isSelf(member) {
      return member.user_id === this.sessionStore.user?.id
    },
    canStartDmWith(member) {
      return !this.isSelf(member)
        && this.sessionStore.user?.account_type !== 'guest'
        && member?.account_type !== 'guest'
    },
    isVoiceConnected(userId) {
      return this.isVoiceContext && this.voiceParticipantIds.has(userId)
    },
    isGuestMember(member) {
      return member?.account_type === 'guest'
    },
    isSpeaking(userId) {
      return this.isVoiceConnected(userId) && this.voiceStore.isParticipantSpeaking(userId)
    },
    isPresenting(userId) {
      return this.screenShareParticipantIds.has(userId)
    },
    async startDm(member) {
      if (!this.canStartDmWith(member)) return

      try {
        const channel = await this.dmsStore.openOrCreate(member.user_id)
        await navigateToDmChannel(this.$router, channel?.id)
      } catch {
        window.$message?.error(this.$t('ui.components.could_not_open_direct_message'))
      }
    },
    async removeMember(member) {
      if (!this.canRemoveMembers) return

      try {
        await this.channelMembersStore.removeMember(member.id)
        await this.channelsStore.refreshMembers()
        window.$message?.success(this.$t('ui.components.removed', { member_display_name: member.display_name }))
      } catch (error) {
        console.error('Failed to remove member:', error)
        window.$message?.error(this.$t('ui.components.remove_failed'))
      }
    },
    async addMember(user) {
      try {
        await this.channelMembersStore.addMember({
          channelId: this.channelsStore.activeChannelId,
          userId: user.id
        })
        await this.channelsStore.refreshMembers()
        window.$message?.success(this.$t('ui.components.added', { user_display_name: user.display_name }))
      } catch (error) {
        console.error('Failed to add member:', error)
        window.$message?.error(this.$t('ui.components.add_failed'))
      }
    }
  },
  beforeUnmount() {
    this.clearSearchTimer()
  }
}
</script>

<style scoped>
.member-list {
  padding: 8px 0;
}

.member-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  font-weight: 600;
  font-size: 14px;
}

.member-section {
  margin-bottom: 8px;
}

.section-label {
  padding: 8px 16px 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  opacity: 0.5;
}

.member-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  border-left: 2px solid transparent;
  cursor: pointer;
  border-radius: 4px;
}

.member-item:hover {
  background: var(--app-hover);
}

.member-item.offline {
  opacity: 0.5;
}

.member-item-speaking {
  border-left-color: rgb(99, 226, 183);
}

.member-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.member-name {
  display: inline-block;
  font-size: 13px;
  min-width: 0;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.member-guest-badge {
  font-size: 10px;
  font-weight: 600;
  padding-left: 5px;
  opacity: 0.7;
}

.member-status {
  font-size: 11px;
  opacity: 0.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.member-voice-state {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-muted);
  flex-shrink: 0;
}

.member-screen-share-state {
  color: var(--theme-primary);
}

.member-dm {
  display: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--app-text-muted);
  border-radius: 3px;
  cursor: pointer;
  flex-shrink: 0;
}

.member-item:hover .member-dm {
  display: flex;
}

.member-dm:hover {
  background: rgba(var(--theme-primary-rgb), 0.15);
  color: var(--theme-primary);
}

.member-remove {
  display: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--app-text-muted);
  border-radius: 3px;
  cursor: pointer;
  margin-left: auto;
  flex-shrink: 0;
}

.member-item:hover .member-remove {
  display: flex;
}

.member-remove:hover {
  background: rgba(var(--theme-error-rgb), 0.15);
  color: var(--theme-error);
}

.add-member-list {
  max-height: 300px;
  overflow-y: auto;
}

.add-member-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  cursor: pointer;
  border-radius: 4px;
}

.add-member-item:hover {
  background: var(--app-hover);
}

.add-member-name {
  font-size: 13px;
}
</style>
