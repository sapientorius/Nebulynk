<template>
  <div data-testid="system-info-panel">
    <n-space justify="space-between" align="center" class="system-info-heading">
      <div>
        <h3>{{ $t('systemInfo.title') }}</h3>
        <p>{{ $t('systemInfo.lastUpdated', { time: formatDate(status?.snapshot_at) }) }}</p>
      </div>
      <n-button
        :type="isRefreshRecommended ? 'warning' : 'primary'"
        :loading="systemInfoStore.loading || systemInfoStore.refreshing"
        :disabled="systemInfoStore.loading || systemInfoStore.refreshing"
        :class="{ 'storage-refresh-stale': isRefreshRecommended }"
        data-testid="system-info-refresh"
        @click="refresh"
      >
        {{ $t('systemInfo.refresh') }}
      </n-button>
    </n-space>

    <n-spin :show="systemInfoStore.loading">
      <n-alert v-if="systemInfoStore.error && !status" type="error" :show-icon="true" class="system-info-alert">
        {{ $t('systemInfo.loadFailed') }}
      </n-alert>
      <n-alert v-else-if="systemInfoStore.error" type="warning" :show-icon="true" class="system-info-alert">
        {{ $t('systemInfo.refreshFailed') }}
      </n-alert>
      <n-alert v-if="isPartial" type="warning" :show-icon="true" class="system-info-alert">
        {{ $t('systemInfo.partial') }}
      </n-alert>
      <n-alert v-if="isRefreshRecommended" type="warning" :show-icon="true" class="system-info-alert" data-testid="system-info-stale-warning">
        {{ status?.refresh_failed ? $t('systemInfo.refreshFailed') : $t('systemInfo.stale') }}
      </n-alert>

      <section aria-labelledby="storage-usage-heading" data-testid="system-info-storage-usage">
        <h4 id="storage-usage-heading">{{ $t('systemInfo.storageUsage') }}</h4>
        <div class="storage-usage-grid">
          <n-card size="small" data-testid="storage-usage-total">
            <span class="storage-label">{{ $t('systemInfo.total') }}</span>
            <strong>{{ formatBytes(status?.total_bytes) }}</strong>
          </n-card>
          <n-card size="small" data-testid="storage-usage-database">
            <span class="storage-label">{{ $t('systemInfo.database') }}</span>
            <strong>{{ formatBytes(status?.database?.bytes) }}</strong>
          </n-card>
          <n-card size="small" data-testid="storage-usage-files">
            <span class="storage-label">{{ $t('systemInfo.files') }}</span>
            <strong>{{ formatBytes(status?.object_storage?.files?.bytes) }}</strong>
            <small>{{ objectCount(status?.object_storage?.files?.object_count) }}</small>
          </n-card>
          <n-card size="small" data-testid="storage-usage-recordings">
            <span class="storage-label">{{ $t('systemInfo.meetingRecordings') }}</span>
            <strong>{{ formatBytes(status?.object_storage?.meeting_recordings?.bytes) }}</strong>
            <small>{{ objectCount(status?.object_storage?.meeting_recordings?.object_count) }}</small>
          </n-card>
        </div>
      </section>

      <n-alert type="info" :show-icon="true" class="storage-usage-note">
        {{ $t('systemInfo.logicalUsage') }}
      </n-alert>
    </n-spin>
  </div>
</template>

<script>
import { useSessionStore, useSystemInfoStore } from '../../stores/index.js'
import { formatStorageBytes } from '../../lib/storage-usage.js'

const STALE_AFTER_SECONDS = 10 * 60

export default {
  name: 'SystemInfo',
  data() {
    return {
      nowMs: Date.now(),
      clockTimer: null
    }
  },
  computed: {
    systemInfoStore() {
      return useSystemInfoStore()
    },
    sessionStore() {
      return useSessionStore()
    },
    status() {
      return this.systemInfoStore.storageUsage
    },
    locale() {
      return this.sessionStore.user?.preferred_locale === 'de' ? 'de' : 'en'
    },
    snapshotAgeSeconds() {
      const snapshotAt = this.status?.snapshot_at
      if (snapshotAt) {
        const timestamp = new Date(snapshotAt).getTime()
        if (!Number.isNaN(timestamp)) return Math.max(0, Math.floor((this.nowMs - timestamp) / 1000))
      }
      return Number(this.status?.age_seconds) || 0
    },
    isRefreshRecommended() {
      return this.status?.refresh_failed === true || this.snapshotAgeSeconds >= STALE_AFTER_SECONDS
    },
    isPartial() {
      return this.status?.state === 'partial'
    }
  },
  async created() {
    try {
      await this.systemInfoStore.load()
    } catch {
      // The inline error state remains available and the user can retry manually.
    }
  },
  mounted() {
    this.clockTimer = window.setInterval(() => {
      this.nowMs = Date.now()
    }, 30 * 1000)
  },
  beforeUnmount() {
    if (this.clockTimer) window.clearInterval(this.clockTimer)
  },
  methods: {
    formatBytes(value) {
      return formatStorageBytes(value, this.locale)
    },
    objectCount(value) {
      if (value === null || value === undefined) return '–'
      const count = Number(value)
      if (!Number.isFinite(count) || count < 0) return '–'
      return this.$t('systemInfo.objects', { count: new Intl.NumberFormat(this.locale).format(count) })
    },
    formatDate(value) {
      if (!value) return this.$t('systemInfo.never')
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return this.$t('systemInfo.never')
      return new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    },
    async refresh() {
      try {
        await this.systemInfoStore.refresh()
      } catch {
        window.$message?.error(this.$t('systemInfo.refreshFailed'))
      }
    }
  }
}
</script>

<style scoped>
.system-info-heading { margin-bottom: 20px; }
.system-info-heading h3 { margin: 0; }
.system-info-heading p { margin: 5px 0 0; font-size: 12px; opacity: 0.68; }
.system-info-alert { margin-bottom: 12px; }
.storage-refresh-stale { font-weight: 700; }
.storage-usage-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 12px 0 16px; }
.storage-label { display: block; font-size: 12px; opacity: 0.68; margin-bottom: 5px; }
.storage-usage-grid strong { display: block; font-size: 20px; line-height: 1.25; overflow-wrap: anywhere; }
.storage-usage-grid small { display: block; margin-top: 6px; opacity: 0.68; }
.storage-usage-note { margin-top: 12px; }
@media (max-width: 960px) {
  .storage-usage-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  .system-info-heading { align-items: flex-start; }
  .storage-usage-grid { grid-template-columns: 1fr; }
}
</style>
