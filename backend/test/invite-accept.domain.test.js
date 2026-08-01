import test from 'node:test'
import assert from 'node:assert/strict'
import { BadRequest, NotFound } from '@feathersjs/errors'
import { InviteAcceptDomainService } from '../src/domains/invite-accept/service.js'

function createDomainService({
  repositoryOverrides = {},
  usersServiceOverrides = {},
  now = () => new Date('2026-03-07T10:00:00.000Z')
} = {}) {
  const calls = {
    markInviteExpired: 0,
    deleteUser: [],
    createdUsers: [],
    addUserRole: [],
    markInviteAccepted: []
  }

  const txRepository = {
    async findRoleByName(name) {
      return { id: `role-${name}` }
    },
    async addUserRole(userId, roleId) {
      calls.addUserRole.push({ userId, roleId })
    },
    async markInviteAccepted(inviteId, acceptedBy, updatedAt) {
      calls.markInviteAccepted.push({ inviteId, acceptedBy, updatedAt })
    }
  }

  const repository = {
    async findInviteForLookup() {
      return {
        id: 'invite-1',
        email: 'test@example.com',
        status: 'pending',
        message: 'Willkommen',
        expires_at: '2026-03-10T10:00:00.000Z',
        created_at: '2026-03-01T10:00:00.000Z',
        invited_by_name: 'Admin'
      }
    },
    async getPlatformName() {
      return 'Nebulynk'
    },
    async getDefaultLocale() {
      return 'en'
    },
    async findPendingInvite() {
      return {
        id: 'invite-1',
        email: 'test@example.com',
        role_to_assign: 'platform:member',
        expires_at: '2026-03-10T10:00:00.000Z'
      }
    },
    async findUserByEmail() {
      return null
    },
    async markInviteExpired() {
      calls.markInviteExpired++
    },
    async deleteUser(userId) {
      calls.deleteUser.push(userId)
    },
    async transaction(runInTransaction) {
      await runInTransaction(txRepository)
    },
    ...repositoryOverrides
  }

  const usersService = {
    async create(data) {
      calls.createdUsers.push(data)
      return {
        id: 'user-1',
        email: data.email,
        display_name: data.display_name
      }
    },
    ...usersServiceOverrides
  }

  const service = new InviteAcceptDomainService({ repository, usersService, now })
  return { service, calls }
}

test('invite-accept policy: find requires token', async () => {
  const { service } = createDomainService()

  await assert.rejects(service.findInviteByToken(''), BadRequest)
})

test('invite-accept behavior: find returns invite metadata and expiry state', async () => {
  const { service } = createDomainService()

  const result = await service.findInviteByToken('token-1')

  assert.equal(result.platform_name, 'Nebulynk')
  assert.equal(result.is_expired, false)
})

test('invite-accept behavior: create rejects unknown pending invite', async () => {
  const { service } = createDomainService({
    repositoryOverrides: {
      async findPendingInvite() {
        return null
      }
    }
  })

  await assert.rejects(
    service.acceptInvite({ token: 'missing', displayName: 'Test User', password: 'x' }),
    NotFound
  )
})

test('invite-accept behavior: expired invite is marked and rejected', async () => {
  const { service, calls } = createDomainService({
    repositoryOverrides: {
      async findPendingInvite() {
        return {
          id: 'invite-1',
          email: 'test@example.com',
          role_to_assign: 'platform:member',
          expires_at: '2026-03-01T10:00:00.000Z'
        }
      }
    }
  })

  await assert.rejects(
    service.acceptInvite({ token: 'expired', displayName: 'Test User', password: 'x' }),
    BadRequest
  )
  assert.equal(calls.markInviteExpired, 1)
})

test('invite-accept behavior: create rejects existing user email', async () => {
  const { service } = createDomainService({
    repositoryOverrides: {
      async findUserByEmail() {
        return { id: 'existing-user' }
      }
    }
  })

  await assert.rejects(
    service.acceptInvite({ token: 'token-1', displayName: 'Test User', password: 'x' }),
    BadRequest
  )
})

test('invite-accept behavior: successful accept assigns role and updates invite', async () => {
  const { service, calls } = createDomainService()

  const result = await service.acceptInvite({
    token: 'token-1',
    displayName: '  Test User  ',
    password: 'strong-password'
  })

  assert.equal(result.success, true)
  assert.equal(result.user.id, 'user-1')
  assert.equal(result.user.display_name, 'Test User')
  assert.equal(calls.createdUsers[0].preferred_locale, 'en')
  assert.deepEqual(calls.addUserRole, [{ userId: 'user-1', roleId: 'role-platform:member' }])
  assert.equal(calls.markInviteAccepted.length, 1)
})

test('invite-accept behavior: transaction failure triggers compensation delete', async () => {
  const { service, calls } = createDomainService({
    repositoryOverrides: {
      async transaction() {
        throw new Error('transaction failed')
      }
    }
  })

  await assert.rejects(
    service.acceptInvite({ token: 'token-1', displayName: 'Test User', password: 'x' }),
    BadRequest
  )
  assert.deepEqual(calls.deleteUser, ['user-1'])
})

test('invite-accept behavior: user locale follows platform default locale', async () => {
  const { service, calls } = createDomainService({
    repositoryOverrides: {
      async getDefaultLocale() {
        return 'de'
      }
    }
  })

  await service.acceptInvite({
    token: 'token-1',
    displayName: 'Test User',
    password: 'strong-password'
  })

  assert.equal(calls.createdUsers[0].preferred_locale, 'de')
})
