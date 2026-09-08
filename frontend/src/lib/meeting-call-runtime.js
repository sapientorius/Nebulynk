// One runtime per Pinia store. The store owns call records; this owns timers.
export function createMeetingCallRuntime({ hasCalls, playRing, onTimeout }) {
  const callTimeouts = new Map()
  let ringLoopId = null

  function clearRingLoop() {
    if (ringLoopId !== null) clearInterval(ringLoopId)
    ringLoopId = null
  }

  function ensureRingLoop() {
    if (ringLoopId !== null || !hasCalls()) return
    playRing()
    ringLoopId = setInterval(() => {
      if (!hasCalls()) { clearRingLoop(); return }
      playRing()
    }, 4000)
  }

  function clearCallTimeout(meetingId) {
    const timer = callTimeouts.get(meetingId)
    if (timer !== undefined) clearTimeout(timer)
    callTimeouts.delete(meetingId)
  }

  function scheduleIncomingCallTimeout(meetingId) {
    clearCallTimeout(meetingId)
    callTimeouts.set(meetingId, setTimeout(() => {
      callTimeouts.delete(meetingId)
      Promise.resolve(onTimeout(meetingId)).catch(() => {})
    }, 30000))
  }

  function stop() {
    for (const timer of callTimeouts.values()) clearTimeout(timer)
    callTimeouts.clear()
    clearRingLoop()
  }

  return { clearRingLoop, ensureRingLoop, clearCallTimeout, scheduleIncomingCallTimeout, stop }
}
