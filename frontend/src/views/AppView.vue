<template>
  <div class="workspace-context" data-testid="app-view">
    <div class="main-area" :class="{ 'share-maximized': shareMaximized }">
      <div class="channel-header-bar" v-if="activeChannelId">
        <ChannelHeader
          :right-panel-mode="rightPanelMode"
          @toggle-members="$emit('toggle-members')"
          @toggle-past-meetings="$emit('toggle-past-meetings')"
        />
      </div>

      <div
        v-if="showVoiceShareControls"
        class="channel-share-toolbar"
        :class="{ maximized: shareMaximized }"
        data-testid="voice-screen-share-toolbar"
      >
        <div class="channel-share-copy">
          <div class="channel-share-title">{{ $t('ui.views.screen_share') }}</div>
          <div class="channel-share-subtitle">{{ activeVoiceChannel?.name || $t('ui.components.unknown_channel') }}</div>
        </div>

        <ScreenShareControls
          :channel-id="activeVoiceChannel?.id || null"
          :can-start="canShowIdleShareControl"
          :share-hidden="isShareHidden"
          test-id-prefix="voice"
        />
      </div>

      <div v-if="shouldShowSharePanel" class="share-panel-wrap" :class="{ maximized: shareMaximized }">
        <MeetingScreenSharePanel
          :channel-id="activeVoiceChannel?.id || null"
          :share-available="shareAvailable"
          :empty-state-message="screenShareEmptyStateLabel"
          test-id-prefix="voice"
          :maximized="shareMaximized"
          :show-idle-state="shareAvailable"
          :can-toggle-maximize="hasActiveShare"
          :can-open-window="hasActiveShare"
          :can-hide="hasActiveShare"
          :show-chat-toggle="shareMaximized"
          :share-chat-open="shareChatOpen"
          @hide="hideActiveShare"
          @toggle-chat="toggleShareChat"
          @toggle-maximize="toggleShareMaximized"
          @open-window="openScreenShareWindow"
        />
      </div>

      <div v-if="!shareMaximized" class="content-area">
        <div
          class="chat-area"
          v-if="activeChannelId"
          @dragenter.prevent="onDragEnter"
          @dragover.prevent
          @dragleave.prevent="onDragLeave"
          @drop.prevent="onDrop"
        >
          <div class="drop-overlay" v-if="dragging">
            <div class="drop-overlay-text">{{ $t('app.dropFileHint') }}</div>
          </div>
          <MessageList />
          <MessageInput ref="messageInput" />
        </div>
        <div class="no-channel" v-else>
          <n-empty :description="$t('app.emptyChannel')" />
        </div>
        <aside class="member-panel" v-if="showRightPanel && activeChannelId && !shareMaximized">
          <MemberList v-if="rightPanelMode === 'members'" />
          <ChannelPastMeetingsPanel
            v-else-if="rightPanelMode === 'pastMeetings'"
            :channel-id="activeChannelId"
          />
        </aside>
      </div>

      <ScreenShareChatOverlay
        :active="shareMaximized && !!activeVoiceChannel"
        :chat-open="shareChatOpen"
        :title="$t('ui.views.back_to_chat')"
        test-id-prefix="voice"
        @toggle-chat="toggleShareChat"
      >
        <MessageList />
        <MessageInput />
      </ScreenShareChatOverlay>
    </div>
  </div>
</template>

<script>
import { defineAsyncComponent } from 'vue'
import { openDetachedScreenShareWindow } from '../lib/screen-share.js'
import {
  useChannelsStore,
  useDmsStore,
  useMessagesStore,
  useMeetingsStore,
  useUiStore
} from '../stores/index.js'
import { useVoiceStore } from '../stores/voice.js'

const ChannelHeader = defineAsyncComponent(() => import('../components/ChannelHeader.vue'))
const MeetingScreenSharePanel = defineAsyncComponent(() => import('../components/MeetingScreenSharePanel.vue'))
const MessageList = defineAsyncComponent(() => import('../components/MessageList.vue'))
const MessageInput = defineAsyncComponent(() => import('../components/MessageInput.vue'))
const MemberList = defineAsyncComponent(() => import('../components/MemberList.vue'))
const ChannelPastMeetingsPanel = defineAsyncComponent(() => import('../components/ChannelPastMeetingsPanel.vue'))
const ScreenShareChatOverlay = defineAsyncComponent(() => import('../components/ScreenShareChatOverlay.vue'))
const ScreenShareControls = defineAsyncComponent(() => import('../components/ScreenShareControls.vue'))

export default {
  name: 'AppView',
  components: {
    ChannelPastMeetingsPanel,
    ChannelHeader,
    MeetingScreenSharePanel,
    MemberList,
    MessageInput,
    MessageList,
    ScreenShareChatOverlay,
    ScreenShareControls
  },
  emits: ['toggle-members', 'toggle-past-meetings'],
  props: {
    showMembers: {
      type: Boolean,
      default: false
    },
    rightPanelMode: {
      type: String,
      default: 'closed'
    }
  },
  data() {
    return {
      routeReady: false,
      dragging: false,
      dragCounter: 0
    }
  },
  computed: {
    channelsStore() {
      return useChannelsStore()
    },
    dmsStore() {
      return useDmsStore()
    },
    messagesStore() {
      return useMessagesStore()
    },
    meetingsStore() {
      return useMeetingsStore()
    },
    voiceStore() {
      return useVoiceStore()
    },
    uiStore() {
      return useUiStore()
    },
    channels() {
      return this.channelsStore.channels
    },
    activeChannelId() {
      return this.channelsStore.activeChannelId
    },
    activeChannel() {
      return this.channelsStore.channels.find((channel) => channel.id === this.activeChannelId) || null
    },
    showRightPanel() {
      return this.rightPanelMode === 'members' || this.rightPanelMode === 'pastMeetings'
    },
    rightPanelWidth() {
      if (this.rightPanelMode === 'pastMeetings') {
        return 340
      }
      return 248
    },
    activeVoiceChannel() {
      if (!this.activeChannel?.is_voice || this.activeChannel?.purpose === 'meeting') return null
      return this.activeChannel
    },
    shareAvailable() {
      return !!this.activeVoiceChannel
        && this.voiceStore.channelId === this.activeVoiceChannel.id
        && this.voiceStore.connected
    },
    channelShares() {
      if (!this.activeVoiceChannel?.id) return []
      return this.voiceStore.screenSharesByChannel[this.activeVoiceChannel.id] || []
    },
    activeShare() {
      return this.channelShares[0] || null
    },
    hasActiveShare() {
      return !!this.activeShare
    },
    isLocalActiveShare() {
      return !!this.activeShare?.isLocal
    },
    shouldShowSharePanel() {
      return this.shareAvailable
        && (this.uiStore.screenSharePanelVisible || (this.hasActiveShare && !this.uiStore.hideScreenSharePanel))
    },
    isShareHidden() {
      return this.hasActiveShare && !this.shouldShowSharePanel
    },
    shareMaximized() {
      return this.shareAvailable && this.uiStore.maximizeScreenShare
    },
    shareChatOpen() {
      return this.shareMaximized && this.uiStore.showScreenShareChat
    },
    showVoiceShareControls() {
      return !!this.activeVoiceChannel && (this.shareAvailable || this.hasActiveShare)
    },
    canShowIdleShareControl() {
      return this.shareAvailable && !this.hasActiveShare
    },
    screenShareEmptyStateLabel() {
      if (!this.activeVoiceChannel) {
        return this.$t('ui.views.screen_share_unavailable')
      }
      if (!this.shareAvailable) {
        return this.$t('ui.views.join_call_to_share_screen')
      }
      if (this.voiceStore.screenShareError) {
        return this.voiceStore.screenShareError
      }
      return this.$t('ui.views.screen_share_empty')
    }
  },
  async created() {
    const channelId = this.$route.params.channelId
    if (channelId) {
      const redirectedToMeeting = await this.redirectMeetingChannelRoute(channelId)
      if (redirectedToMeeting) {
        this.routeReady = true
        return
      }
    }

    const knownChannel = this.channelsStore.isKnownTextChannel(channelId)
      || this.dmsStore.dmChannels.some((dmChannel) => dmChannel.id === channelId)

    if (channelId && knownChannel) {
      await this.channelsStore.select(channelId)
      await this.syncRouteMessageHighlight(channelId)
    } else {
      const firstId = this.channelsStore.firstUnarchivedChannelId()
      if (firstId) {
        await this.channelsStore.select(firstId)
        this.$router.replace(`/channels/${firstId}`)
        await this.syncRouteMessageHighlight(firstId)
      }
    }

    this.routeReady = true
  },
  watch: {
    activeChannelId(newId) {
      if (!this.routeReady || !this.isAppRoute()) return
      if (newId && this.$route.params.channelId !== newId) {
        this.$router.push(`/channels/${newId}`).catch(() => {})
      }
    },
    shareMaximized(value) {
      if (!value && this.shareChatOpen) {
        this.uiStore.setScreenShareChatVisible(false)
      }
    },
    '$route.params.channelId'(newId) {
      if (!this.routeReady || !newId) return

      this.redirectMeetingChannelRoute(newId).then((redirectedToMeeting) => {
        if (redirectedToMeeting) return

        const known = this.channelsStore.isKnownTextChannel(newId)
          || this.dmsStore.dmChannels.some((dmChannel) => dmChannel.id === newId)

        if (newId !== this.channelsStore.activeChannelId && known) {
          this.channelsStore.select(newId).then(() => this.syncRouteMessageHighlight(newId))
          return
        }

        if (!known) {
          const fallbackId = this.channelsStore.firstUnarchivedChannelId()
          if (fallbackId) {
            this.channelsStore.select(fallbackId).then(() => this.syncRouteMessageHighlight(fallbackId))
            this.$router.replace(`/channels/${fallbackId}`).catch(() => {})
          } else {
            this.channelsStore.clearActiveContext()
            this.$router.replace('/channels').catch(() => {})
          }
          return
        }

        this.syncRouteMessageHighlight(newId)
      }).catch(() => {})
    },
    '$route.query.message'() {
      if (!this.routeReady || !this.isAppRoute()) return
      this.syncRouteMessageHighlight(this.channelsStore.activeChannelId)
    },
    hasActiveShare(value) {
      if (!value && this.activeVoiceChannel) {
        this.uiStore.resetScreenShareVisibility()
      }
    },
    channels: {
      deep: true,
      async handler() {
        if (!this.routeReady || !this.isAppRoute() || !this.channelsStore.activeChannelId) return
        const active = this.channelsStore.channels.find((channel) => channel.id === this.channelsStore.activeChannelId)
        if (!active || !active.is_archived) return

        const fallbackId = this.channelsStore.firstUnarchivedChannelId()
        this.channelsStore.clearActiveContext()
        if (fallbackId) {
          await this.channelsStore.select(fallbackId)
          await this.syncRouteMessageHighlight(fallbackId)
        } else {
          this.$router.replace('/channels').catch(() => {})
        }
      }
    }
  },
  methods: {
    isAppRoute() {
      return this.$route.name === 'App'
    },
    async redirectMeetingChannelRoute(channelId) {
      if (!channelId) return false

      const channel = this.channelsStore.channels.find((entry) => entry.id === channelId)
      const isMeetingChannel = channel?.purpose === 'meeting' || this.meetingsStore.hasMeetingChatChannel(channelId)
      if (!isMeetingChannel) return false

      const meeting = await this.meetingsStore.findMeetingByChatChannelId(channelId)
      if (!meeting?.id) return false

      await this.$router.replace(`/meetings/${meeting.id}`)
      return true
    },
    async syncRouteMessageHighlight(channelId) {
      const messageId = typeof this.$route.query.message === 'string'
        ? this.$route.query.message
        : null
      this.messagesStore.setHighlightedMessage(messageId)
      if (!channelId || !messageId) return
      const message = await this.messagesStore.loadAroundMessage(messageId, { channelId })
      if (message?.channel_id && message.channel_id !== channelId) {
        await this.$router.replace(`/channels/${message.channel_id}?message=${message.id}`).catch(() => {})
      }
    },
    hideActiveShare() {
      this.uiStore.closeScreenSharePanel()
    },
    toggleShareMaximized() {
      this.uiStore.setScreenShareMaximized(!this.shareMaximized)
    },
    toggleShareChat() {
      if (!this.shareMaximized) return
      this.uiStore.setScreenShareChatVisible(!this.shareChatOpen)
    },
    openScreenShareWindow() {
      if (!this.activeVoiceChannel?.id) return
      openDetachedScreenShareWindow({
        router: this.$router,
        uiStore: this.uiStore,
        type: 'channel',
        id: this.activeVoiceChannel.id
      })
    },
    onDragEnter() {
      this.dragCounter++
      this.dragging = true
    },
    onDragLeave() {
      this.dragCounter--
      if (this.dragCounter <= 0) {
        this.dragging = false
        this.dragCounter = 0
      }
    },
    async onDrop(event) {
      this.dragging = false
      this.dragCounter = 0
      const files = Array.from(event.dataTransfer?.files || [])
      if (files.length === 0 || !this.channelsStore.activeChannelId) return

      await this.$refs.messageInput?.processDroppedFiles(files)
    }
  }
}
</script>

<style scoped>
.workspace-context,
.main-area {
  flex: 1;
  display: flex;
  min-width: 0;
  overflow: hidden;
}

.main-area {
  flex-direction: column;
  position: relative;
}

.main-area.share-maximized {
  background: transparent;
}

.channel-header-bar {
  border-bottom: 1px solid var(--app-border);
  flex-shrink: 0;
}

.channel-share-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--app-border);
  background:
    linear-gradient(135deg, var(--app-primary-soft), var(--app-primary-softer)),
    var(--app-surface);
}

.channel-share-toolbar.maximized {
  display: none;
}

.channel-share-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.channel-share-title {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.channel-share-subtitle {
  font-size: 12px;
  opacity: 0.75;
}

.share-panel-wrap {
  flex-shrink: 0;
}

.share-panel-wrap.maximized {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.content-area {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  position: relative;
}

.no-channel {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}

.member-panel {
  width: v-bind('`${rightPanelWidth}px`');
  flex-shrink: 0;
  border-left: 1px solid var(--app-border);
  overflow-y: auto;
}

.drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  background: var(--app-drop-bg);
  border: 2px dashed var(--app-drop-border);
  border-radius: 8px;
  display: flex;
  justify-content: center;
  align-items: center;
  pointer-events: none;
}

.drop-overlay-text {
  font-size: 18px;
  font-weight: 600;
  color: var(--theme-primary);
  opacity: 0.9;
}

@media (max-width: 900px) {
  .channel-share-toolbar {
    align-items: flex-start;
    flex-wrap: wrap;
    padding: 10px 12px;
  }

  .content-area {
    min-width: 0;
  }

}
</style>
