<template>
  <div class="desktop-server-manager" data-testid="desktop-server-manager-view">
    <header class="desktop-server-manager-header">
      <div>
        <h1>Servers</h1>
        <p>Manage saved Nebulynk servers and choose which workspace the desktop app opens.</p>
      </div>
      <n-button type="primary" data-testid="desktop-server-manager-open-active" @click="openActiveWorkspace">
        Open workspace
      </n-button>
    </header>

    <div class="desktop-server-manager-grid">
      <section class="desktop-server-manager-panel">
        <h2>Saved servers</h2>
        <div v-if="profiles.length === 0" class="desktop-server-manager-empty">
          No servers saved yet.
        </div>
        <button
          v-for="profile in profiles"
          :key="profile.id"
          type="button"
          class="desktop-server-manager-item"
          :class="{ active: profile.id === selectedProfileId }"
          :data-testid="`desktop-server-manager-item-${profile.id}`"
          @click="selectedProfileId = profile.id"
        >
          <strong>{{ profile.label }}</strong>
          <span>{{ profile.baseUrl }}</span>
          <small>{{ profile.userSummary?.display_name || profile.userSummary?.email || 'Signed out' }}</small>
          <n-tag v-if="profile.id === activeProfileId" size="small" type="success">Active</n-tag>
        </button>
      </section>

      <section class="desktop-server-manager-panel">
        <h2>{{ selectedProfile ? 'Selected server' : 'Add server' }}</h2>
        <n-form label-placement="top">
          <n-form-item label="Server URL">
            <n-input
              v-model:value="serverForm.baseUrl"
              placeholder="https://server.example.com"
              :input-props="{ 'data-testid': 'desktop-server-manager-url' }"
            />
          </n-form-item>
          <n-form-item label="Label">
            <n-input
              v-model:value="serverForm.label"
              placeholder="Optional display name"
              :input-props="{ 'data-testid': 'desktop-server-manager-label' }"
            />
          </n-form-item>
        </n-form>

        <div class="desktop-server-manager-actions">
          <n-button data-testid="desktop-server-manager-save" @click="saveServer">
            Save server
          </n-button>
          <n-button
            v-if="selectedProfile"
            type="primary"
            data-testid="desktop-server-manager-activate"
            @click="activateSelectedProfile"
          >
            Activate
          </n-button>
          <n-button
            v-if="selectedProfile"
            quaternary
            data-testid="desktop-server-manager-remove"
            @click="removeSelectedProfile"
          >
            Remove
          </n-button>
        </div>
      </section>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue'
import {
  addDesktopProfile,
  desktopState,
  getDesktopProfileById,
  removeDesktopProfile,
  setActiveDesktopProfile
} from '../lib/desktop-runtime.js'
import { activateDesktopProfile, revealDesktopWindow } from '../lib/desktop-bridge.js'

export default {
  name: 'DesktopServerManagerView',
  setup() {
    return {
      desktopState: computed(() => desktopState)
    }
  },
  data() {
    return {
      selectedProfileId: null,
      serverForm: {
        baseUrl: '',
        label: ''
      }
    }
  },
  computed: {
    profiles() {
      return this.desktopState.profiles || []
    },
    activeProfileId() {
      return this.desktopState.activeProfileId || null
    },
    selectedProfile() {
      return getDesktopProfileById(this.selectedProfileId)
    }
  },
  watch: {
    profiles: {
      immediate: true,
      handler(nextProfiles) {
        if (!nextProfiles.length) {
          this.selectedProfileId = null
          this.serverForm.baseUrl = ''
          this.serverForm.label = ''
          return
        }

        if (!this.selectedProfileId || !getDesktopProfileById(this.selectedProfileId)) {
          this.selectedProfileId = this.activeProfileId || nextProfiles[0].id
        }
      }
    },
    selectedProfile: {
      immediate: true,
      handler(profile) {
        if (!profile) return
        this.serverForm.baseUrl = profile.baseUrl || ''
        this.serverForm.label = profile.label || ''
      }
    }
  },
  methods: {
    async saveServer() {
      try {
        const profile = await addDesktopProfile({
          label: this.serverForm.label,
          baseUrl: this.serverForm.baseUrl
        })
        this.selectedProfileId = profile.id
        this.serverForm.baseUrl = profile.baseUrl
        this.serverForm.label = profile.label
      } catch (error) {
        window.$message?.error(error.message || 'Server could not be saved')
      }
    },
    async activateSelectedProfile() {
      const profileId = this.selectedProfileId
      if (!profileId) return
      await setActiveDesktopProfile(profileId)
      await activateDesktopProfile(profileId).catch(() => {})
      await revealDesktopWindow().catch(() => {})
    },
    async openActiveWorkspace() {
      if (!this.activeProfileId) {
        await this.activateSelectedProfile()
        return
      }
      await activateDesktopProfile(this.activeProfileId).catch(() => {})
      await revealDesktopWindow().catch(() => {})
    },
    async removeSelectedProfile() {
      const removedProfileId = this.selectedProfileId
      if (!removedProfileId) return

      await removeDesktopProfile(removedProfileId)
      const nextProfileId = this.desktopState.activeProfileId || this.desktopState.profiles[0]?.id || null
      this.selectedProfileId = nextProfileId
      await activateDesktopProfile(nextProfileId).catch(() => {})
    }
  }
}
</script>

<style scoped>
.desktop-server-manager {
  min-height: 100vh;
  padding: 24px;
  background:
    radial-gradient(circle at top, rgba(99, 226, 183, 0.12), transparent 26%),
    linear-gradient(180deg, #071119 0%, #04070d 100%);
}

.desktop-server-manager-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}

.desktop-server-manager-header h1 {
  margin: 0 0 8px;
  font-size: 28px;
}

.desktop-server-manager-header p {
  margin: 0;
  max-width: 640px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.7);
}

.desktop-server-manager-grid {
  display: grid;
  gap: 20px;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
}

.desktop-server-manager-panel {
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.03);
}

.desktop-server-manager-panel h2 {
  margin: 0 0 16px;
  font-size: 18px;
}

.desktop-server-manager-empty {
  padding: 16px;
  border: 1px dashed rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  color: rgba(255, 255, 255, 0.62);
}

.desktop-server-manager-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  margin-bottom: 10px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.02);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.desktop-server-manager-item.active {
  border-color: rgba(99, 226, 183, 0.6);
  background: rgba(99, 226, 183, 0.08);
}

.desktop-server-manager-item span,
.desktop-server-manager-item small {
  color: rgba(255, 255, 255, 0.64);
}

.desktop-server-manager-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

@media (max-width: 900px) {
  .desktop-server-manager {
    padding: 16px;
  }

  .desktop-server-manager-header {
    flex-direction: column;
  }

  .desktop-server-manager-grid {
    grid-template-columns: 1fr;
  }
}
</style>
