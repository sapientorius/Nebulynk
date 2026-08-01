<template>
  <n-modal v-model:show="show">
    <n-card :title="$t('ui.components.new_direct_message')" style="max-width: 460px; width: 100%">
      <n-input
        v-model:value="searchTerm"
        :placeholder="$t('ui.components.search_users')"
        clearable
        size="small"
        style="margin-bottom: 8px"
      />

      <n-space v-if="selectedUsers.length > 0" :size="4" style="margin-bottom: 12px; flex-wrap: wrap">
        <n-tag
          v-for="user in selectedUsers"
          :key="user.id"
          closable
          size="small"
          @close="deselectUser(user.id)"
        >
          {{ user.display_name }}
        </n-tag>
      </n-space>

      <n-input
        v-if="selectedUsers.length > 1"
        v-model:value="groupName"
        :placeholder="$t('ui.components.group_name_optional')"
        size="small"
        style="margin-bottom: 12px"
      />

      <div class="user-list">
        <div
          v-for="user in filteredUsers"
          :key="user.id"
          class="user-item"
          @click="toggleUser(user)"
        >
          <n-badge :color="isOnline(user.id) ? '#52c41a' : '#8c8c8c'" dot :offset="[-3, -3]">
            <UserAvatar :size="24" :user="user" :avatar-url="user.avatar_url" />
          </n-badge>
          <span class="user-name">{{ user.display_name }}</span>
          <n-icon v-if="isSelected(user.id)" size="16" color="#52c41a">
            <checkmark-icon />
          </n-icon>
        </div>
        <div v-if="filteredUsers.length === 0" class="no-results">
          {{ searchTerm ? $t('ui.components.no_results') : $t('ui.components.no_users_available') }}
        </div>
      </div>

      <template #footer>
        <n-space justify="end">
          <n-button @click="show = false">{{ $t('ui.components.admin.cancel') }}</n-button>
          <n-button
            type="primary"
            :loading="creating"
            :disabled="selectedUsers.length === 0"
            @click="doCreate"
          >
            {{ selectedUsers.length > 1 ? $t('ui.components.create_group') : $t('ui.components.send_message') }}
          </n-button>
        </n-space>
      </template>
    </n-card>
  </n-modal>
</template>

<script>
import { CheckmarkOutline as CheckmarkIcon } from '@vicons/ionicons5'
import { useSessionStore, useDmsStore } from '../stores/index.js'
import { navigateToDmChannel } from '../lib/dm-navigation.js'
import UserAvatar from './UserAvatar.vue'

export default {
  name: 'NewDmModal',
  components: { CheckmarkIcon, UserAvatar },
  data() {
    return {
      searchTerm: '',
      selectedUsers: [],
      groupName: '',
      creating: false,
      searchResults: [],
      searchLoading: false,
      searchTimer: null
    }
  },
  computed: {
    sessionStore() {
      return useSessionStore()
    },
    dmsStore() {
      return useDmsStore()
    },
    show: {
      get() { return this.dmsStore.showNewDmModal },
      set(val) {
        this.dmsStore.showNewDmModal = val
        if (!val) this.reset()
      }
    },
    filteredUsers() {
      const source = this.searchTerm.trim()
        ? this.searchResults
        : this.sessionStore.getDefaultDirectoryUsers(30)
      return source
        .filter((u) => u.id !== this.sessionStore.user?.id)
        .slice(0, 30)
    }
  },
  watch: {
    async show(val) {
      if (val) {
        await this.sessionStore.ensureDirectoryUsersLoaded({ limit: 30 })
        this.searchResults = this.sessionStore.getDefaultDirectoryUsers(30)
      }
    },
    searchTerm() {
      this.scheduleSearch()
    }
  },
  methods: {
    clearSearchTimer() {
      if (!this.searchTimer) return
      clearTimeout(this.searchTimer)
      this.searchTimer = null
    },
    scheduleSearch() {
      this.clearSearchTimer()
      const term = this.searchTerm.trim()
      if (!term) {
        this.searchLoading = false
        this.searchResults = this.sessionStore.getDefaultDirectoryUsers(30)
        return
      }
      this.searchTimer = setTimeout(() => {
        this.searchUsers(term)
      }, 150)
    },
    async searchUsers(term) {
      this.searchLoading = true
      try {
        this.searchResults = await this.sessionStore.searchUsers(term, { limit: 30 })
      } finally {
        this.searchLoading = false
      }
    },
    getInitial(user) {
      return (user.display_name || '?')[0].toUpperCase()
    },
    isOnline(userId) {
      return this.sessionStore.isOnline(userId)
    },
    isSelected(userId) {
      return this.selectedUsers.some((u) => u.id === userId)
    },
    toggleUser(user) {
      if (this.isSelected(user.id)) {
        this.deselectUser(user.id)
      } else {
        this.selectedUsers.push(user)
      }
    },
    deselectUser(userId) {
      this.selectedUsers = this.selectedUsers.filter((u) => u.id !== userId)
    },
    reset() {
      this.clearSearchTimer()
      this.searchTerm = ''
      this.selectedUsers = []
      this.groupName = ''
      this.creating = false
      this.searchResults = []
      this.searchLoading = false
    },
    async doCreate() {
      this.creating = true
      try {
        const userIds = this.selectedUsers.map((u) => u.id)
        let channel = null
        if (userIds.length === 1) {
          channel = await this.dmsStore.openOrCreate(userIds[0])
        } else {
          channel = await this.dmsStore.createGroup(userIds, this.groupName)
        }
        await navigateToDmChannel(this.$router, channel?.id)
        this.show = false
      } catch {
        window.$message?.error(this.$t('ui.components.could_not_create_direct_message'))
      } finally {
        this.creating = false
      }
    }
  },
  beforeUnmount() {
    this.clearSearchTimer()
  }
}
</script>

<style scoped>
.user-list {
  max-height: 300px;
  overflow-y: auto;
}

.user-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  cursor: pointer;
  border-radius: 4px;
}

.user-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.user-name {
  font-size: 13px;
  flex: 1;
}

.no-results {
  padding: 16px;
  text-align: center;
  opacity: 0.4;
  font-size: 13px;
}
</style>
