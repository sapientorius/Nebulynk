<template>
  <div data-testid="voice-settings-content">
    <n-form>
      <n-form-item :label="$t('ui.components.microphone')">
        <n-select
          :value="selectedInput"
          :options="inputOptions"
          :placeholder="$t('ui.components.default_microphone')"
          @update:value="onInputChange"
        />
      </n-form-item>

      <n-form-item :label="$t('ui.components.speaker')">
        <n-select
          :value="selectedOutput"
          :options="outputOptions"
          :placeholder="$t('ui.components.default_speaker')"
          :disabled="!outputSupported"
          @update:value="onOutputChange"
        >
          <template v-if="!outputSupported" #action>
            <span style="font-size: 12px; opacity: 0.6">
              {{ $t('ui.components.output_device_selection_is_not_supported_by_this') }}
            </span>
          </template>
        </n-select>
      </n-form-item>

      <n-form-item :label="$t('ui.components.volume')">
        <div style="width: 100%; display: flex; align-items: center; gap: 12px">
          <n-slider
            :value="masterVolume"
            :min="0"
            :max="100"
            :step="1"
            style="flex: 1"
            @update:value="onVolumeChange"
          />
          <span style="font-size: 13px; min-width: 36px; text-align: right">{{ masterVolume }}%</span>
        </div>
      </n-form-item>

      <n-divider style="margin: 12px 0" />

      <n-form-item :label="$t('ui.components.microphone_activation')">
        <n-radio-group :value="micMode" @update:value="onMicModeChange">
          <n-space vertical :size="8">
            <n-radio value="live">
              <span>{{ $t('ui.components.always_on') }}</span>
              <span class="mode-desc">{{ $t('ui.components.microphone_is_always_sending') }}</span>
            </n-radio>
            <n-radio value="vad">
              <span>{{ $t('ui.components.voice_detection') }}</span>
              <span class="mode-desc">{{ $t('ui.components.sends_only_on_detected_speech') }}</span>
            </n-radio>
            <n-radio value="ptt">
              <span>Push-to-Talk</span>
              <span class="mode-desc">{{ $t('ui.components.sends_only_while_key_is_pressed') }}</span>
            </n-radio>
          </n-space>
        </n-radio-group>
      </n-form-item>

      <template v-if="micMode === 'vad'">
        <n-form-item :label="$t('ui.components.sensitivity')">
          <div style="width: 100%; display: flex; align-items: center; gap: 12px">
            <n-slider
              :value="vadThreshold"
              :min="1"
              :max="50"
              :step="1"
              style="flex: 1"
              @update:value="onVadThresholdChange"
            />
            <span style="font-size: 13px; min-width: 36px; text-align: right">{{ vadThreshold }}</span>
          </div>
          <div class="setting-hint">{{ $t('ui.components.lower_more_sensitive') }}</div>
        </n-form-item>

        <n-form-item :label="$t('ui.components.level')">
          <div class="vad-meter">
            <div class="vad-meter-fill" :style="{ width: vadLevel + '%' }" />
            <div class="vad-threshold-marker" :style="{ left: (vadThreshold * 2) + '%' }" />
          </div>
        </n-form-item>
      </template>

      <template v-if="micMode === 'ptt'">
        <n-form-item :label="$t('ui.components.key')">
          <div>
            <n-button
              :type="recordingKey ? 'warning' : 'default'"
              @click="startKeyRecording"
              style="min-width: 160px"
            >
              {{ recordingKey ? $t('ui.components.press_key') : pttKeyDisplay }}
            </n-button>
            <div class="setting-hint">{{ $t('ui.components.click_and_press_desired_key') }}</div>
            <div v-if="globalPttBadge" class="ptt-status-badge">
              <n-tag :type="globalPttBadge.type" size="small" round>
                {{ globalPttBadge.label }}
              </n-tag>
              <span v-if="globalPttBadge.detail" class="setting-hint" style="margin-top: 0; margin-left: 8px;">
                {{ globalPttBadge.detail }}
              </span>
            </div>
            <div v-if="showDesktopPassThroughHint" class="setting-hint">
              {{ $t('ui.components.desktop_ptt_passthrough_hint') }}
            </div>
            <div v-if="showDesktopFocusedOnlyHint" class="setting-hint">
              {{ $t('ui.components.desktop_ptt_focused_only_hint') }}
            </div>
            <div v-if="showDesktopNonTextRecommendation" class="setting-hint">
              {{ $t('ui.components.desktop_ptt_recommend_non_text_key') }}
            </div>
          </div>
        </n-form-item>

        <n-form-item
          v-if="showBrowserGlobalPttSettings"
          :label="$t('ui.components.global_push_to_talk')"
        >
          <div class="global-ptt-card">
            <div class="global-ptt-copy">
              <strong>{{ $t('ui.components.global_ptt_install_helper') }}</strong>
              <div class="setting-hint global-ptt-hint">
                {{ $t('ui.components.global_ptt_helper_release_soon') }}
                <a
                  href="https://github.com/sapientorius/Nebulynk/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {{ $t('ui.components.global_ptt_open_github_releases') }}
                </a>
              </div>
              <div class="setting-hint global-ptt-hint">
                {{ $t('ui.components.global_ptt_permission_explanation') }}
              </div>
            </div>
            <n-button
              :type="browserPttHelperEnabled ? 'warning' : 'primary'"
              @click="toggleBrowserGlobalPtt"
            >
              {{ browserPttHelperEnabled
                ? $t('ui.components.global_ptt_disable')
                : $t('ui.components.global_ptt_enable') }}
            </n-button>
            <div v-if="browserPttHelperEnabled" class="setting-hint global-ptt-hint">
              {{ $t('ui.components.global_ptt_enabled_description') }}
            </div>
          </div>
        </n-form-item>
      </template>
    </n-form>
  </div>
</template>

<script>
import { useVoiceStore } from '../stores/index.js'
import {
  getAudioInputDevices,
  getAudioOutputDevices,
  setAudioInputDevice,
  setAudioOutputDevice,
  setMasterVolume,
  getActiveAudioInputDevice,
  getActiveAudioOutputDevice
} from '../lib/livekit.js'
import {
  desktopWorkspaceState
} from '../lib/desktop-workspace-bridge.js'
import { nativePttState } from '../lib/native-ptt-state.js'
import {
  browserPttHelperState,
  disableBrowserPttHelper,
  enableBrowserPttHelper
} from '../lib/browser-ptt-helper-bridge.js'
import { isDesktopPttTextEntryKey } from '../lib/desktop-ptt-shortcut.js'
import * as micActivation from '../lib/mic-activation.js'
import { isDesktopWorkspaceWindow } from '../lib/runtime.js'

export default {
  name: 'VoiceSettingsContent',
  props: {
    active: {
      type: Boolean,
      default: true
    }
  },
  data() {
    return {
      inputDevices: [],
      outputDevices: [],
      selectedInput: null,
      selectedOutput: null,
      masterVolume: 100,
      outputSupported: true,
      vadLevel: 0,
      vadThresholdLocal: micActivation.getVadThreshold(),
      pttKeyLocal: micActivation.getPttKey(),
      recordingKey: false,
      vadMeterInterval: null,
      keyRecordHandler: null,
      keyRecordTimeout: null
    }
  },
  computed: {
    voiceStore() {
      return useVoiceStore()
    },
    inputOptions() {
      return this.inputDevices.map((d) => ({
        label: d.label || this.$t('ui.components.microphone_2', { deviceid_slice_0_8: d.deviceId.slice(0, 8) }),
        value: d.deviceId
      }))
    },
    outputOptions() {
      return this.outputDevices.map((d) => ({
        label: d.label || this.$t('ui.components.speaker_2', { deviceid_slice_0_8: d.deviceId.slice(0, 8) }),
        value: d.deviceId
      }))
    },
    micMode() {
      return this.voiceStore.micMode
    },
    vadThreshold() {
      return this.vadThresholdLocal
    },
    pttKeyDisplay() {
      return micActivation.getDisplayKeyName(this.pttKeyLocal)
    },
    desktopPttBindingStatus() {
      return nativePttState.bindingStatus || desktopWorkspaceState.pttBindingStatus || null
    },
    nativePttTransport() {
      return nativePttState.transport || null
    },
    nativePttHelperState() {
      return nativePttState.helperState || 'idle'
    },
    nativePttIsTarget() {
      return nativePttState.isTarget !== false
    },
    nativePttTargetSessionId() {
      return nativePttState.targetSessionId || null
    },
    browserPttHelperEnabled() {
      return browserPttHelperState.enabled === true
    },
    showBrowserGlobalPttSettings() {
      return this.micMode === 'ptt' && browserPttHelperState.available === true
    },
    hasNativePttSurface() {
      return isDesktopWorkspaceWindow() || this.nativePttTransport === 'browser-helper'
    },
    showDesktopPassThroughHint() {
      return this.micMode === 'ptt'
        && this.hasNativePttSurface
        && (
          this.desktopPttBindingStatus?.mode === 'global-raw-input'
          || this.desktopPttBindingStatus?.mode === 'global-native'
        )
        && isDesktopPttTextEntryKey(this.pttKeyLocal)
    },
    showDesktopFocusedOnlyHint() {
      return this.micMode === 'ptt'
        && this.hasNativePttSurface
        && (
          this.desktopPttBindingStatus?.mode === 'unsupported'
          || this.desktopPttBindingStatus?.mode === 'focused-only'
          || this.nativePttHelperState === 'pairing-required'
          || this.nativePttHelperState === 'unavailable'
          || this.nativePttHelperState === 'paused'
        )
    },
    showDesktopNonTextRecommendation() {
      return this.hasNativePttSurface
        && isDesktopPttTextEntryKey(this.pttKeyLocal)
        && this.showDesktopFocusedOnlyHint
    },
    globalPttBadge() {
      if (this.micMode !== 'ptt') return null
      if (!this.hasNativePttSurface) return null
      const status = this.desktopPttBindingStatus
      if (!status) return null
      const mode = status.mode
      const reason = status.reason || null
      if (this.nativePttHelperState === 'pairing-required') {
        return { type: 'warning', label: 'Pairing benoetigt', detail: 'Freigabe im lokalen Helper bestaetigen' }
      }
      if (this.nativePttHelperState === 'unavailable') {
        return { type: 'default', label: 'Helper offline', detail: 'Globales PTT faellt auf Fenster-Fokus zurueck' }
      }
      if (this.nativePttHelperState === 'paused' || reason === 'paused') {
        return { type: 'warning', label: 'PTT pausiert', detail: 'Der lokale Helper laeuft, leitet aber keine Tasten weiter' }
      }
      if (this.nativePttTransport === 'browser-helper' && this.nativePttTargetSessionId && !this.nativePttIsTarget) {
        return { type: 'info', label: 'Andere Sitzung aktiv', detail: 'Globales PTT gehoert aktuell zu einem anderen Nebulynk-Fenster' }
      }
      if (mode === 'global-native' && status.keyCode) {
        return { type: 'success', label: 'Global aktiv', detail: null }
      }
      if (mode === 'global-native' && reason === 'hook-installed-awaiting-bind') {
        return { type: 'info', label: 'Hook bereit', detail: 'Warte auf Tastenzuweisung' }
      }
      if (mode === 'global-raw-input' && status.keyCode) {
        return { type: 'success', label: 'Global aktiv (Raw Input)', detail: null }
      }
      if (mode === 'focused-only') {
        return { type: 'warning', label: 'Nur bei Fenster-Fokus', detail: reason }
      }
      if (mode === 'unsupported') {
        return { type: 'error', label: 'Global nicht verfügbar', detail: reason }
      }
      return null
    }
  },
  watch: {
    active: {
      immediate: true,
      handler(val) {
        if (val) {
          this.activate()
        } else {
          this.deactivate()
        }
      }
    },
    micMode(val) {
      if (val === 'vad' && this.active) {
        this.startVadMeter()
      } else {
        this.stopVadMeter()
      }
    }
  },
  beforeUnmount() {
    this.deactivate()
  },
  methods: {
    activate() {
      this.loadDevices()
      this.vadThresholdLocal = micActivation.getVadThreshold()
      this.pttKeyLocal = micActivation.getPttKey()
      if (this.micMode === 'vad') {
        this.startVadMeter()
      }
    },
    deactivate() {
      this.stopVadMeter()
      this.cancelKeyRecording()
    },
    async loadDevices() {
      try {
        this.inputDevices = await getAudioInputDevices()
        this.selectedInput = getActiveAudioInputDevice() || null
      } catch (error) {
        console.error('Failed to load input devices:', error)
      }

      try {
        this.outputDevices = await getAudioOutputDevices()
        this.selectedOutput = getActiveAudioOutputDevice() || null
        this.outputSupported = this.outputDevices.length > 0
      } catch {
        this.outputSupported = false
      }

      const savedVolume = localStorage.getItem('voiceMasterVolume')
      if (savedVolume !== null) {
        this.masterVolume = parseInt(savedVolume, 10)
      }
    },
    async onInputChange(deviceId) {
      this.selectedInput = deviceId
      try {
        await setAudioInputDevice(deviceId)
        setTimeout(() => micActivation.restartMode(), 200)
      } catch (error) {
        console.error('Failed to set input device:', error)
        window.$message?.error(this.$t('ui.components.could_not_switch_microphone'))
      }
    },
    async onOutputChange(deviceId) {
      this.selectedOutput = deviceId
      try {
        await setAudioOutputDevice(deviceId)
      } catch (error) {
        console.error('Failed to set output device:', error)
        window.$message?.error(this.$t('ui.components.could_not_switch_speaker'))
      }
    },
    onVolumeChange(value) {
      this.masterVolume = value
      setMasterVolume(value / 100)
      localStorage.setItem('voiceMasterVolume', value)
    },
    onMicModeChange(mode) {
      this.voiceStore.micMode = mode
    },
    onVadThresholdChange(value) {
      this.vadThresholdLocal = value
      micActivation.setVadThreshold(value)
      micActivation.saveSettings()
    },
    toggleBrowserGlobalPtt() {
      if (this.browserPttHelperEnabled) {
        disableBrowserPttHelper()
      } else {
        enableBrowserPttHelper()
      }
    },
    startVadMeter() {
      this.stopVadMeter()
      this.vadMeterInterval = setInterval(() => {
        this.vadLevel = micActivation.getCurrentLevel()
      }, 50)
    },
    stopVadMeter() {
      if (this.vadMeterInterval) {
        clearInterval(this.vadMeterInterval)
        this.vadMeterInterval = null
      }
      this.vadLevel = 0
    },
    startKeyRecording() {
      this.cancelKeyRecording()
      this.recordingKey = true

      this.keyRecordHandler = (e) => {
        e.preventDefault()
        e.stopPropagation()
        micActivation.setPttKey(e.code)
        micActivation.saveSettings()
        this.pttKeyLocal = e.code
        this.cancelKeyRecording()
      }

      window.addEventListener('keydown', this.keyRecordHandler, true)

      this.keyRecordTimeout = setTimeout(() => {
        this.cancelKeyRecording()
      }, 5000)
    },
    cancelKeyRecording() {
      this.recordingKey = false
      if (this.keyRecordHandler) {
        window.removeEventListener('keydown', this.keyRecordHandler, true)
        this.keyRecordHandler = null
      }
      if (this.keyRecordTimeout) {
        clearTimeout(this.keyRecordTimeout)
        this.keyRecordTimeout = null
      }
    }
  }
}
</script>

<style scoped>
.mode-desc {
  display: block;
  font-size: 11px;
  opacity: 0.5;
  margin-top: 2px;
}

.setting-hint {
  font-size: 11px;
  opacity: 0.5;
  margin-top: 4px;
}

.ptt-status-badge {
  display: flex;
  align-items: center;
  margin-top: 6px;
}

.global-ptt-card {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface-muted);
}

.global-ptt-copy {
  margin-bottom: 10px;
}

.global-ptt-hint {
  margin-top: 6px;
}

.vad-meter {
  width: 100%;
  height: 8px;
  background: var(--app-surface-muted);
  border-radius: 4px;
  position: relative;
  overflow: visible;
}

.vad-meter-fill {
  height: 100%;
  background: var(--theme-success);
  border-radius: 4px;
  transition: width 0.05s;
  max-width: 100%;
}

.vad-threshold-marker {
  position: absolute;
  top: -3px;
  width: 2px;
  height: 14px;
  background: var(--theme-error);
  border-radius: 1px;
  transform: translateX(-1px);
}
</style>
