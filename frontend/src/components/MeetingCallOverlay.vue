<template>
  <div v-if="visibleCalls.length" :class="channelId ? 'meeting-call-banner' : 'meeting-call-overlays'">
    <CallInvitationCard v-for="call in visibleCalls" :key="call.id"
      :compact="!!channelId" :outgoing="call.caller_id === selfId"
      :name="displayName(call)" :context="displayContext(call)"
      :status="call.status === 'accepted' && call.recipient_status !== 'invited' ? $t('calls.ready') : call.caller_id === selfId ? $t('calls.ringing') : $t('ui.components.incoming_call')"
      :seconds="call.status === 'ringing' || call.recipient_status === 'invited' ? seconds(call) : null"
      :data-testid="channelId ? 'chat-call-banner' : call.caller_id === selfId ? 'outgoing-call' : 'incoming-meeting-call'">
      <template v-if="call.caller_id !== selfId && call.recipient_status === 'invited'">
        <n-button type="error" secondary :loading="busy[call.id] === 'decline'" :disabled="!!busy[call.id]" @click="act(call, 'decline')">
          <template #icon><n-icon><CloseOutline /></n-icon></template>{{ $t('ui.components.decline') }}
        </n-button>
        <n-button type="success" :loading="busy[call.id] === 'accept'" :disabled="!!busy[call.id]" @click="act(call, 'accept')">
          <template #icon><n-icon><CallOutline /></n-icon></template>{{ $t('ui.components.accept') }}
        </n-button>
      </template>
      <n-button v-else-if="call.status === 'ringing'" type="error" secondary :loading="!!busy[call.id]" :disabled="!!busy[call.id]" @click="act(call, 'cancel')">
        <template #icon><n-icon><CloseOutline /></n-icon></template>{{ $t('common.cancel') }}
      </n-button>
      <template v-else>
        <n-button @click="dismissed.push(call.id)">{{ $t('common.close') }}</n-button>
        <n-button type="primary" :loading="!!opening[call.id]" @click="open(call)">{{ $t('calls.open') }}</n-button>
      </template>
    </CallInvitationCard>
  </div>
</template>

<script>
import { useMeetingCallsStore } from '../stores/meeting-calls.js'
import { useSessionStore } from '../stores/session.js'
import { getApiErrorMessage } from '../lib/api-error.js'
import { CallOutline, CloseOutline } from '@vicons/ionicons5'
import CallInvitationCard from './CallInvitationCard.vue'

export default {
  name: 'MeetingCallOverlay',
  components: { CallInvitationCard, CallOutline, CloseOutline },
  props: { channelId: { type: String, default: null } },
  data: () => ({ opening: {}, dismissed: [] }),
  computed: {
    callsStore: () => useMeetingCallsStore(),
    selfId: () => useSessionStore().user?.id,
    busy() { return this.callsStore.busy },
    visibleCalls() {
      if (this.channelId) return [...this.callsStore.incoming, ...this.callsStore.outgoing]
        .filter(call => call.source_channel_id === this.channelId)
      return [...this.callsStore.incoming, ...this.callsStore.outgoing,
        ...this.callsStore.available.filter(call => !this.dismissed.includes(call.id))]
    }
  },
  watch: {
    channelId: {
      immediate: true,
      handler(id) {
        if (id) this.callsStore.refresh().catch(() => {})
      }
    }
  },
  methods: {
    displayName(call) {
      return (call.caller_id === this.selfId ? call.source_name : call.caller_name) || call.source_name || this.$t('ui.components.unknown_channel')
    },
    displayContext(call) {
      return [call.source_name !== this.displayName(call) ? call.source_name : '', call.title].filter(Boolean).join(' · ')
    },
    seconds(call) { return Math.max(0, Math.ceil((new Date(call.expires_at).getTime() - this.callsStore.now) / 1000)) },
    async act(call, action) {
      try { await this.callsStore.act(call.id, action) }
      catch (error) { window.$message?.error(getApiErrorMessage(error) || this.$t('calls.unavailable')) }
    },
    async open(call) {
      this.opening[call.id] = true
      try { await this.callsStore.enter(call) }
      catch (error) { window.$message?.error(getApiErrorMessage(error) || this.$t('calls.unavailable')) }
      finally { delete this.opening[call.id] }
    }
  }
}
</script>

<style scoped>
.meeting-call-banner {
  flex-shrink: 0;
  padding: 8px 12px;
  display: grid;
  gap: 8px;
}
.meeting-call-overlays {
  position: fixed;
  right: 20px;
  bottom: 160px;
  width: min(380px, calc(100vw - 40px));
  max-height: calc(100dvh - 180px);
  overflow-y: auto;
  display: grid;
  gap: 8px;
  z-index: 2200;
}
</style>
