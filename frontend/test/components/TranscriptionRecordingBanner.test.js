import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('TranscriptionRecordingBanner', () => {
  it('owns compact recording status text, info details, and video restore actions with stable test IDs', () => {
    const source = readFileSync(resolve('src/components/TranscriptionRecordingBanner.vue'), 'utf8')

    expect(source).toContain("name: 'TranscriptionRecordingBanner'")
    expect(source).toContain('data-testid="meeting-transcription-recording-banner"')
    expect(source).toContain('data-testid="meeting-transcription-recording-info"')
    expect(source).toContain('data-testid="meeting-transcription-recording-pause"')
    expect(source).toContain('data-testid="meeting-transcription-recording-resume"')
    expect(source).toContain('data-testid="meeting-video-show"')
    expect(source).toContain("emits: ['pause-recording', 'resume-recording', 'show-videos']")
    expect(source).toContain('showVideoRestore')
    expect(source).toContain("ui.components.transcription_status_details")
    expect(source).toContain("ui.views.meeting_video_hidden_compact")
    expect(source).toContain("ui.views.transcription_recording_active")
    expect(source).toContain("ui.views.transcription_recording_paused")
    expect(source).toContain("ui.views.pause_transcription_recording")
    expect(source).toContain("ui.views.resume_transcription_recording")
  })
})
