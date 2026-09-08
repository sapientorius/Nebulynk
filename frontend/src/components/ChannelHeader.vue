<template>
<ChannelLeaveAction :channel="channel" :allowed="canLeaveChannel" @leaving="closeMenusForLeave" @navigate="navigateAfterLeave"><template #default="{ loading, leave }">

  <div class="channel-header" v-if="channel">
<ChannelMeetingScheduleDialog :key="channel.id" ref="schedule" :channel="channel" @scheduled="goToScheduledMeeting"><template #default="{ schedulingMeeting }">
    <n-space class="channel-header-row" align="center" :size="12" justify="space-between" style="width: 100%">
      <div class="channel-header-copy">
        <template v-if="channel.type === 'dm' && dmDisplayInfo">
          <n-badge class="channel-avatar" :color="dmStatusColor" dot :offset="[-4, -4]">
            <UserAvatar :size="28" :name="dmDisplayInfo.name" :avatar-url="dmDisplayInfo.avatarUrl" />
          </n-badge>
          <div class="channel-meta">
            <div class="channel-title-row">
              <span class="channel-name">{{ dmDisplayInfo.name }}</span>
            </div>
          </div>
        </template>

        <template v-else-if="channel.type === 'group' && dmDisplayInfo">
          <div class="channel-meta">
            <div class="topic-container is-editable channel-title-row" @click="openRenameModal">
              <span class="channel-name">{{ dmDisplayInfo.name }}</span>
              <span class="dm-member-count">({{ dmDisplayInfo.memberCount }})</span>
              <n-icon class="edit-icon" size="14"><create-icon /></n-icon>
            </div>
            <div class="topic-container is-editable channel-subtitle-row" @click="openTopicModal">
              <span class="channel-topic" v-if="channel.topic">{{ channel.topic }}</span>
              <span class="channel-topic placeholder" v-else>{{ $t('ui.components.set_topic') }}</span>
              <n-icon class="edit-icon" size="14"><create-icon /></n-icon>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="channel-meta">
            <div class="channel-title-row">
              <span class="channel-name">
                <n-icon class="channel-prefix-icon" size="14">
                  <earth-icon v-if="channel.type === 'public'" />
                  <lock-closed-icon v-else />
                </n-icon>
                <n-icon v-if="channel.is_voice" class="channel-prefix-icon" size="15"><volume-high-icon /></n-icon>
                {{ channel.name }}
              </span>
              <n-tag v-if="channel.is_archived" size="small" type="warning">{{ $t('ui.components.archived') }}</n-tag>
            </div>
            <div class="channel-subtitle-row">
              <span class="channel-topic" v-if="channel.topic">{{ channel.topic }}</span>
              <span class="channel-topic placeholder" v-else>{{ $t('ui.components.no_topic_set') }}</span>
            </div>
          </div>
        </template>
      </div>

      <n-space v-if="!isMobileLayout" class="channel-header-actions" :size="4">
        <n-button
          v-if="canShowMeetingCallAction"
          quaternary
          size="small"
          :loading="startingMeeting || loadingActiveMeeting"
          :title="meetingCallActionTitle"
          @click="startOrJoinMeetingCall"
        >
          <template #icon><n-icon size="16"><call-icon /></n-icon></template>
          {{ meetingCallActionLabel }}
        </n-button>

        <n-popover
          v-if="canShowMeetingsMenuAction"
          v-model:show="showDesktopMeetingsMenu"
          trigger="click"
          placement="bottom-end"
        >
          <template #trigger>
            <n-button
              quaternary
              size="small"
              :loading="schedulingMeeting"
              :title="$t('ui.views.meetings')"
              :aria-label="$t('ui.views.meetings')"
              data-testid="channel-header-meetings-trigger"
            >
              <template #icon><n-icon size="16"><past-meetings-icon /></n-icon></template>
              {{ $t('ui.views.meetings') }}
            </n-button>
          </template>
          <div class="header-menu meetings-menu">
            <n-button
              text
              size="small"
              class="header-menu-action"
              data-testid="channel-header-meetings-schedule"
              @click="onOpenScheduleMeetingFromMenu"
            >
              <template #icon><n-icon size="16"><past-meetings-icon /></n-icon></template>
              {{ $t('ui.views.schedule_meeting') }}
            </n-button>
            <n-button
              text
              size="small"
              class="header-menu-action"
              data-testid="channel-header-past-meetings"
              :type="pastMeetingsPanelOpen ? 'primary' : 'default'"
              @click="onTogglePastMeetingsAction"
            >
              <template #icon><n-icon size="16"><past-meetings-icon /></n-icon></template>
              {{ $t('ui.views.past_meetings') }}
            </n-button>
          </div>
        </n-popover>

        <n-button
          v-if="canShowMembersAction"
          quaternary
          size="small"
          data-testid="channel-header-members"
          :aria-pressed="membersPanelOpen ? 'true' : 'false'"
          @click="$emit('toggle-members')"
        >
          <template #icon><n-icon size="16"><members-icon /></n-icon></template>
          {{ memberCount }} {{ $t('ui.components.members') }}
        </n-button>

        <n-popover
          v-if="canShowDesktopOverflowActions"
          v-model:show="showDesktopOverflowMenu"
          trigger="click"
          placement="bottom-end"
        >
          <template #trigger>
            <n-button
              quaternary
              circle
              size="small"
              data-testid="channel-header-overflow-trigger"
              :title="$t('ui.components.admin.actions')"
              :aria-label="$t('ui.components.admin.actions')"
            >
              <template #icon><n-icon size="18"><more-icon /></n-icon></template>
            </n-button>
          </template>

          <div class="header-menu desktop-overflow-menu">
            <n-button
              text
              size="small"
              class="header-menu-action"
              data-testid="channel-header-pins"
              @click="onTogglePinsFromMenu"
            >
              <template #icon><n-icon size="16"><pin-icon /></n-icon></template>
              {{ pinnedCount }} {{ $t('ui.components.pinned_messages') }}
            </n-button>

            <div v-if="canShowAiSummaryAction" class="header-menu-section summary-section">
              <n-button
                text
                size="small"
                class="header-menu-action summary-toggle"
                data-testid="channel-header-summary-toggle"
                :aria-expanded="desktopSummaryActionsExpanded ? 'true' : 'false'"
                aria-controls="channel-header-summary-actions"
                @click="toggleDesktopSummaryActions"
              >
                <span class="summary-toggle-content">
                  <n-icon size="16"><sparkles-icon /></n-icon>
                  <span>{{ $t('ui.components.ai_summary') }}</span>
                </span>
                <n-icon class="summary-toggle-chevron" size="16">
                  <chevron-up-icon v-if="desktopSummaryActionsExpanded" />
                  <chevron-down-icon v-else />
                </n-icon>
              </n-button>

              <ChannelSummaryActions v-if="desktopSummaryActionsExpanded" id="channel-header-summary-actions" data-testid="channel-header-summary-actions" :channel="channel" v-model:range-value="customSummaryRangeValue" v-model:range-unit="customSummaryRangeUnit" @completed="closeDesktopOverflowMenu(); closeMobileOverflowMenu()" />
            </div>

            <div v-if="myMembership" class="header-menu-section">
              <div class="header-menu-section-title">{{ $t('ui.components.notifications') }}</div>
              <n-button
                text
                size="small"
                class="header-menu-action"
                :type="notifPref === 'all' ? 'primary' : 'default'"
                data-testid="channel-header-notifications-all"
                @click="onSetNotifPrefFromMenu('all')"
              >
                <template #icon><n-icon size="16"><notif-all-icon /></n-icon></template>
                {{ $t('ui.components.all_messages') }}
              </n-button>
              <n-button
                text
                size="small"
                class="header-menu-action"
                :type="notifPref === 'mentions' ? 'primary' : 'default'"
                data-testid="channel-header-notifications-mentions"
                @click="onSetNotifPrefFromMenu('mentions')"
              >
                <template #icon><n-icon size="16"><notif-mentions-icon /></n-icon></template>
                {{ $t('ui.components.only_mentions') }}
              </n-button>
              <n-button
                text
                size="small"
                class="header-menu-action"
                :type="notifPref === 'none' ? 'primary' : 'default'"
                data-testid="channel-header-notifications-none"
                @click="onSetNotifPrefFromMenu('none')"
              >
                <template #icon><n-icon size="16"><notif-off-icon /></n-icon></template>
                {{ $t('ui.components.mute') }}
              </n-button>
            </div>

            <n-button
              v-if="canManageChannelSettings"
              text
              size="small"
              class="header-menu-action"
              data-testid="channel-header-settings"
              @click="onOpenSettingsFromMenu"
            >
              <template #icon><n-icon size="16"><settings-icon /></n-icon></template>
              {{ $t('ui.components.channel_settings') }}
            </n-button>

            <div v-if="canLeaveChannel" class="header-menu-section danger-section">
              <div class="header-menu-section-title danger">{{ $t('ui.components.danger_zone') }}</div>
              <n-popconfirm :positive-text="$t('ui.components.leave')" :negative-text="$t('ui.components.admin.cancel')" :positive-button-props="{ 'data-testid': 'confirm-leave-channel' }" @positive-click="leave"><template #trigger><n-button
                    text
                    size="small"
                    class="header-menu-action danger"
                    :loading="loading"
                    data-testid="leave-current-channel"
                  >
                    <template #icon><n-icon size="16"><exit-icon /></n-icon></template>
                    {{ $t('ui.components.leave') }}
                  </n-button></template><span>{{ $t('ui.components.remove_from_channel') }}</span></n-popconfirm>
            </div>
          </div>
        </n-popover>
      </n-space>

      <n-space v-else class="channel-header-actions mobile-actions" :size="6">
        <n-button
          v-if="canShowMeetingCallAction"
          quaternary
          size="small"
          :loading="startingMeeting || loadingActiveMeeting"
          :title="meetingCallActionTitle"
          data-testid="channel-header-mobile-call"
          @click="startOrJoinMeetingCall"
        >
          <template #icon><n-icon size="16"><call-icon /></n-icon></template>
          {{ meetingCallActionLabel }}
        </n-button>

        <n-popover
          v-if="canShowMeetingsMenuAction"
          v-model:show="showMobileMeetingsMenu"
          trigger="click"
          placement="bottom-end"
        >
          <template #trigger>
            <n-button
              quaternary
              size="small"
              :loading="schedulingMeeting"
              :title="$t('ui.views.meetings')"
              :aria-label="$t('ui.views.meetings')"
              data-testid="channel-header-mobile-meetings-trigger"
            >
              <template #icon><n-icon size="16"><past-meetings-icon /></n-icon></template>
              {{ $t('ui.views.meetings') }}
            </n-button>
          </template>

          <div class="header-menu meetings-menu">
            <n-button
              text
              size="small"
              class="header-menu-action"
              data-testid="channel-header-mobile-meetings-schedule"
              @click="onOpenScheduleMeetingFromMenu"
            >
              <template #icon><n-icon size="16"><past-meetings-icon /></n-icon></template>
              {{ $t('ui.views.schedule_meeting') }}
            </n-button>
            <n-button
              text
              size="small"
              class="header-menu-action"
              data-testid="channel-header-mobile-past-meetings"
              :type="pastMeetingsPanelOpen ? 'primary' : 'default'"
              @click="onTogglePastMeetingsAction"
            >
              <template #icon><n-icon size="16"><past-meetings-icon /></n-icon></template>
              {{ $t('ui.views.past_meetings') }}
            </n-button>
          </div>
        </n-popover>

        <n-popover
          v-model:show="showMobileOverflowMenu"
          trigger="click"
          placement="bottom-end"
        >
          <template #trigger>
            <n-button
              quaternary
              circle
              size="small"
              data-testid="channel-header-mobile-overflow-trigger"
              :title="$t('ui.components.admin.actions')"
              :aria-label="$t('ui.components.admin.actions')"
            >
              <template #icon><n-icon size="18"><more-icon /></n-icon></template>
            </n-button>
          </template>

          <div class="header-menu mobile-overflow-menu">
            <n-button
              text
              size="small"
              class="header-menu-action"
              data-testid="channel-header-mobile-pins"
              @click="onTogglePinsFromMenu"
            >
              <template #icon><n-icon size="16"><pin-icon /></n-icon></template>
              {{ pinnedCount }} {{ $t('ui.components.pinned_messages') }}
            </n-button>

            <div v-if="canShowMembersAction" class="header-menu-section">
              <n-button
                text
                size="small"
                class="header-menu-action"
                data-testid="channel-header-mobile-members"
                @click="onToggleMembersFromMenu"
              >
                <template #icon><n-icon size="16"><members-icon /></n-icon></template>
                {{ memberCount }} {{ $t('ui.components.members') }}
              </n-button>
            </div>

            <div v-if="canShowAiSummaryAction" class="header-menu-section mobile-summary-section">
              <n-button
                text
                size="small"
                class="header-menu-action summary-toggle"
                data-testid="channel-header-mobile-summary-toggle"
                :aria-expanded="mobileSummaryActionsExpanded ? 'true' : 'false'"
                aria-controls="channel-header-mobile-summary-actions"
                @click="toggleMobileSummaryActions"
              >
                <span class="summary-toggle-content">
                  <n-icon size="16"><sparkles-icon /></n-icon>
                  <span>{{ $t('ui.components.ai_summary') }}</span>
                </span>
                <n-icon class="summary-toggle-chevron" size="16">
                  <chevron-up-icon v-if="mobileSummaryActionsExpanded" />
                  <chevron-down-icon v-else />
                </n-icon>
              </n-button>

              <ChannelSummaryActions v-if="mobileSummaryActionsExpanded" id="channel-header-mobile-summary-actions" data-testid="channel-header-mobile-summary-actions" :channel="channel" v-model:range-value="customSummaryRangeValue" v-model:range-unit="customSummaryRangeUnit" @completed="closeDesktopOverflowMenu(); closeMobileOverflowMenu()" />
            </div>

            <div v-if="myMembership" class="header-menu-section">
              <div class="header-menu-section-title">{{ $t('ui.components.notifications') }}</div>
              <n-button
                text
                size="small"
                class="header-menu-action"
                :type="notifPref === 'all' ? 'primary' : 'default'"
                data-testid="channel-header-mobile-notifications-all"
                @click="onSetNotifPrefFromMenu('all')"
              >
                <template #icon><n-icon size="16"><notif-all-icon /></n-icon></template>
                {{ $t('ui.components.all_messages') }}
              </n-button>
              <n-button
                text
                size="small"
                class="header-menu-action"
                :type="notifPref === 'mentions' ? 'primary' : 'default'"
                data-testid="channel-header-mobile-notifications-mentions"
                @click="onSetNotifPrefFromMenu('mentions')"
              >
                <template #icon><n-icon size="16"><notif-mentions-icon /></n-icon></template>
                {{ $t('ui.components.only_mentions') }}
              </n-button>
              <n-button
                text
                size="small"
                class="header-menu-action"
                :type="notifPref === 'none' ? 'primary' : 'default'"
                data-testid="channel-header-mobile-notifications-none"
                @click="onSetNotifPrefFromMenu('none')"
              >
                <template #icon><n-icon size="16"><notif-off-icon /></n-icon></template>
                {{ $t('ui.components.mute') }}
              </n-button>
            </div>

            <n-button
              v-if="canManageChannelSettings"
              text
              size="small"
              class="header-menu-action"
              data-testid="channel-header-mobile-settings"
              @click="onOpenSettingsFromMenu"
            >
              <template #icon><n-icon size="16"><settings-icon /></n-icon></template>
              {{ $t('ui.components.channel_settings') }}
            </n-button>

            <div v-if="canLeaveChannel" class="header-menu-section danger-section">
              <div class="header-menu-section-title danger">{{ $t('ui.components.danger_zone') }}</div>
              <n-popconfirm :positive-text="$t('ui.components.leave')" :negative-text="$t('ui.components.admin.cancel')" :positive-button-props="{ 'data-testid': 'confirm-leave-channel' }" @positive-click="leave"><template #trigger><n-button
                    text
                    size="small"
                    class="header-menu-action danger"
                    :loading="loading"
                    data-testid="channel-header-mobile-leave"
                  >
                    <template #icon><n-icon size="16"><exit-icon /></n-icon></template>
                    {{ $t('ui.components.leave') }}
                  </n-button></template><span>{{ $t('ui.components.remove_from_channel') }}</span></n-popconfirm>
            </div>
          </div>
        </n-popover>
      </n-space>
    </n-space>

    <ChannelGroupDialogs :key="'group-' + channel?.id" ref="groups" :channel="channel" />
    <ChannelSettingsDialog :key="'settings-' + channel?.id" ref="settings" :channel="channel" />
    </template></ChannelMeetingScheduleDialog>
  </div>

</template></ChannelLeaveAction>
</template>

<script>
import ChannelLeaveAction from './channels/ChannelLeaveAction.vue'
import { PinOutline as PinIcon, CreateOutline as CreateIcon, CallOutline as CallIcon, EllipsisHorizontalOutline as MoreIcon, NotificationsOutline as NotifAllIcon, NotificationsOffOutline as NotifOffIcon, AtOutline as NotifMentionsIcon, SettingsOutline as SettingsIcon, VolumeHighOutline as VolumeHighIcon, EarthOutline as EarthIcon, LockClosedOutline as LockClosedIcon, ExitOutline as ExitIcon, PeopleOutline as MembersIcon, TimeOutline as PastMeetingsIcon, SparklesOutline as SparklesIcon, ChevronDownOutline as ChevronDownIcon, ChevronUpOutline as ChevronUpIcon } from '@vicons/ionicons5'
import { useSessionStore, useChannelsStore, useDmsStore, useMeetingsStore, useMessagesStore, useUiStore, useNotificationsStore, useVoiceStore } from '../stores/index.js'
import { playSfx, SFX_EVENTS } from '../lib/sfx.js'
import { observeMobileLayout, readIsMobileLayout } from '../lib/mobile-layout.js'
import { getPresenceStatusColor } from '../lib/user-presence.js'
import UserAvatar from './UserAvatar.vue'
import ChannelGroupDialogs from './channels/ChannelGroupDialogs.vue'
import ChannelSettingsDialog from './channels/ChannelSettingsDialog.vue'
import ChannelMeetingScheduleDialog from './channels/ChannelMeetingScheduleDialog.vue'
import ChannelSummaryActions from './channels/ChannelSummaryActions.vue'

export default {
  name: 'ChannelHeader',
  components: { ChannelLeaveAction, UserAvatar,
PinIcon,
CreateIcon,
CallIcon,
MoreIcon,
NotifAllIcon,
NotifOffIcon,
NotifMentionsIcon,
SettingsIcon,
VolumeHighIcon,
EarthIcon,
LockClosedIcon,
ExitIcon,
MembersIcon,
PastMeetingsIcon,
SparklesIcon,
ChevronDownIcon,
ChevronUpIcon,
ChannelGroupDialogs,
ChannelSettingsDialog,
ChannelMeetingScheduleDialog,
ChannelSummaryActions },
  emits: ["toggle-members","toggle-past-meetings"],
  props: { rightPanelMode: { type: String, default: 'closed' } },
  data() { return {
isMobileLayout: readIsMobileLayout(),
showDesktopOverflowMenu: false,
showMobileOverflowMenu: false,
showDesktopMeetingsMenu: false,
showMobileMeetingsMenu: false,
desktopSummaryActionsExpanded: false,
mobileSummaryActionsExpanded: false,
startingMeeting: false,
loadingActiveMeeting: false,
customSummaryRangeValue: 4,
customSummaryRangeUnit: 'hours',
stopObservingMobileLayout: null,
fetchedSourceMeeting: null
  } },
  computed: {
channel() {
      const activeId = this.channelsStore.activeChannelId
      return this.channelsStore.channels.find((channel) => channel.id === activeId)
        || this.dmsStore.dmChannels.find((dmChannel) => dmChannel.id === activeId)
    },
canManageChannelSettings() {
      if (this.isGroupDm) {
        const selfId = this.sessionStore.user?.id
        const membership = (this.channel?.participants || []).find((entry) => entry.user_id === selfId)
        return this.sessionStore.user?.is_admin === true || membership?.role === 'owner'
      }
      return !this.isDm && this.channelsStore.can('manage_channels')
    },
canLeaveChannel() {
      if (!this.channel) return false
      if (this.channel.type === 'dm') return false
      return this.channel.type === 'group'
        || this.channel.type === 'public'
        || this.channel.type === 'private'
    },
canShowMeetingCallAction() {
      return !!this.channel
        && !this.channel.is_archived
        && this.channel.purpose !== 'meeting'
    },
canShowAiSummaryAction() {
      return !!this.channel
        && !this.channel.is_archived
        && this.channel.purpose !== 'meeting'
    },
canShowMeetingsMenuAction() {
      return !!this.channel
        && !this.channel.is_archived
        && this.channel.purpose !== 'meeting'
    },
canShowMembersAction() {
      return !!this.channel && this.channel.type !== 'dm'
    },
canShowDesktopOverflowActions() {
      return !!this.channel
    },
membersPanelOpen() {
      return this.rightPanelMode === 'members'
    },
pastMeetingsPanelOpen() {
      return this.rightPanelMode === 'pastMeetings'
    },
meetingCallActionLabel() {
      if (!this.hasActiveSourceMeeting) return this.$t('ui.components.call')
      if (this.voiceStore.channelId === this.activeSourceMeeting.chat_channel_id) {
        return this.$t('ui.components.open_call')
      }
      return this.$t('ui.components.join_call')
    },
meetingCallActionTitle() {
      if (!this.hasActiveSourceMeeting) return this.$t('ui.components.start_call')
      if (this.voiceStore.channelId === this.activeSourceMeeting.chat_channel_id) {
        return this.$t('ui.components.open_active_call')
      }
      return this.$t('ui.components.join_active_call')
    },
dmDisplayInfo() {
      if (!this.isDm || !this.channel) return null
      return this.dmsStore.displayInfo(this.channel)
    },
dmStatusColor() {
      if (!this.dmDisplayInfo) return '#8c8c8c'
      return getPresenceStatusColor(this.dmDisplayInfo.badgeStatus || this.dmDisplayInfo.status)
    },
memberCount() {
      return this.channelsStore.members.length
    },
pinnedCount() {
      return this.messagesStore.pinnedMessages.length
    },
myMembership() {
      return this.channelsStore.myMembership
    },
notifPref() {
      return this.channelsStore.myMembership?.notifications || 'all'
    },
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
messagesStore() {
      return useMessagesStore()
    },
notificationsStore() {
      return useNotificationsStore()
    },
voiceStore() {
      return useVoiceStore()
    },
isDm() {
      return this.channel?.type === 'dm' || this.channel?.type === 'group'
    },
isGroupDm() {
      return this.channel?.type === 'group'
    },
hasActiveSourceMeeting() {
      return this.activeSourceMeeting?.status === 'active'
    },
activeSourceMeeting() {
      if (!this.channel?.id) return null
      const fromStore = this.meetingsStore.meetings.find((meeting) => (
        meeting.status === 'active' && meeting.source_channel_id === this.channel.id
      ))
      if (fromStore) return fromStore

      if (!this.fetchedSourceMeeting) return null
      const knownMeeting = this.meetingsStore.meetings.find((meeting) => meeting.id === this.fetchedSourceMeeting.id)
      if (knownMeeting) {
        return knownMeeting.status === 'active' ? knownMeeting : null
      }

      return this.fetchedSourceMeeting.status === 'active' ? this.fetchedSourceMeeting : null
    },
uiStore() {
      return useUiStore()
    }
  },
  watch: {
'channel.id': {
      immediate: true,
      async handler() {
        await this.refreshActiveSourceMeeting()
      }
    },
isMobileLayout() {
      this.closeDesktopOverflowMenu()
      this.closeMobileOverflowMenu()
      this.closeMeetingsMenus()
    },
showDesktopOverflowMenu(value) {
      if (!value) {
        this.desktopSummaryActionsExpanded = false
      }
    },
showMobileOverflowMenu(value) {
      if (!value) {
        this.mobileSummaryActionsExpanded = false
      }
    }
  },
mounted() {
    this.stopObservingMobileLayout = observeMobileLayout((matches) => {
      this.isMobileLayout = matches
    })
  },
beforeUnmount() {
    this.stopObservingMobileLayout?.()
  },
  methods: {
goToScheduledMeeting(id) { return this.$router.push(`/meetings/${id}`).catch(() => {}) },
openTopicModal() { return this.$refs.groups?.openTopicModal() },
openRenameModal() { return this.$refs.groups?.openRenameModal() },
openSettingsModal() { return this.$refs.settings?.openSettingsModal() },
openScheduleMeetingModal() { return this.$refs.schedule?.openScheduleMeetingModal() },
closeDesktopOverflowMenu() {
      this.showDesktopOverflowMenu = false
      this.desktopSummaryActionsExpanded = false
    },
closeMobileOverflowMenu() {
      this.showMobileOverflowMenu = false
      this.mobileSummaryActionsExpanded = false
    },
closeMeetingsMenus() {
      this.showDesktopMeetingsMenu = false
      this.showMobileMeetingsMenu = false
    },
toggleDesktopSummaryActions() {
      this.desktopSummaryActionsExpanded = !this.desktopSummaryActionsExpanded
    },
toggleMobileSummaryActions() {
      this.mobileSummaryActionsExpanded = !this.mobileSummaryActionsExpanded
    },
onTogglePinsFromMenu() {
      this.togglePins()
      this.closeDesktopOverflowMenu()
      this.closeMobileOverflowMenu()
    },
onToggleMembersFromMenu() {
      this.$emit('toggle-members')
      this.closeDesktopOverflowMenu()
      this.closeMobileOverflowMenu()
    },
onTogglePastMeetingsAction() {
      this.$emit('toggle-past-meetings')
      this.closeDesktopOverflowMenu()
      this.closeMobileOverflowMenu()
      this.closeMeetingsMenus()
    },
onOpenScheduleMeetingFromMenu() {
      this.closeMeetingsMenus()
      this.openScheduleMeetingModal()
    },
onOpenSettingsFromMenu() {
      this.openSettingsModal()
      this.closeDesktopOverflowMenu()
      this.closeMobileOverflowMenu()
    },
async onSetNotifPrefFromMenu(pref) {
      await this.setNotifPref(pref)
      this.closeDesktopOverflowMenu()
      this.closeMobileOverflowMenu()
    },
async setNotifPref(pref) {
      try {
        await this.notificationsStore.updatePreference(pref)
        const labels = {
          all: this.$t('ui.components.all_messages'),
          mentions: this.$t('ui.components.only_mentions'),
          none: this.$t('ui.components.muted')
        }
        window.$message?.success(labels[pref])
      } catch {
        window.$message?.error(this.$t('ui.components.could_not_save_setting'))
      }
    },
closeMenusForLeave() { this.closeDesktopOverflowMenu(); this.closeMobileOverflowMenu(); this.closeMeetingsMenus() },
navigateAfterLeave(path) { return this.$router.push(path).catch(() => {}) },
async refreshActiveSourceMeeting() {
      const channelId = this.channel?.id
      if (!this.channel || this.channel.purpose === 'meeting' || this.channel.is_archived) {
        this.fetchedSourceMeeting = null
        return
      }

      this.loadingActiveMeeting = true
      try {
        const meeting = await this.meetingsStore.fetchActiveBySourceChannel(channelId)
        if (this.channel?.id === channelId) this.fetchedSourceMeeting = meeting
      } catch {
        if (this.channel?.id === channelId) this.fetchedSourceMeeting = null
      } finally {
        if (this.channel?.id === channelId) this.loadingActiveMeeting = false
      }
    },
async startOrJoinMeetingCall() {
      if (!this.channel || this.startingMeeting || this.loadingActiveMeeting) return

      this.startingMeeting = true
      try {
        await this.refreshActiveSourceMeeting()
        let meeting = this.activeSourceMeeting
        let startedNewMeeting = false
        const meetingStartTitle = this.resolveMeetingStartTitle()

        if (!meeting || meeting.status !== 'active') {
          meeting = await this.meetingsStore.startFromChannel(
            this.channel.id,
            [],
            meetingStartTitle
          )
          startedNewMeeting = true
        }

        if (this.voiceStore.channelId !== meeting.chat_channel_id) {
          await this.meetingsStore.join(meeting.id)
        }

        if (startedNewMeeting) {
          playSfx(SFX_EVENTS.CALL_OUTGOING)
        }

        await this.$router.push(`/meetings/${meeting.id}`).catch(() => {})
        await this.refreshActiveSourceMeeting()
      } catch {
        window.$message?.error(this.$t('ui.components.could_not_start_call'))
      } finally {
        this.startingMeeting = false
      }
    },
resolveMeetingStartTitle() {
      if (!this.channel) return ''

      const topic = typeof this.channel.topic === 'string'
        ? this.channel.topic.trim()
        : ''
      if (topic) return topic

      if (this.channel.type === 'dm' || this.channel.type === 'group') {
        return ''
      }

      return typeof this.channel.name === 'string'
        ? this.channel.name.trim()
        : ''
    },
togglePins() {
      this.uiStore.showPinnedPanel = !this.uiStore.showPinnedPanel
    }
  }
}
</script>

<style scoped>

.channel-header {
  padding: 12px 16px;
}

.channel-header-row {
  width: 100%;
}

.channel-header-copy {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.channel-avatar {
  flex-shrink: 0;
}

.channel-meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.channel-title-row,
.channel-subtitle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.channel-name {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  font-size: 16px;
}

.channel-prefix-icon {
  line-height: 1;
  flex-shrink: 0;
}

.dm-member-count {
  font-size: 13px;
  opacity: 0.5;
  flex-shrink: 0;
}

.topic-container {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  width: fit-content;
  max-width: 100%;
  padding: 2px 6px;
  border-radius: 6px;
  transition: background-color 0.2s;
}

.topic-container.is-editable {
  cursor: pointer;
}

.topic-container.is-editable:hover {
  background-color: rgba(255, 255, 255, 0.08);
}

.channel-topic {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  opacity: 0.7;
}

.channel-topic.placeholder {
  opacity: 0.4;
}

.edit-icon {
  opacity: 0;
  flex-shrink: 0;
  transition: opacity 0.2s;
}

.topic-container.is-editable:hover .edit-icon {
  opacity: 0.6;
}

.channel-header-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.header-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 240px;
}

.meetings-menu {
  min-width: 220px;
}

.desktop-overflow-menu,
.mobile-overflow-menu {
  min-width: 240px;
}

.header-menu-action {
  width: 100%;
  justify-content: flex-start;
  padding: 6px 8px;
}

.header-menu-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.header-menu-section-title {
  padding: 4px 8px 2px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.7;
}

.header-menu-section-title.danger,
.header-menu-action.danger {
  color: rgb(229, 115, 115);
}

.summary-toggle {
  justify-content: space-between;
}

.summary-toggle :deep(.n-button__content) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.summary-toggle-content {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.summary-toggle-content span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-toggle-chevron {
  flex-shrink: 0;
  margin-left: auto;
  opacity: 0.75;
}

.summary-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 2px 0 4px;
}

.summary-custom .n-button {
  grid-column: 1 / -1;
}

@media (max-width: 900px) {
  .channel-header {
    padding: 12px;
  }

  .channel-header-row {
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .channel-header-copy {
    width: 100%;
  }

  .channel-header-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .mobile-actions {
    margin-top: 6px;
  }

  .channel-name,
  .channel-topic {
    white-space: normal;
    word-break: break-word;
  }
}

</style>
