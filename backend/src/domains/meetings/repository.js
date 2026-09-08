// SQL operations accept the owning use case's transaction; none opens a nested transaction.
export function createMeetingRepository(db) {
  return {
    db,
    transaction: (...args) => db.transaction(...args),
  createFindChannelMembers({ sourceChannelId, userId }) {
    return db('channel_members')
        .where('channel_id', sourceChannelId)
        .whereNot('user_id', userId)
        .select('user_id')
  },

  createLockChannels({ trx, sourceChannelId }) {
    return trx('channels')
        .where('id', sourceChannelId)
        .forUpdate()
        .first()
  },

  createFindMeetings({ trx, sourceChannelId }) {
    return trx('meetings')
          .where({
            source_channel_id: sourceChannelId,
            status: 'active'
          })
          .orderBy('started_at', 'desc')
          .first()
  },

  createInsertChannels({ trx, chatChannelId, meetingId, title, userId, nowIso }) {
    return trx('channels').insert({
        id: chatChannelId,
        name: `meeting-${meetingId}`,
        topic: title || null,
        type: 'private',
        purpose: 'meeting',
        is_voice: true,
        created_by: userId,
        created_at: nowIso,
        updated_at: nowIso
      })
  },

  createInsertMeetings({ trx, meetingId, title, requestedDescription, meetingLanguage, initialStatus, sourceChannelId, chatChannelId, userId, scheduledStartAt, scheduledEndAt, joinNotBefore, isScheduledMeeting, nowIso }) {
    return trx('meetings').insert({
        id: meetingId,
        title: title || null,
        description: requestedDescription || null,
        language: meetingLanguage,
        status: initialStatus,
        visibility: 'invitees',
        source_channel_id: sourceChannelId,
        chat_channel_id: chatChannelId,
        host_user_id: userId,
        scheduled_start_at: scheduledStartAt,
        scheduled_end_at: scheduledEndAt,
        join_not_before: joinNotBefore,
        started_at: isScheduledMeeting ? null : nowIso,
        created_at: nowIso,
        updated_at: nowIso
      })
  },

  createInsertChannelMembers({ trx, channelMemberRows }) {
    return trx('channel_members').insert(channelMemberRows)
  },

  createInsertMeetingParticipants({ trx, participantRows }) {
    return trx('meeting_participants').insert(participantRows)
  },

  createInsertNotifications({ trx, notificationRows }) {
    return trx('notifications').insert(notificationRows)
  },

  inviteFindMeetingParticipants({ trx, id, userIds }) {
    return trx('meeting_participants')
        .where('meeting_id', id)
        .whereIn('user_id', userIds)
        .select('user_id', 'invite_status')
  },

  inviteUpdateMeetingParticipants({ trx, id, reInvites, nowIso }) {
    return trx('meeting_participants')
          .where('meeting_id', id)
          .whereIn('user_id', reInvites)
          .update({
            invite_status: 'invited',
            invited_at: nowIso,
            left_at: null,
            updated_at: nowIso
          })
  },

  inviteInsertMeetingParticipants({ trx, participantRows }) {
    return trx('meeting_participants').insert(participantRows)
  },

  inviteInsertChannelMembers({ trx, channelMemberRows }) {
    return trx('channel_members')
        .insert(channelMemberRows)
        .onConflict(['channel_id', 'user_id'])
        .ignore()
  },

  inviteInsertNotifications({ trx, notificationRows }) {
    return trx('notifications').insert(notificationRows)
  },

  joinInsertMeetingParticipants({ trx, participant }) {
    return trx('meeting_participants').insert(participant)
  },

  joinUpdateMeetingParticipants({ trx, participant, nowIso }) {
    return trx('meeting_participants')
          .where('id', participant.id)
          .update({
            invite_status: 'joined',
            joined_at: participant.joined_at || nowIso,
            left_at: null,
            updated_at: nowIso
          })
  },

  joinUpdateMeetings({ trx, id, meeting, nowIso }) {
    return trx('meetings')
          .where('id', id)
          .update({
            status: 'active',
            started_at: meeting.started_at || nowIso,
            updated_at: nowIso
          })
  },

  joinInsertChannelMembers({ trx, createId, meeting, user, nowIso }) {
    return trx('channel_members')
        .insert({
          id: createId(),
          channel_id: meeting.chat_channel_id,
          user_id: user.id,
          role: 'member',
          created_at: nowIso,
          updated_at: nowIso
        })
        .onConflict(['channel_id', 'user_id'])
        .ignore()
  },

  declineUpdateMeetingParticipants({ participant, nowIso }) {
    return db('meeting_participants')
      .where('id', participant.id)
      .update({
        invite_status: 'declined',
        left_at: nowIso,
        updated_at: nowIso
      })
  },

  setTitleUpdateMeetings({ trx, id, nextTitle, nowIso }) {
    return trx('meetings')
        .where('id', id)
        .update({
          title: nextTitle,
          updated_at: nowIso
        })
  },

  setTitleUpdateChannels({ trx, meeting, nextTitle, nowIso }) {
    return trx('channels')
        .where('id', meeting.chat_channel_id)
        .update({
          topic: nextTitle,
          updated_at: nowIso
        })
  },

  setTitleFindChannels({ meeting }) {
    return db('channels').where('id', meeting.chat_channel_id).first()
  },

  rescheduleUpdateMeetings({ id, scheduledStartAt, scheduledEndAt, buildDefaultJoinWindow, description, language, getNow }) {
    return db('meetings')
      .where('id', id)
      .update({
        scheduled_start_at: scheduledStartAt,
        scheduled_end_at: scheduledEndAt,
        join_not_before: buildDefaultJoinWindow(scheduledStartAt),
        description: description || null,
        language,
        updated_at: getNow().toISOString()
      })
  },

  setLanguageUpdateMeetings({ id, nextLanguage, getNow }) {
    return db('meetings')
      .where('id', id)
      .update({
        language: nextLanguage,
        updated_at: getNow().toISOString()
      })
  },

  createInviteLinkUpdateMeetingInviteLinks({ trx, id, nowIso }) {
    return trx('meeting_invite_links')
        .where('meeting_id', id)
        .whereNull('revoked_at')
        .update({
          revoked_at: nowIso,
          updated_at: nowIso
        })
  },

  createInviteLinkInsertMeetingInviteLinks({ trx, linkId, id, tokenHash, user, expiresAt, nowIso }) {
    return trx('meeting_invite_links').insert({
        id: linkId,
        meeting_id: id,
        token_hash: tokenHash,
        created_by: user.id,
        expires_at: expiresAt,
        created_at: nowIso,
        updated_at: nowIso
      })
  },

  revokeInviteLinkFindMeetingInviteLinks({ id }) {
    return db('meeting_invite_links')
      .where('meeting_id', id)
      .whereNull('revoked_at')
  },

  endUpdateMeetings({ trx, id, nowIso, user }) {
    return trx('meetings')
        .where('id', id)
        .update({
          status: 'ended',
          ended_at: nowIso,
          ended_by: user.id,
          updated_at: nowIso
        })
  },

  endUpdateChannels({ trx, meeting, nowIso, user }) {
    return trx('channels')
        .where('id', meeting.chat_channel_id)
        .update({
          is_archived: true,
          archived_at: nowIso,
          archived_by: user.id,
          updated_at: nowIso
        })
  },

  endUpdateMeetingParticipants({ trx, id, nowIso }) {
    return trx('meeting_participants')
        .where('meeting_id', id)
        .where('invite_status', 'joined')
        .update({
          invite_status: 'left',
          left_at: nowIso,
          updated_at: nowIso
        })
  },

  endUpdateMeetingRecordingPauses({ trx, id, user, nowIso }) {
    return trx('meeting_recording_pauses')
        .where({
          meeting_id: id,
          resumed_at: null
        })
        .update({
          resumed_by: user.id,
          resumed_at: nowIso,
          updated_at: nowIso
        })
  },

  endDeleteVoiceParticipants({ meeting }) {
    return db('voice_participants').where('channel_id', meeting.chat_channel_id).del()
  },

  endFindChannels({ meeting }) {
    return db('channels').where('id', meeting.chat_channel_id).first()
  },

  cancelUpdateMeetings({ trx, id, nowIso }) {
    return trx('meetings')
        .where('id', id)
        .update({
          status: 'cancelled',
          cancelled_at: nowIso,
          updated_at: nowIso
        })
  },

  cancelUpdateChannels({ trx, meeting, nowIso, user }) {
    return trx('channels')
        .where('id', meeting.chat_channel_id)
        .update({
          is_archived: true,
          archived_at: nowIso,
          archived_by: user.id,
          updated_at: nowIso
        })
  },

  cancelUpdateMeetingInviteLinks({ trx, id, nowIso }) {
    return trx('meeting_invite_links')
        .where('meeting_id', id)
        .whereNull('revoked_at')
        .update({
          revoked_at: nowIso,
          updated_at: nowIso
        })
  },

  cancelFindChannels({ meeting }) {
    return db('channels').where('id', meeting.chat_channel_id).first()
  },

  baseMeetingQueryFindMeetings() {
    return db('meetings')
      .leftJoin('channels as source_channel', 'source_channel.id', 'meetings.source_channel_id')
      .leftJoin('channels as chat_channel', 'chat_channel.id', 'meetings.chat_channel_id')
      .select(
        'meetings.*',
        'source_channel.name as source_channel_name',
        'source_channel.type as source_channel_type',
        'source_channel.meeting_history_access as source_channel_meeting_history_access',
        'chat_channel.name as chat_channel_name',
        'chat_channel.purpose as chat_channel_purpose',
        'chat_channel.is_voice as chat_channel_is_voice',
        'chat_channel.is_archived as chat_channel_is_archived'
      )
  },

  normalizeOverdueScheduledMeetingsFindMeetings({ nowIso }) {
    return db('meetings')
      .where({ status: 'scheduled' })
      .whereNotNull('scheduled_end_at')
      .where('scheduled_end_at', '<=', nowIso)
  },

  getMeetingParticipantFindMeetingParticipants({ meetingId, userId }) {
    return db('meeting_participants')
      .where({
        meeting_id: meetingId,
        user_id: userId
      })
      .first()
  },

  findChannelByIdFindChannels({ channelId }) {
    return db('channels').where('id', channelId).first()
  },

  findChannelMembershipFindChannelMembers({ channelId, userId }) {
    return db('channel_members')
      .where({
        channel_id: channelId,
        user_id: userId
      })
      .first()
  },

  findExistingUserIdsFindUsers({ userIds }) {
    return db('users')
      .whereIn('id', userIds)
      .select('id')
  },

  resolveDefaultMeetingLanguageFindPlatformSettings() {
    return db('platform_settings')
      .where('key', 'default_meeting_language')
      .first()
  },

  resolveDefaultMeetingLanguageFindPlatformSettings2() {
    return db('platform_settings')
      .where('key', 'default_locale')
      .first()
  }
  }
}
