import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('MessageActions', () => {
  it('renders Mattermost-style quick actions with three recent emoji buttons before picker and primary actions', () => {
    const source = readFileSync(resolve('src/components/MessageActions.vue'), 'utf8')

    expect(source).toContain('v-for="emoji in quickEmojis"')
    expect(source).toContain('data-testid="message-action-recent-emoji"')
    expect(source).toContain('data-testid="message-action-emoji-picker"')
    expect(source).toContain('data-testid="message-action-reply"')
    expect(source).toContain('data-testid="message-action-edit"')
    expect(source).toContain('data-testid="message-action-summary"')
    expect(source).toContain('data-testid="message-action-overflow"')
    expect(source).toContain('const DEFAULT_QUICK_EMOJIS')
    expect(source).toContain('QUICK_EMOJI_COUNT = 3')
    expect(source.indexOf('data-testid="message-action-recent-emoji"')).toBeLessThan(source.indexOf('data-testid="message-action-emoji-picker"'))
    expect(source.indexOf('data-testid="message-action-emoji-picker"')).toBeLessThan(source.indexOf('data-testid="message-action-reply"'))
  })

  it('keeps picker and quick reactions wired through recent emoji storage and message ops', () => {
    const source = readFileSync(resolve('src/components/MessageActions.vue'), 'utf8')

    expect(source).toContain("import { loadRecentEmojis, saveRecentEmoji } from '../lib/recent-emojis.js'")
    expect(source).toContain('<EmojiPicker @select="onEmojiSelect" />')
    expect(source).toContain('await this.messageOpsStore.addReaction(this.message.id, emoji)')
    expect(source).toContain('this.recentEmojis = saveRecentEmoji(emoji)')
    expect(source).toContain('this.recentEmojis = loadRecentEmojis()')
  })

  it('repeats available actions inside overflow and protects delete with popconfirm', () => {
    const source = readFileSync(resolve('src/components/MessageActions.vue'), 'utf8')
    const reminderMenuSource = readFileSync(resolve('src/components/MessageReminderMenu.vue'), 'utf8')

    expect(source).toContain('data-testid="message-action-overflow-menu"')
    expect(source).toContain("emitAction('reply')")
    expect(source).toContain("emitAction('forward')")
    expect(source).toContain('copyMessageLink')
    expect(source).toContain('togglePin')
    expect(source).toContain("emitAction('edit')")
    expect(source).toContain("emitAction('summarize')")
    expect(source).toContain('data-testid="message-action-remind"')
    expect(reminderMenuSource).toContain('data-testid="message-reminder-menu"')
    expect(reminderMenuSource).toContain('data-testid="message-reminder-custom-save"')
    expect(reminderMenuSource).toContain('data-testid="message-reminder-remove"')
    expect(source).toContain('<n-popconfirm')
    expect(source).toContain("'data-testid': 'message-action-confirm-delete'")
    expect(source).toContain('data-testid="message-action-delete"')
    expect(source).toContain("$t('ui.components.delete_message_confirm_title')")
    expect(source).toContain("$t('ui.components.delete_message_confirm_body')")
    expect(source).toContain("$emit('delete', this.message)")
  })

  it('keeps popovers visible to the parent hover lock while menus are open', () => {
    const source = readFileSync(resolve('src/components/MessageActions.vue'), 'utf8')

    expect(source).toContain("emits: ['edit', 'delete', 'reply', 'forward', 'summarize', 'popover-change']")
    expect(source).toContain('showOverflowMenu: false')
    expect(source).toContain('showOverflowEmojiPicker: false')
    expect(source).toContain('showReminderMenu: false')
    expect(source).toContain('showMobileEmojiSheet: false')
    expect(source).toContain('showMobileReminderSheet: false')
    expect(source).toContain('syncPopoverState()')
    expect(source).toContain("this.$emit('popover-change', this.showEmojiPicker || this.showOverflowMenu || this.showOverflowEmojiPicker || this.showReminderMenu || this.showMobileEmojiSheet || this.showMobileReminderSheet)")
  })

  it('uses a bottom sheet for message reaction picking on mobile layouts', () => {
    const source = readFileSync(resolve('src/components/MessageActions.vue'), 'utf8')

    expect(source).toContain('inheritAttrs: false')
    expect(source).toContain('<div class="message-actions-root" v-bind="$attrs">')
    expect(source).toContain('<div class="message-actions">')
    expect(source).toContain("import { observeMobileLayout, readIsMobileLayout } from '../lib/mobile-layout.js'")
    expect(source).toContain('isMobileLayout: readIsMobileLayout()')
    expect(source).toContain('this.stopObservingMobileLayout = observeMobileLayout((matches) => {')
    expect(source).toContain('beforeUnmount()')
    expect(source).toContain('this.stopObservingMobileLayout?.()')
    expect(source).toContain('v-if="!isMobileLayout"')
    expect(source).toContain('v-else')
    expect(source).toContain('openMobileEmojiSheet')
    expect(source).toContain('openMobileEmojiSheetFromOverflow')
    expect(source).toContain('data-testid="message-action-mobile-emoji-sheet"')
    expect(source).toContain('data-testid="message-action-mobile-emoji-sheet-close"')
    expect(source).toContain('data-testid="message-action-mobile-emoji-sheet-trigger"')
    expect(source).toContain('showOverflowMenu = false')
    expect(source).toContain('showMobileEmojiSheet = true')
    expect(source).toContain('CloseOutline as CloseIcon')
  })

  it('uses a viewport-safe bottom sheet for reminders on mobile layouts', () => {
    const source = readFileSync(resolve('src/components/MessageActions.vue'), 'utf8')

    expect(source).toContain("import MessageReminderMenu from './MessageReminderMenu.vue'")
    expect(source).toContain('showMobileReminderSheet: false')
    expect(source).toContain('data-testid="message-reminder-mobile-sheet"')
    expect(source).toContain('data-testid="message-reminder-mobile-close"')
    expect(source).toContain('@click="openMobileReminderSheet"')
    expect(source).toContain('@click="closeMobileReminderSheet"')
    expect(source).toContain('v-if="!isMobileLayout"')
    expect(source).toContain('v-model:show="showMobileReminderSheet"')
    expect(source).toContain('max-height: calc(100dvh - 16px);')
    expect(source).toContain('overflow-y: auto;')
    expect(source).toContain('env(safe-area-inset-bottom, 0px)')
  })

  it('keeps the reminder form shared between desktop popover and mobile sheet', () => {
    const source = readFileSync(resolve('src/components/MessageActions.vue'), 'utf8')
    const reminderMenuSource = readFileSync(resolve('src/components/MessageReminderMenu.vue'), 'utf8')

    expect(source).toContain('<MessageReminderMenu')
    expect(source).toContain('v-model:custom-reminder-at="customReminderAt"')
    expect(source).toContain('@quick-select="setReminderIn"')
    expect(source).toContain('@save="setCustomReminder"')
    expect(source).toContain('@remove="removeReminder"')
    expect(reminderMenuSource).toContain("emits: ['update:customReminderAt', 'quick-select', 'save', 'remove']")
    expect(reminderMenuSource).toContain(':to="datePickerTo"')
    expect(source).toContain('date-picker-to="body"')
    expect(reminderMenuSource).toContain('data-testid="message-reminder-menu"')
  })

  it('keeps the hover toolbar spacing modestly roomier without expanding the overflow menu', () => {
    const source = readFileSync(resolve('src/components/MessageActions.vue'), 'utf8')

    expect(source).toContain('.message-actions-root {')
    expect(source).toContain('width: max-content;')
    expect(source).toContain('max-width: max-content;')
    expect(source).toContain('.message-actions {')
    expect(source).toContain('gap: 6px;')
    expect(source).toContain('padding: 6px;')
    expect(source).toContain('.message-action-menu {')
    expect(source).toContain('gap: 4px;')
    expect(source).toContain('min-height: 35px;')
    expect(source).toContain('margin: 6px 0;')
    expect(source).toContain('calc(12px + env(safe-area-inset-bottom, 0px))')
    expect(source).toContain('max-height: calc(100dvh - 16px);')
  })

  it('wires message reminders through the reminder store and future-date validation', () => {
    const source = readFileSync(resolve('src/components/MessageActions.vue'), 'utf8')

    expect(source).toContain('useMessageRemindersStore')
    expect(source).toContain('this.messageRemindersStore.loadForMessage(this.message.id)')
    expect(source).toContain('this.messageRemindersStore.upsertForMessage(this.message.id, date.toISOString())')
    expect(source).toContain('this.messageRemindersStore.removeReminder(this.activeReminder)')
    expect(source).toContain("this.$t('ui.components.reminder_future_required')")
    expect(source).toContain('reminderOptions()')
  })
})
