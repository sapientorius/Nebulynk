<template>
  <template v-if="active">
    <div class="share-chat-toggle-wrap" :class="{ hidden: chatOpen }">
      <n-button
        v-if="!chatOpen"
        class="share-chat-peek-toggle"
        round
        size="small"
        :data-testid="testId('show-screen-share-chat-peek')"
        @click="$emit('toggle-chat')"
      >
        {{ $t('ui.views.show_screen_share_chat') }}
      </n-button>
    </div>

    <div
      v-if="chatOpen"
      class="share-chat-overlay"
      :data-testid="testId('screen-share-chat-overlay')"
    >
      <div class="share-chat-overlay-header">
        <div class="share-chat-overlay-title">{{ title }}</div>
        <n-button
          quaternary
          size="small"
          :data-testid="testId('hide-screen-share-chat-overlay')"
          @click="$emit('toggle-chat')"
        >
          {{ $t('ui.views.hide_screen_share_chat') }}
        </n-button>
      </div>
      <div class="share-chat-overlay-body">
        <slot />
      </div>
    </div>
  </template>
</template>

<script>
export default {
  name: 'ScreenShareChatOverlay',
  emits: ['toggle-chat'],
  props: {
    active: {
      type: Boolean,
      default: false
    },
    chatOpen: {
      type: Boolean,
      default: false
    },
    title: {
      type: String,
      required: true
    },
    testIdPrefix: {
      type: String,
      default: 'meeting'
    }
  },
  methods: {
    testId(suffix) {
      return `${this.testIdPrefix}-${suffix}`
    }
  }
}
</script>

<style scoped>
.share-chat-toggle-wrap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 18px;
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: 4;
}

.share-chat-toggle-wrap.hidden {
  display: none;
}

.share-chat-peek-toggle {
  pointer-events: auto;
  background: var(--app-overlay);
  border: 1px solid var(--app-border-strong);
  box-shadow: 0 14px 28px var(--app-shadow);
  backdrop-filter: blur(18px);
}

.share-chat-overlay {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 16px;
  height: min(50vh, 420px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--app-border-strong);
  border-radius: 8px;
  background: var(--app-surface-raised);
  box-shadow: 0 22px 48px var(--app-shadow);
  backdrop-filter: blur(20px);
  overflow: hidden;
  z-index: 5;
}

.share-chat-overlay-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--app-border-soft);
  background: var(--app-surface);
  flex-shrink: 0;
}

.share-chat-overlay-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.82;
}

.share-chat-overlay-body {
  min-height: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
}

@media (max-width: 900px) {
  .share-chat-overlay {
    left: 8px;
    right: 8px;
    bottom: 8px;
    height: min(50vh, 360px);
  }
}
</style>
