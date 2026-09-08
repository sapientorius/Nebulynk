<template>
  <n-space align="center" :size="12" data-testid="call-history-entry">
    <span>{{ $t(`calls.${message.call_outcome}`) }}</span>
    <n-button size="small" :loading="loading" @click="retry">{{ $t('calls.retry') }}</n-button>
  </n-space>
</template>
<script>
import { useMeetingCallsStore } from '../stores/meeting-calls.js'
import { getApiErrorMessage } from '../lib/api-error.js'
export default {
  name: 'CallHistoryEntry',
  props: { message: { type: Object, required: true } },
  data: () => ({ loading: false }),
  methods: {
    async retry() {
      this.loading = true
      try { await useMeetingCallsStore().start(this.message.channel_id) }
      catch (error) { window.$message?.error(getApiErrorMessage(error) || this.$t('calls.unavailable')) }
      finally { this.loading = false }
    }
  }
}
</script>
