import { createApp } from 'vue'
import { createPinia } from 'pinia'
import {
  create,
  NAlert,
  NAvatar,
  NBadge,
  NButton,
  NCard,
  NCheckbox,
  NCheckboxGroup,
  NColorPicker,
  NConfigProvider,
  NDatePicker,
  NDialogProvider,
  NDivider,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NForm,
  NFormItem,
  NGlobalStyle,
  NIcon,
  NImage,
  NInput,
  NInputNumber,
  NInputGroup,
  NLayout,
  NLayoutContent,
  NLayoutHeader,
  NLayoutSider,
  NMenu,
  NMessageProvider,
  NModal,
  NNotificationProvider,
  NPopover,
  NPopconfirm,
  NRadio,
  NRadioGroup,
  NResult,
  NSelect,
  NSlider,
  NSpace,
  NSpin,
  NStep,
  NSteps,
  NSwitch,
  NTable,
  NTag,
  NTooltip
} from 'naive-ui'
import App from './App.vue'
import router from './router/index.js'
import { getCurrentUser, getPlatformStatus } from './lib/api.js'
import {
  DEFAULT_LOCALE,
  applyLocaleForUser,
  setPlatformDefaultLocale,
  setupI18n
} from './lib/i18n.js'
import { initializePwaSupport } from './lib/pwa.js'
import { startBrowserPttHelperBridge } from './lib/browser-ptt-helper-bridge.js'
import { initializeDesktopRuntime } from './lib/desktop-runtime.js'
import { startDesktopBackgroundRelay } from './lib/desktop-background-relay.js'
import { startDesktopManagerController } from './lib/desktop-manager-controller.js'
import {
  getDesktopWorkspaceInitialAuthState,
  initializeDesktopWorkspaceBridge,
  syncDesktopWorkspaceSession,
  startDesktopWorkspaceBridge
} from './lib/desktop-workspace-bridge.js'
import { setDesktopWorkspaceClientContext } from './lib/desktop-workspace-client-context.js'
import {
  getDesktopRuntimeKind,
  isDesktopManagerWindow,
  isDesktopRuntime,
  isLocalDesktopAppOrigin,
  shouldUseDesktopWorkspaceBridge
} from './lib/runtime.js'

const naive = create({
  components: [
    NAlert,
    NAvatar,
    NBadge,
    NButton,
    NCard,
    NCheckbox,
    NCheckboxGroup,
    NColorPicker,
    NConfigProvider,
    NDatePicker,
    NDialogProvider,
    NDivider,
    NDrawer,
    NDrawerContent,
    NEmpty,
    NForm,
    NFormItem,
    NGlobalStyle,
    NIcon,
    NImage,
    NInput,
    NInputNumber,
    NInputGroup,
    NLayout,
    NLayoutContent,
    NLayoutHeader,
    NLayoutSider,
    NMenu,
    NMessageProvider,
    NModal,
    NNotificationProvider,
    NPopover,
    NPopconfirm,
    NRadio,
    NRadioGroup,
    NResult,
    NSelect,
    NSlider,
    NSpace,
    NSpin,
    NStep,
    NSteps,
    NSwitch,
    NTable,
    NTag,
    NTooltip
  ]
})

const app = createApp(App)
const pinia = createPinia()
const anyDesktopRuntime = isDesktopRuntime()
const desktopRuntimeKind = getDesktopRuntimeKind()
const desktopManagerWindow = isDesktopManagerWindow()
const localDesktopAppWindow = isLocalDesktopAppOrigin()
const desktopWorkspaceBridgeWindow = shouldUseDesktopWorkspaceBridge()

await initializeDesktopRuntime()

if (desktopWorkspaceBridgeWindow) {
  await initializeDesktopWorkspaceBridge()
  setDesktopWorkspaceClientContext({
    defaultSessionTransport: 'body',
    initialAuthState: getDesktopWorkspaceInitialAuthState(),
    onPersistAuthState: async (authState) => {
      await syncDesktopWorkspaceSession(authState)
    }
  })
}

async function bootstrapLocale() {
  setPlatformDefaultLocale(DEFAULT_LOCALE)

  if (localDesktopAppWindow) {
    applyLocaleForUser(null)
    return
  }

  try {
    const platform = await getPlatformStatus()
    setPlatformDefaultLocale(platform?.default_locale || DEFAULT_LOCALE)
  } catch {
    // Keep English fallback when backend is unavailable.
  }

  applyLocaleForUser(getCurrentUser())
}

await bootstrapLocale()
if (!anyDesktopRuntime) {
  initializePwaSupport()
}

app.use(naive)
app.use(pinia)
if (desktopManagerWindow || !localDesktopAppWindow) {
  app.use(router)
}
setupI18n(app)

app.mount('#app')

if (desktopManagerWindow) {
  if (desktopRuntimeKind !== 'electron') {
    startDesktopBackgroundRelay()
    startDesktopManagerController().catch(() => {})
  }
} else if (desktopWorkspaceBridgeWindow) {
  startDesktopWorkspaceBridge({
    router
  })
} else {
  startBrowserPttHelperBridge({
    router
  })
}
