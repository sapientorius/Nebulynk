import { ref } from 'vue'
import { defineStore } from 'pinia'

const SIDEBAR_SECTION_STORAGE_KEY = 'sidebarSectionsExpanded'
const DEFAULT_SIDEBAR_SECTIONS = Object.freeze({
  channels: true,
  meetings: true,
  voiceChannels: true,
  directMessages: true
})

function normalizeSidebarSections(value) {
  const next = { ...DEFAULT_SIDEBAR_SECTIONS }

  if (!value || typeof value !== 'object') {
    return next
  }

  for (const key of Object.keys(DEFAULT_SIDEBAR_SECTIONS)) {
    if (typeof value[key] === 'boolean') {
      next[key] = value[key]
    }
  }

  return next
}

function readSidebarSections() {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_SIDEBAR_SECTIONS }
  }

  try {
    const raw = localStorage.getItem(SIDEBAR_SECTION_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SIDEBAR_SECTIONS }
    return normalizeSidebarSections(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_SIDEBAR_SECTIONS }
  }
}

function persistSidebarSections(value) {
  if (typeof localStorage === 'undefined') return

  try {
    localStorage.setItem(
      SIDEBAR_SECTION_STORAGE_KEY,
      JSON.stringify(normalizeSidebarSections(value))
    )
  } catch {
    // Ignore storage write failures and keep the in-memory state.
  }
}

export const useUiStore = defineStore('ui', () => {
  const showStatusModal = ref(false)
  const showProfileDrawer = ref(false)
  const profileUser = ref(null)
  const showPinnedPanel = ref(false)
  const showSponsorshipPrompt = ref(false)
  const screenSharePanelVisible = ref(false)
  const hideScreenSharePanel = ref(false)
  const maximizeScreenShare = ref(false)
  const showScreenShareChat = ref(false)
  const screenShareWindowOpen = ref(false)
  const sidebarSectionsExpanded = ref(readSidebarSections())

  // Backward-compatible aliases while meeting views migrate to generic naming.
  const showMeetingScreenSharePanel = screenSharePanelVisible
  const hideMeetingScreenSharePanel = hideScreenSharePanel
  const maximizeMeetingScreenShare = maximizeScreenShare
  const showMeetingScreenShareChat = showScreenShareChat
  const meetingScreenShareWindowOpen = screenShareWindowOpen

  function reset() {
    showStatusModal.value = false
    showProfileDrawer.value = false
    profileUser.value = null
    showPinnedPanel.value = false
    showSponsorshipPrompt.value = false
    screenSharePanelVisible.value = false
    hideScreenSharePanel.value = false
    maximizeScreenShare.value = false
    showScreenShareChat.value = false
    screenShareWindowOpen.value = false
  }

  function openScreenSharePanel({ maximized = false } = {}) {
    screenSharePanelVisible.value = true
    hideScreenSharePanel.value = false
    maximizeScreenShare.value = !!maximized
    if (!maximizeScreenShare.value) {
      showScreenShareChat.value = false
    }
  }

  function openSponsorshipPrompt() {
    showSponsorshipPrompt.value = true
  }

  function closeSponsorshipPrompt() {
    showSponsorshipPrompt.value = false
  }

  function closeScreenSharePanel() {
    screenSharePanelVisible.value = false
    hideScreenSharePanel.value = true
    maximizeScreenShare.value = false
    showScreenShareChat.value = false
  }

  function resetScreenShareVisibility() {
    screenSharePanelVisible.value = false
    hideScreenSharePanel.value = false
    maximizeScreenShare.value = false
    showScreenShareChat.value = false
  }

  function setScreenShareMaximized(value) {
    maximizeScreenShare.value = !!value
    if (maximizeScreenShare.value) {
      screenSharePanelVisible.value = true
      hideScreenSharePanel.value = false
      return
    }
    showScreenShareChat.value = false
  }

  function setScreenShareChatVisible(value, options = {}) {
    const { requireMaximized = true } = options
    showScreenShareChat.value = !!value
      && (screenSharePanelVisible.value || !requireMaximized)
      && (!requireMaximized || maximizeScreenShare.value)
  }

  function markScreenShareWindowOpen(value) {
    screenShareWindowOpen.value = !!value
  }

  function isSidebarSectionExpanded(section) {
    return sidebarSectionsExpanded.value[section] !== false
  }

  function setSidebarSectionExpanded(section, value) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_SIDEBAR_SECTIONS, section)) return

    sidebarSectionsExpanded.value = {
      ...sidebarSectionsExpanded.value,
      [section]: !!value
    }
    persistSidebarSections(sidebarSectionsExpanded.value)
  }

  function toggleSidebarSection(section) {
    setSidebarSectionExpanded(section, !isSidebarSectionExpanded(section))
  }

  function openMeetingScreenSharePanel(options = {}) {
    openScreenSharePanel(options)
  }

  function closeMeetingScreenSharePanel() {
    closeScreenSharePanel()
  }

  function resetMeetingScreenShareVisibility() {
    resetScreenShareVisibility()
  }

  function setMeetingScreenShareMaximized(value) {
    setScreenShareMaximized(value)
  }

  function setMeetingScreenShareChatVisible(value) {
    setScreenShareChatVisible(value)
  }

  function markMeetingScreenShareWindowOpen(value) {
    markScreenShareWindowOpen(value)
  }

  async function openProfile(userId, options = {}) {
    const { useSessionStore } = await import('./session.js')
    const sessionStore = useSessionStore()
    const seedUser = options.seedUser && options.seedUser.id ? options.seedUser : null
    const user = sessionStore.getUserById(userId)
    profileUser.value = user || seedUser || { id: userId }
    showProfileDrawer.value = true
    const hydrated = await sessionStore.ensureUser(userId, options)
    if (showProfileDrawer.value && profileUser.value?.id === userId && hydrated) {
      profileUser.value = hydrated
    }
  }

  return {
    showStatusModal,
    showProfileDrawer,
    profileUser,
    showPinnedPanel,
    showSponsorshipPrompt,
    screenSharePanelVisible,
    hideScreenSharePanel,
    maximizeScreenShare,
    showScreenShareChat,
    screenShareWindowOpen,
    sidebarSectionsExpanded,
    showMeetingScreenSharePanel,
    hideMeetingScreenSharePanel,
    maximizeMeetingScreenShare,
    showMeetingScreenShareChat,
    meetingScreenShareWindowOpen,
    reset,
    openSponsorshipPrompt,
    closeSponsorshipPrompt,
    openScreenSharePanel,
    closeScreenSharePanel,
    resetScreenShareVisibility,
    setScreenShareMaximized,
    setScreenShareChatVisible,
    markScreenShareWindowOpen,
    isSidebarSectionExpanded,
    setSidebarSectionExpanded,
    toggleSidebarSection,
    openMeetingScreenSharePanel,
    closeMeetingScreenSharePanel,
    resetMeetingScreenShareVisibility,
    setMeetingScreenShareMaximized,
    setMeetingScreenShareChatVisible,
    markMeetingScreenShareWindowOpen,
    openProfile
  }
})
