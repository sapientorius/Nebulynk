<template>
  <n-alert
    v-if="visible"
    class="platform-update-banner"
    :type="alertType"
    :show-icon="true"
    data-testid="platform-update-banner"
  >
    <div class="platform-update-banner-content">
      <span>{{ bannerText }}</span>
      <n-space :size="8">
        <n-button size="small" secondary data-testid="platform-update-banner-details" @click="openDetails">
          {{ $t('platformUpdates.details') }}
        </n-button>
        <n-button
          v-if="updatesStore.unacknowledgedCount > 0"
          size="small"
          tertiary
          data-testid="platform-update-banner-acknowledge"
          @click="acknowledge"
        >
          {{ $t('platformUpdates.acknowledge') }}
        </n-button>
      </n-space>
    </div>
  </n-alert>
</template>

<script>
import { usePlatformUpdatesStore, useSessionStore } from '../stores/index.js'

export default {
  name: 'PlatformUpdateBanner',
  computed: {
    updatesStore() {
      return usePlatformUpdatesStore()
    },
    sessionStore() {
      return useSessionStore()
    },
    visible() {
      return this.sessionStore.user?.is_admin === true
        && Boolean(this.updatesStore.status)
        && (this.updatesStore.status.checks_enabled === false || this.updatesStore.unacknowledgedCount > 0)
    },
    alertType() {
      if (this.updatesStore.unacknowledgedSecuritySeverity === 'low') return 'info'
      if (this.updatesStore.unacknowledgedSecuritySeverity === 'medium') return 'warning'
      if (this.updatesStore.hasUnacknowledgedSecurity) return 'error'
      return 'warning'
    },
    bannerText() {
      if (this.updatesStore.status?.checks_enabled === false) return this.$t('platformUpdates.bannerDisabled')
      if (this.updatesStore.hasUnacknowledgedSecurity) {
        return this.$t('platformUpdates.bannerSecurity', {
          count: this.updatesStore.unacknowledgedSecurityCount,
          severity: this.updatesStore.unacknowledgedSecuritySeverity?.toUpperCase() || ''
        })
      }
      return this.$t('platformUpdates.bannerUpdate')
    }
  },
  methods: {
    openDetails() {
      this.$router.push({ path: '/admin', query: { tab: 'updates' } }).catch(() => {})
    },
    async acknowledge() {
      try {
        await this.updatesStore.acknowledgeAll()
      } catch {
        window.$message?.error(this.$t('platformUpdates.acknowledgeFailed'))
      }
    }
  }
}
</script>

<style scoped>
.platform-update-banner {
  margin: 8px 12px 0;
}

.platform-update-banner-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

@media (max-width: 700px) {
  .platform-update-banner-content {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
