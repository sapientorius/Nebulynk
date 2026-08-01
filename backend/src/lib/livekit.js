import {
  AccessToken,
  EgressClient,
  EgressStatus,
  EncodedFileOutput,
  EncodedFileType,
  RoomServiceClient,
  S3Upload,
  TrackSource,
  WebhookReceiver
} from 'livekit-server-sdk'
import { logger } from '../logger.js'
import { parseStorageObjectKey } from './meeting-recordings.js'
import {
  resolveLivekitApiKey,
  resolveLivekitApiSecret,
  resolveLivekitHost,
  resolveStorageBucket,
  resolveStorageS3AccessKey,
  resolveStorageS3Endpoint,
  resolveStorageS3Region,
  resolveStorageS3SecretKey
} from './security-config.js'

const apiKey = resolveLivekitApiKey(process.env)
const apiSecret = resolveLivekitApiSecret(process.env)
const livekitHost = resolveLivekitHost(process.env)
const livekitPublicUrl = process.env.LIVEKIT_PUBLIC_URL || ''

let roomService = null
let webhookReceiver = null
let egressService = null

export function getRoomService() {
  if (!roomService) {
    roomService = new RoomServiceClient(livekitHost, apiKey, apiSecret)
  }
  return roomService
}

export function getWebhookReceiver() {
  if (!webhookReceiver) {
    webhookReceiver = new WebhookReceiver(apiKey, apiSecret)
  }
  return webhookReceiver
}

export function getEgressClient() {
  if (!egressService) {
    egressService = new EgressClient(livekitHost, apiKey, apiSecret)
  }
  return egressService
}

export function buildParticipantGrant(roomName, { allowCamera = false } = {}) {
  const canPublishSources = [
    TrackSource.MICROPHONE,
    TrackSource.SCREEN_SHARE,
    TrackSource.SCREEN_SHARE_AUDIO
  ]
  if (allowCamera) {
    canPublishSources.push(TrackSource.CAMERA)
  }

  return {
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canPublishSources
  }
}

export async function generateToken(roomName, userId, displayName, options = {}) {
  const token = new AccessToken(apiKey, apiSecret, {
    identity: userId,
    name: displayName,
    ttl: '24h'
  })

  token.addGrant(buildParticipantGrant(roomName, options))

  return await token.toJwt()
}

export async function listRoomParticipants(roomName) {
  try {
    const svc = getRoomService()
    return await svc.listParticipants(roomName)
  } catch (error) {
    logger.warn('Failed to list LiveKit participants', { roomName, error: error.message })
    return []
  }
}

export async function ensureRoomExists(roomName) {
  try {
    const svc = getRoomService()
    await svc.createRoom({
      name: roomName,
      emptyTimeout: 300,
      departureTimeout: 20
    })
  } catch (error) {
    const message = String(error?.message || '')
    if (!/already exists|exists/i.test(message)) {
      logger.warn('Failed to ensure LiveKit room exists', { roomName, error: message })
    }
  }
}

export async function deleteRoom(roomName) {
  try {
    const svc = getRoomService()
    await svc.deleteRoom(roomName)
  } catch (error) {
    // Room may not exist - that is fine.
    logger.warn('Failed to delete LiveKit room', { roomName, error: error.message })
  }
}

function normalizeEpochMillis(value) {
  const numeric = typeof value === 'bigint' ? Number(value) : Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null

  const absolute = Math.abs(numeric)
  if (absolute >= 1e17) {
    return numeric / 1e6
  }
  if (absolute >= 1e14) {
    return numeric / 1e3
  }
  if (absolute >= 1e11) {
    return numeric
  }
  if (absolute >= 1e8) {
    return numeric * 1000
  }
  return numeric
}

function normalizeTimestamp(value) {
  if (value == null) return null

  if (value instanceof Date) {
    const timestamp = value.getTime()
    return Number.isFinite(timestamp) ? value.toISOString() : null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null

    const parsed = Date.parse(trimmed)
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString()
    }

    const normalizedMs = normalizeEpochMillis(trimmed)
    if (normalizedMs == null) return null
    const normalizedDate = new Date(normalizedMs)
    return Number.isFinite(normalizedDate.getTime()) ? normalizedDate.toISOString() : null
  }

  if (typeof value === 'object') {
    if ('seconds' in value || 'nanos' in value) {
      const seconds = normalizeEpochMillis(value.seconds)
      const nanos = Number(value.nanos || 0)
      const millisFromSeconds = seconds == null
        ? null
        : (
          Math.abs(seconds) >= 1e11
            ? seconds
            : seconds * 1000
        )
      const totalMillis = millisFromSeconds == null
        ? null
        : millisFromSeconds + (Number.isFinite(nanos) ? nanos / 1e6 : 0)
      if (totalMillis == null) return null
      const normalizedDate = new Date(totalMillis)
      return Number.isFinite(normalizedDate.getTime()) ? normalizedDate.toISOString() : null
    }

    if ('milliseconds' in value) {
      const normalizedMs = normalizeEpochMillis(value.milliseconds)
      if (normalizedMs == null) return null
      const normalizedDate = new Date(normalizedMs)
      return Number.isFinite(normalizedDate.getTime()) ? normalizedDate.toISOString() : null
    }
  }

  const normalizedMs = normalizeEpochMillis(value)
  if (normalizedMs == null) return null
  const normalizedDate = new Date(normalizedMs)
  return Number.isFinite(normalizedDate.getTime()) ? normalizedDate.toISOString() : null
}

function normalizeDurationMs(value) {
  const numeric = typeof value === 'bigint' ? Number(value) : Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return Math.round(numeric / 1e6)
}

export function mapEgressStatus(status) {
  if (status === EgressStatus.EGRESS_ACTIVE || status === EgressStatus.EGRESS_STARTING) return 'recording'
  if (status === EgressStatus.EGRESS_ENDING) return 'ending'
  if (status === EgressStatus.EGRESS_COMPLETE) return 'complete'
  if (status === EgressStatus.EGRESS_FAILED) return 'failed'
  if (status === EgressStatus.EGRESS_ABORTED) return 'aborted'
  if (status === EgressStatus.EGRESS_LIMIT_REACHED) return 'limit_reached'
  return 'unknown'
}

export function getEgressStorageConfig() {
  const backendEndpoint = process.env.MEETING_RECORDINGS_S3_ENDPOINT
    || resolveStorageS3Endpoint(process.env)
  const egressEndpoint = process.env.MEETING_RECORDINGS_EGRESS_S3_ENDPOINT
    || (
      /^https?:\/\/(127\.0\.0\.1|localhost)(?::|\/|$)/i.test(backendEndpoint)
        ? 'http://garage:3900'
        : backendEndpoint
    )

  return {
    bucket: process.env.MEETING_RECORDINGS_BUCKET || resolveStorageBucket(process.env),
    endpoint: backendEndpoint,
    egressEndpoint,
    region: resolveStorageS3Region(process.env),
    accessKey: resolveStorageS3AccessKey(process.env),
    secret: resolveStorageS3SecretKey(process.env),
    forcePathStyle: true
  }
}

export async function startParticipantAudioRecording({
  roomName,
  participantIdentity,
  recording
}) {
  const client = getEgressClient()
  const storage = getEgressStorageConfig()
  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: recording.storage_key,
    output: {
      case: 's3',
      value: new S3Upload({
        accessKey: storage.accessKey,
        secret: storage.secret,
        region: storage.region,
        endpoint: storage.egressEndpoint || storage.endpoint,
        bucket: storage.bucket,
        forcePathStyle: storage.forcePathStyle
      })
    }
  })

  return client.startParticipantEgress(roomName, participantIdentity, {
    file: output
  })
}

export async function getEgressInfo(egressId) {
  const client = getEgressClient()
  const results = await client.listEgress({ egressId })
  return Array.isArray(results) && results.length > 0 ? results[0] : null
}

export async function stopEgress(egressId) {
  const client = getEgressClient()
  try {
    return await client.stopEgress(egressId)
  } catch (error) {
    if (String(error?.message || '').includes('EGRESS_COMPLETE')) {
      return null
    }
    throw error
  }
}

export function normalizeEgressFileInfo(info, fallbackKey = null) {
  const file = Array.isArray(info?.fileResults) && info.fileResults.length > 0
    ? info.fileResults[0]
    : null

  return {
    storageKey: parseStorageObjectKey(file?.filename || file?.location || fallbackKey || ''),
    startedAt: normalizeTimestamp(file?.startedAt || info?.startedAt),
    endedAt: normalizeTimestamp(file?.endedAt || info?.endedAt),
    durationMs: file?.duration != null ? normalizeDurationMs(file.duration) : null
  }
}

function toWsUrl(url) {
  const value = (url || '').trim()
  if (!value) return ''
  if (value.startsWith('ws://') || value.startsWith('wss://')) return value
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value.replace(/^http/, 'ws')
  }
  return `wss://${value}`
}

export function getLivekitWsUrl() {
  return toWsUrl(livekitPublicUrl) || toWsUrl(livekitHost)
}
