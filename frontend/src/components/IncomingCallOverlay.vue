<template>
  <transition name="incoming-call-fade">
    <div v-if="currentCall" class="incoming-call-overlay" data-testid="incoming-call-overlay">
      <n-card size="small" class="incoming-call-card">
        <n-space vertical :size="6">
          <div class="incoming-call-title">{{ $t('ui.components.incoming_call') }}</div>
          <div class="incoming-call-context">
            <strong>{{ displaySourceName }}</strong>
            <span v-if="currentCall.title">- {{ currentCall.title }}</span>
          </div>
          <div class="incoming-call-countdown">
            {{ $t('ui.components.auto_decline_in') }} {{ remainingSeconds }}s
          </div>
          <n-space :size="8" justify="end">
            <n-button size="small" :disabled="accepting || declining" @click="declineCall">
              {{ $t('ui.components.decline') }}
            </n-button>
            <n-button type="primary" size="small" :loading="accepting" :disabled="declining" @click="acceptCall">
              {{ $t('ui.components.accept') }}
            </n-button>
          </n-space>
        </n-space>
      </n-card>
    </div>
  </transition>
</template>

<script>
import { useMeetingsStore } from '../stores/meetings.js'

export default {
  name: 'IncomingCallOverlay',
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
      const remainingMs = Math.max(0, 30_000 - elapsed)
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
  width: min(360px, calc(100vw - 24px));
}

.incoming-call-card {
  background: var(--app-overlay);
  border: 1px solid var(--app-border-strong);
}

.incoming-call-title {
  font-size: 13px;
  font-weight: 600;
  opacity: 0.95;
}

.incoming-call-context {
  font-size: 13px;
  opacity: 0.9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.incoming-call-countdown {
  font-size: 12px;
  opacity: 0.65;
}

.incoming-call-fade-enter-active,
.incoming-call-fade-leave-active {
  transition: opacity 0.18s ease;
}

.incoming-call-fade-enter-from,
.incoming-call-fade-leave-to {
  opacity: 0;
}
</style>
