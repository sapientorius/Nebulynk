import { createRouter, createWebHistory } from 'vue-router'
import { isAuthenticated, getCurrentUser, getPlatformStatus, restoreBrowserSession } from '../lib/api.js'
import { getActiveDesktopProfile } from '../lib/desktop-runtime.js'
import { isDesktopManagerWindow, isLocalDesktopAppOrigin } from '../lib/runtime.js'

const routes = [
  {
    path: '/setup',
    name: 'Setup',
    component: () => import('../views/SetupView.vue')
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue')
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('../views/RegisterView.vue')
  },
  {
    path: '/register/confirm/:token',
    name: 'RegistrationConfirmation',
    component: () => import('../views/RegistrationConfirmationView.vue')
  },
  {
    path: '/desktop/server-manager',
    name: 'DesktopServerManager',
    component: () => import('../views/DesktopServerManagerView.vue')
  },
  {
    path: '/forgot-password',
    name: 'ForgotPassword',
    component: () => import('../views/ForgotPasswordView.vue')
  },
  {
    path: '/reset-password/:token',
    name: 'ResetPassword',
    component: () => import('../views/ResetPasswordView.vue')
  },
  {
    path: '/',
    redirect: '/channels'
  },
  {
    path: '/',
    component: () => import('../views/WorkspaceShell.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: 'channels/:channelId?',
        name: 'App',
        component: () => import('../views/AppView.vue')
      },
      {
        path: 'meetings',
        name: 'MeetingsOverview',
        component: () => import('../views/MeetingsOverviewView.vue')
      },
      {
        path: 'meetings/:meetingId',
        name: 'Meeting',
        component: () => import('../views/MeetingView.vue')
      }
    ]
  },
  {
    path: '/channels/:channelId/screen-share',
    name: 'ChannelScreenShare',
    component: () => import('../views/ScreenShareView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/meetings/:meetingId/screen-share',
    name: 'MeetingScreenShare',
    component: () => import('../views/ScreenShareView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin',
    name: 'Admin',
    component: () => import('../views/AdminView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/SettingsView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/invite/:token',
    name: 'InviteAccept',
    component: () => import('../views/InviteAcceptView.vue')
  },
  {
    path: '/meeting-invite/:token',
    name: 'MeetingInvite',
    component: () => import('../views/MeetingInviteView.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to) => {
  if (isDesktopManagerWindow()) {
    if (to.name !== 'DesktopServerManager') {
      return { name: 'DesktopServerManager' }
    }
    return
  }

  const activeDesktopProfile = getActiveDesktopProfile()

  if (isLocalDesktopAppOrigin() && !activeDesktopProfile) {
    if (to.name !== 'Login' && to.name !== 'ForgotPassword' && to.name !== 'ResetPassword') {
      return { name: 'Login' }
    }
    return
  }

  // Check platform init status
  try {
    const status = await getPlatformStatus()
    const initialized = status.initialized === true || status.initialized === 'true'

    // Not initialized -> force setup (except invite page)
    if (!initialized && to.name !== 'Setup' && to.name !== 'InviteAccept' && to.name !== 'MeetingInvite') {
      return { name: 'Setup' }
    }

    // Already initialized -> block setup page
    if (initialized && to.name === 'Setup') {
      return { name: 'Login' }
    }
  } catch {
    // Backend not available -> let it fail naturally
  }

  // Auth check
  if (to.meta.requiresAuth && !isAuthenticated()) {
    try {
      const restored = await restoreBrowserSession()
      if (!restored?.accessToken) {
        return { name: 'Login' }
      }
    } catch {
      return { name: 'Login' }
    }
  }

  const currentUser = getCurrentUser()
  const isGuestUser = currentUser?.account_type === 'guest'
  if (isGuestUser) {
    if (to.name === 'Admin' || to.name === 'Settings' || to.name === 'App') {
      return { name: 'MeetingsOverview' }
    }
  }
})

export default router
