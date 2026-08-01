<template>
  <div
    v-if="visible && filteredItems.length > 0"
    class="mention-autocomplete"
    :style="positionStyle"
  >
    <div
      v-for="(item, index) in filteredItems"
      :key="item.id || item.type"
      class="mention-item"
      :class="{ active: index === activeIndex }"
      @click="$emit('select', item)"
      @mouseenter="activeIndex = index"
    >
      <n-avatar v-if="item.iconComponent" :size="24" round class="mention-avatar">
        <n-icon size="14">
          <component :is="item.iconComponent" />
        </n-icon>
      </n-avatar>
      <UserAvatar v-else :size="24" class="mention-avatar" :user="item" :avatar-url="item.avatar_url" />
      <span class="mention-name">{{ item.label || item.display_name }}</span>
      <span v-if="item.description" class="mention-desc">{{ item.description }}</span>
    </div>
  </div>
</template>

<script>
import { MegaphoneOutline as MegaphoneIcon, PeopleOutline as PeopleIcon } from '@vicons/ionicons5'
import { useSessionStore, useChannelsStore } from '../stores/index.js'
import UserAvatar from './UserAvatar.vue'

export default {
  name: 'MentionAutocomplete',
  components: { MegaphoneIcon, PeopleIcon, UserAvatar },
  props: {
    visible: { type: Boolean, default: false },
    searchTerm: { type: String, default: '' },
    position: { type: Object, default: () => ({ top: 0, left: 0 }) }
  },
  emits: ['select', 'close'],
  data() {
    return {
      activeIndex: 0
    }
  },
  computed: {
    sessionStore() {
      return useSessionStore()
    },
    channelsStore() {
      return useChannelsStore()
    },
    positionStyle() {
      return {
        bottom: `${this.position.bottom || 0}px`,
        left: `${this.position.left || 0}px`
      }
    },
    memberUserIds() {
      return this.channelsStore.members.map((member) => member.user_id).filter(Boolean)
    },
    members() {
      return this.channelsStore.members.map((m) => {
        const user = this.sessionStore.getUserById(m.user_id) || {}
        return {
          id: m.user_id,
          display_name: user.display_name || this.$t('ui.components.unknown'),
          avatar_url: user.avatar_url || null,
          online: this.sessionStore.isOnline(m.user_id),
          type: 'user'
        }
      })
    },
    specialItems() {
      return [
        {
          id: '_all',
          label: '@all',
          display_name: 'all',
          description: this.$t('ui.components.notify_everyone'),
          iconComponent: PeopleIcon,
          type: 'all'
        },
        {
          id: '_channel',
          label: '@channel',
          display_name: 'channel',
          description: this.$t('ui.components.notify_channel'),
          iconComponent: MegaphoneIcon,
          type: 'channel'
        }
      ]
    },
    filteredItems() {
      const term = this.searchTerm.toLowerCase()
      const matchedMembers = this.members.filter((m) =>
        m.display_name.toLowerCase().includes(term)
      )
      const matchedSpecial = this.specialItems.filter((s) =>
        s.display_name.includes(term) || s.description.toLowerCase().includes(term)
      )
      return [...matchedSpecial, ...matchedMembers].slice(0, 10)
    }
  },
  watch: {
    searchTerm() {
      this.activeIndex = 0
    },
    visible(val) {
      if (val) this.activeIndex = 0
    },
    memberUserIds: {
      immediate: true,
      handler(userIds) {
        this.sessionStore.ensureUsersByIds(userIds).catch(() => {})
      }
    }
  },
  methods: {
    handleKeydown(event) {
      if (!this.visible) return false

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        this.activeIndex = Math.min(this.activeIndex + 1, this.filteredItems.length - 1)
        return true
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        this.activeIndex = Math.max(this.activeIndex - 1, 0)
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const selected = this.filteredItems[this.activeIndex]
        if (!selected) return false
        event.preventDefault()
        this.$emit('select', selected)
        return true
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        this.$emit('close')
        return true
      }
      return false
    }
  }
}
</script>

<style scoped>
.mention-autocomplete {
  position: absolute;
  background: var(--app-surface-raised);
  border: 1px solid var(--app-border-strong);
  border-radius: 8px;
  padding: 4px;
  min-width: 240px;
  max-width: 320px;
  max-height: 240px;
  overflow-y: auto;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.mention-item:hover,
.mention-item.active {
  background: var(--app-hover);
}

.mention-avatar {
  flex-shrink: 0;
  font-size: 12px;
}

.mention-name {
  font-weight: 500;
}

.mention-desc {
  opacity: 0.5;
  font-size: 12px;
  margin-left: auto;
}
</style>
