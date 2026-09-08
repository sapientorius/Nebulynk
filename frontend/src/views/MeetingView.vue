<template>
  <div class="workspace-context" data-testid="meeting-view">
    <div v-if="meeting?.content_access?.allowed === false" class="meeting-access-restricted" data-testid="meeting-access-restricted">
      <n-empty :description="$t('meetingHistoryAccess.denied')">
        <template #icon><n-icon size="34"><lock-closed-icon /></n-icon></template>
        <template #extra><strong>{{ $t('meetingHistoryAccess.restricted_title') }}</strong></template>
      </n-empty>
    </div>
    <div v-else class="main-area" :class="{ 'share-maximized': uiStore.maximizeScreenShare }">
      <MeetingHistorySurface :key="meetingId" :meeting="meeting" :is-mobile-layout="isMobileLayout" :show-members="showMembers">
        <template #header="{ isShortViewport }">
          <MeetingManagementActions
            ref="management" :meeting="meeting" :is-mobile-layout="isMobileLayout" :is-short-viewport="isShortViewport"
            @toggle-members="$emit('toggle-members')" @invite="$refs.invite?.open()" @open-video="$refs.live?.openMeetingVideoPanel()"
          />
        </template>
        <template #live>
          <MeetingLiveSurface ref="live" :meeting="meeting" :is-mobile-layout="isMobileLayout" @close-actions="$refs.management?.closeMenus()" />
        </template>
      </MeetingHistorySurface>
      <MeetingInviteDialog :key="meetingId" ref="invite" :meeting="meeting" />
    </div>
  </div>
</template>

<script>
import { LockClosedOutline as LockClosedIcon } from '@vicons/ionicons5'
import { useMeetingsStore, useUiStore } from '../stores/index.js'
import { observeMobileLayout, readIsMobileLayout } from '../lib/mobile-layout.js'
import MeetingHistorySurface from '../components/meetings/MeetingHistorySurface.vue'
import MeetingLiveSurface from '../components/meetings/MeetingLiveSurface.vue'
import MeetingManagementActions from '../components/meetings/MeetingManagementActions.vue'
import MeetingInviteDialog from '../components/meetings/MeetingInviteDialog.vue'

export default {
  name: 'MeetingView',
  components: { LockClosedIcon, MeetingHistorySurface, MeetingLiveSurface, MeetingManagementActions, MeetingInviteDialog },
  emits: ['toggle-members'],
  props: { showMembers: { type: Boolean, default: false } },
  data() { return { isMobileLayout: readIsMobileLayout(), stopObservingMobileLayout: null, routeGeneration: 0 } },
  computed: {
    meetingsStore() { return useMeetingsStore() },
    uiStore() { return useUiStore() },
    meeting() { return this.meetingsStore.activeMeeting },
    meetingId() { return this.$route.params.meetingId || null }
  },
  watch: {
    meetingId: { immediate: true, handler(id) { if (id) this.loadMeeting(id) } }
  },
  mounted() {
    this.stopObservingMobileLayout = observeMobileLayout(matches => { this.isMobileLayout = matches })
  },
  methods: {
    async loadMeeting(id) {
      const generation = ++this.routeGeneration
      this.uiStore.resetScreenShareVisibility()
      try { await this.meetingsStore.setActive(id) } catch {
        if (generation === this.routeGeneration) window.$message?.error(this.$t('ui.views.meeting_could_not_be_loaded'))
      }
    },
    clearMeetingContext() {
      this.uiStore.resetScreenShareVisibility()
      this.meetingsStore.clearActive()
    }
  },
  beforeRouteLeave(to, from, next) {
    if (to?.name !== 'Meeting' && to?.name !== 'MeetingScreenShare') this.clearMeetingContext()
    next()
  },
  beforeUnmount() {
    this.routeGeneration++
    this.stopObservingMobileLayout?.()
  }
}
</script>

<style scoped>
.meeting-access-restricted { display: grid; place-items: center; min-height: 100%; padding: 32px; }
.workspace-context, .main-area { flex: 1; display: flex; min-width: 0; overflow: hidden; }
.main-area { flex-direction: column; position: relative; }
.main-area.share-maximized { background: transparent; }
</style>
