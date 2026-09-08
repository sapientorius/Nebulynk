// LiveKit events are translated into explicit store actions. Connection ownership
// and mutable media state stay in the voice store.
export function createVoiceLiveKitCallbacks({
  getChannelId, setActiveSpeakers, resetDisconnectedMedia,
  upsertScreenShare, removeScreenShare, configureIncomingShare,
  upsertCameraTrack, clearCameraTrack, removeCameraTrack,
  setLocalCameraPublished, configureIncomingCamera
}) {
  return {
    onActiveSpeakersChanged: setActiveSpeakers,
    onDisconnected: resetDisconnectedMedia,
    onScreenShareStarted(payload) {
      const channelId = getChannelId()
      if (!channelId) return
      upsertScreenShare(channelId, payload)
      if (!payload?.isLocal) configureIncomingShare(payload)
    },
    onScreenShareStopped(payload) {
      const channelId = getChannelId()
      if (channelId) removeScreenShare(channelId, payload?.participantId || null)
    },
    onCameraStarted(payload) {
      const channelId = getChannelId()
      if (!channelId) return
      upsertCameraTrack(channelId, payload)
      if (payload?.isLocal) setLocalCameraPublished(channelId, true)
    },
    onCameraStopped(payload) {
      const channelId = getChannelId()
      if (!channelId) return
      clearCameraTrack(channelId, payload?.participantId || null)
      if (payload?.isLocal) setLocalCameraPublished(channelId, false)
    },
    onCameraPublished(payload) {
      const channelId = getChannelId()
      if (!channelId) return
      upsertCameraTrack(channelId, payload)
      if (!payload?.isLocal) configureIncomingCamera(payload?.participantId || null)
    },
    onCameraUnpublished(payload) {
      const channelId = getChannelId()
      if (channelId) removeCameraTrack(channelId, payload?.participantId || null)
    }
  }
}
