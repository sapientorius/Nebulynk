import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('SettingsView archived channels management', () => {
  it('adds a dedicated security tab with a password change form', () => {
    const source = readFileSync(resolve('src/views/SettingsView.vue'), 'utf8')

    expect(source).toContain("key: 'security'")
    expect(source).toContain("activeTab === 'security'")
    expect(source).toContain('settings_security')
    expect(source).toContain('settings_security_description')
    expect(source).toContain('passwordChange.fields.currentPassword')
    expect(source).toContain('passwordChange.fields.newPassword')
    expect(source).toContain('passwordChange.fields.newPasswordConfirm')
    expect(source).not.toContain('passwordChange.intro')
    expect(source).not.toContain('passwordChange.futureHint')
    expect(source).toContain("'data-testid': 'settings-current-password'")
    expect(source).toContain("'data-testid': 'settings-new-password'")
    expect(source).toContain("'data-testid': 'settings-new-password-confirm'")
    expect(source).toContain('data-testid="settings-save-security"')
    expect(source).toContain('this.sessionStore.changePassword({')
    expect(source).toContain("twoFactor.title")
    expect(source).toContain('data-testid="settings-2fa-start-setup"')
    expect(source).toContain('data-testid="settings-2fa-confirm-setup"')
    expect(source).toContain('data-testid="settings-2fa-regenerate-codes"')
    expect(source).toContain('data-testid="settings-2fa-disable"')
    expect(source).toContain('data-testid="settings-2fa-qr"')
    expect(source).toContain('data-testid="settings-2fa-open-authenticator"')
    expect(source).toContain('data-testid="settings-2fa-manual-toggle"')
    expect(source).toContain('data-testid="settings-2fa-copy-manual-key"')
    expect(source).toContain('data-testid="settings-2fa-copy-otpauth-url"')
    expect(source).toContain('this.sessionStore.beginTwoFactorSetup()')
    expect(source).toContain('this.sessionStore.confirmTwoFactorSetup({')
    expect(source).toContain('this.sessionStore.regenerateTwoFactorRecoveryCodes({')
    expect(source).toContain('this.sessionStore.disableTwoFactor({')
    expect(source).toContain('openTwoFactorAuthenticatorApp()')
    expect(source).toContain('copyTwoFactorValue(value, successMessageKey, failureMessageKey)')
    expect(source).toContain('passkeys.title')
    expect(source).toContain('data-testid="settings-passkeys-start-setup"')
    expect(source).toContain('data-testid="settings-passkeys-confirm-setup"')
    expect(source).toContain('data-testid="settings-passkeys-confirm-delete"')
    expect(source).toContain('data-testid="settings-passkey-item"')
    expect(source).toContain('this.sessionStore.beginPasskeyRegistration({')
    expect(source).toContain('this.sessionStore.verifyPasskeyRegistration({')
    expect(source).toContain('this.sessionStore.deletePasskey(this.passkeyDeleteForm.passkeyId, {')
    expect(source).toContain('await startRegistration({')
  })

  it('adds a permission-gated archived channels tab with restore actions', () => {
    const source = readFileSync(resolve('src/views/SettingsView.vue'), 'utf8')

    expect(source).toContain("key: 'archived-channels'")
    expect(source).toContain('this.canManageChannels')
    expect(source).toContain("activeTab === 'archived-channels'")
    expect(source).toContain('settings_archived_channels')
    expect(source).toContain('settings_archived_channels_description')
    expect(source).toContain('settings_archived_channels_empty')
    expect(source).toContain('data-testid="settings-archived-channel-item"')
    expect(source).toContain('settings-restore-channel-${channel.id}')
    expect(source).toContain("await this.channelsStore.update(channel.id, { is_archived: false })")
    expect(source).toContain("window.$message?.success(this.$t('sidebar.messages.restored'))")
  })

  it('adds a dedicated video settings tab with camera and background controls', () => {
    const source = readFileSync(resolve('src/views/SettingsView.vue'), 'utf8')
    const videoSource = readFileSync(resolve('src/components/VideoSettingsContent.vue'), 'utf8')

    expect(source).toContain("key: 'video'")
    expect(source).toContain("activeTab === 'video'")
    expect(source).toContain('settings_video')
    expect(source).toContain('settings_video_description')
    expect(source).toContain("const VideoSettingsContent = defineAsyncComponent(() => import('../components/VideoSettingsContent.vue'))")
    expect(videoSource).toContain('data-testid="video-settings-content"')
    expect(videoSource).toContain('data-testid="video-settings-camera-select"')
    expect(videoSource).toContain('data-testid="video-settings-background-mode"')
    expect(videoSource).toContain('data-testid="video-background-generate"')
    expect(videoSource).toContain('preferred_camera')
    expect(videoSource).toContain('background_blur')
    expect(videoSource).toContain('onBackgroundModeChange(mode)')
    expect(videoSource).toContain('selectBackground(background)')
    expect(videoSource).not.toContain("<strong>{{ $t('ui.views.background_blur') }}</strong>")
    expect(videoSource).not.toContain('background_blur_enabled_hint')
    expect(videoSource).toContain('updateMeetingVideoPreferences')
  })

  it('switches settings navigation to a mobile drawer layout', () => {
    const source = readFileSync(resolve('src/views/SettingsView.vue'), 'utf8')

    expect(source).toContain('data-testid="settings-mobile-menu-trigger"')
    expect(source).toContain('data-testid="settings-mobile-menu-drawer"')
    expect(source).toContain('data-testid="settings-mobile-section-label"')
    expect(source).toContain('observeMobileLayout((matches) => {')
    expect(source).toContain('onMobileMenuSelect(value)')
    expect(source).toContain('this.showMobileMenu = false')
  })

  it('adds a settings-scoped install CTA for supported PWA browsers', () => {
    const source = readFileSync(resolve('src/views/SettingsView.vue'), 'utf8')

    expect(source).toContain('data-testid="settings-install-app-card"')
    expect(source).toContain('data-testid="settings-install-app"')
    expect(source).toContain('showInstallCard')
    expect(source).toContain('subscribeToPwaInstallState((state) => {')
    expect(source).toContain('promptForAppInstall()')
    expect(source).toContain("window.$message?.info(this.$t('pwa.install_manual_instructions')")
  })

  it('keeps the notifications toggle available for desktop profiles through the shared settings surface', () => {
    const source = readFileSync(resolve('src/views/SettingsView.vue'), 'utf8')

    expect(source).toContain('data-testid="settings-enable-notifications"')
    expect(source).not.toContain('v-if="!isDesktopMode"')
    expect(source).toContain('notificationsStore.canToggleNotifications')
    expect(source).toContain('toggleNotifications(this.notificationsStore, enabled)')
    expect(source).toContain("'Desktop notifications'")
  })

  it('keeps archived channels out of the sidebar', () => {
    const source = readFileSync(resolve('src/components/ChannelSidebar.vue'), 'utf8')

    expect(source).not.toContain('sidebar.sections.archivedChannels')
    expect(source).not.toContain('archivedChannels()')
    expect(source).not.toContain('unarchiveChannel(channel)')
  })
})
