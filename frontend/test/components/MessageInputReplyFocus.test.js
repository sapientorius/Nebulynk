import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('MessageInput autofocus regression', () => {
  it('focuses the textarea on mount, chat switches, and reply intent through one guarded helper', () => {
    const source = readFileSync(resolve('src/components/MessageInput.vue'), 'utf8')

    expect(source).toContain('mounted() {')
    expect(source).toContain('this.focusTextarea()')
    expect(source).toContain('activeChannelId(nextChannelId) {')
    expect(source).toContain('this.messagesStore.hydrateDraftFiles(nextChannelId).catch(() => {})')
    expect(source).toContain('replyContext(nextReply)')
    expect(source).toContain('if (!nextReply?.id) return')
    expect(source).toContain('this.focusTextarea()')
    expect(source).toContain('focusTextarea() {')
    expect(source).toContain('const textarea = this.getTextareaElement()')
    expect(source).toContain('if (!this.shouldAutoFocusTextarea(textarea)) return')
    expect(source).toContain('textarea?.focus()')
  })

  it('guards autofocus against touch devices, hidden inputs, and read-only composers', () => {
    const source = readFileSync(resolve('src/components/MessageInput.vue'), 'utf8')

    expect(source).toContain('isTouchDevice() {')
    expect(source).toContain('navigator.maxTouchPoints')
    expect(source).toContain("window.matchMedia('(pointer: coarse)').matches")
    expect(source).toContain('isVisibleTextarea(textarea) {')
    expect(source).toContain('if (!textarea || textarea.disabled) return false')
    expect(source).toContain("textarea.getClientRects().length === 0")
    expect(source).toContain("styles.display === 'none' || styles.visibility === 'hidden'")
    expect(source).toContain('shouldAutoFocusTextarea(textarea) {')
    expect(source).toContain('if (!this.canSend) return false')
    expect(source).toContain('if (this.isTouchDevice()) return false')
    expect(source).toContain('return this.isVisibleTextarea(textarea)')
  })
})
