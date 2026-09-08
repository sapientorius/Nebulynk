import knex from 'knex'
import bcrypt from 'bcryptjs'
import { createId } from '@paralleldrive/cuid2'
import { writeFile } from 'node:fs/promises'

if (process.env.POSTGRES_HOST !== 'postgres' || process.env.POSTGRES_DB !== 'nebulynk_ap05') {
  throw new Error('This fixture only runs inside the isolated AP-05 Compose stack')
}
const db = knex({ client: 'pg', connection: {
  host: 'postgres', database: 'nebulynk_ap05', user: 'ap05', password: process.env.POSTGRES_PASSWORD
} })
try {
  if (await db('users').where('email', 'like', 'ap05-%@example.invalid').first()) throw new Error('Fixture already exists')
  const password = 'NebulynkBenchmark!2026'
  const hash = await bcrypt.hash(password, 12)
  const timestamp = '2026-01-01T00:00:00.000Z'
  const users = Array.from({ length: 1000 }, (_, index) => ({
    id: createId(), email: `ap05-${index}@example.invalid`, password: hash,
    display_name: `AP05 User ${index}`, status: 'offline', is_admin: false,
    is_verified: true, account_type: 'member', webauthn_user_id: createId(),
    theme_preference: 'platform', created_at: timestamp, updated_at: timestamp
  }))
  for (let start = 0; start < users.length; start += 100) await db('users').insert(users.slice(start, start + 100))
  const role = await db('roles').where('name', 'platform:member').first()
  await db('user_roles').insert(users.map((user) => ({ id: createId(), user_id: user.id, role_id: role.id })))
  const channels = []
  for (let index = 0; index < 10; index++) {
    const channel = { id: createId(), name: `AP05 ${index}`, type: 'private', purpose: 'default',
      created_by: users[index * 100].id, created_at: timestamp, updated_at: timestamp }
    channels.push(channel)
    await db('channels').insert(channel)
    await db('channel_members').insert(users.slice(index * 100, (index + 1) * 100).map((user) => ({
      id: createId(), user_id: user.id, channel_id: channel.id, role: 'member', created_at: timestamp, updated_at: timestamp
    })))
    for (let start = 0; start < 10000; start += 500) {
      await db('messages').insert(Array.from({ length: 500 }, (_, offset) => ({
        id: createId(), channel_id: channel.id, user_id: users[index * 100].id,
        content: `AP05 historical ${index}/${start + offset}`, type: 'text',
        created_at: new Date(Date.parse(timestamp) + (start + offset) * 1000).toISOString(), updated_at: timestamp
      })))
    }
  }
  await writeFile('/results/runtime-manifest.json', JSON.stringify({ password,
    users: users.map(({ id, email }, index) => ({ id, email, channelId: channels[Math.floor(index / 100)].id })) }))
  console.log('Seeded 1000 users, 10 channels and 100000 messages')
} finally { await db.destroy() }
