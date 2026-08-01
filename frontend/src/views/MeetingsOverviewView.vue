<template>
  <div class="meetings-overview" data-testid="meetings-overview-view">
    <div class="meetings-overview-header">
      <h1>{{ $t('ui.views.meetings') }}</h1>
      <p>{{ $t('ui.views.meetings_overview_hint') }}</p>
    </div>

    <section class="meetings-group">
      <div class="meetings-group-title">{{ $t('ui.views.upcoming_meetings') }}</div>
      <div v-if="upcomingMeetings.length" class="meetings-grid">
        <article
          v-for="meeting in upcomingMeetings"
          :key="meeting.id"
          class="meeting-overview-card"
          role="button"
          tabindex="0"
          @click="openMeeting(meeting.id)"
          @keydown.enter.prevent="openMeeting(meeting.id)"
          @keydown.space.prevent="openMeeting(meeting.id)"
        >
          <MeetingActionCard
            v-bind="buildUpcomingCard(meeting)"
            variant="overview"
            :show-label="false"
            @open="openMeeting(meeting.id)"
            @join="joinMeeting(meeting.id)"
          />
        </article>
      </div>
      <n-empty v-else :description="$t('ui.views.no_upcoming_meetings')" />
    </section>

    <section class="meetings-group">
      <div class="meetings-group-title">{{ $t('ui.views.live_meetings') }}</div>
      <div v-if="liveMeetings.length" class="meetings-grid">
        <article
          v-for="meeting in liveMeetings"
          :key="meeting.id"
          class="meeting-overview-card"
          role="button"
          tabindex="0"
          @click="openMeeting(meeting.id)"
          @keydown.enter.prevent="openMeeting(meeting.id)"
          @keydown.space.prevent="openMeeting(meeting.id)"
        >
          <MeetingActionCard
            v-bind="buildLiveCard(meeting)"
            variant="overview"
            :show-label="false"
            @open="openMeeting(meeting.id)"
            @join="joinMeeting(meeting.id)"
          />
        </article>
      </div>
      <n-empty v-else :description="$t('ui.views.no_live_meetings')" />
    </section>

    <section class="meetings-group">
      <div class="meetings-group-title">{{ $t('ui.views.past_meetings') }}</div>
      <template v-if="pastMeetings.length">
        <div class="meetings-grid">
          <article
            v-for="meeting in pastMeetings"
            :key="meeting.id"
            class="meeting-overview-card"
            role="button"
            tabindex="0"
            @click="openMeeting(meeting.id)"
            @keydown.enter.prevent="openMeeting(meeting.id)"
            @keydown.space.prevent="openMeeting(meeting.id)"
          >
            <MeetingActionCard
              v-bind="buildPastCard(meeting)"
              variant="overview"
              :show-label="false"
              @open="openMeeting(meeting.id)"
            />
          </article>
        </div>
        <n-button
          v-if="canLoadMorePast"
          size="small"
          tertiary
          class="meetings-load-more"
          data-testid="meetings-overview-past-load-more"
          :loading="loadingMorePast"
          @click="loadMorePastMeetings"
        >
          {{ $t('search.actions.load_more') }}
        </n-button>
      </template>
      <n-empty v-else :description="$t('ui.views.no_past_meetings')" />
    </section>
  </div>
</template>

<script>
import { getApiErrorMessage } from '../lib/api-error.js'
import MeetingActionCard from '../components/MeetingActionCard.vue'
import { buildMeetingCardState } from '../lib/meeting-card.js'
import { useMeetingsStore } from '../stores/index.js'
import { useVoiceStore } from '../stores/voice.js'

export default {
  name: 'MeetingsOverviewView',
  components: {
    MeetingActionCard
  },
  data() {
    return {
      overviewBuckets: {
        upcoming: [],
        live: [],
        past: []
      },
      joiningMeetingById: {},
      canLoadMorePast: false,
      loadingMorePast: false,
      pastVisibleCount: 8,
      pastPageSize: 8
    }
  },
  computed: {
    meetingsStore() {
      return useMeetingsStore()
    },
    voiceStore() {
      return useVoiceStore()
    },
    liveMeetings() {
      return this.overviewBuckets.live
    },
    upcomingMeetings() {
      return this.overviewBuckets.upcoming
    },
    pastMeetings() {
      return this.overviewBuckets.past
    }
  },
  async created() {
    await this.loadOverview()
  },
  methods: {
    async loadOverview(options = {}) {
      const requestedPastVisibleCount = Number(options.pastVisibleCount)
      const pastVisibleCount = Number.isFinite(requestedPastVisibleCount)
        ? Math.max(Math.trunc(requestedPastVisibleCount), 1)
        : this.pastVisibleCount
      const buckets = await this.meetingsStore.loadOverviewBuckets({ pastVisibleCount })
      this.overviewBuckets = {
        upcoming: buckets.upcoming || [],
        live: buckets.live || [],
        past: buckets.past || []
      }
      this.canLoadMorePast = !!buckets.pastHasMore
      this.pastVisibleCount = pastVisibleCount
    },
    async loadMorePastMeetings() {
      if (this.loadingMorePast || !this.canLoadMorePast) return

      this.loadingMorePast = true
      try {
        await this.loadOverview({
          pastVisibleCount: this.pastVisibleCount + this.pastPageSize
        })
      } finally {
        this.loadingMorePast = false
      }
    },
    async openMeeting(meetingId) {
      await this.$router.push(`/meetings/${meetingId}`).catch(() => {})
    },
    buildUpcomingCard(meeting) {
      return {
        ...buildMeetingCardState({
          meetingId: meeting.id,
          meeting,
          voiceChannelId: this.voiceStore.channelId,
          isJoining: !!this.joiningMeetingById[meeting.id],
          title: this.meetingsStore.resolveDisplayName(meeting),
          tFn: (key, params) => this.$t(key, params)
        }),
        title: this.meetingsStore.resolveDisplayName(meeting),
        subtitle: null,
        summaryText: this.formatMeetingTime(meeting.scheduled_start_at || meeting.started_at)
      }
    },
    buildLiveCard(meeting) {
      const connectedCount = meeting.chat_channel_id
        ? (this.voiceStore.participants?.[meeting.chat_channel_id]?.length ?? null)
        : null

      return {
        ...buildMeetingCardState({
          meetingId: meeting.id,
          meeting,
          connectedCount,
          voiceChannelId: this.voiceStore.channelId,
          isJoining: !!this.joiningMeetingById[meeting.id],
          title: this.meetingsStore.resolveDisplayName(meeting),
          subtitle: this.meetingsStore.resolveSourceDisplayName(meeting),
          tFn: (key, params) => this.$t(key, params)
        }),
        title: this.meetingsStore.resolveDisplayName(meeting),
        subtitle: this.meetingsStore.resolveSourceDisplayName(meeting)
      }
    },
    buildPastCard(meeting) {
      return {
        ...buildMeetingCardState({
          meetingId: meeting.id,
          meeting,
          voiceChannelId: this.voiceStore.channelId,
          title: this.meetingsStore.resolveDisplayName(meeting),
          subtitle: this.formatMeetingTime(meeting.ended_at || meeting.scheduled_end_at || meeting.started_at),
          tFn: (key, params) => this.$t(key, params)
        }),
        title: this.meetingsStore.resolveDisplayName(meeting),
        subtitle: this.formatMeetingTime(meeting.ended_at || meeting.scheduled_end_at || meeting.started_at)
      }
    },
    async joinMeeting(meetingId) {
      if (!meetingId || this.joiningMeetingById[meetingId]) return

      this.joiningMeetingById = {
        ...this.joiningMeetingById,
        [meetingId]: true
      }

      try {
        await this.meetingsStore.join(meetingId)
        await this.$router.push(`/meetings/${meetingId}`).catch(() => {})
      } catch (error) {
        window.$message?.error(getApiErrorMessage(error) || this.$t('ui.components.could_not_join_call'))
      } finally {
        const next = { ...this.joiningMeetingById }
        delete next[meetingId]
        this.joiningMeetingById = next
      }
    },
    formatMeetingTime(value) {
      if (!value) return this.$t('ui.views.time_unspecified')
      return new Date(value).toLocaleString()
    }
  }
}
</script>

<style scoped>
.meetings-overview {
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow-y: auto;
  padding: 20px;
  display: grid;
  gap: 20px;
  align-content: start;
}

.meetings-overview-header {
  display: grid;
  gap: 4px;
}

.meetings-overview-header h1 {
  margin: 0;
  font-size: 24px;
}

.meetings-overview-header p {
  margin: 0;
  opacity: 0.7;
}

.meetings-group {
  display: grid;
  gap: 12px;
}

.meetings-group-title {
  font-weight: 700;
}

.meetings-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

.meetings-load-more {
  justify-self: start;
}

.meeting-overview-card {
  min-width: 0;
  cursor: pointer;
}

.meeting-overview-card:focus-visible {
  outline: 2px solid rgba(99, 226, 183, 0.9);
  outline-offset: 4px;
  border-radius: 8px;
}

@media (max-width: 900px) {
  .meetings-overview {
    padding: 16px 12px 20px;
  }

  .meetings-grid {
    grid-template-columns: 1fr;
  }
}
</style>
