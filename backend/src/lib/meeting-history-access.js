export const MEETING_HISTORY_ACCESS = Object.freeze({
  ALL_CHANNEL_MEMBERS: 'all_channel_members',
  MEETING_START_MEMBERS: 'meeting_start_members',
  ACTIVE_PARTICIPANTS: 'active_participants'
})

export const MEETING_HISTORY_ACCESS_VALUES = Object.freeze(Object.values(MEETING_HISTORY_ACCESS))
export const DEFAULT_MEETING_HISTORY_ACCESS = MEETING_HISTORY_ACCESS.ALL_CHANNEL_MEMBERS

export function isMeetingHistoryAccess(value) {
  return MEETING_HISTORY_ACCESS_VALUES.includes(value)
}

export function normalizeMeetingHistoryAccess(value, fallback = DEFAULT_MEETING_HISTORY_ACCESS) {
  return isMeetingHistoryAccess(value) ? value : fallback
}
