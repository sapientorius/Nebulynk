import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import api from '../lib/api.js'

const MIN_QUERY_LENGTH = 3
const MEETING_DOCUMENT_TYPES = ['meeting_transcript', 'meeting_summary']
const MEETING_AUTHOR_SPEAKER_DOCUMENT_TYPES = ['message', 'meeting_transcript_segment']
const SEARCH_TABS = ['messages', 'files', 'meetings']

function asList(payload) {
  if (Array.isArray(payload)) return payload
  return payload?.data || []
}

function emptyFilters() {
  return {
    fromUserId: null,
    channelId: null,
    after: '',
    before: '',
    fileExtension: ''
  }
}

function emptyTabState() {
  return {
    hasSearched: false,
    results: [],
    loading: false,
    nextCursor: null,
    requestedMatchMode: 'hybrid',
    effectiveMatchMode: 'keyword',
    validationMessage: ''
  }
}

function emptyTabStates() {
  return Object.fromEntries(SEARCH_TABS.map((tab) => [tab, emptyTabState()]))
}

export const useSearchStore = defineStore('search', () => {
  const showDialog = ref(false)
  const activeTab = ref('messages')
  const query = ref('')
  const filters = ref(emptyFilters())
  const tabStates = ref(emptyTabStates())

  const currentTabState = computed(() => tabStates.value[activeTab.value] || tabStates.value.messages)

  const hasActiveFilters = computed(() => {
    const current = filters.value
    return Boolean(
      current.fromUserId
      || current.channelId
      || current.after
      || current.before
      || current.fileExtension
    )
  })

  const hasSearched = computed(() => currentTabState.value.hasSearched)
  const results = computed({
    get: () => currentTabState.value.results,
    set: (value) => {
      setTabState(activeTab.value, { results: Array.isArray(value) ? value : [] })
    }
  })
  const loading = computed({
    get: () => currentTabState.value.loading,
    set: (value) => {
      setTabState(activeTab.value, { loading: Boolean(value) })
    }
  })
  const nextCursor = computed({
    get: () => currentTabState.value.nextCursor,
    set: (value) => {
      setTabState(activeTab.value, { nextCursor: value || null })
    }
  })
  const requestedMatchMode = computed({
    get: () => currentTabState.value.requestedMatchMode,
    set: (value) => {
      setTabState(activeTab.value, { requestedMatchMode: value || 'hybrid' })
    }
  })
  const effectiveMatchMode = computed({
    get: () => currentTabState.value.effectiveMatchMode,
    set: (value) => {
      setTabState(activeTab.value, { effectiveMatchMode: value || 'keyword' })
    }
  })
  const validationMessage = computed({
    get: () => currentTabState.value.validationMessage,
    set: (value) => {
      setTabState(activeTab.value, { validationMessage: value || '' })
    }
  })

  function setTabState(tab, patch) {
    const resolvedTab = SEARCH_TABS.includes(tab) ? tab : 'messages'
    tabStates.value = {
      ...tabStates.value,
      [resolvedTab]: {
        ...tabStates.value[resolvedTab],
        ...patch
      }
    }
  }

  function resetSearchState(tab = activeTab.value) {
    setTabState(tab, emptyTabState())
  }

  function resetAllSearchState() {
    tabStates.value = emptyTabStates()
  }

  function clearValidation(tab = activeTab.value) {
    setTabState(tab, { validationMessage: '' })
  }

  function clearAllValidation() {
    tabStates.value = Object.fromEntries(
      SEARCH_TABS.map((tab) => [
        tab,
        {
          ...tabStates.value[tab],
          validationMessage: ''
        }
      ])
    )
  }

  function resetFilters() {
    filters.value = emptyFilters()
  }

  function resetAll() {
    query.value = ''
    activeTab.value = 'messages'
    resetFilters()
    resetAllSearchState()
  }

  function openDialog() {
    showDialog.value = true
  }

  function closeDialog() {
    showDialog.value = false
  }

  function setTab(tab) {
    activeTab.value = tab === 'files'
      ? 'files'
      : (tab === 'meetings' ? 'meetings' : 'messages')
    if (activeTab.value !== 'files') {
      filters.value = {
        ...filters.value,
        fileExtension: ''
      }
    }
  }

  function setQuery(value) {
    query.value = typeof value === 'string' ? value : ''
    clearAllValidation()
  }

  function setFilter(key, value) {
    filters.value = {
      ...filters.value,
      [key]: value
    }
    clearAllValidation()
  }

  function buildParams({ cursor = null } = {}) {
    const params = {
      tab: activeTab.value,
      match_mode: requestedMatchMode.value
    }

    const trimmedQuery = query.value.trim()
    if (trimmedQuery) params.q = trimmedQuery
    if (filters.value.fromUserId) {
      params.from_user_id = filters.value.fromUserId
    }
    if (filters.value.channelId) params.channel_id = filters.value.channelId
    if (filters.value.after) params.after = filters.value.after
    if (filters.value.before) params.before = filters.value.before
    if (activeTab.value === 'meetings') {
      params.document_types = filters.value.fromUserId
        ? MEETING_AUTHOR_SPEAKER_DOCUMENT_TYPES
        : MEETING_DOCUMENT_TYPES
    }
    if (activeTab.value === 'files' && filters.value.fileExtension.trim()) {
      params.file_extension = filters.value.fileExtension.trim()
    }

    if (cursor?.before_created_at && cursor?.before_id) {
      params.before_created_at = cursor.before_created_at
      params.before_id = cursor.before_id
    }

    return params
  }

  async function runSearch({ append = false } = {}) {
    const trimmedQuery = query.value.trim()
    if (!trimmedQuery && !hasActiveFilters.value) {
      resetSearchState()
      clearValidation()
      return []
    }

    if (trimmedQuery && trimmedQuery.length < MIN_QUERY_LENGTH) {
      validationMessage.value = 'search.validation.min_length'
      if (!append) {
        setTabState(activeTab.value, {
          hasSearched: false,
          results: [],
          nextCursor: null
        })
      }
      return []
    }

    loading.value = true
    clearValidation()
    try {
      const cursor = append ? nextCursor.value : null
      const { data } = await api.get('/search', {
        params: buildParams({ cursor })
      })

      const items = asList(data)
      setTabState(activeTab.value, {
        hasSearched: true,
        results: append ? [...results.value, ...items] : items,
        nextCursor: data?.next_cursor || null,
        requestedMatchMode: data?.requested_match_mode || requestedMatchMode.value,
        effectiveMatchMode: data?.effective_match_mode || effectiveMatchMode.value
      })
      return items
    } catch (error) {
      console.error('Failed to search:', error)
      if (!append) {
        setTabState(activeTab.value, {
          hasSearched: true,
          results: [],
          nextCursor: null
        })
      }
      return []
    } finally {
      loading.value = false
    }
  }

  async function loadMore() {
    if (!nextCursor.value || loading.value) return []
    return runSearch({ append: true })
  }

  return {
    MIN_QUERY_LENGTH,
    showDialog,
    activeTab,
    query,
    filters,
    results,
    loading,
    nextCursor,
    requestedMatchMode,
    effectiveMatchMode,
    validationMessage,
    hasSearched,
    hasActiveFilters,
    openDialog,
    closeDialog,
    resetFilters,
    resetSearchState,
    resetAll,
    clearValidation,
    setTab,
    setQuery,
    setFilter,
    runSearch,
    loadMore
  }
})
