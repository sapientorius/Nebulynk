import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('MeetingVideoGrid source contract', () => {
  it('attaches participant camera tracks and keeps the camera toggle in the voice store', () => {
    const source = readFileSync(resolve('src/components/MeetingVideoGrid.vue'), 'utf8')

    expect(source).toContain('data-testid="meeting-video-grid"')
    expect(source).toContain(':data-variant="variant"')
    expect(source).toContain("validator: (value) => ['grid', 'strip', 'focus'].includes(value)")
    expect(source).toContain('variant-grid')
    expect(source).toContain('variant-strip')
    expect(source).toContain('variant-focus')
    expect(source).toContain('data-testid="meeting-video-tile"')
    expect(source).toContain('data-testid="meeting-video-toggle-camera"')
    expect(source).toContain('this.voiceStore.cameraTracksByChannel[this.channelId]')
    expect(source).toContain('this.voiceStore.isParticipantSpeaking(participantId)')
    expect(source).toContain('tile.track.attach?.(element)')
    expect(source).toContain('await this.voiceStore.toggleCamera()')
  })

it('supports focused mobile rendering plus desktop incoming video controls', () => {
    const source = readFileSync(resolve('src/components/MeetingVideoGrid.vue'), 'utf8')

    expect(source).toContain('focusedParticipantId')
    expect(source).toContain('isMobileLayout')
    expect(source).toContain('allowHideVideos')
    expect(source).toContain("return this.focusedTile ? [this.focusedTile] : []")
    expect(source).toContain(":data-testid=\"allIncomingVideoEnabled ? 'meeting-video-disable-incoming' : 'meeting-video-enable-incoming'\"")
    expect(source).toContain("data-testid=\"meeting-video-hide\"")
    expect(source).toContain("data-testid=\"meeting-video-tile-action-trigger\"")
    expect(source).toContain('meeting-video-toggle-remote-${tile.participantId}')
    expect(source).toContain('this.voiceStore.setAllRemoteCameraSubscriptions(!this.voiceStore.allRemoteCameraSubscriptionsEnabled)')
    expect(source).toContain('this.voiceStore.setRemoteCameraSubscription(tile.participantId, !tile.incomingVideoEnabled)')
    expect(source).toContain("emits: ['hide-videos']")
    expect(source).toContain("@click=\"$emit('hide-videos')\"")
expect(source).toContain("this.$t('ui.views.incoming_video_off')")
})

it('mirrors only local camera tiles from the video preference', () => {
const source = readFileSync(resolve('src/components/MeetingVideoGrid.vue'), 'utf8')

expect(source).toContain("'video-mirrored': tile.mirrored")
expect(source).toContain('localVideoMirrored()')
expect(source).toContain('this.voiceStore.meetingVideoPreferences?.video_mirror === true')
expect(source).toContain('mirrored: participantId === selfId && this.localVideoMirrored')
expect(source).toContain('mirrored: camera.participantId === selfId && this.localVideoMirrored')
expect(source).toContain('.meeting-video-tile.video-mirrored .meeting-video-element')
expect(source).not.toContain('mirrored: !')
})
})
