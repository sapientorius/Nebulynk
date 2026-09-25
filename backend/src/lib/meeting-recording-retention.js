import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { logger } from '../logger.js'
import { getEgressStorageConfig } from './livekit.js'
import { isActiveMeetingRecordingStatus } from './meeting-recordings.js'
import {
  GIB_BYTES,
  resolveMeetingRecordingRetentionSettings
} from './meeting-recording-retention-settings.js'
import { createStorageClient, deleteFile } from './storage.js'
import { resolveStorageS3Endpoint } from './security-config.js'

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeEndpoint(value) {
  return normalizeString(value).replace(/\/+$/, '')
}

function parseByteCount(value) {
  if (typeof value === 'bigint' && value >= 0n) return value
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value)
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return BigInt(value.trim())
  return null
}

function isMissingObjectError(error) {
  const statusCode = Number(error?.$metadata?.httpStatusCode || error?.statusCode || error?.status)
  if (statusCode === 404) return true
  return ['NoSuchKey', 'NoSuchBucket', 'NotFound', 'NotFoundError'].includes(
    normalizeString(error?.name || error?.Code || error?.code)
  )
}

function groupRecordings(rows) {
  const groups = new Map()
  for (const row of rows || []) {
    if (!row?.meeting_id) continue
    if (!groups.has(row.meeting_id)) {
      groups.set(row.meeting_id, {
        meetingId: row.meeting_id,
        meetingStatus: row.meeting_status,
        endedAt: row.meeting_ended_at,
        recordings: [],
        sizeBytes: 0n,
        sizeKnown: true
      })
    }
    groups.get(row.meeting_id).recordings.push(row)
  }
  return [...groups.values()]
}

function timestampMs(value) {
  const result = Date.parse(value)
  return Number.isFinite(result) ? result : null
}

function compareOldestFirst(left, right) {
  const leftTime = timestampMs(left.endedAt) ?? Number.MAX_SAFE_INTEGER
  const rightTime = timestampMs(right.endedAt) ?? Number.MAX_SAFE_INTEGER
  if (leftTime !== rightTime) return leftTime - rightTime
  return String(left.meetingId).localeCompare(String(right.meetingId))
}

export class MeetingRecordingRetentionManager {
  constructor(app, {
    now = () => new Date(),
    log = logger,
    getEgressStorageConfigFn = getEgressStorageConfig,
    createStorageClientFn = createStorageClient,
    deleteFileFn = deleteFile,
    resolveStorageEndpointFn = resolveStorageS3Endpoint
  } = {}) {
    this.app = app
    this.db = app.get('postgresqlClient')
    this.now = now
    this.log = log
    this.getEgressStorageConfigFn = getEgressStorageConfigFn
    this.createStorageClientFn = createStorageClientFn
    this.deleteFileFn = deleteFileFn
    this.resolveStorageEndpointFn = resolveStorageEndpointFn
    this.runPromise = null
    this.recordingStorageClients = new Map()
  }

  async stop() {
    await this.runPromise
    for (const client of new Set(this.recordingStorageClients.values())) client.destroy?.()
    this.recordingStorageClients.clear()
  }

  async run() {
    if (this.runPromise) return this.runPromise

    this.runPromise = this._run()
      .catch((error) => {
        this.log.warn('Meeting recording retention cleanup failed', {
          error: error?.message || String(error)
        })
        return { state: 'failed', deletedMeetingCount: 0 }
      })
      .finally(() => {
        this.runPromise = null
      })

    return this.runPromise
  }

  async hydrateRecordingSize(recording) {
    if (!recording?.id) return null
    const size = await this._resolveRecordingSize(recording)
    return size === null ? null : size.toString()
  }

  async _run() {
    if (!this.db || !this.app.get('storageClient')) {
      return { state: 'unavailable', deletedMeetingCount: 0 }
    }

    const settings = await resolveMeetingRecordingRetentionSettings(this.db)
    const rows = await this.db('meeting_recordings')
      .join('meetings', 'meetings.id', 'meeting_recordings.meeting_id')
      .select(
        'meeting_recordings.*',
        'meetings.status as meeting_status',
        'meetings.ended_at as meeting_ended_at'
      )
    const groups = groupRecordings(rows)
    const activeTranscriptArtifacts = await this.db('meeting_artifacts')
      .where('artifact_type', 'transcript')
      .whereIn('status', ['pending', 'processing'])
      .select('meeting_id')
    const protectedMeetingIds = new Set(activeTranscriptArtifacts.map((artifact) => artifact.meeting_id))

    for (const group of groups) {
      for (const recording of group.recordings) {
        const size = await this._resolveRecordingSize(recording)
        if (size === null) {
          group.sizeKnown = false
          continue
        }
        group.sizeBytes += size
      }
    }

    const deletableGroups = groups
      .filter((group) => (
        group.meetingStatus === 'ended'
        && !protectedMeetingIds.has(group.meetingId)
        && timestampMs(group.endedAt) !== null
        && group.recordings.every((recording) => !isActiveMeetingRecordingStatus(recording.status))
      ))
      .sort(compareOldestFirst)

    const deletedMeetingIds = new Set()
    if (settings.retentionDays !== null) {
      const cutoffMs = this.now().getTime() - (settings.retentionDays * 24 * 60 * 60 * 1000)
      for (const group of deletableGroups) {
        if ((timestampMs(group.endedAt) ?? Number.MAX_SAFE_INTEGER) > cutoffMs) continue
        await this._deleteMeetingGroup(group)
        deletedMeetingIds.add(group.meetingId)
      }
    }

    if (settings.storageLimitGiB !== null) {
      const unresolvedGroups = groups.filter((group) => !deletedMeetingIds.has(group.meetingId) && !group.sizeKnown)
      if (unresolvedGroups.length > 0) {
        this.log.warn('Meeting recording storage limit deferred because object sizes are unavailable', {
          unresolvedMeetingCount: unresolvedGroups.length
        })
      } else {
        const limitBytes = BigInt(settings.storageLimitGiB) * BigInt(GIB_BYTES)
        let totalBytes = groups
          .filter((group) => !deletedMeetingIds.has(group.meetingId))
          .reduce((total, group) => total + group.sizeBytes, 0n)

        for (const group of deletableGroups) {
          if (totalBytes <= limitBytes) break
          if (deletedMeetingIds.has(group.meetingId) || group.sizeBytes === 0n) continue
          await this._deleteMeetingGroup(group)
          deletedMeetingIds.add(group.meetingId)
          totalBytes -= group.sizeBytes
        }

        if (totalBytes > limitBytes) {
          this.log.warn('Meeting recording storage limit remains exceeded because only active or undeletable recordings remain', {
            storageLimitGiB: settings.storageLimitGiB,
            totalBytes: totalBytes.toString()
          })
        }
      }
    }

    if (deletedMeetingIds.size > 0) {
      this.app.get('storageUsageManager')?.invalidate()
    }

    return { state: 'completed', deletedMeetingCount: deletedMeetingIds.size }
  }

  async _resolveRecordingSize(recording) {
    const storedSize = parseByteCount(recording?.storage_size_bytes)
    if (storedSize !== null) return storedSize
    if (!recording?.storage_bucket || !recording?.storage_key) return 0n

    try {
      const client = this._getStorageClient(recording.storage_bucket)
      const response = await client.send(new HeadObjectCommand({
        Bucket: recording.storage_bucket,
        Key: recording.storage_key
      }))
      const size = parseByteCount(response?.ContentLength)
      if (size === null) throw new Error('Meeting recording object size is invalid')
      await this.db('meeting_recordings')
        .where('id', recording.id)
        .update({ storage_size_bytes: size.toString() })
      recording.storage_size_bytes = size.toString()
      return size
    } catch (error) {
      if (isMissingObjectError(error)) return 0n
      this.log.warn('Meeting recording object size lookup failed', {
        recordingId: recording?.id || null,
        error: error?.message || String(error)
      })
      return null
    }
  }

  async _deleteMeetingGroup(group) {
    for (const recording of group.recordings) {
      if (!recording.storage_bucket || !recording.storage_key) continue
      const client = this._getStorageClient(recording.storage_bucket)
      await this.deleteFileFn(client, {
        bucket: recording.storage_bucket,
        key: recording.storage_key
      })
    }

    await this.db.transaction(async (trx) => {
      await trx('meeting_recordings').where('meeting_id', group.meetingId).delete()
    })
  }

  _getStorageClient(bucket) {
    const primaryClient = this.app.get('storageClient')
    const primaryBucket = normalizeString(this.app.get('storageBucket'))
    const recordingStorage = this.getEgressStorageConfigFn() || {}
    const recordingBucket = normalizeString(recordingStorage.bucket)
    const primaryEndpoint = normalizeEndpoint(this.resolveStorageEndpointFn(process.env))
    const recordingEndpoint = normalizeEndpoint(recordingStorage.endpoint)

    if (bucket !== recordingBucket || (!recordingEndpoint || recordingEndpoint === primaryEndpoint)) {
      return primaryClient
    }

    if (bucket === primaryBucket && recordingEndpoint === primaryEndpoint) return primaryClient

    const cacheKey = `${recordingEndpoint}\u0000${normalizeString(recordingStorage.region)}`
    if (!this.recordingStorageClients.has(cacheKey)) {
      this.recordingStorageClients.set(cacheKey, this.createStorageClientFn({
        endpoint: recordingStorage.endpoint,
        region: recordingStorage.region
      }))
    }
    return this.recordingStorageClients.get(cacheKey)
  }
}
