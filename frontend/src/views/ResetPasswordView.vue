<template>
  <div class="reset-password-container" data-testid="reset-password-view">
    <n-card v-if="loadingInfo" style="max-width: 460px; width: 100%; text-align: center">
      <n-spin size="large" />
      <p style="margin-top: 16px; opacity: 0.6">{{ $t('passwordReset.reset.loading') }}</p>
    </n-card>

    <n-card v-else-if="error" style="max-width: 460px; width: 100%">
      <n-result status="error" :title="error" :description="$t('passwordReset.reset.invalidDescription')">
        <template #footer>
          <n-button type="primary" data-testid="reset-password-go-login" @click="$router.push('/login')">
            {{ $t('passwordReset.buttons.goToLogin') }}
          </n-button>
        </template>
      </n-result>
    </n-card>

    <n-card v-else style="max-width: 460px; width: 100%">
      <template #header>
        <div style="text-align: center">
          <h2 style="margin: 0 0 4px">{{ $t('passwordReset.reset.title') }}</h2>
          <p style="margin: 0; opacity: 0.7">{{ $t('passwordReset.reset.description') }}</p>
        </div>
      </template>

      <n-form :model="form" @submit.prevent="submitReset">
        <n-form-item :label="$t('passwordReset.fields.password')">
          <n-input
            v-model:value="form.password"
            type="password"
            show-password-on="click"
            :placeholder="$t('passwordReset.placeholders.password')"
            :input-props="{ 'data-testid': 'reset-password-input' }"
            @keyup.enter="submitReset"
          />
        </n-form-item>
        <p class="password-policy-hint">{{ passwordPolicyHint }}</p>
        <n-form-item :label="$t('passwordReset.fields.passwordConfirm')">
          <n-input
            v-model:value="form.passwordConfirm"
            type="password"
            show-password-on="click"
            :placeholder="$t('passwordReset.placeholders.passwordConfirm')"
            :input-props="{ 'data-testid': 'reset-password-confirm' }"
            @keyup.enter="submitReset"
          />
        </n-form-item>

        <n-alert v-if="formError" type="error" style="margin-bottom: 16px">
          {{ formError }}
        </n-alert>

        <n-button type="primary" block :loading="submitting" data-testid="reset-password-submit" @click="submitReset">
          {{ $t('passwordReset.buttons.savePassword') }}
        </n-button>
      </n-form>
    </n-card>
  </div>
</template>

<script>
import { usePasswordResetStore, useSessionStore } from '../stores/index.js'
import { translateApiError } from '../lib/api-error.js'
import { getSelfRegistrationConfig } from '../lib/api.js'
import { DEFAULT_PASSWORD_POLICY, isPasswordValidForPolicy, normalizePasswordPolicy } from '../lib/password-policy.js'

export default {
  name: 'ResetPasswordView',
  data() {
    return {
      loadingInfo: true,
      submitting: false,
      error: null,
      formError: null,
      passwordPolicy: DEFAULT_PASSWORD_POLICY,
      form: {
        password: '',
        passwordConfirm: ''
      }
    }
  },
  computed: {
    passwordResetStore() {
      return usePasswordResetStore()
    },
    sessionStore() {
      return useSessionStore()
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
    await Promise.all([this.loadToken(), this.loadPasswordPolicy()])
  },
  methods: {
    async loadToken() {
      try {
        await this.passwordResetStore.validateToken(this.$route.params.token)
      } catch (error) {
        this.error = translateApiError(error, 'passwordReset.errors.invalidToken')
      } finally {
        this.loadingInfo = false
      }
    },
    async loadPasswordPolicy() {
      try {
        const config = await getSelfRegistrationConfig()
        this.passwordPolicy = normalizePasswordPolicy(config?.password_policy)
      } catch {
        this.passwordPolicy = DEFAULT_PASSWORD_POLICY
      }
    },
    async submitReset() {
      this.formError = null

      if (!isPasswordValidForPolicy(this.form.password, this.passwordPolicy)) {
        this.formError = this.passwordPolicyHint
        return
      }

      if (this.form.password !== this.form.passwordConfirm) {
        this.formError = this.$t('passwordReset.errors.passwordsMismatch')
        return
      }

      this.submitting = true
      try {
        await this.passwordResetStore.resetPassword(this.$route.params.token, this.form.password)
        await this.sessionStore.clearLocalAuthentication()
        window.$message?.success(this.$t('passwordReset.reset.successMessage'))
        await this.$router.replace('/login')
      } catch (error) {
        this.formError = translateApiError(error, 'passwordReset.errors.resetFailed')
      } finally {
        this.submitting = false
      }
    }
  }
}
</script>

<style scoped>
.reset-password-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 24px;
}

.password-policy-hint {
  margin: -8px 0 16px;
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.7;
}
</style>
