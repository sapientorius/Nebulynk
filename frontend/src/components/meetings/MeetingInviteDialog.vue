<template>
    <n-modal v-model:show="showInviteModal">
      <n-card :title="$t('ui.views.invite_users')" style="max-width: 440px; width: 100%">
        <n-form>
          <n-form-item :label="$t('ui.views.users')">
            <n-select
              v-model:value="inviteUserIds"
              multiple
              filterable
              remote
              :loading="inviteSearchLoading"
              :options="inviteOptions"
              :placeholder="$t('ui.views.select_users')"
              @search="handleInviteSearch"
            />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="showInviteModal = false">{{ $t('ui.components.admin.cancel') }}</n-button>
            <n-button type="primary" :loading="inviting" :disabled="inviteUserIds.length === 0" @click="submitInvite">
              {{ $t('ui.components.admin.invite') }}
            </n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>


</template>

<script>
import { useSessionStore, useMeetingsStore } from '../../stores/index.js'
import { getEffectiveMeetingStatus } from '../../lib/meeting-lifecycle.js'


export default {
  name: 'MeetingInviteDialog',
  components: {  },
  emits: [],
  props: { meeting: { type: Object, default: null } },
  data() { return {
searchGeneration: 0,
showInviteModal: false,
inviteUserIds: [],
inviteSearchTerm: '',
inviteSearchResults: [],
inviteSearchLoading: false,
inviteSearchTimer: null,
inviting: false
  } },
  computed: {
sessionStore() {
      return useSessionStore()
    },
canInviteUsers() {
      if (!this.meeting || (this.effectiveMeetingStatus !== 'active' && this.effectiveMeetingStatus !== 'scheduled')) return false
      return this.canManageMeeting
    },
canManageMeeting() {
      if (!this.meeting) return false
      return this.sessionStore.user?.is_admin || this.meeting.host_user_id === this.sessionStore.user?.id
    },
inviteOptions() {
      const participantIds = new Set((this.meeting?.participants || []).map((entry) => entry.user_id))
      const selectedUsers = this.sessionStore.getDirectoryUsersByIds(this.inviteUserIds)
      const source = this.inviteSearchTerm.trim()
        ? this.inviteSearchResults
        : this.sessionStore.getDefaultDirectoryUsers(20)
      return [...selectedUsers, ...source]
        .filter((user, index, list) => user?.id && list.findIndex((entry) => entry.id === user.id) === index)
        .filter((user) => !participantIds.has(user.id))
        .map((user) => ({ label: user.display_name, value: user.id }))
    },
meetingsStore() {
      return useMeetingsStore()
    },
effectiveMeetingStatus() {
      return getEffectiveMeetingStatus(this.meeting)
    }
  },
  watch: {
async showInviteModal(value) {
    this.invalidateSearch()
    const generation = this.searchGeneration
    if (value) {
      await this.sessionStore.ensureDirectoryUsersLoaded({ limit: 20 })
      if (generation === this.searchGeneration && this.showInviteModal) this.inviteSearchResults = this.sessionStore.getDefaultDirectoryUsers(20)
      return
    }
    this.inviteSearchTerm = ''
    this.inviteSearchResults = []
    this.inviteSearchLoading = false
  }
  },
  beforeUnmount() { this.invalidateSearch() },
  methods: {
open() { if (this.canInviteUsers) this.showInviteModal = true },
invalidateSearch() { this.searchGeneration++; this.clearInviteSearchTimer() },
handleInviteSearch(term) {
    this.invalidateSearch()
    const generation = this.searchGeneration
    this.inviteSearchTerm = term || ''
    const trimmed = this.inviteSearchTerm.trim()
    if (!trimmed) {
      this.inviteSearchLoading = false
      this.inviteSearchResults = this.sessionStore.getDefaultDirectoryUsers(20)
      return
    }
    this.inviteSearchTimer = setTimeout(async () => {
      this.inviteSearchTimer = null
      this.inviteSearchLoading = true
      try {
        const users = await this.sessionStore.searchUsers(trimmed, { limit: 20 })
        if (generation === this.searchGeneration && this.showInviteModal) this.inviteSearchResults = users
      } catch {
        if (generation === this.searchGeneration) this.inviteSearchResults = []
      } finally {
        if (generation === this.searchGeneration) this.inviteSearchLoading = false
      }
    }, 150)
  },
clearInviteSearchTimer() {
      if (!this.inviteSearchTimer) return
      clearTimeout(this.inviteSearchTimer)
      this.inviteSearchTimer = null
    },
async submitInvite() {
      if (!this.canInviteUsers || this.inviting || this.inviteUserIds.length === 0) return
      this.inviting = true
      try {
        await this.meetingsStore.invite(this.meeting.id, this.inviteUserIds)
        this.showInviteModal = false
        this.inviteUserIds = []
      } catch {
        window.$message?.error(this.$t('ui.views.could_not_invite_users'))
      } finally {
        this.inviting = false
      }
    }
  }
}
</script>

<style scoped>


</style>
