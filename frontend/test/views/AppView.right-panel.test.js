import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('AppView right panel integration', () => {
  it('routes header actions into a shared right-side panel that can render members or past meetings', () => {
    const source = readFileSync(resolve('src/views/AppView.vue'), 'utf8')

    expect(source).toContain(":right-panel-mode=\"rightPanelMode\"")
    expect(source).toContain('@toggle-members="$emit(\'toggle-members\')"')
    expect(source).toContain('@toggle-past-meetings="$emit(\'toggle-past-meetings\')"')
    expect(source).toContain("const ChannelPastMeetingsPanel = defineAsyncComponent(() => import('../components/ChannelPastMeetingsPanel.vue'))")
    expect(source).toContain("emits: ['toggle-members', 'toggle-past-meetings']")
    expect(source).toContain("return this.rightPanelMode === 'members' || this.rightPanelMode === 'pastMeetings'")
    expect(source).toContain("return 340")
    expect(source).toContain("return 248")
    expect(source).toContain("width: v-bind('`${rightPanelWidth}px`');")
    expect(source).toContain('<ChannelPastMeetingsPanel')
    expect(source).toContain(":channel-id=\"activeChannelId\"")
  })
})
