<template>
  <n-modal
    :show="searchStore.showDialog"
    :mask-closable="true"
    class="global-search-modal"
    data-testid="global-search-dialog"
    @update:show="onDialogVisibility"
  >
    <n-card class="search-dialog-card" content-style="padding: 0;" :bordered="false">
      <div class="search-dialog">
        <div class="search-dialog-header">
          <div class="search-tabs" role="tablist" aria-label="Global search tabs">
            <button
              type="button"
              class="search-tab"
              :class="{ active: searchStore.activeTab === 'messages' }"
              data-testid="global-search-tab-messages"
              @click="searchStore.setTab('messages')"
            >
              {{ $t('search.tabs.messages') }}
            </button>
            <button
              type="button"
              class="search-tab"
              :class="{ active: searchStore.activeTab === 'files' }"
              data-testid="global-search-tab-files"
              @click="searchStore.setTab('files')"
            >
              {{ $t('search.tabs.files') }}
            </button>
            <button
              type="button"
              class="search-tab"
              :class="{ active: searchStore.activeTab === 'meetings' }"
              data-testid="global-search-tab-meetings"
              @click="searchStore.setTab('meetings')"
            >
              {{ $t('search.tabs.meetings') }}
            </button>
          </div>
          <n-button quaternary circle size="small" data-testid="close-global-search" @click="searchStore.closeDialog()">
            <template #icon>
              <n-icon size="18"><close-outline /></n-icon>
            </template>
          </n-button>
        </div>

        <div class="search-input-row">
          <n-input
            ref="searchInput"
            :value="searchStore.query"
            :placeholder="searchPlaceholder"
            clearable
            size="large"
            data-testid="global-search-input"
            @update:value="onQueryUpdate"
            @keyup.enter="submitSearch"
          >
            <template #prefix>
              <n-icon size="18"><search-outline /></n-icon>
            </template>
          </n-input>
          <n-button type="primary" size="large" data-testid="global-search-submit" @click="submitSearch">
            {{ $t('search.actions.submit') }}
          </n-button>
        </div>

        <n-alert
          v-if="searchStore.validationMessage"
          type="warning"
          data-testid="global-search-validation"
        >
          {{ $t(searchStore.validationMessage, { min: searchStore.MIN_QUERY_LENGTH }) }}
        </n-alert>

        <div class="search-filters">
          <div v-if="showAuthorFilter" class="filter-chip filter-chip-wide">
            <span class="filter-chip-label">{{ authorFilterLabel }}</span>
            <n-select
              clearable
              filterable
              remote
              :value="searchStore.filters.fromUserId"
              :options="authorOptions"
              :loading="authorSearchLoading"
              :placeholder="$t('search.placeholders.from')"
              data-testid="search-filter-from"
              @search="handleAuthorSearch"
              @update:value="onFilterChange('fromUserId', $event)"
            />
          </div>

          <div class="filter-chip filter-chip-wide">
            <span class="filter-chip-label">{{ $t('search.filters.in') }}</span>
            <n-select
              clearable
              filterable
              :value="searchStore.filters.channelId"
              :options="channelOptions"
              :placeholder="$t('search.placeholders.in')"
              data-testid="search-filter-channel"
              @update:value="onFilterChange('channelId', $event)"
            />
          </div>

          <div class="filter-chip">
            <span class="filter-chip-label">{{ $t('search.filters.after') }}</span>
            <n-date-picker
              clearable
              type="date"
              :to="false"
              :value="datePickerValue(searchStore.filters.after)"
              data-testid="search-filter-after"
              @update:value="onDateFilterChange('after', $event)"
            />
          </div>

          <div class="filter-chip">
            <span class="filter-chip-label">{{ $t('search.filters.before') }}</span>
            <n-date-picker
              clearable
              type="date"
              :to="false"
              :value="datePickerValue(searchStore.filters.before)"
              data-testid="search-filter-before"
              @update:value="onDateFilterChange('before', $event)"
            />
          </div>

          <label v-if="searchStore.activeTab === 'files'" class="filter-chip">
            <span class="filter-chip-label">{{ $t('search.filters.ext') }}</span>
            <input
              class="filter-chip-input"
              type="text"
              :value="searchStore.filters.fileExtension"
              :placeholder="$t('search.placeholders.ext')"
              data-testid="search-filter-extension"
              @input="onFilterChange('fileExtension', $event.target.value)"
            >
          </label>

          <div class="search-filter-actions">
            <n-button text size="small" data-testid="search-reset-filters" @click="resetFilters">
              {{ $t('search.actions.reset_filters') }}
            </n-button>
          </div>
        </div>

        <div
          v-if="showMeetingsAuthorSpeakerNotice"
          class="search-filter-note"
          data-testid="search-meetings-author-speaker-note"
        >
          {{ $t('search.notices.meetings_author_speaker_summary_hidden') }}
        </div>

        <div class="search-body" data-testid="global-search-results">
          <div v-if="searchStore.loading" class="search-state">
            <n-spin size="small" />
          </div>
          <div v-else-if="searchStore.results.length === 0" class="search-state">
            <n-empty :description="emptyDescription" />
          </div>
          <button
            v-for="result in searchStore.results"
            :key="result.id"
            type="button"
            class="search-result"
            data-testid="search-result-item"
            @click="openResult(result)"
          >
            <div class="search-result-top">
              <div class="search-result-title-row">
                <span v-if="resultTypeBadgeLabel(result)" class="search-result-kind">
                  {{ resultTypeBadgeLabel(result) }}
                </span>
                <span class="search-result-title">{{ resultTitle(result) }}</span>
              </div>
              <span class="search-result-time">{{ formatDate(result.created_at) }}</span>
            </div>
            <div class="search-result-meta">
              <span v-if="shouldShowResultAuthor(result) && result.author?.display_name">{{ result.author.display_name }}</span>
              <span v-if="result.channel?.name || result.channel?.id">{{ channelLabel(result.channel) }}</span>
              <span v-if="result.preview?.file_extension">{{ result.preview.file_extension.toUpperCase() }}</span>
            </div>
            <div v-if="showSnippet(result)" class="search-result-snippet">
              {{ resultSnippet(result) }}
            </div>
          </button>

          <div v-if="searchStore.nextCursor && !searchStore.loading" class="search-load-more">
            <n-button quaternary data-testid="search-load-more" @click="searchStore.loadMore()">
              {{ $t('search.actions.load_more') }}
            </n-button>
          </div>
        </div>
      </div>
    </n-card>
  </n-modal>
</template>

<script>
import { SearchOutline, CloseOutline } from '@vicons/ionicons5'
import { useChannelsStore, useDmsStore, useMeetingsStore, useSearchStore, useSessionStore } from '../stores/index.js'
import { toPlainMessageSnippet } from '../lib/message-markdown.js'
import { formatSearchChannelOption, formatSearchResultChannelLabel } from '../lib/search-channel-options.js'
import { buildSearchAuthorOptions } from '../lib/search-author-options.js'

let authorSearchDebounceId = null

export default {
  name: 'GlobalSearchDialog',
  components: {
    SearchOutline,
    CloseOutline
  },
  data() {
    return {
      authorSearchTerm: '',
      authorSearchResults: [],
      authorSearchLoading: false
    }
  },
  computed: {
    searchStore() {
      return useSearchStore()
    },
    sessionStore() {
      return useSessionStore()
    },
    channelsStore() {
      return useChannelsStore()
    },
    dmsStore() {
      return useDmsStore()
    },
    meetingsStore() {
      return useMeetingsStore()
    },
    searchPlaceholder() {
      if (this.searchStore.activeTab === 'files') {
        return this.$t('search.placeholders.files')
      }
      if (this.searchStore.activeTab === 'meetings') {
        return this.$t('search.placeholders.meetings')
      }
      return this.$t('search.placeholders.messages')
    },
    emptyDescription() {
      return this.searchStore.hasSearched
        ? this.$t('search.empty.no_results')
        : this.$t('search.empty.start')
    },
    authorFilterLabel() {
      return this.searchStore.activeTab === 'meetings'
        ? this.$t('search.filters.author_speaker')
        : this.$t('search.filters.from')
    },
    showAuthorFilter() {
      return true
    },
    showMeetingsAuthorSpeakerNotice() {
      return this.searchStore.activeTab === 'meetings' && !!this.searchStore.filters.fromUserId
    },
    authorOptions() {
      return buildSearchAuthorOptions({
        selectedUserId: this.searchStore.filters.fromUserId,
        selectedUser: this.sessionStore.getUserById(this.searchStore.filters.fromUserId),
        defaultUsers: this.sessionStore.getDefaultDirectoryUsers(20),
        searchResults: this.authorSearchResults,
        searchTerm: this.authorSearchTerm
      })
    },
    channelOptions() {
      const options = new Map()

      for (const channel of this.channelsStore.channels || []) {
        if (channel?.purpose === 'meeting') continue
        const option = formatSearchChannelOption(channel, {
          dmsStore: this.dmsStore,
          meetingsStore: this.meetingsStore,
          tFn: this.$t
        })
        if (option) options.set(option.value, option)
      }

      for (const channel of this.dmsStore.dmChannels || []) {
        const option = formatSearchChannelOption(channel, {
          dmsStore: this.dmsStore,
          meetingsStore: this.meetingsStore,
          tFn: this.$t
        })
        if (option) options.set(option.value, option)
      }

      for (const meeting of this.meetingsStore.meetings || []) {
        if (!meeting?.chat_channel_id) continue
        const option = formatSearchChannelOption({
          id: meeting.chat_channel_id,
          kind: 'meeting',
          meeting
        }, {
          dmsStore: this.dmsStore,
          meetingsStore: this.meetingsStore,
          tFn: this.$t
        })
        if (option) options.set(option.value, option)
      }

      return [...options.values()]
    }
  },
  watch: {
    async 'searchStore.showDialog'(visible) {
      this.resetAuthorSearchState()
      if (!visible) return
      await this.sessionStore.ensureDirectoryUsersLoaded({ limit: 20 })
      this.clearGuestAuthorFilter()
      this.$nextTick(() => {
        this.$refs.searchInput?.focus()
      })
    },
    'searchStore.activeTab'(tab) {
      if (tab === 'meetings') {
        this.resetAuthorSearchState()
        this.clearGuestAuthorFilter()
      }
    },
    'searchStore.filters.fromUserId'() {
      this.clearGuestAuthorFilter()
    }
  },
  beforeUnmount() {
    this.resetAuthorSearchState()
  },
  methods: {
    resetAuthorSearchState() {
      if (authorSearchDebounceId) clearTimeout(authorSearchDebounceId)
      authorSearchDebounceId = null
      this.authorSearchTerm = ''
      this.authorSearchResults = []
      this.authorSearchLoading = false
    },
    clearGuestAuthorFilter() {
      const selectedUserId = this.searchStore.filters.fromUserId
      if (!selectedUserId) return
      const selectedUser = this.sessionStore.getUserById(selectedUserId)
      if (selectedUser?.account_type === 'guest') {
        this.searchStore.setFilter('fromUserId', '')
      }
    },
    onDialogVisibility(value) {
      if (value) {
        this.searchStore.openDialog()
        return
      }
      this.searchStore.closeDialog()
    },
    onQueryUpdate(value) {
      this.searchStore.setQuery(value || '')
    },
    onFilterChange(key, value) {
      this.searchStore.setFilter(key, value || '')
    },
    onDateFilterChange(key, value) {
      this.searchStore.setFilter(key, this.formatDateFilterValue(value))
    },
    datePickerValue(value) {
      if (!value) return null
      const timestamp = Date.parse(`${value}T00:00:00`)
      return Number.isNaN(timestamp) ? null : timestamp
    },
    formatDateFilterValue(value) {
      if (typeof value !== 'number' || Number.isNaN(value)) return ''
      const date = new Date(value)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    },
    resetFilters() {
      this.searchStore.resetFilters()
      this.resetAuthorSearchState()
    },
    submitSearch() {
      this.searchStore.runSearch()
    },
    handleAuthorSearch(term) {
      if (authorSearchDebounceId) clearTimeout(authorSearchDebounceId)
      const trimmed = typeof term === 'string' ? term.trim() : ''
      this.authorSearchTerm = trimmed
      if (!trimmed) {
        this.authorSearchLoading = false
        this.authorSearchResults = []
        authorSearchDebounceId = null
        return
      }

      authorSearchDebounceId = setTimeout(async () => {
        this.authorSearchLoading = true
        try {
          const results = await this.sessionStore.searchUsers(trimmed, { limit: 20 })
          this.authorSearchResults = results
        } finally {
          this.authorSearchLoading = false
          authorSearchDebounceId = null
        }
      }, 180)
    },
    formatDate(value) {
      if (!value) return ''
      try {
        return new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short'
        }).format(new Date(value))
      } catch {
        return value
      }
    },
    channelLabel(channel) {
      return formatSearchResultChannelLabel(channel, {
        dmsStore: this.dmsStore,
        tFn: this.$t
      })
    },
    fallbackResultTitle(result) {
      if (result?.document_type === 'file') return this.$t('search.result_labels.file')
      if (result?.document_type === 'meeting_summary') return this.$t('search.result_labels.meeting_summary')
      if (result?.document_type === 'meeting_transcript_segment') return this.$t('search.result_labels.meeting_transcript')
      if (result?.document_type === 'meeting_transcript') return this.$t('search.result_labels.meeting_transcript')
      return this.$t('search.result_labels.message')
    },
    resultTitle(result) {
      if (result?.document_type === 'message') {
        return this.fallbackResultTitle(result)
      }
      return result?.title || result?.snippet || this.fallbackResultTitle(result)
    },
    resultTypeBadgeLabel(result) {
      if (
        this.searchStore.activeTab === 'meetings'
        && result?.document_type === 'message'
        && result?.preview?.source_meeting_id
      ) {
        return this.$t('search.result_kinds.chat')
      }
      if (result?.document_type === 'meeting_summary') {
        return this.$t('search.result_kinds.summary')
      }
      if (result?.document_type === 'meeting_transcript_segment') {
        return this.$t('search.result_kinds.transcript')
      }
      if (result?.document_type === 'meeting_transcript') {
        return this.$t('search.result_kinds.transcript')
      }
      return ''
    },
    showSnippet(result) {
      return Boolean(result?.snippet)
    },
    shouldShowResultAuthor(result) {
      return this.searchStore.activeTab !== 'meetings'
        || result?.document_type === 'message'
        || result?.document_type === 'meeting_transcript_segment'
    },
    resultSnippet(result) {
      return toPlainMessageSnippet(result?.snippet || '', { maxLength: 220 })
    },
    async openResult(result) {
      if (!result?.navigation_target) return
      this.searchStore.closeDialog()
      await this.$router.push(result.navigation_target).catch(() => {})
    }
  }
}
</script>

<style scoped>
.global-search-modal {
  width: min(1040px, calc(100vw - 40px));
}

.search-dialog-card {
  border-radius: 24px;
  background: var(--app-surface-raised);
  box-shadow: 0 28px 80px var(--app-shadow);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.search-dialog {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px;
}

.search-dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.search-tabs {
  display: inline-flex;
  gap: 6px;
  padding: 4px;
  border-radius: 14px;
  background: var(--app-surface-muted);
}

.search-tab {
  border: none;
  background: transparent;
  color: inherit;
  padding: 8px 14px;
  border-radius: 10px;
  cursor: pointer;
  font: inherit;
}

.search-tab.active {
  background: rgba(var(--theme-primary-rgb), 0.14);
  color: var(--theme-primary);
}

.search-input-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

.search-filters {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 12px;
  align-items: end;
}

.filter-chip {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 16px;
  background: var(--app-surface-muted);
  border: 1px solid var(--app-border-soft);
  grid-column: span 2;
}

.filter-chip-wide {
  grid-column: span 3;
}

.filter-chip-label {
  font-size: 12px;
  opacity: 0.72;
}

.filter-chip-input {
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  outline: none;
  padding: 0;
}

.search-filter-actions {
  grid-column: span 2;
  display: flex;
  align-items: center;
  min-height: 100%;
}

.search-filter-note {
  margin-top: -6px;
  color: var(--app-text-muted);
  font-size: 0.92rem;
}

.search-body {
  max-height: min(58vh, 560px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 4px;
}

.search-state {
  padding: 38px 0;
  display: flex;
  justify-content: center;
}

.search-result {
  text-align: left;
  border: 1px solid var(--app-border-soft);
  background: var(--app-surface);
  color: inherit;
  border-radius: 16px;
  padding: 14px 16px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.15s ease, background-color 0.15s ease, transform 0.15s ease;
}

.search-result:hover {
  border-color: rgba(var(--theme-primary-rgb), 0.32);
  background: var(--app-primary-soft);
  transform: translateY(-1px);
}

.search-result-top,
.search-result-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
}

.search-result-title-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.search-result-title {
  font-weight: 600;
}

.search-result-kind {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(var(--theme-primary-rgb), 0.14);
  color: var(--theme-primary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.search-result-time,
.search-result-meta {
  font-size: 12px;
  opacity: 0.72;
}

.search-result-snippet {
  font-size: 14px;
  line-height: 1.45;
  color: var(--app-text);
}

.search-load-more {
  display: flex;
  justify-content: center;
  padding-top: 8px;
}

@media (max-width: 1080px) {
  .global-search-modal {
    width: min(920px, calc(100vw - 24px));
  }

  .search-filters {
    grid-template-columns: repeat(8, minmax(0, 1fr));
  }

  .filter-chip,
  .filter-chip-wide,
  .search-filter-actions {
    grid-column: span 4;
  }
}

@media (max-width: 720px) {
  .global-search-modal {
    width: calc(100vw - 16px);
  }

  .search-dialog {
    padding: 16px;
  }

  .search-input-row {
    flex-direction: column;
    align-items: stretch;
  }

  .search-filters {
    grid-template-columns: 1fr;
  }

  .filter-chip,
  .filter-chip-wide,
  .search-filter-actions {
    grid-column: auto;
  }

  .search-result-top,
  .search-result-meta {
    flex-direction: column;
    align-items: flex-start;
  }

  .search-result-title-row {
    flex-wrap: wrap;
  }
}
</style>
