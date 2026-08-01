<template>
  <div class="channel-sidebar">
    <div class="sidebar-scrollable">
      <div class="sidebar-section">
        <div class="section-header">
          <button
            type="button"
            class="section-toggle"
            :data-testid="sectionToggleTestId('channels')"
            :aria-expanded="isSectionExpanded('channels') ? 'true' : 'false'"
            :aria-controls="sectionContentId('channels')"
            @click="toggleSection('channels')"
          >
            <n-icon size="14" class="section-toggle-chevron">
              <chevron-down-icon v-if="isSectionExpanded('channels')" />
              <chevron-forward-icon v-else />
            </n-icon>
            <span>{{ $t('sidebar.sections.channels') }}</span>
          </button>
          <div class="section-header-actions">
            <n-button
              size="tiny"
              quaternary
              data-testid="open-create-channel-modal"
              @click.stop="openChannelBrowser"
            >
              +
            </n-button>
          </div>
        </div>
        <div
          v-show="isSectionExpanded('channels')"
          :id="sectionContentId('channels')"
          class="section-content"
          :data-testid="sectionContentTestId('channels')"
        >
          <n-menu
            :options="channelOptions"
            :value="activeChannelId"
            :root-indent="18"
            :theme-overrides="sidebarMenuThemeOverrides"
            @update:value="onSelectChannel"
          />
        </div>
      </div>

      <div class="sidebar-section">
        <div class="section-header">
          <button
            type="button"
            class="section-toggle"
            :data-testid="sectionToggleTestId('meetings')"
            :aria-expanded="isSectionExpanded('meetings') ? 'true' : 'false'"
            :aria-controls="sectionContentId('meetings')"
            @click="toggleSection('meetings')"
          >
            <n-icon size="14" class="section-toggle-chevron">
              <chevron-down-icon v-if="isSectionExpanded('meetings')" />
              <chevron-forward-icon v-else />
            </n-icon>
            <span>{{ $t('sidebar.sections.meetings') }}</span>
          </button>
          <div class="section-header-actions">
            <n-button size="tiny" quaternary @click.stop="openMeetingsOverview">
              {{ $t('ui.views.meetings') }}
            </n-button>
          </div>
        </div>
        <div
          v-show="isSectionExpanded('meetings')"
          :id="sectionContentId('meetings')"
          class="section-content"
          :data-testid="sectionContentTestId('meetings')"
        >
          <div class="dm-list">
            <button
              v-for="meeting in meetingsSidebarItems"
              :key="meeting.id"
              type="button"
              class="meeting-sidebar-item"
              @click="openMeeting(meeting.id)"
            >
              <span class="meeting-sidebar-title">{{ meetingsStore.resolveDisplayName(meeting) }}</span>
              <span class="meeting-sidebar-meta">{{ meetingSidebarSubtitle(meeting) }}</span>
            </button>
            <div v-if="meetingsSidebarItems.length === 0" class="dm-empty">
              {{ $t('sidebar.noMeetings') }}
            </div>
          </div>
        </div>
      </div>

      <div v-if="voiceChannels.length > 0" class="sidebar-section">
        <div class="section-header">
          <button
            type="button"
            class="section-toggle"
            :data-testid="sectionToggleTestId('voiceChannels')"
            :aria-expanded="isSectionExpanded('voiceChannels') ? 'true' : 'false'"
            :aria-controls="sectionContentId('voiceChannels')"
            @click="toggleSection('voiceChannels')"
          >
            <n-icon size="14" class="section-toggle-chevron">
              <chevron-down-icon v-if="isSectionExpanded('voiceChannels')" />
              <chevron-forward-icon v-else />
            </n-icon>
            <span>{{ $t('sidebar.sections.voiceChannels') }}</span>
          </button>
        </div>
        <div
          v-show="isSectionExpanded('voiceChannels')"
          :id="sectionContentId('voiceChannels')"
          class="section-content"
          :data-testid="sectionContentTestId('voiceChannels')"
        >
          <div class="voice-channel-list">
            <div
              v-for="vc in voiceChannels"
              :key="vc.id"
              class="voice-channel-item"
              :class="{ active: isVoiceChannelActive(vc.id) }"
              data-testid="voice-channel-item"
            >
              <div class="voice-channel-header">
                <div
                  class="voice-channel-name"
                  :class="{ active: isVoiceChannelActive(vc.id) }"
                  :data-testid="`voice-channel-${vc.id}`"
                  @click="joinVoice(vc.id)"
                >
                  <span class="voice-channel-label">
                    <n-icon
                      size="12"
                      class="channel-type-icon"
                      data-testid="sidebar-channel-type-icon"
                      :data-channel-id="vc.id"
                      :data-channel-type="vc.type"
                    >
                      <earth-icon v-if="vc.type === 'public'" />
                      <lock-closed-icon v-else />
                    </n-icon>
                    <n-icon size="14" class="voice-prefix-icon">
                      <volume-high-icon />
                    </n-icon>
                    <span class="voice-channel-label-text">{{ vc.name }}</span>
                  </span>
                  <span
                    v-if="hasActiveMeetingForChannel(vc.id)"
                    class="meeting-active-icon"
                    data-testid="sidebar-active-meeting-icon"
                    :data-channel-id="vc.id"
                    :title="$t('sidebar.actions.activeMeeting')"
                    :aria-label="$t('sidebar.actions.activeMeeting')"
                  >
                    <n-icon size="12"><call-icon /></n-icon>
                  </span>
                </div>
                <button
                  type="button"
                  class="voice-channel-chat-button"
                  data-testid="voice-channel-open-chat"
                  :data-channel-id="vc.id"
                  :title="$t('sidebar.actions.openVoiceTextChat')"
                  :aria-label="$t('sidebar.actions.openVoiceTextChat')"
                  @click.stop="openVoiceTextChannel(vc.id)"
                >
                  <n-icon size="14"><chatbubble-icon /></n-icon>
                </button>
              </div>
              <div v-if="getVoiceParticipants(vc.id).length" class="voice-participants">
                <div
                  v-for="p in getVoiceParticipants(vc.id)"
                  :key="p.user_id"
                  class="voice-participant"
                  :class="{ speaking: isSpeaking(p.user_id) }"
                >
                  <UserAvatar :size="18" :user="p" :avatar-url="p.avatar_url" />
                  <span class="voice-participant-name">{{ p.display_name }}</span>
                  <span v-if="p.is_muted" class="muted-indicator">
                    <n-icon size="11"><volume-mute-icon /></n-icon>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="sidebar-section dm-section">
        <div class="section-header">
          <button
            type="button"
            class="section-toggle"
            :data-testid="sectionToggleTestId('directMessages')"
            :aria-expanded="isSectionExpanded('directMessages') ? 'true' : 'false'"
            :aria-controls="sectionContentId('directMessages')"
            @click="toggleSection('directMessages')"
          >
            <n-icon size="14" class="section-toggle-chevron">
              <chevron-down-icon v-if="isSectionExpanded('directMessages')" />
              <chevron-forward-icon v-else />
            </n-icon>
            <span>{{ $t('sidebar.sections.directMessages') }}</span>
          </button>
          <div class="section-header-actions">
            <n-button size="tiny" quaternary @click.stop="openNewDm">+</n-button>
          </div>
        </div>
        <div
          v-show="isSectionExpanded('directMessages')"
          :id="sectionContentId('directMessages')"
          class="section-content"
          :data-testid="sectionContentTestId('directMessages')"
        >
          <div class="dm-list">
            <div
              v-for="dm in visibleDmItems"
              :key="dm.id"
              class="dm-item"
              :class="{ active: dm.id === activeChannelId }"
              @click="onSelectChannel(dm.id)"
            >
              <n-badge v-if="dm.type === 'dm'" :color="dm.statusColor" dot :offset="[-2, -2]">
                <UserAvatar :size="22" :name="dm.displayName" :avatar-url="dm.avatarUrl" />
              </n-badge>
              <n-avatar v-else :size="22" round>{{ dm.initial }}</n-avatar>
              <span class="dm-name">{{ dm.displayName }}</span>
              <span v-if="dm.type === 'group'" class="dm-count">{{ dm.memberCount }}</span>
              <n-badge
                v-if="dm.unreadCount > 0"
                :value="dm.unreadCount"
                :max="99"
                type="warning"
                style="margin-left: auto; flex-shrink: 0"
              />
            </div>
            <div v-if="dmItems.length === 0" class="dm-empty">
              {{ $t('sidebar.noDirectMessages') }}
            </div>
            <button
              v-if="hasOverflowDmItems"
              type="button"
              class="dm-list-toggle"
              data-testid="sidebar-dms-overflow-toggle"
              @click="toggleDirectMessagesExpanded"
            >
              {{ showAllDirectMessages ? $t('ui.components.show_less') : $t('ui.components.show_more') }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <VoiceControls variant="sidebar" />

    <n-modal v-model:show="showBrowserModal">
      <n-card :title="$t('sidebar.channelBrowser.title')" style="max-width: 560px; width: 100%">
        <n-input
          v-model:value="channelBrowserSearch"
          :placeholder="$t('sidebar.channelBrowser.placeholders.search')"
          clearable
          :input-props="{ 'data-testid': 'channel-browser-search' }"
          style="margin-bottom: 12px"
        />

        <div class="channel-browser-list">
          <div
            v-for="entry in filteredDiscoverChannels"
            :key="entry.id"
            class="channel-browser-item"
          >
            <div class="channel-browser-main">
              <span class="channel-browser-name">
                <n-icon size="13" class="channel-type-icon">
                  <earth-icon v-if="entry.type === 'public'" />
                  <lock-closed-icon v-else />
                </n-icon>
                <n-icon v-if="entry.is_voice" size="13" class="voice-prefix-icon"><volume-high-icon /></n-icon>
                <span>{{ entry.name }}</span>
              </span>
              <span class="channel-browser-meta">{{ entry.description || '' }}</span>
            </div>
            <n-button
              size="small"
              :type="entry.isJoined ? 'default' : 'primary'"
              :loading="joiningChannelId === entry.id"
              :data-testid="`channel-browser-action-${entry.id}`"
              @click="joinOrOpenFromBrowser(entry)"
            >
              {{ entry.isJoined
                ? $t('sidebar.channelBrowser.buttons.open')
                : $t('sidebar.channelBrowser.buttons.join') }}
            </n-button>
          </div>

          <div v-if="!discoverLoading && filteredDiscoverChannels.length === 0" class="channel-browser-empty">
            {{ channelBrowserSearch
              ? $t('ui.components.no_results')
              : $t('sidebar.channelBrowser.empty') }}
          </div>
          <div v-if="discoverLoading" class="channel-browser-empty">
            {{ $t('ui.components.meeting_card_status_loading') }}
          </div>
        </div>

        <template #footer>
          <n-space justify="space-between">
            <n-button v-if="canCreateChannel" data-testid="open-channel-create-from-browser" @click="openCreateModalFromBrowser">
              {{ $t('sidebar.buttons.createChannel') }}
            </n-button>
            <n-button @click="showBrowserModal = false">{{ $t('common.close') }}</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <n-modal v-model:show="showCreateModal">
      <n-card :title="$t('sidebar.createChannel.title')" style="max-width: 400px">
        <n-form :model="newChannel">
          <n-form-item :label="$t('sidebar.createChannel.fields.name')">
            <n-input
              v-model:value="newChannel.name"
              :placeholder="$t('sidebar.createChannel.placeholders.name')"
              :input-props="{ 'data-testid': 'create-channel-name' }"
              @keyup.enter="doCreateChannel"
            />
          </n-form-item>
          <n-form-item :label="$t('sidebar.createChannel.fields.description')">
            <n-input
              v-model:value="newChannel.description"
              type="textarea"
              :placeholder="$t('sidebar.createChannel.placeholders.description')"
              :input-props="{ 'data-testid': 'create-channel-description' }"
            />
          </n-form-item>
          <n-form-item :label="$t('sidebar.createChannel.fields.type')">
            <n-radio-group v-model:value="newChannel.type">
              <n-radio value="public">{{ $t('sidebar.createChannel.types.public') }}</n-radio>
              <n-radio value="private">{{ $t('sidebar.createChannel.types.private') }}</n-radio>
            </n-radio-group>
          </n-form-item>
          <n-form-item :label="$t('sidebar.createChannel.fields.voice')">
            <n-switch v-model:value="newChannel.is_voice" data-testid="create-channel-is-voice" />
          </n-form-item>
          <n-form-item :label="$t('sidebar.createChannel.fields.members')">
            <n-select
              v-model:value="newChannel.initial_user_ids"
              multiple
              filterable
              remote
              clearable
              :loading="channelCreateUsersLoading"
              :options="channelCreateUserOptions"
              :placeholder="$t('sidebar.createChannel.placeholders.members')"
              @search="handleChannelCreateUserSearch"
            />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="showCreateModal = false">{{ $t('common.cancel') }}</n-button>
            <n-button type="primary" :loading="creating" data-testid="create-channel-submit" @click="doCreateChannel">{{ $t('sidebar.createChannel.buttons.create') }}</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>

<script>
import { h } from 'vue'
import { NBadge, NIcon } from 'naive-ui'
import {
  VolumeHighOutline as VolumeHighIcon,
  CallOutline as CallIcon,
  ChatbubbleOutline as ChatbubbleIcon,
  VolumeMuteOutline as VolumeMuteIcon,
  ChevronDownOutline as ChevronDownIcon,
  ChevronForwardOutline as ChevronForwardIcon,
  EarthOutline as EarthIcon,
  LockClosedOutline as LockClosedIcon
} from '@vicons/ionicons5'
import {
  useSessionStore,
  useChannelsStore,
  useDmsStore,
  useMeetingsStore,
  useUiStore,
  useVoiceStore
} from '../stores/index.js'
import { resolveSidebarChannelRoute } from '../lib/channel-navigation.js'
import { getEffectiveMeetingStatus } from '../lib/meeting-lifecycle.js'
import { getPresenceStatusColor } from '../lib/user-presence.js'
import VoiceControls from './VoiceControls.vue'
import UserAvatar from './UserAvatar.vue'

const SIDEBAR_DM_LIMIT = 7
const SIDEBAR_MEETING_LIMIT = 4
const SIDEBAR_MENU_THEME_OVERRIDES = Object.freeze({
  fontSize: '14px',
  itemHeight: '44px'
})

export default {
  name: 'ChannelSidebar',
  components: {
    VoiceControls,
    UserAvatar,
    VolumeHighIcon,
    CallIcon,
    ChatbubbleIcon,
    VolumeMuteIcon,
    ChevronDownIcon,
    ChevronForwardIcon,
    EarthIcon,
    LockClosedIcon
  },
  emits: ['channel-selected'],
  data() {
    return {
      showBrowserModal: false,
      showCreateModal: false,
      creating: false,
      discoverLoading: false,
      joiningChannelId: null,
      channelBrowserSearch: '',
      discoverChannels: [],
      showAllDirectMessages: false,
      channelCreateUserSearch: '',
      channelCreateUserOptionsRaw: [],
      channelCreateUsersLoading: false,
      channelCreateUserSearchTimer: null,
      newChannel: {
        name: '',
        description: '',
        type: 'public',
        is_voice: false,
        initial_user_ids: []
      }
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
    meetingsStore() {
      return useMeetingsStore()
    },
    uiStore() {
      return useUiStore()
    },
    voiceStore() {
      return useVoiceStore()
    },
    activeChannelId() {
      return this.channelsStore.activeChannelId
    },
    sidebarMenuThemeOverrides() {
      return SIDEBAR_MENU_THEME_OVERRIDES
    },
    channelOptions() {
      return this.channelsStore.channels
        .filter((channel) => !channel.is_voice && !channel.is_archived && channel.purpose !== 'meeting')
        .map((channel) => {
          const count = this.channelsStore.unreadCounts[channel.id] || 0
          const hasActiveMeeting = this.hasActiveMeetingForChannel(channel.id)
          const typeIcon = channel.type === 'private' ? LockClosedIcon : EarthIcon
          return {
            key: channel.id,
            label: () => h(
              'span',
              { style: 'display:flex;align-items:center;width:100%;gap:6px' },
              [
                h(
                  NIcon,
                  {
                    size: 13,
                    style: 'line-height:1;flex-shrink:0',
                    'data-testid': 'sidebar-channel-type-icon',
                    'data-channel-id': channel.id,
                    'data-channel-type': channel.type
                  },
                  { default: () => h(typeIcon) }
                ),
                h(
                  'span',
                  { style: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0' },
                  channel.name
                ),
                hasActiveMeeting
                  ? h(
                      'span',
                      {
                        'data-testid': 'sidebar-active-meeting-icon',
                        'data-channel-id': channel.id,
                        title: this.$t('sidebar.actions.activeMeeting'),
                        'aria-label': this.$t('sidebar.actions.activeMeeting'),
                        style: count > 0
                          ? 'color:rgb(99, 226, 183);line-height:1;flex-shrink:0;display:inline-flex;align-items:center'
                          : 'margin-left:auto;color:rgb(99, 226, 183);line-height:1;flex-shrink:0;display:inline-flex;align-items:center'
                      },
                      [
                        h(NIcon, { size: 12 }, { default: () => h(CallIcon) })
                      ]
                    )
                  : null,
                count > 0
                  ? h(NBadge, {
                      value: count,
                      max: 99,
                      type: 'warning',
                      style: 'margin-left:auto;flex-shrink:0'
                    })
                  : null
              ]
            )
          }
        })
    },
    voiceChannels() {
      return this.channelsStore.channels.filter((channel) => (
        channel.is_voice
        && !channel.is_archived
        && channel.purpose !== 'meeting'
      ))
    },
    voiceChannelId() {
      return this.voiceStore.channelId
    },
    dmItems() {
      return this.dmsStore.dmChannels.map((dmChannel) => {
        const info = this.dmsStore.displayInfo(dmChannel)
        const count = this.channelsStore.unreadCounts[dmChannel.id] || 0
        return {
          id: dmChannel.id,
          type: dmChannel.type,
          displayName: info.name,
          initial: info.avatarInitial,
          avatarUrl: info.avatarUrl,
          statusColor: getPresenceStatusColor(info.badgeStatus || info.status),
          isOnline: info.isOnline,
          memberCount: info.memberCount,
          unreadCount: count
        }
      })
    },
    visibleDmItems() {
      if (this.showAllDirectMessages) {
        return this.dmItems
      }

      return this.dmItems.slice(0, SIDEBAR_DM_LIMIT)
    },
    hasOverflowDmItems() {
      return this.dmItems.length > SIDEBAR_DM_LIMIT
    },
    meetingsSidebarItems() {
      return [...(this.meetingsStore.meetings || [])]
        .filter((meeting) => ['active', 'scheduled'].includes(getEffectiveMeetingStatus(meeting)))
        .sort((left, right) => {
          const leftStatus = getEffectiveMeetingStatus(left)
          const rightStatus = getEffectiveMeetingStatus(right)
          if (leftStatus !== rightStatus) {
            return leftStatus === 'active' ? -1 : 1
          }

          if (leftStatus === 'scheduled') {
            const leftTime = new Date(left.scheduled_start_at || 0).getTime()
            const rightTime = new Date(right.scheduled_start_at || 0).getTime()
            return leftTime - rightTime
          }

          const leftTime = new Date(left.started_at || left.scheduled_start_at || 0).getTime()
          const rightTime = new Date(right.started_at || right.scheduled_start_at || 0).getTime()
          return rightTime - leftTime
        })
        .slice(0, SIDEBAR_MEETING_LIMIT)
    },
    canCreateChannel() {
      return this.channelsStore.can('create_channels')
    },
    channelCreateUserOptions() {
      const selectedUsers = this.sessionStore.getDirectoryUsersByIds(this.newChannel.initial_user_ids)
      const source = this.channelCreateUserSearch.trim()
        ? this.channelCreateUserOptionsRaw
        : this.sessionStore.getDefaultDirectoryUsers(20)
      return [...selectedUsers, ...source]
        .filter((user, index, list) => user?.id && list.findIndex((entry) => entry.id === user.id) === index)
        .filter((user) => user.id !== this.sessionStore.user?.id)
        .map((user) => ({
          label: user.display_name,
          value: user.id
        }))
    },
    filteredDiscoverChannels() {
      const term = this.channelBrowserSearch.trim().toLowerCase()
      const list = this.discoverChannels
        .filter((channel) => !term
          || channel.name?.toLowerCase().includes(term)
          || channel.description?.toLowerCase().includes(term)
          || channel.topic?.toLowerCase().includes(term))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

      return list.map((channel) => ({
        ...channel,
        isJoined: this.channelsStore.hasChannel(channel.id)
      }))
    }
  },
  watch: {
    async showCreateModal(val) {
      if (val) {
        await this.sessionStore.ensureDirectoryUsersLoaded({ limit: 20 })
        this.channelCreateUserOptionsRaw = this.sessionStore.getDefaultDirectoryUsers(20)
        return
      }

      this.clearChannelCreateUserSearchTimer()
      this.channelCreateUserSearch = ''
      this.channelCreateUserOptionsRaw = []
      this.channelCreateUsersLoading = false
    }
  },
  methods: {
    isSectionExpanded(section) {
      return this.uiStore.isSidebarSectionExpanded(section)
    },
    toggleSection(section) {
      this.uiStore.toggleSidebarSection(section)
    },
    sectionToggleTestId(section) {
      return `sidebar-section-toggle-${section}`
    },
    sectionContentTestId(section) {
      return `sidebar-section-content-${section}`
    },
    sectionContentId(section) {
      return `sidebar-section-content-${section}`
    },
    toggleDirectMessagesExpanded() {
      this.showAllDirectMessages = !this.showAllDirectMessages
    },
    clearChannelCreateUserSearchTimer() {
      if (!this.channelCreateUserSearchTimer) return
      clearTimeout(this.channelCreateUserSearchTimer)
      this.channelCreateUserSearchTimer = null
    },
    handleChannelCreateUserSearch(term) {
      this.channelCreateUserSearch = term || ''
      this.clearChannelCreateUserSearchTimer()
      const trimmed = this.channelCreateUserSearch.trim()
      if (!trimmed) {
        this.channelCreateUsersLoading = false
        this.channelCreateUserOptionsRaw = this.sessionStore.getDefaultDirectoryUsers(20)
        return
      }

      this.channelCreateUserSearchTimer = setTimeout(async () => {
        this.channelCreateUsersLoading = true
        try {
          this.channelCreateUserOptionsRaw = await this.sessionStore.searchUsers(trimmed, { limit: 20 })
        } finally {
          this.channelCreateUsersLoading = false
        }
      }, 150)
    },
    async openChannelBrowser() {
      this.showBrowserModal = true
      await this.refreshDiscoverChannels()
    },
    async refreshDiscoverChannels() {
      this.discoverLoading = true
      try {
        this.discoverChannels = await this.channelsStore.discoverPublic()
      } finally {
        this.discoverLoading = false
      }
    },
    openCreateModalFromBrowser() {
      this.showBrowserModal = false
      this.showCreateModal = true
    },
    async joinOrOpenFromBrowser(channel) {
      if (!channel?.id) return

      if (this.channelsStore.hasChannel(channel.id)) {
        this.showBrowserModal = false
        this.onSelectChannel(channel.id)
        return
      }

      this.joiningChannelId = channel.id
      try {
        await this.channelsStore.joinPublic(channel.id)
        this.showBrowserModal = false
        this.onSelectChannel(channel.id)
        await this.refreshDiscoverChannels()
      } catch {
        window.$message?.error(this.$t('ui.components.action_failed'))
      } finally {
        this.joiningChannelId = null
      }
    },
    openNewDm() {
      this.dmsStore.showNewDmModal = true
    },
    openMeetingsOverview() {
      this.$emit('channel-selected', '/meetings')
    },
    openMeeting(meetingId) {
      this.$emit('channel-selected', `/meetings/${meetingId}`)
    },
    formatSidebarDateTime(value) {
      if (!value) return ''

      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return ''

      return date.toLocaleString(undefined, {
        dateStyle: 'short',
        timeStyle: 'short'
      })
    },
    meetingSidebarSubtitle(meeting) {
      const status = getEffectiveMeetingStatus(meeting)
      if (status === 'scheduled' && meeting.scheduled_start_at) {
        return this.formatSidebarDateTime(meeting.scheduled_start_at)
      }
      if (status === 'active') {
        return this.meetingsStore.resolveSourceDisplayName(meeting)
      }
      return this.formatSidebarDateTime(
        meeting.ended_at || meeting.scheduled_end_at || meeting.cancelled_at || meeting.started_at
      )
    },
    async onSelectChannel(channelId) {
      const targetRoute = await resolveSidebarChannelRoute(channelId, {
        meetingsStore: this.meetingsStore
      })
      this.$emit('channel-selected', targetRoute)
    },
    getVoiceParticipants(channelId) {
      return this.voiceStore.participants[channelId] || []
    },
    isSpeaking(userId) {
      return this.voiceStore.isParticipantSpeaking(userId)
    },
    isVoiceChannelActive(channelId) {
      return this.voiceChannelId === channelId || this.activeChannelId === channelId
    },
    hasActiveMeetingForChannel(channelId) {
      return this.meetingsStore.hasActiveMeetingForSourceChannel(channelId)
    },
    openVoiceTextChannel(channelId) {
      this.onSelectChannel(channelId)
    },
    async joinVoice(channelId) {
      try {
        await this.voiceStore.join(channelId)
      } catch {
        // Error already shown via window.$message in store
      }
    },
    async doCreateChannel() {
      if (!this.newChannel.name.trim()) return
      this.creating = true
      try {
        const channel = await this.channelsStore.create(
          this.newChannel.name.trim(),
          this.newChannel.type,
          this.newChannel.description,
          this.newChannel.is_voice,
          this.newChannel.initial_user_ids
        )
        this.showCreateModal = false
        const wasVoice = this.newChannel.is_voice
        this.newChannel = { name: '', description: '', type: 'public', is_voice: false, initial_user_ids: [] }
        this.channelCreateUserSearch = ''
        this.channelCreateUserOptionsRaw = []
        await this.refreshDiscoverChannels()
        if (!wasVoice) {
          await this.onSelectChannel(channel.id)
        }
      } catch (error) {
        console.error(error)
      } finally {
        this.creating = false
      }
    }
  },
  beforeUnmount() {
    this.clearChannelCreateUserSearchTimer()
  }
}
</script>

<style scoped>
.channel-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sidebar-scrollable {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0 12px;
}

.sidebar-section {
  margin-bottom: 6px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px 2px;
}

.section-toggle {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--app-text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.section-toggle:hover {
  background: var(--app-surface-muted);
  color: var(--app-text-strong);
}

.section-toggle:focus-visible {
  outline: 2px solid var(--app-focus);
  outline-offset: 1px;
}

.section-toggle-chevron {
  flex-shrink: 0;
}

.section-header-actions {
  display: flex;
  align-items: center;
}

.section-content {
  min-width: 0;
}

.dm-list {
  padding: 0 8px;
}

.dm-item {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  height: 44px;
  padding: 0 10px;
  cursor: pointer;
  border-radius: 6px;
  font-size: 14px;
}

.dm-item:hover {
  background: var(--app-hover);
}

.dm-item.active {
  background: var(--app-primary-soft);
  color: var(--theme-primary);
}

.dm-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.dm-count {
  font-size: 10.5px;
  opacity: 0.45;
  flex-shrink: 0;
}

.dm-empty {
  padding: 8px;
  font-size: 12px;
  opacity: 0.4;
  text-align: center;
}

.dm-list-toggle {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--app-text-muted);
  text-align: left;
  padding: 4px 8px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}

.dm-list-toggle:hover {
  background: var(--app-hover);
  color: var(--app-text-strong);
}

.meeting-sidebar-item {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  display: grid;
  gap: 1px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.meeting-sidebar-item:hover {
  background: var(--app-hover);
}

.meeting-sidebar-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meeting-sidebar-meta {
  font-size: 11.5px;
  opacity: 0.62;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.voice-channel-list {
  padding: 0 8px;
}

.voice-channel-name {
  display: flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  height: 44px;
  padding: 0 10px;
  cursor: pointer;
  border-radius: 6px;
  font-size: 14px;
  flex: 1;
  min-width: 0;
}

.voice-channel-label {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.channel-type-icon {
  line-height: 1;
  flex-shrink: 0;
  opacity: 0.85;
}

.voice-prefix-icon {
  line-height: 1;
  flex-shrink: 0;
}

.voice-channel-label-text {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.meeting-active-icon {
  color: rgb(99, 226, 183);
  line-height: 1;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
}

.voice-channel-header {
  display: flex;
  align-items: center;
  gap: 4px;
}

.voice-channel-name:hover {
  background: var(--app-hover);
}

.voice-channel-name.active {
  color: var(--theme-primary);
}

.voice-channel-chat-button {
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--app-text-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.voice-channel-chat-button:hover {
  background: var(--app-hover);
  color: var(--theme-primary);
}

.voice-channel-item.active .voice-channel-chat-button {
  color: var(--theme-primary);
}

.voice-participants {
  padding-left: 24px;
  padding-bottom: 2px;
}

.voice-participant {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  font-size: 12px;
  opacity: 0.8;
  border-left: 2px solid transparent;
  transition: border-color 0.15s;
}

.voice-participant.speaking {
  border-left-color: rgb(99, 226, 183);
}

.voice-participant-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.muted-indicator {
  font-size: 11px;
  opacity: 0.6;
  flex-shrink: 0;
}

.channel-browser-list {
  max-height: 360px;
  overflow-y: auto;
  padding-right: 4px;
}

.channel-browser-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px;
  border-radius: 6px;
}

.channel-browser-item:hover {
  background: var(--app-hover);
}

.channel-browser-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.channel-browser-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}

.channel-browser-meta {
  font-size: 12px;
  opacity: 0.55;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.channel-browser-empty {
  padding: 14px 8px;
  text-align: center;
  opacity: 0.55;
  font-size: 13px;
}

:deep(.n-menu .n-menu-item) {
  margin-top: 0;
}
</style>
