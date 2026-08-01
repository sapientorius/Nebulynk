import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('UserProfileCard avatar flow source contract', () => {
  it('replaces manual avatar urls with upload, crop, and remove controls', () => {
    const source = readFileSync(resolve('src/components/UserProfileCard.vue'), 'utf8')

    expect(source).toContain("import UserAvatar from './UserAvatar.vue'")
    expect(source).toContain("import AvatarCropModal from './AvatarCropModal.vue'")
    expect(source).toContain("import AvatarCameraModal from './AvatarCameraModal.vue'")
    expect(source).toContain('data-testid="profile-avatar-input"')
    expect(source).toContain('data-testid="profile-avatar-upload"')
    expect(source).toContain('data-testid="profile-avatar-camera-open"')
    expect(source).toContain('data-testid="profile-avatar-remove"')
    expect(source).toContain('data-testid="profile-save"')
    expect(source).toContain('showAvatarCameraModal')
    expect(source).toContain('applyAvatarCameraCapture')
    expect(source).toContain('this.sessionStore.uploadOwnAvatar(this.pendingAvatarFile)')
    expect(source).toContain('this.sessionStore.removeOwnAvatar()')
    expect(source).not.toContain("profile.labels.avatarUrl")
    expect(source).not.toContain('avatar_url: this.editForm.avatarUrl')
  })

  it('only exposes the direct-message action for member-to-member profiles', () => {
    const source = readFileSync(resolve('src/components/UserProfileCard.vue'), 'utf8')

    expect(source).toContain("import { getPresenceStatusColor } from '../lib/user-presence.js'")
    expect(source).toContain('userPresence() {')
    expect(source).toContain('return this.sessionStore.resolveUserPresence(this.user)')
    expect(source).toContain("return this.$t('ui.components.connecting')")
    expect(source).toContain('v-if="canStartDirectMessage"')
    expect(source).toContain('canStartDirectMessage() {')
    expect(source).toContain("this.sessionStore.user?.account_type !== 'guest'")
    expect(source).toContain("this.user?.account_type === 'member'")
    expect(source).toContain('if (!this.canStartDirectMessage) return')
  })
})
