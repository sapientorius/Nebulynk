import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('VoiceControls', () => {
  it('supports sidebar and floating presentation variants without changing the control behavior', () => {
    const source = readFileSync(resolve('src/components/VoiceControls.vue'), 'utf8')

    expect(source).toContain('props: {')
    expect(source).toContain('variant: {')
    expect(source).toContain("default: 'sidebar'")
    expect(source).toContain("return ['sidebar', 'floating'].includes(value)")
    expect(source).toContain(":class=\"[`voice-controls-${variant}`, { 'voice-controls-dragging': isDraggingFloating }]\"")
    expect(source).toContain(':data-variant="variant"')
    expect(source).toContain('data-testid="voice-drag-handle"')
    expect(source).toContain("FLOATING_VOICE_POSITION_STORAGE_KEY = 'voiceFloatingDockPosition'")
    expect(source).toContain('restoreFloatingPosition()')
    expect(source).toContain('persistFloatingPosition()')
    expect(source).toContain('onFloatingPointerDown(event)')
    expect(source).toContain('onFloatingPointerMove(event)')
    expect(source).toContain('onFloatingPointerUp(event)')
    expect(source).toContain('.voice-controls-floating {')
    expect(source).toContain('.voice-drag-handle {')
    expect(source).toContain('.voice-controls-floating .voice-buttons {')
  })

  it('shows compact transcription recording state for active meeting calls', () => {
    const source = readFileSync(resolve('src/components/VoiceControls.vue'), 'utf8')

    expect(source).toContain('data-testid="voice-transcription-recording-status"')
    expect(source).toContain('activeVoiceMeeting()')
    expect(source).toContain('voiceTranscriptionRecordingLabel()')
    expect(source).toContain("ui.views.transcription_recording_active")
    expect(source).toContain("ui.views.transcription_recording_paused")
    expect(source).toContain("ui.views.transcription_recording_starting")
  })

  it('routes call settings through a gear popover with audio and video entry points', () => {
    const source = readFileSync(resolve('src/components/VoiceControls.vue'), 'utf8')

    expect(source).toContain('data-testid="voice-toggle-camera"')
    expect(source).toContain('data-testid="voice-open-settings"')
    expect(source).toContain('data-testid="voice-open-settings-audio"')
    expect(source).toContain('data-testid="voice-open-settings-video"')
    expect(source).toContain(":title=\"$t('ui.components.call_settings')\"")
    expect(source).toContain("onOpenSettings(tab = 'audio')")
    expect(source).toContain("this.voiceStore.settingsTab = tab === 'video' ? 'video' : 'audio'")
    expect(source).not.toContain('data-testid="voice-toggle-background-blur"')
    expect(source).toContain('canUseMeetingVideo()')
    expect(source).toContain('return !!this.activeVoiceMeeting && this.voiceStore.meetingVideoEnabled && this.voiceConnected')
    expect(source).toContain('await this.voiceStore.toggleCamera()')
    expect(source).toContain('confirmUnsupportedBlurFallback(this.$t.bind(this))')
    expect(source).toContain('VideocamOutline as VideocamIcon')
    expect(source).toContain('VideocamOffOutline as VideocamOffIcon')
  })
})
