<template>
  <div class="custom-audio-player" data-testid="custom-audio-player">
    <audio
      ref="audio"
      :src="src"
      preload="metadata"
      class="custom-audio-element"
      @loadedmetadata="onLoadedMetadata"
      @timeupdate="onTimeUpdate"
      @ended="onEnded"
      @error="onError"
    />
    <button
      type="button"
      class="custom-audio-toggle"
      :aria-label="toggleLabel"
      data-testid="custom-audio-toggle"
      @click="togglePlayback"
    >
      <n-icon size="18">
        <pause-icon v-if="playing" />
        <play-icon v-else />
      </n-icon>
    </button>
    <div class="custom-audio-main">
      <div class="custom-audio-times">
        <span data-testid="custom-audio-current-time">{{ formatTime(currentTime) }}</span>
        <span data-testid="custom-audio-duration">{{ formatTime(displayDuration) }}</span>
      </div>
      <input
        class="custom-audio-progress"
        data-testid="custom-audio-progress"
        type="range"
        min="0"
        max="1000"
        :value="progressValue"
        :aria-label="$t('ui.components.audio_player_seek')"
        @input="seek"
      />
      <div v-if="error" class="custom-audio-error" data-testid="custom-audio-error">
        {{ $t('ui.components.audio_player_error') }}
      </div>
    </div>
  </div>
</template>

<script>
import {
  PauseSharp as PauseIcon,
  PlaySharp as PlayIcon
} from '@vicons/ionicons5'

export default {
  name: 'CustomAudioPlayer',
  components: { PauseIcon, PlayIcon },
  props: {
    src: { type: String, required: true },
    durationMs: { type: Number, default: null }
  },
  data() {
    return {
      playing: false,
      currentTime: 0,
      duration: 0,
      error: false
    }
  },
  computed: {
    displayDuration() {
      if (this.duration > 0) return this.duration
      const durationSeconds = Number(this.durationMs || 0) / 1000
      return Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0
    },
    progressValue() {
      if (!this.displayDuration) return 0
      return Math.min(1000, Math.max(0, Math.round((this.currentTime / this.displayDuration) * 1000)))
    },
    toggleLabel() {
      return this.playing
        ? this.$t('ui.components.audio_player_pause')
        : this.$t('ui.components.audio_player_play')
    }
  },
  watch: {
    src() {
      this.resetPlayer()
      this.$nextTick(() => {
        this.$refs.audio?.load?.()
      })
    }
  },
  beforeUnmount() {
    this.pausePlayback()
  },
  methods: {
    async togglePlayback() {
      if (this.playing) {
        this.pausePlayback()
        return
      }
      await this.playPlayback()
    },
    async playPlayback() {
      const audio = this.$refs.audio
      if (!audio) return
      this.error = false
      try {
        await audio.play()
        this.playing = true
      } catch {
        this.playing = false
        this.error = true
      }
    },
    pausePlayback() {
      const audio = this.$refs.audio
      audio?.pause?.()
      this.playing = false
    },
    seek(event) {
      const audio = this.$refs.audio
      if (!audio || !this.displayDuration) return
      const nextTime = (Number(event.target.value || 0) / 1000) * this.displayDuration
      audio.currentTime = nextTime
      this.currentTime = nextTime
    },
    onLoadedMetadata() {
      const duration = Number(this.$refs.audio?.duration || 0)
      this.duration = Number.isFinite(duration) && duration > 0 ? duration : 0
      this.error = false
    },
    onTimeUpdate() {
      const currentTime = Number(this.$refs.audio?.currentTime || 0)
      this.currentTime = Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0
    },
    onEnded() {
      this.playing = false
      this.currentTime = this.displayDuration || 0
    },
    onError() {
      this.playing = false
      this.error = true
    },
    resetPlayer() {
      this.playing = false
      this.currentTime = 0
      this.duration = 0
      this.error = false
    },
    formatTime(value) {
      const seconds = Math.max(0, Math.floor(Number(value || 0)))
      const minutes = Math.floor(seconds / 60)
      const remainder = seconds % 60
      return `${minutes}:${String(remainder).padStart(2, '0')}`
    }
  }
}
</script>

<style scoped>
.custom-audio-player {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  padding: 8px;
  border-radius: 8px;
  background: var(--app-surface-muted);
  border: 1px solid var(--app-border-strong);
}

.custom-audio-element {
  display: none;
}

.custom-audio-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 8px;
  color: #101014;
  background: var(--theme-primary);
  box-shadow: 0 8px 18px rgba(var(--theme-primary-rgb), 0.2);
  cursor: pointer;
  flex-shrink: 0;
}

.custom-audio-toggle:hover {
  background: var(--theme-primary-hover);
}

.custom-audio-toggle:focus-visible {
  outline: 2px solid var(--app-focus);
  outline-offset: 2px;
}

.custom-audio-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.custom-audio-times {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 11px;
  opacity: 0.72;
  font-variant-numeric: tabular-nums;
}

.custom-audio-progress {
  width: 100%;
  min-width: 0;
  accent-color: var(--theme-primary);
}

.custom-audio-error {
  color: #ffb4b4;
  font-size: 12px;
}
</style>
