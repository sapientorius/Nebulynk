<template>
  <div class="meeting-call-overlays" aria-live="polite">
    <n-card v-for="call in visibleCalls" :key="call.id" size="small" :data-testid="call.caller_id === selfId ? 'outgoing-call' : 'incoming-meeting-call'">
      <n-space vertical :size="8">
        <strong>{{ call.status === 'accepted' && call.recipient_status !== 'invited' ? $t('calls.ready') : call.caller_id === selfId ? $t('calls.ringing') : $t('ui.components.incoming_call') }}</strong>
        <span>{{ call.source_name || call.caller_name }}<template v-if="call.title"> · {{ call.title }}</template></span>
        <span v-if="call.status === 'ringing' || call.recipient_status === 'invited'">{{ seconds(call) }}s</span>
        <n-space justify="end">
          <template v-if="call.caller_id !== selfId && call.recipient_status === 'invited'">
            <n-button :disabled="!!busy[call.id]" @click="act(call, 'decline')">{{ $t('ui.components.decline') }}</n-button>
            <n-button type="primary" :loading="busy[call.id] === 'accept'" :disabled="!!busy[call.id]" @click="act(call, 'accept')">{{ $t('ui.components.accept') }}</n-button>
          </template>
          <n-button v-else-if="call.status === 'ringing'" :loading="!!busy[call.id]" @click="act(call, 'cancel')">{{ $t('common.cancel') }}</n-button>
          <template v-else>
            <n-button @click="dismissed.push(call.id)">{{ $t('common.close') }}</n-button>
            <n-button type="primary" :loading="!!busy[call.id]" @click="open(call)">{{ $t('calls.open') }}</n-button>
          </template>
        </n-space>
      </n-space>
    </n-card>
  </div>
</template>

<script>
import { useMeetingCallsStore } from '../stores/meeting-calls.js'
import { useSessionStore } from '../stores/session.js'
import { getApiErrorMessage } from '../lib/api-error.js'

export default {
  name: 'MeetingCallOverlay',
  data: () => ({ busy: {}, dismissed: [] }),
  computed: {
    callsStore: () => useMeetingCallsStore(),
    selfId: () => useSessionStore().user?.id,
    visibleCalls() {
      return [...this.callsStore.incoming, ...this.callsStore.outgoing,
        ...this.callsStore.available.filter(call => !this.dismissed.includes(call.id))]
    }
  },
  methods: {
    seconds(call) { return Math.max(0, Math.ceil((new Date(call.expires_at).getTime() - this.callsStore.now) / 1000)) },
    async act(call, action) {
      this.busy[call.id] = action
      try { await this.callsStore.act(call.id, action) }
      catch (error) { window.$message?.error(getApiErrorMessage(error) || this.$t('calls.unavailable')) }
      finally { delete this.busy[call.id] }
    },
    async open(call) {
      this.busy[call.id] = 'open'
      try { await this.callsStore.enter(call) }
      catch (error) { window.$message?.error(getApiErrorMessage(error) || this.$t('calls.unavailable')) }
      finally { delete this.busy[call.id] }
    }
  }
}
</script>

<style scoped>
.meeting-call-overlays {
  position: fixed;
  right: 20px;
  bottom: 160px;
  width: min(360px, calc(100vw - 40px));
  max-height: calc(100dvh - 180px);
  overflow-y: auto;
  display: grid;
  gap: 8px;
  z-index: 2200;
}
</style>
