<template>
  <div class="reaction-bar" v-if="reactions.length > 0">
    <span
      v-for="reaction in reactions"
      :key="reaction.emoji"
      class="reaction-pill"
      :class="{ 'own-reaction': hasReacted(reaction) }"
      :title="reactionTooltip(reaction)"
      @click="toggleReaction(reaction)"
    >
      {{ reaction.emoji }} {{ reaction.count }}
    </span>
    <n-popover
      trigger="click"
      placement="top"
      :show-arrow="false"
      v-model:show="showPicker"
    >
      <template #trigger>
        <span class="reaction-add" v-if="canReact" :title="$t('ui.components.add_reaction')">
          <n-icon size="14"><add-icon /></n-icon>
        </span>
      </template>
      <EmojiPicker @select="onEmojiSelect" />
    </n-popover>
  </div>
</template>

<script>
import { AddOutline as AddIcon } from '@vicons/ionicons5'
import EmojiPicker from './EmojiPicker.vue'
import { useSessionStore, useChannelsStore, useMessageOpsStore } from '../stores/index.js'

export default {
  name: 'ReactionBar',
  components: { EmojiPicker, AddIcon },
  props: {
    message: { type: Object, required: true }
  },
  data() {
    return {
      showPicker: false
    }
  },
  computed: {
    sessionStore() {
      return useSessionStore()
    },
    channelsStore() {
      return useChannelsStore()
    },
    messageOpsStore() {
      return useMessageOpsStore()
    },
    reactions() {
      return this.message.reactions || []
    },
    canReact() {
      return this.channelsStore.can('send_messages')
    }
  },
  methods: {
    hasReacted(reaction) {
      return reaction.users?.some((u) => u.user_id === this.sessionStore.user?.id)
    },
    reactionTooltip(reaction) {
      const names = reaction.users?.map((u) => u.display_name) || []
      return names.join(', ')
    },
    async toggleReaction(reaction) {
      try {
        await this.messageOpsStore.toggleReaction({
          message: this.message,
          currentUserId: this.sessionStore.user?.id,
          emoji: reaction.emoji
        })
      } catch (error) {
        console.error('Failed to toggle reaction:', error)
      }
    },
    async onEmojiSelect(emoji) {
      this.showPicker = false
      try {
        await this.messageOpsStore.addReaction(this.message.id, emoji)
      } catch (error) {
        console.error('Failed to add reaction:', error)
      }
    }
  }
}
</script>

<style scoped>
.reaction-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding-left: 40px;
  margin-top: 4px;
}

.reaction-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 13px;
  background: var(--app-surface-muted);
  border: 1px solid var(--app-border-soft);
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}

.reaction-pill:hover {
  background: var(--app-hover);
}

.reaction-pill.own-reaction {
  background: rgba(var(--theme-primary-rgb), 0.15);
  border-color: rgba(var(--theme-primary-rgb), 0.4);
}

.reaction-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 12px;
  background: var(--app-surface);
  border: 1px solid var(--app-border-soft);
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s;
}

.reaction-bar:hover .reaction-add,
.reaction-add:focus-within {
  opacity: 1;
}

.reaction-add:hover {
  background: var(--app-hover);
}
</style>
