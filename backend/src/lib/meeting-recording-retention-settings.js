export const MEETING_RECORDING_RETENTION_SETTING_KEYS = {
  retentionDays: 'meeting_recording_retention_days',
  storageLimitGiB: 'meeting_recording_storage_limit_gib'
}

export const DEFAULT_MEETING_RECORDING_RETENTION_DAYS = 60
export const DEFAULT_MEETING_RECORDING_STORAGE_LIMIT_GIB = null
export const MEETING_RECORDING_LIMIT_UNLIMITED = 'unlimited'
export const MAX_MEETING_RECORDING_STORAGE_LIMIT_GIB = 1024 * 1024
export const GIB_BYTES = 1024 * 1024 * 1024

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback
}

export function normalizeMeetingRecordingRetentionDays(value, fallback = DEFAULT_MEETING_RECORDING_RETENTION_DAYS) {
  if (value === null || value === MEETING_RECORDING_LIMIT_UNLIMITED) return null
  return parsePositiveInteger(value, fallback)
}

export function normalizeMeetingRecordingStorageLimitGiB(value, fallback = DEFAULT_MEETING_RECORDING_STORAGE_LIMIT_GIB) {
  if (value === null || value === MEETING_RECORDING_LIMIT_UNLIMITED) return null
  const parsed = parsePositiveInteger(value, fallback)
  if (parsed === null) return null
  return Math.min(parsed, MAX_MEETING_RECORDING_STORAGE_LIMIT_GIB)
}

export function normalizeMeetingRecordingRetentionSettingsMap(settings = {}) {
  return {
    [MEETING_RECORDING_RETENTION_SETTING_KEYS.retentionDays]: String(
      normalizeMeetingRecordingRetentionDays(
        settings[MEETING_RECORDING_RETENTION_SETTING_KEYS.retentionDays]
      ) ?? MEETING_RECORDING_LIMIT_UNLIMITED
    ),
    [MEETING_RECORDING_RETENTION_SETTING_KEYS.storageLimitGiB]: String(
      normalizeMeetingRecordingStorageLimitGiB(
        settings[MEETING_RECORDING_RETENTION_SETTING_KEYS.storageLimitGiB]
      ) ?? MEETING_RECORDING_LIMIT_UNLIMITED
    )
  }
}

export function normalizeMeetingRecordingRetentionPatch(value) {
  return value === null ? null : normalizeMeetingRecordingRetentionDays(value)
}

export function normalizeMeetingRecordingStorageLimitPatch(value) {
  return value === null ? null : normalizeMeetingRecordingStorageLimitGiB(value)
}

export async function resolveMeetingRecordingRetentionSettings(db) {
  const keys = Object.values(MEETING_RECORDING_RETENTION_SETTING_KEYS)
  const rows = await db('platform_settings').whereIn('key', keys).select('key', 'value')
  const settings = Object.fromEntries((rows || []).map((row) => [row.key, row.value]))

  return {
    retentionDays: normalizeMeetingRecordingRetentionDays(
      settings[MEETING_RECORDING_RETENTION_SETTING_KEYS.retentionDays]
    ),
    storageLimitGiB: normalizeMeetingRecordingStorageLimitGiB(
      settings[MEETING_RECORDING_RETENTION_SETTING_KEYS.storageLimitGiB]
    )
  }
}
