<template>
  <n-drawer v-model:show="show" :width="340" placement="right" data-testid="user-profile-card">
    <n-drawer-content :title="isEditing ? $t('profile.editTitle') : $t('profile.title')" closable>
      <div v-if="user" class="profile-card">
        <div class="profile-header">
          <n-badge :color="statusColor" dot :offset="[-6, -6]">
            <UserAvatar :size="64" :user="user" :avatar-url="user?.avatar_url" />
          </n-badge>
          <h3 class="profile-name">{{ user.display_name }}</h3>
          <span v-if="user.custom_status" class="profile-custom-status">
            {{ user.custom_status_emoji }} {{ user.custom_status }}
          </span>
          <n-tag size="small" :type="statusTagType" round>
            {{ statusLabel }}
          </n-tag>
        </div>

        <n-divider style="margin: 16px 0" />

        <template v-if="!isEditing">
          <div v-if="showEmail" class="profile-field">
            <span class="field-label">{{ $t('profile.labels.email') }}</span>
            <span class="field-value">{{ user.email }}</span>
          </div>
          <div class="profile-field">
            <span class="field-label">{{ $t('profile.labels.memberSince') }}</span>
            <span class="field-value">{{ formatDate(user.created_at) }}</span>
          </div>
          <div v-if="isOwnProfile" class="profile-field">
            <span class="field-label">{{ $t('profile.labels.preferredLanguage') }}</span>
            <span class="field-value">{{ preferredLanguageLabel }}</span>
          </div>

          <n-divider style="margin: 16px 0" />

          <n-button v-if="isOwnProfile" block data-testid="profile-edit" @click="startEdit">{{ $t('profile.buttons.edit') }}</n-button>
          <n-button v-if="canStartDirectMessage" block type="primary" @click="startDm">{{ $t('profile.buttons.message') }}</n-button>
        </template>

        <template v-else>
          <n-form :model="editForm">
            <n-form-item :label="$t('profile.labels.avatar')">
              <div class="avatar-edit-row">
                <UserAvatar
                  :size="84"
                  :name="editForm.displayName || user?.display_name"
                  :avatar-url="editAvatarUrl"
                />
                <div class="avatar-edit-actions">
                  <input
                    ref="avatarInput"
                    class="avatar-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    data-testid="profile-avatar-input"
                    @change="onAvatarSelected"
                  />
                  <n-space vertical :size="8" align="start">
                    <n-space :size="8">
                      <n-button secondary data-testid="profile-avatar-upload" @click="triggerAvatarPicker">
                        {{ hasEditableAvatar ? $t('profile.buttons.changeAvatar') : $t('profile.buttons.uploadAvatar') }}
                      </n-button>
                      <n-button secondary data-testid="profile-avatar-camera-open" @click="openAvatarCamera">
                        {{ $t('profile.buttons.takeAvatarPhoto') }}
                      </n-button>
                      <n-button
                        v-if="hasEditableAvatar"
                        quaternary
                        type="error"
                        data-testid="profile-avatar-remove"
                        @click="removeAvatarSelection"
                      >
                        {{ $t('profile.buttons.removeAvatar') }}
                      </n-button>
                    </n-space>
                    <span class="avatar-edit-hint">{{ $t('profile.cropHint') }}</span>
                  </n-space>
                </div>
              </div>
            </n-form-item>
            <n-form-item :label="$t('profile.labels.displayName')">
              <n-input v-model:value="editForm.displayName" :placeholder="$t('profile.placeholders.displayName')" />
            </n-form-item>
            <n-form-item :label="$t('profile.labels.preferredLanguage')">
              <n-select v-model:value="editForm.preferredLocale" :options="languageOptions" />
            </n-form-item>
          </n-form>

          <n-alert v-if="editError" type="error" style="margin-bottom: 12px">
            {{ editError }}
          </n-alert>

          <n-space justify="end">
            <n-button @click="cancelEdit">{{ $t('common.cancel') }}</n-button>
            <n-button type="primary" :loading="saving" data-testid="profile-save" @click="doSave">{{ $t('common.save') }}</n-button>
          </n-space>
        </template>
      </div>
    </n-drawer-content>
  </n-drawer>

  <AvatarCropModal
    :show="showAvatarCropModal"
    :file="avatarCropFile"
    @update:show="showAvatarCropModal = $event"
    @confirm="applyAvatarCrop"
  />
  <AvatarCameraModal
    :show="showAvatarCameraModal"
    @update:show="showAvatarCameraModal = $event"
    @capture="applyAvatarCameraCapture"
  />
</template>

<script>
import { useSessionStore, useUiStore, useDmsStore } from '../stores/index.js'
import { getCurrentLocale, getLocaleOptions } from '../lib/i18n.js'
import { translateApiError } from '../lib/api-error.js'
import { navigateToDmChannel } from '../lib/dm-navigation.js'
import { getPresenceStatusColor } from '../lib/user-presence.js'
import UserAvatar from './UserAvatar.vue'
import AvatarCropModal from './AvatarCropModal.vue'
import AvatarCameraModal from './AvatarCameraModal.vue'

export default {
  name: 'UserProfileCard',
  components: {
    UserAvatar,
    AvatarCropModal,
    AvatarCameraModal
  },
  data() {
    return {
      isEditing: false,
      saving: false,
      editError: null,
      showAvatarCropModal: false,
      showAvatarCameraModal: false,
      avatarCropFile: null,
      pendingAvatarFile: null,
      pendingAvatarPreviewUrl: null,
      removeAvatar: false,
      editForm: {
        displayName: '',
        preferredLocale: 'en'
      }
    }
  },
  computed: {
    sessionStore() {
      return useSessionStore()
    },
    uiStore() {
      return useUiStore()
    },
    dmsStore() {
      return useDmsStore()
    },
    show: {
      get() {
        return this.uiStore.showProfileDrawer
      },
      set(val) {
        this.uiStore.showProfileDrawer = val
        if (!val) {
          this.isEditing = false
          this.editError = null
        }
      }
    },
    user() {
      return this.uiStore.profileUser
    },
    isOwnProfile() {
      return this.user?.id === this.sessionStore.user?.id
    },
    canStartDirectMessage() {
      return !this.isOwnProfile
        && this.sessionStore.user?.account_type !== 'guest'
        && this.user?.account_type === 'member'
    },
    showEmail() {
      return this.isOwnProfile || this.sessionStore.user?.is_admin
    },
    editAvatarUrl() {
      if (this.removeAvatar) return null
      return this.pendingAvatarPreviewUrl || this.user?.avatar_url || null
    },
    hasEditableAvatar() {
      return Boolean(this.pendingAvatarPreviewUrl || (!this.removeAvatar && this.user?.avatar_url))
    },
    languageOptions() {
      return getLocaleOptions()
    },
    preferredLanguageLabel() {
      const locale = this.user?.preferred_locale || 'en'
      const option = this.languageOptions.find((entry) => entry.value === locale)
      return option?.label || locale
    },
    userPresence() {
      return this.sessionStore.resolveUserPresence(this.user)
    },
    statusColor() {
      return getPresenceStatusColor(this.userPresence.badgeStatus)
    },
    statusLabel() {
      if (this.userPresence.isPendingSync) {
        return this.$t('ui.components.connecting')
      }
      return this.$t(`profile.status.${this.userPresence.displayStatus}`)
    },
    statusTagType() {
      const types = { online: 'success', away: 'warning', dnd: 'error', offline: 'default' }
      if (this.userPresence.isPendingSync) return 'default'
      return types[this.userPresence.displayStatus] || 'success'
    }
  },
  methods: {
    formatDate(dateStr) {
      if (!dateStr) return this.$t('profile.dateFallback')
      return new Date(dateStr).toLocaleDateString(getCurrentLocale(), {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })
    },
    async startDm() {
      if (!this.canStartDirectMessage) return

      try {
        const channel = await this.dmsStore.openOrCreate(this.user.id)
        await navigateToDmChannel(this.$router, channel?.id)
        this.show = false
      } catch {
        window.$message?.error(this.$t('profile.errors.openDmFailed'))
      }
    },
    startEdit() {
      this.resetAvatarEditState()
      this.editForm.displayName = this.user?.display_name || ''
      this.editForm.preferredLocale = this.user?.preferred_locale || this.sessionStore.user?.preferred_locale || 'en'
      this.editError = null
      this.isEditing = true
    },
    cancelEdit() {
      this.isEditing = false
      this.editError = null
      this.resetAvatarEditState()
    },
    resetAvatarEditState() {
      this.avatarCropFile = null
      this.showAvatarCropModal = false
      this.showAvatarCameraModal = false
      this.pendingAvatarFile = null
      this.removeAvatar = false
      this.revokePendingAvatarPreview()
      if (this.$refs.avatarInput) {
        this.$refs.avatarInput.value = ''
      }
    },
    revokePendingAvatarPreview() {
      if (!this.pendingAvatarPreviewUrl || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return
      URL.revokeObjectURL(this.pendingAvatarPreviewUrl)
      this.pendingAvatarPreviewUrl = null
    },
    triggerAvatarPicker() {
      this.$refs.avatarInput?.click()
    },
    onAvatarSelected(event) {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
      if (!allowedTypes.includes(file.type)) {
        this.editError = this.$t('profile.errors.avatarTypeUnsupported')
        return
      }

      if (file.size > 10 * 1024 * 1024) {
        this.editError = this.$t('profile.errors.avatarTooLarge')
        return
      }

      this.editError = null
      this.avatarCropFile = file
      this.showAvatarCropModal = true
    },
    openAvatarCamera() {
      this.editError = null
      this.showAvatarCameraModal = true
    },
    applyAvatarCameraCapture({ file }) {
      if (!file) return
      this.editError = null
      this.avatarCropFile = file
      this.showAvatarCameraModal = false
      this.showAvatarCropModal = true
    },
    applyAvatarCrop({ file, previewUrl }) {
      this.pendingAvatarFile = file
      this.removeAvatar = false
      this.revokePendingAvatarPreview()
      this.pendingAvatarPreviewUrl = previewUrl
    },
    removeAvatarSelection() {
      this.pendingAvatarFile = null
      this.revokePendingAvatarPreview()
      this.removeAvatar = true
      this.editError = null
    },
    syncOpenProfileUser() {
      if (!this.user?.id) return
      this.uiStore.profileUser = this.sessionStore.getUserById(this.user.id) || this.sessionStore.user || this.user
    },
    async doSave() {
      if (!this.editForm.displayName.trim()) {
        this.editError = this.$t('profile.errors.displayNameRequired')
        return
      }

      this.saving = true
      this.editError = null
      try {
        await this.sessionStore.updateProfile({
          display_name: this.editForm.displayName.trim(),
          preferred_locale: this.editForm.preferredLocale
        })
        this.syncOpenProfileUser()

        if (this.removeAvatar && this.user?.avatar_url) {
          await this.sessionStore.removeOwnAvatar()
          this.syncOpenProfileUser()
        } else if (this.pendingAvatarFile) {
          await this.sessionStore.uploadOwnAvatar(this.pendingAvatarFile)
          this.syncOpenProfileUser()
        }

        this.isEditing = false
        this.resetAvatarEditState()
      } catch (err) {
        this.editError = translateApiError(err, 'profile.errors.saveFailed')
      } finally {
        this.saving = false
      }
    }
  },
  beforeUnmount() {
    this.resetAvatarEditState()
  }
}
</script>

<style scoped>
.profile-card {
  padding: 8px 0;
}

.profile-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.profile-name {
  margin: 0;
  font-size: 18px;
}

.profile-custom-status {
  font-size: 13px;
  opacity: 0.7;
}

.profile-field {
  margin-bottom: 12px;
}

.avatar-edit-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.avatar-edit-actions {
  min-width: 0;
}

.avatar-edit-hint {
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.68;
}

.avatar-input {
  display: none;
}

.field-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  opacity: 0.5;
  margin-bottom: 2px;
}

.field-value {
  font-size: 14px;
}
</style>
