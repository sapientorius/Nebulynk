/**
 * Presence simulator for Nebulynk demo data.
 *
 * Authenticates as several demo users via REST, opens Socket.IO connections
 * (exactly like the frontend does), and keeps them alive so the users appear
 * as "online" or "away" in the UI.
 *
 * Prerequisites:
 *   - Backend must be running on http://localhost:3030
 *   - Demo database must be seeded (npm run seed:demo)
 *
 * Usage:
 *   node scripts/simulate-presence.mjs
 *
 * Press Ctrl+C to disconnect all users gracefully.
 */

import { io } from 'socket.io-client'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../.env') })

const BACKEND_URL = process.env.BACKEND_URL || process.env.VITE_BACKEND_URL || 'http://localhost:3030'
const DEMO_PASSWORD = 'demo1234'

// Users to simulate as "online" — these have status 'online' in the seed data
const ONLINE_USERS = [
  { email: 'alex@nebulynk.dev',   displayName: 'Alexandra Schmidt', status: 'online' },
  { email: 'marco@nebulynk.dev',  displayName: 'Marco Weber',        status: 'online' },
  { email: 'sarah@nebulynk.dev',  displayName: 'Sarah Klein',        status: 'online' },
  { email: 'tobias@nebulynk.dev', displayName: 'Tobias Frank',       status: 'online' }
]

// Users to simulate as "away" — these have status 'away' in the seed data
const AWAY_USERS = [
  { email: 'nina@nebulynk.dev',  displayName: 'Nina Becker',  status: 'away' },
  { email: 'jonas@nebulynk.dev', displayName: 'Jonas Wagner', status: 'away' }
]

const ALL_SIMULATED_USERS = [...ONLINE_USERS, ...AWAY_USERS]

// ---------------------------------------------------------------------------
// Auth + Socket logic
// ---------------------------------------------------------------------------

async function authenticate(email, password) {
  const response = await fetch(`${BACKEND_URL}/authentication`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategy: 'local', email, password })
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Auth failed for ${email}: ${response.status} ${text}`)
  }

  const data = await response.json()
  return data.accessToken
}

function createSocketConnection(token) {
  return new Promise((resolveSocket, rejectSocket) => {
    const socket = io(BACKEND_URL, {
      auth: { token }
    })

    let resolved = false

    socket.on('connect', () => {
      socket.emit('create', 'authentication', {
        strategy: 'jwt',
        accessToken: token
      }, (error, result) => {
        if (error) {
          if (!resolved) {
            resolved = true
            rejectSocket(new Error(`Socket auth failed: ${error.message || error}`))
          }
          return
        }
        if (!resolved) {
          resolved = true
          resolveSocket(socket)
        }
      })
    })

    socket.on('connect_error', (err) => {
      if (!resolved) {
        resolved = true
        rejectSocket(new Error(`Socket connect error: ${err.message}`))
      }
    })

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        rejectSocket(new Error('Socket connection timeout (10s)'))
      }
    }, 10000)
  })
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=========================================')
  console.log('  Nebulynk Presence Simulator')
  console.log('=========================================')
  console.log()
  console.log(`Backend: ${BACKEND_URL}`)
  console.log()

  // Check backend is reachable
  try {
    const healthResp = await fetch(`${BACKEND_URL}/`)
    if (!healthResp.ok) {
      console.warn(`[presence] Warning: backend health check returned ${healthResp.status}`)
    }
  } catch {
    console.error(`[presence] ERROR: Cannot reach backend at ${BACKEND_URL}`)
    console.error('[presence] Make sure the backend is running and the demo DB is active.')
    process.exit(1)
  }

  const sockets = []
  const results = { online: 0, away: 0, failed: 0 }

  console.log(`[presence] Simulating ${ALL_SIMULATED_USERS.length} users...`)
  console.log()

  for (const user of ALL_SIMULATED_USERS) {
    const label = `${user.displayName} (${user.email})`
    try {
      process.stdout.write(`[presence] Connecting ${label}... `)
      const token = await authenticate(user.email, DEMO_PASSWORD)
      const socket = await createSocketConnection(token)
      sockets.push(socket)

      if (user.status === 'away') {
        results.away++
        console.log('AWAY ✓')
      } else {
        results.online++
        console.log('ONLINE ✓')
      }
    } catch (err) {
      results.failed++
      console.log(`FAILED ✗ (${err.message})`)
    }
  }

  console.log()
  console.log('=========================================')
  console.log('  Presence Simulation Active!')
  console.log('=========================================')
  console.log(`  Online: ${results.online}`)
  console.log(`  Away:   ${results.away}`)
  console.log(`  Failed: ${results.failed}`)
  console.log()
  console.log('The following users now appear as connected in the UI:')
  for (const user of ALL_SIMULATED_USERS) {
    const status = user.status === 'away' ? 'away' : 'online'
    console.log(`  [${status.padEnd(6)}] ${user.displayName}`)
  }
  console.log()
  console.log('Press Ctrl+C to disconnect all users and exit.')
  console.log()

  // Keep process alive
  process.on('SIGINT', async () => {
    console.log()
    console.log('[presence] Disconnecting all users...')

    for (const socket of sockets) {
      try {
        socket.disconnect()
      } catch {
        // ignore
      }
    }

    console.log('[presence] All users disconnected. Goodbye!')
    process.exit(0)
  })

  // Heartbeat log every 60 seconds
  let heartbeatCount = 0
  setInterval(() => {
    heartbeatCount++
    const connectedCount = sockets.filter((s) => s.connected).length
    console.log(`[presence] Heartbeat #${heartbeatCount} — ${connectedCount}/${sockets.length} sockets connected`)
  }, 60000)
}

main().catch((err) => {
  console.error('[presence] FATAL:', err)
  process.exit(1)
})