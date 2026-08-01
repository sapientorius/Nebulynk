<template>
  <div class="message-input" ref="inputContainer" data-testid="message-input">
    <MentionAutocomplete
      :visible="showMentionPicker"
      :search-term="mentionSearchTerm"
      :position="mentionPosition"
      @select="onMentionSelect"
      @close="showMentionPicker = false"
      ref="mentionAutocomplete"
    />

    <div v-if="replyContext" class="reply-banner">
      <div class="reply-banner-copy">
        <div class="reply-banner-label">{{ $t('ui.components.replying_to') }}</div>
        <div class="reply-banner-author">{{ replyContext.user_display_name || $t('ui.components.unknown') }}</div>
        <div class="reply-banner-snippet">{{ replySnippet }}</div>
      </div>
      <n-button text @click="messagesStore.clearReply()">{{ $t('common.cancel') }}</n-button>
    </div>

    <div class="pending-files" v-if="pendingFiles.length > 0 || pendingImageUploads.length > 0">
      <div class="pending-file" v-for="(file, index) in pendingFiles" :key="file.id">
        <div class="pending-file-preview" v-if="isImage(file)">
          <img :src="file.url" :alt="file.original_name" class="pending-file-thumb" />
        </div>
        <div class="pending-file-info" v-else>
          <n-icon size="20"><document-icon /></n-icon>
        </div>
        <span class="pending-file-name">{{ file.original_name }}</span>
        <button class="pending-file-remove" @click="removePendingFile(file.id)" :title="$t('ui.components.remove')">
          <n-icon size="14"><close-icon /></n-icon>
        </button>
      </div>
      <div
        class="pending-file pending-image-upload"
        :class="{ 'pending-image-upload-failed': entry.status === 'failed' }"
        v-for="entry in pendingImageUploads"
        :key="entry.id"
        data-testid="pending-image-upload"
      >
        <button
          type="button"
          class="pending-file-preview pending-image-quality-trigger"
          :title="$t('ui.components.toggle_image_upload_quality')"
          :aria-label="$t('ui.components.toggle_image_upload_quality')"
          :disabled="entry.status === 'uploading'"
          :data-testid="`pending-image-quality-${entry.id}`"
          @click="togglePendingImageQuality(entry.id)"
        >
          <img
            v-if="entry.previewUrl"
            :src="entry.previewUrl"
            :alt="entry.file.name"
            class="pending-file-thumb"
          />
          <n-icon v-else size="20"><document-icon /></n-icon>
          <span
            class="pending-image-quality-badge"
            :class="{ 'pending-image-quality-badge-hd': entry.uploadOriginal }"
          >
            {{ entry.uploadOriginal ? $t('ui.components.image_upload_quality_hd') : $t('ui.components.image_upload_quality_sd') }}
          </span>
        </button>
        <span class="pending-file-name">{{ entry.file.name }}</span>
        <button
          class="pending-file-remove"
          :disabled="entry.status === 'uploading'"
          @click="removePendingImageUpload(entry.id)"
          :title="$t('ui.components.remove')"
        >
          <n-icon size="14"><close-icon /></n-icon>
        </button>
      </div>
    </div>

    <div class="composer-frame">
      <n-input
        v-model:value="text"
        class="composer-textarea"
        type="textarea"
        :bordered="false"
        :autosize="{ minRows: 1, maxRows: MAX_INPUT_ROWS }"
        :placeholder="placeholder"
        :disabled="!canSend"
        :input-props="{ 'data-testid': 'message-input-textarea' }"
        @keydown="onKeydown"
        @input="onInput"
        ref="textInput"
      />
      <div class="composer-action-row">
        <div class="composer-tools">
          <div class="markdown-toolbar" data-testid="message-markdown-toolbar">
            <n-button
              v-for="action in markdownToolbarActions"
              :key="action.id"
              quaternary
              size="small"
              class="markdown-toolbar-button"
              :title="$t(action.title)"
              :data-testid="`message-markdown-${action.id}`"
              @click="applyToolbarAction(action.id)"
            >
              <span class="markdown-toolbar-label" :class="`markdown-toolbar-label-${action.id}`">{{ action.label }}</span>
            </n-button>
          </div>
          <n-popover
            v-if="!isMobileLayout"
            trigger="click"
            placement="top-start"
            :show-arrow="false"
            v-model:show="showEmojiPicker"
          >
            <template #trigger>
              <n-button quaternary size="small" :title="$t('ui.components.emoji')">
                <template #icon><n-icon><happy-icon /></n-icon></template>
              </n-button>
            </template>
            <EmojiPicker v-if="showEmojiPicker" @select="onEmojiSelect" />
          </n-popover>
          <n-button
            v-else
            quaternary
            size="small"
            :title="$t('ui.components.emoji')"
            data-testid="message-input-mobile-emoji-trigger"
            @click="openMobileEmojiSheet"
          >
            <template #icon><n-icon><happy-icon /></n-icon></template>
          </n-button>
          <n-button quaternary size="small" :title="$t('ui.components.gif')" @click="showGifPicker = true">
            GIF
          </n-button>
          <FileUpload
            ref="fileUpload"
            :uploading="fileUploading || imageUploadSubmitting"
            @files-selected="handleSelectedFiles"
          />
        </div>
        <div class="composer-primary-actions">
          <n-popover
            trigger="click"
            placement="top-start"
            :show-arrow="false"
            v-model:show="showVoiceMenu"
          >
            <template #trigger>
              <n-button
                quaternary
                size="small"
                class="message-voice-button"
                :disabled="!canSend"
                :title="$t('ui.components.voice')"
                data-testid="message-voice-menu-trigger"
              >
                <template #icon><n-icon><mic-icon /></n-icon></template>
              </n-button>
            </template>
            <div class="voice-menu" data-testid="message-voice-menu">
              <button class="voice-menu-action" data-testid="message-voice-message" @click="openVoiceRecorder('voice-message')">
                <n-icon size="16"><mic-icon /></n-icon>
                <span>{{ $t('ui.components.voice_message') }}</span>
              </button>
              <button class="voice-menu-action" data-testid="message-voice-to-text" @click="openVoiceRecorder('voice-to-text')">
                <n-icon size="16"><text-icon /></n-icon>
                <span>{{ $t('ui.components.voice_to_text') }}</span>
              </button>
            </div>
          </n-popover>
          <n-button
            size="small"
            class="message-send-button"
            :disabled="!canSubmit"
            :title="$t('ui.components.send_message')"
            :aria-label="$t('ui.components.send_message')"
            data-testid="message-send-button"
            @click="submit"
          >
            <template #icon><n-icon size="20"><send-icon /></n-icon></template>
          </n-button>
        </div>
      </div>
    </div>
    <GifPicker v-if="showGifPicker" v-model="showGifPicker" @select="onGifSelect" />
    <VoiceRecorder
      v-model:show="showVoiceRecorder"
      :mode="voiceRecorderMode"
      :loading="voiceSubmitting"
      @submit="onVoiceRecorderSubmit"
    />
    <n-modal
      v-if="isMobileLayout"
      v-model:show="showEmojiPicker"
      :mask-closable="true"
      :auto-focus="false"
      transform-origin="center"
    >
      <div class="message-input-emoji-sheet" data-testid="message-input-mobile-emoji-sheet">
        <div class="message-input-emoji-sheet-header">
          <span class="message-input-emoji-sheet-title">{{ $t('ui.components.emoji') }}</span>
          <button
            class="message-input-emoji-sheet-close"
            type="button"
            :title="$t('ui.components.admin.cancel')"
            data-testid="message-input-mobile-emoji-close"
            @click="showEmojiPicker = false"
          >
            <n-icon size="22"><close-icon /></n-icon>
          </button>
        </div>
        <EmojiPicker v-if="showEmojiPicker" @select="onEmojiSelect" />
      </div>
    </n-modal>
  </div>
</template>

<script>
import { defineAsyncComponent } from 'vue'
import {
  HappyOutline as HappyIcon,
  DocumentOutline as DocumentIcon,
  CloseOutline as CloseIcon,
  MicOutline as MicIcon,
  TextOutline as TextIcon,
  PaperPlaneSharp as SendIcon
} from '@vicons/ionicons5'
import MentionAutocomplete from './MentionAutocomplete.vue'
import FileUpload from './FileUpload.vue'
import VoiceRecorder from './VoiceRecorder.vue'
import { useChannelsStore, useMessagesStore, useUploadsStore } from '../stores/index.js'
import { optimizeImageForUpload } from '../lib/image-upload-optimizer.js'
import { isOptimizableImageFile } from '../lib/upload-settings.js'
import { extractInternalMessageReference } from '../lib/message-links.js'
import { toPlainMessageSnippet } from '../lib/message-markdown.js'
import { applyMarkdownToolbarAction } from '../lib/message-markdown-toolbar.js'
import { observeMobileLayout, readIsMobileLayout } from '../lib/mobile-layout.js'

const MAX_INPUT_ROWS = 8
const EmojiPicker = defineAsyncComponent(() => import('./EmojiPicker.vue'))
const GifPicker = defineAsyncComponent(() => import('./GifPicker.vue'))
const MARKDOWN_TOOLBAR_ACTIONS = [
  { id: 'bold', label: 'B', title: 'ui.components.markdown_bold' },
  { id: 'italic', label: 'I', title: 'ui.components.markdown_italic' },
  { id: 'strikethrough', label: 'S', title: 'ui.components.markdown_strikethrough' },
  { id: 'heading', label: 'H', title: 'ui.components.markdown_heading' },
  { id: 'link', label: 'Link', title: 'ui.components.markdown_link' },
  { id: 'inline-code', label: 'Code', title: 'ui.components.markdown_inline_code' },
  { id: 'code-block', label: 'Block', title: 'ui.components.markdown_code_block' },
  { id: 'blockquote', label: 'Quote', title: 'ui.components.markdown_quote' },
  { id: 'bulleted-list', label: 'UL', title: 'ui.components.markdown_bulleted_list' },
  { id: 'numbered-list', label: 'OL', title: 'ui.components.markdown_numbered_list' }
]

export default {
  name: 'MessageInput',
  components: {
    EmojiPicker,
    MentionAutocomplete,
    GifPicker,
    FileUpload,
    VoiceRecorder,
    HappyIcon,
    DocumentIcon,
    CloseIcon,
    MicIcon,
    TextIcon,
    SendIcon
  },
  data() {
    return {
      MAX_INPUT_ROWS,
      showEmojiPicker: false,
      isMobileLayout: readIsMobileLayout(),
      stopObservingMobileLayout: null,
      showGifPicker: false,
      showVoiceMenu: false,
      showVoiceRecorder: false,
      voiceRecorderMode: 'voice-message',
      voiceSubmitting: false,
      fileUploading: false,
      imageUploadSubmitting: false,
      pendingImageUploadsByChannel: {},
      showMentionPicker: false,
      mentionSearchTerm: '',
      mentionStartIndex: -1,
      mentionPosition: { bottom: 0, left: 0 }
    }
  },
  computed: {
    channelsStore() {
      return useChannelsStore()
    },
    messagesStore() {
      return useMessagesStore()
    },
    uploadsStore() {
      return useUploadsStore()
    },
    activeChannelId() {
      return this.channelsStore.activeChannelId
    },
    activeChannel() {
      return this.channelsStore.channels.find((entry) => entry.id === this.activeChannelId) || null
    },
    activeDraft() {
      return this.messagesStore.getDraft(this.activeChannelId)
    },
    text: {
      get() {
        return this.activeDraft.text
      },
      set(value) {
        this.messagesStore.setDraftText(this.activeChannelId, value)
      }
    },
    pendingFiles() {
      return this.activeDraft.files
    },
    pendingImageUploads() {
      return this.pendingImageUploadsByChannel[this.activeChannelId] || []
    },
    draftFilesHydrating() {
      return Boolean(this.messagesStore.draftFilesHydratingByChannel[this.activeChannelId])
    },
    canSend() {
      return this.channelsStore.can('send_messages') && !this.activeChannel?.is_archived
    },
    canSubmit() {
      const hasFiles = this.pendingFiles.length > 0
      const hasPendingImages = this.pendingImageUploads.length > 0
      return this.canSend
        && !this.fileUploading
        && !this.imageUploadSubmitting
        && (!this.draftFilesHydrating || !hasFiles)
        && (this.text.trim().length > 0 || hasFiles || hasPendingImages)
    },
    replyContext() {
      return this.messagesStore.replyContext
    },
    replySnippet() {
      return toPlainMessageSnippet(this.replyContext?.content || '', { maxLength: 140 })
    },
    placeholder() {
      if (this.activeChannel?.is_archived) return this.$t('ui.components.channel_is_archived')
      if (!this.canSend) return this.$t('ui.components.you_do_not_have_permission_to_write_here')
      if (this.activeChannel?.purpose === 'meeting') {
        return this.$t('ui.components.message')
      }
      return this.activeChannel
        ? this.$t('ui.components.message_2', { channel_name: this.activeChannel.name })
        : this.$t('ui.components.write_a_message')
    },
    markdownToolbarActions() {
      return MARKDOWN_TOOLBAR_ACTIONS
    }
  },
  watch: {
    activeChannelId(nextChannelId) {
      this.showMentionPicker = false
      this.showEmojiPicker = false
      this.showGifPicker = false
      this.showVoiceMenu = false
      this.messagesStore.clearReply()
      this.messagesStore.hydrateDraftFiles(nextChannelId).catch(() => {})
      this.focusTextarea()
    },
    replyContext(nextReply) {
      if (!nextReply?.id) return
      this.focusTextarea()
    }
  },
  mounted() {
    this.stopObservingMobileLayout = observeMobileLayout((matches) => {
      this.isMobileLayout = matches
    })
    this.attachPasteHandler()
    this.messagesStore.hydrateDraftFiles(this.activeChannelId).catch(() => {})
    this.focusTextarea()
  },
  beforeUnmount() {
    this.stopObservingMobileLayout?.()
    this.detachPasteHandler()
    this.revokeAllPendingImageUploads()
  },
  methods: {
    openMobileEmojiSheet() {
      this.showEmojiPicker = true
    },
    getTextareaElement() {
      return this.$refs.textInput?.$el?.querySelector('textarea') || null
    },
    isTouchDevice() {
      if (typeof navigator !== 'undefined' && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0) {
        return true
      }

      return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(pointer: coarse)').matches
    },
    isVisibleTextarea(textarea) {
      if (!textarea || textarea.disabled) return false

      if (typeof textarea.getClientRects === 'function' && textarea.getClientRects().length === 0) {
        return false
      }

      if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
        const styles = window.getComputedStyle(textarea)
        if (styles.display === 'none' || styles.visibility === 'hidden') {
          return false
        }
      }

      return true
    },
    shouldAutoFocusTextarea(textarea) {
      if (!this.canSend) return false
      if (this.isTouchDevice()) return false
      return this.isVisibleTextarea(textarea)
    },
    focusTextarea() {
      this.$nextTick(() => {
        const textarea = this.getTextareaElement()
        if (!this.shouldAutoFocusTextarea(textarea)) return
        textarea?.focus()
      })
    },
    attachPasteHandler() {
      const textarea = this.getTextareaElement()
      if (!textarea) return
      textarea.addEventListener('paste', this.onPaste)
    },
    detachPasteHandler() {
      const textarea = this.getTextareaElement()
      if (!textarea) return
      textarea.removeEventListener('paste', this.onPaste)
    },
    isImage(file) {
      return file.mime_type?.startsWith('image/')
    },
    onFileUploaded(fileData) {
      this.messagesStore.addDraftFile(this.activeChannelId, fileData)
      this.focusTextarea()
    },
    createPendingImageUpload(file, index) {
      return {
        id: `pending-image-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: this.createPreviewUrl(file),
        uploadOriginal: false,
        status: 'pending'
      }
    },
    createPreviewUrl(file) {
      if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null
      return URL.createObjectURL(file)
    },
    revokePendingImageUpload(entry) {
      if (!entry?.previewUrl || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return
      URL.revokeObjectURL(entry.previewUrl)
    },
    revokeAllPendingImageUploads() {
      for (const entries of Object.values(this.pendingImageUploadsByChannel)) {
        for (const entry of entries || []) {
          this.revokePendingImageUpload(entry)
        }
      }
      this.pendingImageUploadsByChannel = {}
    },
    setPendingImageUploadsForChannel(channelId, entries) {
      if (!channelId) return
      const next = { ...this.pendingImageUploadsByChannel }
      const cleanEntries = Array.isArray(entries) ? entries : []
      if (cleanEntries.length === 0) {
        delete next[channelId]
      } else {
        next[channelId] = cleanEntries
      }
      this.pendingImageUploadsByChannel = next
    },
    updatePendingImageUpload(channelId, entryId, patch) {
      const entries = this.pendingImageUploadsByChannel[channelId] || []
      this.setPendingImageUploadsForChannel(channelId, entries.map((entry) => (
        entry.id === entryId ? { ...entry, ...patch } : entry
      )))
    },
    stagePendingImageUploads(files) {
      const channelId = this.activeChannelId
      if (!channelId) return
      const existing = this.pendingImageUploadsByChannel[channelId] || []
      const entries = files.map((file, index) => this.createPendingImageUpload(file, existing.length + index))
      this.setPendingImageUploadsForChannel(channelId, [...existing, ...entries])
      this.focusTextarea()
    },
    togglePendingImageQuality(entryId) {
      const channelId = this.activeChannelId
      const entries = this.pendingImageUploadsByChannel[channelId] || []
      const entry = entries.find((item) => item.id === entryId)
      if (!entry || entry.status === 'uploading') return
      this.updatePendingImageUpload(channelId, entryId, {
        uploadOriginal: !entry.uploadOriginal,
        status: 'pending'
      })
    },
    removePendingImageUpload(entryId) {
      const channelId = this.activeChannelId
      const entries = this.pendingImageUploadsByChannel[channelId] || []
      const removed = entries.find((entry) => entry.id === entryId)
      if (removed?.status === 'uploading') return
      this.revokePendingImageUpload(removed)
      this.setPendingImageUploadsForChannel(channelId, entries.filter((entry) => entry.id !== entryId))
      this.focusTextarea()
    },
    removePendingFile(fileId) {
      this.messagesStore.removeDraftFile(this.activeChannelId, fileId)
    },
    async handleSelectedFiles(files) {
      if (!this.canSend) return
      const fileList = Array.from(files || []).filter(Boolean)
      if (fileList.length === 0) return

      const imageFiles = fileList.filter((file) => isOptimizableImageFile(file))
      const directFiles = fileList.filter((file) => !isOptimizableImageFile(file))

      if (imageFiles.length > 0) {
        this.stagePendingImageUploads(imageFiles)
      }
      if (directFiles.length > 0) {
        await this.uploadFilesImmediately(directFiles)
      }
    },
    async uploadFilesImmediately(files) {
      const fileList = Array.from(files || []).filter(Boolean)
      if (fileList.length === 0) return

      this.fileUploading = true
      try {
        const settings = await this.uploadsStore.loadUploadSettings()
        for (const file of fileList) {
          try {
            const uploaded = await this.uploadFileWithLimitCheck(file, settings, file.name)
            if (uploaded) this.onFileUploaded(uploaded)
          } catch {
            window.$message?.error(this.$t('ui.components.upload_failed', { file_name: file.name }))
          }
        }
      } finally {
        this.fileUploading = false
      }
    },
    async resolvePendingImageFile(entry, settings) {
      if (entry.uploadOriginal) return entry.file
      const optimized = await optimizeImageForUpload(entry.file, settings)
      return optimized.file || entry.file
    },
    async uploadFileWithLimitCheck(file, settings, originalName) {
      if (file.size > settings.maxFileSizeBytes) {
        window.$message?.warning(this.$t('ui.components.is_too_large_max_mb', {
          file_name: originalName || file.name,
          max_size_mb: settings.maxFileSizeMb
        }))
        return null
      }
      return this.uploadsStore.upload(file)
    },
    async uploadPendingImageUploads(channelId) {
      const entries = [...(this.pendingImageUploadsByChannel[channelId] || [])]
      if (entries.length === 0) return

      this.imageUploadSubmitting = true
      try {
        const settings = await this.uploadsStore.loadUploadSettings()
        for (const entry of entries) {
          if (!(this.pendingImageUploadsByChannel[channelId] || []).find((item) => item.id === entry.id)) {
            continue
          }
          this.updatePendingImageUpload(channelId, entry.id, { status: 'uploading' })
          try {
            const uploadFile = await this.resolvePendingImageFile(entry, settings)
            const uploaded = await this.uploadFileWithLimitCheck(uploadFile, settings, entry.file.name)
            if (!uploaded) {
              this.updatePendingImageUpload(channelId, entry.id, { status: 'failed' })
              continue
            }
            this.messagesStore.addDraftFile(channelId, uploaded)
            const currentEntries = this.pendingImageUploadsByChannel[channelId] || []
            const currentEntry = currentEntries.find((item) => item.id === entry.id) || entry
            this.revokePendingImageUpload(currentEntry)
            this.setPendingImageUploadsForChannel(
              channelId,
              currentEntries.filter((item) => item.id !== entry.id)
            )
          } catch {
            this.updatePendingImageUpload(channelId, entry.id, { status: 'failed' })
            window.$message?.error(this.$t('ui.components.upload_failed', { file_name: entry.file.name }))
          }
        }
      } finally {
        this.imageUploadSubmitting = false
      }
    },
    async processDroppedFiles(files) {
      await this.handleSelectedFiles(files)
    },
    applyToolbarAction(action) {
      const textarea = this.getTextareaElement()
      if (!textarea || !this.canSend) return

      const result = applyMarkdownToolbarAction({
        text: this.text,
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd,
        action
      })

      this.text = result.text
      this.showMentionPicker = false

      this.$nextTick(() => {
        const nextTextarea = this.getTextareaElement()
        this.focusTextarea()
        if (!nextTextarea) return
        nextTextarea.selectionStart = result.selectionStart
        nextTextarea.selectionEnd = result.selectionEnd
      })
    },
    async onPaste(event) {
      const items = Array.from(event.clipboardData?.items || [])
      if (items.length === 0) return

      const imageFiles = items
        .filter((item) => item.kind === 'file' && item.type?.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter(Boolean)

      if (imageFiles.length === 0) return

      event.preventDefault()

      const files = imageFiles.map((file, index) => {
        if (file.name) return file
        const extension = (file.type?.split('/')[1] || 'png').replace(/[^\w-]/g, '')
        return new File([file], `clipboard-image-${Date.now()}-${index + 1}.${extension}`, { type: file.type })
      })

      await this.handleSelectedFiles(files)
    },
    async onKeydown(event) {
      if (this.showMentionPicker && this.$refs.mentionAutocomplete) {
        const handled = this.$refs.mentionAutocomplete.handleKeydown(event)
        if (handled) return
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        if (this.canSubmit) {
          await this.submit()
        }
      }

      if (event.key === 'Escape') {
        this.showMentionPicker = false
      }
    },
    async submit() {
      if (!this.canSubmit) return

      const channelId = this.channelsStore.activeChannelId

      try {
        await this.uploadPendingImageUploads(channelId)

        const draft = this.messagesStore.getDraft(channelId)
        const text = draft.text.trim()
        const fileIds = draft.files.map((file) => file.id)
        const replyToMessageId = this.replyContext?.id || undefined
        const sourceReference = fileIds.length === 0 ? extractInternalMessageReference(text) : null

        if (!text && fileIds.length === 0) return

        if (sourceReference) {
          await this.messagesStore.forward({
            sourceUrl: text,
            targetChannelId: channelId
          })
        } else {
          await this.messagesStore.sendToChannel(channelId, text, {
            fileIds: fileIds.length > 0 ? fileIds : undefined,
            replyToMessageId
          })
        }
        this.messagesStore.clearDraft(channelId)
        this.showMentionPicker = false
      } catch {
        window.$message?.error(this.$t('ui.components.send_failed'))
      }
    },
    onInput() {
      this.checkForMention()
    },
    checkForMention() {
      const inputEl = this.$refs.textInput?.$el?.querySelector('textarea')
      if (!inputEl) return

      const cursorPos = inputEl.selectionStart
      const textBeforeCursor = this.text.substring(0, cursorPos)

      const lastAtIndex = textBeforeCursor.lastIndexOf('@')
      if (lastAtIndex === -1) {
        this.showMentionPicker = false
        return
      }

      if (lastAtIndex > 0 && textBeforeCursor[lastAtIndex - 1] !== ' ' && textBeforeCursor[lastAtIndex - 1] !== '\n') {
        this.showMentionPicker = false
        return
      }

      const searchTerm = textBeforeCursor.substring(lastAtIndex + 1)

      if (searchTerm.includes(' ') || searchTerm.includes('\n')) {
        this.showMentionPicker = false
        return
      }

      this.mentionStartIndex = lastAtIndex
      this.mentionSearchTerm = searchTerm
      this.showMentionPicker = true

      const container = this.$refs.inputContainer
      if (container) {
        this.mentionPosition = {
          bottom: container.offsetHeight + 4,
          left: 16
        }
      }
    },
    onMentionSelect(item) {
      const mentionText = item.label || `@${item.display_name}`
      const before = this.text.substring(0, this.mentionStartIndex)
      const inputEl = this.$refs.textInput?.$el?.querySelector('textarea')
      const cursorPos = inputEl?.selectionStart || this.text.length
      const after = this.text.substring(cursorPos)

      this.text = `${before}${mentionText} ${after}`
      this.showMentionPicker = false

      this.$nextTick(() => {
        this.focusTextarea()
        const nextInputEl = this.getTextareaElement()
        const newPos = before.length + mentionText.length + 1
        if (nextInputEl) {
          nextInputEl.selectionStart = newPos
          nextInputEl.selectionEnd = newPos
        }
      })
    },
    async onGifSelect(gifUrl) {
      this.showGifPicker = false
      if (gifUrl) {
        await this.messagesStore.send(gifUrl, {
          replyToMessageId: this.replyContext?.id || undefined
        })
      }
    },
    openVoiceRecorder(mode) {
      if (!this.canSend) return
      this.voiceRecorderMode = mode
      this.showVoiceMenu = false
      this.showVoiceRecorder = true
    },
    insertTextAtCursor(insertedText) {
      const addition = String(insertedText || '').trim()
      if (!addition) return

      const textarea = this.getTextareaElement()
      if (!textarea) {
        this.text = this.text ? `${this.text} ${addition}` : addition
        return
      }

      const selectionStart = textarea.selectionStart ?? this.text.length
      const selectionEnd = textarea.selectionEnd ?? this.text.length
      const before = this.text.slice(0, selectionStart)
      const after = this.text.slice(selectionEnd)
      const prefix = before && !/\s$/.test(before) ? ' ' : ''
      const suffix = after && !/^\s/.test(after) ? ' ' : ''
      this.text = `${before}${prefix}${addition}${suffix}${after}`

      this.$nextTick(() => {
        const nextTextarea = this.getTextareaElement()
        const nextPosition = before.length + prefix.length + addition.length
        if (nextTextarea) {
          nextTextarea.selectionStart = nextPosition
          nextTextarea.selectionEnd = nextPosition
        }
        this.focusTextarea()
      })
    },
    async onVoiceRecorderSubmit({ file, durationMs, mode }) {
      if (!file || !this.activeChannelId) return
      this.voiceSubmitting = true

      try {
        if (mode === 'voice-to-text') {
          const result = await this.uploadsStore.transcribeVoiceDraft(file, {
            channelId: this.activeChannelId,
            durationMs
          })
          this.insertTextAtCursor(result?.text || '')
          window.$message?.success(this.$t('ui.components.voice_text_inserted'))
        } else {
          const uploaded = await this.uploadsStore.upload(file, null, {
            purpose: 'voice_message',
            durationMs
          })
          await this.messagesStore.send('', {
            fileIds: [uploaded.id],
            replyToMessageId: this.replyContext?.id || undefined
          })
        }
        this.showVoiceRecorder = false
      } catch (error) {
        console.error('Voice recording action failed:', error)
        window.$message?.error(this.$t(mode === 'voice-to-text'
          ? 'ui.components.voice_text_failed'
          : 'ui.components.send_failed'))
      } finally {
        this.voiceSubmitting = false
      }
    },
    onEmojiSelect(emoji) {
      this.text += emoji
      this.showEmojiPicker = false
      this.focusTextarea()
    }
  }
}
</script>

<style scoped>
.message-input {
  position: relative;
  padding: 8px 16px 12px;
  border-top: 1px solid var(--app-border);
  flex-shrink: 0;
}

.reply-banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--app-surface-muted);
  border-left: 3px solid var(--theme-primary);
}

.reply-banner-label {
  font-size: 12px;
  opacity: 0.65;
}

.reply-banner-author {
  font-weight: 600;
  margin: 2px 0;
}

.reply-banner-snippet {
  font-size: 13px;
  opacity: 0.82;
}

.composer-frame {
  border: 1px solid var(--app-border-strong);
  border-radius: 6px;
  background: var(--app-surface-muted);
  overflow: hidden;
}

.composer-textarea :deep(.n-input-wrapper) {
  padding: 9px 12px 4px;
}

.composer-action-row {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 42px;
  padding: 3px 8px 7px;
  align-items: center;
}

.composer-tools,
.composer-primary-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.composer-tools {
  min-width: 0;
}

.composer-primary-actions {
  margin-left: auto;
  flex-shrink: 0;
}

.markdown-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-right: 8px;
  padding-right: 8px;
  border-right: 1px solid var(--app-border-soft);
}

.markdown-toolbar-button {
  min-width: 0;
}

.markdown-toolbar-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.markdown-toolbar-label-italic {
  font-style: italic;
}

.markdown-toolbar-label-strikethrough {
  text-decoration: line-through;
}

.message-voice-button {
  min-width: 34px;
  height: 32px;
  border-radius: 6px;
  color: var(--app-text);
  background: var(--app-surface-muted);
}

.message-voice-button:not(.n-button--disabled):hover {
  background: var(--app-hover);
  color: var(--app-text-strong);
}

.message-send-button {
  min-width: 44px;
  height: 34px;
  border-radius: 6px;
  color: #101014;
  background: var(--theme-primary);
  box-shadow: 0 6px 16px rgba(var(--theme-primary-rgb), 0.2);
}

.message-send-button:not(.n-button--disabled):hover {
  color: #101014;
  background: var(--theme-primary-hover);
}

.message-send-button.n-button--disabled {
  color: var(--app-text-muted);
  background: var(--app-surface-muted);
  box-shadow: none;
}

@media (max-width: 700px) {
  .markdown-toolbar {
    display: none;
  }

  .composer-action-row {
    flex-wrap: nowrap;
  }

  .composer-tools {
    overflow: hidden;
  }
}

.pending-files {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 0;
}

.pending-file {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--app-surface-muted);
  border: 1px solid var(--app-border-strong);
  border-radius: 6px;
  max-width: 200px;
}

.pending-file-thumb {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  object-fit: cover;
}

.pending-image-quality-trigger {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: var(--app-surface-muted);
  color: inherit;
  cursor: pointer;
  flex-shrink: 0;
}

.pending-image-quality-trigger:disabled {
  cursor: default;
  opacity: 0.7;
}

.pending-image-quality-badge {
  position: absolute;
  right: -4px;
  bottom: -4px;
  min-width: 22px;
  height: 16px;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--theme-primary);
  color: #101014;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
}

.pending-image-quality-badge-hd {
  background: #f2c94c;
}

.pending-image-upload-failed {
  border-color: rgba(255, 107, 107, 0.55);
}

.pending-file-info {
  display: flex;
  align-items: center;
  opacity: 0.6;
}

.pending-file-name {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.pending-file-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--app-text-muted);
  border-radius: 3px;
  cursor: pointer;
  flex-shrink: 0;
}

.pending-file-remove:disabled {
  cursor: default;
  opacity: 0.45;
}

.pending-file-remove:hover {
  background: var(--app-hover);
  color: var(--app-text);
}

.voice-menu {
  display: flex;
  flex-direction: column;
  min-width: 180px;
  padding: 4px;
}

.voice-menu-action {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 34px;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.voice-menu-action:hover {
  background: var(--app-hover);
}

.message-input-emoji-sheet {
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

.message-input-emoji-sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 2px 10px;
}

.message-input-emoji-sheet-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
}

.message-input-emoji-sheet-close {
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

.message-input-emoji-sheet-close:hover {
  background: var(--app-hover);
  color: var(--app-text-strong);
}

.message-input-emoji-sheet-close:focus-visible {
  outline: 2px solid var(--app-focus);
  outline-offset: 2px;
}

.message-input-emoji-sheet :deep(.emoji-picker) {
  width: 100%;
}

.message-input-emoji-sheet :deep(.emoji-categories) {
  flex-wrap: wrap;
}

.message-input-emoji-sheet :deep(.emoji-grid-container) {
  max-height: min(52dvh, 360px);
}
</style>
