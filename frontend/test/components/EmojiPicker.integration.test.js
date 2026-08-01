import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('emoji picker integrations', () => {
  it('keeps the message input wired to the shared emoji picker select flow', () => {
    const source = readFileSync(resolve('src/components/MessageInput.vue'), 'utf8')

    expect(source).toContain('<EmojiPicker v-if="showEmojiPicker" @select="onEmojiSelect" />')
    expect(source).toContain('onEmojiSelect(emoji) {')
    expect(source).toContain('this.text += emoji')
  })

  it('keeps message reaction entry points wired to the shared emoji picker', () => {
    const messageActionsSource = readFileSync(resolve('src/components/MessageActions.vue'), 'utf8')
    const reactionBarSource = readFileSync(resolve('src/components/ReactionBar.vue'), 'utf8')

    expect(messageActionsSource).toContain('<EmojiPicker @select="onEmojiSelect" />')
    expect(messageActionsSource).toContain('await this.messageOpsStore.addReaction(this.message.id, emoji)')
    expect(reactionBarSource).toContain('<EmojiPicker @select="onEmojiSelect" />')
    expect(reactionBarSource).toContain('await this.messageOpsStore.addReaction(this.message.id, emoji)')
  })
})
