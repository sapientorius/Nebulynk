import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Voice messages source contract', () => {
  it('adds the mic menu and recorder paths to the message composer', () => {
    const source = readFileSync(resolve('src/components/MessageInput.vue'), 'utf8')

    expect(source).toContain('data-testid="message-voice-menu-trigger"')
    expect(source).toContain('data-testid="message-voice-message"')
    expect(source).toContain('data-testid="message-voice-to-text"')
    expect(source).toContain('class="message-voice-button"')
    expect(source).toContain('transcribeVoiceDraft')
    expect(source).toContain("purpose: 'voice_message'")
    expect(source).toContain('insertTextAtCursor')
  })

  it('adds the visible composer send button beside the voice menu trigger', () => {
    const source = readFileSync(resolve('src/components/MessageInput.vue'), 'utf8')

    expect(source).toContain('data-testid="message-send-button"')
    expect(source).toContain('PaperPlaneSharp as SendIcon')
    expect(source).toContain(':disabled="!canSubmit"')
    expect(source).toContain('@click="submit"')
    expect(source).toContain('const hasFiles = this.pendingFiles.length > 0')
    expect(source).toContain('const hasPendingImages = this.pendingImageUploads.length > 0')
    expect(source).toContain('&& (!this.draftFilesHydrating || !hasFiles)')
    expect(source).toContain('&& (this.text.trim().length > 0 || hasFiles || hasPendingImages)')
    expect(source).toContain("$t('ui.components.send_message')")
  })

  it('keeps the recorder preview explicit before send or text insertion', () => {
    const source = readFileSync(resolve('src/components/VoiceRecorder.vue'), 'utf8')

    expect(source).toContain('data-testid="voice-recorder-preview"')
    expect(source).toContain('data-testid="voice-recording-sphere"')
    expect(source).toContain('data-testid="voice-recorder-start"')
    expect(source).toContain('data-testid="voice-recorder-stop"')
    expect(source).toContain('data-testid="voice-recorder-rerecord"')
    expect(source).toContain('data-testid="voice-recorder-submit"')
    expect(source).toContain('CustomAudioPlayer')
    expect(source).toContain('new MediaRecorder')
    expect(source).toContain('watch:')
    expect(source).toContain('show(nextShow, previousShow)')
    expect(source).toContain('this.resetRecording()')
    expect(source).toContain('this.$nextTick(() =>')
    expect(source).toContain('this.startRecording()')
    expect(source).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('renders voice-message cards with private artifact actions', () => {
    const source = readFileSync(resolve('src/components/FilePreview.vue'), 'utf8')

    expect(source).toContain('data-testid="voice-message-card"')
    expect(source).toContain('data-testid="voice-message-audio-player"')
    expect(source).toContain('data-testid="voice-message-transcribe"')
    expect(source).toContain("file.purpose === 'voice_message'")
    expect(source).toContain('CustomAudioPlayer')
    expect(source).toContain('class="voice-message-audio-player"')
    expect(source).toContain('<audio :src="file.url" controls preload="metadata" class="file-audio" />')
    expect(source).toContain('requestArtifact')
    expect(source).toContain('voiceArtifact')
    expect(source).toContain('box-sizing: border-box')
    expect(source).toContain('max-width: min(460px, 100%)')
    expect(source).toContain('overflow-wrap: anywhere')
    expect(source).toContain('min-width: 0')
  })

  it('adds a custom audio player without using native controls', () => {
    const source = readFileSync(resolve('src/components/CustomAudioPlayer.vue'), 'utf8')

    expect(source).toContain('data-testid="custom-audio-player"')
    expect(source).toContain('data-testid="custom-audio-toggle"')
    expect(source).toContain('data-testid="custom-audio-progress"')
    expect(source).toContain('@loadedmetadata="onLoadedMetadata"')
    expect(source).toContain('@timeupdate="onTimeUpdate"')
    expect(source).toContain('@ended="onEnded"')
    expect(source).toContain('@error="onError"')
    expect(source).toContain('beforeUnmount()')
    expect(source).toContain('this.pausePlayback()')
    expect(source).not.toContain('controls')
  })
})
