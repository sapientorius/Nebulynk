import { expect, it, vi } from 'vitest'
import { useAdminStore } from '../../src/stores/admin.js'
import api, { beginPrimaryAdminTransferPasskeyOptions, transferPrimaryAdmin } from '../../src/lib/api.js'

vi.mock('../../src/lib/api.js', async (original) => ({
  ...await original(), default: { get: vi.fn(async () => ({ data: [] })) },
  beginPrimaryAdminTransferPasskeyOptions: vi.fn(async () => ({ challenge: 'challenge' })),
  transferPrimaryAdmin: vi.fn(async () => ({ previous_primary_admin_id: 'alice', primary_admin_id: 'bob' }))
}))

it('exposes the admin transfer actions used by UserRoleManager and refreshes role data after success', async () => {
  const store = useAdminStore()
  expect(await store.beginPrimaryAdminTransferPasskeyOptions()).toEqual({ challenge: 'challenge' })
  expect(beginPrimaryAdminTransferPasskeyOptions).toHaveBeenCalledOnce()
  const payload = { targetUserId: 'bob', confirmation: 'TRANSFER', reauth: { password: 'test-only' } }
  expect(await store.transferPrimaryAdmin(payload)).toMatchObject({ primary_admin_id: 'bob' })
  expect(transferPrimaryAdmin).toHaveBeenCalledWith(payload)
  expect(api.get).toHaveBeenCalledWith('/users', expect.any(Object))
  expect(api.get).toHaveBeenCalledWith('/user-roles', expect.any(Object))
})

it('propagates rejected transfers without changing cached users', async () => {
  const store = useAdminStore()
  store.users = [{ id: 'alice', is_primary_admin: true }]
  transferPrimaryAdmin.mockRejectedValueOnce(new Error('denied'))
  await expect(store.transferPrimaryAdmin({ targetUserId: 'bob' })).rejects.toThrow('denied')
  expect(store.users).toEqual([{ id: 'alice', is_primary_admin: true }])
  expect(api.get).not.toHaveBeenCalled()
})
