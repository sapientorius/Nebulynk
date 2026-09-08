import { authenticate } from '@feathersjs/authentication'
import { createId } from '@paralleldrive/cuid2'
import { validate } from '../../schemas/validators.js'
import { badRequest } from '../../lib/errors.js'
import { createSchema, patchSchema } from './meetings.schema.js'
import { MeetingArtifactsDomainService } from '../../domains/meetings/artifacts.js'
import { MeetingRecordingControlDomainService } from '../../domains/meetings/recording-control.js'
import { autoEndOverdueScheduledMeeting } from './overdue-scheduled.js'
import { createMeetingRepository } from '../../domains/meetings/repository.js'
import { createMeetingIntegrations } from '../../domains/meetings/integrations.js'
import * as join from '../../domains/meetings/join.js'
import * as creation from '../../domains/meetings/creation.js'
import * as invitations from '../../domains/meetings/invitations.js'
import * as metadata from '../../domains/meetings/metadata.js'
import * as completion from '../../domains/meetings/completion.js'
import * as artifactActions from '../../domains/meetings/artifact-actions.js'
import * as readService from '../../domains/meetings/read-service.js'
import * as accessService from '../../domains/meetings/access-service.js'
import * as integrations from '../../domains/meetings/integrations.js'

export class MeetingsService {
  constructor(options) {
    this.options = options
    this.artifactDomainService = options.artifactDomainService || new MeetingArtifactsDomainService({ db: options.Model, app: options.app })
    this.recordingControlDomainService = options.recordingControlDomainService || new MeetingRecordingControlDomainService({ db: options.Model, app: options.app })
    this.autoEndOverdueScheduledMeeting = options.autoEndOverdueScheduledMeeting || autoEndOverdueScheduledMeeting
    this.repository = options.repository || createMeetingRepository(options.Model)
    this.integrations = createMeetingIntegrations(options.app, options.integrations)
    const service = this
    this.dependencies = {
      repository: this.repository,
      get artifacts() { return service.artifactDomainService },
      get recordingControl() { return service.recordingControlDomainService },
      normalizeOverdue: (...args) => this.autoEndOverdueScheduledMeeting(...args),
      getNow: options.now || (() => new Date()),
      createId: options.createId || createId,
      artifactActions: {
        generateSummary: (...args) => this.generateSummary(...args),
        generateTranscript: (...args) => this.generateTranscript(...args),
        pauseTranscriptionRecording: (...args) => this.pauseTranscriptionRecording(...args),
        resumeTranscriptionRecording: (...args) => this.resumeTranscriptionRecording(...args),
        _assertCanControlTranscriptionRecording: (...args) => this._assertCanControlTranscriptionRecording(...args),
        _startRecordingsForConnectedMeetingParticipants: (...args) => this._startRecordingsForConnectedMeetingParticipants(...args),
        _emitRecordingStateUpdated: (...args) => this._emitRecordingStateUpdated(...args)
      },
      reads: {
        find: (...args) => this.find(...args),
        get: (...args) => this.get(...args),
        _baseMeetingQuery: (...args) => this._baseMeetingQuery(...args),
        _getMeetingOrThrow: (...args) => this._getMeetingOrThrow(...args),
        _getNormalizedMeetingOrThrow: (...args) => this._getNormalizedMeetingOrThrow(...args),
        _maybeNormalizeOverdueScheduledMeeting: (...args) => this._maybeNormalizeOverdueScheduledMeeting(...args),
        _normalizeOverdueScheduledMeetings: (...args) => this._normalizeOverdueScheduledMeetings(...args),
        _resolveMeetingContentAccess: (...args) => this._resolveMeetingContentAccess(...args),
        _getMeetingParticipant: (...args) => this._getMeetingParticipant(...args),
        _findChannelById: (...args) => this._findChannelById(...args),
        _findChannelMembership: (...args) => this._findChannelMembership(...args),
        _findExistingUserIds: (...args) => this._findExistingUserIds(...args),
        _normalizeMeetingLanguageInput: (...args) => this._normalizeMeetingLanguageInput(...args),
        _resolveDefaultMeetingLanguage: (...args) => this._resolveDefaultMeetingLanguage(...args),
        _normalizeLabel: (...args) => this._normalizeLabel(...args),
        _isTechnicalDmSourceName: (...args) => this._isTechnicalDmSourceName(...args),
        _isTechnicalGroupSourceName: (...args) => this._isTechnicalGroupSourceName(...args),
        _toUniqueSortedDisplayNames: (...args) => this._toUniqueSortedDisplayNames(...args),
        _formatCompactGroupDisplayName: (...args) => this._formatCompactGroupDisplayName(...args),
        _resolveSourceChannelDisplayName: (...args) => this._resolveSourceChannelDisplayName(...args),
        _buildSourceChannelDisplayNameIndex: (...args) => this._buildSourceChannelDisplayNameIndex(...args),
        _buildMeetingSummary: (...args) => this._buildMeetingSummary(...args),
        _serializeMeetings: (...args) => this._serializeMeetings(...args),
        _enrichMeetingsWithDetails: (...args) => this._enrichMeetingsWithDetails(...args),
        _buildTranscriptionRecordingStateIndex: (...args) => this._buildTranscriptionRecordingStateIndex(...args)
      },
      authorization: {
        _assertCanAccessMeeting: (...args) => this._assertCanAccessMeeting(...args),
        _assertCanUseSourceChannel: (...args) => this._assertCanUseSourceChannel(...args),
        _assertCanReadSourceChannel: (...args) => this._assertCanReadSourceChannel(...args),
        _assertCanInviteToMeeting: (...args) => this._assertCanInviteToMeeting(...args),
        _assertUsersExist: (...args) => this._assertUsersExist(...args)
      },
      effects: {
        ...this.integrations,
        _createSourceMessage: (...args) => this._createSourceMessage(...args),
        _joinConnectionsToChannel: (...args) => this._joinConnectionsToChannel(...args),
        _emitNotificationEvents: (...args) => this._emitNotificationEvents(...args)
      },
    }
  }

  get db() { return this.options.Model }
  get app() { return this.options.app }

  async find(...args) {
    return readService.find(this.dependencies, ...args)
  }

  async get(...args) {
    return readService.get(this.dependencies, ...args)
  }

  async create(...args) {
    return creation.create(this.dependencies, ...args)
  }

  async patch(id, data, params) {
    if (!id) {
      throw badRequest('api.meetings.meeting_id_required', {}, 'Meeting-ID ist erforderlich')
    }

    const action = data?.action
    if (action === 'invite') {
      if (!Array.isArray(data.user_ids) || data.user_ids.length === 0) {
        throw badRequest('api.meetings.invite_user_ids_required', {}, 'user_ids ist fuer invite erforderlich')
      }
      return this.invite(id, data, params)
    }

    if (action === 'join') {
      return this.join(id, data, params)
    }

    if (action === 'end') {
      return this.end(id, data, params)
    }

    if (action === 'cancel') {
      return this.cancel(id, data, params)
    }

    if (action === 'reschedule') {
      return this.reschedule(id, data, params)
    }

    if (action === 'decline') {
      return this.decline(id, data, params)
    }

    if (action === 'set_title') {
      const hasTitle = Object.prototype.hasOwnProperty.call(data || {}, 'title')
      if (!hasTitle) {
        throw badRequest('api.meetings.set_title_title_required', {}, 'title ist fuer set_title erforderlich')
      }
      return this.setTitle(id, data, params)
    }

    if (action === 'set_language') {
      const hasLanguage = Object.prototype.hasOwnProperty.call(data || {}, 'language')
      if (!hasLanguage) {
        throw badRequest('api.meetings.set_language_language_required', {}, 'language ist fuer set_language erforderlich')
      }
      return this.setLanguage(id, data, params)
    }

    if (action === 'create_invite_link') {
      return this.createInviteLink(id, data, params)
    }

    if (action === 'revoke_invite_link') {
      return this.revokeInviteLink(id, data, params)
    }

    if (action === 'generate_summary') {
      return this.generateSummary(id, data, params)
    }

    if (action === 'generate_transcript') {
      return this.generateTranscript(id, data, params)
    }

    if (action === 'pause_transcription_recording') {
      return this.pauseTranscriptionRecording(id, data, params)
    }

    if (action === 'resume_transcription_recording') {
      return this.resumeTranscriptionRecording(id, data, params)
    }

    throw badRequest(
      'api.meetings.unknown_action',
      { action: action || null },
      'Unbekannte Meeting-Action'
    )
  }

  async invite(...args) {
    return invitations.invite(this.dependencies, ...args)
  }

  async join(...args) {
    return join.join(this.dependencies, ...args)
  }

  async decline(...args) {
    return invitations.decline(this.dependencies, ...args)
  }

  async setTitle(...args) {
    return metadata.setTitle(this.dependencies, ...args)
  }

  async generateSummary(...args) {
    return artifactActions.generateSummary(this.dependencies, ...args)
  }

  async reschedule(...args) {
    return metadata.reschedule(this.dependencies, ...args)
  }

  async setLanguage(...args) {
    return metadata.setLanguage(this.dependencies, ...args)
  }

  async createInviteLink(...args) {
    return invitations.createInviteLink(this.dependencies, ...args)
  }

  async revokeInviteLink(...args) {
    return invitations.revokeInviteLink(this.dependencies, ...args)
  }

  async generateTranscript(...args) {
    return artifactActions.generateTranscript(this.dependencies, ...args)
  }

  async pauseTranscriptionRecording(...args) {
    return artifactActions.pauseTranscriptionRecording(this.dependencies, ...args)
  }

  async resumeTranscriptionRecording(...args) {
    return artifactActions.resumeTranscriptionRecording(this.dependencies, ...args)
  }

  async end(...args) {
    return completion.end(this.dependencies, ...args)
  }

  async cancel(...args) {
    return completion.cancel(this.dependencies, ...args)
  }

  _baseMeetingQuery(...args) {
    return readService._baseMeetingQuery(this.dependencies, ...args)
  }

  async _getMeetingOrThrow(...args) {
    return readService._getMeetingOrThrow(this.dependencies, ...args)
  }

  async _getNormalizedMeetingOrThrow(...args) {
    return readService._getNormalizedMeetingOrThrow(this.dependencies, ...args)
  }

  async _maybeNormalizeOverdueScheduledMeeting(...args) {
    return readService._maybeNormalizeOverdueScheduledMeeting(this.dependencies, ...args)
  }

  async _normalizeOverdueScheduledMeetings(...args) {
    return readService._normalizeOverdueScheduledMeetings(this.dependencies, ...args)
  }

  async _assertCanAccessMeeting(...args) {
    return accessService._assertCanAccessMeeting(this.dependencies, ...args)
  }

  async _resolveMeetingContentAccess(...args) {
    return readService._resolveMeetingContentAccess(this.dependencies, ...args)
  }

  async _getMeetingParticipant(...args) {
    return readService._getMeetingParticipant(this.dependencies, ...args)
  }

  async _findChannelById(...args) {
    return readService._findChannelById(this.dependencies, ...args)
  }

  async _findChannelMembership(...args) {
    return readService._findChannelMembership(this.dependencies, ...args)
  }

  async _findExistingUserIds(...args) {
    return readService._findExistingUserIds(this.dependencies, ...args)
  }

  async _assertCanUseSourceChannel(...args) {
    return accessService._assertCanUseSourceChannel(this.dependencies, ...args)
  }

  async _assertCanReadSourceChannel(...args) {
    return accessService._assertCanReadSourceChannel(this.dependencies, ...args)
  }

  async _assertCanInviteToMeeting(...args) {
    return accessService._assertCanInviteToMeeting(this.dependencies, ...args)
  }

  async _assertUsersExist(...args) {
    return accessService._assertUsersExist(this.dependencies, ...args)
  }

  _normalizeMeetingLanguageInput(...args) {
    return readService._normalizeMeetingLanguageInput(this.dependencies, ...args)
  }

  async _resolveDefaultMeetingLanguage(...args) {
    return readService._resolveDefaultMeetingLanguage(this.dependencies, ...args)
  }

  _normalizeLabel(...args) {
    return readService._normalizeLabel(this.dependencies, ...args)
  }

  _isTechnicalDmSourceName(...args) {
    return readService._isTechnicalDmSourceName(this.dependencies, ...args)
  }

  _isTechnicalGroupSourceName(...args) {
    return readService._isTechnicalGroupSourceName(this.dependencies, ...args)
  }

  _toUniqueSortedDisplayNames(...args) {
    return readService._toUniqueSortedDisplayNames(this.dependencies, ...args)
  }

  _formatCompactGroupDisplayName(...args) {
    return readService._formatCompactGroupDisplayName(this.dependencies, ...args)
  }

  async _resolveSourceChannelDisplayName(...args) {
    return readService._resolveSourceChannelDisplayName(this.dependencies, ...args)
  }

  async _buildSourceChannelDisplayNameIndex(...args) {
    return readService._buildSourceChannelDisplayNameIndex(this.dependencies, ...args)
  }

  _buildMeetingSummary(...args) {
    return readService._buildMeetingSummary(this.dependencies, ...args)
  }

  async _serializeMeetings(...args) {
    return readService._serializeMeetings(this.dependencies, ...args)
  }

  async _enrichMeetingsWithDetails(...args) {
    return readService._enrichMeetingsWithDetails(this.dependencies, ...args)
  }

  async _buildTranscriptionRecordingStateIndex(...args) {
    return readService._buildTranscriptionRecordingStateIndex(this.dependencies, ...args)
  }

  _assertCanControlTranscriptionRecording(...args) {
    return artifactActions._assertCanControlTranscriptionRecording(this.dependencies, ...args)
  }

  async _startRecordingsForConnectedMeetingParticipants(...args) {
    return artifactActions._startRecordingsForConnectedMeetingParticipants(this.dependencies, ...args)
  }

  _emitRecordingStateUpdated(...args) {
    return artifactActions._emitRecordingStateUpdated(this.dependencies, ...args)
  }

  async _createSourceMessage(...args) {
    return integrations._createSourceMessage(this.dependencies, ...args)
  }

  _joinConnectionsToChannel(...args) {
    return integrations._joinConnectionsToChannel(this.dependencies, ...args)
  }

  _emitNotificationEvents(...args) {
    return integrations._emitNotificationEvents(this.dependencies, ...args)
  }

}

export const meetings = (app) => {
  const options = {
    Model: app.get('postgresqlClient'),
    app
  }

  app.use('meetings', new MeetingsService(options), {
    methods: ['find', 'get', 'create', 'patch'],
    events: ['invited', 'joined', 'ended', 'artifacts-queued', 'artifacts-updated', 'recording-state-updated']
  })

  app.service('meetings').hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      create: [validate(createSchema)],
      patch: [validate(patchSchema)]
    }
  })
}
