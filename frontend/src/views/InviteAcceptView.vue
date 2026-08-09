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
        <p class="password-policy-hint">{{ passwordPolicyHint }}</p>
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
import { getSelfRegistrationConfig } from '../lib/api.js'
import { DEFAULT_PASSWORD_POLICY, isPasswordValidForPolicy, normalizePasswordPolicy } from '../lib/password-policy.js'

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
      passwordPolicy: DEFAULT_PASSWORD_POLICY,
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
    await Promise.all([this.loadInviteInfo(), this.loadPasswordPolicy()])
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
    async loadPasswordPolicy() {
      try {
        const config = await getSelfRegistrationConfig()
        this.passwordPolicy = normalizePasswordPolicy(config?.password_policy)
      } catch {
        this.passwordPolicy = DEFAULT_PASSWORD_POLICY
      }
    },
    async doAccept() {
      this.formError = null

      if (!this.form.displayName.trim()) {
        this.formError = this.$t('invite.errors.displayNameRequired')
        return
      }
      if (!isPasswordValidForPolicy(this.form.password, this.passwordPolicy)) {
        this.formError = this.passwordPolicyHint
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

.password-policy-hint {
  margin: -8px 0 16px;
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.7;
}
</style>
