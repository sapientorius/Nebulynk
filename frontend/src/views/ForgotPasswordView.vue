<template>
  <div class="forgot-password-container" data-testid="forgot-password-view">
    <n-card v-if="submitted" style="max-width: 460px; width: 100%">
      <n-result
        status="success"
        :title="$t('passwordReset.request.successTitle')"
        :description="$t('passwordReset.request.successDescription')"
      >
        <template #footer>
          <n-button type="primary" data-testid="forgot-password-go-login" @click="$router.push('/login')">
            {{ $t('passwordReset.buttons.goToLogin') }}
          </n-button>
        </template>
      </n-result>
    </n-card>

    <n-card v-else style="max-width: 460px; width: 100%">
      <template #header>
        <div style="text-align: center">
          <h2 style="margin: 0 0 4px">{{ $t('passwordReset.request.title') }}</h2>
          <p style="margin: 0; opacity: 0.7">{{ $t('passwordReset.request.description') }}</p>
        </div>
      </template>

      <n-form :model="form" @submit.prevent="submitRequest">
        <n-form-item :label="$t('passwordReset.fields.email')">
          <n-input
            v-model:value="form.email"
            :placeholder="$t('passwordReset.placeholders.email')"
            :input-props="{ 'data-testid': 'forgot-password-email' }"
            @keyup.enter="submitRequest"
          />
        </n-form-item>

        <n-alert v-if="formError" type="error" style="margin-bottom: 16px">
          {{ formError }}
        </n-alert>

        <n-space vertical :size="12">
          <n-button type="primary" block :loading="submitting" data-testid="forgot-password-submit" @click="submitRequest">
            {{ $t('passwordReset.buttons.requestLink') }}
          </n-button>
          <n-button block secondary data-testid="forgot-password-back-login" @click="$router.push('/login')">
            {{ $t('passwordReset.buttons.backToLogin') }}
          </n-button>
        </n-space>
      </n-form>
    </n-card>
  </div>
</template>

<script>
import { usePasswordResetStore } from '../stores/index.js'
import { translateApiError } from '../lib/api-error.js'

export default {
  name: 'ForgotPasswordView',
  data() {
    return {
      submitting: false,
      submitted: false,
      formError: null,
      form: {
        email: ''
      }
    }
  },
  computed: {
    passwordResetStore() {
      return usePasswordResetStore()
    }
  },
  methods: {
    async submitRequest() {
      this.formError = null

      if (!this.form.email.trim()) {
        this.formError = this.$t('passwordReset.errors.emailRequired')
        return
      }

      this.submitting = true
      try {
        await this.passwordResetStore.requestReset(this.form.email.trim())
        this.submitted = true
      } catch (error) {
        this.formError = translateApiError(error, 'passwordReset.errors.requestFailed')
      } finally {
        this.submitting = false
      }
    }
  }
}
</script>

<style scoped>
.forgot-password-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 24px;
}
</style>
