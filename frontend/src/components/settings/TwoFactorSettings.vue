<template>
          <n-card v-if="active" :title="$t('twoFactor.title')">
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


</template>

<script>
import { translateApiError } from '../../lib/api-error.js'
import { useSessionStore } from '../../stores/index.js'


export default {
  name: 'TwoFactorSettings',
  components: {  },
  emits: [],
  props: { active: Boolean,
isMobileLayout: Boolean },
  data() { return {
twoFactorLoading: false,
twoFactorActionLoading: false,
twoFactorError: '',
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
twoFactorForm: {
        currentPassword: '',
        code: ''
      }
  } },
  computed: {
sessionStore() {
      return useSessionStore()
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
    }
  },
  watch: {

  },

  methods: {
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
    }
  }
}
</script>

<style scoped>

.settings-intro {
  margin: 0;
  opacity: 0.7;
  line-height: 1.5;
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

@media (max-width: 900px) {

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

  .passkey-item :deep(.n-button) {
    width: 100%;
  }

  .archived-channel-item :deep(.n-button) {
    width: 100%;
  }
}

</style>
