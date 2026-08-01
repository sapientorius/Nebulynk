<template>
  <div
    class="nebulynk-loader"
    :class="{
      'nebulynk-loader-centered': centered,
      'nebulynk-loader-pulse': resolvedVariant === 'pulse',
      'nebulynk-loader-orbit': resolvedVariant === 'orbit'
    }"
    :aria-label="label || null"
    :aria-live="label ? 'polite' : null"
    :role="label ? 'status' : null"
    :style="loaderStyle"
    data-testid="nebulynk-loader"
  >
    <div class="nebulynk-loader-visual" />
  </div>
</template>

<script>
export default {
  name: 'NebulynkLoader',
  props: {
    variant: {
      type: String,
      default: 'pulse'
    },
    size: {
      type: [Number, String],
      default: null
    },
    centered: {
      type: Boolean,
      default: false
    },
    label: {
      type: String,
      default: ''
    }
  },
  computed: {
    resolvedVariant() {
      return this.variant === 'orbit' ? 'orbit' : 'pulse'
    },
    resolvedSize() {
      if (typeof this.size === 'number' && Number.isFinite(this.size)) {
        return `${this.size}px`
      }
      if (typeof this.size === 'string' && this.size.trim()) {
        return this.size.trim()
      }
      return this.resolvedVariant === 'orbit' ? '50px' : '48px'
    },
    loaderStyle() {
      return {
        '--nebulynk-loader-size': this.resolvedSize
      }
    }
  }
}
</script>

<style scoped>
.nebulynk-loader {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--nebulynk-loader-size);
  height: var(--nebulynk-loader-size);
}

.nebulynk-loader-centered {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 100%;
}

.nebulynk-loader-visual {
  width: var(--nebulynk-loader-size);
  height: var(--nebulynk-loader-size);
}

.nebulynk-loader-pulse .nebulynk-loader-visual {
  border-radius: 50%;
  background: linear-gradient(135deg, #a855f7, #0ea5e9);
  box-shadow: 0 0 15px rgba(168, 85, 247, 0.8), 0 0 30px rgba(14, 165, 233, 0.6);
  animation: pulse-ring 1.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
}

.nebulynk-loader-orbit .nebulynk-loader-visual {
  position: relative;
  animation: spin 1.5s linear infinite;
}

.nebulynk-loader-orbit .nebulynk-loader-visual::before,
.nebulynk-loader-orbit .nebulynk-loader-visual::after {
  content: '';
  position: absolute;
  width: calc(var(--nebulynk-loader-size) * 0.32);
  height: calc(var(--nebulynk-loader-size) * 0.32);
  border-radius: 50%;
}

.nebulynk-loader-orbit .nebulynk-loader-visual::before {
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  background: #0ea5e9;
  box-shadow: 0 0 12px #0ea5e9;
  animation: scale-bounce 1.5s ease-in-out infinite;
}

.nebulynk-loader-orbit .nebulynk-loader-visual::after {
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  background: #a855f7;
  box-shadow: 0 0 12px #a855f7;
  animation: scale-bounce 1.5s ease-in-out infinite alternate;
}

@keyframes pulse-ring {
  0% {
    transform: scale(0.7);
    box-shadow: 0 0 0 0 rgba(168, 85, 247, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 20px rgba(14, 165, 233, 0);
  }
  100% {
    transform: scale(0.7);
    box-shadow: 0 0 0 0 rgba(14, 165, 233, 0);
  }
}

@keyframes spin {
  100% {
    transform: rotate(360deg);
  }
}

@keyframes scale-bounce {
  0%, 100% {
    transform: translateX(-50%) scale(1);
  }
  50% {
    transform: translateX(-50%) scale(0.6);
    opacity: 0.7;
  }
}
</style>
