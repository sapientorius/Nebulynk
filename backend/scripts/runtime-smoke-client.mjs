import { io } from 'socket.io-client'
import { writeFile } from 'node:fs/promises'
const socket = io('http://backend:3030', { transports: ['websocket'], reconnection: false })
const deadline = setTimeout(() => { console.error('Smoke socket did not close'); process.exit(1) }, 70000)
socket.on('connect_error', (error) => { throw error })
socket.on('connect', async () => { await writeFile('/results/socket-ready', 'ready') })
socket.on('disconnect', async (reason) => {
  clearTimeout(deadline)
  await writeFile('/results/socket-closed.json', JSON.stringify({ reason }))
  socket.disconnect()
})
