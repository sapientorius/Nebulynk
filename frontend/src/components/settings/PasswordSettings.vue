<template>
          <n-card v-if="active" :title="$t('ui.views.settings_security')">
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


</template>

<script>
import { translateApiError } from '../../lib/api-error.js'
import { getSelfRegistrationConfig } from '../../lib/api.js'
import { DEFAULT_PASSWORD_POLICY, isPasswordValidForPolicy, normalizePasswordPolicy } from '../../lib/password-policy.js'
import { useSessionStore } from '../../stores/index.js'


export default {
  name: 'PasswordSettings',
  components: {  },
  emits: [],
  props: { active: Boolean,
isMobileLayout: Boolean },
  data() { return {
savingPassword: false,
securityError: '',
passwordPolicy: DEFAULT_PASSWORD_POLICY,
securityForm: {
        currentPassword: '',
        newPassword: '',
        newPasswordConfirm: ''
      }
  } },
  computed: {
passwordPolicyHint() {
      const policy = normalizePasswordPolicy(this.passwordPolicy)
      return this.$t('passwordPolicy.requirement', {
        minLength: policy.min_length,
        minTypes: policy.min_types
      })
    },
sessionStore() {
      return useSessionStore()
    }
  },
  watch: {

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
resetSecurityForm() {
      this.securityForm.currentPassword = ''
      this.securityForm.newPassword = ''
      this.securityForm.newPasswordConfirm = ''
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

.settings-password-policy {
  margin: -8px 0 16px;
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.7;
}

@media (max-width: 900px) {

  .passkey-item :deep(.n-button) {
    width: 100%;
  }

  .archived-channel-item :deep(.n-button) {
    width: 100%;
  }
}

</style>
