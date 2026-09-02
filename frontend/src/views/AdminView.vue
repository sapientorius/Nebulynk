<template>
  <div class="admin-shell" data-testid="admin-view">
    <header class="admin-header">
      <n-space align="center" :size="16">
        <n-button text @click="$router.push('/')">{{ $t('ui.views.back_to_chat') }}</n-button>
        <n-divider vertical v-if="!isMobileLayout" />
        <h2 class="admin-page-title">{{ $t('ui.views.administration') }}</h2>
      </n-space>
    </header>

    <div class="admin-body">
      <aside v-if="!isMobileLayout" class="admin-sidebar">
        <n-menu
          :options="menuOptions"
          :value="activeTab"
          @update:value="onMenuSelect"
        />
      </aside>

      <main class="admin-content">
        <div v-if="isMobileLayout" class="admin-mobile-toolbar">
          <span class="admin-mobile-section-label" data-testid="admin-mobile-section-label">
            {{ activeMenuLabel }}
          </span>
          <n-button
            quaternary
            size="small"
            data-testid="admin-mobile-menu-trigger"
            :title="$t('ui.views.administration')"
            @click="showMobileMenu = true"
          >
            <template #icon><n-icon size="16"><menu-icon /></n-icon></template>
            {{ $t('ui.views.administration') }}
          </n-button>
        </div>

        <RoleManager v-if="activeTab === 'roles'" />
        <UserRoleManager v-if="activeTab === 'users'" />
        <InviteManager v-if="activeTab === 'invites'" />
        <PlatformSettings v-if="activeTab === 'settings'" />
        <RegistrationSettings v-if="activeTab === 'registration'" />
        <SecuritySettings v-if="activeTab === 'security'" />
        <DesignSettings v-if="activeTab === 'design'" />
        <SmtpSettings v-if="activeTab === 'smtp'" />
        <AiSettings v-if="activeTab === 'ai'" />
        <MeetingSettings v-if="activeTab === 'meetings'" />
        <SystemInfo v-if="activeTab === 'system-info'" />
        <UpdateCenter v-if="activeTab === 'updates'" />
      </main>
    </div>

    <n-drawer
      v-model:show="showMobileMenu"
      placement="left"
      :width="280"
      data-testid="admin-mobile-menu-drawer"
    >
      <n-drawer-content :title="$t('ui.views.administration')" body-content-style="padding: 0;">
        <n-menu
          :options="menuOptions"
          :value="activeTab"
          @update:value="onMenuSelect"
        />
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script>
import { defineAsyncComponent, h } from 'vue'
import { NIcon } from 'naive-ui'
import { HeartOutline as HeartIcon, MenuOutline as MenuIcon } from '@vicons/ionicons5'
import { observeMobileLayout, readIsMobileLayout } from '../lib/mobile-layout.js'
import { useChannelsStore, usePlatformUpdatesStore, useSessionStore } from '../stores/index.js'

const RoleManager = defineAsyncComponent(() => import('../components/admin/RoleManager.vue'))
const UserRoleManager = defineAsyncComponent(() => import('../components/admin/UserRoleManager.vue'))
const InviteManager = defineAsyncComponent(() => import('../components/admin/InviteManager.vue'))
const PlatformSettings = defineAsyncComponent(() => import('../components/admin/PlatformSettings.vue'))
const RegistrationSettings = defineAsyncComponent(() => import('../components/admin/RegistrationSettings.vue'))
const SecuritySettings = defineAsyncComponent(() => import('../components/admin/SecuritySettings.vue'))
const DesignSettings = defineAsyncComponent(() => import('../components/admin/DesignSettings.vue'))
const SmtpSettings = defineAsyncComponent(() => import('../components/admin/SmtpSettings.vue'))
const AiSettings = defineAsyncComponent(() => import('../components/admin/AiSettings.vue'))
const MeetingSettings = defineAsyncComponent(() => import('../components/admin/MeetingSettings.vue'))
const SystemInfo = defineAsyncComponent(() => import('../components/admin/SystemInfo.vue'))
const UpdateCenter = defineAsyncComponent(() => import('../components/admin/UpdateCenter.vue'))
const SPONSORSHIP_URL = 'https://nebulynk.net/sponsorship'
const SPONSORSHIP_MENU_KEY = 'sponsorship'

export default {
  name: 'AdminView',
  components: { RoleManager, UserRoleManager, InviteManager, PlatformSettings, RegistrationSettings, SecuritySettings, DesignSettings, SmtpSettings, AiSettings, MeetingSettings, SystemInfo, UpdateCenter, MenuIcon },
  data() {
    return {
      activeTab: 'roles',
      showMobileMenu: false,
      isMobileLayout: readIsMobileLayout(),
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
    updatesStore() {
      return usePlatformUpdatesStore()
    },
    canManageRoles() {
      return this.channelsStore.can('manage_roles')
    },
    canManageUsers() {
      return this.channelsStore.can('manage_users')
    },
    canCreateInvites() {
      return this.channelsStore.can('create_invites')
    },
    canManageSettings() {
      return this.canManageRoles || this.canManageUsers
    },
    isPrimaryAdmin() {
      return this.sessionStore.user?.is_primary_admin === true
    },
    activeMenuLabel() {
      return this.menuOptions.find((entry) => entry.key === this.activeTab)?.label || this.$t('ui.views.administration')
    },
    menuOptions() {
      const options = []
      if (this.canManageSettings) {
        options.push({ label: this.$t('ui.views.settings'), key: 'settings' })
        if (this.canManageUsers) {
          options.push({ label: this.$t('selfRegistrationAdmin.title'), key: 'registration' })
          options.push({ label: this.$t('securitySettings.title'), key: 'security' })
        }
        options.push({ label: this.$t('ui.components.admin.design_settings'), key: 'design' })
        options.push({ label: this.$t('ui.components.admin.smtp_settings'), key: 'smtp' })
        options.push({ label: this.$t('ui.components.admin.ai_settings'), key: 'ai' })
        options.push({ label: this.$t('ui.views.meetings'), key: 'meetings' })
      }
      if (this.sessionStore.user?.is_admin === true) {
        options.push({ label: this.$t('systemInfo.menu'), key: 'system-info' })
        const count = this.updatesStore.unacknowledgedCount
        options.push({
          label: count > 0 ? `${this.$t('platformUpdates.menu')} (${count})` : this.$t('platformUpdates.menu'),
          key: 'updates',
          class: this.updatesStore.hasUnacknowledgedSecurity ? 'security-update-menu-item' : ''
        })
      }
      if (this.canManageRoles) {
        options.push({ label: this.$t('ui.views.roles'), key: 'roles' })
      }
      if (this.canManageUsers) {
        options.push({ label: this.$t('ui.views.users'), key: 'users' })
      }
      if (this.canCreateInvites) {
        options.push({ label: this.$t('ui.components.admin.invites'), key: 'invites' })
      }
      if (this.isPrimaryAdmin) {
        options.push({
          key: SPONSORSHIP_MENU_KEY,
          class: 'sponsorship-menu-item',
          label: () => h('a', {
            class: 'sponsorship-menu-link',
            href: SPONSORSHIP_URL,
            target: '_blank',
            rel: 'noopener noreferrer',
            onClick: (event) => {
              event.stopPropagation()
              this.showMobileMenu = false
            }
          }, [
            h('span', { class: 'sponsorship-menu-text' }, this.$t('sponsorship.menu_item')),
            h(NIcon, {
              size: 17,
              class: 'sponsorship-menu-heart',
              'aria-hidden': 'true'
            }, {
              default: () => h(HeartIcon)
            })
          ])
        })
      }
      return options
    }
  },
  async created() {
    await this.sessionStore.init()

    if (!this.canManageRoles && !this.canManageUsers && !this.canCreateInvites && this.sessionStore.user?.is_admin !== true) {
      this.$router.push('/')
      return
    }

    if (this.sessionStore.user?.is_admin === true) {
      await this.updatesStore.load().catch(() => {})
    }

    if (this.menuOptions.length > 0) {
      const requestedTab = typeof this.$route.query?.tab === 'string' ? this.$route.query.tab : ''
      this.activeTab = this.menuOptions.some((entry) => entry.key === requestedTab)
        ? requestedTab
        : this.menuOptions[0].key
    }
  },
  mounted() {
    this.stopObservingMobileLayout = observeMobileLayout((matches) => {
      this.isMobileLayout = matches
    })
  },
  beforeUnmount() {
    this.stopObservingMobileLayout?.()
  },
  watch: {
    '$route.query.tab'(value) {
      if (typeof value === 'string' && this.menuOptions.some((entry) => entry.key === value)) {
        this.activeTab = value
      }
    },
    isMobileLayout(value) {
      if (!value) {
        this.showMobileMenu = false
      }
    }
  },
  methods: {
    onMenuSelect(value) {
      if (value === SPONSORSHIP_MENU_KEY) {
        if (typeof window !== 'undefined') {
          window.open(SPONSORSHIP_URL, '_blank', 'noopener,noreferrer')
        }
        this.showMobileMenu = false
        return
      }
      this.activeTab = value
      this.showMobileMenu = false
      if (this.$route.query?.tab !== value) {
        this.$router.replace({ path: '/admin', query: { ...this.$route.query, tab: value } }).catch(() => {})
      }
    }
  }
}
</script>

<style scoped>
.admin-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--app-bg);
  color: var(--app-text);
}

.admin-header {
  padding: 12px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--app-border);
}

.admin-page-title {
  margin: 0;
  font-size: 18px;
}

.admin-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.admin-sidebar {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid var(--app-border);
  overflow-y: auto;
}

.admin-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 24px;
}

.admin-mobile-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.admin-mobile-section-label {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.72;
}

:deep(.sponsorship-menu-item .n-menu-item-content) {
  color: var(--theme-primary);
  font-weight: 700;
  transition: background-color 0.18s ease, color 0.18s ease;
}

:deep(.security-update-menu-item .n-menu-item-content) {
  color: var(--theme-error);
  font-weight: 700;
}

:deep(.sponsorship-menu-item .n-menu-item-content:hover) {
  background: var(--app-primary-soft);
}

:deep(.sponsorship-menu-link) {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  width: 100%;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

:deep(.sponsorship-menu-link:focus-visible) {
  outline: 2px solid var(--app-focus);
  outline-offset: 2px;
  border-radius: 4px;
}

:deep(.sponsorship-menu-text) {
  position: relative;
  display: inline-block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--theme-primary);
  transition: color 0.2s ease, text-shadow 0.2s ease;
}

:deep(.sponsorship-menu-text)::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: -2px;
  left: 0;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--theme-primary), var(--theme-primary-hover));
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

:deep(.sponsorship-menu-heart) {
  color: var(--theme-primary);
  flex-shrink: 0;
  transition: transform 0.18s ease, filter 0.18s ease;
}

:deep(.sponsorship-menu-link:hover .sponsorship-menu-heart),
:deep(.sponsorship-menu-link:focus-visible .sponsorship-menu-heart) {
  transform: translateX(-1px) scale(1.08);
  filter: drop-shadow(0 0 5px rgba(var(--theme-primary-rgb), 0.35));
}

:deep(.sponsorship-menu-link:hover .sponsorship-menu-text),
:deep(.sponsorship-menu-link:focus-visible .sponsorship-menu-text) {
  color: var(--theme-primary-hover);
  text-shadow: 0 0 10px rgba(var(--theme-primary-rgb), 0.22);
}

:deep(.sponsorship-menu-link:hover .sponsorship-menu-text)::after,
:deep(.sponsorship-menu-link:focus-visible .sponsorship-menu-text)::after {
  transform: scaleX(1);
}

@media (max-width: 900px) {
  .admin-header {
    padding: 12px;
  }

  .admin-content {
    padding: 16px 12px 20px;
  }
}
</style>
