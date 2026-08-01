import { badRequest } from '../../lib/errors.js'
import {
  assertTokenProvided,
  assertInviteForLookup,
  assertPendingInvite,
  isInviteExpired,
  assertEmailAvailable,
  inviteAcceptanceFailedError
} from './policy.js'
import { DEFAULT_LOCALE, normalizeLocale } from '../../lib/locales.js'

export class InviteAcceptDomainService {
  constructor({ repository, usersService, now = () => new Date() }) {
    this.repository = repository
    this.usersService = usersService
    this.now = now
  }

  async findInviteByToken(token) {
    assertTokenProvided(token)

    const invite = await this.repository.findInviteForLookup(token)
    assertInviteForLookup(invite)

    return {
      ...invite,
      platform_name: await this.repository.getPlatformName(),
      is_expired: isInviteExpired(invite, this.now())
    }
  }

  async acceptInvite({ token, displayName, password }) {
    const invite = await this.repository.findPendingInvite(token)
    assertPendingInvite(invite)

    const now = this.now()
    const nowIso = now.toISOString()

    if (isInviteExpired(invite, now)) {
      await this.repository.markInviteExpired(invite.id, nowIso)
      throw badRequest('api.invite_accept.invite_expired', {}, 'Einladung ist abgelaufen')
    }

    const existingUser = await this.repository.findUserByEmail(invite.email)
    assertEmailAvailable(existingUser)
    const defaultLocale = normalizeLocale(await this.repository.getDefaultLocale(), DEFAULT_LOCALE)

    const newUser = await this.usersService.create({
      email: invite.email,
      password,
      display_name: displayName.trim(),
      preferred_locale: defaultLocale,
      is_admin: false,
      is_verified: true
    })

    try {
      await this.repository.transaction(async (trxRepository) => {
        if (invite.role_to_assign) {
          const role = await trxRepository.findRoleByName(invite.role_to_assign)
          if (role) {
            await trxRepository.addUserRole(newUser.id, role.id)
          }
        }

        await trxRepository.markInviteAccepted(invite.id, newUser.id, nowIso)
      })
    } catch {
      await this.repository.deleteUser(newUser.id)
      throw inviteAcceptanceFailedError()
    }

    return {
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        display_name: newUser.display_name
      }
    }
  }
}
