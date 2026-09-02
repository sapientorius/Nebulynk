import { HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { logger } from '../logger.js'
import { getEgressStorageConfig } from './livekit.js'
import { getMeetingRecordingBasePrefix } from './meeting-recordings.js'
import { createStorageClient } from './storage.js'
import { resolveStorageS3Endpoint } from './security-config.js'

export const STORAGE_USAGE_CACHE_FRESH_FOR_MS = 5 * 60 * 1000

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizePrefix(value) {
  return normalizeString(value).replace(/^\/+|\/+$/g, '')
}

function normalizeEndpoint(value) {
  return normalizeString(value).replace(/\/+$/, '')
}

function objectIdentifier(storageScope, bucket, key) {
  return `${storageScope}\u0000${bucket}\u0000${key}`
}

function createUsageError(code) {
  const error = new Error(code)
  error.code = code
  return error
}

function parseByteCount(value, code) {
  if (typeof value === 'bigint') {
    if (value >= 0n) return value
    throw createUsageError(code)
  }

  if (typeof value === 'number') {
    if (Number.isFinite(value) && value >= 0 && Number.isInteger(value)) {
      return BigInt(value)
    }
    throw createUsageError(code)
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return BigInt(value.trim())
  }

  throw createUsageError(code)
}

function isMissingObjectError(error) {
  const statusCode = Number(error?.$metadata?.httpStatusCode || error?.statusCode || error?.status)
  if (statusCode === 404) return true
  const code = normalizeString(error?.name || error?.Code || error?.code)
  return ['NoSuchKey', 'NoSuchBucket', 'NotFound', 'NotFoundError'].includes(code)
}

function isObjectWithinPrefix(key, prefix) {
  if (!prefix) return false
  return key === prefix || key.startsWith(`${prefix}/`)
}

function unavailableDatabase() {
  return { available: false, bytes: null }
}

function unavailableObjectStorage() {
  return {
    available: false,
    bytes: null,
    object_count: null,
    files: { bytes: null, object_count: null },
    meeting_recordings: { bytes: null, object_count: null }
  }
}

function buildPartialSnapshot(now, databaseResult, storageResult) {
  const database = databaseResult.status === 'fulfilled'
    ? { available: true, bytes: databaseResult.value }
    : unavailableDatabase()
  const objectStorage = storageResult.status === 'fulfilled'
    ? { available: true, ...storageResult.value }
    : unavailableObjectStorage()

  const totalBytes = database.available && objectStorage.available
    ? (BigInt(database.bytes) + BigInt(objectStorage.bytes)).toString()
    : null

  return {
    snapshot_at: now.toISOString(),
    partial: !database.available || !objectStorage.available,
    database,
    object_storage: objectStorage,
    total_bytes: totalBytes
  }
}

export class StorageUsageManager {
  constructor(app, {
    now = () => new Date(),
    log = logger,
    getEgressStorageConfigFn = getEgressStorageConfig,
    getMeetingRecordingBasePrefixFn = getMeetingRecordingBasePrefix,
    createStorageClientFn = createStorageClient,
    resolveStorageEndpointFn = resolveStorageS3Endpoint
  } = {}) {
    this.app = app
    this.db = app.get('postgresqlClient')
    this.now = now
    this.log = log
    this.getEgressStorageConfigFn = getEgressStorageConfigFn
    this.getMeetingRecordingBasePrefixFn = getMeetingRecordingBasePrefixFn
    this.createStorageClientFn = createStorageClientFn
    this.resolveStorageEndpointFn = resolveStorageEndpointFn
    this.snapshot = null
    this.scanPromise = null
    this.recordingStorageClients = new Map()
  }

  async getUsage() {
    if (this.snapshot) return this._buildResponse(this.snapshot)
    return this._scan()
  }

  async refresh() {
    return this._scan()
  }

  async _scan() {
    if (this.scanPromise) return this.scanPromise

    this.scanPromise = this._collect()
      .then(({ snapshot, complete }) => {
        if (complete) {
          this.snapshot = snapshot
          return this._buildResponse(snapshot)
        }

        if (this.snapshot) {
          return this._buildResponse(this.snapshot, { forceStale: true, refreshFailed: true })
        }

        return this._buildResponse(snapshot)
      })
      .catch((error) => {
        this.log.warn('System storage usage scan failed', { error: error?.message || String(error) })
        if (this.snapshot) {
          return this._buildResponse(this.snapshot, { forceStale: true, refreshFailed: true })
        }
        return this._buildResponse(buildPartialSnapshot(
          this.now(),
          { status: 'rejected', reason: error },
          { status: 'rejected', reason: error }
        ))
      })
      .finally(() => {
        this.scanPromise = null
      })

    return this.scanPromise
  }

  async _collect() {
    const now = this.now()
    const [databaseResult, storageResult] = await Promise.allSettled([
      this._collectDatabaseUsage(),
      this._collectObjectStorageUsage()
    ])
    if (databaseResult.status === 'rejected') {
      this.log.warn('System storage usage database scan failed', {
        error: databaseResult.reason?.message || String(databaseResult.reason)
      })
    }
    if (storageResult.status === 'rejected') {
      this.log.warn('System storage usage object scan failed', {
        error: storageResult.reason?.message || String(storageResult.reason)
      })
    }
    const snapshot = buildPartialSnapshot(now, databaseResult, storageResult)

    return {
      snapshot,
      complete: databaseResult.status === 'fulfilled' && storageResult.status === 'fulfilled'
    }
  }

  async _collectDatabaseUsage() {
    const result = await this.db.raw('SELECT pg_database_size(current_database()) AS bytes')
    const row = Array.isArray(result?.rows)
      ? result.rows[0]
      : Array.isArray(result?.[0])
        ? result[0][0]
        : null
    return parseByteCount(row?.bytes, 'system_info_database_size_invalid').toString()
  }

  async _collectObjectStorageUsage() {
    const primaryClient = this.app.get('storageClient')
    const primaryBucket = normalizeString(this.app.get('storageBucket'))
    if (!primaryClient || !primaryBucket) {
      throw createUsageError('system_info_storage_unavailable')
    }

    const recordingStorage = this.getEgressStorageConfigFn() || {}
    const recordingBucket = normalizeString(recordingStorage.bucket)
    const recordingPrefix = normalizePrefix(this.getMeetingRecordingBasePrefixFn())
    if (!recordingBucket || !recordingPrefix) {
      throw createUsageError('system_info_recording_storage_unavailable')
    }

    const primaryStorageScope = normalizeEndpoint(this.resolveStorageEndpointFn(process.env))
    const recordingStorageScope = normalizeEndpoint(recordingStorage.endpoint) || primaryStorageScope
    const recordingClient = this._getRecordingStorageClient(recordingStorage, primaryClient, primaryStorageScope)
    const [knownRecordingObjects, primaryObjects] = await Promise.all([
      this._getKnownRecordingObjects(),
      this._listObjects(primaryClient, primaryBucket, '', primaryStorageScope)
    ])

    const objects = new Map()
    this._addObjects(objects, primaryObjects)

    if (recordingBucket !== primaryBucket || recordingStorageScope !== primaryStorageScope) {
      const recordingObjects = await this._listObjects(recordingClient, recordingBucket, recordingPrefix, recordingStorageScope)
      this._addObjects(objects, recordingObjects)
    }

    for (const recording of knownRecordingObjects) {
      const source = this._getObjectSource(recording.bucket, {
        primaryBucket,
        primaryClient,
        primaryStorageScope,
        recordingBucket,
        recordingClient,
        recordingStorageScope
      })
      const id = objectIdentifier(source.storageScope, recording.bucket, recording.key)
      if (objects.has(id)) continue

      try {
        const size = await this._headObject(source.client, recording.bucket, recording.key)
        objects.set(id, { ...recording, storage_scope: source.storageScope, size })
      } catch (error) {
        if (isMissingObjectError(error)) continue
        throw error
      }
    }

    const knownRecordingIds = new Set(knownRecordingObjects.map((entry) => {
      const source = this._getObjectSource(entry.bucket, {
        primaryBucket,
        primaryClient,
        primaryStorageScope,
        recordingBucket,
        recordingClient,
        recordingStorageScope
      })
      return objectIdentifier(source.storageScope, entry.bucket, entry.key)
    }))
    let filesBytes = 0n
    let recordingBytes = 0n
    let filesCount = 0
    let recordingsCount = 0

    for (const object of objects.values()) {
      const id = objectIdentifier(object.storage_scope, object.bucket, object.key)
      const isRecording = knownRecordingIds.has(id)
        || isObjectWithinPrefix(object.key, recordingPrefix)

      if (isRecording) {
        recordingBytes += object.size
        recordingsCount += 1
      } else {
        filesBytes += object.size
        filesCount += 1
      }
    }

    const totalBytes = filesBytes + recordingBytes
    return {
      bytes: totalBytes.toString(),
      object_count: filesCount + recordingsCount,
      files: {
        bytes: filesBytes.toString(),
        object_count: filesCount
      },
      meeting_recordings: {
        bytes: recordingBytes.toString(),
        object_count: recordingsCount
      }
    }
  }

  _getRecordingStorageClient(recordingStorage, primaryClient, primaryEndpoint) {
    const recordingEndpoint = normalizeEndpoint(recordingStorage.endpoint)
    if (!recordingEndpoint || recordingEndpoint === primaryEndpoint) return primaryClient

    const cacheKey = `${recordingEndpoint}\u0000${normalizeString(recordingStorage.region)}`
    if (!this.recordingStorageClients.has(cacheKey)) {
      this.recordingStorageClients.set(cacheKey, this.createStorageClientFn({
        endpoint: recordingEndpoint,
        region: recordingStorage.region
      }))
    }
    return this.recordingStorageClients.get(cacheKey)
  }

  _getObjectSource(bucket, {
    primaryBucket,
    primaryClient,
    primaryStorageScope,
    recordingBucket,
    recordingClient,
    recordingStorageScope
  }) {
    if (bucket === recordingBucket) {
      return { client: recordingClient, storageScope: recordingStorageScope }
    }
    if (bucket === primaryBucket) {
      return { client: primaryClient, storageScope: primaryStorageScope }
    }
    return { client: primaryClient, storageScope: primaryStorageScope }
  }

  async _getKnownRecordingObjects() {
    const rows = await this.db('meeting_recordings')
      .whereNotNull('storage_bucket')
      .whereNotNull('storage_key')
      .select('storage_bucket', 'storage_key')

    const objects = []
    for (const row of rows || []) {
      const bucket = normalizeString(row?.storage_bucket)
      const key = normalizeString(row?.storage_key).replace(/^\/+/, '')
      if (bucket && key) objects.push({ bucket, key })
    }
    return objects
  }

  async _listObjects(client, bucket, prefix = '', storageScope = '') {
    const objects = []
    let continuationToken = null

    do {
      const input = { Bucket: bucket }
      if (prefix) input.Prefix = prefix
      if (continuationToken) input.ContinuationToken = continuationToken
      const response = await client.send(new ListObjectsV2Command(input))

      for (const entry of response?.Contents || []) {
        const key = typeof entry?.Key === 'string' ? entry.Key : null
        if (key == null) continue
        objects.push({
          storage_scope: storageScope,
          bucket,
          key,
          size: parseByteCount(entry.Size, 'system_info_storage_object_size_invalid')
        })
      }

      if (response?.IsTruncated !== true) break
      continuationToken = normalizeString(response?.NextContinuationToken)
      if (!continuationToken) {
        throw createUsageError('system_info_storage_pagination_invalid')
      }
    } while (continuationToken)

    return objects
  }

  _addObjects(target, objects) {
    for (const object of objects) {
      target.set(objectIdentifier(object.storage_scope, object.bucket, object.key), object)
    }
  }

  async _headObject(client, bucket, key) {
    const response = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return parseByteCount(response?.ContentLength, 'system_info_storage_object_size_invalid')
  }

  _buildResponse(snapshot, { forceStale = false, refreshFailed = false } = {}) {
    const snapshotTime = Date.parse(snapshot.snapshot_at)
    const ageSeconds = Number.isFinite(snapshotTime)
      ? Math.max(0, Math.floor((this.now().getTime() - snapshotTime) / 1000))
      : 0
    const stale = forceStale || (!snapshot.partial && ageSeconds >= Math.floor(STORAGE_USAGE_CACHE_FRESH_FOR_MS / 1000))

    return {
      state: snapshot.partial ? 'partial' : stale ? 'stale' : 'fresh',
      snapshot_at: snapshot.snapshot_at,
      age_seconds: ageSeconds,
      cache_fresh: !snapshot.partial && !refreshFailed && ageSeconds < Math.floor(STORAGE_USAGE_CACHE_FRESH_FOR_MS / 1000),
      refresh_failed: refreshFailed,
      database: snapshot.database,
      object_storage: snapshot.object_storage,
      total_bytes: snapshot.total_bytes
    }
  }
}
