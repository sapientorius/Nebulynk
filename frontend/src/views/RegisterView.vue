<template>
  <div
    class="registration-container"
    :class="{ 'registration-container--embedded': embedded }"
    data-testid="self-registration-view"
  >
    <n-card v-if="loading" style="max-width: 460px; width: 100%; text-align: center">
      <n-spin size="large" />
    </n-card>

    <n-card v-else-if="error" style="max-width: 460px; width: 100%">
      <n-result status="error" :title="error" :description="$t('selfRegistration.disabledDescription')">
        <template #footer>
          <n-button type="primary" data-testid="self-registration-go-login" @click="$router.push('/login')">
            {{ $t('selfRegistration.buttons.goToLogin') }}
          </n-button>
        </template>
      </n-result>
    </n-card>

    <n-card v-else-if="!enabled" style="max-width: 460px; width: 100%">
      <n-result status="warning" :title="$t('selfRegistration.disabledTitle')" :description="$t('selfRegistration.disabledDescription')">
        <template #footer>
          <n-button type="primary" data-testid="self-registration-disabled-login" @click="$router.push('/login')">
            {{ $t('selfRegistration.buttons.goToLogin') }}
          </n-button>
        </template>
      </n-result>
    </n-card>

    <n-card v-else-if="success" style="max-width: 460px; width: 100%">
      <n-result
        status="success"
        :title="success.confirmation_delivery === 'email' ? $t('selfRegistration.success.emailTitle') : $t('selfRegistration.success.manualTitle')"
        :description="success.confirmation_delivery === 'email' ? $t('selfRegistration.success.emailDescription') : $t('selfRegistration.success.manualDescription')"
      >
        <template #footer>
          <n-button type="primary" data-testid="self-registration-success-login" @click="$router.push('/login')">
            {{ $t('selfRegistration.buttons.goToLogin') }}
          </n-button>
        </template>
      </n-result>
    </n-card>

    <n-card v-else style="max-width: 460px; width: 100%">
      <template #header>
        <div style="text-align: center">
          <h2 style="margin: 0 0 4px">{{ $t('selfRegistration.title') }}</h2>
          <p style="margin: 0; opacity: 0.7">{{ $t('selfRegistration.description') }}</p>
        </div>
      </template>

      <n-form :model="form" @submit.prevent="submit">
        <n-form-item :label="$t('selfRegistration.fields.displayName')">
          <n-input
            v-model:value="form.displayName"
            :placeholder="$t('selfRegistration.placeholders.displayName')"
            :input-props="{ 'data-testid': 'self-registration-display-name' }"
            @keyup.enter="submit"
          />
        </n-form-item>
        <n-form-item :label="$t('selfRegistration.fields.email')">
          <n-input
            v-model:value="form.email"
            :placeholder="$t('selfRegistration.placeholders.email')"
            :input-props="{ 'data-testid': 'self-registration-email' }"
            @keyup.enter="submit"
          />
        </n-form-item>
        <n-form-item :label="$t('selfRegistration.fields.password')">
          <n-input
            v-model:value="form.password"
            type="password"
            show-password-on="click"
            :placeholder="$t('selfRegistration.placeholders.password')"
            :input-props="{ 'data-testid': 'self-registration-password' }"
            @keyup.enter="submit"
          />
        </n-form-item>
        <p class="password-policy-hint">{{ passwordPolicyHint }}</p>
        <n-form-item :label="$t('selfRegistration.fields.passwordConfirm')">
          <n-input
            v-model:value="form.passwordConfirm"
            type="password"
            show-password-on="click"
            :placeholder="$t('selfRegistration.placeholders.passwordConfirm')"
            :input-props="{ 'data-testid': 'self-registration-password-confirm' }"
            @keyup.enter="submit"
          />
        </n-form-item>

        <n-alert v-if="formError" type="error" style="margin-bottom: 16px" data-testid="self-registration-error">
          {{ formError }}
        </n-alert>

        <n-space vertical :size="12">
          <n-button type="primary" block :loading="submitting" data-testid="self-registration-submit" @click="submit">
            {{ $t('selfRegistration.buttons.register') }}
          </n-button>
          <n-button block secondary data-testid="self-registration-back-login" @click="$router.push('/login')">
            {{ $t('selfRegistration.buttons.goToLogin') }}
          </n-button>
        </n-space>
      </n-form>
    </n-card>
  </div>
</template>

<script>
import { useSelfRegistrationStore } from '../stores/index.js'
import { translateApiError } from '../lib/api-error.js'
import { isPasswordValidForPolicy, normalizePasswordPolicy } from '../lib/password-policy.js'

export default {
  name: 'RegisterView',
  props: {
    embedded: {
      type: Boolean,
      default: false
    },
    config: {
      type: Object,
      default: null
    },
    configLoading: {
      type: Boolean,
      default: true
    },
    configError: {
      type: String,
      default: null
    }
  },
  data() {
    return {
      localLoading: true,
      submitting: false,
      localError: null,
      formError: null,
      localConfig: null,
      success: null,
      form: {
        displayName: '',
        email: '',
        password: '',
        passwordConfirm: ''
      }
    }
  },
  computed: {
    selfRegistrationStore() {
      return useSelfRegistrationStore()
    },
    loading() {
      return this.embedded ? this.configLoading : this.localLoading
    },
    error() {
      return this.embedded ? this.configError : this.localError
    },
    registrationConfig() {
      return this.embedded ? this.config : this.localConfig
    },
    enabled() {
      return this.registrationConfig?.enabled === true
    },
    passwordPolicy() {
      return normalizePasswordPolicy(this.registrationConfig?.password_policy)
    },
    passwordPolicyHint() {
      return this.$t('passwordPolicy.requirement', {
        minLength: this.passwordPolicy.min_length,
        minTypes: this.passwordPolicy.min_types
      })
    }
  },
  async created() {
    if (this.embedded) return

    try {
      this.localConfig = await this.selfRegistrationStore.loadConfig({ refresh: true })
    } catch (error) {
      this.localError = translateApiError(error, 'selfRegistration.errors.registrationFailed')
    } finally {
      this.localLoading = false
    }
  },
  methods: {
    async submit() {
      this.formError = null
      if (!this.form.displayName.trim()) {
        this.formError = this.$t('selfRegistration.errors.displayNameRequired')
        return
      }
      if (!this.form.email.trim()) {
        this.formError = this.$t('selfRegistration.errors.emailRequired')
        return
      }
      if (!isPasswordValidForPolicy(this.form.password, this.passwordPolicy)) {
        this.formError = this.passwordPolicyHint
        return
      }
      if (this.form.password !== this.form.passwordConfirm) {
        this.formError = this.$t('selfRegistration.errors.passwordsMismatch')
        return
      }

      this.submitting = true
      try {
        this.success = await this.selfRegistrationStore.register({
          display_name: this.form.displayName.trim(),
          email: this.form.email.trim(),
          password: this.form.password
        })
      } catch (error) {
        this.formError = translateApiError(error, 'selfRegistration.errors.registrationFailed')
      } finally {
        this.submitting = false
      }
    }
  }
}
</script>

<style scoped>
.registration-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 24px;
}

.registration-container--embedded {
  display: block;
  min-height: 0;
  padding: 0;
}

.registration-container--embedded :deep(.n-card) {
  width: 100% !important;
  max-width: none !important;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.password-policy-hint {
  margin: -8px 0 16px;
  font-size: 12px;
  opacity: 0.7;
  line-height: 1.5;
}
</style>
