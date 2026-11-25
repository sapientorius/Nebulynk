<template>
  <div class="meeting-invite-container" data-testid="meeting-invite-view">
    <n-card v-if="loadingInfo" style="max-width: 460px; width: 100%; text-align: center">
      <n-spin size="large" />
      <p style="margin-top: 16px; opacity: 0.6">{{ $t('meetingInvite.loading') }}</p>
    </n-card>

    <n-card v-else-if="error" style="max-width: 460px; width: 100%">
      <n-result status="error" :title="error.title" :description="error.description">
        <template v-if="error.retryable" #footer>
          <n-button @click="loadInviteInfo">{{ $t('meetingInvite.buttons.retry') }}</n-button>
        </template>
      </n-result>
    </n-card>

    <n-card v-else-if="invite" style="max-width: 460px; width: 100%">
      <template #header>
        <div style="text-align: center">
          <h2 style="margin: 0 0 4px">{{ invite.title || $t('meetingInvite.untitled') }}</h2>
          <p style="margin: 0; opacity: 0.7">{{ inviteStatusLabel }}</p>
        </div>
      </template>

      <n-space vertical :size="12">
        <n-alert v-if="invite.description" type="info">
          {{ invite.description }}
        </n-alert>

        <div class="meeting-invite-meta">
          <div v-if="invite.scheduled_start_at">
            <strong>{{ $t('meetingInvite.fields.starts') }}:</strong> {{ formattedStart }}
          </div>
          <div v-if="invite.join_not_before">
            <strong>{{ $t('meetingInvite.fields.joinNotBefore') }}:</strong> {{ formattedJoinWindow }}
          </div>
          <div v-if="invite.source_channel_name">
            <strong>{{ $t('meetingInvite.fields.context') }}:</strong> {{ invite.source_channel_name }}
          </div>
        </div>

        <n-form :model="form" @submit.prevent="acceptInvite">
          <n-form-item :label="$t('meetingInvite.fields.displayName')">
            <n-input
              v-model:value="form.displayName"
              :placeholder="$t('meetingInvite.placeholders.displayName')"
              :input-props="{ 'data-testid': 'meeting-invite-display-name' }"
              @keyup.enter="acceptInvite"
            />
          </n-form-item>

          <n-alert v-if="formError" type="error">
            {{ formError }}
          </n-alert>
        </n-form>

        <n-button
          type="primary"
          block
          :loading="submitting"
          data-testid="meeting-invite-submit"
          @click="acceptInvite"
        >
          {{ $t('meetingInvite.buttons.joinAsGuest') }}
        </n-button>
      </n-space>
    </n-card>
  </div>
</template>

<script>
import { useMeetingInviteStore, useMeetingsStore, useSessionStore } from '../stores/index.js'
import { restoreBrowserSession } from '../lib/api.js'
import { getApiErrorCode, translateApiError } from '../lib/api-error.js'
import { applyLocaleForUser } from '../lib/i18n.js'

async function canOpenMeeting(meetingId, isCurrent) {
  try {
    const meeting = await useMeetingsStore().get(meetingId, { isCurrent })
    if (!meeting && isCurrent()) throw new Error('Meeting access could not be verified')
    return !!meeting && meeting.content_access?.allowed !== false
  } catch (error) {
    if (error?.response?.status === 403) return false
    throw error
  }
}

export default {
  name: 'MeetingInviteView',
  data() {
    return {
      loadingInfo: true,
      invite: null,
      error: null,
      formError: null,
      submitting: false,
      routeGeneration: 0,
      form: {
        displayName: ''
      }
    }
  },
  computed: {
    meetingInviteStore() {
      return useMeetingInviteStore()
    },
    sessionStore() {
      return useSessionStore()
    },
    inviteToken() {
      return this.$route.params.token
    },
    inviteStatusLabel() {
      if (!this.invite?.status) return ''
      if (this.invite.status === 'scheduled') return this.$t('meetingInvite.status.scheduled')
      if (this.invite.status === 'active') return this.$t('meetingInvite.status.active')
      if (this.invite.status === 'ended') return this.$t('meetingInvite.status.ended')
      return this.invite.status
    },
    formattedStart() {
      if (!this.invite?.scheduled_start_at) return ''
      return new Date(this.invite.scheduled_start_at).toLocaleString()
    },
    formattedJoinWindow() {
      if (!this.invite?.join_not_before) return ''
      return new Date(this.invite.join_not_before).toLocaleString()
    }
  },
  watch: {
    inviteToken: {
      immediate: true,
      handler: 'loadInviteInfo'
    }
  },
  beforeUnmount() {
    this.routeGeneration++
  },
  methods: {
    isCurrentInvite(generation, token) {
      return this.routeGeneration === generation && this.inviteToken === token
    },
    async loadInviteInfo() {
      const token = this.inviteToken
      const generation = ++this.routeGeneration
      const isCurrent = () => this.isCurrentInvite(generation, token)
      this.loadingInfo = true
      this.invite = null
      this.error = null
      this.formError = null
      this.submitting = false

      try {
        const session = await restoreBrowserSession({
          silent: true,
          preserveSessionOnUnexpectedError: true
        }).catch((error) => {
          if (error?.response?.status === 401) return null
          throw error
        })
        if (!isCurrent()) return

        const user = session?.accessToken ? session.user : null
        if (user) applyLocaleForUser(user)
        const invite = await this.meetingInviteStore.loadInvite(token)
        if (!isCurrent()) return

        if (!user || user.account_type === 'guest') {
          this.form.displayName = user?.display_name || ''
          this.invite = invite
          return
        }

        const allowed = await canOpenMeeting(invite.meeting_id, isCurrent)
        if (!isCurrent()) return

        if (allowed) {
          await this.$router.replace({ name: 'Meeting', params: { meetingId: invite.meeting_id } })
        } else {
          this.error = {
            title: this.$t('meetingInvite.errors.accessDenied'),
            description: this.$t('meetingInvite.requestInvitation')
          }
        }
      } catch (error) {
        if (!isCurrent()) return
        const invalidLink = [400, 404].includes(error?.response?.status)
          && getApiErrorCode(error)?.startsWith('api.meeting_invite.')
        this.error = {
          title: translateApiError(error, 'meetingInvite.errors.loadFailed'),
          description: invalidLink ? this.$t('meetingInvite.invalidDescription') : undefined,
          retryable: !invalidLink
        }
      } finally {
        if (isCurrent()) this.loadingInfo = false
      }
    },
    async acceptInvite() {
      if (this.loadingInfo || !this.invite || this.submitting) return

      this.formError = null
      const displayName = this.form.displayName.trim()
      if (!displayName) {
        this.formError = this.$t('meetingInvite.errors.displayNameRequired')
        return
      }

      const token = this.inviteToken
      const generation = this.routeGeneration
      this.submitting = true
      try {
        const result = await this.meetingInviteStore.acceptInvite({ token, displayName })
        if (!this.isCurrentInvite(generation, token)) return
        await this.sessionStore.applyAuthenticationResult(result)
        if (!this.isCurrentInvite(generation, token)) return
        await this.$router.replace({ name: 'Meeting', params: { meetingId: result.meeting.id } })
      } catch (error) {
        if (this.isCurrentInvite(generation, token)) {
          this.formError = translateApiError(error, 'meetingInvite.errors.acceptFailed')
        }
      } finally {
        if (this.isCurrentInvite(generation, token)) this.submitting = false
      }
    }
  }
}
</script>

<style scoped>
.meeting-invite-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 24px;
}

.meeting-invite-meta {
  display: grid;
  gap: 8px;
}
</style>
