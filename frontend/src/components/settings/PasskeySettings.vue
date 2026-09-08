<template>
          <n-card v-if="active" :title="$t('passkeys.title')">
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


</template>

<script>
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser'
import { translateApiError } from '../../lib/api-error.js'
import { useSessionStore } from '../../stores/index.js'


export default {
  name: 'PasskeySettings',
  components: {  },
  emits: [],
  props: { active: Boolean,
isMobileLayout: Boolean },
  data() { return {
passkeysLoading: false,
passkeysActionLoading: false,
passkeysError: '',
passkeyUnsupported: false,
showPasskeyCreateForm: false,
passkeys: [],
passkeySetupForm: {
        currentPassword: '',
        name: ''
      },
passkeyDeleteForm: {
        passkeyId: '',
        currentPassword: ''
      }
  } },
  computed: {
sessionStore() {
      return useSessionStore()
    },
isGuestAccount() {
      return this.sessionStore.user?.account_type === 'guest'
    }
  },
  watch: {

  },

  methods: {
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
resetPasskeySetupForm() {
      this.passkeySetupForm.currentPassword = ''
      this.passkeySetupForm.name = ''
    },
resetPasskeyDeleteForm() {
      this.passkeyDeleteForm.passkeyId = ''
      this.passkeyDeleteForm.currentPassword = ''
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

@media (max-width: 900px) {

  .passkey-item {
    align-items: flex-start;
    flex-direction: column;
  }

  .passkey-item :deep(.n-button) {
    width: 100%;
  }

  .archived-channel-item :deep(.n-button) {
    width: 100%;
  }
}

</style>
