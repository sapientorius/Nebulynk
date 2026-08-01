<template>
  <div
    class="message-item"
    :data-testid="`message-${message.id}`"
    :data-message-id="message.id"
    :class="{
      'message-grouped': grouped,
      'message-highlighted': highlighted,
      'message-selecting': selectionMode
    }"
    @mouseenter="$emit('hover', message.id)"
    @mouseleave="$emit('message-leave')"
  >
    <n-checkbox
      v-if="selectionMode"
      class="message-select-checkbox"
      :checked="selected"
      :disabled="!selectable"
      :aria-label="$t('ui.components.select_message')"
      data-testid="message-summary-select"
      @update:checked="$emit('toggle-select', message.id)"
      @click.stop
    />

    <template v-if="!grouped">
      <div class="message-header">
        <UserAvatar
          :size="32"
          :name="message.user_display_name"
          :avatar-url="message.user_avatar_url"
          class="message-avatar clickable"
          @click="$emit('open-profile', message.user_id)"
        />
        <span class="message-author clickable" @click="$emit('open-profile', message.user_id)">
          {{ message.user_display_name || $t('ui.components.unknown') }}
        </span>
        <span class="message-time">{{ formatTime(message.created_at) }}</span>
        <span v-if="message.edited_at" class="message-edited">({{ $t('ui.components.edited') }})</span>
        <MessageReminderIndicator :message-id="message.id" />
      </div>
    </template>
    <div v-else class="message-grouped-meta">
      <MessageReminderIndicator :message-id="message.id" />
    </div>

    <MessageActions
      :message="message"
      :can-summarize="canSummarize"
      :summary-loading="summaryLoading"
      class="message-actions-float"
      :class="{ 'message-actions-visible': hovered || locked }"
      @edit="$emit('edit', $event)"
      @delete="$emit('delete', $event)"
      @reply="$emit('reply', $event)"
      @forward="$emit('forward', $event)"
      @summarize="$emit('summarize', $event)"
      @popover-change="$emit('popover-change', $event)"
    />

    <div class="message-content" :class="{ grouped }">
      <button
        v-if="message.reply_preview"
        class="message-reference reply-reference"
        @click="$emit('jump-to-message', message.reply_preview.id)"
      >
        <span class="reference-label">{{ $t('ui.components.replying_to') }}</span>
        <span class="reference-author">{{ message.reply_preview.user_display_name || $t('ui.components.unknown') }}</span>
        <span class="reference-snippet">{{ renderPreviewSnippet(message.reply_preview) }}</span>
      </button>

      <div v-if="message.forward_preview" class="message-reference forward-reference">
        <div class="reference-label">{{ $t('ui.components.forwarded_message') }}</div>
        <template v-if="message.forward_preview.can_access_source">
          <div class="reference-snippet">
            {{ message.forward_preview.source_author_display_name || $t('ui.components.unknown') }}
            <span v-if="message.forward_preview.source_channel_name">&middot; {{ message.forward_preview.source_channel_name }}</span>
          </div>
          <div v-if="message.forward_preview.source_message_snippet" class="reference-snippet muted">
            {{ renderSnippet(message.forward_preview.source_message_snippet, 160) }}
          </div>
          <n-button text size="tiny" @click="$emit('open-forward-source', message.forward_preview)">
            {{ $t('ui.components.go_to_original') }}
          </n-button>
        </template>
        <template v-else>
          <div v-if="message.forward_preview.source_message_snippet" class="reference-snippet">
            {{ renderSnippet(message.forward_preview.source_message_snippet, 160) }}
          </div>
          <div class="reference-snippet muted">
            {{ $t('ui.components.forward_source_hidden') }}
          </div>
        </template>
      </div>

      <template v-if="editing">
        <n-input
          :value="editText"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 6 }"
          ref="editInput"
          @update:value="$emit('update:edit-text', $event)"
          @keydown="$emit('edit-keydown', $event)"
        />
        <div class="edit-hint">{{ $t('ui.components.escape_to_cancel_enter_to_save') }}</div>
      </template>
      <template v-else>
        <MeetingActionCard
          v-if="meetingCard"
          v-bind="meetingCard"
          @open="$emit('open-meeting', meetingCard.meetingId)"
          @join="$emit('join-meeting-call', meetingCard.meetingId)"
        />
        <template v-else-if="hasTextContent">
          <div
            class="message-body"
            :class="{
              'message-body-collapsible': collapsible,
              'message-body-collapsed': collapsed,
              'message-body-expanded': expanded
            }"
          >
            <div
              class="message-body-content"
              :data-message-body-id="message.id"
              v-html="renderContent(message)"
            />
          </div>
          <n-button
            v-if="collapsible"
            size="tiny"
            class="message-collapse-toggle"
            :data-testid="`message-collapse-toggle-${message.id}`"
            @click="$emit('toggle-expanded', message.id)"
          >
            <span class="message-collapse-toggle-label">
              {{ expanded ? $t('ui.components.show_less') : $t('ui.components.show_more') }}
            </span>
          </n-button>
        </template>
        <template v-if="message.files && message.files.length">
          <FilePreview v-for="file in message.files" :key="file.id" :file="file" />
        </template>
      </template>
    </div>
    <ReactionBar :message="message" />
  </div>
</template>

<script>
import ReactionBar from './ReactionBar.vue'
import FilePreview from './FilePreview.vue'
import MessageActions from './MessageActions.vue'
import MeetingActionCard from './MeetingActionCard.vue'
import MessageReminderIndicator from './MessageReminderIndicator.vue'
import UserAvatar from './UserAvatar.vue'
import { getCurrentLocale } from '../lib/i18n.js'
import {
  isInlineImageMessage,
  renderMessageMarkdown,
  toPlainMessageSnippet
} from '../lib/message-markdown.js'

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export default {
  name: 'MessageRow',
  components: { ReactionBar, FilePreview, MessageActions, MeetingActionCard, MessageReminderIndicator, UserAvatar },
  props: {
    message: { type: Object, required: true },
    grouped: { type: Boolean, default: false },
    highlighted: { type: Boolean, default: false },
    hovered: { type: Boolean, default: false },
    locked: { type: Boolean, default: false },
    editing: { type: Boolean, default: false },
    editText: { type: String, default: '' },
    meetingCard: { type: Object, default: null },
    hasTextContent: { type: Boolean, default: false },
    collapsible: { type: Boolean, default: false },
    collapsed: { type: Boolean, default: false },
    expanded: { type: Boolean, default: false },
    renderUsers: { type: Array, default: () => [] },
    selfUserId: { type: String, default: null },
    canSummarize: { type: Boolean, default: false },
    summaryLoading: { type: Boolean, default: false },
    selectionMode: { type: Boolean, default: false },
    selectable: { type: Boolean, default: true },
    selected: { type: Boolean, default: false }
  },
  emits: [
    'hover',
    'open-profile',
    'message-leave',
    'popover-change',
    'edit',
    'delete',
    'reply',
    'forward',
    'summarize',
    'toggle-select',
    'jump-to-message',
    'open-forward-source',
    'update:edit-text',
    'edit-keydown',
    'open-meeting',
    'join-meeting-call',
    'toggle-expanded'
  ],
  watch: {
    editing(isEditing) {
      if (isEditing) {
        this.focusEditInput()
      }
    }
  },
  mounted() {
    if (this.editing) {
      this.focusEditInput()
    }
  },
  methods: {
    focusEditInput() {
      this.$nextTick(() => {
        this.$refs.editInput?.focus?.()
      })
    },
    renderPreviewSnippet(preview) {
      if (preview.deleted_at) return this.$t('ui.components.message_deleted')
      return toPlainMessageSnippet(preview.content || '', { maxLength: 160 }) || this.$t('ui.components.message')
    },
    renderContent(message) {
      const content = message.content || ''

      if (isInlineImageMessage(content)) {
        const escapedUrl = escapeHtml(content.trim())
        return `<img src="${escapedUrl}" class="inline-image" loading="lazy" alt="Image" />`
      }

      return renderMessageMarkdown(content, {
        users: this.renderUsers || [],
        selfUserId: this.selfUserId || null
      })
    },
    renderSnippet(content, maxLength = 160) {
      return toPlainMessageSnippet(content || '', { maxLength }) || this.$t('ui.components.message')
    },
    formatTime(dateStr) {
      const date = new Date(dateStr)
      const now = new Date()
      const isToday = date.toDateString() === now.toDateString()
      const locale = getCurrentLocale()

      if (isToday) {
        return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
      }
      return date.toLocaleDateString(locale, {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      })
    }
  }
}
</script>

<style scoped>
.message-item {
  position: relative;
  padding: 4px 0;
  border-radius: 8px;
  min-width: 0;
  overflow: visible;
}

.message-select-checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
}

.message-item:not(.message-grouped) {
  margin-top: 12px;
}

.message-item:hover {
  background: var(--app-surface);
}

.message-selecting {
  padding-left: 34px;
}

.message-highlighted {
  background: var(--app-primary-soft);
  box-shadow: 0 0 0 1px rgba(var(--theme-primary-rgb), 0.35);
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.message-grouped-meta {
  position: absolute;
  top: 2px;
  left: 4px;
  z-index: 2;
}

.message-selecting .message-grouped-meta {
  left: 42px;
}

.message-avatar {
  flex-shrink: 0;
}

.clickable {
  cursor: pointer;
}

.clickable:hover {
  opacity: 0.8;
}

.message-author {
  font-weight: 600;
  font-size: 14px;
}

.message-time {
  font-size: 12px;
  opacity: 0.5;
}

.message-edited {
  font-size: 11px;
  opacity: 0.4;
}

.message-content {
  padding-left: 40px;
  font-size: 14px;
  line-height: 1.5;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  word-break: break-word;
  overflow: visible;
  overflow-wrap: anywhere;
}

.message-content :deep(p) {
  margin: 0 0 8px;
}

.message-content :deep(p:last-child) {
  margin-bottom: 0;
}

.message-content :deep(ul),
.message-content :deep(ol),
.message-content :deep(blockquote),
.message-content :deep(pre),
.message-content :deep(h1),
.message-content :deep(h2),
.message-content :deep(h3),
.message-content :deep(h4),
.message-content :deep(h5),
.message-content :deep(h6) {
  margin: 8px 0;
}

.message-content :deep(ul),
.message-content :deep(ol) {
  padding-left: 20px;
}

.message-content :deep(li + li) {
  margin-top: 2px;
}

.message-content :deep(blockquote) {
  padding-left: 12px;
  border-left: 3px solid rgba(var(--theme-primary-rgb), 0.45);
  opacity: 0.92;
}

.message-content :deep(code) {
  font-family: Consolas, 'Courier New', monospace;
  font-size: 0.92em;
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--app-surface-muted);
}

.message-content :deep(pre) {
  overflow-x: auto;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--app-surface-muted);
  border: 1px solid var(--app-border-soft);
}

.message-content :deep(pre code) {
  display: block;
  padding: 0;
  background: transparent;
}

.message-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0;
}

.message-content :deep(th),
.message-content :deep(td) {
  padding: 6px 8px;
  border: 1px solid var(--app-border-strong);
  text-align: left;
}

.message-content :deep(th) {
  background: var(--app-surface-muted);
}

.message-content :deep(a) {
  color: var(--theme-primary);
}

.message-content :deep(.task-list-item) {
  list-style: none;
}

.message-content :deep(.task-list-item input[type="checkbox"]) {
  margin-right: 8px;
}

.message-actions-float {
  position: absolute;
  top: 2px;
  right: 8px;
  z-index: 10;
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
  transform: translateY(2px);
  transition: opacity 0.12s ease, transform 0.12s ease, visibility 0.12s ease;
}

.message-item:hover .message-actions-float,
.message-actions-visible {
  visibility: visible;
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.message-reference {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  margin-bottom: 8px;
  padding: 8px 10px;
  border: 1px solid var(--app-border-soft);
  border-radius: 8px;
  background: var(--app-surface-muted);
  color: inherit;
}

.reply-reference {
  cursor: pointer;
}

.forward-reference {
  margin-bottom: 10px;
}

.reference-label {
  font-size: 12px;
  opacity: 0.65;
}

.reference-author {
  font-weight: 600;
}

.reference-snippet {
  font-size: 13px;
  opacity: 0.88;
  white-space: pre-wrap;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.message-body {
  min-width: 0;
}

.message-body-collapsible {
  overflow: hidden;
}

.message-body-collapsed {
  max-height: 320px;
  -webkit-mask-image: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 1) calc(100% - 72px),
    rgba(0, 0, 0, 0)
  );
  mask-image: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 1) calc(100% - 72px),
    rgba(0, 0, 0, 0)
  );
}

.message-body-expanded {
  max-height: none;
  -webkit-mask-image: none;
  mask-image: none;
}

.message-collapse-toggle {
  margin-top: 12px;
  min-width: 0;
  border-radius: 999px;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.26);
  background: linear-gradient(180deg, rgba(var(--theme-primary-rgb), 0.18), rgba(var(--theme-primary-rgb), 0.1));
  box-shadow: 0 8px 24px var(--app-shadow);
  color: var(--theme-primary);
  transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
}

.message-collapse-toggle:hover {
  border-color: rgba(var(--theme-primary-rgb), 0.42);
  background: linear-gradient(180deg, rgba(var(--theme-primary-rgb), 0.26), rgba(var(--theme-primary-rgb), 0.14));
  box-shadow: 0 10px 28px var(--app-shadow);
  transform: translateY(-1px);
}

.message-collapse-toggle:focus-visible {
  outline: 2px solid var(--app-focus);
  outline-offset: 2px;
}

.message-collapse-toggle-label {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.reference-snippet.muted {
  opacity: 0.62;
}

.edit-hint {
  font-size: 11px;
  opacity: 0.4;
  margin-top: 4px;
}
</style>

<style>
.mention {
  background: rgba(var(--theme-primary-rgb), 0.15);
  color: var(--theme-primary);
  padding: 0 2px;
  border-radius: 3px;
  font-weight: 500;
}

.mention-self {
  background: rgba(var(--theme-primary-rgb), 0.25);
  color: var(--theme-primary);
}

.mention-special {
  color: rgb(255, 200, 100);
  background: rgba(255, 200, 100, 0.15);
}

.inline-image {
  max-width: min(400px, 100%);
  max-height: 350px;
  height: auto;
  box-sizing: border-box;
  border-radius: 6px;
  display: block;
  margin: 4px 0;
  cursor: pointer;
}

.inline-image:hover {
  opacity: 0.9;
}
</style>
