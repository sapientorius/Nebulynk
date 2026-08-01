import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('MeetingInviteView', () => {
  it('loads invite metadata and supports guest acceptance into a meeting session', () => {
    const source = readFileSync(resolve('src/views/MeetingInviteView.vue'), 'utf8')

    expect(source).toContain("name: 'MeetingInviteView'")
    expect(source).toContain('this.meetingInviteStore.loadInvite(this.$route.params.token)')
    expect(source).toContain('this.meetingInviteStore.acceptInvite({')
    expect(source).toContain('displayName: this.form.displayName.trim()')
    expect(source).toContain('this.sessionStore.applyAuthenticationResult(result)')
    expect(source).toContain('this.$router.replace(`/meetings/${result.meeting.id}`)')
  })

  it('lets signed-in members open the meeting directly and validates guest display names', () => {
    const source = readFileSync(resolve('src/views/MeetingInviteView.vue'), 'utf8')

    expect(source).toContain("this.$router.replace(`/meetings/${this.invite.meeting_id}`)")
    expect(source).toContain("this.formError = this.$t('meetingInvite.errors.displayNameRequired')")
    expect(source).toContain("return !!this.sessionStore.user && this.sessionStore.user.account_type !== 'guest'")
    expect(source).toContain("this.form.displayName = this.sessionStore.user.display_name")
  })
})
