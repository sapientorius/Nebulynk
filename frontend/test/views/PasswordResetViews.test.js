import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('password reset views', () => {
  it('adds a forgot-password link to the login view', () => {
    const source = readFileSync(resolve('src/views/LoginView.vue'), 'utf8')

    expect(source).toContain('data-testid="login-forgot-password"')
    expect(source).toContain('to="/forgot-password"')
    expect(source).toContain("$t('login.buttons.forgotPassword')")
  })

  it('supports a second-factor verification step in the login view', () => {
    const source = readFileSync(resolve('src/views/LoginView.vue'), 'utf8')

    expect(source).toContain('data-testid="login-2fa-code"')
    expect(source).toContain('data-testid="login-2fa-submit"')
    expect(source).toContain('data-testid="login-2fa-toggle-mode"')
    expect(source).toContain('data-testid="login-2fa-back"')
    expect(source).toContain('this.twoFactorChallenge = result')
    expect(source).toContain('this.sessionStore.verifyTwoFactorLogin({')
  })

  it('adds a passkey login action to the login view', () => {
    const source = readFileSync(resolve('src/views/LoginView.vue'), 'utf8')

    expect(source).toContain('data-testid="login-passkey-submit"')
    expect(source).toContain("$t('login.buttons.usePasskey')")
    expect(source).toContain('await this.sessionStore.beginPasskeyAuthentication({')
    expect(source).toContain('await startAuthentication({')
    expect(source).toContain('await this.sessionStore.verifyPasskeyAuthentication({')
  })

  it('forgot-password view submits email requests and keeps the success state generic', () => {
    const source = readFileSync(resolve('src/views/ForgotPasswordView.vue'), 'utf8')

    expect(source).toContain("name: 'ForgotPasswordView'")
    expect(source).toContain('data-testid="forgot-password-view"')
    expect(source).toContain('this.passwordResetStore.requestReset(this.form.email.trim())')
    expect(source).toContain("this.formError = this.$t('passwordReset.errors.emailRequired')")
    expect(source).toContain("status=\"success\"")
    expect(source).toContain("$t('passwordReset.request.successDescription')")
  })

  it('reset-password view validates tokens, compares passwords, and clears local auth before redirecting', () => {
    const source = readFileSync(resolve('src/views/ResetPasswordView.vue'), 'utf8')

    expect(source).toContain("name: 'ResetPasswordView'")
    expect(source).toContain('this.passwordResetStore.validateToken(this.$route.params.token)')
    expect(source).toContain('this.passwordResetStore.resetPassword(this.$route.params.token, this.form.password)')
    expect(source).toContain("this.formError = this.$t('passwordReset.errors.passwordTooShort')")
    expect(source).toContain("this.formError = this.$t('passwordReset.errors.passwordsMismatch')")
    expect(source).toContain('await this.sessionStore.clearLocalAuthentication()')
    expect(source).toContain("await this.$router.replace('/login')")
  })
})
