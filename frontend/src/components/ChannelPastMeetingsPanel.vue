<template>
  <div class="channel-past-meetings-panel" data-testid="channel-past-meetings-panel">
    <div class="channel-past-meetings-header">
      <div class="channel-past-meetings-title">{{ $t('ui.views.past_meetings') }}</div>
    </div>

    <div v-if="loading && pastMeetings.length === 0" class="channel-past-meetings-state">
      <n-spin size="small" />
    </div>

    <template v-else-if="pastMeetings.length > 0">
      <div class="channel-past-meetings-list">
        <article
          v-for="meeting in pastMeetings"
          :key="meeting.id"
          class="channel-past-meeting-card"
          role="button"
          tabindex="0"
          @click="openMeeting(meeting.id)"
          @keydown.enter.prevent="openMeeting(meeting.id)"
          @keydown.space.prevent="openMeeting(meeting.id)"
        >
          <MeetingActionCard
            v-bind="buildPastMeetingCard(meeting)"
            variant="overview"
            :show-label="false"
            @open="openMeeting(meeting.id)"
          />
        </article>
      </div>

      <n-button
        v-if="canLoadMore"
        size="small"
        tertiary
        class="channel-past-meetings-load-more"
        data-testid="channel-past-meetings-load-more"
        :loading="loadingMore"
        @click="loadMore"
      >
        {{ $t('search.actions.load_more') }}
      </n-button>
    </template>

    <n-empty v-else :description="$t('ui.views.no_past_meetings')" />
  </div>
</template>

<script>
import MeetingActionCard from './MeetingActionCard.vue'
import { buildMeetingCardState, resolveMeetingMiniSummary } from '../lib/meeting-card.js'
import { useMeetingsStore } from '../stores/index.js'
import { useVoiceStore } from '../stores/voice.js'

export default {
  name: 'ChannelPastMeetingsPanel',
  components: {
    MeetingActionCard
  },
  props: {
    channelId: {
      type: String,
      default: null
    }
  },
  data() {
    return {
      pastMeetings: [],
      visibleCount: 4,
      pageSize: 4,
      canLoadMore: false,
      loading: false,
      loadingMore: false
    }
  },
  computed: {
    meetingsStore() {
      return useMeetingsStore()
    },
    voiceStore() {
      return useVoiceStore()
    }
  },
  watch: {
    channelId: {
      immediate: true,
      async handler() {
        this.visibleCount = 4
        this.canLoadMore = false
        this.pastMeetings = []
        await this.loadPastMeetings()
      }
    }
  },
  methods: {
    async loadPastMeetings() {
      if (!this.channelId) {
        this.pastMeetings = []
        this.canLoadMore = false
        return
      }

      const requestChannelId = this.channelId
      this.loading = true
      try {
        const requestedLimit = this.visibleCount + 1
        const meetings = await this.meetingsStore.fetchBySourceChannel(requestChannelId, {
          includeEnded: true,
          detail: 'full',
          limit: requestedLimit,
          timeBucket: 'past'
        })
        if (this.channelId !== requestChannelId) return

        this.canLoadMore = meetings.length > this.visibleCount
        this.pastMeetings = this.canLoadMore
          ? meetings.slice(0, this.visibleCount)
          : meetings
      } catch (error) {
        if (this.channelId !== requestChannelId) return
        console.error('Failed to load channel past meetings:', error)
        this.pastMeetings = []
        this.canLoadMore = false
      } finally {
        if (this.channelId === requestChannelId) {
          this.loading = false
        }
      }
    },
    async loadMore() {
      if (this.loadingMore || !this.canLoadMore) return

      this.loadingMore = true
      try {
        this.visibleCount += this.pageSize
        await this.loadPastMeetings()
      } finally {
        this.loadingMore = false
      }
    },
    buildPastMeetingCard(meeting) {
      return {
        ...buildMeetingCardState({
          meetingId: meeting.id,
          meeting,
          voiceChannelId: this.voiceStore.channelId,
          title: this.meetingsStore.resolveDisplayName(meeting),
          subtitle: this.formatMeetingTime(meeting.ended_at || meeting.cancelled_at || meeting.scheduled_end_at || meeting.started_at),
          tFn: (key, params) => this.$t(key, params)
        }),
        title: this.meetingsStore.resolveDisplayName(meeting),
        subtitle: this.formatMeetingTime(meeting.ended_at || meeting.cancelled_at || meeting.scheduled_end_at || meeting.started_at),
        miniSummary: resolveMeetingMiniSummary(meeting)
      }
    },
    formatMeetingTime(value) {
      if (!value) return this.$t('ui.views.time_unspecified')
      return new Date(value).toLocaleString()
    },
    async openMeeting(meetingId) {
      if (!meetingId) return
      await this.$router.push(`/meetings/${meetingId}`).catch(() => {})
    }
  }
}
</script>

<style scoped>
.channel-past-meetings-panel {
  display: grid;
  gap: 12px;
  align-content: start;
  padding: 14px 12px 16px;
}

.channel-past-meetings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.channel-past-meetings-title {
  font-size: 14px;
  font-weight: 700;
}

.channel-past-meetings-state {
  display: flex;
  justify-content: center;
  padding: 16px 0;
}

.channel-past-meetings-list {
  display: grid;
  gap: 10px;
}

.channel-past-meeting-card {
  min-width: 0;
  cursor: pointer;
}

.channel-past-meeting-card:focus-visible {
  outline: 2px solid rgba(99, 226, 183, 0.9);
  outline-offset: 4px;
  border-radius: 8px;
}

.channel-past-meetings-load-more {
  justify-self: start;
}
</style>
