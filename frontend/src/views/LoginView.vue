<template>
  <div class="login-container" data-testid="login-view">
    <div class="login-ambient" aria-hidden="true">
      <span class="star" style="top: 9%; left: 11%; width: 2px; height: 2px;"></span>
      <span class="star twinkle" style="top: 14%; left: 22%; width: 4px; height: 4px; animation-duration: 8s; animation-delay: -1.2s;"></span>
      <span class="star" style="top: 18%; left: 37%; width: 3px; height: 3px;"></span>
      <span class="star" style="top: 11%; left: 58%; width: 2px; height: 2px;"></span>
      <span class="star twinkle" style="top: 21%; left: 71%; width: 5px; height: 5px; animation-duration: 6s; animation-delay: -2.4s;"></span>
      <span class="star" style="top: 13%; left: 84%; width: 3px; height: 3px;"></span>
      <span class="star" style="top: 28%; left: 8%; width: 2px; height: 2px;"></span>
      <span class="star twinkle" style="top: 33%; left: 18%; width: 3px; height: 3px; animation-duration: 9s; animation-delay: -4.2s;"></span>
      <span class="star" style="top: 36%; left: 49%; width: 2px; height: 2px;"></span>
      <span class="star" style="top: 31%; left: 63%; width: 3px; height: 3px;"></span>
      <span class="star twinkle" style="top: 39%; left: 79%; width: 4px; height: 4px; animation-duration: 7s; animation-delay: -0.8s;"></span>
      <span class="star" style="top: 45%; left: 90%; width: 2px; height: 2px;"></span>
      <span class="star" style="top: 57%; left: 14%; width: 3px; height: 3px;"></span>
      <span class="star twinkle" style="top: 62%; left: 29%; width: 5px; height: 5px; animation-duration: 10s; animation-delay: -5.1s;"></span>
      <span class="star" style="top: 68%; left: 44%; width: 2px; height: 2px;"></span>
      <span class="star" style="top: 59%; left: 67%; width: 3px; height: 3px;"></span>
      <span class="star twinkle" style="top: 72%; left: 82%; width: 4px; height: 4px; animation-duration: 8.5s; animation-delay: -3.3s;"></span>
      <span class="star" style="top: 82%; left: 9%; width: 2px; height: 2px;"></span>
      <span class="star" style="top: 86%; left: 23%; width: 3px; height: 3px;"></span>
      <span class="star twinkle" style="top: 84%; left: 61%; width: 4px; height: 4px; animation-duration: 6.8s; animation-delay: -1.7s;"></span>
      <span class="star" style="top: 88%; left: 76%; width: 2px; height: 2px;"></span>
      <span class="star" style="top: 79%; left: 92%; width: 3px; height: 3px;"></span>
      <span class="nebula nebula-a"></span>
      <span class="nebula nebula-b"></span>
      <span class="nebula nebula-c"></span>
      <span class="mist-band"></span>
    </div>

    <AuthFlipCard :flipped="isRegistrationRoute" :animate="animationReady">
      <template #front>
        <n-card class="login-card" style="max-width: 430px; width: 100%">
      <h1 class="login-brand">
        <span class="wordmark">{{ brandName }}</span>
      </h1>
      <p class="login-copy">
        {{ loginCopy }}
      </p>

      <template v-if="isDesktopMode">
        <n-alert type="info" style="margin-bottom: 16px" data-testid="desktop-login-server-hint">
          Choose or add a Nebulynk server before signing in.
        </n-alert>
        <n-form label-placement="top" style="margin-bottom: 18px">
          <n-form-item label="Current server">
            <n-select
              :value="activeDesktopProfileId"
              :options="desktopProfileOptions"
              :placeholder="'Select a saved server'"
              data-testid="desktop-login-server-select"
              @update:value="selectDesktopProfile"
            />
          </n-form-item>
          <n-form-item label="Server URL">
            <n-input
              v-model:value="desktopProfileForm.baseUrl"
              placeholder="https://server.example.com"
              :input-props="{ 'data-testid': 'desktop-login-server-url' }"
            />
          </n-form-item>
          <n-form-item label="Label">
            <n-input
              v-model:value="desktopProfileForm.label"
              placeholder="Optional display name"
              :input-props="{ 'data-testid': 'desktop-login-server-label' }"
            />
          </n-form-item>
          <div class="desktop-server-actions">
            <n-button data-testid="desktop-login-add-server" @click="addDesktopServer">
              Save server
            </n-button>
            <n-button
              v-if="activeDesktopProfileId"
              quaternary
              data-testid="desktop-login-remove-server"
              @click="removeActiveDesktopServer"
            >
              Remove
            </n-button>
            <n-button
              v-if="activeDesktopProfile?.authState?.accessToken"
              type="primary"
              secondary
              data-testid="desktop-login-open-server"
              @click="openWorkspaceForActiveServer"
            >
              Open workspace
            </n-button>
          </div>
        </n-form>
      </template>

      <n-form ref="loginForm" :model="form" :rules="rules" @submit.prevent="submit">
        <template v-if="!isTwoFactorStep">
          <n-form-item :label="$t('login.fields.email')" path="email">
            <n-input
              v-model:value="form.email"
              :placeholder="$t('login.placeholders.email')"
              :input-props="{ 'data-testid': 'login-email' }"
              @keyup.enter="submit"
            />
          </n-form-item>
          <n-form-item :label="$t('login.fields.password')" path="password">
            <n-input
              v-model:value="form.password"
              type="password"
              show-password-on="click"
              :placeholder="$t('login.placeholders.password')"
              :input-props="{ 'data-testid': 'login-password' }"
              @keyup.enter="submit"
            />
          </n-form-item>
          <n-form-item path="remember">
            <n-checkbox v-model:checked="form.remember" data-testid="login-remember">
              {{ $t('login.fields.remember') }}
            </n-checkbox>
          </n-form-item>
          <div class="login-links">
            <router-link to="/forgot-password" class="login-forgot-link" data-testid="login-forgot-password">
              {{ $t('login.buttons.forgotPassword') }}
            </router-link>
            <router-link
              v-if="selfRegistrationEnabled && !isDesktopMode"
              to="/register"
              class="login-forgot-link"
              data-testid="login-register"
            >
              {{ $t('selfRegistration.loginLink') }}
            </router-link>
          </div>
          <n-button type="primary" block :loading="loading" data-testid="login-submit" @click="submit">{{ $t('login.buttons.submit') }}</n-button>
          <n-button secondary block style="margin-top: 12px" :loading="loading" data-testid="login-passkey-submit" @click="submitPasskey">
            {{ $t('login.buttons.usePasskey') }}
          </n-button>
        </template>

        <template v-else>
          <n-alert type="info" style="margin-bottom: 16px" data-testid="login-2fa-hint">
            {{ twoFactorHint }}
          </n-alert>
          <n-form-item :label="$t('login.fields.code')" path="twoFactorCode">
            <n-input
              v-model:value="twoFactorCode"
              data-testid="login-2fa-code"
              :placeholder="twoFactorPlaceholder"
              :input-props="{ 'data-testid': 'login-2fa-code' }"
              @keyup.enter="submit"
            />
          </n-form-item>
          <div class="login-links">
            <n-button text data-testid="login-2fa-toggle-mode" @click="toggleTwoFactorMode">
              {{ twoFactorToggleLabel }}
            </n-button>
            <n-button text data-testid="login-2fa-back" @click="resetTwoFactorStep">
              {{ $t('login.buttons.back') }}
            </n-button>
          </div>
          <n-button type="primary" block :loading="loading" data-testid="login-2fa-submit" @click="submit">
            {{ $t('login.buttons.verify') }}
          </n-button>
        </template>
      </n-form>

      <n-alert v-if="error" type="error" style="margin-top: 16px">
        {{ error }}
      </n-alert>
        </n-card>
      </template>

      <template #back>
        <div class="login-card registration-card" style="max-width: 430px; width: 100%">
          <RegisterView
            embedded
            :config="registrationConfig"
            :config-loading="registrationConfigLoading"
            :config-error="registrationConfigError"
          />
        </div>
      </template>
    </AuthFlipCard>
  </div>
</template>

<script>
import { startAuthentication } from '@simplewebauthn/browser'
import AuthFlipCard from '../components/AuthFlipCard.vue'
import { useSelfRegistrationStore, useSessionStore } from '../stores/index.js'
import { translateApiError } from '../lib/api-error.js'
import {
  addDesktopProfile,
  desktopState,
  getActiveDesktopProfile,
  removeDesktopProfile,
  setActiveDesktopProfile
} from '../lib/desktop-runtime.js'
import { isDesktopManagerWindow } from '../lib/runtime.js'
import RegisterView from './RegisterView.vue'

export default {
  name: 'LoginView',
  components: { AuthFlipCard, RegisterView },
  data() {
    return {
      loading: false,
      error: null,
      twoFactorChallenge: null,
      twoFactorMode: 'totp',
      twoFactorCode: '',
      selfRegistrationEnabled: false,
      registrationConfig: null,
      registrationConfigLoading: true,
      registrationConfigError: null,
      animationReady: false,
      animationFrame: null,
      form: {
        email: '',
        password: '',
        remember: true
      },
      desktopProfileForm: {
        label: '',
        baseUrl: ''
      }
    }
  },
  computed: {
    brandName() {
      return 'Nebulynk'
    },
    loginCopy() {
      if (this.isTwoFactorStep) {
        return this.$t('login.twoFactor.description')
      }
      if (this.isDesktopMode && this.activeDesktopProfile) {
        return `Desktop sign-in for ${this.activeDesktopProfile.label}`
      }
      return 'Team Communication'
    },
    sessionStore() {
      return useSessionStore()
    },
    selfRegistrationStore() {
      return useSelfRegistrationStore()
    },
    isDesktopMode() {
      return isDesktopManagerWindow()
    },
    isRegistrationRoute() {
      return this.$route.name === 'Register'
    },
    activeDesktopProfile() {
      return getActiveDesktopProfile()
    },
    activeDesktopProfileId() {
      return desktopState.activeProfileId || null
    },
    desktopProfileOptions() {
      return (desktopState.profiles || []).map((profile) => ({
        label: `${profile.label} - ${profile.baseUrl}`,
        value: profile.id
      }))
    },
    isTwoFactorStep() {
      return !!this.twoFactorChallenge?.challengeId
    },
    twoFactorHint() {
      return this.twoFactorMode === 'recovery_code'
        ? this.$t('login.twoFactor.hints.recovery')
        : this.$t('login.twoFactor.hints.totp')
    },
    twoFactorPlaceholder() {
      return this.twoFactorMode === 'recovery_code'
        ? this.$t('login.placeholders.recoveryCode')
        : this.$t('login.placeholders.totpCode')
    },
    twoFactorToggleLabel() {
      return this.twoFactorMode === 'recovery_code'
        ? this.$t('login.buttons.useAuthenticatorCode')
        : this.$t('login.buttons.useRecoveryCode')
    },
    rules() {
      return {
        email: { required: true, message: this.$t('login.validation.emailRequired'), trigger: 'blur' },
        password: { required: true, message: this.$t('login.validation.passwordRequired'), trigger: 'blur' }
      }
    }
  },
  async created() {
    try {
      const config = await this.selfRegistrationStore.loadConfig({ refresh: true })
      this.registrationConfig = config
      this.selfRegistrationEnabled = config?.enabled === true
    } catch (error) {
      this.registrationConfigError = translateApiError(error, 'selfRegistration.errors.registrationFailed')
      this.selfRegistrationEnabled = false
    } finally {
      this.registrationConfigLoading = false
    }
  },
  mounted() {
    this.animationFrame = window.requestAnimationFrame(() => {
      this.animationReady = true
    })
  },
  beforeUnmount() {
    if (this.animationFrame) {
      window.cancelAnimationFrame(this.animationFrame)
    }
  },
  methods: {
    async addDesktopServer() {
      try {
        const profile = await addDesktopProfile({
          label: this.desktopProfileForm.label,
          baseUrl: this.desktopProfileForm.baseUrl
        })
        await setActiveDesktopProfile(profile.id)
        this.desktopProfileForm.label = ''
        this.desktopProfileForm.baseUrl = ''
      } catch (error) {
        this.error = error.message || 'Server could not be saved'
      }
    },
    async selectDesktopProfile(profileId) {
      this.error = null
      await this.sessionStore.destroy()
      await setActiveDesktopProfile(profileId)
    },
    async removeActiveDesktopServer() {
      const activeProfileId = this.activeDesktopProfileId
      if (!activeProfileId) return
      await this.sessionStore.destroy()
      await removeDesktopProfile(activeProfileId)
    },
    async openWorkspaceForActiveServer() {
      if (!this.activeDesktopProfile?.authState?.accessToken) return
      await this.sessionStore.init().catch(() => {})
      await this.$router.push(this.activeDesktopProfile?.lastRoute || '/').catch(() => {})
    },
    resetTwoFactorStep() {
      this.twoFactorChallenge = null
      this.twoFactorMode = 'totp'
      this.twoFactorCode = ''
      this.error = null
    },
    toggleTwoFactorMode() {
      this.twoFactorMode = this.twoFactorMode === 'recovery_code' ? 'totp' : 'recovery_code'
      this.twoFactorCode = ''
      this.error = null
    },
    async submit() {
      if (this.isTwoFactorStep) {
        await this.verifyTwoFactor()
        return
      }

      await this.doLogin()
    },
    async doLogin() {
      if (this.isDesktopMode && !this.activeDesktopProfile) {
        this.error = 'Please add a server first.'
        return
      }

      this.loading = true
      this.error = null
      try {
        const result = await this.sessionStore.login(this.form.email, this.form.password, {
          remember: this.form.remember
        })
        if (result?.requiresTwoFactor) {
          this.twoFactorChallenge = result
          this.twoFactorMode = 'totp'
          this.twoFactorCode = ''
          return
        }
        this.$router.push('/')
      } catch (err) {
        console.error('Desktop login flow failed:', err)
        this.error = translateApiError(err, 'login.errors.loginFailed')
      } finally {
        this.loading = false
      }
    },
    async submitPasskey() {
      this.loading = true
      this.error = null
      try {
        const challenge = await this.sessionStore.beginPasskeyAuthentication({
          remember: this.form.remember
        })
        const authenticationResponse = await startAuthentication({
          optionsJSON: challenge.options
        })
        await this.sessionStore.verifyPasskeyAuthentication({
          challengeId: challenge.challengeId,
          authenticationResponse,
          remember: this.form.remember
        })
        this.$router.push('/')
      } catch (err) {
        console.error('Desktop passkey login flow failed:', err)
        this.error = translateApiError(err, err?.message || 'login.errors.loginFailed')
      } finally {
        this.loading = false
      }
    },
    async verifyTwoFactor() {
      this.loading = true
      this.error = null
      try {
        await this.sessionStore.verifyTwoFactorLogin({
          challengeId: this.twoFactorChallenge.challengeId,
          method: this.twoFactorMode,
          code: this.twoFactorCode,
          remember: this.twoFactorChallenge.remember === true
        })
        this.$router.push('/')
      } catch (err) {
        console.error('Desktop two-factor login flow failed:', err)
        this.error = translateApiError(err, 'login.errors.loginFailed')
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<style scoped>
.login-container {
  box-sizing: border-box;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100dvh;
  padding: 24px;
  overflow: auto;
  background:
    radial-gradient(circle at top, rgba(92, 117, 255, 0.16), transparent 32%),
    radial-gradient(circle at 80% 10%, rgba(63, 224, 214, 0.14), transparent 24%),
    linear-gradient(180deg, #0a1022 0%, #060816 45%, #03040c 100%);
}

.login-container::before,
.login-container::after {
  content: "";
  position: absolute;
  inset: -20%;
  pointer-events: none;
}

.login-container::before {
  background:
    radial-gradient(circle at 20% 30%, rgba(110, 161, 255, 0.2) 0, transparent 22%),
    radial-gradient(circle at 78% 22%, rgba(93, 255, 214, 0.12) 0, transparent 18%),
    radial-gradient(circle at 70% 78%, rgba(149, 110, 255, 0.16) 0, transparent 20%);
  filter: blur(24px);
  animation: drift 36s ease-in-out infinite alternate;
}

.login-container::after {
  background: radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.04), transparent 60%);
  opacity: 0.12;
}

.login-ambient {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.star {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 0 12px 1px rgba(255, 255, 255, 0.65);
  opacity: 0.82;
}

.star.twinkle {
  box-shadow: 0 0 20px 4px #fff;
  animation: starTwinkle 8s linear infinite;
}

.nebula,
.mist-band {
  position: absolute;
  border-radius: 50%;
  mix-blend-mode: screen;
}

.nebula {
  filter: blur(28px);
  opacity: 0.78;
}

.nebula-a {
  top: 14%;
  left: 14%;
  width: 280px;
  height: 280px;
  background: rgba(99, 141, 255, 0.28);
  animation: nebulaFloat 20s ease-in-out infinite alternate;
}

.nebula-b {
  top: 16%;
  right: 10%;
  width: 240px;
  height: 240px;
  background: rgba(121, 215, 255, 0.2);
  animation: nebulaFloat 24s ease-in-out infinite alternate-reverse;
}

.nebula-c {
  bottom: -2%;
  left: 28%;
  width: 320px;
  height: 320px;
  background: rgba(148, 123, 255, 0.16);
  animation: nebulaFloat 26s ease-in-out infinite alternate;
}

.mist-band {
  inset: 18% -12% auto;
  height: 200px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, rgba(184, 220, 255, 0.12), transparent);
  filter: blur(20px);
  animation: mistSweep 22s ease-in-out infinite;
}

.login-card {
  position: relative;
  z-index: 1;
  border: 1px solid rgba(174, 196, 255, 0.22);
  border-radius: 28px;
  background: linear-gradient(180deg, rgba(16, 22, 45, 0.56), rgba(8, 12, 27, 0.68));
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(22px) saturate(120%);
  overflow: hidden;
}

.login-card::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at top, rgba(121, 215, 255, 0.14), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), transparent 28%);
  pointer-events: none;
}

.registration-card :deep(.n-card) {
  border: 0;
  background: transparent;
  box-shadow: none;
}

.registration-card :deep(.n-card-header) {
  display: block;
  padding: 24px 24px 20px;
}

.registration-card :deep(.n-card__content) {
  padding: 0 24px 24px;
}

.login-kicker,
.login-brand,
.login-copy {
  position: relative;
  z-index: 1;
}

.login-kicker {
  margin: 0 0 10px;
  color: rgba(198, 215, 255, 0.78);
  font-size: 0.78rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.login-brand {
  margin: 0;
  font-size: clamp(2.2rem, 5vw, 3.1rem);
  line-height: 1;
  letter-spacing: -0.05em;
}

.wordmark {
  position: relative;
  display: inline-block;
  color: transparent;
  background: linear-gradient(110deg, rgba(255, 255, 255, 0.18) 0%, #f8fbff 42%, rgba(147, 236, 255, 0.92) 60%, #f8fbff 100%);
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  animation: revealGradient 15s ease-in-out infinite;
}

.wordmark::before {
  content: "";
  position: absolute;
  inset: -18px -16px;
  background:
    linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.76) 47%, transparent 55%),
    radial-gradient(circle, rgba(121, 215, 255, 0.16), transparent 60%);
  filter: blur(18px);
  opacity: 0;
  animation: textMist 15s ease-in-out infinite;
  pointer-events: none;
}

.login-copy {
  margin: 14px 0 22px;
  max-width: 30ch;
  color: rgba(200, 214, 255, 0.74);
  line-height: 1.65;
}

.login-links {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin: -4px 0 18px;
}

.desktop-server-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 8px;
}

.login-forgot-link {
  color: rgba(198, 215, 255, 0.88);
  font-size: 0.85rem;
  text-decoration: none;
}

.login-forgot-link:hover {
  text-decoration: underline;
}

:deep(.n-card-header) {
  display: none;
}

:deep(.n-card__content) {
  position: relative;
}

@keyframes drift {
  0% {
    transform: translate3d(-2%, 0, 0) scale(1);
  }
  100% {
    transform: translate3d(2%, 4%, 0) scale(1.08);
  }
}

@keyframes nebulaFloat {
  0% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  100% {
    transform: translate3d(18px, -20px, 0) scale(1.08);
  }
}

@keyframes mistSweep {
  0%,
  100% {
    transform: translate3d(-8%, 0, 0);
    opacity: 0.24;
  }
  50% {
    transform: translate3d(10%, 12px, 0);
    opacity: 0.48;
  }
}

@keyframes revealGradient {
  0%,
  24%,
  100% {
    background-position: 100% 50%;
    filter: drop-shadow(0 0 0 rgba(121, 215, 255, 0));
  }
  48%,
  70% {
    background-position: 35% 50%;
    filter: drop-shadow(0 0 20px rgba(121, 215, 255, 0.24));
  }
}

@keyframes textMist {
  0%,
  24%,
  100% {
    opacity: 0;
    transform: translateX(-28px);
  }
  38%,
  66% {
    opacity: 0.72;
    transform: translateX(8px);
  }
}

@keyframes starTwinkle {
  0% {
    box-shadow: 0 0 20px 4px #fff;
  }
  10% {
    box-shadow: 0 0 20px 4px #fff;
  }
  15% {
    box-shadow: 0 0 25px 4px #fff;
  }
  20% {
    box-shadow: 0 0 30px 4px #fff;
  }
  25% {
    box-shadow: 0 0 40px 4px #fff;
  }
  30% {
    box-shadow: 0 0 35px 4px #fff;
  }
  35% {
    box-shadow: 0 0 30px 4px #fff;
  }
  40% {
    box-shadow: 0 0 40px 4px #fff;
  }
  45% {
    box-shadow: 0 0 20px 4px #fff;
  }
  50% {
    box-shadow: 0 0 30px 4px #fff;
  }
  55% {
    box-shadow: 0 0 30px 4px #fff;
  }
  60% {
    box-shadow: 0 0 25px 4px #fff;
  }
  65% {
    box-shadow: 0 0 20px 4px #fff;
  }
  70% {
    box-shadow: 0 0 20px 4px #fff;
  }
  75% {
    box-shadow: 0 0 30px 4px #fff;
  }
  80% {
    box-shadow: 0 0 35px 4px #fff;
  }
  85% {
    box-shadow: 0 0 40px 4px #fff;
  }
  90% {
    box-shadow: 0 0 40px 4px #fff;
  }
  95% {
    box-shadow: 0 0 35px 4px #fff;
  }
  100% {
    box-shadow: 0 0 20px 4px #fff;
  }
}

@media (max-width: 640px) {
  .login-container {
    padding: 16px;
  }

  .login-card {
    border-radius: 24px;
  }

  .login-copy {
    max-width: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .login-container::before,
  .login-container::after,
  .star.twinkle,
  .nebula,
  .mist-band,
  .wordmark,
  .wordmark::before {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
</style>
