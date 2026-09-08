import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { NMenu } from 'naive-ui'
import SettingsView from '../../src/views/SettingsView.vue'
import { componentContext } from '../helpers/mount-component.js'
import { useSessionStore } from '../../src/stores/session.js'

vi.mock('@simplewebauthn/browser', () => ({ browserSupportsWebAuthn: vi.fn(async () => true), startRegistration: vi.fn(async () => ({ id: 'credential' })) }))
vi.mock('../../src/lib/api.js', async original => ({ ...await original(), getSelfRegistrationConfig: vi.fn(async () => ({ password_policy: { min_length: 8, min_types: 3 } })) }))
let context, session
beforeEach(async () => {
  context = await componentContext('/settings')
  session = useSessionStore()
  session.user = { id: 'alice', display_name: 'Alice', account_type: 'member' }
  vi.spyOn(session, 'init').mockResolvedValue(undefined)
  vi.spyOn(session, 'getTwoFactorStatus').mockResolvedValue({ enabled: false })
  vi.spyOn(session, 'getPasskeys').mockResolvedValue({ passkeys: [] })
})
async function render() {
  const wrapper = context.mount(SettingsView, { global: { stubs: { UserProfileCard: true, UserAccountMenu: true, VoiceSettingsContent: true, VideoSettingsContent: true, StatusPicker: true } } })
  await flushPromises()
  wrapper.findComponent(NMenu).vm.$emit('update:value', 'security')
  await flushPromises()
  return wrapper
}

it('validates password confirmation, sends the request and retains a draft across tab switches', async () => {
  const change = vi.spyOn(session, 'changePassword').mockResolvedValue({})
  const wrapper = await render()
  await wrapper.get('[data-testid=settings-current-password]').setValue('CurrentPass1!')
  await wrapper.get('[data-testid=settings-new-password]').setValue('NextPassw0rd!')
  await wrapper.get('[data-testid=settings-new-password-confirm]').setValue('WrongPassw0rd!')
  await wrapper.get('[data-testid=settings-save-security]').trigger('click')
  expect(change).not.toHaveBeenCalled()
  expect(wrapper.find('[data-testid=settings-security-error]').exists()).toBe(true)
  wrapper.findComponent(NMenu).vm.$emit('update:value', 'general')
  await flushPromises()
  wrapper.findComponent(NMenu).vm.$emit('update:value', 'security')
  await flushPromises()
  expect(wrapper.get('[data-testid=settings-current-password]').element.value).toBe('CurrentPass1!')
  await wrapper.get('[data-testid=settings-new-password-confirm]').setValue('NextPassw0rd!')
  await wrapper.get('[data-testid=settings-save-security]').trigger('click')
  await flushPromises()
  expect(change).toHaveBeenCalledWith({ currentPassword: 'CurrentPass1!', newPassword: 'NextPassw0rd!' })
  expect(wrapper.get('[data-testid=settings-current-password]').element.value).toBe('')
})

it('runs two-factor setup and confirmation and displays the returned recovery codes', async () => {
  vi.spyOn(session, 'beginTwoFactorSetup').mockResolvedValue({ manualKey: 'TESTKEY', otpauthUrl: 'otpauth://totp/test', qrSvg: '<svg></svg>' })
  const confirm = vi.spyOn(session, 'confirmTwoFactorSetup').mockResolvedValue({ recoveryCodes: ['recovery-one'], recoveryCodesRemaining: 1 })
  const wrapper = await render()
  await wrapper.get('[data-testid=settings-2fa-start-setup]').trigger('click')
  await flushPromises()
  await wrapper.get('[data-testid=settings-2fa-current-password]').setValue('CurrentPass1!')
  await wrapper.get('[data-testid=settings-2fa-code]').setValue('123456')
  await wrapper.get('[data-testid=settings-2fa-confirm-setup]').trigger('click')
  await flushPromises()
  expect(confirm).toHaveBeenCalledWith({ currentPassword: 'CurrentPass1!', code: '123456' })
  expect(wrapper.text()).toContain('recovery-one')
})

it('creates a passkey through the browser adapter and requires a password for removal', async () => {
  vi.spyOn(session, 'beginPasskeyRegistration').mockResolvedValue({ challengeId: 'challenge', options: {} })
  const verify = vi.spyOn(session, 'verifyPasskeyRegistration').mockResolvedValue({ passkey: { id: 'key', name: 'Laptop' } })
  const remove = vi.spyOn(session, 'deletePasskey').mockResolvedValue({})
  const wrapper = await render()
  await wrapper.get('[data-testid=settings-passkeys-start-setup]').trigger('click')
  await wrapper.get('[data-testid=settings-passkeys-current-password]').setValue('CurrentPass1!')
  await wrapper.get('[data-testid=settings-passkeys-name]').setValue('Laptop')
  await wrapper.get('[data-testid=settings-passkeys-confirm-setup]').trigger('click')
  await flushPromises()
  expect(verify).toHaveBeenCalledWith(expect.objectContaining({ challengeId: 'challenge', name: 'Laptop' }))
  await wrapper.get('[data-testid=settings-passkey-remove-key]').trigger('click')
  await wrapper.get('[data-testid=settings-passkeys-confirm-delete]').trigger('click')
  expect(remove).not.toHaveBeenCalled()
  await wrapper.get('[data-testid=settings-passkeys-delete-current-password]').setValue('CurrentPass1!')
  await wrapper.get('[data-testid=settings-passkeys-confirm-delete]').trigger('click')
  await flushPromises()
  expect(remove).toHaveBeenCalledWith('key', { currentPassword: 'CurrentPass1!' })
  expect(wrapper.find('[data-testid=settings-passkey-item]').exists()).toBe(false)
})
