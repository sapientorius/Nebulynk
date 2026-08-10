<template>
  <n-drawer v-model:show="show" :width="380" placement="right" data-testid="notifications-panel">
    <n-drawer-content closable>
      <template #header>
        <n-space align="center" justify="space-between" style="width: 100%">
          <span>{{ $t('ui.components.notifications') }}</span>
          <n-button
            v-if="hasUnread"
            size="tiny"
            quaternary
            @click="markAll"
          >
            {{ $t('ui.components.mark_all_read') }}
          </n-button>
        </n-space>
      </template>

      <div data-testid="notifications-panel-body">
        <div v-if="notifications.length === 0" class="empty-notifs">
          <n-empty :description="$t('ui.components.no_notifications')" />
        </div>

        <div
          v-for="notif in notifications"
          :key="notif.id"
          class="notif-item"
          :class="{
            unread: !notif.is_read,
            'notif-item-clickable': !hasMeetingInviteCard(notif)
          }"
          :data-testid="hasMeetingInviteCard(notif) ? 'notification-meeting-item' : 'notification-item'"
          @click="handleNotificationClick(notif)"
        >
          <div class="notif-header">
            <UserAvatar
              :size="24"
              class="notif-avatar"
              :name="notif.actor_display_name"
              :avatar-url="actorAvatarUrl(notif)"
            />
            <span class="notif-actor">{{ notif.actor_display_name }}</span>
            <span class="notif-time">{{ formatTime(notif.created_at) }}</span>
          </div>
          <div class="notif-body">
            <div
              v-if="meetingInviteCardsByNotificationId[notif.id]"
              class="notif-meeting-card-wrap"
              data-testid="notification-meeting-card"
            >
              <MeetingActionCard
                v-bind="meetingInviteCardsByNotificationId[notif.id]"
                variant="notification"
                :show-label="false"
                @open="openMeetingInvite(notif)"
                @join="joinMeetingInviteCall(notif)"
              />
            </div>
            <template v-else>
              <span class="notif-channel">{{ notificationContextLabel(notif) }}</span>
              <p class="notif-snippet">{{ notificationSnippet(notif) }}</p>
            </template>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="push-toggle">
          <n-space align="center" justify="space-between">
            <span style="font-size: 13px; opacity: 0.7">{{ notificationToggleLabel }}</span>
            <n-switch
              :value="pushEnabled"
              :loading="pushLoading"
              :disabled="!notificationsStore.canToggleNotifications"
              @update:value="togglePush"
            />
          </n-space>
        </div>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<script>
import { h } from 'vue'
import {
  useSessionStore,
  useNotificationsStore,
  useChannelsStore,
  useDmsStore,
  useMeetingsStore,
  useVoiceStore
} from '../stores/index.js'
import { getCurrentLocale } from '../lib/i18n.js'
import { buildMeetingCardState, countMeetingConnectedParticipants } from '../lib/meeting-card.js'
import { toPlainMessageSnippet } from '../lib/message-markdown.js'
import { resolveNotificationMeetingId } from '../lib/notification-meeting.js'
import { isAnyDesktopRuntime } from '../lib/runtime.js'
import MeetingActionCard from './MeetingActionCard.vue'
import UserAvatar from './UserAvatar.vue'

export default {
  name: 'NotificationsPanel',
  components: {
    MeetingActionCard,
    UserAvatar
  },
  mounted() {
    if (this.show) {
      this.refreshPanelNotifications()
    }
  },
  data() {
    return {
      pushLoading: false,
      loadingMeetingById: {},
      joiningMeetingById: {}
    }
  },
  computed: {
    notificationsStore() {
      return useNotificationsStore()
    },
    channelsStore() {
      return useChannelsStore()
    },
    dmsStore() {
      return useDmsStore()
    },
    sessionStore() {
      return useSessionStore()
    },
    meetingsStore() {
      return useMeetingsStore()
    },
    voiceStore() {
      return useVoiceStore()
    },
    show: {
      get() { return this.notificationsStore.showPanel },
      set(val) { this.notificationsStore.showPanel = val }
    },
    notifications() {
      return this.notificationsStore.notifications
    },
    hasUnread() {
      return this.notificationsStore.unreadCount > 0
    },
    pushEnabled() {
      return this.notificationsStore.pushEnabled
    },
    isDesktopMode() {
      return isAnyDesktopRuntime()
    },
    notificationToggleLabel() {
      return this.isDesktopMode
        ? 'Desktop notifications'
        : this.$t('ui.components.browser_notifications')
    },
    meetingInviteCardsByNotificationId() {
      const cards = {}

      for (const notif of this.notifications) {
        const meetingId = this.getNotificationMeetingId(notif)
        if (!meetingId) continue

        const meeting = this.meetingsStore.getMeetingById(meetingId)
        const chatChannelId = meeting?.chat_channel_id || null
        const realtimeConnectedCount = chatChannelId
          ? this.voiceStore.participants?.[chatChannelId]?.length
          : null
        const connectedCount = Number.isInteger(realtimeConnectedCount)
          ? realtimeConnectedCount
          : countMeetingConnectedParticipants(meeting)

        cards[notif.id] = buildMeetingCardState({
          meetingId,
          meeting,
          connectedCount,
          voiceChannelId: this.voiceStore.channelId,
          isJoining: !!this.joiningMeetingById[meetingId],
          title: meeting
            ? this.meetingsStore.resolveDisplayName(meeting)
            : this.$t('ui.components.meeting_card'),
          subtitle: meeting
            ? this.meetingsStore.resolveSourceDisplayName(meeting)
            : this.getChannelName(notif.channel_id),
          tFn: (key, params) => this.$t(key, params)
        })
      }

      return cards
    }
  },
  watch: {
    show(value) {
      if (!value) return
      this.refreshPanelNotifications()
    },
    notifications: {
      deep: true,
      immediate: true,
      handler() {
        this.syncMeetingInviteCards()
      }
    }
  },
  methods: {
    async refreshPanelNotifications() {
      await this.notificationsStore.refreshNotifications().catch(() => {})
    },
    formatTime(dateStr) {
      const date = new Date(dateStr)
      const now = new Date()
      const diffMs = now - date
      const diffMin = Math.floor(diffMs / 60000)
      if (diffMin < 1) return this.$t('ui.components.just_now')
      if (diffMin < 60) return this.$t('ui.components.min_ago', { diffmin: diffMin })
      const diffH = Math.floor(diffMin / 60)
      if (diffH < 24) return this.$t('ui.components.h_ago', { diffh: diffH })
      return date.toLocaleDateString(getCurrentLocale(), { day: '2-digit', month: '2-digit' })
    },
    getChannelName(channelId) {
      const ch = this.channelsStore.channels.find((c) => c.id === channelId)
      if (ch) return `# ${ch.name}`
      const dm = this.dmsStore.dmChannels.find((d) => d.id === channelId)
      if (dm) {
        const info = this.dmsStore.displayInfo(dm)
        return info.name
      }
      return this.$t('ui.components.unknown_channel')
    },
    notificationContextLabel(notif) {
      if (notif?.type === 'registration_pending') {
        return this.$t('selfRegistrationAdmin.title')
      }
      return this.getChannelName(notif?.channel_id)
    },
    getNotificationMeetingId(notif) {
      return resolveNotificationMeetingId(notif)
    },
    actorAvatarUrl(notif) {
      return this.sessionStore.getUserById(notif.actor_id)?.avatar_url || null
    },
    hasMeetingInviteCard(notif) {
      return !!this.meetingInviteCardsByNotificationId[notif.id]
    },
    notificationSnippet(notif) {
      return toPlainMessageSnippet(notif?.message_snippet || '', { maxLength: 160 })
    },
    syncMeetingInviteCards() {
      const meetingIds = new Set()

      for (const notif of this.notifications) {
        const meetingId = this.getNotificationMeetingId(notif)
        if (!meetingId) continue
        meetingIds.add(meetingId)
        this.ensureMeetingLoaded(meetingId)
      }

      const nextLoadingMeetingById = {}
      for (const meetingId of Object.keys(this.loadingMeetingById)) {
        if (meetingIds.has(meetingId)) {
          nextLoadingMeetingById[meetingId] = true
        }
      }
      this.loadingMeetingById = nextLoadingMeetingById

      const nextJoiningMeetingById = {}
      for (const meetingId of Object.keys(this.joiningMeetingById)) {
        if (meetingIds.has(meetingId)) {
          nextJoiningMeetingById[meetingId] = true
        }
      }
      this.joiningMeetingById = nextJoiningMeetingById
    },
    ensureMeetingLoaded(meetingId) {
      if (!meetingId) return
      if (this.meetingsStore.getMeetingById(meetingId)) return
      if (this.loadingMeetingById[meetingId]) return

      this.loadingMeetingById = {
        ...this.loadingMeetingById,
        [meetingId]: true
      }

      this.meetingsStore.ensureMeetingLoaded(meetingId)
        .catch(() => {})
        .finally(() => {
          const next = { ...this.loadingMeetingById }
          delete next[meetingId]
          this.loadingMeetingById = next
        })
    },
    async markNotificationRead(notif) {
      if (!notif?.id || notif.is_read) return
      await this.notificationsStore.markRead(notif.id)
    },
    async handleNotificationClick(notif) {
      if (this.hasMeetingInviteCard(notif)) {
        await this.markNotificationRead(notif)
        return
      }

      await this.openNotification(notif)
    },
    async openNotification(notif) {
      await this.markNotificationRead(notif)
      this.notificationsStore.showPanel = false

      if (notif?.type === 'registration_pending') {
        try {
          await this.$router.push({ path: '/admin', query: { tab: 'registration' } })
        } catch {
          // Ignore navigation errors (e.g. duplicate route).
        }
        return
      }

      const meetingId = this.getNotificationMeetingId(notif)
      if (meetingId) {
        try {
          await this.$router.push(`/meetings/${meetingId}`)
        } catch {
          // Ignore navigation errors (e.g. duplicate route).
        }
        return
      }

      if (!notif.channel_id) return

      try {
        const meeting = await this.meetingsStore.findMeetingByChatChannelId(notif.channel_id)
        if (meeting?.id) {
          await this.$router.push(`/meetings/${meeting.id}`)
          return
        }
        await this.$router.push({
          path: `/channels/${notif.channel_id}`,
          query: notif.message_id ? { message: notif.message_id } : {}
        })
      } catch {
        // Ignore navigation errors (e.g. duplicate route).
      }
    },
    async openMeetingInvite(notif) {
      await this.openNotification(notif)
    },
    async joinMeetingInviteCall(notif) {
      const meetingId = this.getNotificationMeetingId(notif)
      if (!meetingId || this.joiningMeetingById[meetingId]) return

      const meeting = await this.meetingsStore.ensureMeetingLoaded(meetingId).catch(() => null)
      if (!meeting || meeting.status !== 'active' || this.voiceStore.channelId === meeting.chat_channel_id) {
        return
      }

      this.joiningMeetingById = {
        ...this.joiningMeetingById,
        [meetingId]: true
      }

      await this.markNotificationRead(notif)
      this.notificationsStore.showPanel = false

      try {
        await this.meetingsStore.join(meetingId)
        await this.$router.push(`/meetings/${meetingId}`).catch(() => {})
      } catch {
        window.$message?.error(this.$t('ui.components.could_not_join_call'))
      } finally {
        const next = { ...this.joiningMeetingById }
        delete next[meetingId]
        this.joiningMeetingById = next
      }
    },
    async markAll() {
      try {
        await this.notificationsStore.markAllRead()
      } catch {
        window.$message?.error(this.$t('ui.components.marking_failed'))
      }
    },
    async togglePush(enabled) {
      this.pushLoading = true
      try {
        if (enabled) {
          await this.notificationsStore.enableNotifications()
          window.$message?.success(this.isDesktopMode
            ? 'Desktop notifications enabled'
            : this.$t('ui.components.browser_notifications_enabled'))
        } else {
          await this.notificationsStore.disableNotifications()
          window.$message?.info(this.isDesktopMode
            ? 'Desktop notifications disabled'
            : this.$t('ui.components.browser_notifications_disabled'))
        }
      } catch (error) {
        if (error.message === 'BRAVE_SETUP') {
          this.showBraveInstructions()
        } else if (error.message === 'PERMISSION_TIMEOUT') {
          this.showPermissionTimeoutHelp()
        } else {
          window.$message?.error(error.message || this.$t('ui.components.web_push_error'))
        }
      } finally {
        this.pushLoading = false
      }
    },
    showPermissionTimeoutHelp() {
      window.$dialog?.warning({
        title: this.$t('ui.components.permission_not_granted'),
        content: () => h('div', { style: 'line-height: 1.8; font-size: 13px; margin-top: 8px' }, [
          h('p', { style: 'margin: 0 0 10px 0' },
            this.$t('ui.components.the_browser_did_not_show_the_permission_prompt')
          ),
          h('div', { style: 'margin-bottom: 6px' }, [
            h('strong', 'Edge: '),
            this.$t('ui.components.open'),
            h('strong', { style: 'color: rgb(99, 226, 183)' }, 'edge://settings/content/notifications'),
            this.$t('ui.components.and_disable_quiet_notification_requests')
          ]),
          h('div', { style: 'margin-bottom: 6px' }, [
            h('strong', 'Windows: '),
            this.$t('ui.components.settings_system_notifications_ensure_your_browser_is_enabled')
          ]),
          h('p', { style: 'opacity: 0.6; margin: 10px 0 0 0; font-size: 12px' },
            this.$t('ui.components.then_try_again')
          )
        ]),
        positiveText: this.$t('ui.components.understood'),
        style: 'max-width: 460px'
      })
    },
    showBraveInstructions() {
      window.$dialog?.info({
        title: this.$t('ui.components.enable_push_notifications_in_brave'),
        content: () => {
          const steps = [
            ['1.', this.$t('ui.components.open_2'), 'brave://settings/privacy', this.$t('ui.components.in_a_new_tab')],
            ['2.', this.$t('ui.components.search_for'), '"Use Google services for push messaging"', ''],
            ['3.', this.$t('ui.components.turn_the_toggle'), this.$t('ui.components.on'), ''],
            ['4.', this.$t('ui.components.brave_will_request_a'), this.$t('ui.components.restart'), this.$t('ui.components.confirm_it')],
            ['5.', this.$t('ui.components.come_back_and_enable_push_again'), '', '']
          ]
          return h('div', { style: 'line-height: 1.8; font-size: 13px; margin-top: 8px' }, [
            h('p', { style: 'opacity: 0.7; margin: 0 0 12px 0' },
              this.$t('ui.components.brave_blocks_google_push_services_by_default_enable')
            ),
            ...steps.map(([num, text, bold, rest]) =>
              h('div', { style: 'padding: 2px 0' }, [
                h('strong', num + ' '),
                text + ' ',
                bold ? h('strong', { style: 'color: rgb(99, 226, 183)' }, bold) : null,
                rest ? ' ' + rest : null
              ])
            ),
            h('p', { style: 'opacity: 0.5; margin: 12px 0 0 0; font-size: 12px' },
              this.$t('ui.components.push_data_is_end_to_end_encrypted_google')
            )
          ])
        },
        positiveText: this.$t('ui.components.understood'),
        style: 'max-width: 480px'
      })
    }
  }
}
</script>

<style scoped>
.empty-notifs {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}

.notif-item {
  padding: 10px 12px;
  border-bottom: 1px solid var(--app-border-soft);
  border-radius: 4px;
  transition: background 0.15s;
}

.notif-item:last-child {
  border-bottom: none;
}

.notif-item-clickable {
  cursor: pointer;
}

.notif-item:hover {
  background: var(--app-surface-muted);
}

.notif-item.unread {
  border-left: 3px solid var(--n-color-warning, #f0a020);
  padding-left: 9px;
}

.notif-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.notif-actor {
  font-weight: 600;
  font-size: 13px;
}

.notif-time {
  font-size: 11px;
  opacity: 0.5;
  margin-left: auto;
}

.notif-body {
  padding-left: 32px;
}

.notif-meeting-card-wrap {
  margin-top: 2px;
}

.notif-channel {
  font-size: 11px;
  opacity: 0.5;
  display: block;
  margin-bottom: 2px;
}

.notif-snippet {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.push-toggle {
  padding: 8px 4px;
}
</style>
