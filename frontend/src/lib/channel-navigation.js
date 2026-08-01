export async function resolveSidebarChannelRoute(channelId, { meetingsStore } = {}) {
  if (!channelId) {
    return '/channels'
  }

  let meeting = null

  if (meetingsStore?.hasMeetingChatChannel?.(channelId)) {
    meeting = await meetingsStore.findMeetingByChatChannelId(channelId, {
      refreshIfMissing: false
    })

    if (!meeting) {
      meeting = await meetingsStore.findMeetingByChatChannelId(channelId)
    }
  }

  if (meeting?.id) {
    return `/meetings/${meeting.id}`
  }

  return `/channels/${channelId}`
}
