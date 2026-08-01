<template>
  <div>
    <h3 style="margin: 0 0 16px 0">{{ $t('ui.components.admin.users_roles') }}</h3>

    <n-spin :show="loading">
      <n-table :bordered="false" :single-line="false">
        <thead>
          <tr>
            <th>{{ $t('ui.components.admin.user') }}</th>
            <th>{{ $t('ui.components.admin.email') }}</th>
            <th>Admin</th>
            <th>{{ $t('twoFactor.admin.column') }}</th>
            <th>{{ $t('passkeys.admin.column') }}</th>
            <th>{{ $t('ui.components.admin.platform_roles') }}</th>
            <th>{{ $t('ui.components.admin.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id">
            <td>{{ user.display_name }}</td>
            <td>{{ user.email }}</td>
            <td>
              <n-space size="small">
                <n-tag v-if="user.is_admin" type="error" size="small">Admin</n-tag>
                <n-tag v-if="user.is_primary_admin" type="warning" size="small" :data-testid="`admin-user-primary-admin-${user.id}`">
                  {{ $t('primaryAdmin.badge') }}
                </n-tag>
              </n-space>
            </td>
            <td>
              <n-tag :type="user.two_factor_enabled ? 'success' : 'default'" size="small">
                {{ user.two_factor_enabled ? $t('twoFactor.admin.enabled') : $t('twoFactor.admin.disabled') }}
              </n-tag>
            </td>
            <td>
              <n-tag :type="user.passkey_count > 0 ? 'success' : 'default'" size="small">
                {{
                  user.passkey_count > 0
                    ? $t('passkeys.admin.enabledCount', { count: user.passkey_count })
                    : $t('passkeys.admin.disabled')
                }}
              </n-tag>
            </td>
            <td>
              <n-select
                multiple
                :value="getUserRoleIds(user.id)"
                :options="platformRoleOptions"
                @update:value="(val) => updateUserRoles(user.id, val)"
                style="min-width: 250px"
              />
            </td>
            <td>
              <n-space size="small">
                <n-button
                  size="small"
                  :disabled="!user.two_factor_enabled"
                  :data-testid="`admin-user-reset-2fa-${user.id}`"
                  @click="resetTwoFactor(user)"
                >
                  {{ $t('twoFactor.admin.resetAction') }}
                </n-button>
                <n-button
                  size="small"
                  :disabled="!(user.passkey_count > 0)"
                  :data-testid="`admin-user-reset-passkeys-${user.id}`"
                  @click="resetPasskeys(user)"
                >
                  {{ $t('passkeys.admin.resetAction') }}
                </n-button>
                <n-button
                  v-if="canTransferPrimaryAdminTo(user)"
                  size="small"
                  type="warning"
                  :data-testid="`admin-user-transfer-primary-admin-${user.id}`"
                  @click="openPrimaryAdminTransfer(user)"
                >
                  {{ $t('primaryAdmin.transferAction') }}
                </n-button>
              </n-space>
            </td>
          </tr>
        </tbody>
      </n-table>
    </n-spin>

    <n-modal
      v-model:show="transferModalVisible"
      preset="card"
      style="max-width: 560px"
      :title="$t('primaryAdmin.transferTitle')"
      data-testid="primary-admin-transfer-modal"
    >
      <n-space vertical size="medium">
        <n-alert type="warning" data-testid="primary-admin-transfer-warning">
          {{ $t('primaryAdmin.irreversibleWarning') }}
        </n-alert>
        <p v-if="transferTarget" class="primary-admin-target">
          {{ $t('primaryAdmin.targetLabel', { name: transferTarget.display_name, email: transferTarget.email }) }}
        </p>
        <n-form label-placement="top">
          <n-form-item :label="$t('primaryAdmin.confirmationLabel')">
            <n-input
              v-model:value="transferForm.confirmation"
              :placeholder="confirmationText"
              :input-props="{ 'data-testid': 'primary-admin-transfer-confirmation' }"
            />
          </n-form-item>
          <n-form-item :label="$t('primaryAdmin.reauthLabel')">
            <n-radio-group v-model:value="transferForm.method" data-testid="primary-admin-transfer-reauth-method">
              <n-radio-button value="password">{{ $t('primaryAdmin.passwordMethod') }}</n-radio-button>
              <n-radio-button value="passkey">{{ $t('primaryAdmin.passkeyMethod') }}</n-radio-button>
            </n-radio-group>
          </n-form-item>
          <n-form-item v-if="transferForm.method === 'password'" :label="$t('primaryAdmin.currentPasswordLabel')">
            <n-input
              v-model:value="transferForm.currentPassword"
              type="password"
              show-password-on="click"
              :placeholder="$t('primaryAdmin.currentPasswordPlaceholder')"
              :input-props="{ 'data-testid': 'primary-admin-transfer-current-password' }"
              @keyup.enter="submitPrimaryAdminTransfer"
            />
          </n-form-item>
          <n-alert v-if="transferError" type="error" data-testid="primary-admin-transfer-error">
            {{ transferError }}
          </n-alert>
        </n-form>
      </n-space>
      <template #footer>
        <n-space justify="end">
          <n-button data-testid="primary-admin-transfer-cancel" @click="closePrimaryAdminTransfer">
            {{ $t('primaryAdmin.cancel') }}
          </n-button>
          <n-button
            type="warning"
            :loading="transferLoading"
            data-testid="primary-admin-transfer-submit"
            @click="submitPrimaryAdminTransfer"
          >
            {{ $t('primaryAdmin.confirmTransfer') }}
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script>
import { startAuthentication } from '@simplewebauthn/browser'
import { useAdminStore, useSessionStore } from '../../stores/index.js'
import { translateApiError } from '../../lib/api-error.js'

const CONFIRMATION_TEXT = 'TRANSFER_PRIMARY_ADMIN'

export default {
  name: 'UserRoleManager',
  data() {
    return {
      transferModalVisible: false,
      transferTarget: null,
      transferLoading: false,
      transferError: '',
      transferForm: {
        confirmation: '',
        method: 'password',
        currentPassword: ''
      }
    }
  },
  computed: {
    adminStore() {
      return useAdminStore()
    },
    sessionStore() {
      return useSessionStore()
    },
    users() {
      return this.adminStore.users
    },
    loading() {
      return this.adminStore.loadingUserRoleData
    },
    currentUser() {
      return this.sessionStore.user || {}
    },
    confirmationText() {
      return CONFIRMATION_TEXT
    },
    platformRoleOptions() {
      return this.adminStore.platformRoles
        .map((role) => ({
          label: role.name + (role.is_system ? ` (${this.$t('ui.components.admin.system')})` : ''),
          value: role.id
        }))
    }
  },
  async created() {
    await this.loadData()
  },
  methods: {
    async loadData() {
      try {
        await this.adminStore.refreshUserRoleData()
      } catch (error) {
        console.error('Failed to load data:', error)
      }
    },

    getUserRoleIds(userId) {
      return this.adminStore.getUserRoleIds(userId)
    },

    canTransferPrimaryAdminTo(user) {
      return this.currentUser?.is_primary_admin === true
        && user?.id
        && user.id !== this.currentUser.id
        && user.account_type === 'member'
        && !user.disabled_at
    },

    async updateUserRoles(userId, newRoleIds) {
      try {
        await this.adminStore.updateUserRoles(userId, newRoleIds)
      } catch (error) {
        console.error('Failed to update user roles:', error)
      }
    },

    async resetTwoFactor(user) {
      if (!user?.id || !user.two_factor_enabled) return
      if (!window.confirm(this.$t('twoFactor.admin.resetConfirm'))) {
        return
      }

      try {
        await this.adminStore.resetUserTwoFactor(user.id)
        window.$message?.success(this.$t('twoFactor.admin.resetSuccess'))
      } catch (error) {
        console.error('Failed to reset user two-factor authentication:', error)
        window.$message?.error(this.$t('twoFactor.admin.resetFailed'))
      }
    },

    async resetPasskeys(user) {
      if (!user?.id || !(user.passkey_count > 0)) return
      if (!window.confirm(this.$t('passkeys.admin.resetConfirm'))) {
        return
      }

      try {
        await this.adminStore.resetUserPasskeys(user.id)
        window.$message?.success(this.$t('passkeys.admin.resetSuccess'))
      } catch (error) {
        console.error('Failed to reset user passkeys:', error)
        window.$message?.error(this.$t('passkeys.admin.resetFailed'))
      }
    },

    openPrimaryAdminTransfer(user) {
      this.transferTarget = user
      this.transferError = ''
      this.transferForm = {
        confirmation: '',
        method: 'password',
        currentPassword: ''
      }
      this.transferModalVisible = true
    },

    closePrimaryAdminTransfer() {
      if (this.transferLoading) return
      this.transferModalVisible = false
      this.transferTarget = null
      this.transferError = ''
    },

    async buildTransferReauth() {
      if (this.transferForm.method === 'password') {
        if (!this.transferForm.currentPassword) {
          throw new Error(this.$t('primaryAdmin.currentPasswordRequired'))
        }
        return {
          method: 'password',
          current_password: this.transferForm.currentPassword
        }
      }

      const challenge = await this.adminStore.beginPrimaryAdminTransferPasskeyOptions()
      const authenticationResponse = await startAuthentication({
        optionsJSON: challenge.options
      })
      return {
        method: 'passkey',
        challenge_id: challenge.challengeId,
        authentication_response: authenticationResponse
      }
    },

    async submitPrimaryAdminTransfer() {
      this.transferError = ''
      if (!this.transferTarget?.id) return
      if (this.transferForm.confirmation !== CONFIRMATION_TEXT) {
        this.transferError = this.$t('primaryAdmin.confirmationRequired')
        return
      }

      this.transferLoading = true
      try {
        const reauth = await this.buildTransferReauth()
        const previousPrimaryAdminId = this.currentUser.id
        await this.adminStore.transferPrimaryAdmin({
          targetUserId: this.transferTarget.id,
          confirmation: CONFIRMATION_TEXT,
          reauth
        })
        this.sessionStore.applyUserPatch({
          id: previousPrimaryAdminId,
          is_primary_admin: false
        })
        this.closePrimaryAdminTransfer()
        window.$message?.success(this.$t('primaryAdmin.transferSuccess'))
      } catch (error) {
        this.transferError = error?.message && error.message === this.$t('primaryAdmin.currentPasswordRequired')
          ? error.message
          : translateApiError(error, error?.message || 'primaryAdmin.transferFailed')
      } finally {
        this.transferLoading = false
      }
    }
  }
}
</script>

<style scoped>
.primary-admin-target {
  margin: 0;
}
</style>
