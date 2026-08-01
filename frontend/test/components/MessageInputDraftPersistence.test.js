import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('MessageInput draft persistence integration', () => {
  it('wires composer text and pending files through the messages draft store', () => {
    const source = readFileSync(resolve('src/components/MessageInput.vue'), 'utf8')

    expect(source).toContain('activeDraft()')
    expect(source).toContain('return this.messagesStore.getDraft(this.activeChannelId)')
    expect(source).toContain('set(value) {')
    expect(source).toContain('this.messagesStore.setDraftText(this.activeChannelId, value)')
    expect(source).toContain('pendingFiles()')
    expect(source).toContain('return this.activeDraft.files')
    expect(source).toContain('this.messagesStore.addDraftFile(this.activeChannelId, fileData)')
    expect(source).toContain('this.messagesStore.removeDraftFile(this.activeChannelId, fileId)')
  })

  it('keeps drafts across channel changes and only clears after a successful submit', () => {
    const source = readFileSync(resolve('src/components/MessageInput.vue'), 'utf8')

    expect(source).toContain('activeChannelId(nextChannelId)')
    expect(source).not.toContain('this.pendingFiles = []')
    expect(source).toContain('this.messagesStore.hydrateDraftFiles(nextChannelId)')
    expect(source).toContain('const draft = this.messagesStore.getDraft(channelId)')
    expect(source).toContain('await this.messagesStore.sendToChannel(channelId, text, {')
    expect(source).toContain('this.messagesStore.clearDraft(channelId)')
  })
})
