import { afterEach, describe, expect, it, vi } from 'vitest'
import { DisconnectReason, RoomEvent } from 'livekit-client'
import { connectToRoom, disconnectFromRoom, getRoom, setCallbacks } from '../../src/lib/livekit.js'

vi.mock('livekit-client', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, Room: class {
    handlers = new Map()
    remoteParticipants = new Map()
    localParticipant = {
      getTrackPublication: () => null,
      setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
      setCameraEnabled: vi.fn().mockResolvedValue(undefined)
    }
    connect = vi.fn().mockResolvedValue(undefined)
    disconnect = vi.fn(async () => this.emit(actual.RoomEvent.Disconnected, actual.DisconnectReason.CLIENT_INITIATED))
    on(event, handler) { this.handlers.set(event, handler) }
    emit(event, payload) { this.handlers.get(event)?.(payload) }
  } }
})

describe('LiveKit disconnect ownership', () => {
  afterEach(async () => { await disconnectFromRoom({ suppressErrors: true }); setCallbacks({}) })

  it('forwards the server disconnect reason and the affected room', async () => {
    const onDisconnected = vi.fn()
    setCallbacks({ onDisconnected })
    await connectToRoom('token', 'ws://localhost:7880')
    const room = getRoom()
    room.emit(RoomEvent.Disconnected, DisconnectReason.ROOM_DELETED)
    expect(onDisconnected).toHaveBeenCalledWith({ reason: DisconnectReason.ROOM_DELETED, connection: room })
  })

  it('ignores an old room disconnect after another room has connected', async () => {
    setCallbacks({ onDisconnected: vi.fn() })
    await connectToRoom('old', 'ws://localhost:7880')
    const old = getRoom()
    const onDisconnected = vi.fn()
    setCallbacks({ onDisconnected })
    await connectToRoom('new', 'ws://localhost:7880')
    const current = getRoom()
    old.emit(RoomEvent.Disconnected, DisconnectReason.ROOM_DELETED)
    expect(onDisconnected).not.toHaveBeenCalled()
    expect(getRoom()).toBe(current)
  })

  it('coalesces teardown and waits for the owned room before handover', async () => {
    await connectToRoom('old', 'ws://localhost:7880')
    const old = getRoom()
    let release
    old.disconnect.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const first = disconnectFromRoom()
    expect(disconnectFromRoom()).toBe(first)
    const handover = connectToRoom('new', 'ws://localhost:7880')
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    expect(getRoom()).toBe(old)
    release()
    await Promise.all([first, handover])
    expect(old.disconnect).toHaveBeenCalledTimes(1)
    expect(getRoom()).not.toBe(old)
  })
})
