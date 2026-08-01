<template>
  <n-modal v-model:show="showModal">
    <n-card :title="$t('ui.components.call_settings')" class="voice-settings-card">
      <n-space vertical :size="16">
        <n-space :size="8">
          <n-button
            size="small"
            :type="activeTab === 'audio' ? 'primary' : 'default'"
            :quaternary="activeTab !== 'audio'"
            data-testid="voice-settings-tab-audio"
            @click="activeTab = 'audio'"
          >
            {{ $t('ui.components.audio_settings') }}
          </n-button>
          <n-button
            size="small"
            :type="activeTab === 'video' ? 'primary' : 'default'"
            :quaternary="activeTab !== 'video'"
            data-testid="voice-settings-tab-video"
            @click="activeTab = 'video'"
          >
            {{ $t('ui.views.settings_video') }}
          </n-button>
        </n-space>

        <VoiceSettingsContent v-if="activeTab === 'audio'" :active="showModal && activeTab === 'audio'" />
        <VideoSettingsContent v-else :active="showModal && activeTab === 'video'" />
      </n-space>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showModal = false">{{ $t('ui.components.close') }}</n-button>
        </n-space>
      </template>
    </n-card>
  </n-modal>
</template>

<script>
import { useVoiceStore } from '../stores/index.js'
import VoiceSettingsContent from './VoiceSettingsContent.vue'
import VideoSettingsContent from './VideoSettingsContent.vue'

export default {
  name: 'VoiceSettings',
  components: {
    VoiceSettingsContent,
    VideoSettingsContent
  },
  computed: {
    voiceStore() {
      return useVoiceStore()
    },
    activeTab: {
      get() {
        return this.voiceStore.settingsTab
      },
      set(val) {
        this.voiceStore.settingsTab = val === 'video' ? 'video' : 'audio'
      }
    },
    showModal: {
      get() {
        return this.voiceStore.showSettings
      },
      set(val) {
        this.voiceStore.showSettings = val
      }
    }
  }
}
</script>

<style scoped>
.voice-settings-card {
  width: min(94vw, 920px);
  max-height: 90vh;
  overflow: auto;
}
</style>
