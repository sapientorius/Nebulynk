<template>
  <section class="summary-history" data-testid="summary-change-history">
    <strong>{{ $t('summaryEdit.history') }}</strong>
    <n-spin v-if="loading" size="small" />
    <template v-else>
      <n-alert v-if="error" type="error" :show-icon="false">{{ $t('summaryEdit.historyFailed') }}
        <n-button text @click="load">{{ $t('summaryEdit.retry') }}</n-button>
      </n-alert>
      <span v-else-if="!entries.length">{{ $t('summaryEdit.emptyHistory') }}</span>
      <article v-for="entry in entries" :key="entry.id" data-testid="summary-change-entry">
        <div class="summary-history-meta">{{ entry.user_display_name || $t('ui.components.unknown') }} · {{ formatDate(entry.applied_at) }}</div>
        <div>{{ entry.change_summary }}</div>
      </article>
      <n-pagination v-if="total > pageSize" v-model:page="page" :page-size="pageSize" :item-count="total" @update:page="load" />
    </template>
  </section>
</template>

<script>
import api from '../lib/api.js'
import { getCurrentLocale } from '../lib/i18n.js'
export default {
  name: 'MeetingSummaryHistory',
  props: { meetingId: { type: String, required: true }, revisionKey: { type: String, default: '' } },
  data() { return { entries: [], total: 0, page: 1, pageSize: 10, loading: false, error: false, generation: 0 } },
  watch: {
    meetingId: { immediate: true, handler() { this.page = 1; this.entries = []; this.load() } },
    revisionKey() { this.page = 1; this.load() }
  },
  beforeUnmount() { this.generation++ },
  methods: {
    formatDate(value) { return new Date(value).toLocaleString(getCurrentLocale()) },
    async load() {
      const generation = ++this.generation
      this.loading = true; this.error = false
      try {
        const { data } = await api.get('/meeting-summary-revisions', { params: { meeting_id: this.meetingId, $limit: this.pageSize, $skip: (this.page - 1) * this.pageSize } })
        if (generation !== this.generation) return
        this.entries = data.data; this.total = data.total
      } catch { if (generation === this.generation) { this.entries = []; this.error = true } }
      finally { if (generation === this.generation) this.loading = false }
    }
  }
}
</script>

<style scoped>
.summary-history { margin-top: 20px; border-top: 1px solid var(--app-border-soft); padding-top: 16px; display: flex; flex-direction: column; gap: 12px; }
.summary-history article { display: flex; flex-direction: column; gap: 4px; }
.summary-history-meta { font-size: 12px; opacity: .7; }
</style>
