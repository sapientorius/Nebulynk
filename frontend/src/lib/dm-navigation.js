export async function navigateToDmChannel(router, channelId) {
  if (!router || !channelId) return
  await router.push(`/channels/${channelId}`).catch(() => {})
}
