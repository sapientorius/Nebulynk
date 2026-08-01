<template>
  <div class="message-actions-root" v-bind="$attrs">
    <div class="message-actions">
      <button
        v-for="emoji in quickEmojis"
        :key="emoji"
        class="action-btn emoji-action-btn"
        :title="$t('ui.components.add_reaction')"
        data-testid="message-action-recent-emoji"
        @click="addReaction(emoji)"
      >
        <span class="quick-emoji">{{ emoji }}</span>
      </button>

      <n-popover
        v-if="!isMobileLayout"
        trigger="click"
        placement="top"
        :show-arrow="false"
        v-model:show="showEmojiPicker"
      >
        <template #trigger>
          <button
            class="action-btn"
            :title="$t('ui.components.add_reaction')"
            data-testid="message-action-emoji-picker"
          >
            <n-icon size="20"><happy-icon /></n-icon>
          </button>
        </template>
        <EmojiPicker @select="onEmojiSelect" />
      </n-popover>
      <button
        v-else
        class="action-btn"
        :title="$t('ui.components.add_reaction')"
        data-testid="message-action-emoji-picker"
        @click="openMobileEmojiSheet"
      >
        <n-icon size="20"><happy-icon /></n-icon>
      </button>

      <button
        class="action-btn"
        :title="$t('ui.components.reply')"
        data-testid="message-action-reply"
        @click="emitAction('reply')"
      >
        <n-icon size="20"><reply-icon /></n-icon>
      </button>

      <button
        v-if="isOwnMessage"
        class="action-btn"
        :title="$t('ui.components.edit')"
        data-testid="message-action-edit"
        @click="emitAction('edit')"
      >
        <n-icon size="20"><pencil-icon /></n-icon>
      </button>

      <button
        v-if="canSummarize"
        class="action-btn"
        :title="$t('ui.components.summarize_with_ai')"
        :disabled="summaryLoading"
        data-testid="message-action-summary"
        @click="emitAction('summarize')"
      >
        <n-icon size="20"><sparkles-icon /></n-icon>
      </button>

      <n-popover
        trigger="click"
        placement="top-end"
        :show-arrow="false"
        v-model:show="showOverflowMenu"
      >
        <template #trigger>
          <button
            class="action-btn overflow-trigger"
            :title="$t('ui.components.more_message_actions')"
            data-testid="message-action-overflow"
          >
            <n-icon size="20"><more-icon /></n-icon>
          </button>
        </template>

        <div class="message-action-menu" data-testid="message-action-overflow-menu">
          <div class="overflow-emoji-row">
            <button
              v-for="emoji in quickEmojis"
              :key="`overflow-${emoji}`"
              class="overflow-emoji-btn"
              :title="$t('ui.components.add_reaction')"
              @click="addReaction(emoji)"
            >
              {{ emoji }}
            </button>
          </div>

          <n-popover
            v-if="!isMobileLayout"
            trigger="click"
            placement="left"
            :show-arrow="false"
            v-model:show="showOverflowEmojiPicker"
          >
            <template #trigger>
              <button class="menu-action" type="button">
                <span class="menu-action-label">{{ $t('ui.components.add_reaction') }}</span>
                <n-icon size="20"><happy-icon /></n-icon>
              </button>
            </template>
            <EmojiPicker @select="onEmojiSelect" />
          </n-popover>
          <button
            v-else
            class="menu-action"
            type="button"
            data-testid="message-action-mobile-emoji-sheet-trigger"
            @click="openMobileEmojiSheetFromOverflow"
          >
            <span class="menu-action-label">{{ $t('ui.components.add_reaction') }}</span>
            <n-icon size="20"><happy-icon /></n-icon>
          </button>

          <div class="menu-divider" />

          <button class="menu-action" type="button" @click="emitAction('reply')">
            <span class="menu-action-label">{{ $t('ui.components.reply') }}</span>
            <n-icon size="20"><reply-icon /></n-icon>
          </button>

          <button class="menu-action" type="button" @click="emitAction('forward')">
            <span class="menu-action-label">{{ $t('ui.components.forward') }}</span>
            <n-icon size="20"><forward-icon /></n-icon>
          </button>

          <button class="menu-action" type="button" @click="copyMessageLink">
            <span class="menu-action-label">{{ $t('ui.components.copy_message_link') }}</span>
            <n-icon size="20"><link-icon /></n-icon>
          </button>

          <button
            v-if="canSummarize"
            class="menu-action"
            type="button"
            :disabled="summaryLoading"
            @click="emitAction('summarize')"
          >
            <span class="menu-action-label">{{ $t('ui.components.summarize_with_ai') }}</span>
            <n-icon size="20"><sparkles-icon /></n-icon>
          </button>

          <button v-if="canPin" class="menu-action" type="button" @click="togglePin">
            <span class="menu-action-label">
              {{ isPinned ? $t('ui.components.unpin_message') : $t('ui.components.pin_message') }}
            </span>
            <n-icon size="20"><pin-icon /></n-icon>
          </button>

          <n-popover
            v-if="!isMobileLayout"
            trigger="click"
            placement="left"
            :show-arrow="false"
            v-model:show="showReminderMenu"
            @update:show="onReminderMenuToggle"
          >
            <template #trigger>
              <button
                class="menu-action"
                type="button"
                data-testid="message-action-remind"
              >
                <span class="menu-action-label">{{ $t('ui.components.remind') }}</span>
                <n-icon size="20"><time-icon /></n-icon>
              </button>
            </template>
            <MessageReminderMenu
              v-model:custom-reminder-at="customReminderAt"
              :active-reminder="activeReminder"
              :reminder-options="reminderOptions"
              :loading="reminderLoading"
              @quick-select="setReminderIn"
              @save="setCustomReminder"
              @remove="removeReminder"
            />
          </n-popover>

          <button
            v-else
            class="menu-action"
            type="button"
            data-testid="message-action-remind"
            @click="openMobileReminderSheet"
          >
            <span class="menu-action-label">{{ $t('ui.components.remind') }}</span>
            <n-icon size="20"><time-icon /></n-icon>
          </button>

          <button v-if="isOwnMessage" class="menu-action" type="button" @click="emitAction('edit')">
            <span class="menu-action-label">{{ $t('ui.components.edit') }}</span>
            <n-icon size="20"><pencil-icon /></n-icon>
          </button>

          <template v-if="canDelete">
            <div class="menu-divider" />
            <n-popconfirm
              :positive-text="$t('ui.components.delete_message_confirm')"
              :negative-text="$t('ui.components.admin.cancel')"
              :positive-button-props="{ 'data-testid': 'message-action-confirm-delete' }"
              @positive-click="confirmDelete"
            >
              <template #trigger>
                <button
                  class="menu-action danger"
                  type="button"
                  data-testid="message-action-delete"
                >
                  <span class="menu-action-label">{{ $t('ui.components.admin.delete') }}</span>
                  <n-icon size="20"><trash-icon /></n-icon>
                </button>
              </template>
              <div class="delete-confirm-copy">
                <strong>{{ $t('ui.components.delete_message_confirm_title') }}</strong>
                <span>{{ $t('ui.components.delete_message_confirm_body') }}</span>
              </div>
            </n-popconfirm>
          </template>
        </div>
      </n-popover>
    </div>

    <n-modal
      v-model:show="showMobileEmojiSheet"
      :mask-closable="true"
      :auto-focus="false"
      transform-origin="center"
      @after-leave="syncPopoverState"
    >
      <div class="mobile-emoji-sheet" data-testid="message-action-mobile-emoji-sheet">
        <div class="mobile-emoji-sheet-header">
          <span class="mobile-emoji-sheet-title">{{ $t('ui.components.add_reaction') }}</span>
          <button
            class="mobile-emoji-sheet-close"
            type="button"
            :title="$t('ui.components.admin.cancel')"
            data-testid="message-action-mobile-emoji-sheet-close"
            @click="closeMobileEmojiSheet"
          >
            <n-icon size="22"><close-icon /></n-icon>
          </button>
        </div>
        <EmojiPicker @select="onEmojiSelect" />
      </div>
    </n-modal>

    <n-modal
      v-if="isMobileLayout"
      v-model:show="showMobileReminderSheet"
      :mask-closable="true"
      :auto-focus="false"
      transform-origin="center"
      @after-leave="syncPopoverState"
    >
      <div class="mobile-reminder-sheet" data-testid="message-reminder-mobile-sheet">
        <div class="mobile-reminder-sheet-header">
          <span class="mobile-reminder-sheet-title">{{ $t('ui.components.remind') }}</span>
          <button
            class="mobile-reminder-sheet-close"
            type="button"
            :title="$t('ui.components.admin.cancel')"
            data-testid="message-reminder-mobile-close"
            @click="closeMobileReminderSheet"
          >
            <n-icon size="22"><close-icon /></n-icon>
          </button>
        </div>
        <MessageReminderMenu
          v-model:custom-reminder-at="customReminderAt"
          :active-reminder="activeReminder"
          :reminder-options="reminderOptions"
          :loading="reminderLoading"
          date-picker-to="body"
          :show-title="false"
          @quick-select="setReminderIn"
          @save="setCustomReminder"
          @remove="removeReminder"
        />
      </div>
    </n-modal>
  </div>
</template>

<script>
import {
  CloseOutline as CloseIcon,
  EllipsisHorizontal as MoreIcon,
  HappyOutline as HappyIcon,
  PinOutline as PinIcon,
  PencilOutline as PencilIcon,
  TrashOutline as TrashIcon,
  ReturnUpBackOutline as ReplyIcon,
  ShareSocialOutline as ForwardIcon,
  LinkOutline as LinkIcon,
  SparklesOutline as SparklesIcon,
  TimeOutline as TimeIcon
} from '@vicons/ionicons5'
import EmojiPicker from './EmojiPicker.vue'
import MessageReminderMenu from './MessageReminderMenu.vue'
import { useSessionStore, useChannelsStore, useMessagesStore, useMessageOpsStore, useMessageRemindersStore } from '../stores/index.js'
import { buildMessageUrl } from '../lib/message-links.js'
import { loadRecentEmojis, saveRecentEmoji } from '../lib/recent-emojis.js'
import { observeMobileLayout, readIsMobileLayout } from '../lib/mobile-layout.js'

const DEFAULT_QUICK_EMOJIS = ['\u{1F44D}', '\u{1F680}', '\u{1F600}']
const QUICK_EMOJI_COUNT = 3
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export default {
  name: 'MessageActions',
  inheritAttrs: false,
  components: {
    EmojiPicker,
    MessageReminderMenu,
    CloseIcon,
    MoreIcon,
    HappyIcon,
    PinIcon,
    PencilIcon,
    TrashIcon,
    ReplyIcon,
    ForwardIcon,
    LinkIcon,
    SparklesIcon,
    TimeIcon
  },
  props: {
    message: { type: Object, required: true },
    canSummarize: { type: Boolean, default: false },
    summaryLoading: { type: Boolean, default: false }
  },
  emits: ['edit', 'delete', 'reply', 'forward', 'summarize', 'popover-change'],
  data() {
    return {
      recentEmojis: [],
      showEmojiPicker: false,
      showOverflowMenu: false,
      showOverflowEmojiPicker: false,
      showReminderMenu: false,
      showMobileEmojiSheet: false,
      showMobileReminderSheet: false,
      isMobileLayout: readIsMobileLayout(),
      stopObservingMobileLayout: null,
      reminderLoading: false,
      customReminderAt: null
    }
  },
  computed: {
    sessionStore() {
      return useSessionStore()
    },
    channelsStore() {
      return useChannelsStore()
    },
    messagesStore() {
      return useMessagesStore()
    },
    messageOpsStore() {
      return useMessageOpsStore()
    },
    messageRemindersStore() {
      return useMessageRemindersStore()
    },
    reminderOptions() {
      return [
        { key: '1h', ms: HOUR_MS, labelKey: 'ui.components.reminder_1h' },
        { key: '4h', ms: 4 * HOUR_MS, labelKey: 'ui.components.reminder_4h' },
        { key: '1d', ms: DAY_MS, labelKey: 'ui.components.reminder_1d' },
        { key: '2d', ms: 2 * DAY_MS, labelKey: 'ui.components.reminder_2d' },
        { key: '5d', ms: 5 * DAY_MS, labelKey: 'ui.components.reminder_5d' }
      ]
    },
    activeReminder() {
      return this.messageRemindersStore.getActiveReminder(this.message.id)
    },
    quickEmojis() {
      const seen = new Set()
      const emojis = []
      for (const emoji of [...this.recentEmojis, ...DEFAULT_QUICK_EMOJIS]) {
        if (!emoji || seen.has(emoji)) continue
        seen.add(emoji)
        emojis.push(emoji)
        if (emojis.length >= QUICK_EMOJI_COUNT) break
      }
      return emojis
    },
    isOwnMessage() {
      return this.message.user_id === this.sessionStore.user?.id
    },
    canPin() {
      return this.channelsStore.can('pin_messages')
    },
    canDelete() {
      return this.isOwnMessage || this.channelsStore.can('manage_messages')
    },
    isPinned() {
      return this.messagesStore.pinnedMessages.some((pin) => pin.message_id === this.message.id)
    }
  },
  watch: {
    showEmojiPicker() {
      this.syncPopoverState()
    },
    showOverflowMenu(value) {
      if (value) {
        this.loadReminder()
      } else {
        this.showOverflowEmojiPicker = false
        this.showReminderMenu = false
      }
      this.syncPopoverState()
    },
    showOverflowEmojiPicker() {
      this.syncPopoverState()
    },
    showReminderMenu() {
      this.syncPopoverState()
    },
    showMobileEmojiSheet() {
      this.syncPopoverState()
    },
    showMobileReminderSheet() {
      this.syncPopoverState()
    },
    isMobileLayout(value) {
      if (value) {
        this.showEmojiPicker = false
        this.showOverflowEmojiPicker = false
        this.showReminderMenu = false
        return
      }
      this.showMobileEmojiSheet = false
      this.showMobileReminderSheet = false
    }
  },
  mounted() {
    this.recentEmojis = loadRecentEmojis()
    this.stopObservingMobileLayout = observeMobileLayout((matches) => {
      this.isMobileLayout = matches
    })
  },
  beforeUnmount() {
    this.stopObservingMobileLayout?.()
  },
  methods: {
    syncPopoverState() {
      this.$emit('popover-change', this.showEmojiPicker || this.showOverflowMenu || this.showOverflowEmojiPicker || this.showReminderMenu || this.showMobileEmojiSheet || this.showMobileReminderSheet)
    },
    closeMenus() {
      this.showEmojiPicker = false
      this.showOverflowEmojiPicker = false
      this.showReminderMenu = false
      this.showOverflowMenu = false
      this.showMobileEmojiSheet = false
      this.showMobileReminderSheet = false
    },
    openMobileEmojiSheet() {
      this.showEmojiPicker = false
      this.showOverflowEmojiPicker = false
      this.showReminderMenu = false
      this.showMobileEmojiSheet = true
    },
    openMobileEmojiSheetFromOverflow() {
      this.showOverflowMenu = false
      this.openMobileEmojiSheet()
    },
    closeMobileEmojiSheet() {
      this.showMobileEmojiSheet = false
    },
    openMobileReminderSheet() {
      this.showOverflowMenu = false
      this.showOverflowEmojiPicker = false
      this.showReminderMenu = false
      this.customReminderAt = null
      this.loadReminder()
      this.showMobileReminderSheet = true
    },
    closeMobileReminderSheet() {
      this.showMobileReminderSheet = false
    },
    emitAction(action) {
      this.closeMenus()
      this.$emit(action, this.message)
    },
    async addReaction(emoji) {
      try {
        await this.messageOpsStore.addReaction(this.message.id, emoji)
        this.recentEmojis = saveRecentEmoji(emoji)
        this.closeMenus()
      } catch (error) {
        console.error('Failed to add reaction:', error)
        window.$message?.error(this.$t('ui.components.could_not_add_reaction'))
      }
    },
    async onEmojiSelect(emoji) {
      this.showEmojiPicker = false
      this.showOverflowEmojiPicker = false
      this.showMobileEmojiSheet = false
      await this.addReaction(emoji)
      this.recentEmojis = loadRecentEmojis()
    },
    async togglePin() {
      try {
        if (this.isPinned) {
          const pin = this.messagesStore.pinnedMessages.find((entry) => entry.message_id === this.message.id)
          if (pin) await this.messagesStore.unpin(pin.id)
          window.$message?.success(this.$t('ui.components.message_unpinned'))
        } else {
          await this.messagesStore.pin(this.message.id)
          window.$message?.success(this.$t('ui.components.message_pinned'))
        }
        this.closeMenus()
      } catch (error) {
        console.error('Failed to toggle pin:', error)
        window.$message?.error(this.$t('ui.components.action_failed'))
      }
    },
    async loadReminder() {
      if (!this.message?.id) return
      try {
        await this.messageRemindersStore.loadForMessage(this.message.id)
      } catch {
        // The menu can still open if the status lookup fails.
      }
    },
    onReminderMenuToggle(value) {
      if (value) {
        this.customReminderAt = null
        this.loadReminder()
      }
    },
    async setReminderAt(remindAt) {
      const date = new Date(remindAt)
      if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
        window.$message?.error(this.$t('ui.components.reminder_future_required'))
        return
      }

      this.reminderLoading = true
      try {
        await this.messageRemindersStore.upsertForMessage(this.message.id, date.toISOString())
        window.$message?.success(this.$t('ui.components.reminder_saved'))
        this.closeMenus()
      } catch (error) {
        console.error('Failed to save reminder:', error)
        window.$message?.error(this.$t('ui.components.reminder_save_failed'))
      } finally {
        this.reminderLoading = false
      }
    },
    setReminderIn(offsetMs) {
      return this.setReminderAt(Date.now() + offsetMs)
    },
    setCustomReminder() {
      return this.setReminderAt(this.customReminderAt)
    },
    async removeReminder() {
      if (!this.activeReminder) return

      this.reminderLoading = true
      try {
        await this.messageRemindersStore.removeReminder(this.activeReminder)
        window.$message?.success(this.$t('ui.components.reminder_removed'))
        this.closeMenus()
      } catch (error) {
        console.error('Failed to remove reminder:', error)
        window.$message?.error(this.$t('ui.components.reminder_remove_failed'))
      } finally {
        this.reminderLoading = false
      }
    },
    async copyMessageLink() {
      const url = buildMessageUrl(globalThis.window?.location?.origin, this.message.channel_id, this.message.id)
      if (!url || !navigator?.clipboard?.writeText) {
        window.$message?.error(this.$t('ui.components.copy_message_link_failed'))
        return
      }

      try {
        await navigator.clipboard.writeText(url)
        window.$message?.success(this.$t('ui.components.message_link_copied'))
        this.closeMenus()
      } catch {
        window.$message?.error(this.$t('ui.components.copy_message_link_failed'))
      }
    },
    confirmDelete() {
      this.closeMenus()
      this.$emit('delete', this.message)
    }
  }
}
</script>

<style scoped>
.message-actions-root {
  display: inline-flex;
  align-items: center;
  width: max-content;
  max-width: max-content;
}

.message-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  background: var(--app-surface-raised);
  border: 1px solid var(--app-border-strong);
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  color: var(--app-text-muted);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, transform 0.12s ease;
}

.action-btn:hover {
  background: var(--app-hover);
  color: var(--app-text-strong);
}

.action-btn:focus-visible,
.menu-action:focus-visible,
.overflow-emoji-btn:focus-visible,
.mobile-emoji-sheet-close:focus-visible,
.mobile-reminder-sheet-close:focus-visible {
  outline: 2px solid var(--app-focus);
  outline-offset: 2px;
}

.action-btn:disabled,
.menu-action:disabled {
  cursor: wait;
  opacity: 0.55;
}

.action-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.emoji-action-btn {
  color: var(--app-text-strong);
}

.quick-emoji {
  font-size: 22px;
  line-height: 1;
}

.overflow-trigger {
  background: var(--app-surface-muted);
}

.message-action-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 270px;
  padding: 4px;
  color: var(--app-text);
}

.overflow-emoji-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 4px;
}

.overflow-emoji-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  border: none;
  border-radius: 8px;
  background: var(--app-surface-muted);
  color: var(--app-text-strong);
  cursor: pointer;
  font-size: 24px;
  transition: background 0.12s ease, transform 0.12s ease;
}

.overflow-emoji-btn:hover {
  background: var(--app-hover);
  transform: translateY(-1px);
}

.menu-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  width: 100%;
  min-height: 35px;
  padding: 0 10px 0 14px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--app-text);
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: background 0.12s ease, color 0.12s ease;
}

.menu-action:hover {
  background: var(--app-hover);
  color: var(--app-text-strong);
}

.menu-action-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 400;
}

.menu-action.danger {
  color: rgb(255, 112, 112);
}

.menu-divider {
  height: 1px;
  margin: 6px 0;
  background: var(--app-border-soft);
}

.mobile-emoji-sheet {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  box-sizing: border-box;
  width: 100vw;
  max-height: calc(100dvh - 16px);
  padding: 12px 12px calc(12px + env(safe-area-inset-bottom, 0px));
  border: 1px solid var(--app-border-strong);
  border-bottom: 0;
  border-radius: 14px 14px 0 0;
  background: var(--app-surface-raised);
  box-shadow: 0 -16px 40px rgba(0, 0, 0, 0.38);
  color: var(--app-text);
  overflow: hidden;
}

.mobile-emoji-sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 2px 10px;
}

.mobile-emoji-sheet-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
}

.mobile-emoji-sheet-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border: none;
  border-radius: 8px;
  background: var(--app-surface-muted);
  color: var(--app-text-muted);
  cursor: pointer;
}

.mobile-emoji-sheet-close:hover {
  background: var(--app-hover);
  color: var(--app-text-strong);
}

.mobile-reminder-sheet {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100vw;
  max-height: calc(100dvh - 16px);
  padding: 12px 12px calc(12px + env(safe-area-inset-bottom, 0px));
  border: 1px solid var(--app-border-strong);
  border-bottom: 0;
  border-radius: 14px 14px 0 0;
  background: var(--app-surface-raised);
  box-shadow: 0 -16px 40px rgba(0, 0, 0, 0.38);
  color: var(--app-text);
  overflow-y: auto;
}

.mobile-reminder-sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 2px 10px;
}

.mobile-reminder-sheet-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
}

.mobile-reminder-sheet-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border: none;
  border-radius: 8px;
  background: var(--app-surface-muted);
  color: var(--app-text-muted);
  cursor: pointer;
}

.mobile-reminder-sheet-close:hover {
  background: var(--app-hover);
  color: var(--app-text-strong);
}

.mobile-reminder-sheet :deep(.reminder-menu) {
  width: 100%;
}

.mobile-emoji-sheet :deep(.emoji-picker) {
  width: 100%;
}

.mobile-emoji-sheet :deep(.emoji-categories) {
  flex-wrap: wrap;
}

.mobile-emoji-sheet :deep(.emoji-grid-container) {
  max-height: min(52dvh, 360px);
}

.delete-confirm-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 260px;
  line-height: 1.4;
}

.delete-confirm-copy span {
  color: var(--app-text-muted);
}

</style>
