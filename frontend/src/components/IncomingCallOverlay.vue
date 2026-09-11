<template>
  <transition name="incoming-call-fade">
    <div v-if="currentCall" class="incoming-call-overlay" data-testid="incoming-call-overlay">
      <CallInvitationCard :name="displaySourceName" :context="currentCall.title || ''"
        :status="$t('ui.components.incoming_call')" :seconds="remainingSeconds">
        <n-button type="error" secondary :loading="declining" :disabled="accepting || declining" @click="declineCall">
          <template #icon><n-icon><CloseOutline /></n-icon></template>
          {{ $t('ui.components.decline') }}
        </n-button>
        <n-button type="success" :loading="accepting" :disabled="accepting || declining" @click="acceptCall">
          <template #icon><n-icon><CallOutline /></n-icon></template>
          {{ $t('ui.components.accept') }}
        </n-button>
      </CallInvitationCard>
    </div>
  </transition>
</template>

<script>
import { useMeetingsStore } from '../stores/meetings.js'
import { CallOutline, CloseOutline } from '@vicons/ionicons5'
import CallInvitationCard from './CallInvitationCard.vue'

export default {
  name: 'IncomingCallOverlay',
  components: { CallInvitationCard, CallOutline, CloseOutline },
  data() {
    return {
      tickingNow: Date.now(),
      tickerId: null,
      accepting: false,
      declining: false
    }
  },
  computed: {
    meetingsStore() {
      return useMeetingsStore()
    },
    currentCall() {
      return this.meetingsStore.incomingCalls[0] || null
    },
    displaySourceName() {
      if (!this.currentCall) return this.$t('ui.components.unknown_channel')
      return this.meetingsStore.resolveIncomingCallSourceName(this.currentCall)
    },
    remainingSeconds() {
      if (!this.currentCall) return 0
      const elapsed = this.tickingNow - this.currentCall.received_at
      const remainingMs = Math.max(0, 60_000 - elapsed)
      return Math.ceil(remainingMs / 1000)
    }
  },
  created() {
    this.tickerId = setInterval(() => {
      this.tickingNow = Date.now()
    }, 1000)
  },
  beforeUnmount() {
    if (this.tickerId) {
      clearInterval(this.tickerId)
      this.tickerId = null
    }
  },
  methods: {
    async acceptCall() {
      if (!this.currentCall) return
      const meetingId = this.currentCall.meeting_id
      this.accepting = true
      try {
        await this.meetingsStore.acceptIncomingCall(meetingId)
      } catch {
        window.$message?.error(this.$t('ui.components.could_not_join_call'))
        return
      } finally {
        this.accepting = false
      }

      await this.$router.push(`/meetings/${meetingId}`).catch(() => {})
    },
    async declineCall() {
      if (!this.currentCall) return
      const meetingId = this.currentCall.meeting_id
      this.declining = true
      try {
        await this.meetingsStore.declineIncomingCall(meetingId)
      } catch {
        window.$message?.error(this.$t('ui.components.could_not_decline_call'))
      } finally {
        this.declining = false
      }
    }
  }
}
</script>

<style scoped>
.incoming-call-overlay {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2200;
  width: min(380px, calc(100vw - 40px));
}

.incoming-call-fade-enter-active,
.incoming-call-fade-leave-active {
  transition: opacity 0.18s ease;
}

.incoming-call-fade-enter-from,
.incoming-call-fade-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .incoming-call-fade-enter-active, .incoming-call-fade-leave-active { transition: none; }
}
</style>
