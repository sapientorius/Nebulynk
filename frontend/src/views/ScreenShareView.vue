<template>
  <div class="screen-share-view" data-testid="screen-share-view">
    <header class="screen-share-topbar">
      <div>
        <div class="title">{{ contextTitle }}</div>
        <div class="subtitle">
          {{ activeShare ? presenterLabel : $t('ui.views.screen_share_window_idle') }}
        </div>
      </div>
      <n-space :size="8">
        <n-button quaternary size="small" @click="goBack">
          {{ backLabel }}
        </n-button>
      </n-space>
    </header>

    <main class="screen-share-body">
      <MeetingScreenSharePanel
        v-if="contextChannelId"
        :meeting="isMeetingRoute ? meeting : null"
        :channel-id="contextChannelId"
        :share-available="shareAvailable"
        :empty-state-message="emptyStateLabel"
        :test-id-prefix="isMeetingRoute ? 'meeting' : 'voice'"
        mode="windowed"
        :show-idle-state="true"
      />
      <n-empty v-else :description="emptyViewLabel" />
    </main>
  </div>
</template>

<script>
import { defineAsyncComponent } from 'vue'
import { useChannelsStore } from '../stores/channels.js'
import { useMeetingsStore } from '../stores/meetings.js'
import { useSessionStore } from '../stores/session.js'
import { useVoiceStore } from '../stores/voice.js'

const MeetingScreenSharePanel = defineAsyncComponent(() => import('../components/MeetingScreenSharePanel.vue'))

export default {
  name: 'ScreenShareView',
  components: {
    MeetingScreenSharePanel
  },
  computed: {
    channelsStore() {
      return useChannelsStore()
    },
    meetingsStore() {
      return useMeetingsStore()
    },
    sessionStore() {
      return useSessionStore()
    },
    voiceStore() {
      return useVoiceStore()
    },
    isMeetingRoute() {
      return !!this.$route.params.meetingId
    },
    meeting() {
      return this.meetingsStore.activeMeeting
    },
    channel() {
      const channelId = this.$route.params.channelId
      if (!channelId) return null
      return this.channelsStore.channels.find((entry) => entry.id === channelId) || null
    },
    contextChannelId() {
      if (this.isMeetingRoute) return this.meeting?.chat_channel_id || null
      return this.channel?.id || this.$route.params.channelId || null
    },
    contextTitle() {
      if (this.isMeetingRoute) {
        if (!this.meeting) return this.$t('ui.views.share_window')
        return this.meetingsStore.resolveDisplayName(this.meeting)
      }
      return this.channel?.name || this.$t('ui.views.share_window')
    },
    backLabel() {
      return this.isMeetingRoute ? this.$t('ui.views.back_to_meeting') : this.$t('ui.views.back_to_chat')
    },
    shareAvailable() {
      return !!this.contextChannelId
        && this.voiceStore.channelId === this.contextChannelId
        && this.voiceStore.connected
    },
    emptyStateLabel() {
      if (this.isMeetingRoute && (!this.meeting || this.meeting.status !== 'active')) {
        return this.$t('ui.views.screen_share_unavailable')
      }
      if (!this.shareAvailable) {
        return this.$t('ui.views.join_call_to_share_screen')
      }
      if (this.voiceStore.screenShareError) {
        return this.voiceStore.screenShareError
      }
      return this.$t('ui.views.screen_share_empty')
    },
    emptyViewLabel() {
      return this.isMeetingRoute ? this.$t('ui.views.meeting_not_found') : this.$t('ui.components.unknown_channel')
    },
    activeShare() {
      return this.voiceStore.activeScreenShare
    },
    presenterLabel() {
      const name = this.activeShare?.participantName || this.$t('ui.components.unknown')
      return this.$t('ui.views.screen_share_presented_by', { name })
    }
  },
  async created() {
    await this.sessionStore.init()
    await this.loadContext()
  },
  watch: {
    '$route.fullPath': {
      immediate: false,
      async handler() {
        await this.loadContext()
      }
    }
  },
  methods: {
    async loadContext() {
      const meetingId = this.$route.params.meetingId
      if (meetingId) {
        await this.loadMeeting(meetingId)
      }
    },
    async loadMeeting(meetingId) {
      try {
        await this.meetingsStore.setActive(meetingId)
      } catch {
        window.$message?.error(this.$t('ui.views.meeting_could_not_be_loaded'))
      }
    },
    goBack() {
      if (this.isMeetingRoute && this.meeting?.id) {
        this.$router.push(`/meetings/${this.meeting.id}`)
        return
      }
      if (this.$route.params.channelId) {
        this.$router.push(`/channels/${this.$route.params.channelId}`)
        return
      }
      this.$router.push('/channels')
    }
  }
}
</script>

<style scoped>
.screen-share-view {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at top, rgba(99, 226, 183, 0.12), transparent 40%),
    rgba(8, 10, 16, 1);
}

.screen-share-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.title {
  font-size: 16px;
  font-weight: 700;
}

.subtitle {
  font-size: 12px;
  opacity: 0.72;
  margin-top: 3px;
}

.screen-share-body {
  flex: 1;
  min-height: 0;
}
</style>
