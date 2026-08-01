<template>
  <div>
    <n-space justify="space-between" align="center" style="margin-bottom: 16px">
      <h3 style="margin: 0">{{ $t('ui.components.admin.invites') }}</h3>
      <n-button type="primary" data-testid="open-invite-modal" @click="showCreateModal = true">{{ $t('ui.components.admin.invite_user') }}</n-button>
    </n-space>

    <n-alert v-if="lastCreatedInvite" :type="inviteAlertType" closable style="margin-bottom: 16px" @close="lastCreatedInvite = null">
      <template #header>{{ $t('ui.components.admin.invite_created') }}</template>
      <p v-if="lastCreatedInvite.email_sent" style="margin: 0 0 8px">
        {{ $t('ui.components.admin.email_sent_to') }} <strong>{{ lastCreatedInvite.email }}</strong>.
      </p>
      <p v-else-if="lastCreatedInvite.email_configured" style="margin: 0 0 8px">
        {{ $t('ui.components.admin.smtp_delivery_failed') }}
        <span v-if="lastCreatedInvite.email_error_message">{{ lastCreatedInvite.email_error_message }} </span>
        {{ $t('ui.components.admin.share_this_link_manually') }}
      </p>
      <p v-else style="margin: 0 0 8px">
        {{ $t('ui.components.admin.smtp_not_configured') }}
        {{ $t('ui.components.admin.share_this_link_manually') }}
      </p>
      <n-input-group>
        <n-input :value="lastCreatedInvite.invite_url" readonly :input-props="{ 'data-testid': 'invite-url-input' }" />
        <n-button @click="copyLink(lastCreatedInvite.invite_url)">{{ $t('ui.components.admin.copy') }}</n-button>
      </n-input-group>
    </n-alert>

    <n-spin :show="loading">
      <n-table :bordered="false" :single-line="false">
        <thead>
          <tr>
            <th>{{ $t('ui.components.admin.email') }}</th>
            <th>{{ $t('ui.components.admin.invited_by') }}</th>
            <th>{{ $t('ui.components.admin.status') }}</th>
            <th>{{ $t('ui.components.admin.role') }}</th>
            <th>{{ $t('ui.components.admin.created') }}</th>
            <th>{{ $t('ui.components.admin.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="invite in invites" :key="invite.id">
            <td>{{ invite.email }}</td>
            <td>{{ invite.invited_by_name || '-' }}</td>
            <td>
              <n-tag :type="statusTagType(invite.status)" size="small">
                {{ statusLabel(invite.status) }}
              </n-tag>
            </td>
            <td>{{ invite.role_to_assign }}</td>
            <td>{{ formatDate(invite.created_at) }}</td>
            <td>
              <n-space :size="4">
                <n-button
                  v-if="invite.status === 'pending'"
                  size="tiny"
                  quaternary
                  @click="copyInviteLink(invite.token)"
                >
                  Link
                </n-button>
                <n-button
                  v-if="invite.status === 'pending'"
                  size="tiny"
                  quaternary
                  type="error"
                  @click="doRevoke(invite.id)"
                >
                  {{ $t('ui.components.admin.revoke') }}
                </n-button>
              </n-space>
            </td>
          </tr>
          <tr v-if="invites.length === 0">
            <td colspan="6" style="text-align: center; opacity: 0.5">{{ $t('ui.components.admin.no_invites_available') }}</td>
          </tr>
        </tbody>
      </n-table>
    </n-spin>

    <n-modal v-model:show="showCreateModal">
      <n-card :title="$t('ui.components.admin.invite_user')" style="max-width: 440px; width: 100%" closable @close="showCreateModal = false">
        <n-form :model="createForm">
          <n-form-item :label="$t('ui.components.admin.email')">
            <n-input
              v-model:value="createForm.email"
              :placeholder="$t('ui.components.admin.user_example_com')"
              :input-props="{ 'data-testid': 'invite-email-input' }"
              @keyup.enter="doCreate"
            />
          </n-form-item>
          <n-form-item :label="$t('ui.components.admin.platform_role')">
            <n-select
              v-model:value="createForm.roleToAssign"
              data-testid="invite-role-select"
              :options="roleOptions"
            />
          </n-form-item>
          <n-form-item :label="$t('ui.components.admin.personal_message_optional')">
            <n-input
              v-model:value="createForm.message"
              type="textarea"
              :placeholder="$t('ui.components.admin.welcome_message')"
              :rows="2"
            />
          </n-form-item>
          <n-form-item :label="$t('ui.components.admin.expiration')">
            <n-select
              v-model:value="createForm.expiresIn"
              data-testid="invite-expiry-select"
              :options="expiryOptions"
            />
          </n-form-item>
        </n-form>

        <n-alert v-if="createError" type="error" style="margin-bottom: 12px">
          {{ createError }}
        </n-alert>

        <template #footer>
          <n-space justify="end">
            <n-button @click="showCreateModal = false">{{ $t('ui.components.admin.cancel') }}</n-button>
            <n-button type="primary" :loading="creating" data-testid="invite-submit" @click="doCreate">{{ $t('ui.components.admin.invite') }}</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>

<script>
import { useAdminStore } from '../../stores/index.js'
import { getCurrentLocale } from '../../lib/i18n.js'
import { translateApiError } from '../../lib/api-error.js'

export default {
  name: 'InviteManager',
  data() {
    return {
      creating: false,
      createError: null,
      showCreateModal: false,
      lastCreatedInvite: null,
      createForm: {
        email: '',
        roleToAssign: 'platform:member',
        message: '',
        expiresIn: null
      }
    }
  },
  computed: {
    adminStore() {
      return useAdminStore()
    },
    loading() {
      return this.adminStore.loadingInvites
    },
    invites() {
      return this.adminStore.invites
    },
    inviteAlertType() {
      if (this.lastCreatedInvite?.email_sent) return 'success'
      if (this.lastCreatedInvite?.email_configured) return 'warning'
      return 'info'
    },
    roleOptions() {
      return this.adminStore.platformRoles.map((role) => ({
        label: role.name,
        value: role.name
      }))
    },
    expiryOptions() {
      return [
        { label: this.$t('ui.components.admin.never'), value: null },
        { label: this.$t('ui.components.admin.24_hours'), value: 24 * 60 * 60 * 1000 },
        { label: this.$t('ui.components.admin.7_days'), value: 7 * 24 * 60 * 60 * 1000 },
        { label: this.$t('ui.components.admin.30_days'), value: 30 * 24 * 60 * 60 * 1000 }
      ]
    }
  },
  async created() {
    await this.loadData()
  },
  methods: {
    async loadData() {
      try {
        await this.adminStore.refreshInviteData()
      } catch (error) {
        console.error('Failed to load data:', error)
      }
    },
    statusTagType(status) {
      const types = { pending: 'warning', accepted: 'success', expired: 'error', revoked: 'default' }
      return types[status] || 'default'
    },
    statusLabel(status) {
      const labels = {
        pending: this.$t('ui.components.admin.pending'),
        accepted: this.$t('ui.components.admin.accepted'),
        expired: this.$t('ui.components.admin.expired'),
        revoked: this.$t('ui.components.admin.revoked')
      }
      return labels[status] || status
    },
    formatDate(dateStr) {
      if (!dateStr) return '-'
      return new Date(dateStr).toLocaleDateString(getCurrentLocale(), {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    },
    async doCreate() {
      this.createError = null

      if (!this.createForm.email.trim()) {
        this.createError = this.$t('ui.components.admin.email_is_required')
        return
      }

      this.creating = true
      try {
        const result = await this.adminStore.createInvite({
          email: this.createForm.email.trim(),
          role_to_assign: this.createForm.roleToAssign,
          message: this.createForm.message.trim() || null,
          expires_in: this.createForm.expiresIn
        })
        this.lastCreatedInvite = result
        this.showCreateModal = false
        this.createForm = { email: '', roleToAssign: 'platform:member', message: '', expiresIn: null }
      } catch (err) {
        this.createError = translateApiError(err, 'ui.components.admin.failed_to_create_invite')
      } finally {
        this.creating = false
      }
    },
    async doRevoke(inviteId) {
      try {
        await this.adminStore.revokeInvite(inviteId)
      } catch (err) {
        console.error('Failed to revoke:', err)
      }
    },
    copyInviteLink(token) {
      const url = `${window.location.origin}/invite/${token}`
      this.copyLink(url)
    },
    async copyLink(url) {
      try {
        await navigator.clipboard.writeText(url)
        window.$message?.success(this.$t('ui.components.admin.copied_to_clipboard'))
      } catch {
        const el = document.createElement('textarea')
        el.value = url
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
        window.$message?.success(this.$t('ui.components.admin.copied_to_clipboard'))
      }
    }
  }
}
</script>
