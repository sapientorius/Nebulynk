<template>
  <div data-testid="smtp-settings-panel">
    <n-space justify="space-between" align="center" style="margin-bottom: 16px">
      <h3 style="margin: 0">{{ $t('ui.components.admin.smtp_settings') }}</h3>
    </n-space>

    <n-spin :show="loading">
      <n-space vertical :size="20">
        <n-card>
          <n-space vertical :size="16">
            <n-space wrap>
              <n-tag :type="configured ? 'success' : 'warning'" data-testid="smtp-status-configured">
                {{ configured ? $t('ui.components.admin.smtp_status_configured') : $t('ui.components.admin.smtp_status_incomplete') }}
              </n-tag>
              <n-tag :type="effectiveSource === 'admin' ? 'success' : 'default'" data-testid="smtp-status-source">
                {{ sourceLabel }}
              </n-tag>
              <n-tag :type="hasStoredPassword ? 'success' : 'warning'" data-testid="smtp-status-password">
                {{
                  hasStoredPassword
                    ? $t('ui.components.admin.smtp_password_stored')
                    : $t('ui.components.admin.smtp_password_missing')
                }}
              </n-tag>
            </n-space>

            <n-form label-placement="top">
              <n-form-item :label="$t('ui.components.admin.smtp_enabled')">
                <n-switch v-model:value="enabled" data-testid="smtp-enabled-switch" />
              </n-form-item>

              <n-grid :cols="isMobileLayout ? 1 : 2" :x-gap="16" class="smtp-settings-grid">
                <n-gi>
                  <n-form-item :label="$t('ui.components.admin.smtp_host')" class="smtp-settings-grid-item">
                    <n-input v-model:value="host" data-testid="smtp-host-input" />
                  </n-form-item>
                </n-gi>
                <n-gi>
                  <n-form-item :label="$t('ui.components.admin.smtp_port')" class="smtp-settings-grid-item">
                    <n-input-number
                      v-model:value="port"
                      data-testid="smtp-port-input"
                      :min="1"
                      :max="65535"
                      style="width: 100%"
                    />
                  </n-form-item>
                </n-gi>
                <n-gi>
                  <n-form-item :label="$t('ui.components.admin.smtp_user')" class="smtp-settings-grid-item">
                    <n-input v-model:value="user" data-testid="smtp-user-input" />
                  </n-form-item>
                </n-gi>
                <n-gi>
                  <n-form-item :label="$t('ui.components.admin.smtp_password')" class="smtp-settings-grid-item">
                    <n-input
                      v-model:value="password"
                      type="password"
                      show-password-on="click"
                      :placeholder="hasStoredPassword ? $t('ui.components.admin.smtp_password_replace_optional') : ''"
                      data-testid="smtp-password-input"
                    />
                  </n-form-item>
                </n-gi>
                <n-gi>
                  <n-form-item :label="$t('ui.components.admin.smtp_from_email')" class="smtp-settings-grid-item">
                    <n-input v-model:value="fromEmail" data-testid="smtp-from-email-input" />
                  </n-form-item>
                </n-gi>
                <n-gi>
                  <n-form-item :label="$t('ui.components.admin.smtp_from_name')" class="smtp-settings-grid-item">
                    <n-input v-model:value="fromName" data-testid="smtp-from-name-input" />
                  </n-form-item>
                </n-gi>
              </n-grid>

              <n-space wrap>
                <n-form-item :label="$t('ui.components.admin.smtp_secure')">
                  <n-switch v-model:value="secure" data-testid="smtp-secure-switch" />
                </n-form-item>
                <n-form-item :label="$t('ui.components.admin.smtp_ignore_tls')">
                  <n-switch v-model:value="ignoreTls" data-testid="smtp-ignore-tls-switch" />
                </n-form-item>
              </n-space>
            </n-form>
          </n-space>

          <template #footer>
            <n-space justify="end">
              <n-button type="primary" :loading="saving" data-testid="smtp-save-button" @click="save">
                {{ $t('ui.components.admin.save') }}
              </n-button>
            </n-space>
          </template>
        </n-card>

        <n-card :title="$t('ui.components.admin.smtp_test_tools')">
          <n-space vertical :size="14">
            <n-form label-placement="top">
              <n-form-item :label="$t('ui.components.admin.smtp_test_recipient')">
                <n-input v-model:value="testRecipient" data-testid="smtp-test-recipient-input" />
              </n-form-item>
            </n-form>

            <n-space wrap>
              <n-button
                :loading="testingConnection"
                data-testid="smtp-test-connection-button"
                @click="runConnectionTest"
              >
                {{ $t('ui.components.admin.smtp_test_connection') }}
              </n-button>
              <n-button
                type="primary"
                :loading="sendingTestMail"
                data-testid="smtp-send-test-mail-button"
                @click="runSendTestMail"
              >
                {{ $t('ui.components.admin.smtp_send_test_mail') }}
              </n-button>
            </n-space>

            <n-alert
              v-if="lastTestResult"
              :type="lastTestResult.ok ? 'success' : 'warning'"
              data-testid="smtp-test-result"
            >
              <template #header>
                {{ lastTestResult.ok ? $t('ui.components.admin.smtp_test_success') : $t('ui.components.admin.smtp_test_failed') }}
              </template>
              <div>{{ lastTestResult.ok ? $t('ui.components.admin.smtp_test_success_detail') : (lastTestResult.errorMessage || $t('ui.components.admin.saving_failed')) }}</div>
            </n-alert>
          </n-space>
        </n-card>
      </n-space>
    </n-spin>
  </div>
</template>

<script>
import { observeMobileLayout, readIsMobileLayout } from '../../lib/mobile-layout.js'
import { useAdminStore, useSessionStore } from '../../stores/index.js'

export default {
  name: 'SmtpSettings',
  data() {
    return {
      enabled: false,
      host: '',
      port: 587,
      user: '',
      password: '',
      fromEmail: '',
      fromName: '',
      secure: false,
      ignoreTls: false,
      saving: false,
      testingConnection: false,
      sendingTestMail: false,
      lastTestResult: null,
      hasStoredPassword: false,
      configured: false,
      effectiveSource: null,
      testRecipient: '',
      isMobileLayout: readIsMobileLayout(),
      stopObservingMobileLayout: null
    }
  },
  computed: {
    adminStore() {
      return useAdminStore()
    },
    sessionStore() {
      return useSessionStore()
    },
    loading() {
      return this.adminStore.loadingSmtpSettings
    },
    sourceLabel() {
      if (this.effectiveSource === 'admin') return this.$t('ui.components.admin.smtp_source_admin')
      if (this.effectiveSource === 'env') return this.$t('ui.components.admin.smtp_source_env')
      return this.$t('ui.components.admin.smtp_source_none')
    }
  },
  async created() {
    await this.load()
    this.testRecipient = this.sessionStore.user?.email || ''
  },
  mounted() {
    this.stopObservingMobileLayout = observeMobileLayout((matches) => {
      this.isMobileLayout = matches
    })
  },
  beforeUnmount() {
    this.stopObservingMobileLayout?.()
  },
  methods: {
    applySettings(settings = {}) {
      this.enabled = settings.enabled === true
      this.host = settings.host || ''
      this.port = settings.port || 587
      this.user = settings.user || ''
      this.fromEmail = settings.from_email || ''
      this.fromName = settings.from_name || ''
      this.secure = settings.secure === true
      this.ignoreTls = settings.ignore_tls === true
      this.hasStoredPassword = settings.has_password === true
      this.configured = settings.configured === true
      this.effectiveSource = settings.effective_source || null
      this.password = ''
    },
    async load() {
      try {
        const settings = await this.adminStore.refreshSmtpSettings()
        this.applySettings(settings)
      } catch (error) {
        console.error('Failed to load SMTP settings:', error)
      }
    },
    buildSavePayload() {
      const payload = {
        enabled: this.enabled,
        host: this.host.trim() || null,
        port: this.port || null,
        user: this.user.trim() || null,
        from_email: this.fromEmail.trim() || null,
        from_name: this.fromName.trim() || null,
        secure: this.secure,
        ignore_tls: this.ignoreTls
      }

      if (this.password.trim()) {
        payload.password = this.password.trim()
      }

      return payload
    },
    async save() {
      this.saving = true
      try {
        const settings = await this.adminStore.updateSmtpSettings(this.buildSavePayload())
        this.applySettings(settings)
        window.$message?.success(this.$t('ui.components.admin.smtp_settings_saved'))
      } catch (error) {
        console.error('Failed to save SMTP settings:', error)
        window.$message?.error(this.$t('ui.components.admin.saving_failed'))
      } finally {
        this.saving = false
      }
    },
    async runConnectionTest() {
      this.testingConnection = true
      try {
        this.lastTestResult = await this.adminStore.testSmtpConnection()
        if (this.lastTestResult.ok) {
          window.$message?.success(this.$t('ui.components.admin.smtp_test_success'))
        } else {
          window.$message?.warning(this.lastTestResult.errorMessage || this.$t('ui.components.admin.smtp_test_failed'))
        }
      } catch (error) {
        console.error('SMTP connection test failed:', error)
        window.$message?.error(this.$t('ui.components.admin.smtp_test_failed'))
      } finally {
        this.testingConnection = false
      }
    },
    async runSendTestMail() {
      this.sendingTestMail = true
      try {
        this.lastTestResult = await this.adminStore.sendSmtpTestEmail({
          to: this.testRecipient.trim() || undefined
        })
        if (this.lastTestResult.ok) {
          window.$message?.success(this.$t('ui.components.admin.smtp_test_mail_sent'))
        } else {
          window.$message?.warning(this.lastTestResult.errorMessage || this.$t('ui.components.admin.smtp_test_failed'))
        }
      } catch (error) {
        console.error('SMTP test mail failed:', error)
        window.$message?.error(this.$t('ui.components.admin.smtp_test_failed'))
      } finally {
        this.sendingTestMail = false
      }
    }
  }
}
</script>

<style scoped>
.smtp-settings-grid-item :deep(.n-form-item-feedback-wrapper) {
  width: 100%;
}

.smtp-settings-grid-item :deep(.n-input-number) {
  width: 100%;
}
</style>
