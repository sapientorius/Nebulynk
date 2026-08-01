<template>
  <div
    :key="avatarRenderKey"
    v-bind="$attrs"
    class="user-avatar"
    :class="{ 'user-avatar-round': round, 'user-avatar-fallback-frame': !resolvedSrc }"
    :style="avatarStyle"
  >
    <img
      v-if="resolvedSrc"
      class="user-avatar-image"
      :src="resolvedSrc"
      :alt="displayName || 'Avatar'"
      draggable="false"
    >
    <span v-else class="user-avatar-fallback">{{ initial }}</span>
  </div>
</template>

<script>
import { resolveAvatarSource } from '../lib/avatar-cache.js'

export default {
  name: 'UserAvatar',
  inheritAttrs: false,
  props: {
    user: {
      type: Object,
      default: null
    },
    name: {
      type: String,
      default: ''
    },
    avatarUrl: {
      type: String,
      default: ''
    },
    size: {
      type: Number,
      default: 24
    },
    round: {
      type: Boolean,
      default: true
    }
  },
  data() {
    return {
      resolvedSrc: null,
      lastRequestId: 0
    }
  },
  computed: {
    displayName() {
      return this.name || this.user?.display_name || this.user?.name || ''
    },
    effectiveAvatarUrl() {
      return this.avatarUrl || this.user?.avatar_url || null
    },
    avatarRenderKey() {
      return `${this.effectiveAvatarUrl || 'no-avatar'}:${this.resolvedSrc || 'pending'}`
    },
    avatarStyle() {
      return {
        width: `${this.size}px`,
        height: `${this.size}px`
      }
    },
    initial() {
      return (this.displayName || '?')[0].toUpperCase()
    }
  },
  watch: {
    avatarUrl: {
      immediate: true,
      handler() {
        this.loadAvatar()
      }
    },
    user: {
      deep: true,
      handler() {
        this.loadAvatar()
      }
    }
  },
  methods: {
    async loadAvatar() {
      const requestId = ++this.lastRequestId

      if (!this.effectiveAvatarUrl) {
        this.resolvedSrc = null
        return
      }

      try {
        const source = await resolveAvatarSource(this.effectiveAvatarUrl)
        if (requestId === this.lastRequestId) {
          this.resolvedSrc = source
        }
      } catch {
        if (requestId === this.lastRequestId) {
          this.resolvedSrc = null
        }
      }
    }
  }
}
</script>

<style scoped>
.user-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  box-sizing: border-box;
  font-weight: 700;
  user-select: none;
}

.user-avatar-fallback-frame {
  background: var(--app-avatar-bg);
  border: 1px solid var(--app-avatar-border);
  color: var(--app-avatar-text);
}

.user-avatar-round {
  border-radius: 999px;
}

.user-avatar-image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.user-avatar-fallback {
  line-height: 1;
}
</style>
