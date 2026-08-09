<template>
  <div class="registration-confirmation-container" data-testid="self-registration-confirmation-view">
    <n-card v-if="loading" style="max-width: 460px; width: 100%; text-align: center">
      <n-spin size="large" />
      <p style="margin-top: 16px; opacity: 0.7">{{ $t('selfRegistration.confirmation.loading') }}</p>
    </n-card>

    <n-card v-else-if="error" style="max-width: 460px; width: 100%">
      <n-result status="error" :title="error" :description="$t('selfRegistration.confirmation.invalidDescription')">
        <template #footer>
          <n-button type="primary" data-testid="self-registration-confirmation-login" @click="$router.push('/login')">
            {{ $t('selfRegistration.buttons.goToLogin') }}
          </n-button>
        </template>
      </n-result>
    </n-card>

    <n-card v-else style="max-width: 460px; width: 100%">
      <n-result
        status="success"
        :title="result?.activated ? $t('selfRegistration.confirmation.activeTitle') : $t('selfRegistration.confirmation.pendingTitle')"
        :description="result?.activated ? $t('selfRegistration.confirmation.activeDescription') : $t('selfRegistration.confirmation.pendingDescription')"
      >
        <template #footer>
          <n-button type="primary" data-testid="self-registration-confirmation-go-login" @click="$router.push('/login')">
            {{ $t('selfRegistration.buttons.goToLogin') }}
          </n-button>
        </template>
      </n-result>
    </n-card>
  </div>
</template>

<script>
import { useSelfRegistrationStore } from '../stores/index.js'
import { translateApiError } from '../lib/api-error.js'

export default {
  name: 'RegistrationConfirmationView',
  data() {
    return {
      loading: true,
      error: null,
      result: null
    }
  },
  computed: {
    selfRegistrationStore() {
      return useSelfRegistrationStore()
    }
  },
  async created() {
    try {
      this.result = await this.selfRegistrationStore.confirm(this.$route.params.token)
    } catch (error) {
      this.error = translateApiError(error, 'selfRegistration.errors.confirmationFailed')
    } finally {
      this.loading = false
    }
  }
}
</script>

<style scoped>
.registration-confirmation-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 24px;
}
</style>
