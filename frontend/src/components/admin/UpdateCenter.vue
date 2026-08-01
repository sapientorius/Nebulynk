<template>
  <div data-testid="platform-update-center">
    <n-space justify="space-between" align="center" class="update-heading">
      <h3>{{ $t('platformUpdates.title') }}</h3>
      <n-button
        secondary
        :loading="updatesStore.checking"
        :disabled="status?.checks_enabled === false"
        data-testid="platform-update-check-now"
        @click="checkNow"
      >
        {{ $t('platformUpdates.refresh') }}
      </n-button>
    </n-space>

    <n-spin :show="updatesStore.loading">
      <n-alert v-if="statusAlert" :type="statusAlert.type" :show-icon="true" class="update-alert">
        {{ statusAlert.text }}
      </n-alert>
      <n-alert v-if="status?.check_status === 'failed'" type="warning" :show-icon="true" class="update-alert">
        {{ $t('platformUpdates.checkFailed') }}<span v-if="status?.last_error_code"> ({{ status.last_error_code }})</span>
      </n-alert>
      <n-alert v-if="status?.cache_stale && status?.checks_enabled !== false && status?.last_success_at" type="warning" :show-icon="true" class="update-alert">
        {{ $t('platformUpdates.cacheStale') }}
      </n-alert>
      <n-alert v-if="status?.can_manage_checks && status?.security_email_configured === false" type="warning" :show-icon="true" class="update-alert">
        {{ $t('platformUpdates.emailUnavailable') }}
      </n-alert>
      <n-alert v-else-if="status?.can_manage_checks && status?.security_email_status === 'delivery_failed'" type="error" :show-icon="true" class="update-alert">
        {{ $t('platformUpdates.emailDeliveryFailed') }}
      </n-alert>

      <div class="update-summary-grid">
        <n-card size="small">
          <span class="summary-label">{{ $t('platformUpdates.installed') }}</span>
          <strong>{{ status?.build?.version || '–' }}</strong>
        </n-card>
        <n-card size="small">
          <span class="summary-label">{{ $t('platformUpdates.latest') }}</span>
          <strong>{{ status?.latest_version || '–' }}</strong>
        </n-card>
        <n-card size="small">
          <span class="summary-label">{{ $t('platformUpdates.lastSuccess') }}</span>
          <strong>{{ formatDate(status?.last_success_at) }}</strong>
        </n-card>
      </div>

      <n-card v-if="status?.can_manage_checks" class="owner-settings" :title="$t('platformUpdates.ownerSettings')">
        <div class="setting-row">
          <div>
            <strong>{{ $t('platformUpdates.checksEnabled') }}</strong>
            <p>{{ $t('platformUpdates.checksHelp') }}</p>
            <p class="privacy-note">{{ $t('platformUpdates.privacy') }}</p>
          </div>
          <n-switch
            :value="status?.checks_enabled !== false"
            :loading="updatesStore.saving"
            data-testid="platform-update-checks-enabled"
            @update:value="toggleChecks"
          />
        </div>
      </n-card>

      <n-empty v-if="status && status.releases?.length === 0" :description="emptyDescription" class="update-empty" />

      <div v-else class="release-list">
        <n-card
          v-for="release in status?.releases || []"
          :key="`${release.version}:${release.revision}`"
          class="release-card"
          :class="{ 'security-release': release.security_applicable }"
          size="small"
        >
          <template #header>
            <div class="release-header">
              <div>
                <strong>v{{ release.version }}</strong>
                <span class="release-date">{{ formatDate(release.published_at) }}</span>
              </div>
              <n-space>
                <n-tag v-if="release.security_applicable" :type="securityAlertType(release.highest_security_severity)" size="small">{{ $t('platformUpdates.security') }}</n-tag>
                <n-tag v-if="release.upgrade?.breaking" type="warning" size="small">Breaking</n-tag>
                <n-tag v-if="release.acknowledged" type="success" size="small">✓</n-tag>
              </n-space>
            </div>
          </template>

          <h4>{{ localized(release.title) }}</h4>
          <p>{{ localized(release.summary) }}</p>

          <h5>{{ $t('platformUpdates.releaseNotes') }}</h5>
          <ul>
            <li v-for="(change, index) in release.changes" :key="index">
              <n-tag size="small" :type="change.category === 'security' ? 'error' : 'default'">{{ change.category }}</n-tag>
              <strong>{{ localized(change.title) }}</strong> — {{ localized(change.description) }}
            </li>
          </ul>

          <template v-if="release.security?.length">
            <h5>{{ $t('platformUpdates.security') }}</h5>
            <n-alert
              v-for="(advisory, index) in release.security"
              :key="index"
              :type="securityAlertType(advisory.severity)"
              :show-icon="true"
              class="security-advisory"
            >
              <strong>{{ advisory.severity.toUpperCase() }}</strong> — {{ localized(advisory.summary) }}
              <span v-if="advisory.cve"> ({{ advisory.cve }})</span>
            </n-alert>
          </template>

          <h5>{{ $t('platformUpdates.upgradeNotes') }}</h5>
          <ul class="upgrade-flags">
            <li v-if="release.upgrade?.backup_required">{{ $t('platformUpdates.backupRequired') }}</li>
            <li v-if="release.upgrade?.downtime_expected">{{ $t('platformUpdates.downtimeExpected') }}</li>
            <li v-if="release.upgrade?.breaking">{{ $t('platformUpdates.breaking') }}</li>
          </ul>
          <template v-if="localizedSteps(release).length">
            <strong>{{ $t('platformUpdates.manualSteps') }}</strong>
            <ol><li v-for="(step, index) in localizedSteps(release)" :key="index">{{ step }}</li></ol>
          </template>

          <n-space justify="end">
            <n-button tag="a" :href="release.upgrade?.docs_url" target="_blank" rel="noopener noreferrer" secondary size="small">
              {{ $t('platformUpdates.openGuide') }}
            </n-button>
            <n-button v-if="!release.acknowledged" size="small" @click="acknowledge(release.version)">
              {{ $t('platformUpdates.acknowledge') }}
            </n-button>
          </n-space>
        </n-card>
      </div>
    </n-spin>

    <n-modal v-model:show="showDisableModal" :mask-closable="false">
      <n-card class="disable-modal" :title="$t('platformUpdates.disableTitle')" role="dialog" aria-modal="true">
        <n-alert type="error" :show-icon="true">{{ $t('platformUpdates.disableWarning') }}</n-alert>
        <n-form class="disable-form">
          <n-form-item :label="$t('platformUpdates.confirmationLabel')">
            <n-input v-model:value="disableForm.confirmation" data-testid="platform-update-disable-confirmation" />
          </n-form-item>
          <n-form-item :label="$t('platformUpdates.reauthMethod')">
            <n-radio-group v-model:value="disableForm.method">
              <n-radio value="password">{{ $t('platformUpdates.passwordMethod') }}</n-radio>
              <n-radio value="passkey">{{ $t('platformUpdates.passkeyMethod') }}</n-radio>
            </n-radio-group>
          </n-form-item>
          <n-form-item v-if="disableForm.method === 'password'" :label="$t('platformUpdates.password')">
            <n-input v-model:value="disableForm.password" type="password" show-password-on="click" data-testid="platform-update-disable-password" />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="closeDisableModal">{{ $t('platformUpdates.cancel') }}</n-button>
            <n-button
              type="error"
              :loading="updatesStore.saving"
              :disabled="!canDisable"
              data-testid="platform-update-disable-submit"
              @click="disableChecks"
            >
              {{ $t('platformUpdates.disable') }}
            </n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>

<script>
import { startAuthentication } from '@simplewebauthn/browser'
import { usePlatformUpdatesStore, useSessionStore } from '../../stores/index.js'

function emptyDisableForm() {
  return { confirmation: '', method: 'password', password: '' }
}

export default {
  name: 'UpdateCenter',
  data() {
    return { showDisableModal: false, disableForm: emptyDisableForm() }
  },
  computed: {
    updatesStore() {
      return usePlatformUpdatesStore()
    },
    sessionStore() {
      return useSessionStore()
    },
    status() {
      return this.updatesStore.status
    },
    locale() {
      return this.sessionStore.user?.preferred_locale === 'de' ? 'de' : 'en'
    },
    canDisable() {
      return this.disableForm.confirmation === 'DISABLE_UPDATE_CHECKS'
        && (this.disableForm.method === 'passkey' || this.disableForm.password.trim().length > 0)
    },
    emptyDescription() {
      return this.status?.comparison_status === 'up_to_date'
        ? this.$t('platformUpdates.noReleases')
        : this.$t('platformUpdates.comparisonUnavailable')
    },
    statusAlert() {
      if (!this.status) return null
      if (this.status.checks_enabled === false) return { type: 'error', text: `${this.$t('platformUpdates.checksDisabled')} ${this.$t('platformUpdates.cachedWarning')}` }
      if (this.status.comparison_status === 'security_update_available') {
        return { type: this.securityAlertType(this.status.highest_security_severity), text: this.$t('platformUpdates.securityAvailable', { count: this.status.security_update_count, severity: this.status.highest_security_severity?.toUpperCase() || '' }) }
      }
      if (this.status.comparison_status === 'update_available') return { type: 'warning', text: this.$t('platformUpdates.updateAvailable', { count: this.status.update_count }) }
      if (this.status.comparison_status === 'up_to_date') return { type: 'success', text: this.$t('platformUpdates.upToDate') }
      if (this.status.comparison_status === 'ahead') return { type: 'info', text: this.$t('platformUpdates.ahead') }
      if (this.status.comparison_status === 'invalid_build') return { type: 'error', text: this.$t('platformUpdates.invalidBuild') }
      if (this.status.comparison_status === 'unknown_build') return { type: 'warning', text: this.$t('platformUpdates.unknownBuild') }
      return { type: 'warning', text: this.$t('platformUpdates.unknown') }
    }
  },
  async created() {
    try {
      await this.updatesStore.load({ force: true })
    } catch {
      window.$message?.error(this.$t('platformUpdates.checkFailedMessage'))
    }
  },
  methods: {
    localized(value) {
      return value?.[this.locale] || value?.en || ''
    },
    localizedSteps(release) {
      return release.upgrade?.manual_steps?.[this.locale] || release.upgrade?.manual_steps?.en || []
    },
    securityAlertType(severity) {
      if (severity === 'low') return 'info'
      if (severity === 'medium') return 'warning'
      return 'error'
    },
    formatDate(value) {
      if (!value) return this.$t('platformUpdates.never')
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return this.$t('platformUpdates.never')
      return new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    },
    async checkNow() {
      try {
        await this.updatesStore.checkNow()
      } catch {
        window.$message?.error(this.$t('platformUpdates.checkFailedMessage'))
      }
    },
    async acknowledge(version) {
      try {
        await this.updatesStore.acknowledge([version])
      } catch {
        window.$message?.error(this.$t('platformUpdates.acknowledgeFailed'))
      }
    },
    async toggleChecks(enabled) {
      if (!enabled) {
        this.disableForm = emptyDisableForm()
        this.showDisableModal = true
        return
      }
      try {
        await this.updatesStore.setChecksEnabled({ checks_enabled: true })
        window.$message?.success(this.$t('platformUpdates.enabledSuccess'))
      } catch {
        window.$message?.error(this.$t('platformUpdates.saveFailed'))
      }
    },
    closeDisableModal() {
      this.showDisableModal = false
      this.disableForm = emptyDisableForm()
    },
    async buildReauth() {
      if (this.disableForm.method === 'password') {
        return { method: 'password', current_password: this.disableForm.password }
      }
      const challenge = await this.updatesStore.beginPasskeyOptions()
      const authenticationResponse = await startAuthentication({ optionsJSON: challenge.options })
      return { method: 'passkey', challenge_id: challenge.challengeId, authentication_response: authenticationResponse }
    },
    async disableChecks() {
      if (!this.canDisable) return
      try {
        const reauth = await this.buildReauth()
        await this.updatesStore.setChecksEnabled({
          checks_enabled: false,
          confirmation: this.disableForm.confirmation,
          reauth
        })
        this.closeDisableModal()
        window.$message?.success(this.$t('platformUpdates.disabledSuccess'))
      } catch {
        window.$message?.error(this.$t('platformUpdates.saveFailed'))
      }
    }
  }
}
</script>

<style scoped>
.update-heading h3 { margin: 0; }
.update-alert { margin-bottom: 12px; }
.update-summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 16px 0; }
.summary-label { display: block; font-size: 12px; opacity: 0.65; margin-bottom: 5px; }
.owner-settings { margin-bottom: 16px; }
.setting-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
.setting-row p { margin: 5px 0 0; opacity: 0.75; }
.privacy-note { font-size: 12px; }
.release-list { display: flex; flex-direction: column; gap: 14px; }
.release-card.security-release { border-color: rgba(208, 48, 80, 0.65); }
.release-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.release-date { margin-left: 10px; opacity: 0.65; font-size: 12px; }
.release-card h4 { margin: 0 0 8px; }
.release-card h5 { margin: 18px 0 8px; }
.release-card li { margin: 7px 0; }
.release-card li .n-tag { margin-right: 6px; }
.security-advisory { margin: 8px 0; }
.upgrade-flags { padding-left: 20px; }
.update-empty { margin: 36px 0; }
.disable-modal { width: min(620px, calc(100vw - 24px)); }
.disable-form { margin-top: 18px; }
@media (max-width: 760px) {
  .update-summary-grid { grid-template-columns: 1fr; }
  .setting-row { align-items: flex-start; }
}
</style>
