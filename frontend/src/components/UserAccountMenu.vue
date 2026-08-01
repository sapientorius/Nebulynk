<template>
  <n-popover
    v-model:show="showMenu"
    trigger="click"
    placement="bottom-end"
    :show-arrow="false"
    style="padding: 0"
  >
    <template #trigger>
      <button
        type="button"
        class="user-menu-trigger"
        data-testid="open-user-menu"
        :title="$t('common.profile')"
        :aria-label="$t('common.profile')"
      >
        <n-badge :color="statusColor" dot :offset="[-4, 22]">
          <UserAvatar :size="32" :user="user" :avatar-url="user?.avatar_url" />
        </n-badge>
      </button>
    </template>

    <div class="user-menu-panel" data-testid="user-menu-panel">
      <button
        v-if="!isGuestUser"
        type="button"
        class="user-menu-header"
        data-testid="user-menu-profile-trigger"
        @click="openProfile"
      >
        <n-badge :color="statusColor" dot :offset="[-4, 26]">
          <UserAvatar :size="40" :user="user" :avatar-url="user?.avatar_url" />
        </n-badge>
        <span class="user-menu-header-text">
          <strong class="user-menu-name">{{ user?.display_name || $t('ui.components.unknown') }}</strong>
          <span v-if="user?.email" class="user-menu-subtitle">{{ user.email }}</span>
          <span v-else-if="user?.custom_status" class="user-menu-subtitle">
            {{ customStatusLabel }}
          </span>
        </span>
      </button>

      <div v-if="!isGuestUser" class="user-menu-section">
        <button
          type="button"
          class="user-menu-action"
          data-testid="user-menu-open-status-picker"
          @click="openStatusPicker"
        >
          <n-icon size="16"><happy-outline-icon /></n-icon>
          <span>{{ $t('ui.components.set_status') }}</span>
        </button>
      </div>

      <div v-if="!isGuestUser" class="user-menu-section">
        <button
          v-for="option in quickStatusOptions"
          :key="option.value"
          type="button"
          class="user-menu-action"
          :class="{ active: user?.status === option.value }"
          :data-testid="`user-menu-status-${option.value}`"
          :disabled="pendingStatus === option.value"
          @click="setQuickStatus(option.value)"
        >
          <n-badge :color="option.color" dot />
          <span>{{ option.label }}</span>
          <n-icon v-if="user?.status === option.value" size="16" class="user-menu-check"><checkmark-icon /></n-icon>
        </button>
      </div>

      <div v-if="!isGuestUser" class="user-menu-section">
        <button type="button" class="user-menu-action" data-testid="user-menu-open-profile" @click="openProfile">
          <n-icon size="16"><person-outline-icon /></n-icon>
          <span>{{ $t('common.profile') }}</span>
        </button>
        <button type="button" class="user-menu-action" data-testid="user-menu-open-settings" @click="openSettings">
          <n-icon size="16"><settings-outline-icon /></n-icon>
          <span>{{ $t('ui.views.settings') }}</span>
        </button>
        <button type="button" class="user-menu-action" data-testid="user-menu-open-notes" @click="openNotes">
          <n-icon size="16"><document-text-outline-icon /></n-icon>
          <span>{{ $t('common.notes') }}</span>
        </button>
        <button
          v-if="canAdmin"
          type="button"
          class="user-menu-action"
          data-testid="user-menu-open-admin"
          @click="openAdmin"
        >
          <n-icon size="16"><shield-checkmark-outline-icon /></n-icon>
          <span>{{ $t('ui.components.admin.platform_settings') }}</span>
        </button>
      </div>

      <div class="user-menu-section">
        <button type="button" class="user-menu-action danger" data-testid="user-menu-logout" @click="logout">
          <n-icon size="16"><log-out-outline-icon /></n-icon>
          <span>{{ $t('sidebar.buttons.logout') }}</span>
        </button>
      </div>
    </div>
  </n-popover>
</template>

<script>
import {
  CheckmarkOutline as CheckmarkIcon,
  DocumentTextOutline as DocumentTextOutlineIcon,
  HappyOutline as HappyOutlineIcon,
  LogOutOutline as LogOutOutlineIcon,
  PersonOutline as PersonOutlineIcon,
  SettingsOutline as SettingsOutlineIcon,
  ShieldCheckmarkOutline as ShieldCheckmarkOutlineIcon
} from '@vicons/ionicons5'
import { useChannelsStore, useDmsStore, useSessionStore, useUiStore } from '../stores/index.js'
import { buildQuickStatusPayload, canAccessAdmin } from '../lib/user-account-menu.js'
import { getPresenceStatusColor } from '../lib/user-presence.js'
import UserAvatar from './UserAvatar.vue'

export default {
  name: 'UserAccountMenu',
  components: {
    UserAvatar,
    CheckmarkIcon,
    DocumentTextOutlineIcon,
    HappyOutlineIcon,
    LogOutOutlineIcon,
    PersonOutlineIcon,
    SettingsOutlineIcon,
    ShieldCheckmarkOutlineIcon
  },
  emits: ['logout'],
  data() {
    return {
      showMenu: false,
      pendingStatus: null
    }
  },
  computed: {
    sessionStore() {
      return useSessionStore()
    },
    channelsStore() {
      return useChannelsStore()
    },
    uiStore() {
      return useUiStore()
    },
    dmsStore() {
      return useDmsStore()
    },
    user() {
      return this.sessionStore.user
    },
    userPresence() {
      return this.sessionStore.resolveUserPresence(this.user)
    },
    customStatusLabel() {
      if (!this.user?.custom_status) return ''
      return [this.user.custom_status_emoji, this.user.custom_status].filter(Boolean).join(' ')
    },
    isGuestUser() {
      return this.user?.account_type === 'guest'
    },
    statusColor() {
      return getPresenceStatusColor(this.userPresence.badgeStatus)
    },
    quickStatusOptions() {
      return [
        { value: 'online', label: this.$t('ui.components.online'), color: '#52c41a' },
        { value: 'away', label: this.$t('ui.components.away'), color: '#faad14' },
        { value: 'dnd', label: this.$t('ui.components.do_not_disturb'), color: '#ff4d4f' },
        { value: 'offline', label: this.$t('ui.components.offline'), color: '#8c8c8c' }
      ]
    },
    canAdmin() {
      return this.user?.is_admin === true || canAccessAdmin(this.channelsStore)
    }
  },
  methods: {
    closeMenu() {
      this.showMenu = false
    },
    openStatusPicker() {
      this.closeMenu()
      this.uiStore.showStatusModal = true
    },
    openProfile() {
      if (!this.user?.id) return
      this.closeMenu()
      this.uiStore.openProfile(this.user.id)
    },
    getSettingsReturnTo() {
      const fullPath = this.$route?.fullPath
      if (typeof fullPath !== 'string') return null
      if (fullPath.startsWith('/settings')) return null
      if (
        fullPath.startsWith('/channels') ||
        fullPath.startsWith('/meetings') ||
        fullPath.startsWith('/admin')
      ) {
        return fullPath
      }
      return null
    },
    openSettings() {
      this.closeMenu()
      const returnTo = this.getSettingsReturnTo()
      const location = returnTo ? { path: '/settings', query: { returnTo } } : '/settings'
      this.$router.push(location).catch(() => {})
    },
    async openNotes() {
      this.closeMenu()
      await this.dmsStore.openNotes()
    },
    openAdmin() {
      this.closeMenu()
      this.$router.push('/admin').catch(() => {})
    },
    async setQuickStatus(status) {
      if (!status || this.pendingStatus || this.user?.status === status) {
        this.closeMenu()
        return
      }

      this.pendingStatus = status
      try {
        await this.sessionStore.updateStatus(buildQuickStatusPayload(status))
        this.closeMenu()
      } catch {
        window.$message?.error(this.$t('ui.components.could_not_save_setting'))
      } finally {
        this.pendingStatus = null
      }
    },
    logout() {
      this.closeMenu()
      this.$emit('logout')
    }
  }
}
</script>

<style scoped>
.user-menu-trigger {
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.user-menu-trigger:hover {
  opacity: 0.92;
}

.user-menu-panel {
  width: 300px;
  background: var(--app-surface-raised);
  border: 1px solid var(--app-border);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 18px 40px var(--app-shadow);
}

.user-menu-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 0;
  background: var(--app-surface);
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.user-menu-header:hover {
  background: var(--app-hover);
}

.user-menu-header-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-menu-name,
.user-menu-subtitle {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-menu-name {
  font-size: 15px;
}

.user-menu-subtitle {
  font-size: 12px;
  opacity: 0.65;
}

.user-menu-section {
  padding: 6px 0;
  border-top: 1px solid var(--app-border-soft);
}

.user-menu-section:first-of-type {
  border-top: 1px solid var(--app-border-soft);
}

.user-menu-action {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  font-size: 14px;
}

.user-menu-action:hover:not(:disabled),
.user-menu-action.active {
  background: var(--app-hover);
}

.user-menu-action:disabled {
  opacity: 0.6;
  cursor: default;
}

.user-menu-action.danger:hover {
  color: var(--theme-error);
}

.user-menu-check {
  margin-left: auto;
  color: var(--theme-primary);
}
</style>
