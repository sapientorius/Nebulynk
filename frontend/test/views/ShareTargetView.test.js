import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Android PWA share target integration', () => {
  it('registers text, link, and image sharing in the web manifest', () => {
    const manifest = JSON.parse(readFileSync(resolve('public/manifest.webmanifest'), 'utf8'))

    expect(manifest.share_target).toEqual({
      action: '/share-target',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'share_title',
        text: 'share_text',
        url: 'share_url',
        files: [{
          name: 'share_files',
          accept: ['image/*']
        }]
      }
    })
  })

  it('keeps destination selection, permissions, and draft handoff inside the authenticated workspace', () => {
    const viewSource = readFileSync(resolve('src/views/ShareTargetView.vue'), 'utf8')
    const routerSource = readFileSync(resolve('src/router/index.js'), 'utf8')
    const loginSource = readFileSync(resolve('src/views/LoginView.vue'), 'utf8')

    expect(viewSource).toContain('data-testid="share-target-view"')
    expect(viewSource).toContain('data-testid="share-target-destination"')
    expect(viewSource).toContain('data-testid="share-target-continue"')
    expect(viewSource).toContain("['active', 'scheduled'].includes(meeting.status)")
    expect(viewSource).toContain("params: { channel_id: channelId }")
    expect(viewSource).toContain('this.messagesStore.appendDraftContent(target.channelId')
    expect(viewSource).not.toContain('this.messagesStore.sendToChannel(')
    expect(viewSource).toContain('markShareFileUploaded(currentPayload.id, entry.id, uploaded)')
    expect(viewSource).toContain('await removeSharePayload(this.shareId)')

    expect(routerSource).toContain("path: 'share/:shareId?'")
    expect(routerSource).toContain("name: 'ShareTarget'")
    expect(routerSource).toContain('query: { returnTo: to.fullPath }')
    expect(loginSource).toContain("return resolved.name === 'ShareTarget' ? returnTo : '/'")
  })
})
