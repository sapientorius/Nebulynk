<template>

  <div class="settings-shell" data-testid="settings-view">
    <header class="settings-header">
      <n-space align="center" :size="16">
        <n-button text @click="goBackToChat">{{ $t('ui.views.back_to_chat') }}</n-button>
        <n-divider vertical v-if="!isMobileLayout" />
        <h2 class="settings-page-title">{{ $t('ui.views.settings') }}</h2>
      </n-space>
      <UserAccountMenu @logout="doLogout" />
    </header>

    <div class="settings-body">
      <aside v-if="!isMobileLayout" class="settings-sidebar">
        <n-menu
          :options="menuOptions"
          :value="activeTab"
          @update:value="activeTab = $event"
        />
      </aside>

      <main class="settings-content">
        <div v-if="isMobileLayout" class="settings-mobile-toolbar">
          <span class="settings-mobile-section-label" data-testid="settings-mobile-section-label">
            {{ activeMenuLabel }}
          </span>
          <n-button
            quaternary
            size="small"
            data-testid="settings-mobile-menu-trigger"
            :title="$t('ui.views.settings')"
            @click="showMobileMenu = true"
          >
            <template #icon><n-icon size="16"><menu-icon /></n-icon></template>
            {{ $t('ui.views.settings') }}
          </n-button>
        </div>

        <n-space vertical :size="20">
          <n-card v-if="activeTab === 'general'" :title="$t('ui.views.settings_general')">
            <n-space vertical :size="18">
              <p class="settings-intro">{{ $t('ui.views.settings_general_description') }}</p>
              <n-form :model="generalForm" label-placement="top">
                <n-form-item :label="$t('profile.labels.preferredLanguage')">
                  <n-select
                    v-model:value="generalForm.preferredLocale"
                    :options="localeOptions"
                    data-testid="settings-language-select"
                  />
                </n-form-item>
                <n-form-item :label="$t('ui.views.settings_theme')">
                  <n-select
                    v-model:value="generalForm.themePreference"
                    :options="themePreferenceOptions"
                    data-testid="settings-theme-select"
                  />
                </n-form-item>
              </n-form>
              <n-space justify="end">
                <n-button
                  type="primary"
                  :loading="savingProfile"
                  data-testid="settings-save-general"
                  @click="saveGeneral"
                >
                  {{ $t('common.save') }}
                </n-button>
              </n-space>
            </n-space>
          </n-card>

          <n-card v-if="activeTab === 'general'" :title="$t('ui.views.settings_notifications')">
            <n-space class="settings-toggle-row" align="center" justify="space-between" style="width: 100%">
              <div class="settings-toggle-copy">
                <strong>{{ notificationToggleLabel }}</strong>
                <span>{{ notificationToggleDescription }}</span>
              </div>
              <n-switch
                :value="notificationsStore.pushEnabled"
                :loading="pushLoading"
                data-testid="settings-enable-notifications"
                :disabled="!notificationsStore.canToggleNotifications"
                @update:value="togglePush"
              />
            </n-space>
          </n-card>

          <n-card
            v-if="activeTab === 'general' && showInstallCard"
            :title="$t('pwa.install_title')"
            data-testid="settings-install-app-card"
          >
            <n-space class="settings-toggle-row" align="center" justify="space-between" style="width: 100%">
              <div class="settings-toggle-copy">
                <strong>{{ $t('pwa.install_heading') }}</strong>
                <span>
                  {{
                    pwaInstallState.requiresManualInstall
                      ? $t('pwa.install_manual_description')
                      : $t('pwa.install_description')
                  }}
                </span>
              </div>
              <n-button
                type="primary"
                data-testid="settings-install-app"
                @click="installApp"
              >
                {{
                  pwaInstallState.requiresManualInstall
                    ? $t('pwa.install_manual_action')
                    : $t('pwa.install_action')
                }}
              </n-button>
            </n-space>
          </n-card>

          <PasswordSettings ref="password" :active="activeTab === 'security'" :is-mobile-layout="isMobileLayout" />
          <TwoFactorSettings ref="twoFactor" :active="activeTab === 'security'" :is-mobile-layout="isMobileLayout" />
          <PasskeySettings ref="passkeys" :active="activeTab === 'security'" :is-mobile-layout="isMobileLayout" />

          <n-card v-if="activeTab === 'voice'" :title="$t('ui.views.settings_voice')">
            <p class="settings-intro">{{ $t('ui.views.settings_voice_description') }}</p>
            <VoiceSettingsContent :active="activeTab === 'voice'" />
          </n-card>

          <n-card v-if="activeTab === 'video'" :title="$t('ui.views.settings_video')">
            <p class="settings-intro">{{ $t('ui.views.settings_video_description') }}</p>
            <VideoSettingsContent :active="activeTab === 'video'" />
          </n-card>

          <n-card
            v-if="activeTab === 'archived-channels' && canManageChannels"
            :title="$t('ui.views.settings_archived_channels')"
          >
            <n-space vertical :size="18">
              <p class="settings-intro">{{ $t('ui.views.settings_archived_channels_description') }}</p>
              <div
                v-if="archivedChannels.length === 0"
                class="archived-channels-empty"
                data-testid="settings-archived-channels-empty"
              >
                {{ $t('ui.views.settings_archived_channels_empty') }}
              </div>
              <div
                v-for="channel in archivedChannels"
                :key="channel.id"
                class="archived-channel-item"
                data-testid="settings-archived-channel-item"
              >
                <div class="archived-channel-main">
                  <span class="archived-channel-name">
                    <n-icon size="13" class="channel-type-icon">
                      <earth-icon v-if="channel.type === 'public'" />
                      <lock-closed-icon v-else />
                    </n-icon>
                    <n-icon v-if="channel.is_voice" size="14" class="voice-prefix-icon"><volume-high-icon /></n-icon>
                    <span>{{ channel.name }}</span>
                  </span>
                  <span class="archived-channel-meta">{{ channel.topic || channel.description || '' }}</span>
                </div>
                <n-button
                  size="small"
                  quaternary
                  :data-testid="`settings-restore-channel-${channel.id}`"
                  @click="restoreArchivedChannel(channel)"
                >
                  {{ $t('sidebar.buttons.restore') }}
                </n-button>
              </div>
            </n-space>
          </n-card>
        </n-space>
      </main>
    </div>

    <n-drawer
      v-model:show="showMobileMenu"
      placement="left"
      :width="280"
      data-testid="settings-mobile-menu-drawer"
    >
      <n-drawer-content :title="$t('ui.views.settings')" body-content-style="padding: 0;">
        <n-menu
          :options="menuOptions"
          :value="activeTab"
          @update:value="onMobileMenuSelect"
        />
      </n-drawer-content>
    </n-drawer>

    <StatusPicker v-if="showStatusPicker" />
    <UserProfileCard v-if="showUserProfileCard" />
  </div>

</template>

<script>
import { defineAsyncComponent } from 'vue'
import { MenuOutline as MenuIcon, VolumeHighOutline as VolumeHighIcon, EarthOutline as EarthIcon, LockClosedOutline as LockClosedIcon } from '@vicons/ionicons5'
import { getLocaleOptions } from '../lib/i18n.js'
import { observeMobileLayout, readIsMobileLayout } from '../lib/mobile-layout.js'
import { getPwaInstallState, initPwaInstallTracking, promptForAppInstall, subscribeToPwaInstallState } from '../lib/pwa.js'
import { saveGeneralPreferences, toggleNotifications } from '../lib/settings-actions.js'
import { isAnyDesktopRuntime } from '../lib/runtime.js'
import { useChannelsStore, useNotificationsStore, useSessionStore, useUiStore } from '../stores/index.js'
import PasswordSettings from '../components/settings/PasswordSettings.vue'
import TwoFactorSettings from '../components/settings/TwoFactorSettings.vue'
import PasskeySettings from '../components/settings/PasskeySettings.vue'

const UserProfileCard = defineAsyncComponent(() => import('../components/UserProfileCard.vue'))
const StatusPicker = defineAsyncComponent(() => import('../components/StatusPicker.vue'))
const VoiceSettingsContent = defineAsyncComponent(() => import('../components/VoiceSettingsContent.vue'))
const VideoSettingsContent = defineAsyncComponent(() => import('../components/VideoSettingsContent.vue'))
const UserAccountMenu = defineAsyncComponent(() => import('../components/UserAccountMenu.vue'))
export default {
  name: 'SettingsView',
  components: { UserAccountMenu,
VideoSettingsContent,
VoiceSettingsContent,
StatusPicker,
UserProfileCard,
MenuIcon,
VolumeHighIcon,
EarthIcon,
LockClosedIcon,
PasswordSettings,
TwoFactorSettings,
PasskeySettings },
  emits: [],
  props: {  },
  data() { return {
activeTab: 'general',
showMobileMenu: false,
isMobileLayout: readIsMobileLayout(),
stopObservingMobileLayout: null,
stopListeningPwaInstallState: null,
savingProfile: false,
pushLoading: false,
pwaInstallState: getPwaInstallState(),
generalForm: {
        preferredLocale: 'en',
        themePreference: 'platform'
      }
  } },
  computed: {
sessionStore() {
      return useSessionStore()
    },
notificationsStore() {
      return useNotificationsStore()
    },
channelsStore() {
      return useChannelsStore()
    },
localeOptions() {
      return getLocaleOptions()
    },
themePreferenceOptions() {
      return [
        { label: this.$t('ui.views.settings_theme_platform'), value: 'platform' },
        { label: this.$t('ui.views.settings_theme_light'), value: 'light' },
        { label: this.$t('ui.views.settings_theme_dark'), value: 'dark' },
        { label: this.$t('ui.views.settings_theme_system'), value: 'system' }
      ]
    },
activeMenuLabel() {
      return this.menuOptions.find((entry) => entry.key === this.activeTab)?.label || this.$t('ui.views.settings')
    },
menuOptions() {
      const options = [
        { label: this.$t('ui.views.settings_general'), key: 'general' },
        { label: this.$t('ui.views.settings_security'), key: 'security' },
        { label: this.$t('ui.views.settings_voice'), key: 'voice' },
        { label: this.$t('ui.views.settings_video'), key: 'video' }
      ]
      if (this.canManageChannels) {
        options.push({
          label: this.$t('ui.views.settings_archived_channels'),
          key: 'archived-channels'
        })
      }
      return options
    },
canManageChannels() {
      return this.channelsStore.can('manage_channels')
    },
archivedChannels() {
      return this.channelsStore.archivedChannels
        .filter((channel) => channel.is_archived && channel.purpose !== 'meeting')
        .sort((left, right) => (left.name || '').localeCompare(right.name || ''))
    },
showStatusPicker() {
      return this.uiStore.showStatusModal
    },
notificationToggleLabel() {
      return this.isDesktopMode
        ? 'Desktop notifications'
        : this.$t('ui.components.browser_notifications')
    },
notificationToggleDescription() {
      return this.isDesktopMode
        ? 'Deliver notifications through the desktop app while this server profile stays signed in.'
        : this.$t('ui.views.settings_notifications_description')
    },
showUserProfileCard() {
      return this.uiStore.showProfileDrawer
    },
showInstallCard() {
      if (isAnyDesktopRuntime()) return false
      return this.pwaInstallState.isInstallSupported
        && !this.pwaInstallState.isInstalled
        && this.pwaInstallState.canInstall
    },
uiStore() {
      return useUiStore()
    },
isDesktopMode() {
      return isAnyDesktopRuntime()
    }
  },
  watch: {
isMobileLayout(value) {
      if (!value) {
        this.showMobileMenu = false
      }
    },
async activeTab(value) {
      if (value === 'archived-channels' && this.canManageChannels) {
        await this.channelsStore.refreshArchived()
      }
    }
  },
async created() {
    await this.sessionStore.init()
    await this.$nextTick()
    this.generalForm.preferredLocale = this.sessionStore.user?.preferred_locale || 'en'
    this.generalForm.themePreference = this.sessionStore.user?.theme_preference || 'platform'
    await this.loadTwoFactorStatus()
    await this.loadPasskeys()
    await this.loadPasswordPolicy()
    if (this.activeTab === 'archived-channels' && this.canManageChannels) {
      await this.channelsStore.refreshArchived()
    }
  },
mounted() {
    initPwaInstallTracking()
    this.detectPasskeySupport()
    this.stopObservingMobileLayout = observeMobileLayout((matches) => {
      this.isMobileLayout = matches
    })
    this.stopListeningPwaInstallState = subscribeToPwaInstallState((state) => {
      this.pwaInstallState = state
    })
  },
beforeUnmount() {
    this.stopObservingMobileLayout?.()
    this.stopListeningPwaInstallState?.()
  },
  methods: {
loadTwoFactorStatus() { return this.$refs.twoFactor?.loadTwoFactorStatus() },
loadPasskeys() { return this.$refs.passkeys?.loadPasskeys() },
loadPasswordPolicy() { return this.$refs.password?.loadPasswordPolicy() },
detectPasskeySupport() { return this.$refs.passkeys?.detectPasskeySupport() },
goBackToChat() {
      this.$router.push(this.resolveReturnToChatRoute()).catch(() => {})
    },
onMobileMenuSelect(value) {
      this.activeTab = value
      this.showMobileMenu = false
    },
async restoreArchivedChannel(channel) {
      try {
        await this.channelsStore.update(channel.id, { is_archived: false })
        window.$message?.success(this.$t('sidebar.messages.restored'))
      } catch {
        window.$message?.error(this.$t('sidebar.messages.restoreFailed'))
      }
    },
async saveGeneral() {
      this.savingProfile = true
      try {
        await saveGeneralPreferences(this.sessionStore, {
          preferredLocale: this.generalForm.preferredLocale,
          themePreference: this.generalForm.themePreference
        })
        window.$message?.success(this.$t('ui.views.settings_saved'))
      } catch {
        window.$message?.error(this.$t('profile.errors.saveFailed'))
      } finally {
        this.savingProfile = false
      }
    },
async togglePush(enabled) {
      this.pushLoading = true
      try {
        const result = await toggleNotifications(this.notificationsStore, enabled)
        if (result === 'enabled') {
          window.$message?.success(this.isDesktopMode
            ? 'Desktop notifications enabled'
            : this.$t('ui.components.browser_notifications_enabled'))
        } else {
          window.$message?.info(this.isDesktopMode
            ? 'Desktop notifications disabled'
            : this.$t('ui.components.browser_notifications_disabled'))
        }
      } catch (error) {
        window.$message?.error(error.message || this.$t('ui.components.web_push_error'))
      } finally {
        this.pushLoading = false
      }
    },
async installApp() {
      if (this.pwaInstallState.requiresManualInstall) {
        window.$message?.info(this.$t('pwa.install_manual_instructions'), { duration: 7000 })
        return
      }

      const result = await promptForAppInstall()
      if (result.outcome === 'accepted') {
        window.$message?.success(this.$t('pwa.install_success'))
        return
      }
      if (result.outcome === 'dismissed') {
        window.$message?.info(this.$t('pwa.install_dismissed'))
      }
    },
async doLogout() {
      await this.sessionStore.logout()
      this.$router.push('/login')
    },
resolveReturnToChatRoute() {
      const returnTo = this.$route?.query?.returnTo
      if (typeof returnTo !== 'string') return '/channels'
      if (returnTo.startsWith('/channels') || returnTo.startsWith('/meetings')) return returnTo
      return '/channels'
    }
  }
}
</script>

<style scoped>

.settings-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--app-bg);
  color: var(--app-text);
}

.settings-header {
  padding: 12px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--app-border);
}

.settings-page-title {
  margin: 0;
  font-size: 18px;
}

.settings-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.settings-sidebar {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid var(--app-border);
  overflow-y: auto;
}

.settings-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 24px;
}

.settings-mobile-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.settings-mobile-section-label {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.72;
}

.settings-intro {
  margin: 0;
  opacity: 0.7;
  line-height: 1.5;
}

.settings-toggle-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 520px;
}

.settings-toggle-copy span {
  font-size: 13px;
  opacity: 0.7;
  line-height: 1.5;
}

.settings-toggle-row {
  width: 100%;
}

.archived-channels-empty {
  padding: 14px 16px;
  border: 1px dashed var(--app-border-strong);
  border-radius: 10px;
  opacity: 0.7;
}

.archived-channel-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--app-border-soft);
  border-radius: 10px;
}

.archived-channel-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.archived-channel-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-weight: 600;
}

.archived-channel-name span:last-child {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.archived-channel-meta {
  font-size: 13px;
  opacity: 0.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.channel-type-icon {
  line-height: 1;
  flex-shrink: 0;
  opacity: 0.85;
}

.voice-prefix-icon {
  line-height: 1;
  flex-shrink: 0;
}

@media (max-width: 900px) {
  .settings-header {
    padding: 12px;
  }

  .settings-content {
    padding: 16px 12px 20px;
  }

  .settings-toggle-copy {
    max-width: none;
  }

  .settings-toggle-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .passkey-item :deep(.n-button) {
    width: 100%;
  }

  .archived-channel-item {
    align-items: flex-start;
    flex-direction: column;
  }

  .archived-channel-item :deep(.n-button) {
    width: 100%;
  }
}

</style>
