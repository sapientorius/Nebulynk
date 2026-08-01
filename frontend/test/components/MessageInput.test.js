import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('MessageInput inline image upload source contract', () => {
  it('stages optimizable images inline with SD/HD quality toggles', () => {
    const source = readFileSync(resolve('src/components/MessageInput.vue'), 'utf8')

    expect(source).toContain('pendingImageUploadsByChannel: {}')
    expect(source).toContain('pendingImageUploads()')
    expect(source).toContain('data-testid="pending-image-upload"')
    expect(source).toContain(':data-testid="`pending-image-quality-${entry.id}`"')
    expect(source).toContain('@click="togglePendingImageQuality(entry.id)"')
    expect(source).toContain('togglePendingImageQuality(entryId)')
    expect(source).toContain('uploadOriginal: !entry.uploadOriginal')
    expect(source).toContain("entry.uploadOriginal ? $t('ui.components.image_upload_quality_hd') : $t('ui.components.image_upload_quality_sd')")
  })

  it('uses SD optimization by default and uploads HD as the original on submit', () => {
    const source = readFileSync(resolve('src/components/MessageInput.vue'), 'utf8')

    expect(source).toContain('isOptimizableImageFile')
    expect(source).toContain('this.stagePendingImageUploads(imageFiles)')
    expect(source).toContain('await this.uploadPendingImageUploads(channelId)')
    expect(source).toContain('if (entry.uploadOriginal) return entry.file')
    expect(source).toContain('const optimized = await optimizeImageForUpload(entry.file, settings)')
    expect(source).toContain('return optimized.file || entry.file')
    expect(source).toContain('this.messagesStore.addDraftFile(channelId, uploaded)')
    expect(source).toContain('const draft = this.messagesStore.getDraft(channelId)')
    expect(source).toContain('const fileIds = draft.files.map((file) => file.id)')
  })

  it('keeps picker, drop, and paste inputs on the same upload path and revokes previews', () => {
    const source = readFileSync(resolve('src/components/MessageInput.vue'), 'utf8')

    expect(source).toContain('@files-selected="handleSelectedFiles"')
    expect(source).toContain('async processDroppedFiles(files)')
    expect(source).toContain('await this.handleSelectedFiles(files)')
    expect(source).toContain('async onPaste(event)')
    expect(source).toContain('URL.createObjectURL(file)')
    expect(source).toContain('URL.revokeObjectURL(entry.previewUrl)')
    expect(source).toContain('removePendingImageUpload(entryId)')
    expect(source).toContain('revokeAllPendingImageUploads()')
    expect(source).toContain('beforeUnmount()')
  })

  it('treats archived channels as read-only and uses an archived placeholder', () => {
    const source = readFileSync(resolve('src/components/MessageInput.vue'), 'utf8')

    expect(source).toContain('activeChannel()')
    expect(source).toContain("return this.channelsStore.can('send_messages') && !this.activeChannel?.is_archived")
    expect(source).toContain("if (this.activeChannel?.is_archived) return this.$t('ui.components.channel_is_archived')")
  })

  it('uses a mobile bottom sheet for the composer emoji picker', () => {
    const source = readFileSync(resolve('src/components/MessageInput.vue'), 'utf8')

    expect(source).toContain("import { observeMobileLayout, readIsMobileLayout } from '../lib/mobile-layout.js'")
    expect(source).toContain('isMobileLayout: readIsMobileLayout()')
    expect(source).toContain('this.stopObservingMobileLayout = observeMobileLayout((matches) => {')
    expect(source).toContain('this.stopObservingMobileLayout?.()')
    expect(source).toContain('v-if="!isMobileLayout"')
    expect(source).toContain('data-testid="message-input-mobile-emoji-trigger"')
    expect(source).toContain('openMobileEmojiSheet()')
    expect(source).toContain('data-testid="message-input-mobile-emoji-sheet"')
    expect(source).toContain('data-testid="message-input-mobile-emoji-close"')
    expect(source).toContain('message-input-emoji-sheet')
    expect(source).toContain('calc(12px + env(safe-area-inset-bottom, 0px))')
    expect(source).toContain('max-height: calc(100dvh - 16px);')
  })
})
