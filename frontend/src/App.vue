<template>
  <n-config-provider :theme="theme" :theme-overrides="themeOverrides" :locale="naiveLocale" :date-locale="naiveDateLocale">
    <n-global-style />
    <n-message-provider>
      <n-notification-provider>
        <n-dialog-provider>
          <AppContent />
        </n-dialog-provider>
      </n-notification-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script>
import {
  darkTheme,
  lightTheme,
  deDE,
  enUS,
  dateDeDE,
  dateEnUS,
  useMessage,
  useDialog,
  useNotification
} from 'naive-ui'
import { defineAsyncComponent, defineComponent, h } from 'vue'
import { RouterView } from 'vue-router'
import { getCurrentLocale } from './lib/i18n.js'
import { isDesktopManagerWindow, isLocalDesktopAppOrigin } from './lib/runtime.js'
import { useThemeStore } from './stores/index.js'

const IncomingCallOverlay = defineAsyncComponent(() => import('./components/IncomingCallOverlay.vue'))
const DesktopWorkspaceBootstrap = defineAsyncComponent(() => import('./components/DesktopWorkspaceBootstrap.vue'))

const AppContent = defineComponent({
  setup() {
    window.$message = useMessage()
    window.$dialog = useDialog()
    window.$notification = useNotification()
  },
  render() {
    if (isDesktopManagerWindow()) {
      return h(RouterView)
    }

    if (isLocalDesktopAppOrigin()) {
      return h(DesktopWorkspaceBootstrap)
    }

    return h('div', { class: 'app-shell' }, [
      h(RouterView),
      h(IncomingCallOverlay)
    ])
  }
})

export default {
  name: 'App',
  components: { AppContent },
  data() {
    return {
      stopWatchingSystemTheme: null
    }
  },
  computed: {
    themeStore() {
      return useThemeStore()
    },
    theme() {
      return this.themeStore.effectiveMode === 'light' ? lightTheme : darkTheme
    },
    themeOverrides() {
      return this.themeStore.naiveThemeOverrides
    },
    currentLocale() {
      return getCurrentLocale()
    },
    naiveLocale() {
      return this.currentLocale === 'de' ? deDE : enUS
    },
    naiveDateLocale() {
      return this.currentLocale === 'de' ? dateDeDE : dateEnUS
    }
  },
  watch: {
    'themeStore.effectiveMode'() {
      this.themeStore.applyCurrentTheme()
    },
    'themeStore.cssVariables': {
      deep: true,
      handler() {
        this.themeStore.applyCurrentTheme()
      }
    },
    'themeStore.customCss': {
      deep: true,
      handler() {
        this.themeStore.applyCurrentTheme()
      }
    },
    'themeStore.fontFaceCss'() {
      this.themeStore.applyCurrentTheme()
    }
  },
  created() {
    this.themeStore.applyCurrentTheme()
    this.themeStore.loadPlatformThemeSettings().catch(() => {
      this.themeStore.applyCurrentTheme()
    })
  },
  mounted() {
    this.stopWatchingSystemTheme = this.themeStore.watchSystemTheme()
  },
  beforeUnmount() {
    this.stopWatchingSystemTheme?.()
  }
}
</script>

<style>
:root {
  --scrollbar-size: 12px;
  --scrollbar-radius: 999px;
  --theme-primary: #63e2b7;
  --theme-primary-hover: #75ebc5;
  --theme-secondary: #5c75ff;
  --theme-success: #63e2b7;
  --theme-warning: #faad14;
  --theme-error: #ff4d4f;
  --theme-primary-rgb: 99, 226, 183;
  --theme-secondary-rgb: 92, 117, 255;
  --theme-success-rgb: 99, 226, 183;
  --theme-warning-rgb: 250, 173, 20;
  --theme-error-rgb: 255, 77, 79;
  --app-bg: #18181c;
  --app-bg-strong: #080a10;
  --app-surface: rgba(255, 255, 255, 0.02);
  --app-surface-raised: rgba(34, 34, 39, 0.94);
  --app-surface-muted: rgba(255, 255, 255, 0.06);
  --app-hover: rgba(255, 255, 255, 0.1);
  --app-border: rgba(255, 255, 255, 0.09);
  --app-border-soft: rgba(255, 255, 255, 0.06);
  --app-border-strong: rgba(255, 255, 255, 0.12);
  --app-text: rgba(255, 255, 255, 0.82);
  --app-text-strong: rgba(255, 255, 255, 0.95);
  --app-text-muted: rgba(255, 255, 255, 0.62);
  --app-overlay: rgba(28, 28, 36, 0.95);
  --app-shadow: rgba(0, 0, 0, 0.35);
  --app-focus: rgba(99, 226, 183, 0.58);
  --app-drop-bg: rgba(99, 226, 183, 0.08);
  --app-drop-border: rgba(99, 226, 183, 0.5);
  --app-primary-soft: rgba(99, 226, 183, 0.08);
  --app-primary-softer: rgba(99, 226, 183, 0.04);
  --app-secondary-soft: rgba(92, 117, 255, 0.08);
  --scrollbar-track: rgba(255, 255, 255, 0.045);
  --scrollbar-thumb: rgba(255, 255, 255, 0.16);
  --scrollbar-thumb-hover: rgba(255, 255, 255, 0.26);
  --scrollbar-thumb-active: rgba(99, 226, 183, 0.34);
  --app-font-family: "Nebulynk Lato", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
}

html,
body {
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}

* {
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}

*::-webkit-scrollbar {
  width: var(--scrollbar-size);
  height: var(--scrollbar-size);
}

*::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
  border-radius: var(--scrollbar-radius);
}

*::-webkit-scrollbar-thumb {
  min-height: 36px;
  background-color: var(--scrollbar-thumb);
  border: 3px solid transparent;
  border-radius: var(--scrollbar-radius);
  background-clip: padding-box;
}

*::-webkit-scrollbar-thumb:hover {
  background-color: var(--scrollbar-thumb-hover);
}

*::-webkit-scrollbar-thumb:active {
  background-color: var(--scrollbar-thumb-active);
}

*::-webkit-scrollbar-corner {
  background: transparent;
}

body {
  margin: 0;
  padding: 0;
  background: var(--app-bg);
  color: var(--app-text);
  font-family: var(--app-font-family);
}
</style>
