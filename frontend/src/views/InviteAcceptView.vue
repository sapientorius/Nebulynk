<template>
  <div class="invite-container" data-testid="invite-accept-view">
    <n-card v-if="loadingInfo" style="max-width: 440px; width: 100%; text-align: center">
      <n-spin size="large" />
      <p style="margin-top: 16px; opacity: 0.6">{{ $t('invite.loading') }}</p>
    </n-card>

    <n-card v-else-if="error" style="max-width: 440px; width: 100%">
      <n-result status="error" :title="error" :description="$t('invite.invalidDescription')">
        <template #footer>
          <n-button data-testid="invite-error-go-login" @click="$router.push('/login')">{{ $t('invite.buttons.goToLogin') }}</n-button>
        </template>
      </n-result>
    </n-card>

    <n-card v-else-if="invite && (invite.is_expired || invite.status !== 'pending')" style="max-width: 440px; width: 100%">
      <n-result status="warning" :title="$t('invite.expiredTitle')" :description="$t('invite.expiredDescription')">
        <template #footer>
          <n-button data-testid="invite-expired-go-login" @click="$router.push('/login')">{{ $t('invite.buttons.goToLogin') }}</n-button>
        </template>
      </n-result>
    </n-card>

    <n-card v-else-if="success" style="max-width: 440px; width: 100%">
      <n-result status="success" :title="$t('invite.successTitle')" :description="$t('invite.successDescription')">
        <template #footer>
          <n-button type="primary" data-testid="invite-success-go-login" @click="$router.push('/login')">{{ $t('invite.buttons.goToLogin') }}</n-button>
        </template>
      </n-result>
    </n-card>

    <n-card v-else-if="invite" style="max-width: 440px; width: 100%">
      <template #header>
        <div style="text-align: center">
          <h2 style="margin: 0 0 4px">{{ invite.platform_name }}</h2>
          <p style="margin: 0; opacity: 0.6; font-size: 14px; font-weight: normal">
            {{ $t('invite.invitationFrom', { name: invite.invited_by_name }) }}
          </p>
        </div>
      </template>

      <n-alert v-if="invite.message" type="info" style="margin-bottom: 16px">
        {{ invite.message }}
      </n-alert>

      <n-form :model="form" @submit.prevent="doAccept">
        <n-form-item :label="$t('invite.fields.email')">
          <n-input :value="invite.email" disabled :input-props="{ 'data-testid': 'invite-email' }" />
        </n-form-item>
        <n-form-item :label="$t('invite.fields.displayName')">
          <n-input
            v-model:value="form.displayName"
            :placeholder="$t('invite.placeholders.displayName')"
            :input-props="{ 'data-testid': 'invite-display-name' }"
            @keyup.enter="doAccept"
          />
        </n-form-item>
        <n-form-item :label="$t('invite.fields.password')">
          <n-input
            v-model:value="form.password"
            type="password"
            show-password-on="click"
            :placeholder="$t('invite.placeholders.password')"
            :input-props="{ 'data-testid': 'invite-password' }"
            @keyup.enter="doAccept"
          />
        </n-form-item>
        <n-form-item :label="$t('invite.fields.passwordConfirm')">
          <n-input
            v-model:value="form.passwordConfirm"
            type="password"
            show-password-on="click"
            :placeholder="$t('invite.placeholders.passwordConfirm')"
            :input-props="{ 'data-testid': 'invite-password-confirm' }"
            @keyup.enter="doAccept"
          />
        </n-form-item>

        <n-alert v-if="formError" type="error" style="margin-bottom: 16px">
          {{ formError }}
        </n-alert>

        <n-button type="primary" block :loading="submitting" data-testid="invite-accept-submit" @click="doAccept">
          {{ $t('invite.buttons.createAccount') }}
        </n-button>
      </n-form>
    </n-card>
  </div>
</template>

<script>
import { useInviteAcceptStore } from '../stores/index.js'
import { translateApiError } from '../lib/api-error.js'

export default {
  name: 'InviteAcceptView',
  data() {
    return {
      loadingInfo: true,
      invite: null,
      error: null,
      formError: null,
      success: false,
      submitting: false,
      form: {
        displayName: '',
        password: '',
        passwordConfirm: ''
      }
    }
  },
  computed: {
    inviteAcceptStore() {
      return useInviteAcceptStore()
    }
  },
  async created() {
    await this.loadInviteInfo()
  },
  methods: {
    async loadInviteInfo() {
      const token = this.$route.params.token
      try {
        this.invite = await this.inviteAcceptStore.loadInvite(token)
      } catch (err) {
        this.error = translateApiError(err, 'invite.errors.notFound')
      } finally {
        this.loadingInfo = false
      }
    },
    async doAccept() {
      this.formError = null

      if (!this.form.displayName.trim()) {
        this.formError = this.$t('invite.errors.displayNameRequired')
        return
      }
      if (this.form.password.length < 8) {
        this.formError = this.$t('invite.errors.passwordTooShort')
        return
      }
      if (this.form.password !== this.form.passwordConfirm) {
        this.formError = this.$t('invite.errors.passwordsMismatch')
        return
      }

      this.submitting = true
      try {
        await this.inviteAcceptStore.acceptInvite({
          token: this.$route.params.token,
          displayName: this.form.displayName.trim(),
          password: this.form.password
        })
        this.success = true
      } catch (err) {
        this.formError = translateApiError(err, 'invite.errors.createFailed')
      } finally {
        this.submitting = false
      }
    }
  }
}
</script>

<style scoped>
.invite-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 24px;
}
</style>
