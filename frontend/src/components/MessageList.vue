<template>
  <div class="message-list" ref="messageList" data-testid="message-list" @scroll="onScroll">
    <div v-if="messageSummariesStore.selectionMode" class="message-selection-toolbar" data-testid="message-summary-selection-toolbar">
      <span>{{ $t('ui.components.selected_messages_count', { count: messageSummariesStore.selectedCount }) }}</span>
      <n-space :size="8">
        <n-button
          size="small"
          type="primary"
          :disabled="messageSummariesStore.selectedCount < 2"
          :loading="messageSummariesStore.isRequestLoading('selection', activeChannelId)"
          data-testid="message-summary-selection-submit"
          @click="summarizeSelectedMessages"
        >
          {{ $t('ui.components.summarize_with_ai') }}
        </n-button>
        <n-button size="small" quaternary @click="messageSummariesStore.cancelSelection">
          {{ $t('ui.components.admin.cancel') }}
        </n-button>
      </n-space>
    </div>
    <div
      v-if="showInitialLoader"
      class="message-list-loader"
      data-testid="message-list-loader"
    >
      <NebulynkLoader
        variant="pulse"
        :size="48"
        centered
        label="Loading chat"
      />
    </div>
    <div
      ref="messageContent"
      class="message-list-content"
      :class="{
        'message-list-content-hidden': isContentHidden,
        'message-list-content-revealing': isContentRevealing,
        'message-list-content-visible': isContentVisible
      }"
      :aria-hidden="showInitialLoader ? 'true' : 'false'"
    >
      <div class="load-more" v-if="hasMoreOlder">
        <n-button size="small" :loading="loadingOlder" @click="loadOlder">{{ $t('ui.components.load_older_messages') }}</n-button>
      </div>
      <div v-if="timelineItems.length === 0 && !loading" class="empty-state">
        <n-empty :description="$t('ui.components.no_messages_yet_write_the_first_one')" />
      </div>
      <template v-for="item in timelineItems" :key="item.id">
        <MessageRow
          v-if="item.kind === 'message'"
          :message="item.message"
          :grouped="isGrouped(item.messageIndex)"
          :highlighted="highlightedMessageId === item.message.id"
          :hovered="hoveredMessageId === item.message.id"
          :locked="lockedMessageId === item.message.id"
          :editing="editingMessageId === item.message.id"
          :edit-text="editText"
          :meeting-card="meetingCardsByMessageId[item.message.id] || null"
          :has-text-content="hasTextContent(item.message)"
          :collapsible="isMessageCollapsible(item.message.id)"
          :collapsed="isMessageCollapsed(item.message.id)"
          :expanded="isMessageExpanded(item.message.id)"
          :render-users="sessionStore.allUsers || []"
          :self-user-id="sessionStore.user?.id || null"
          :can-summarize="canSummarizeMessage(item.message)"
          :summary-loading="messageSummariesStore.isRequestLoading('message', item.message.id)"
          :selection-mode="messageSummariesStore.selectionMode"
          :selectable="isSelectableForSummary(item.message)"
          :selected="messageSummariesStore.isSelected(item.message.id)"
          @hover="hoveredMessageId = $event"
          @message-leave="onMessageLeave"
          @open-profile="openProfile"
          @popover-change="onPopoverChange($event, item.message.id)"
          @edit="startEdit"
          @delete="deleteMessage"
          @reply="startReply"
          @forward="openForward"
          @summarize="summarizeMessage"
          @toggle-select="toggleSummarySelection"
          @jump-to-message="jumpToMessage"
          @open-forward-source="openForwardSource"
          @update:edit-text="editText = $event"
          @edit-keydown="onEditKeydown"
          @open-meeting="openMeeting"
          @join-meeting-call="joinMeetingCall"
          @toggle-expanded="toggleMessageExpanded"
        />
        <MessageSummaryCard v-else :summary="item.summary" @remove="deleteSummary" />
      </template>
      <div v-if="showLowerTimelineActions" class="timeline-actions">
        <n-button
          v-if="hasMoreNewer"
          size="small"
          :loading="loadingNewer"
          data-testid="load-newer-messages"
          @click="loadNewer"
        >
          {{ $t('ui.components.load_newer_messages') }}
        </n-button>
        <n-button
          v-if="showJumpToLatestButton"
          quaternary
          size="small"
          data-testid="jump-to-latest-messages"
          @click="jumpToLatestTimeline"
        >
          {{ $t('ui.components.jump_to_latest_messages') }}
        </n-button>
      </div>
    </div>
  </div>
</template>

<script>
import {
  useMessagesStore,
  useChannelsStore,
  useSessionStore,
  useUiStore,
  useMessageOpsStore,
  useMeetingsStore,
  useVoiceStore,
  useNotificationsStore,
  useMessageSummariesStore,
  useMessageRemindersStore
} from '../stores/index.js'
import MessageRow from './MessageRow.vue'
import MessageSummaryCard from './MessageSummaryCard.vue'
import NebulynkLoader from './NebulynkLoader.vue'
import { buildMeetingCardState } from '../lib/meeting-card.js'
import { parseMeetingReferenceContent } from '../lib/meeting-message.js'
import {
  handleMessageVisibilityEntries as applyMessageVisibilityEntries,
  collectVisibleViewportMessageIds,
  syncObservedMessageElements as collectObservedMessageElements
} from '../lib/message-visibility.js'
import { isAppForegroundVisible } from '../lib/desktop-window-state.js'
import { shouldRetryNotificationAutoRead } from '../lib/notification-auto-read.js'
import {
  isInlineImageMessage
} from '../lib/message-markdown.js'
import {
  shouldCollapseMessageContent
} from '../lib/message-collapse.js'
import {
  buildMessageTimelineWindow,
  isMessageSelectableForSummary,
  isMessageSummarizable,
  mergeMessagesAndSummaries
} from '../lib/message-summaries.js'

const NOTIFICATION_AUTO_READ_DEBOUNCE_MS = 150
const CONTENT_REVEAL_DELAY_MS = 50
const REMINDER_PROCESSING_BUFFER_MS = 35_000
const MAX_TIMEOUT_MS = 2_147_483_647

export default {
  name: 'MessageList',
  components: { MessageRow, MessageSummaryCard, NebulynkLoader },
  data() {
    return {
      userScrolledUp: false,
      hoveredMessageId: null,
      lockedMessageId: null,
      editingMessageId: null,
      editText: '',
      resizeObserver: null,
      messageVisibilityObserver: null,
      observedMessageElements: {},
      autoReadSeenMessageIds: {},
      autoReadQueuedMessageIds: {},
      autoReadPendingMessageIds: {},
      autoReadFlushTimer: null,
      autoReadForegroundRecheckScheduled: false,
      autoReadForegroundRecheckFrame: null,
      meetingCardByMessageId: {},
      loadingMeetingById: {},
      joiningMeetingById: {},
      collapsibleMessageIds: {},
      expandedMessageIds: {},
      collapseMeasureFrame: null,
      contentRevealTimer: null,
      reminderRefreshTimer: null,
      isContentVisible: false,
      isContentRevealing: false
    }
  },
  computed: {
    messagesStore() {
      return useMessagesStore()
    },
    channelsStore() {
      return useChannelsStore()
    },
    sessionStore() {
      return useSessionStore()
    },
    uiStore() {
      return useUiStore()
    },
    messageOpsStore() {
      return useMessageOpsStore()
    },
    meetingsStore() {
      return useMeetingsStore()
    },
    voiceStore() {
      return useVoiceStore()
    },
    notificationsStore() {
      return useNotificationsStore()
    },
    messageSummariesStore() {
      return useMessageSummariesStore()
    },
    messageRemindersStore() {
      return useMessageRemindersStore()
    },
    messages() {
      return this.messagesStore.messages
    },
    messageSummaries() {
      return this.messageSummariesStore.summariesForChannel(this.activeChannelId)
    },
    activeReminders() {
      return Object.values(this.messageRemindersStore.remindersByMessageId)
    },
    timelineItems() {
      return mergeMessagesAndSummaries(this.messages, this.messageSummaries)
    },
    summaryWindow() {
      if (!this.activeChannelId || this.messages.length === 0) return null
      const allMessagesMatchActiveChannel = this.messages.every((message) => message?.channel_id === this.activeChannelId)
      if (!allMessagesMatchActiveChannel) return null
      return buildMessageTimelineWindow(this.messages)
    },
    summaryWindowKey() {
      return this.summaryWindow
        ? `${this.activeChannelId}:${this.summaryWindow.startAt}:${this.summaryWindow.endAt}`
        : ''
    },
    loading() {
      return this.messagesStore.loading
    },
    showInitialLoader() {
      return this.loading && this.timelineItems.length === 0
    },
    isContentHidden() {
      return !this.isContentVisible && !this.isContentRevealing
    },
    loadingOlder() {
      return this.messagesStore.loadingOlder
    },
    loadingNewer() {
      return this.messagesStore.loadingNewer
    },
    hasMoreOlder() {
      return this.messagesStore.hasMoreOlder
    },
    hasMoreNewer() {
      return this.messagesStore.hasMoreNewer
    },
    activeChannelId() {
      return this.channelsStore.activeChannelId
    },
    highlightedMessageId() {
      return this.messagesStore.highlightedMessageId
    },
    timelineMode() {
      return this.messagesStore.timelineMode
    },
    showJumpToLatestButton() {
      return this.timelineMode === 'anchored'
    },
    showLowerTimelineActions() {
      return this.hasMoreNewer || this.showJumpToLatestButton
    },
    meetingCardsByMessageId() {
      const cards = {}
      for (const [messageId, meetingId] of Object.entries(this.meetingCardByMessageId)) {
        const meeting = this.meetingsStore.getMeetingById(meetingId)
        const chatChannelId = meeting?.chat_channel_id || null
        const connectedCount = chatChannelId
          ? (this.voiceStore.participants[chatChannelId]?.length || 0)
          : 0
        const isJoining = !!this.joiningMeetingById[meetingId]

        cards[messageId] = buildMeetingCardState({
          meetingId,
          meeting,
          connectedCount,
          voiceChannelId: this.voiceStore.channelId,
          isJoining,
          tFn: (key, params) => this.$t(key, params)
        })
      }
      return cards
    }
  },
  watch: {
    'messages.length'(newLen, oldLen) {
      if (newLen > oldLen && !this.userScrolledUp && this.timelineMode === 'latest') {
        this.$nextTick(() => {
          this.scrollToBottom()
          this.reportLatestVisibleMessage()
        })
      }
    },
    activeChannelId() {
      this.userScrolledUp = false
      this.editingMessageId = null
      this.resetContentRevealState()
      this.flushPendingNotificationAutoRead({ markSeen: false, retryOnError: false }).catch(() => {})
      this.clearAutoReadFlushTimer()
      this.clearForegroundVisibleNotificationAutoReadRecheck()
      this.autoReadSeenMessageIds = {}
      this.autoReadQueuedMessageIds = {}
      this.autoReadPendingMessageIds = {}
      this.meetingCardByMessageId = {}
      this.loadingMeetingById = {}
      this.joiningMeetingById = {}
      this.messageSummariesStore.cancelSelection()
      this.messageSummariesStore.clearChannel(this.activeChannelId)
      this.resetMessageCollapseState()
      this.$nextTick(() => {
        this.syncObservedMessageElements()
        this.scheduleMessageCollapseMeasurement()
        if (this.timelineMode === 'latest') {
          this.scrollToBottom()
        }
        this.reportLatestVisibleMessage({ immediate: true })
      })
    },
    highlightedMessageId() {
      this.$nextTick(() => {
        this.scrollToHighlightedMessage()
      })
    },
    showInitialLoader(nextValue, oldValue) {
      if (nextValue) {
        this.resetContentRevealState()
        return
      }

      if (oldValue) {
        this.scheduleContentReveal()
        return
      }

      this.isContentVisible = true
    },
    summaryWindowKey() {
      this.syncMessageSummaryWindow()
    },
    messages: {
      deep: true,
      handler() {
        this.syncMeetingCards()
        this.$nextTick(() => {
          this.syncObservedMessageElements()
          this.scheduleMessageCollapseMeasurement()
          if (this.timelineMode === 'latest' && !this.userScrolledUp) {
            this.scrollToBottom()
          }
          this.scrollToHighlightedMessage()
        })
      }
    },
    messageSummaries: {
      deep: true,
      handler() {
        this.$nextTick(() => {
          if (this.timelineMode === 'latest' && !this.userScrolledUp) {
            this.scrollToBottom()
          }
        })
      }
    },
    activeReminders: {
      deep: true,
      handler() {
        this.scheduleReminderRefresh()
      }
    }
  },
  mounted() {
    this.initAutoScrollObservers()
    this.initMessageVisibilityObserver()
    this.bindNotificationAutoReadLifecycle()
    this.syncMeetingCards()
    this.syncMessageSummaryWindow()
    this.loadActiveReminders()
    this.isContentVisible = !this.showInitialLoader
    this.$nextTick(() => {
      this.syncObservedMessageElements()
      this.scheduleMessageCollapseMeasurement()
      if (this.timelineMode === 'latest') {
        this.scrollToBottom()
      }
      this.reportLatestVisibleMessage({ immediate: true })
      this.scrollToHighlightedMessage()
    })
  },
  beforeUnmount() {
    this.clearContentRevealTimer()
    this.clearReminderRefreshTimer()
    this.flushPendingNotificationAutoRead({ markSeen: false, retryOnError: false }).catch(() => {})
    this.unbindNotificationAutoReadLifecycle()
    this.clearAutoReadFlushTimer()
    this.clearForegroundVisibleNotificationAutoReadRecheck()
    this.clearMessageCollapseMeasurement()
    this.destroyAutoScrollObservers()
    this.destroyMessageVisibilityObserver()
  },
  methods: {
    async loadActiveReminders() {
      try {
        await this.messageRemindersStore.loadActive()
      } catch {
        // The regular per-message reminder menu remains available if this status lookup fails.
      } finally {
        this.scheduleReminderRefresh()
      }
    },
    clearReminderRefreshTimer() {
      if (!this.reminderRefreshTimer) return
      clearTimeout(this.reminderRefreshTimer)
      this.reminderRefreshTimer = null
    },
    scheduleReminderRefresh() {
      this.clearReminderRefreshTimer()

      const nextReminderAt = Math.min(...this.activeReminders
        .map((reminder) => new Date(reminder?.remind_at).getTime())
        .filter(Number.isFinite))
      if (!Number.isFinite(nextReminderAt)) return

      const delay = Math.max(0, nextReminderAt - Date.now()) + REMINDER_PROCESSING_BUFFER_MS
      this.reminderRefreshTimer = setTimeout(() => {
        this.reminderRefreshTimer = null
        this.loadActiveReminders()
      }, Math.min(delay, MAX_TIMEOUT_MS))
    },
    clearContentRevealTimer() {
      if (!this.contentRevealTimer) return
      clearTimeout(this.contentRevealTimer)
      this.contentRevealTimer = null
    },
    resetContentRevealState() {
      this.clearContentRevealTimer()
      this.isContentVisible = false
      this.isContentRevealing = false
    },
    scheduleContentReveal() {
      this.clearContentRevealTimer()
      this.isContentRevealing = true
      this.contentRevealTimer = setTimeout(() => {
        this.contentRevealTimer = null
        this.isContentRevealing = false
        this.isContentVisible = true
      }, CONTENT_REVEAL_DELAY_MS)
    },
    bindNotificationAutoReadLifecycle() {
      if (typeof window === 'undefined' || typeof document === 'undefined') return
      document.addEventListener('visibilitychange', this.onNotificationAutoReadVisibilityChange)
      window.addEventListener('focus', this.onNotificationAutoReadWindowFocus)
      window.addEventListener('nebulynk:desktop-window-state', this.onNotificationAutoReadDesktopWindowState)
      window.addEventListener('pagehide', this.flushPendingNotificationAutoRead)
      window.addEventListener('beforeunload', this.flushPendingNotificationAutoRead)
    },
    unbindNotificationAutoReadLifecycle() {
      if (typeof window === 'undefined' || typeof document === 'undefined') return
      document.removeEventListener('visibilitychange', this.onNotificationAutoReadVisibilityChange)
      window.removeEventListener('focus', this.onNotificationAutoReadWindowFocus)
      window.removeEventListener('nebulynk:desktop-window-state', this.onNotificationAutoReadDesktopWindowState)
      window.removeEventListener('pagehide', this.flushPendingNotificationAutoRead)
      window.removeEventListener('beforeunload', this.flushPendingNotificationAutoRead)
    },
    onNotificationAutoReadVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        this.flushPendingNotificationAutoRead({ markSeen: false, retryOnError: false }).catch(() => {})
        return
      }
      this.scheduleForegroundVisibleNotificationAutoReadRecheck()
    },
    onNotificationAutoReadWindowFocus() {
      this.scheduleForegroundVisibleNotificationAutoReadRecheck()
    },
    onNotificationAutoReadDesktopWindowState() {
      this.scheduleForegroundVisibleNotificationAutoReadRecheck()
    },
    clearAutoReadFlushTimer() {
      if (!this.autoReadFlushTimer) return
      clearTimeout(this.autoReadFlushTimer)
      this.autoReadFlushTimer = null
    },
    clearForegroundVisibleNotificationAutoReadRecheck() {
      this.autoReadForegroundRecheckScheduled = false
      if (!this.autoReadForegroundRecheckFrame || typeof window === 'undefined') {
        this.autoReadForegroundRecheckFrame = null
        return
      }
      window.cancelAnimationFrame(this.autoReadForegroundRecheckFrame)
      this.autoReadForegroundRecheckFrame = null
    },
    scheduleForegroundVisibleNotificationAutoReadRecheck() {
      if (typeof window === 'undefined' || typeof document === 'undefined') return
      if (this.autoReadForegroundRecheckScheduled) return
      if (!isAppForegroundVisible({
        targetDocument: document,
        hasWindowFocus: typeof document.hasFocus === 'function' ? document.hasFocus() : true
      })) {
        return
      }

      this.autoReadForegroundRecheckScheduled = true
      this.$nextTick(() => {
        if (!this.autoReadForegroundRecheckScheduled || typeof window === 'undefined') return
        this.autoReadForegroundRecheckFrame = window.requestAnimationFrame(() => {
          this.autoReadForegroundRecheckFrame = null
          this.autoReadForegroundRecheckScheduled = false
          this.syncObservedMessageElements()
          this.queueForegroundVisibleMessageNotifications()
        })
      })
    },
    scheduleNotificationAutoReadFlush() {
      this.clearAutoReadFlushTimer()
      this.autoReadFlushTimer = setTimeout(() => {
        this.autoReadFlushTimer = null
        this.flushPendingNotificationAutoRead().catch(() => {})
      }, NOTIFICATION_AUTO_READ_DEBOUNCE_MS)
    },
    queueForegroundVisibleMessageNotifications() {
      const messageIds = collectVisibleViewportMessageIds({
        listEl: this.$refs.messageList,
        observedMessageElements: this.observedMessageElements,
        seenMessageIds: this.autoReadSeenMessageIds,
        pendingMessageIds: this.autoReadPendingMessageIds
      })
      if (messageIds.length === 0) return

      this.autoReadPendingMessageIds = {
        ...this.autoReadPendingMessageIds,
        ...Object.fromEntries(messageIds.map((messageId) => [messageId, true]))
      }
      this.queueVisibleMessageNotifications(messageIds)
    },
    queueVisibleMessageNotifications(messageIds = []) {
      const uniqueMessageIds = [...new Set((messageIds || []).filter(Boolean))]
      if (uniqueMessageIds.length === 0) return

      const nextQueued = { ...this.autoReadQueuedMessageIds }
      for (const messageId of uniqueMessageIds) {
        nextQueued[messageId] = true
      }
      this.autoReadQueuedMessageIds = nextQueued
      this.scheduleNotificationAutoReadFlush()
    },
    async flushPendingNotificationAutoRead({ markSeen = true, retryOnError = true } = {}) {
      this.clearAutoReadFlushTimer()

      const messageIds = Object.keys(this.autoReadQueuedMessageIds)
      if (messageIds.length === 0) return 0

      this.autoReadQueuedMessageIds = {}

      try {
        const updated = await this.notificationsStore.markMessageNotificationsReadBatch(messageIds)
        if (markSeen) {
          this.autoReadSeenMessageIds = {
            ...this.autoReadSeenMessageIds,
            ...Object.fromEntries(messageIds.map((messageId) => [messageId, true]))
          }
        }
        return updated
      } catch (error) {
        if (retryOnError && shouldRetryNotificationAutoRead(error)) {
          this.autoReadQueuedMessageIds = {
            ...Object.fromEntries(messageIds.map((messageId) => [messageId, true])),
            ...this.autoReadQueuedMessageIds
          }
          this.scheduleNotificationAutoReadFlush()
        }
        return 0
      } finally {
        const nextPending = { ...this.autoReadPendingMessageIds }
        for (const messageId of messageIds) {
          delete nextPending[messageId]
        }
        this.autoReadPendingMessageIds = nextPending
      }
    },
    initAutoScrollObservers() {
      const listEl = this.$refs.messageList
      const contentEl = this.$refs.messageContent
      if (!listEl || !contentEl) return

      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => {
          this.scheduleMessageCollapseMeasurement()
          if (!this.userScrolledUp) {
            this.scrollToBottom()
            this.reportLatestVisibleMessage()
          }
        })
        this.resizeObserver.observe(contentEl)
      }

      listEl.addEventListener('load', this.onMediaLoad, true)
    },
    initMessageVisibilityObserver() {
      const listEl = this.$refs.messageList
      if (!listEl || typeof IntersectionObserver === 'undefined') return

      this.messageVisibilityObserver = new IntersectionObserver(
        (entries) => this.handleMessageVisibilityEntries(entries),
        { root: listEl, threshold: 0.01 }
      )
    },
    destroyAutoScrollObservers() {
      const listEl = this.$refs.messageList
      if (listEl) {
        listEl.removeEventListener('load', this.onMediaLoad, true)
      }
      if (this.resizeObserver) {
        this.resizeObserver.disconnect()
        this.resizeObserver = null
      }
    },
    destroyMessageVisibilityObserver() {
      if (this.messageVisibilityObserver) {
        this.messageVisibilityObserver.disconnect()
        this.messageVisibilityObserver = null
      }
      this.observedMessageElements = {}
      this.autoReadSeenMessageIds = {}
      this.autoReadQueuedMessageIds = {}
      this.autoReadPendingMessageIds = {}
    },
    syncObservedMessageElements() {
      this.observedMessageElements = collectObservedMessageElements({
        listEl: this.$refs.messageList,
        observer: this.messageVisibilityObserver,
        observedMessageElements: this.observedMessageElements
      })
    },
    handleMessageVisibilityEntries(entries) {
      applyMessageVisibilityEntries({
        entries,
        getSeenMessageIds: () => this.autoReadSeenMessageIds,
        getPendingMessageIds: () => this.autoReadPendingMessageIds,
        onVisibleMessageIds: (messageIds) => this.queueVisibleMessageNotifications(messageIds),
        onPendingChange: (nextPending) => {
          this.autoReadPendingMessageIds = nextPending
        }
      })
    },
    reportLatestVisibleMessage(options = {}) {
      const channelId = this.activeChannelId
      const latestMessage = this.messages[this.messages.length - 1]
      if (!channelId) return
      const shouldTrackLatest = this.timelineMode === 'latest'

      this.channelsStore.setChannelViewportState(channelId, {
        atBottom: shouldTrackLatest ? !this.userScrolledUp : false,
        latestVisibleAt: shouldTrackLatest && !this.userScrolledUp ? latestMessage?.created_at || null : null
      })

      if (shouldTrackLatest && !this.userScrolledUp && latestMessage?.created_at) {
        this.channelsStore.queueReadWatermark(channelId, latestMessage.created_at, options).catch(() => {})
      }
    },
    onMediaLoad(event) {
      if (!(event?.target instanceof HTMLImageElement)) return
      this.scheduleMessageCollapseMeasurement()
      if (!this.userScrolledUp) {
        this.scrollToBottom()
        this.reportLatestVisibleMessage()
      }
    },
    onMessageLeave() {
      if (!this.lockedMessageId) {
        this.hoveredMessageId = null
      }
    },
    onPopoverChange(open, messageId) {
      if (open) {
        this.lockedMessageId = messageId
      } else {
        this.lockedMessageId = null
        this.hoveredMessageId = null
      }
    },
    hasTextContent(message) {
      if (!message.content) return false
      if (message.type === 'file' && message.files?.length) {
        const filenames = message.files.map((file) => file.original_name)
        if (filenames.includes(message.content)) return false
      }
      return true
    },
    canSummarizeMessage(message) {
      return isMessageSummarizable(message) && !this.messageSummariesStore.selectionMode
    },
    syncMessageSummaryWindow() {
      if (!this.activeChannelId) return
      if (!this.summaryWindow) {
        this.messageSummariesStore.clearChannel(this.activeChannelId)
        return
      }

      this.messageSummariesStore.loadForWindow({
        channelId: this.activeChannelId,
        windowStartAt: this.summaryWindow.startAt,
        windowEndAt: this.summaryWindow.endAt
      }).catch(() => {})
    },
    isSelectableForSummary(message) {
      return isMessageSelectableForSummary(message)
    },
    toggleSummarySelection(messageId) {
      const message = this.messages.find((entry) => entry.id === messageId)
      if (!this.isSelectableForSummary(message)) return
      this.messageSummariesStore.toggleSelected(messageId)
    },
    async summarizeMessage(message) {
      try {
        await this.messageSummariesStore.requestMessageSummary(message)
        window.$message?.success(this.$t('ui.components.summary_generation_started'))
      } catch (error) {
        console.error('Failed to request message summary:', error)
        window.$message?.error(this.$t('ui.components.summary_generation_failed'))
      }
    },
    async summarizeSelectedMessages() {
      if (this.messageSummariesStore.selectedCount < 2) return
      try {
        await this.messageSummariesStore.requestSelectedSummary(this.activeChannelId)
        this.messageSummariesStore.cancelSelection()
        window.$message?.success(this.$t('ui.components.summary_generation_started'))
      } catch (error) {
        console.error('Failed to request selected message summary:', error)
        window.$message?.error(this.$t('ui.components.summary_generation_failed'))
      }
    },
    async deleteSummary(summary) {
      try {
        await this.messageSummariesStore.deleteSummary(summary)
        window.$message?.success(this.$t('ui.components.summary_deleted'))
      } catch (error) {
        console.error('Failed to delete message summary:', error)
        window.$message?.error(this.$t('ui.components.delete_failed'))
      }
    },
    clearMessageCollapseMeasurement() {
      if (!this.collapseMeasureFrame || typeof window === 'undefined') return
      window.cancelAnimationFrame(this.collapseMeasureFrame)
      this.collapseMeasureFrame = null
    },
    resetMessageCollapseState() {
      this.clearMessageCollapseMeasurement()
      this.collapsibleMessageIds = {}
      this.expandedMessageIds = {}
    },
    scheduleMessageCollapseMeasurement() {
      if (typeof window === 'undefined') return
      this.clearMessageCollapseMeasurement()
      this.collapseMeasureFrame = window.requestAnimationFrame(() => {
        this.collapseMeasureFrame = null
        this.measureCollapsibleMessages()
      })
    },
    measureCollapsibleMessages() {
      const nextCollapsible = {}
      const nextExpanded = { ...this.expandedMessageIds }
      const renderedMessageIds = new Set(this.messages.map((message) => message.id))

      for (const message of this.messages) {
        const bodyEl = this.getMessageBodyElement(message.id)
        const isCollapsible = shouldCollapseMessageContent({
          renderedHeight: bodyEl?.scrollHeight || 0,
          hasTextContent: this.hasTextContent(message),
          isInlineImage: isInlineImageMessage(message.content || ''),
          hasMeetingCard: Boolean(this.meetingCardsByMessageId[message.id])
        })

        if (isCollapsible) {
          nextCollapsible[message.id] = true
        } else {
          delete nextExpanded[message.id]
        }
      }

      for (const messageId of Object.keys(nextExpanded)) {
        if (!renderedMessageIds.has(messageId) || !nextCollapsible[messageId]) {
          delete nextExpanded[messageId]
        }
      }

      this.collapsibleMessageIds = nextCollapsible
      this.expandedMessageIds = nextExpanded
    },
    getMessageBodyElement(messageId) {
      return this.$refs.messageList?.querySelector?.(`[data-message-body-id="${messageId}"]`) || null
    },
    isMessageCollapsible(messageId) {
      return Boolean(this.collapsibleMessageIds[messageId])
    },
    isMessageExpanded(messageId) {
      return Boolean(this.expandedMessageIds[messageId])
    },
    isMessageCollapsed(messageId) {
      return this.isMessageCollapsible(messageId) && !this.isMessageExpanded(messageId)
    },
    toggleMessageExpanded(messageId) {
      if (!this.isMessageCollapsible(messageId)) return

      const nextExpanded = { ...this.expandedMessageIds }
      if (nextExpanded[messageId]) {
        delete nextExpanded[messageId]
      } else {
        nextExpanded[messageId] = true
      }
      this.expandedMessageIds = nextExpanded

      this.$nextTick(() => {
        this.syncObservedMessageElements()
        this.reportLatestVisibleMessage()
      })
    },
    syncMeetingCards() {
      const nextMeetingCardByMessageId = {}
      const referencedMeetingIds = new Set()

      for (const message of this.messages) {
        const meetingId = parseMeetingReferenceContent(message.content)
        if (!meetingId) continue
        nextMeetingCardByMessageId[message.id] = meetingId
        referencedMeetingIds.add(meetingId)
      }

      this.meetingCardByMessageId = nextMeetingCardByMessageId

      for (const meetingId of referencedMeetingIds) {
        this.ensureMeetingForCard(meetingId)
      }
    },
    ensureMeetingForCard(meetingId) {
      if (!meetingId) return
      const meeting = this.meetingsStore.getMeetingById(meetingId)
      const requiresFullDetail = Boolean(meeting && meeting.status === 'ended' && meeting.detail_level !== 'full')
      if (meeting && !requiresFullDetail) return
      if (this.loadingMeetingById[meetingId]) return

      this.loadingMeetingById = {
        ...this.loadingMeetingById,
        [meetingId]: true
      }

      this.meetingsStore.ensureMeetingLoaded(
        meetingId,
        requiresFullDetail ? { detail: 'full' } : {}
      )
        .catch(() => {})
        .finally(() => {
          const next = { ...this.loadingMeetingById }
          delete next[meetingId]
          this.loadingMeetingById = next
        })
    },
    async openMeeting(meetingId) {
      if (!meetingId) return
      await this.$router.push(`/meetings/${meetingId}`).catch(() => {})
    },
    async joinMeetingCall(meetingId) {
      if (!meetingId) return
      if (this.joiningMeetingById[meetingId]) return

      const meeting = await this.meetingsStore.ensureMeetingLoaded(meetingId).catch(() => null)
      if (!meeting || meeting.status !== 'active') return
      if (this.voiceStore.channelId === meeting.chat_channel_id) return

      this.joiningMeetingById = {
        ...this.joiningMeetingById,
        [meetingId]: true
      }

      try {
        await this.meetingsStore.join(meetingId)
        await this.$router.push(`/meetings/${meetingId}`).catch(() => {})
      } catch {
        window.$message?.error(this.$t('ui.components.could_not_join_call'))
      } finally {
        const next = { ...this.joiningMeetingById }
        delete next[meetingId]
        this.joiningMeetingById = next
      }
    },
    onScroll() {
      const el = this.$refs.messageList
      if (!el) return
      const threshold = 100
      const wasScrolledUp = this.userScrolledUp
      this.userScrolledUp = (el.scrollHeight - el.scrollTop - el.clientHeight) > threshold
      this.channelsStore.setChannelViewportState(this.activeChannelId, {
        atBottom: !this.userScrolledUp
      })
      if (wasScrolledUp && !this.userScrolledUp) {
        this.reportLatestVisibleMessage({ immediate: true })
      }
    },
    isGrouped(index) {
      if (index === 0) return false
      const curr = this.messages[index]
      const prev = this.messages[index - 1]
      if (curr.user_id !== prev.user_id) return false
      const diff = new Date(curr.created_at) - new Date(prev.created_at)
      return diff < 5 * 60 * 1000
    },
    scrollToBottom() {
      const el = this.$refs.messageList
      if (el) {
        el.scrollTop = el.scrollHeight
      }
      this.userScrolledUp = false
      this.channelsStore.setChannelViewportState(this.activeChannelId, { atBottom: true })
    },
    scrollToHighlightedMessage() {
      if (!this.highlightedMessageId) return
      const element = this.$refs.messageList?.querySelector?.(`[data-message-id="${this.highlightedMessageId}"]`)
      if (!element) return
      element.scrollIntoView({ block: 'center' })
    },
    openProfile(userId) {
      this.uiStore.openProfile(userId, {
        channelId: this.activeChannelId
      })
    },
    async loadOlder() {
      const prevHeight = this.$refs.messageList?.scrollHeight || 0
      await this.messagesStore.loadOlder()
      this.$nextTick(() => {
        const el = this.$refs.messageList
        if (el) {
          el.scrollTop = el.scrollHeight - prevHeight
        }
      })
    },
    async loadNewer() {
      await this.messagesStore.loadNewer()
      this.$nextTick(() => {
        this.scheduleMessageCollapseMeasurement()
        this.scrollToHighlightedMessage()
      })
    },
    async jumpToLatestTimeline() {
      await this.messagesStore.returnToLatest()
      const nextQuery = { ...this.$route.query }
      delete nextQuery.message
      this.messagesStore.clearHighlightedMessage()
      await this.$router.replace({
        path: this.$route.path,
        query: nextQuery
      }).catch(() => {})
      this.$nextTick(() => {
        this.scrollToBottom()
      })
    },
    startEdit(message) {
      this.editingMessageId = message.id
      this.editText = message.content || ''
      this.$nextTick(() => {
        this.scheduleMessageCollapseMeasurement()
      })
    },
    startReply(message) {
      this.messagesStore.setReplyContext(message)
    },
    openForward(message) {
      this.messagesStore.openForward(message)
    },
    async jumpToMessage(messageId) {
      if (!messageId) return
      this.messagesStore.setHighlightedMessage(messageId)
      await this.messagesStore.loadAroundMessage(messageId)
      this.$nextTick(() => {
        this.scrollToHighlightedMessage()
      })
    },
    async openForwardSource(preview) {
      if (!preview?.can_access_source || !preview.source_channel_id || !preview.source_message_id) return
      this.messagesStore.setHighlightedMessage(preview.source_message_id)
      await this.$router.push(`/channels/${preview.source_channel_id}?message=${preview.source_message_id}`).catch(() => {})
    },
    async onEditKeydown(event) {
      if (event.key === 'Escape') {
        this.editingMessageId = null
        this.editText = ''
        this.$nextTick(() => {
          this.scheduleMessageCollapseMeasurement()
        })
        return
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        if (!this.editText.trim()) return
        try {
          await this.messageOpsStore.editMessage(this.editingMessageId, this.editText.trim())
          window.$message?.success(this.$t('ui.components.message_edited'))
        } catch (error) {
          console.error('Failed to edit message:', error)
          window.$message?.error(this.$t('ui.components.edit_failed'))
        }
        this.editingMessageId = null
        this.editText = ''
        this.$nextTick(() => {
          this.scheduleMessageCollapseMeasurement()
        })
      }
    },
    async deleteMessage(message) {
      try {
        await this.messageOpsStore.deleteMessage(message.id)
        window.$message?.success(this.$t('ui.components.message_deleted'))
      } catch (error) {
        console.error('Failed to delete message:', error)
        window.$message?.error(this.$t('ui.components.delete_failed'))
      }
    }
  }
}
</script>

<style scoped>
.message-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: visible;
  padding: 20px;
  position: relative;
}

.message-list-loader {
  position: absolute;
  inset: 20px;
  z-index: 5;
}

.message-list-content {
  min-height: 100%;
  transition: opacity 0.18s ease;
}

.message-list-content-hidden,
.message-list-content-revealing {
  opacity: 0;
  pointer-events: none;
}

.message-list-content-visible {
  opacity: 1;
}

.load-more {
  text-align: center;
  padding: 8px 0 16px;
}

.message-selection-toolbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: -8px 0 12px;
  padding: 10px 12px;
  border: 1px solid rgba(99, 226, 183, 0.24);
  border-radius: 8px;
  background: rgba(24, 28, 34, 0.96);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.26);
  font-size: 13px;
}

.timeline-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  padding: 18px 0 10px;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}
</style>
