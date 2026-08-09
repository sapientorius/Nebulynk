<template>
  <div class="settings-shell" data-testid="settings-view">
    <header class="settings-header">
      <n-space align="center" :size="16">
        <n-button text @click="goBackToChat">{{ $t('ui.views.back_to_chat') }}</n-button>
        <n-divider vertical v-if="!isMobileLayout" />
        <h2 class="settings-page-title">{{ $t('ui.views.settings') }}</h2>
      </n-space>
      <UserAccountMenu @logout="doLogout" />
    </header>

    <div class="settings-body">
      <aside v-if="!isMobileLayout" class="settings-sidebar">
        <n-menu
          :options="menuOptions"
          :value="activeTab"
          @update:value="activeTab = $event"
        />
      </aside>

      <main class="settings-content">
        <div v-if="isMobileLayout" class="settings-mobile-toolbar">
          <span class="settings-mobile-section-label" data-testid="settings-mobile-section-label">
            {{ activeMenuLabel }}
          </span>
          <n-button
            quaternary
            size="small"
            data-testid="settings-mobile-menu-trigger"
            :title="$t('ui.views.settings')"
            @click="showMobileMenu = true"
          >
            <template #icon><n-icon size="16"><menu-icon /></n-icon></template>
            {{ $t('ui.views.settings') }}
          </n-button>
        </div>

        <n-space vertical :size="20">
          <n-card v-if="activeTab === 'general'" :title="$t('ui.views.settings_general')">
            <n-space vertical :size="18">
              <p class="settings-intro">{{ $t('ui.views.settings_general_description') }}</p>
              <n-form :model="generalForm" label-placement="top">
                <n-form-item :label="$t('profile.labels.preferredLanguage')">
                  <n-select
                    v-model:value="generalForm.preferredLocale"
                    :options="localeOptions"
                    data-testid="settings-language-select"
                  />
                </n-form-item>
                <n-form-item :label="$t('ui.views.settings_theme')">
                  <n-select
                    v-model:value="generalForm.themePreference"
                    :options="themePreferenceOptions"
                    data-testid="settings-theme-select"
                  />
                </n-form-item>
              </n-form>
              <n-space justify="end">
                <n-button
                  type="primary"
                  :loading="savingProfile"
                  data-testid="settings-save-general"
                  @click="saveGeneral"
                >
                  {{ $t('common.save') }}
                </n-button>
              </n-space>
            </n-space>
          </n-card>

          <n-card v-if="activeTab === 'general'" :title="$t('ui.views.settings_notifications')">
            <n-space class="settings-toggle-row" align="center" justify="space-between" style="width: 100%">
              <div class="settings-toggle-copy">
                <strong>{{ notificationToggleLabel }}</strong>
                <span>{{ notificationToggleDescription }}</span>
              </div>
              <n-switch
                :value="notificationsStore.pushEnabled"
                :loading="pushLoading"
                data-testid="settings-enable-notifications"
                :disabled="!notificationsStore.canToggleNotifications"
                @update:value="togglePush"
              />
            </n-space>
          </n-card>

          <n-card
            v-if="activeTab === 'general' && showInstallCard"
            :title="$t('pwa.install_title')"
            data-testid="settings-install-app-card"
          >
            <n-space class="settings-toggle-row" align="center" justify="space-between" style="width: 100%">
              <div class="settings-toggle-copy">
                <strong>{{ $t('pwa.install_heading') }}</strong>
                <span>
                  {{
                    pwaInstallState.requiresManualInstall
                      ? $t('pwa.install_manual_description')
                      : $t('pwa.install_description')
                  }}
                </span>
              </div>
              <n-button
                type="primary"
                data-testid="settings-install-app"
                @click="installApp"
              >
                {{
                  pwaInstallState.requiresManualInstall
                    ? $t('pwa.install_manual_action')
                    : $t('pwa.install_action')
                }}
              </n-button>
            </n-space>
          </n-card>

          <n-card v-if="activeTab === 'security'" :title="$t('ui.views.settings_security')">
            <n-space vertical :size="18">
              <p class="settings-intro">{{ $t('ui.views.settings_security_description') }}</p>
              <n-form :model="securityForm" label-placement="top">
                <n-form-item :label="$t('passwordChange.fields.currentPassword')">
                  <n-input
                    v-model:value="securityForm.currentPassword"
                    type="password"
                    show-password-on="click"
                    :placeholder="$t('passwordChange.placeholders.currentPassword')"
                    :input-props="{ 'data-testid': 'settings-current-password' }"
                  />
                </n-form-item>
                <n-form-item :label="$t('passwordChange.fields.newPassword')">
                  <n-input
                    v-model:value="securityForm.newPassword"
                    type="password"
                    show-password-on="click"
                    :placeholder="$t('passwordChange.placeholders.newPassword')"
                    :input-props="{ 'data-testid': 'settings-new-password' }"
                  />
                </n-form-item>
                <p class="settings-password-policy">{{ passwordPolicyHint }}</p>
                <n-form-item :label="$t('passwordChange.fields.newPasswordConfirm')">
                  <n-input
                    v-model:value="securityForm.newPasswordConfirm"
                    type="password"
                    show-password-on="click"
                    :placeholder="$t('passwordChange.placeholders.newPasswordConfirm')"
                    :input-props="{ 'data-testid': 'settings-new-password-confirm' }"
                  />
                </n-form-item>
              </n-form>
              <n-alert v-if="securityError" type="error" data-testid="settings-security-error">
                {{ securityError }}
              </n-alert>
              <n-space justify="end">
                <n-button
                  type="primary"
                  :loading="savingPassword"
                  data-testid="settings-save-security"
                  @click="saveSecurity"
                >
                  {{ $t('passwordChange.buttons.save') }}
                </n-button>
              </n-space>
            </n-space>
          </n-card>

          <n-card v-if="activeTab === 'security'" :title="$t('twoFactor.title')">
            <n-space vertical :size="18">
              <p class="settings-intro">{{ $t('twoFactor.description') }}</p>

              <n-alert v-if="isGuestAccount" type="info" data-testid="settings-2fa-guest-unavailable">
                {{ $t('twoFactor.messages.guestUnavailable') }}
              </n-alert>

              <template v-else>
                <n-spin :show="twoFactorLoading">
                  <n-space vertical :size="16">
                    <div class="two-factor-status-row" data-testid="settings-2fa-status">
                      <strong>{{ currentTwoFactorStatusLabel }}</strong>
                      <span v-if="twoFactorStatus.enabled && twoFactorStatus.method">
                        {{ $t('twoFactor.method.totp') }}
                      </span>
                      <span v-if="twoFactorStatus.enabled">
                        {{ $t('twoFactor.messages.recoveryCodesRemaining', { count: twoFactorStatus.recoveryCodesRemaining || 0 }) }}
                      </span>
                    </div>

                    <n-alert v-if="twoFactorError" type="error" data-testid="settings-2fa-error">
                      {{ twoFactorError }}
                    </n-alert>

                    <n-alert
                      v-if="twoFactorRecoveryCodes.length > 0"
                      type="warning"
                      data-testid="settings-2fa-recovery-codes"
                    >
                      <div class="two-factor-recovery-copy">
                        <strong>{{ $t('twoFactor.messages.recoveryCodesShownOnce') }}</strong>
                        <span>{{ $t('twoFactor.messages.recoveryCodesHint') }}</span>
                      </div>
                      <pre class="two-factor-recovery-list">{{ twoFactorRecoveryCodes.join('\n') }}</pre>
                    </n-alert>

                    <template v-if="!twoFactorStatus.enabled && !twoFactorSetup.manualKey">
                      <n-button
                        type="primary"
                        :loading="twoFactorActionLoading"
                        data-testid="settings-2fa-start-setup"
                        @click="startTwoFactorSetup"
                      >
                        {{ twoFactorStatus.pendingSetup ? $t('twoFactor.buttons.restartSetup') : $t('twoFactor.buttons.startSetup') }}
                      </n-button>
                    </template>

                    <template v-if="twoFactorSetup.manualKey">
                      <div class="two-factor-setup-actions">
                        <section class="two-factor-action-card two-factor-action-card-qr">
                          <n-space vertical :size="10">
                            <strong>{{ $t('twoFactor.setup.scanTitle') }}</strong>
                            <span class="two-factor-action-copy">{{ $t('twoFactor.setup.scanDescription') }}</span>
                            <div class="two-factor-qr" data-testid="settings-2fa-qr" v-html="twoFactorSetup.qrSvg"></div>
                          </n-space>
                        </section>

                        <section class="two-factor-action-card two-factor-action-card-launch">
                          <n-space vertical :size="10">
                            <strong>{{ $t('twoFactor.setup.openAppTitle') }}</strong>
                            <span class="two-factor-action-copy">{{ $t('twoFactor.setup.openAppDescription') }}</span>
                            <n-button
                              type="primary"
                              :block="isMobileLayout"
                              data-testid="settings-2fa-open-authenticator"
                              @click="openTwoFactorAuthenticatorApp"
                            >
                              {{ $t('twoFactor.buttons.openAuthenticator') }}
                            </n-button>
                            <span class="two-factor-action-hint">{{ $t('twoFactor.messages.authenticatorAppRequired') }}</span>
                          </n-space>
                        </section>
                      </div>

                      <details class="two-factor-manual-details">
                        <summary class="two-factor-manual-summary" data-testid="settings-2fa-manual-toggle">
                          {{ $t('twoFactor.buttons.showManualSetup') }}
                        </summary>
                        <n-space vertical :size="14" class="two-factor-manual-panel">
                          <span class="two-factor-action-copy">{{ $t('twoFactor.setup.manualDescription') }}</span>
                          <n-form-item :label="$t('twoFactor.fields.manualKey')">
                            <div class="two-factor-copy-field">
                              <n-input
                                :value="twoFactorSetup.manualKey"
                                readonly
                                :input-props="{ 'data-testid': 'settings-2fa-manual-key' }"
                              />
                              <n-button
                                data-testid="settings-2fa-copy-manual-key"
                                @click="copyTwoFactorValue(twoFactorSetup.manualKey, 'twoFactor.messages.manualKeyCopied', 'twoFactor.errors.copyManualKeyFailed')"
                              >
                                {{ $t('twoFactor.buttons.copyManualKey') }}
                              </n-button>
                            </div>
                          </n-form-item>
                          <n-form-item :label="$t('twoFactor.fields.otpauthUrl')">
                            <div class="two-factor-copy-field">
                              <n-input
                                :value="twoFactorSetup.otpauthUrl"
                                readonly
                                :input-props="{ 'data-testid': 'settings-2fa-otpauth-url' }"
                              />
                              <n-button
                                data-testid="settings-2fa-copy-otpauth-url"
                                @click="copyTwoFactorValue(twoFactorSetup.otpauthUrl, 'twoFactor.messages.setupUrlCopied', 'twoFactor.errors.copySetupUrlFailed')"
                              >
                                {{ $t('twoFactor.buttons.copySetupUrl') }}
                              </n-button>
                            </div>
                          </n-form-item>
                        </n-space>
                      </details>

                      <n-form :model="twoFactorForm" label-placement="top">
                        <n-form-item :label="$t('twoFactor.fields.currentPassword')">
                          <n-input
                            v-model:value="twoFactorForm.currentPassword"
                            type="password"
                            show-password-on="click"
                            :placeholder="$t('twoFactor.placeholders.currentPassword')"
                            :input-props="{ 'data-testid': 'settings-2fa-current-password' }"
                          />
                        </n-form-item>
                        <n-form-item :label="$t('twoFactor.fields.code')">
                          <n-input
                            v-model:value="twoFactorForm.code"
                            :placeholder="$t('twoFactor.placeholders.code')"
                            :input-props="{ 'data-testid': 'settings-2fa-code' }"
                          />
                        </n-form-item>
                      </n-form>
                      <n-space justify="end">
                        <n-button
                          quaternary
                          data-testid="settings-2fa-cancel-setup"
                          @click="cancelTwoFactorSetup"
                        >
                          {{ $t('twoFactor.buttons.cancelSetup') }}
                        </n-button>
                        <n-button
                          type="primary"
                          :loading="twoFactorActionLoading"
                          data-testid="settings-2fa-confirm-setup"
                          @click="confirmTwoFactorSetup"
                        >
                          {{ $t('twoFactor.buttons.confirmSetup') }}
                        </n-button>
                      </n-space>
                    </template>

                    <template v-if="twoFactorStatus.enabled">
                      <n-form :model="twoFactorForm" label-placement="top">
                        <n-form-item :label="$t('twoFactor.fields.currentPassword')">
                          <n-input
                            v-model:value="twoFactorForm.currentPassword"
                            type="password"
                            show-password-on="click"
                            :placeholder="$t('twoFactor.placeholders.currentPassword')"
                            :input-props="{ 'data-testid': 'settings-2fa-enabled-current-password' }"
                          />
                        </n-form-item>
                        <n-form-item :label="$t('twoFactor.fields.code')">
                          <n-input
                            v-model:value="twoFactorForm.code"
                            :placeholder="$t('twoFactor.placeholders.code')"
                            :input-props="{ 'data-testid': 'settings-2fa-enabled-code' }"
                          />
                        </n-form-item>
                      </n-form>
                      <n-space justify="end">
                        <n-button
                          :loading="twoFactorActionLoading"
                          data-testid="settings-2fa-regenerate-codes"
                          @click="regenerateTwoFactorRecoveryCodes"
                        >
                          {{ $t('twoFactor.buttons.regenerateCodes') }}
                        </n-button>
                        <n-button
                          type="error"
                          :loading="twoFactorActionLoading"
                          data-testid="settings-2fa-disable"
                          @click="disableTwoFactor"
                        >
                          {{ $t('twoFactor.buttons.disable') }}
                        </n-button>
                      </n-space>
                    </template>
                  </n-space>
                </n-spin>
              </template>
            </n-space>
          </n-card>

          <n-card v-if="activeTab === 'security'" :title="$t('passkeys.title')">
            <n-space vertical :size="18">
              <p class="settings-intro">{{ $t('passkeys.description') }}</p>

              <n-alert v-if="isGuestAccount" type="info" data-testid="settings-passkeys-guest-unavailable">
                {{ $t('twoFactor.messages.guestUnavailable') }}
              </n-alert>

              <template v-else>
                <n-spin :show="passkeysLoading">
                  <n-space vertical :size="16">
                    <n-alert v-if="passkeyUnsupported" type="info" data-testid="settings-passkeys-unsupported">
                      {{ $t('passkeys.unsupported') }}
                    </n-alert>

                    <n-alert v-if="passkeysError" type="error" data-testid="settings-passkeys-error">
                      {{ passkeysError }}
                    </n-alert>

                    <span data-testid="settings-passkeys-summary">
                      {{
                        passkeys.length > 0
                          ? $t('passkeys.messages.available', { count: passkeys.length })
                          : $t('passkeys.empty')
                      }}
                    </span>

                    <div v-if="passkeys.length === 0" class="passkeys-empty" data-testid="settings-passkeys-empty">
                      {{ $t('passkeys.empty') }}
                    </div>

                    <div v-for="passkey in passkeys" :key="passkey.id" class="passkey-item" data-testid="settings-passkey-item">
                      <div class="passkey-item-copy">
                        <strong>{{ formatPasskeyName(passkey) }}</strong>
                        <span>{{ formatPasskeyDetails(passkey) }}</span>
                      </div>
                      <n-button
                        size="small"
                        :disabled="passkeysActionLoading"
                        :data-testid="`settings-passkey-remove-${passkey.id}`"
                        @click="beginPasskeyDelete(passkey)"
                      >
                        {{ $t('passkeys.buttons.remove') }}
                      </n-button>
                    </div>

                    <template v-if="showPasskeyCreateForm">
                      <n-form :model="passkeySetupForm" label-placement="top">
                        <n-form-item :label="$t('passkeys.fields.currentPassword')">
                          <n-input
                            v-model:value="passkeySetupForm.currentPassword"
                            type="password"
                            show-password-on="click"
                            :placeholder="$t('passkeys.placeholders.currentPassword')"
                            :input-props="{ 'data-testid': 'settings-passkeys-current-password' }"
                          />
                        </n-form-item>
                        <n-form-item :label="$t('passkeys.fields.name')">
                          <n-input
                            v-model:value="passkeySetupForm.name"
                            :placeholder="$t('passkeys.placeholders.name')"
                            :input-props="{ 'data-testid': 'settings-passkeys-name' }"
                          />
                        </n-form-item>
                      </n-form>
                      <n-space justify="end">
                        <n-button data-testid="settings-passkeys-cancel-setup" @click="cancelPasskeyRegistration">
                          {{ $t('passkeys.buttons.cancel') }}
                        </n-button>
                        <n-button
                          type="primary"
                          :loading="passkeysActionLoading"
                          :disabled="passkeyUnsupported"
                          data-testid="settings-passkeys-confirm-setup"
                          @click="createPasskey"
                        >
                          {{ $t('passkeys.buttons.create') }}
                        </n-button>
                      </n-space>
                    </template>

                    <n-button
                      v-else
                      type="primary"
                      :disabled="passkeyUnsupported"
                      :loading="passkeysActionLoading"
                      data-testid="settings-passkeys-start-setup"
                      @click="openPasskeyRegistration"
                    >
                      {{ $t('passkeys.buttons.add') }}
                    </n-button>

                    <template v-if="passkeyDeleteForm.passkeyId">
                      <n-form :model="passkeyDeleteForm" label-placement="top">
                        <n-form-item :label="$t('passkeys.fields.currentPassword')">
                          <n-input
                            v-model:value="passkeyDeleteForm.currentPassword"
                            type="password"
                            show-password-on="click"
                            :placeholder="$t('passkeys.placeholders.currentPassword')"
                            :input-props="{ 'data-testid': 'settings-passkeys-delete-current-password' }"
                          />
                        </n-form-item>
                      </n-form>
                      <n-space justify="end">
                        <n-button data-testid="settings-passkeys-cancel-delete" @click="cancelPasskeyDelete">
                          {{ $t('passkeys.buttons.cancel') }}
                        </n-button>
                        <n-button
                          type="error"
                          :loading="passkeysActionLoading"
                          data-testid="settings-passkeys-confirm-delete"
                          @click="deletePasskey"
                        >
                          {{ $t('passkeys.buttons.confirmRemove') }}
                        </n-button>
                      </n-space>
                    </template>
                  </n-space>
                </n-spin>
              </template>
            </n-space>
          </n-card>

          <n-card v-if="activeTab === 'voice'" :title="$t('ui.views.settings_voice')">
            <p class="settings-intro">{{ $t('ui.views.settings_voice_description') }}</p>
            <VoiceSettingsContent :active="activeTab === 'voice'" />
          </n-card>

          <n-card v-if="activeTab === 'video'" :title="$t('ui.views.settings_video')">
            <p class="settings-intro">{{ $t('ui.views.settings_video_description') }}</p>
            <VideoSettingsContent :active="activeTab === 'video'" />
          </n-card>

          <n-card
            v-if="activeTab === 'archived-channels' && canManageChannels"
            :title="$t('ui.views.settings_archived_channels')"
          >
            <n-space vertical :size="18">
              <p class="settings-intro">{{ $t('ui.views.settings_archived_channels_description') }}</p>
              <div
                v-if="archivedChannels.length === 0"
                class="archived-channels-empty"
                data-testid="settings-archived-channels-empty"
              >
                {{ $t('ui.views.settings_archived_channels_empty') }}
              </div>
              <div
                v-for="channel in archivedChannels"
                :key="channel.id"
                class="archived-channel-item"
                data-testid="settings-archived-channel-item"
              >
                <div class="archived-channel-main">
                  <span class="archived-channel-name">
                    <n-icon size="13" class="channel-type-icon">
                      <earth-icon v-if="channel.type === 'public'" />
                      <lock-closed-icon v-else />
                    </n-icon>
                    <n-icon v-if="channel.is_voice" size="14" class="voice-prefix-icon"><volume-high-icon /></n-icon>
                    <span>{{ channel.name }}</span>
                  </span>
                  <span class="archived-channel-meta">{{ channel.topic || channel.description || '' }}</span>
                </div>
                <n-button
                  size="small"
                  quaternary
                  :data-testid="`settings-restore-channel-${channel.id}`"
                  @click="restoreArchivedChannel(channel)"
                >
                  {{ $t('sidebar.buttons.restore') }}
                </n-button>
              </div>
            </n-space>
          </n-card>
        </n-space>
      </main>
    </div>

    <n-drawer
      v-model:show="showMobileMenu"
      placement="left"
      :width="280"
      data-testid="settings-mobile-menu-drawer"
    >
      <n-drawer-content :title="$t('ui.views.settings')" body-content-style="padding: 0;">
        <n-menu
          :options="menuOptions"
          :value="activeTab"
          @update:value="onMobileMenuSelect"
        />
      </n-drawer-content>
    </n-drawer>

    <StatusPicker v-if="showStatusPicker" />
    <UserProfileCard v-if="showUserProfileCard" />
  </div>
</template>

<script>
import { defineAsyncComponent } from 'vue'
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser'
import {
  MenuOutline as MenuIcon,
  VolumeHighOutline as VolumeHighIcon,
  EarthOutline as EarthIcon,
  LockClosedOutline as LockClosedIcon
} from '@vicons/ionicons5'
import { getLocaleOptions } from '../lib/i18n.js'
import { observeMobileLayout, readIsMobileLayout } from '../lib/mobile-layout.js'
import {
  getPwaInstallState,
  initPwaInstallTracking,
  promptForAppInstall,
  subscribeToPwaInstallState
} from '../lib/pwa.js'
import { translateApiError } from '../lib/api-error.js'
import { getSelfRegistrationConfig } from '../lib/api.js'
import { DEFAULT_PASSWORD_POLICY, isPasswordValidForPolicy, normalizePasswordPolicy } from '../lib/password-policy.js'
import { saveGeneralPreferences, toggleNotifications } from '../lib/settings-actions.js'
import { isAnyDesktopRuntime } from '../lib/runtime.js'
import { useChannelsStore, useNotificationsStore, useSessionStore, useUiStore } from '../stores/index.js'

const UserAccountMenu = defineAsyncComponent(() => import('../components/UserAccountMenu.vue'))
const VideoSettingsContent = defineAsyncComponent(() => import('../components/VideoSettingsContent.vue'))
const VoiceSettingsContent = defineAsyncComponent(() => import('../components/VoiceSettingsContent.vue'))
const StatusPicker = defineAsyncComponent(() => import('../components/StatusPicker.vue'))
const UserProfileCard = defineAsyncComponent(() => import('../components/UserProfileCard.vue'))

export default {
  name: 'SettingsView',
  components: {
    UserAccountMenu,
    VideoSettingsContent,
    VoiceSettingsContent,
    StatusPicker,
    UserProfileCard,
    MenuIcon,
    VolumeHighIcon,
    EarthIcon,
    LockClosedIcon
  },
  data() {
    return {
      activeTab: 'general',
      showMobileMenu: false,
      isMobileLayout: readIsMobileLayout(),
      stopObservingMobileLayout: null,
      stopListeningPwaInstallState: null,
      savingProfile: false,
      savingPassword: false,
      pushLoading: false,
      securityError: '',
      passwordPolicy: DEFAULT_PASSWORD_POLICY,
      twoFactorLoading: false,
      twoFactorActionLoading: false,
      twoFactorError: '',
      passkeysLoading: false,
      passkeysActionLoading: false,
      passkeysError: '',
      passkeyUnsupported: false,
      showPasskeyCreateForm: false,
      passkeys: [],
      twoFactorStatus: {
        enabled: false,
        method: null,
        recoveryCodesRemaining: 0,
        pendingSetup: false
      },
      twoFactorSetup: {
        manualKey: '',
        otpauthUrl: '',
        qrSvg: '',
        expiresAt: null
      },
      twoFactorRecoveryCodes: [],
      pwaInstallState: getPwaInstallState(),
      generalForm: {
        preferredLocale: 'en',
        themePreference: 'platform'
      },
      securityForm: {
        currentPassword: '',
        newPassword: '',
        newPasswordConfirm: ''
      },
      twoFactorForm: {
        currentPassword: '',
        code: ''
      },
      passkeySetupForm: {
        currentPassword: '',
        name: ''
      },
      passkeyDeleteForm: {
        passkeyId: '',
        currentPassword: ''
      }
    }
  },
  computed: {
    sessionStore() {
      return useSessionStore()
    },
    notificationsStore() {
      return useNotificationsStore()
    },
    channelsStore() {
      return useChannelsStore()
    },
    uiStore() {
      return useUiStore()
    },
    localeOptions() {
      return getLocaleOptions()
    },
    themePreferenceOptions() {
      return [
        { label: this.$t('ui.views.settings_theme_platform'), value: 'platform' },
        { label: this.$t('ui.views.settings_theme_light'), value: 'light' },
        { label: this.$t('ui.views.settings_theme_dark'), value: 'dark' },
        { label: this.$t('ui.views.settings_theme_system'), value: 'system' }
      ]
    },
    activeMenuLabel() {
      return this.menuOptions.find((entry) => entry.key === this.activeTab)?.label || this.$t('ui.views.settings')
    },
    menuOptions() {
      const options = [
        { label: this.$t('ui.views.settings_general'), key: 'general' },
        { label: this.$t('ui.views.settings_security'), key: 'security' },
        { label: this.$t('ui.views.settings_voice'), key: 'voice' },
        { label: this.$t('ui.views.settings_video'), key: 'video' }
      ]
      if (this.canManageChannels) {
        options.push({
          label: this.$t('ui.views.settings_archived_channels'),
          key: 'archived-channels'
        })
      }
      return options
    },
    canManageChannels() {
      return this.channelsStore.can('manage_channels')
    },
    archivedChannels() {
      return this.channelsStore.archivedChannels
        .filter((channel) => channel.is_archived && channel.purpose !== 'meeting')
        .sort((left, right) => (left.name || '').localeCompare(right.name || ''))
    },
    showStatusPicker() {
      return this.uiStore.showStatusModal
    },
    isDesktopMode() {
      return isAnyDesktopRuntime()
    },
    notificationToggleLabel() {
      return this.isDesktopMode
        ? 'Desktop notifications'
        : this.$t('ui.components.browser_notifications')
    },
    notificationToggleDescription() {
      return this.isDesktopMode
        ? 'Deliver notifications through the desktop app while this server profile stays signed in.'
        : this.$t('ui.views.settings_notifications_description')
    },
    showUserProfileCard() {
      return this.uiStore.showProfileDrawer
    },
    showInstallCard() {
      if (isAnyDesktopRuntime()) return false
      return this.pwaInstallState.isInstallSupported
        && !this.pwaInstallState.isInstalled
        && this.pwaInstallState.canInstall
    },
    isGuestAccount() {
      return this.sessionStore.user?.account_type === 'guest'
    },
    currentTwoFactorStatusLabel() {
      if (this.twoFactorStatus.enabled) {
        return this.$t('twoFactor.status.enabled')
      }
      if (this.twoFactorSetup.manualKey || this.twoFactorStatus.pendingSetup) {
        return this.$t('twoFactor.status.pending')
      }
      return this.$t('twoFactor.status.disabled')
    },
    passwordPolicyHint() {
      const policy = normalizePasswordPolicy(this.passwordPolicy)
      return this.$t('passwordPolicy.requirement', {
        minLength: policy.min_length,
        minTypes: policy.min_types
      })
    }
  },
  async created() {
    await this.sessionStore.init()
    this.generalForm.preferredLocale = this.sessionStore.user?.preferred_locale || 'en'
    this.generalForm.themePreference = this.sessionStore.user?.theme_preference || 'platform'
    await this.loadTwoFactorStatus()
    await this.loadPasskeys()
    await this.loadPasswordPolicy()
    if (this.activeTab === 'archived-channels' && this.canManageChannels) {
      await this.channelsStore.refreshArchived()
    }
  },
  mounted() {
    initPwaInstallTracking()
    this.detectPasskeySupport()
    this.stopObservingMobileLayout = observeMobileLayout((matches) => {
      this.isMobileLayout = matches
    })
    this.stopListeningPwaInstallState = subscribeToPwaInstallState((state) => {
      this.pwaInstallState = state
    })
  },
  beforeUnmount() {
    this.stopObservingMobileLayout?.()
    this.stopListeningPwaInstallState?.()
  },
  watch: {
    isMobileLayout(value) {
      if (!value) {
        this.showMobileMenu = false
      }
    },
    async activeTab(value) {
      if (value === 'archived-channels' && this.canManageChannels) {
        await this.channelsStore.refreshArchived()
      }
    }
  },
  methods: {
    async loadPasswordPolicy() {
      try {
        const config = await getSelfRegistrationConfig()
        this.passwordPolicy = normalizePasswordPolicy(config?.password_policy)
      } catch {
        this.passwordPolicy = DEFAULT_PASSWORD_POLICY
      }
    },
    resolveReturnToChatRoute() {
      const returnTo = this.$route?.query?.returnTo
      if (typeof returnTo !== 'string') return '/channels'
      if (returnTo.startsWith('/channels') || returnTo.startsWith('/meetings')) return returnTo
      return '/channels'
    },
    goBackToChat() {
      this.$router.push(this.resolveReturnToChatRoute()).catch(() => {})
    },
    onMobileMenuSelect(value) {
      this.activeTab = value
      this.showMobileMenu = false
    },
    async restoreArchivedChannel(channel) {
      try {
        await this.channelsStore.update(channel.id, { is_archived: false })
        window.$message?.success(this.$t('sidebar.messages.restored'))
      } catch {
        window.$message?.error(this.$t('sidebar.messages.restoreFailed'))
      }
    },
    async saveGeneral() {
      this.savingProfile = true
      try {
        await saveGeneralPreferences(this.sessionStore, {
          preferredLocale: this.generalForm.preferredLocale,
          themePreference: this.generalForm.themePreference
        })
        window.$message?.success(this.$t('ui.views.settings_saved'))
      } catch {
        window.$message?.error(this.$t('profile.errors.saveFailed'))
      } finally {
        this.savingProfile = false
      }
    },
    resetSecurityForm() {
      this.securityForm.currentPassword = ''
      this.securityForm.newPassword = ''
      this.securityForm.newPasswordConfirm = ''
    },
    resetTwoFactorForm() {
      this.twoFactorForm.currentPassword = ''
      this.twoFactorForm.code = ''
    },
    resetTwoFactorSetup() {
      this.twoFactorSetup.manualKey = ''
      this.twoFactorSetup.otpauthUrl = ''
      this.twoFactorSetup.qrSvg = ''
      this.twoFactorSetup.expiresAt = null
    },
    resetPasskeySetupForm() {
      this.passkeySetupForm.currentPassword = ''
      this.passkeySetupForm.name = ''
    },
    resetPasskeyDeleteForm() {
      this.passkeyDeleteForm.passkeyId = ''
      this.passkeyDeleteForm.currentPassword = ''
    },
    async detectPasskeySupport() {
      try {
        this.passkeyUnsupported = !(await browserSupportsWebAuthn())
      } catch {
        this.passkeyUnsupported = true
      }
    },
    formatPasskeyName(passkey) {
      if (passkey?.name) {
        return passkey.name
      }

      return this.$t('passkeys.fallbackName', {
        date: this.formatPasskeyTimestamp(passkey?.createdAt)
      })
    },
    formatPasskeyTimestamp(value) {
      const date = value ? new Date(value) : null
      if (!date || Number.isNaN(date.getTime())) {
        return '-'
      }
      return date.toLocaleString()
    },
    formatPasskeyDetails(passkey) {
      const labels = []
      if (passkey?.deviceType) {
        labels.push(this.$t(`passkeys.labels.${passkey.deviceType}`))
      }
      if (passkey?.backedUp) {
        labels.push(this.$t('passkeys.labels.backedUp'))
      }
      if (passkey?.lastUsedAt) {
        labels.push(`${this.$t('passkeys.labels.lastUsed')}: ${this.formatPasskeyTimestamp(passkey.lastUsedAt)}`)
      } else if (passkey?.createdAt) {
        labels.push(`${this.$t('passkeys.labels.created')}: ${this.formatPasskeyTimestamp(passkey.createdAt)}`)
      }
      return labels.join(' / ')
    },
    async loadPasskeys() {
      if (this.isGuestAccount) {
        return
      }

      this.passkeysLoading = true
      try {
        const result = await this.sessionStore.getPasskeys()
        this.passkeys = result.passkeys || []
      } catch (error) {
        this.passkeysError = translateApiError(error, 'passkeys.errors.actionFailed')
      } finally {
        this.passkeysLoading = false
      }
    },
    async loadTwoFactorStatus() {
      if (this.isGuestAccount) {
        return
      }

      this.twoFactorLoading = true
      try {
        this.twoFactorStatus = await this.sessionStore.getTwoFactorStatus()
      } catch (error) {
        this.twoFactorError = translateApiError(error, 'twoFactor.errors.actionFailed')
      } finally {
        this.twoFactorLoading = false
      }
    },
    async startTwoFactorSetup() {
      this.twoFactorActionLoading = true
      this.twoFactorError = ''
      try {
        const data = await this.sessionStore.beginTwoFactorSetup()
        this.twoFactorSetup = {
          manualKey: data.manualKey || '',
          otpauthUrl: data.otpauthUrl || '',
          qrSvg: data.qrSvg || '',
          expiresAt: data.expiresAt || null
        }
        this.twoFactorStatus = {
          ...this.twoFactorStatus,
          enabled: false,
          method: null,
          pendingSetup: true
        }
        this.twoFactorRecoveryCodes = []
        window.$message?.success(this.$t('twoFactor.messages.setupStarted'))
      } catch (error) {
        this.twoFactorError = translateApiError(error, 'twoFactor.errors.actionFailed')
      } finally {
        this.twoFactorActionLoading = false
      }
    },
    cancelTwoFactorSetup() {
      this.resetTwoFactorForm()
      this.resetTwoFactorSetup()
      this.twoFactorError = ''
    },
    cancelPasskeyRegistration() {
      this.showPasskeyCreateForm = false
      this.resetPasskeySetupForm()
      this.passkeysError = ''
    },
    openPasskeyRegistration() {
      this.passkeysError = ''
      this.resetPasskeyDeleteForm()
      this.showPasskeyCreateForm = true
    },
    beginPasskeyDelete(passkey) {
      this.showPasskeyCreateForm = false
      this.resetPasskeySetupForm()
      this.passkeysError = ''
      this.passkeyDeleteForm.passkeyId = passkey?.id || ''
      this.passkeyDeleteForm.currentPassword = ''
    },
    cancelPasskeyDelete() {
      this.resetPasskeyDeleteForm()
      this.passkeysError = ''
    },
    async createPasskey() {
      this.passkeysError = ''
      if (!this.passkeySetupForm.currentPassword) {
        this.passkeysError = this.$t('passkeys.errors.currentPasswordRequired')
        return
      }

      this.passkeysActionLoading = true
      try {
        const challenge = await this.sessionStore.beginPasskeyRegistration({
          currentPassword: this.passkeySetupForm.currentPassword
        })
        const registrationResponse = await startRegistration({
          optionsJSON: challenge.options
        })
        const result = await this.sessionStore.verifyPasskeyRegistration({
          challengeId: challenge.challengeId,
          registrationResponse,
          name: this.passkeySetupForm.name
        })
        this.passkeys = [result.passkey, ...this.passkeys.filter((entry) => entry.id !== result.passkey?.id)]
        this.cancelPasskeyRegistration()
        window.$message?.success(this.$t('passkeys.messages.created'))
      } catch (error) {
        this.passkeysError = translateApiError(error, error?.message || 'passkeys.errors.actionFailed')
      } finally {
        this.passkeysActionLoading = false
      }
    },
    async deletePasskey() {
      this.passkeysError = ''
      if (!this.passkeyDeleteForm.currentPassword) {
        this.passkeysError = this.$t('passkeys.errors.currentPasswordRequired')
        return
      }

      this.passkeysActionLoading = true
      try {
        await this.sessionStore.deletePasskey(this.passkeyDeleteForm.passkeyId, {
          currentPassword: this.passkeyDeleteForm.currentPassword
        })
        this.passkeys = this.passkeys.filter((entry) => entry.id !== this.passkeyDeleteForm.passkeyId)
        this.cancelPasskeyDelete()
        window.$message?.success(this.$t('passkeys.messages.removed'))
      } catch (error) {
        this.passkeysError = translateApiError(error, 'passkeys.errors.actionFailed')
      } finally {
        this.passkeysActionLoading = false
      }
    },
    openTwoFactorAuthenticatorApp() {
      try {
        const targetUrl = String(this.twoFactorSetup.otpauthUrl || '').trim()
        if (!targetUrl || typeof window === 'undefined') {
          throw new Error('Missing otpauth URL')
        }

        window.location.href = targetUrl
      } catch {
        window.$message?.error(this.$t('twoFactor.errors.openAuthenticatorFailed'))
      }
    },
    async copyTwoFactorValue(value, successMessageKey, failureMessageKey) {
      const normalizedValue = String(value || '').trim()
      if (
        !normalizedValue
        || typeof navigator === 'undefined'
        || typeof navigator.clipboard?.writeText !== 'function'
      ) {
        window.$message?.error(this.$t(failureMessageKey))
        return
      }

      try {
        await navigator.clipboard.writeText(normalizedValue)
        window.$message?.success(this.$t(successMessageKey))
      } catch {
        window.$message?.error(this.$t(failureMessageKey))
      }
    },
    validateTwoFactorActionForm() {
      this.twoFactorError = ''
      if (!this.twoFactorForm.currentPassword) {
        this.twoFactorError = this.$t('twoFactor.errors.currentPasswordRequired')
        return false
      }
      if (!this.twoFactorForm.code) {
        this.twoFactorError = this.$t('twoFactor.errors.codeRequired')
        return false
      }
      return true
    },
    async confirmTwoFactorSetup() {
      if (!this.validateTwoFactorActionForm()) return

      this.twoFactorActionLoading = true
      try {
        const result = await this.sessionStore.confirmTwoFactorSetup({
          currentPassword: this.twoFactorForm.currentPassword,
          code: this.twoFactorForm.code
        })
        this.twoFactorRecoveryCodes = result.recoveryCodes || []
        this.twoFactorStatus = {
          enabled: true,
          method: result.method || 'totp',
          recoveryCodesRemaining: result.recoveryCodesRemaining || this.twoFactorRecoveryCodes.length,
          pendingSetup: false
        }
        this.resetTwoFactorForm()
        this.resetTwoFactorSetup()
        window.$message?.success(this.$t('twoFactor.messages.enabled'))
      } catch (error) {
        this.twoFactorError = translateApiError(error, 'twoFactor.errors.actionFailed')
      } finally {
        this.twoFactorActionLoading = false
      }
    },
    async regenerateTwoFactorRecoveryCodes() {
      if (!this.validateTwoFactorActionForm()) return

      this.twoFactorActionLoading = true
      try {
        const result = await this.sessionStore.regenerateTwoFactorRecoveryCodes({
          currentPassword: this.twoFactorForm.currentPassword,
          code: this.twoFactorForm.code
        })
        this.twoFactorRecoveryCodes = result.recoveryCodes || []
        this.twoFactorStatus = {
          ...this.twoFactorStatus,
          recoveryCodesRemaining: result.recoveryCodesRemaining || this.twoFactorRecoveryCodes.length
        }
        this.resetTwoFactorForm()
        window.$message?.success(this.$t('twoFactor.messages.recoveryCodesRegenerated'))
      } catch (error) {
        this.twoFactorError = translateApiError(error, 'twoFactor.errors.actionFailed')
      } finally {
        this.twoFactorActionLoading = false
      }
    },
    async disableTwoFactor() {
      if (!this.validateTwoFactorActionForm()) return

      this.twoFactorActionLoading = true
      try {
        await this.sessionStore.disableTwoFactor({
          currentPassword: this.twoFactorForm.currentPassword,
          code: this.twoFactorForm.code
        })
        this.twoFactorStatus = {
          enabled: false,
          method: null,
          recoveryCodesRemaining: 0,
          pendingSetup: false
        }
        this.twoFactorRecoveryCodes = []
        this.resetTwoFactorForm()
        this.resetTwoFactorSetup()
        window.$message?.success(this.$t('twoFactor.messages.disabled'))
      } catch (error) {
        this.twoFactorError = translateApiError(error, 'twoFactor.errors.actionFailed')
      } finally {
        this.twoFactorActionLoading = false
      }
    },
    async saveSecurity() {
      this.securityError = ''

      if (!this.securityForm.currentPassword || !this.securityForm.newPassword || !this.securityForm.newPasswordConfirm) {
        this.securityError = this.$t('passwordChange.errors.allFieldsRequired')
        return
      }

      if (!isPasswordValidForPolicy(this.securityForm.newPassword, this.passwordPolicy)) {
        this.securityError = this.passwordPolicyHint
        return
      }

      if (this.securityForm.newPassword !== this.securityForm.newPasswordConfirm) {
        this.securityError = this.$t('passwordChange.errors.passwordsMismatch')
        return
      }

      this.savingPassword = true
      try {
        await this.sessionStore.changePassword({
          currentPassword: this.securityForm.currentPassword,
          newPassword: this.securityForm.newPassword
        })
        this.resetSecurityForm()
        window.$message?.success(this.$t('passwordChange.success'))
      } catch (error) {
        this.securityError = translateApiError(error, 'passwordChange.errors.changeFailed')
      } finally {
        this.savingPassword = false
      }
    },
    async togglePush(enabled) {
      this.pushLoading = true
      try {
        const result = await toggleNotifications(this.notificationsStore, enabled)
        if (result === 'enabled') {
          window.$message?.success(this.isDesktopMode
            ? 'Desktop notifications enabled'
            : this.$t('ui.components.browser_notifications_enabled'))
        } else {
          window.$message?.info(this.isDesktopMode
            ? 'Desktop notifications disabled'
            : this.$t('ui.components.browser_notifications_disabled'))
        }
      } catch (error) {
        window.$message?.error(error.message || this.$t('ui.components.web_push_error'))
      } finally {
        this.pushLoading = false
      }
    },
    async installApp() {
      if (this.pwaInstallState.requiresManualInstall) {
        window.$message?.info(this.$t('pwa.install_manual_instructions'), { duration: 7000 })
        return
      }

      const result = await promptForAppInstall()
      if (result.outcome === 'accepted') {
        window.$message?.success(this.$t('pwa.install_success'))
        return
      }
      if (result.outcome === 'dismissed') {
        window.$message?.info(this.$t('pwa.install_dismissed'))
      }
    },
    async doLogout() {
      await this.sessionStore.logout()
      this.$router.push('/login')
    }
  }
}
</script>

<style scoped>
.settings-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--app-bg);
  color: var(--app-text);
}

.settings-header {
  padding: 12px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--app-border);
}

.settings-page-title {
  margin: 0;
  font-size: 18px;
}

.settings-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.settings-sidebar {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid var(--app-border);
  overflow-y: auto;
}

.settings-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 24px;
}

.settings-mobile-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.settings-mobile-section-label {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.72;
}

.settings-intro {
  margin: 0;
  opacity: 0.7;
  line-height: 1.5;
}

.settings-password-policy {
  margin: -8px 0 16px;
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.7;
}

.settings-toggle-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 520px;
}

.settings-toggle-copy span {
  font-size: 13px;
  opacity: 0.7;
  line-height: 1.5;
}

.settings-toggle-row {
  width: 100%;
}

.two-factor-status-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.two-factor-setup-actions {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1.3fr) minmax(280px, 0.7fr);
}

.two-factor-action-card {
  padding: 18px;
  border: 1px solid var(--app-border-strong);
  border-radius: 14px;
  background: var(--app-surface-muted);
}

.two-factor-action-card-qr {
  order: 1;
}

.two-factor-action-card-launch {
  order: 2;
}

.two-factor-action-copy,
.two-factor-action-hint {
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.74;
}

.two-factor-qr {
  display: flex;
  justify-content: center;
  padding: 8px;
  border-radius: 12px;
  background: #ffffff;
}

.two-factor-qr :deep(svg) {
  width: 100%;
  max-width: 320px;
  height: auto;
}

.two-factor-manual-details {
  border: 1px solid var(--app-border-strong);
  border-radius: 14px;
  background: var(--app-surface);
}

.two-factor-manual-summary {
  cursor: pointer;
  padding: 14px 16px;
  font-weight: 600;
  list-style: none;
}

.two-factor-manual-summary::-webkit-details-marker {
  display: none;
}

.two-factor-manual-panel {
  padding: 0 16px 16px;
}

.two-factor-copy-field {
  width: 100%;
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(0, 1fr) auto;
}

.two-factor-recovery-copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.two-factor-recovery-list {
  margin: 14px 0 0;
  padding: 14px;
  border-radius: 10px;
  overflow-x: auto;
  background: var(--app-surface-muted);
}

.passkeys-empty {
  padding: 14px 16px;
  border: 1px dashed var(--app-border-strong);
  border-radius: 10px;
  opacity: 0.7;
}

.passkey-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--app-border-soft);
  border-radius: 10px;
}

.passkey-item-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.passkey-item-copy span {
  font-size: 13px;
  opacity: 0.72;
  line-height: 1.5;
}

.archived-channels-empty {
  padding: 14px 16px;
  border: 1px dashed var(--app-border-strong);
  border-radius: 10px;
  opacity: 0.7;
}

.archived-channel-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--app-border-soft);
  border-radius: 10px;
}

.archived-channel-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.archived-channel-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-weight: 600;
}

.archived-channel-name span:last-child {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.archived-channel-meta {
  font-size: 13px;
  opacity: 0.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.channel-type-icon {
  line-height: 1;
  flex-shrink: 0;
  opacity: 0.85;
}

.voice-prefix-icon {
  line-height: 1;
  flex-shrink: 0;
}

@media (max-width: 900px) {
  .settings-header {
    padding: 12px;
  }

  .settings-content {
    padding: 16px 12px 20px;
  }

  .settings-toggle-copy {
    max-width: none;
  }

  .settings-toggle-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .two-factor-setup-actions {
    grid-template-columns: 1fr;
  }

  .two-factor-action-card-qr {
    order: 2;
  }

  .two-factor-action-card-launch {
    order: 1;
  }

  .two-factor-copy-field {
    grid-template-columns: 1fr;
  }

  .passkey-item {
    align-items: flex-start;
    flex-direction: column;
  }

  .passkey-item :deep(.n-button) {
    width: 100%;
  }

  .archived-channel-item {
    align-items: flex-start;
    flex-direction: column;
  }

  .archived-channel-item :deep(.n-button) {
    width: 100%;
  }
}
</style>
