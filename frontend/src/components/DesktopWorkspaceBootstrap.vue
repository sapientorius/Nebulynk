<template>
  <div class="desktop-workspace-bootstrap" data-testid="desktop-workspace-bootstrap">
    <n-card v-if="!redirecting" class="desktop-bootstrap-card">
      <h2>No server configured</h2>
      <p>Add a Nebulynk server to open its workspace in the desktop app.</p>
      <n-button
        type="primary"
        data-testid="desktop-bootstrap-open-manager"
        @click="openServerManager"
      >
        Open servers
      </n-button>
    </n-card>
    <n-spin v-else size="large" data-testid="desktop-workspace-bootstrap-loading">
      <span class="desktop-bootstrap-loading-copy">Opening workspace...</span>
    </n-spin>
  </div>
</template>

<script>
import { getActiveDesktopProfile } from '../lib/desktop-runtime.js'
import { listenDesktop, openServerManager } from '../lib/desktop-bridge.js'
import { resolveDesktopAppUrl } from '../lib/desktop-server-url.js'

function resolveWorkspaceRoute(profile) {
  if (!profile?.baseUrl) return ''
  return resolveDesktopAppUrl(
    profile.baseUrl,
    profile.authState?.accessToken ? profile.lastRoute || '/channels' : '/login'
  )
}

export default {
  name: 'DesktopWorkspaceBootstrap',
  data() {
    return {
      redirecting: false,
      stopDesktopListener: null
    }
  },
  async mounted() {
    this.tryRedirectToWorkspace()
    this.stopDesktopListener = await listenDesktop('desktop:profile-activated', () => {
      this.tryRedirectToWorkspace()
    })
  },
  beforeUnmount() {
    this.stopDesktopListener?.()
  },
  methods: {
    tryRedirectToWorkspace() {
      const targetUrl = resolveWorkspaceRoute(getActiveDesktopProfile())
      if (!targetUrl || typeof window === 'undefined') {
        this.redirecting = false
        return
      }

      this.redirecting = true
      window.location.replace(targetUrl)
    },
    async openServerManager() {
      await openServerManager().catch(() => {})
    }
  }
}
</script>

<style scoped>
.desktop-workspace-bootstrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(circle at top, rgba(99, 226, 183, 0.14), transparent 28%),
    linear-gradient(180deg, #071119 0%, #04070d 100%);
}

.desktop-bootstrap-card {
  max-width: 420px;
  text-align: center;
}

.desktop-bootstrap-loading-copy {
  display: inline-block;
  margin-top: 14px;
}
</style>
