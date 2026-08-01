import { SUPPORTED_MEETING_LANGUAGES } from '../../lib/meeting-languages.js'

export const createSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['source_channel_id'],
  properties: {
    source_channel_id: { type: 'string', minLength: 1 },
    title: { type: ['string', 'null'], minLength: 1, maxLength: 120 },
    description: { type: ['string', 'null'], minLength: 1, maxLength: 2000 },
    language: { type: 'string', enum: SUPPORTED_MEETING_LANGUAGES },
    scheduled_start_at: { type: ['string', 'null'], format: 'date-time' },
    scheduled_end_at: { type: ['string', 'null'], format: 'date-time' },
    initial_user_ids: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      minItems: 0
    }
  }
}

export const patchSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['action'],
  properties: {
    action: {
      type: 'string',
      enum: [
        'invite',
        'join',
        'end',
        'cancel',
        'reschedule',
        'decline',
        'set_title',
        'set_language',
        'create_invite_link',
        'revoke_invite_link',
        'generate_summary',
        'generate_transcript',
        'pause_transcription_recording',
        'resume_transcription_recording'
      ]
    },
    user_ids: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      minItems: 1
    },
    muted: { type: 'boolean' },
    deafened: { type: 'boolean' },
    reason: { type: ['string', 'null'], maxLength: 250 },
    title: { type: ['string', 'null'], minLength: 1, maxLength: 120 },
    description: { type: ['string', 'null'], minLength: 1, maxLength: 2000 },
    language: { type: 'string', enum: SUPPORTED_MEETING_LANGUAGES },
    scheduled_start_at: { type: ['string', 'null'], format: 'date-time' },
    scheduled_end_at: { type: ['string', 'null'], format: 'date-time' },
    expires_at: { type: ['string', 'null'], format: 'date-time' },
    link_id: { type: 'string', minLength: 1 }
  }
}
