<template>
  <div class="meeting-invite-container" data-testid="meeting-invite-view">
    <n-card v-if="loadingInfo" style="max-width: 460px; width: 100%; text-align: center">
      <n-spin size="large" />
      <p style="margin-top: 16px; opacity: 0.6">{{ $t('meetingInvite.loading') }}</p>
    </n-card>

    <n-card v-else-if="error" style="max-width: 460px; width: 100%">
      <n-result status="error" :title="error" :description="$t('meetingInvite.invalidDescription')" />
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

        <n-form v-if="!isMemberSession" :model="form" @submit.prevent="acceptInvite">
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
          {{ isMemberSession ? $t('meetingInvite.buttons.openMeeting') : $t('meetingInvite.buttons.joinAsGuest') }}
        </n-button>
      </n-space>
    </n-card>
  </div>
</template>

<script>
import { useMeetingInviteStore, useSessionStore } from '../stores/index.js'
import { translateApiError } from '../lib/api-error.js'

export default {
  name: 'MeetingInviteView',
  data() {
    return {
      loadingInfo: true,
      invite: null,
      error: null,
      formError: null,
      submitting: false,
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
    isMemberSession() {
      return !!this.sessionStore.user && this.sessionStore.user.account_type !== 'guest'
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
  async created() {
    if (this.sessionStore.user?.display_name) {
      this.form.displayName = this.sessionStore.user.display_name
    }
    await this.loadInviteInfo()
  },
  methods: {
    async loadInviteInfo() {
      try {
        this.invite = await this.meetingInviteStore.loadInvite(this.$route.params.token)
      } catch (error) {
        this.error = translateApiError(error, 'meetingInvite.errors.loadFailed')
      } finally {
        this.loadingInfo = false
      }
    },
    async acceptInvite() {
      if (this.isMemberSession) {
        await this.$router.replace(`/meetings/${this.invite.meeting_id}`).catch(() => {})
        return
      }

      this.formError = null
      if (!this.form.displayName.trim()) {
        this.formError = this.$t('meetingInvite.errors.displayNameRequired')
        return
      }

      this.submitting = true
      try {
        const result = await this.meetingInviteStore.acceptInvite({
          token: this.$route.params.token,
          displayName: this.form.displayName.trim()
        })
        await this.sessionStore.applyAuthenticationResult(result)
        await this.$router.replace(`/meetings/${result.meeting.id}`).catch(() => {})
      } catch (error) {
        this.formError = translateApiError(error, 'meetingInvite.errors.acceptFailed')
      } finally {
        this.submitting = false
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
