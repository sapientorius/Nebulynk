import { users } from './users/users.js'
import { platform } from './platform/platform.js'
import { channels } from './channels/channels.js'
import { channelMembers } from './channel-members/channel-members.js'
import { channelReadState } from './channel-read-state/channel-read-state.js'
import { messageSearch } from './message-search/message-search.js'
import { search } from './search/search.js'
import { messages } from './messages/messages.js'
import { roles } from './roles/roles.js'
import { permissions } from './permissions/permissions.js'
import { rolePermissions } from './role-permissions/role-permissions.js'
import { userRoles } from './user-roles/user-roles.js'
import { myPermissions } from './my-permissions/my-permissions.js'
import { invites } from './invites/invites.js'
import { inviteAccept } from './invite-accept/invite-accept.js'
import { meetingInvite } from './meeting-invite/meeting-invite.js'
import { presence } from './presence/presence.js'
import { files } from './files/files.js'
import { reactions } from './reactions/reactions.js'
import { mentions } from './mentions/mentions.js'
import { pinnedMessages } from './pinned-messages/pinned-messages.js'
import { gifs } from './gifs/gifs.js'
import { unreadCounts } from './unread-counts/unread-counts.js'
import { notifications } from './notifications/notifications.js'
import { messageReminders } from './message-reminders/message-reminders.js'
import { pushSubscriptions } from './push-subscriptions/push-subscriptions.js'
import { dms } from './dms/dms.js'
import { voice } from './voice/voice.js'
import { meetings } from './meetings/meetings.js'
import { meetingQuestions } from './meeting-questions/meeting-questions.js'
import { voiceMessageArtifacts } from './voice-message-artifacts/voice-message-artifacts.js'
import { messageSummaries } from './message-summaries/message-summaries.js'
import { aiProviderInstances } from './ai-provider-instances/ai-provider-instances.js'
import { aiFunctionConfigs } from './ai-function-configs/ai-function-configs.js'
import { aiProviderModels } from './ai-provider-models/ai-provider-models.js'
import { smtpSettings } from './smtp-settings/smtp-settings.js'
import { passwordReset } from './password-reset/password-reset.js'
import { passwordChange } from './password-change/password-change.js'
import { videoBackgrounds } from './video-backgrounds/video-backgrounds.js'

export const services = (app) => {
  app.configure(users)
  app.configure(platform)
  app.configure(channels)
  app.configure(channelMembers)
  app.configure(channelReadState)
  app.configure(messageSearch)
  app.configure(search)
  app.configure(messages)
  app.configure(roles)
  app.configure(permissions)
  app.configure(rolePermissions)
  app.configure(userRoles)
  app.configure(myPermissions)
  app.configure(invites)
  app.configure(inviteAccept)
  app.configure(meetingInvite)
  app.configure(presence)
  app.configure(files)
  app.configure(reactions)
  app.configure(mentions)
  app.configure(pinnedMessages)
  app.configure(gifs)
  app.configure(unreadCounts)
  app.configure(notifications)
  app.configure(messageReminders)
  app.configure(pushSubscriptions)
  app.configure(dms)
  app.configure(voice)
  app.configure(meetings)
  app.configure(meetingQuestions)
  app.configure(voiceMessageArtifacts)
  app.configure(messageSummaries)
  app.configure(aiProviderInstances)
  app.configure(aiFunctionConfigs)
  app.configure(aiProviderModels)
  app.configure(videoBackgrounds)
  app.configure(smtpSettings)
  app.configure(passwordReset)
  app.configure(passwordChange)
}
