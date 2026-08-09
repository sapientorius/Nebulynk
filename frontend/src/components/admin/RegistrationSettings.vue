<template>
  <div data-testid="registration-settings-panel">
    <n-space justify="space-between" align="center" style="margin-bottom: 16px">
      <h3 style="margin: 0">{{ $t('selfRegistrationAdmin.title') }}</h3>
    </n-space>

    <n-space vertical :size="20">
      <n-spin :show="settingsLoading">
        <n-card :title="$t('selfRegistrationAdmin.settingsTitle')">
          <n-alert v-if="!smtpConfigured" type="warning" style="margin-bottom: 16px" data-testid="registration-smtp-warning">
            {{ $t('selfRegistrationAdmin.smtpWarning') }}
            <n-button text type="primary" style="margin-left: 6px" data-testid="registration-open-smtp" @click="openSmtpSettings">
              {{ $t('selfRegistrationAdmin.openSmtp') }}
            </n-button>
          </n-alert>

          <n-form label-placement="top">
            <n-form-item :label="$t('selfRegistrationAdmin.enabled')">
              <div class="registration-field">
                <n-switch v-model:value="enabled" data-testid="registration-enabled-switch" />
                <span class="registration-hint">{{ $t('selfRegistrationAdmin.enabledHelp') }}</span>
              </div>
            </n-form-item>
            <n-form-item :label="$t('selfRegistrationAdmin.domains')">
              <div class="registration-field">
                <n-input
                  v-model:value="allowedDomainsText"
                  type="textarea"
                  :rows="4"
                  data-testid="registration-allowed-domains"
                />
                <span class="registration-hint">{{ $t('selfRegistrationAdmin.domainsHelp') }}</span>
              </div>
            </n-form-item>
            <n-form-item :label="$t('selfRegistrationAdmin.adminApproval')">
              <div class="registration-field">
                <n-switch v-model:value="requiresAdminApproval" data-testid="registration-admin-approval-switch" />
                <span class="registration-hint">{{ $t('selfRegistrationAdmin.adminApprovalHelp') }}</span>
              </div>
            </n-form-item>
          </n-form>

          <template #footer>
            <n-space justify="end">
              <n-button type="primary" :loading="saving" data-testid="registration-settings-save" @click="save">
                {{ $t('common.save') }}
              </n-button>
            </n-space>
          </template>
        </n-card>
      </n-spin>

      <n-spin :show="pendingLoading">
        <n-card :title="$t('selfRegistrationAdmin.pendingTitle')">
          <n-table :bordered="false" :single-line="false">
            <thead>
              <tr>
                <th>{{ $t('selfRegistrationAdmin.name') }}</th>
                <th>{{ $t('selfRegistrationAdmin.email') }}</th>
                <th>{{ $t('selfRegistrationAdmin.status') }}</th>
                <th>{{ $t('selfRegistrationAdmin.pendingSince') }}</th>
                <th>{{ $t('selfRegistrationAdmin.pendingFor') }}</th>
                <th>{{ $t('ui.components.admin.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="registration in pendingRegistrations" :key="registration.id">
                <td>{{ registration.display_name }}</td>
                <td>{{ registration.email }}</td>
                <td>
                  <n-tag :type="registration.registration_status === 'pending_admin_approval' ? 'warning' : 'default'" size="small">
                    {{ statusLabel(registration) }}
                  </n-tag>
                </td>
                <td>{{ formatDate(registration.created_at) }}</td>
                <td>{{ formatDuration(registration.created_at) }}</td>
                <td>
                  <n-space size="small">
                    <n-button
                      size="small"
                      type="primary"
                      :loading="actingRegistrationId === registration.id"
                      :data-testid="`pending-registration-confirm-${registration.id}`"
                      @click="confirmRegistration(registration)"
                    >
                      {{ confirmationLabel(registration) }}
                    </n-button>
                    <n-button
                      size="small"
                      type="error"
                      secondary
                      :disabled="actingRegistrationId === registration.id"
                      :data-testid="`pending-registration-delete-${registration.id}`"
                      @click="deleteRegistration(registration)"
                    >
                      {{ $t('selfRegistrationAdmin.delete') }}
                    </n-button>
                  </n-space>
                </td>
              </tr>
              <tr v-if="pendingRegistrations.length === 0">
                <td colspan="6" style="text-align: center; opacity: 0.6">{{ $t('selfRegistrationAdmin.empty') }}</td>
              </tr>
            </tbody>
          </n-table>
        </n-card>
      </n-spin>
    </n-space>
  </div>
</template>

<script>
import { useAdminStore } from '../../stores/index.js'
import { getCurrentLocale } from '../../lib/i18n.js'

export default {
  name: 'RegistrationSettings',
  data() {
    return {
      enabled: false,
      requiresAdminApproval: false,
      allowedDomainsText: '',
      smtpConfigured: false,
      saving: false,
      actingRegistrationId: null,
      now: Date.now(),
      durationTimer: null
    }
  },
  computed: {
    adminStore() {
      return useAdminStore()
    },
    settingsLoading() {
      return this.adminStore.loadingRegistrationSettings
    },
    pendingLoading() {
      return this.adminStore.loadingPendingRegistrations
    },
    pendingRegistrations() {
      return this.adminStore.pendingRegistrations
    }
  },
  async created() {
    await Promise.all([this.loadSettings(), this.loadPendingRegistrations()])
  },
  mounted() {
    this.durationTimer = window.setInterval(() => {
      this.now = Date.now()
    }, 60_000)
  },
  beforeUnmount() {
    if (this.durationTimer) window.clearInterval(this.durationTimer)
  },
  methods: {
    applySettings(settings = {}) {
      this.enabled = settings.enabled === true
      this.requiresAdminApproval = settings.requires_admin_approval === true
      this.allowedDomainsText = (settings.allowed_domains || []).join('\n')
      this.smtpConfigured = settings.smtp_configured === true
    },
    async loadSettings() {
      try {
        this.applySettings(await this.adminStore.refreshRegistrationSettings())
      } catch (error) {
        console.error('Failed to load self-registration settings:', error)
      }
    },
    async loadPendingRegistrations() {
      try {
        await this.adminStore.refreshPendingRegistrations()
      } catch (error) {
        console.error('Failed to load pending registrations:', error)
      }
    },
    buildSavePayload() {
      return {
        enabled: this.enabled,
        requires_admin_approval: this.requiresAdminApproval,
        allowed_domains: this.allowedDomainsText
          .split(/[\n,;]+/)
          .map((domain) => domain.trim())
          .filter(Boolean)
      }
    },
    async save() {
      this.saving = true
      try {
        this.applySettings(await this.adminStore.updateRegistrationSettings(this.buildSavePayload()))
        window.$message?.success(this.$t('selfRegistrationAdmin.saved'))
      } catch (error) {
        console.error('Failed to save self-registration settings:', error)
        window.$message?.error(this.$t('selfRegistrationAdmin.saveFailed'))
      } finally {
        this.saving = false
      }
    },
    openSmtpSettings() {
      this.$router.push({ path: '/admin', query: { ...this.$route.query, tab: 'smtp' } })
    },
    statusLabel(registration) {
      return registration.registration_status === 'pending_admin_approval'
        ? this.$t('selfRegistrationAdmin.awaitingApproval')
        : this.$t('selfRegistrationAdmin.awaitingEmail')
    },
    confirmationLabel(registration) {
      if (registration.registration_status === 'pending_admin_approval') {
        return this.$t('selfRegistrationAdmin.activate')
      }
      return this.requiresAdminApproval
        ? this.$t('selfRegistrationAdmin.confirmAndActivate')
        : this.$t('selfRegistrationAdmin.confirm')
    },
    formatDate(value) {
      if (!value) return '-'
      return new Intl.DateTimeFormat(getCurrentLocale(), {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date(value))
    },
    formatDuration(value) {
      const timestamp = Date.parse(value)
      if (!Number.isFinite(timestamp)) return '-'
      const minutes = Math.max(0, Math.floor((this.now - timestamp) / 60_000))
      if (minutes < 60) return new Intl.RelativeTimeFormat(getCurrentLocale(), { numeric: 'auto' }).format(-minutes, 'minute')
      const hours = Math.floor(minutes / 60)
      if (hours < 48) return new Intl.RelativeTimeFormat(getCurrentLocale(), { numeric: 'auto' }).format(-hours, 'hour')
      return new Intl.RelativeTimeFormat(getCurrentLocale(), { numeric: 'auto' }).format(-Math.floor(hours / 24), 'day')
    },
    async confirmRegistration(registration) {
      this.actingRegistrationId = registration.id
      try {
        const result = await this.adminStore.confirmPendingRegistration(registration.id)
        if (!result.email_sent && result.email_error_code !== 'api.smtp.not_configured') {
          window.$message?.warning(this.$t('selfRegistrationAdmin.activationEmailFailed'))
        } else {
          window.$message?.success(this.$t('selfRegistrationAdmin.activated'))
        }
      } catch (error) {
        console.error('Failed to confirm pending registration:', error)
        window.$message?.error(this.$t('selfRegistrationAdmin.actionFailed'))
      } finally {
        this.actingRegistrationId = null
      }
    },
    async deleteRegistration(registration) {
      if (!window.confirm(this.$t('selfRegistrationAdmin.deleteConfirm'))) return
      this.actingRegistrationId = registration.id
      try {
        await this.adminStore.deletePendingRegistration(registration.id)
      } catch (error) {
        console.error('Failed to delete pending registration:', error)
        window.$message?.error(this.$t('selfRegistrationAdmin.actionFailed'))
      } finally {
        this.actingRegistrationId = null
      }
    }
  }
}
</script>

<style scoped>
.registration-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.registration-hint {
  font-size: 12px;
  opacity: 0.7;
}
</style>
