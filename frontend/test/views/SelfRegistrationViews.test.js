import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path) {
  return readFileSync(resolve(path), 'utf8')
}

describe('self-registration views', () => {
  it('shares the animated auth card between login and registration routes', () => {
    const auth = source('src/views/AuthView.vue')
    const login = source('src/views/LoginView.vue')
    const flipCard = source('src/components/AuthFlipCard.vue')
    const router = source('src/router/index.js')

    expect(auth).toContain('<LoginView />')
    expect(login).toContain('<AuthFlipCard :flipped="isRegistrationRoute" :animate="animationReady">')
    expect(login).toContain('<RegisterView')
    expect(login).toContain('embedded')
    expect(flipCard).toContain('data-testid="auth-flip-card"')
    expect(flipCard).toContain(':inert="flipped"')
    expect(flipCard).toContain(':inert="!flipped"')
    expect(flipCard).toContain('rotateY(180deg)')
    expect(router.match(/component: \(\) => import\('\.\.\/views\/AuthView\.vue'\)/g)).toHaveLength(2)
  })

  it('keeps the auth controls on the dark theme regardless of the platform theme', () => {
    const login = source('src/views/LoginView.vue')

    expect(login).toContain('<n-config-provider :theme="authTheme" :theme-overrides="authThemeOverrides">')
    expect(login).toContain("import { darkTheme } from 'naive-ui'")
    expect(login).toContain("return buildNaiveThemeOverrides(this.themeStore.platformThemeSettings, 'dark')")
    expect(login.indexOf('<n-config-provider')).toBeLessThan(login.indexOf('<AuthFlipCard'))
    expect(login.lastIndexOf('</n-config-provider>')).toBeGreaterThan(login.lastIndexOf('</AuthFlipCard>'))
  })

  it('only renders the registration entry point when the public setting enables it', () => {
    const login = source('src/views/LoginView.vue')

    expect(login).toContain('v-if="selfRegistrationEnabled && !isDesktopMode"')
    expect(login).toContain('data-testid="login-register"')
    expect(login).toContain('to="/register"')
    expect(login).toContain('this.selfRegistrationStore.loadConfig({ refresh: true })')
  })

  it('shows password guidance and handles SMTP-less registration states', () => {
    const registration = source('src/views/RegisterView.vue')
    const setup = source('src/views/SetupView.vue')
    const i18n = source('src/lib/i18n.js')

    expect(registration).toContain('data-testid="self-registration-view"')
    expect(registration).toContain('passwordPolicyHint')
    expect(registration).toContain('isPasswordValidForPolicy(this.form.password, this.passwordPolicy)')
    expect(registration).toContain("success.confirmation_delivery === 'email'")
    expect(registration).toContain("$t('selfRegistration.success.manualDescription')")
    expect(i18n).toContain('Ein Administrator prueft und schaltet dein Konto frei.')
    expect(setup).toContain('setup-password-policy')
    expect(setup).toContain('isPasswordValidForPolicy(this.form.password, this.passwordPolicy)')
  })

  it('uses activation-specific confirmation copy after a confirmed email link', () => {
    const confirmation = source('src/views/RegistrationConfirmationView.vue')

    expect(confirmation).toContain('data-testid="self-registration-confirmation-view"')
    expect(confirmation).toContain("result?.activated ? $t('selfRegistration.confirmation.activeTitle')")
    expect(confirmation).toContain("$t('selfRegistration.confirmation.pendingDescription')")
    expect(confirmation).toContain('this.selfRegistrationStore.confirm(this.$route.params.token)')
  })

  it('provides admin registration and security settings with pending-account actions', () => {
    const admin = source('src/views/AdminView.vue')
    const registration = source('src/components/admin/RegistrationSettings.vue')
    const security = source('src/components/admin/SecuritySettings.vue')

    expect(admin).toContain("key: 'registration'")
    expect(admin).toContain("key: 'security'")
    expect(registration).toContain('data-testid="registration-smtp-warning"')
    expect(registration).toContain('data-testid="registration-settings-save"')
    expect(registration).toContain('formatDuration(registration.created_at)')
    expect(registration).toContain('confirmationLabel(registration)')
    expect(registration).toContain('deletePendingRegistration(registration.id)')
    expect(security).toContain('data-testid="security-password-strength"')
    expect(security).toContain("password_strength_level: this.passwordStrengthLevel")
  })

  it('registers public registration and confirmation routes', () => {
    const router = source('src/router/index.js')

    expect(router).toContain("path: '/register'")
    expect(router).toContain("path: '/register/confirm/:token'")
  })
})
