<template>
  <div class="workspace-root" :class="{ 'share-maximized-root': shareMaximized }" data-testid="workspace-shell">
    <header class="top-bar">
      <div class="top-bar-brand">
        <n-button
          v-if="isMobileLayout && !isGuestUser"
          quaternary
          circle
          size="small"
          :data-testid="mobileNavTestId"
          :title="$t('sidebar.sections.channels')"
          @click="openMobileSidebar"
        >
          <template #icon><n-icon size="22"><menu-icon /></n-icon></template>
        </n-button>
        <span class="top-bar-name">Nebulynk</span>
      </div>
      <div class="top-bar-actions">
        <template v-if="!isGuestUser">
        <n-button
          quaternary
          circle
          size="small"
          data-testid="open-global-search"
          @click="openGlobalSearch"
          :title="$t('search.actions.open')"
        >
          <template #icon><n-icon size="22"><search-icon /></n-icon></template>
        </n-button>
        <n-badge :value="unreadNotificationsCount" :max="99" :show="unreadNotificationsCount > 0" type="warning">
          <n-button
            quaternary
            circle
            size="small"
            data-testid="open-notifications-panel"
            @click="openNotifications"
            :title="$t('app.notifications')"
          >
            <template #icon><n-icon size="22"><bell-icon /></n-icon></template>
          </n-button>
        </n-badge>
        </template>
        <UserAccountMenu @logout="doLogout" />
      </div>
    </header>

    <PlatformUpdateBanner />

    <SponsorshipPrompt
      :show="uiStore.showSponsorshipPrompt"
      @close="closeSponsorshipPrompt"
    />

    <div class="workspace-body">
      <aside v-if="!isMobileLayout && !isGuestUser" class="sidebar">
        <ChannelSidebar @channel-selected="onChannelSelected" />
      </aside>

      <main class="workspace-main">
        <router-view v-if="sessionReady" v-slot="{ Component }">
          <component
            :is="Component"
            :show-members="rightPanelMode === 'members'"
            :right-panel-mode="rightPanelMode"
            @toggle-members="toggleRightPanel('members')"
            @toggle-past-meetings="toggleRightPanel('pastMeetings')"
          />
        </router-view>
      </main>
    </div>

    <n-drawer
      v-if="!isGuestUser"
      :show="showMobileSidebar"
      placement="left"
      :width="320"
      :data-testid="mobileSidebarDrawerTestId"
      @update:show="onMobileSidebarVisibilityChange"
    >
      <n-drawer-content body-content-style="padding: 0;">
        <div class="mobile-sidebar-drawer">
          <ChannelSidebar @channel-selected="onChannelSelected" />
        </div>
      </n-drawer-content>
    </n-drawer>

    <n-drawer
      v-model:show="showMobileRightPanel"
      placement="right"
      :width="mobileRightPanelWidth"
      :data-testid="mobileMembersDrawerTestId"
    >
      <n-drawer-content :title="membersDrawerTitle" body-content-style="padding: 0;">
        <MemberList v-if="rightPanelMode === 'members' && canRenderMembersList" />
        <ChannelPastMeetingsPanel
          v-else-if="rightPanelMode === 'pastMeetings' && canRenderPastMeetingsPanel"
          :channel-id="channelsStore.activeChannelId"
        />
      </n-drawer-content>
    </n-drawer>

    <StatusPicker v-if="showStatusPicker" />
    <UserProfileCard v-if="showUserProfileCard" />
    <PinnedMessages v-if="showPinnedMessagesPanel" />
    <NotificationsPanel v-if="showNotificationsPanel" />
    <NewDmModal v-if="showNewDmModal" />
    <ForwardMessageModal v-if="showForwardMessageModal" />
    <GlobalSearchDialog />
    <VoiceControls v-if="showGuestVoiceDock" variant="floating" />
    <VoiceSettings />
  </div>
</template>

<script>
import { defineAsyncComponent } from 'vue'
import {
  MenuOutline as MenuIcon,
  NotificationsOutline as BellIcon,
  SearchOutline as SearchIcon
} from '@vicons/ionicons5'
import {
  useSessionStore,
  useChannelsStore,
  useDmsStore,
  useMessagesStore,
  useNotificationsStore,
  usePlatformUpdatesStore,
  useSearchStore,
  useUiStore,
  useMeetingsStore,
  useVoiceStore
} from '../stores/index.js'
import { observeMobileLayout, readIsMobileLayout } from '../lib/mobile-layout.js'
import {
  buildMobileSidebarClosedLocation,
  buildMobileSidebarOpenLocation,
  isMobileSidebarRouteOpen,
  resolveMobileSidebarCloseAction,
  resolveMobileSidebarSelectionAction
} from '../lib/mobile-sidebar-route.js'
import { claimSponsorshipPrompt as claimSponsorshipPromptRequest } from '../lib/api.js'

const ChannelSidebar = defineAsyncComponent(() => import('../components/ChannelSidebar.vue'))
const ChannelPastMeetingsPanel = defineAsyncComponent(() => import('../components/ChannelPastMeetingsPanel.vue'))
const MemberList = defineAsyncComponent(() => import('../components/MemberList.vue'))
const StatusPicker = defineAsyncComponent(() => import('../components/StatusPicker.vue'))
const UserProfileCard = defineAsyncComponent(() => import('../components/UserProfileCard.vue'))
const PinnedMessages = defineAsyncComponent(() => import('../components/PinnedMessages.vue'))
const NotificationsPanel = defineAsyncComponent(() => import('../components/NotificationsPanel.vue'))
const NewDmModal = defineAsyncComponent(() => import('../components/NewDmModal.vue'))
const ForwardMessageModal = defineAsyncComponent(() => import('../components/ForwardMessageModal.vue'))
const GlobalSearchDialog = defineAsyncComponent(() => import('../components/GlobalSearchDialog.vue'))
const UserAccountMenu = defineAsyncComponent(() => import('../components/UserAccountMenu.vue'))
const VoiceControls = defineAsyncComponent(() => import('../components/VoiceControls.vue'))
const VoiceSettings = defineAsyncComponent(() => import('../components/VoiceSettings.vue'))
const SponsorshipPrompt = defineAsyncComponent(() => import('../components/SponsorshipPrompt.vue'))
const PlatformUpdateBanner = defineAsyncComponent(() => import('../components/PlatformUpdateBanner.vue'))

export default {
  name: 'WorkspaceShell',
  components: {
    BellIcon,
    ChannelPastMeetingsPanel,
    ChannelSidebar,
    ForwardMessageModal,
    GlobalSearchDialog,
    MemberList,
    MenuIcon,
    NewDmModal,
    NotificationsPanel,
    PlatformUpdateBanner,
    PinnedMessages,
    SearchIcon,
    SponsorshipPrompt,
    StatusPicker,
    UserAccountMenu,
    UserProfileCard,
    VoiceControls,
    VoiceSettings
  },
  data() {
    return {
      isMobileLayout: readIsMobileLayout(),
      sessionReady: false,
      sponsorshipPromptChecked: false,
      rightPanelMode: 'closed',
      suppressNextMobileSidebarClose: false,
      stopObservingMobileLayout: null
    }
  },
  computed: {
    sessionStore() {
      return useSessionStore()
    },
    channelsStore() {
      return useChannelsStore()
    },
    dmsStore() {
      return useDmsStore()
    },
    messagesStore() {
      return useMessagesStore()
    },
    notificationsStore() {
      return useNotificationsStore()
    },
    updatesStore() {
      return usePlatformUpdatesStore()
    },
    meetingsStore() {
      return useMeetingsStore()
    },
    searchStore() {
      return useSearchStore()
    },
    voiceStore() {
      return useVoiceStore()
    },
    uiStore() {
      return useUiStore()
    },
    shareMaximized() {
      return this.uiStore.maximizeScreenShare
    },
    isGuestUser() {
      return this.sessionStore.user?.account_type === 'guest'
    },
    unreadNotificationsCount() {
      return this.notificationsStore.unreadCount
    },
    showStatusPicker() {
      return this.uiStore.showStatusModal
    },
    showUserProfileCard() {
      return this.uiStore.showProfileDrawer
    },
    showPinnedMessagesPanel() {
      return this.uiStore.showPinnedPanel
    },
    showNotificationsPanel() {
      return this.notificationsStore.showPanel
    },
    showNewDmModal() {
      return this.dmsStore.showNewDmModal
    },
    showForwardMessageModal() {
      return Boolean(this.messagesStore.forwardContext)
    },
    showGuestVoiceDock() {
      return this.isGuestUser && !!this.voiceStore.channelId
    },
    isMeetingRoute() {
      return this.$route.name === 'Meeting'
    },
    mobileNavTestId() {
      return this.isMeetingRoute ? 'meeting-mobile-nav-trigger' : 'app-mobile-nav-trigger'
    },
    mobileSidebarDrawerTestId() {
      return this.isMeetingRoute ? 'meeting-mobile-sidebar-drawer' : 'app-mobile-sidebar-drawer'
    },
    mobileMembersDrawerTestId() {
      return this.isMeetingRoute ? 'meeting-mobile-members-drawer' : 'app-mobile-members-drawer'
    },
    mobileRightPanelWidth() {
      return this.rightPanelMode === 'pastMeetings' ? 340 : 260
    },
    showMobileSidebar() {
      return this.isMobileLayout
        && !this.isGuestUser
        && !this.shareMaximized
        && isMobileSidebarRouteOpen(this.$route)
    },
    showMobileRightPanel: {
      get() {
        return this.isMobileLayout && this.rightPanelMode !== 'closed'
      },
      set(value) {
        if (!value) {
          this.rightPanelMode = 'closed'
        }
      }
    },
    membersDrawerTitle() {
      if (this.rightPanelMode === 'pastMeetings') {
        return this.$t('ui.views.past_meetings')
      }
      return this.isMeetingRoute ? this.$t('ui.views.participants') : this.$t('ui.components.members')
    },
    canRenderMembersList() {
      if (this.shareMaximized) return false
      if (this.isMeetingRoute) {
        return !!this.meetingsStore.activeMeeting
      }
      return !!this.channelsStore.activeChannelId
    },
    canRenderPastMeetingsPanel() {
      if (this.shareMaximized || this.isMeetingRoute) return false
      return !!this.channelsStore.activeChannelId
    }
  },
  async created() {
    await this.sessionStore.init()
    this.sessionReady = true
    if (this.sessionStore.user?.is_admin === true) {
      await this.updatesStore.load().catch(() => {})
    }
    this.claimSponsorshipPrompt()
  },
  mounted() {
    this.stopObservingMobileLayout = observeMobileLayout((matches) => {
      this.isMobileLayout = matches
    })
    window.addEventListener('keydown', this.onGlobalKeydown)
  },
  beforeUnmount() {
    this.stopObservingMobileLayout?.()
    window.removeEventListener('keydown', this.onGlobalKeydown)
  },
  watch: {
    isMobileLayout(value) {
      if (!value) {
        this.closeMobileSidebar({ forceReplace: true })
      }
    },
    isGuestUser(value) {
      if (value) {
        this.closeMobileSidebar({ forceReplace: true })
      }
    },
    '$route.fullPath'() {
      if (this.shareMaximized) {
        this.rightPanelMode = 'closed'
      }
      if (this.rightPanelMode === 'pastMeetings' && !this.canRenderPastMeetingsPanel) {
        this.rightPanelMode = 'closed'
      }
      if (!this.isMeetingRoute && this.rightPanelMode === 'members' && !this.canRenderMembersList) {
        this.rightPanelMode = 'closed'
      }
    },
    shareMaximized(value) {
      if (value) {
        this.rightPanelMode = 'closed'
        this.closeMobileSidebar({ forceReplace: true })
      }
    }
  },
  methods: {
    async onChannelSelected(targetRoute) {
      if (!targetRoute) return

      const resolvedTarget = this.$router.resolve(targetRoute)
      const action = resolveMobileSidebarSelectionAction(this.$route, resolvedTarget, {
        isMobileLayout: this.isMobileLayout,
        historyState: this.currentHistoryState()
      })

      if (action.mode === 'transfer') {
        this.suppressNextMobileSidebarClose = true
        await this.$router.replace(action.openTo).catch(() => {})
        await this.$router.push(action.closedTo).catch(() => {})
        return
      }

      await this.$router.push(action.to).catch(() => {})
    },
    currentHistoryState() {
      if (typeof window === 'undefined') return null
      return window.history?.state || null
    },
    async openMobileSidebar() {
      if (this.showMobileSidebar || !this.isMobileLayout || this.isGuestUser || this.shareMaximized) return

      const target = buildMobileSidebarOpenLocation(this.$route)
      await this.$router.push(target).catch(() => {})
    },
    closeMobileSidebar({ forceReplace = false } = {}) {
      if (!isMobileSidebarRouteOpen(this.$route)) return

      if (forceReplace) {
        this.$router.replace(buildMobileSidebarClosedLocation(this.$route)).catch(() => {})
        return
      }

      const action = resolveMobileSidebarCloseAction(this.$route, {
        historyState: this.currentHistoryState()
      })
      if (!action) return

      if (action.mode === 'back') {
        this.$router.back()
        return
      }

      this.$router.replace(action.to).catch(() => {})
    },
    onMobileSidebarVisibilityChange(value) {
      if (value) {
        this.openMobileSidebar()
        return
      }

      if (this.suppressNextMobileSidebarClose) {
        this.suppressNextMobileSidebarClose = false
        return
      }

      this.closeMobileSidebar()
    },
    toggleRightPanel(mode) {
      if (mode === 'members') {
        if (!this.canRenderMembersList) return
      } else if (mode === 'pastMeetings') {
        if (!this.canRenderPastMeetingsPanel) return
      } else {
        return
      }

      this.rightPanelMode = this.rightPanelMode === mode ? 'closed' : mode
    },
    openNotifications() {
      if (this.isGuestUser) return
      this.notificationsStore.showPanel = true
    },
    openGlobalSearch() {
      if (this.isGuestUser) return
      this.searchStore.openDialog()
    },
    async claimSponsorshipPrompt() {
      const userId = this.sessionStore.user?.id
      if (this.sponsorshipPromptChecked || !userId || this.sessionStore.user?.is_primary_admin !== true) return

      this.sponsorshipPromptChecked = true
      try {
        const result = await claimSponsorshipPromptRequest()
        if (result?.show === true && this.sessionStore.user?.id === userId && this.sessionStore.user?.is_primary_admin === true) {
          this.uiStore.openSponsorshipPrompt()
        }
      } catch (error) {
        console.warn('Failed to claim sponsorship prompt:', error)
      }
    },
    closeSponsorshipPrompt() {
      this.uiStore.closeSponsorshipPrompt()
    },
    onGlobalKeydown(event) {
      if (event.defaultPrevented) return
      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'
      if (!isShortcut) return
      event.preventDefault()
      this.openGlobalSearch()
    },
    async doLogout() {
      await this.sessionStore.logout()
      this.$router.push('/login')
    }
  }
}
</script>

<style scoped>
.workspace-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--app-bg);
  color: var(--app-text);
}

.share-maximized-root {
  background:
    radial-gradient(circle at top, var(--app-primary-soft), transparent 30%),
    var(--app-bg-strong);
}

.top-bar {
  height: 48px;
  display: flex;
  align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid var(--app-border);
  flex-shrink: 0;
  background: var(--app-surface);
}

.top-bar-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.top-bar-name {
  font-weight: 700;
  font-size: 16px;
  letter-spacing: 0.5px;
}

.top-bar-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding-right: 4px;
}

.workspace-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: 260px;
  flex-shrink: 0;
  border-right: 1px solid var(--app-border);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.workspace-main {
  flex: 1;
  display: flex;
  min-width: 0;
  overflow: hidden;
}

.mobile-sidebar-drawer {
  height: 100%;
  width: 100%;
}

@media (max-width: 900px) {
  .top-bar {
    padding: 0 12px;
  }
}
</style>
