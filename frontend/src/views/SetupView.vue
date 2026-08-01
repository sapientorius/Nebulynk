<template>
  <div class="setup-container" data-testid="setup-view">
    <n-card :title="$t('setup.title')" style="max-width: 480px; width: 100%">
      <n-steps :current="step" size="small" style="margin-bottom: 24px">
        <n-step :title="$t('setup.steps.platform')" />
        <n-step :title="$t('setup.steps.admin')" />
        <n-step :title="$t('setup.steps.done')" />
      </n-steps>

      <div v-if="step === 1">
        <n-form ref="platformForm" :model="form" :rules="platformRules">
          <n-form-item :label="$t('setup.fields.platformName')" path="platformName">
            <n-input
              v-model:value="form.platformName"
              :placeholder="$t('setup.placeholders.platformName')"
              :input-props="{ 'data-testid': 'setup-platform-name' }"
            />
          </n-form-item>
          <n-form-item :label="$t('setup.fields.domain')" path="domain">
            <n-input
              v-model:value="form.domain"
              :placeholder="$t('setup.placeholders.domain')"
              :input-props="{ 'data-testid': 'setup-domain' }"
            />
          </n-form-item>
          <n-form-item :label="$t('setup.fields.defaultLanguage')" path="defaultLanguage">
            <n-select
              v-model:value="form.defaultLanguage"
              :options="languageOptions"
              :input-props="{ 'data-testid': 'setup-default-language' }"
            />
          </n-form-item>
        </n-form>
        <n-button type="primary" block data-testid="setup-next" @click="step = 2">{{ $t('setup.buttons.next') }}</n-button>
      </div>

      <div v-if="step === 2">
        <n-form ref="adminForm" :model="form" :rules="adminRules">
          <n-form-item :label="$t('setup.fields.displayName')" path="displayName">
            <n-input
              v-model:value="form.displayName"
              :placeholder="$t('setup.placeholders.displayName')"
              :input-props="{ 'data-testid': 'setup-display-name' }"
            />
          </n-form-item>
          <n-form-item :label="$t('setup.fields.email')" path="email">
            <n-input
              v-model:value="form.email"
              :placeholder="$t('setup.placeholders.email')"
              :input-props="{ 'data-testid': 'setup-email' }"
            />
          </n-form-item>
          <n-form-item :label="$t('setup.fields.password')" path="password">
            <n-input
              v-model:value="form.password"
              type="password"
              show-password-on="click"
              :placeholder="$t('setup.placeholders.password')"
              :input-props="{ 'data-testid': 'setup-password' }"
            />
          </n-form-item>
        </n-form>
        <n-space>
          <n-button @click="step = 1">{{ $t('common.back') }}</n-button>
          <n-button type="primary" :loading="loading" data-testid="setup-submit" @click="doSetup">{{ $t('setup.buttons.setup') }}</n-button>
        </n-space>
      </div>

      <div v-if="step === 3">
        <n-result status="success" :title="$t('setup.success.title')" :description="$t('setup.success.description')">
          <template #footer>
            <n-button type="primary" data-testid="setup-go-login" @click="goToLogin">{{ $t('setup.buttons.goToLogin') }}</n-button>
          </template>
        </n-result>
      </div>

      <n-alert v-if="error" type="error" style="margin-top: 16px">
        {{ error }}
      </n-alert>
    </n-card>
  </div>
</template>

<script>
import { useSessionStore } from '../stores/index.js'
import { applyLocaleForUser, getLocaleOptions, setPlatformDefaultLocale } from '../lib/i18n.js'
import { translateApiError } from '../lib/api-error.js'

export default {
  name: 'SetupView',
  data() {
    return {
      step: 1,
      loading: false,
      error: null,
      form: {
        platformName: 'Nebulynk',
        domain: '',
        defaultLanguage: 'en',
        displayName: 'Admin',
        email: '',
        password: ''
      }
    }
  },
  computed: {
    sessionStore() {
      return useSessionStore()
    },
    platformRules() {
      return {
        platformName: { required: true, message: this.$t('setup.validation.platformNameRequired'), trigger: 'blur' }
      }
    },
    adminRules() {
      return {
        email: { required: true, message: this.$t('setup.validation.emailRequired'), trigger: 'blur' },
        password: { required: true, message: this.$t('setup.validation.passwordRequired'), trigger: 'blur' },
        displayName: { required: true, message: this.$t('setup.validation.displayNameRequired'), trigger: 'blur' }
      }
    },
    languageOptions() {
      return getLocaleOptions()
    }
  },
  methods: {
    async doSetup() {
      this.loading = true
      this.error = null
      try {
        await this.sessionStore.setupPlatform(this.form)
        setPlatformDefaultLocale(this.form.defaultLanguage)
        applyLocaleForUser(null)
        this.step = 3
      } catch (err) {
        this.error = translateApiError(err, 'setup.errors.setupFailed')
      } finally {
        this.loading = false
      }
    },
    goToLogin() {
      this.$router.push('/login')
    }
  }
}
</script>

<style scoped>
.setup-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 24px;
}
</style>
