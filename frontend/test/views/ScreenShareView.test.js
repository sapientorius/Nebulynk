import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('ScreenShareView', () => {
  it('supports both meeting and voice-channel screen share windows', () => {
    const source = readFileSync(resolve('src/views/ScreenShareView.vue'), 'utf8')
    const routerSource = readFileSync(resolve('src/router/index.js'), 'utf8')

    expect(source).toContain('isMeetingRoute()')
    expect(source).toContain('contextChannelId()')
    expect(source).toContain("return this.isMeetingRoute ? this.$t('ui.views.back_to_meeting') : this.$t('ui.views.back_to_chat')")
    expect(source).toContain(":test-id-prefix=\"isMeetingRoute ? 'meeting' : 'voice'\"")
    expect(source).toContain("this.$router.push(`/channels/${this.$route.params.channelId}`)")
    expect(routerSource).toContain("path: '/channels/:channelId/screen-share'")
    expect(routerSource).toContain("name: 'ChannelScreenShare'")
  })
})
