/**
 * Demo data seeder for Nebulynk.
 *
 * Creates a separate "nebulynk_demo" database (same local credentials as the
 * main dev DB), runs all migrations, and seeds realistic content for
 * screenshots: users, channels, messages, reactions, meetings, transcripts,
 * summaries, notifications, and more.
 *
 * Usage:
 *   node scripts/seed-demo-db.mjs            # create + migrate + seed
 *   node scripts/seed-demo-db.mjs --reset    # drop & recreate demo DB first
 */

import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { Client } from 'pg'
import knex from 'knex'
import dotenv from 'dotenv'
import { createId } from '@paralleldrive/cuid2'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../.env') })

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PG_HOST = process.env.POSTGRES_HOST || '127.0.0.1'
const PG_PORT = Number(process.env.POSTGRES_PORT) || 5433
const PG_USER = process.env.POSTGRES_USER || 'nebulynk'
const PG_PASSWORD = process.env.POSTGRES_PASSWORD || 'nebulynk_dev_password'
const DEMO_DB = process.env.DEMO_POSTGRES_DB || 'nebulynk_demo'
const ADMIN_DB = process.env.POSTGRES_ADMIN_DB || 'postgres'
const DEFAULT_PASSWORD = 'demo1234'
const BCRYPT_ROUNDS = 10

const shouldReset = process.argv.includes('--reset')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now() {
  return new Date().toISOString()
}

function minutesAgo(min) {
  return new Date(Date.now() - min * 60 * 1000).toISOString()
}

function hoursAgo(h) {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString()
}

function daysAgo(d) {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString()
}

function avatarUrl(seed) {
  return `https://i.pravatar.cc/150?u=${encodeURIComponent(seed)}`
}

function generateWebauthnUserId() {
  return crypto.randomBytes(32).toString('base64url')
}

async function createDemoDatabase() {
  const adminClient = new Client({
    host: PG_HOST,
    port: PG_PORT,
    user: PG_USER,
    password: PG_PASSWORD,
    database: ADMIN_DB
  })

  await adminClient.connect()
  try {
    // Kill existing connections
    await adminClient.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [DEMO_DB]
    )
    await adminClient.query(`DROP DATABASE IF EXISTS "${DEMO_DB}"`)
    await adminClient.query(`CREATE DATABASE "${DEMO_DB}"`)
    console.log(`[seed] Created database "${DEMO_DB}" on ${PG_HOST}:${PG_PORT}`)
  } finally {
    await adminClient.end()
  }
}

// ---------------------------------------------------------------------------
// Data definitions
// ---------------------------------------------------------------------------

const DEMO_USERS = [
  { display_name: 'Alexandra Schmidt',  email: 'alex@nebulynk.dev',   role: 'admin',  status: 'online',  custom_status: 'Bereit für Fragen', custom_status_emoji: '💬' },
  { display_name: 'Marco Weber',         email: 'marco@nebulynk.dev',  role: 'admin',  status: 'online',  custom_status: 'Im Meeting',        custom_status_emoji: '🎥' },
  { display_name: 'Sarah Klein',         email: 'sarah@nebulynk.dev',  role: 'member', status: 'online',  custom_status: null,                custom_status_emoji: null },
  { display_name: 'Tobias Frank',        email: 'tobias@nebulynk.dev', role: 'member', status: 'online',  custom_status: '🔧 Dev work',       custom_status_emoji: '🔧' },
  { display_name: 'Nina Becker',         email: 'nina@nebulynk.dev',   role: 'member', status: 'away',    custom_status: 'Kurze Pause',       custom_status_emoji: '☕' },
  { display_name: 'Jonas Wagner',        email: 'jonas@nebulynk.dev',  role: 'member', status: 'away',    custom_status: 'Away',              custom_status_emoji: null },
  { display_name: 'Lisa Hoffmann',       email: 'lisa@nebulynk.dev',   role: 'member', status: 'dnd',     custom_status: 'Bitte nicht stören', custom_status_emoji: '🔴' },
  { display_name: 'Daniel Roth',         email: 'daniel@nebulynk.dev', role: 'member', status: 'offline', custom_status: null,                custom_status_emoji: null },
  { display_name: 'Emma Zimmermann',     email: 'emma@nebulynk.dev',   role: 'member', status: 'offline', custom_status: null,                custom_status_emoji: null },
  { display_name: 'Felix Bauer',         email: 'felix@nebulynk.dev',  role: 'member', status: 'offline', custom_status: null,                custom_status_emoji: null },
  { display_name: 'Clara Vogel',         email: 'clara@nebulynk.dev',  role: 'member', status: 'offline', custom_status: null,                custom_status_emoji: null },
  { display_name: 'Michael Richter',     email: 'michael@nebulynk.dev',role: 'member', status: 'offline', custom_status: null,                custom_status_emoji: null }
]

const DEMO_CHANNELS = [
  { name: 'allgemein',    description: 'Firmenweite Ankündigungen und allgemeine Themen', topic: 'Willkommen bei Nebulynk!', type: 'public' },
  { name: 'engineering',  description: 'Entwicklung, Code-Reviews und Tech-Diskussionen', topic: 'Sprint 42 läuft',          type: 'public' },
  { name: 'sales',        description: 'Vertrieb, Pipeline und Kundengespräche',          topic: 'Q3 Ziele',                 type: 'private' },
  { name: 'design',       description: 'UI/UX, Branding und Design-Feedback',             topic: 'Neues Design System',      type: 'public' },
  { name: 'random',       description: 'Off-Topic, Memes und Kaffeegespräche',            topic: 'Freitags-Memes',           type: 'public' }
]

// ---------------------------------------------------------------------------
// Seed logic
// ---------------------------------------------------------------------------

async function seedUsers(db) {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS)
  const users = []

  for (let i = 0; i < DEMO_USERS.length; i++) {
    const u = DEMO_USERS[i]
    const id = createId()
    const user = {
      id,
      email: u.email,
      password: passwordHash,
      display_name: u.display_name,
      avatar_url: avatarUrl(u.email),
      status: u.status,
      custom_status: u.custom_status,
      custom_status_emoji: u.custom_status_emoji,
      is_admin: u.role === 'admin',
      is_verified: true,
      account_type: 'member',
      preferred_locale: 'de',
      theme_preference: 'platform',
      webauthn_user_id: generateWebauthnUserId(),
      created_at: daysAgo(30 - i),
      updated_at: now()
    }
    users.push(user)
    await db('users').insert(user)
  }

  // Assign RBAC roles
  const adminRole = await db('roles').where({ name: 'platform:admin' }).first()
  const memberRole = await db('roles').where({ name: 'platform:member' }).first()

  if (adminRole && memberRole) {
    for (const u of users) {
      await db('user_roles').insert({
        id: createId(),
        user_id: u.id,
        role_id: u.is_admin ? adminRole.id : memberRole.id
      })
    }
  }

  console.log(`[seed] Created ${users.length} users`)
  return users
}

async function seedChannels(db, users) {
  const channels = []
  const ownerId = users[0].id

  for (let i = 0; i < DEMO_CHANNELS.length; i++) {
    const c = DEMO_CHANNELS[i]
    const id = createId()
    const channel = {
      id,
      name: c.name,
      description: c.description,
      topic: c.topic,
      type: c.type,
      purpose: 'default',
      created_by: ownerId,
      is_archived: false,
      created_at: daysAgo(28 - i),
      updated_at: now()
    }
    channels.push(channel)
    await db('channels').insert(channel)
  }

  console.log(`[seed] Created ${channels.length} channels`)
  return channels
}

async function seedChannelMembers(db, users, channels) {
  const members = []
  let memberCount = 0

  for (const channel of channels) {
    // First user is owner, second is admin, rest are members
    for (let i = 0; i < users.length; i++) {
      const role = i === 0 ? 'owner' : i === 1 ? 'admin' : 'member'
      const id = createId()
      members.push({
        id,
        channel_id: channel.id,
        user_id: users[i].id,
        role,
        last_read_at: minutesAgo(Math.floor(Math.random() * 120)),
        notifications: 'all',
        created_at: daysAgo(27),
        updated_at: now()
      })
      memberCount++
    }
  }

  // Batch insert
  await db('channel_members').insert(members)
  console.log(`[seed] Created ${memberCount} channel members`)
}

async function seedDms(db, users) {
  // Create 3 DM channels
  const dmPairs = [
    [users[0], users[2]],  // Alexandra <-> Sarah
    [users[1], users[3]],  // Marco <-> Tobias
    [users[0], users[4]]   // Alexandra <-> Nina
  ]

  const dmChannels = []

  for (const [userA, userB] of dmPairs) {
    const channelId = createId()
    const channel = {
      id: channelId,
      name: `DM_${userA.display_name}_${userB.display_name}`,
      type: 'dm',
      purpose: 'default',
      created_by: userA.id,
      is_archived: false,
      created_at: daysAgo(10),
      updated_at: now()
    }
    await db('channels').insert(channel)
    dmChannels.push(channel)

    // Add both users as members
    await db('channel_members').insert([
      {
        id: createId(),
        channel_id: channelId,
        user_id: userA.id,
        role: 'member',
        last_read_at: minutesAgo(30),
        notifications: 'all',
        created_at: daysAgo(10),
        updated_at: now()
      },
      {
        id: createId(),
        channel_id: channelId,
        user_id: userB.id,
        role: 'member',
        last_read_at: hoursAgo(2),
        notifications: 'all',
        created_at: daysAgo(10),
        updated_at: now()
      }
    ])
  }

  console.log(`[seed] Created ${dmChannels.length} DM channels`)
  return dmChannels
}

async function seedMessages(db, users, channels) {
  const messages = []

  // General channel conversation
  const general = channels[0]
  const engineering = channels[1]
  const sales = channels[2]
  const design = channels[3]
  const random = channels[4]

  const conversations = {
    [general.id]: [
      { user: 0, text: 'Guten Morgen zusammen! ☀️ Hoffentlich habt ihr gut geschlafen.', mins: 180 },
      { user: 2, text: 'Morgen! Ja, danke. Bereit für den Sprint-Review heute Nachmittag?', mins: 175 },
      { user: 1, text: 'Klar! Ich habe die Präsentation vorbereitet. Die neuen Features sehen gut aus.', mins: 170 },
      { user: 4, text: 'Kann jemand die Notizen vom letzten Retro teilen? Ich finde sie nicht mehr 😅', mins: 160 },
      { user: 0, text: 'Klar, ich lade sie gleich hoch. @Nina Becker du hattest doch die Action Items notiert, oder?', mins: 155 },
      { user: 4, text: 'Genau! Ich schicke sie dir direkt per DM.', mins: 150 },
      { user: 3, text: 'FYI: Das Deployment von v2.4 lief erfolgreich durch. Alle Services sind online. ✅', mins: 90 },
      { user: 6, text: 'Super, danke Tobias! Ich aktualisiere die Release Notes.', mins: 85 },
      { user: 1, text: 'Perfekt. Das Sprint-Review ist um 14:00 im großen Meeting-Raum. Bitte seid pünktlich! 📅', mins: 60 },
      { user: 2, text: 'Ich habe eine Demo vorbereitet — die neue Echtzeit-Suche ist echt beeindruckend geworden.', mins: 45 },
      { user: 0, text: 'Klingt großartig! Ich freue mich darauf. Bis dann! 👋', mins: 30 }
    ],
    [engineering.id]: [
      { user: 3, text: 'Hat jemand Erfahrung mit dem neuen Knex Migration Pattern? Ich bekomme einen seltsamen Fehler.', mins: 200 },
      { user: 0, text: 'Welchen Fehler genau? Poste mal den Stack Trace.', mins: 195 },
      { user: 3, text: 'Es ist ein "relation does not exist" — ich denke die Migration läuft in der falschen Reihenfolge.', mins: 190 },
      { user: 1, text: 'Schau dir mal die Timestamps an. Migration 044 muss vor 043 laufen, das ist ein bekanntes Problem.', mins: 185 },
      { user: 3, text: 'Ah, das erklärt es! Danke Marco, das hat geholfen. 🙏', mins: 180 },
      { user: 2, text: 'Ich arbeite an der neuen Search API. Die Performance ist schon um 40% besser als vorher.', mins: 120 },
      { user: 0, text: 'Sehr cool! Hast du schon Benchmarks? Würde ich gerne im Sprint-Review zeigen.', mins: 115 },
      { user: 2, text: 'Ja, schicke ich dir nachher. Die Indizes machen den großen Unterschied.', mins: 110 },
      { user: 3, text: 'PR #482 ist ready for review. Es fixt den Socket.IO reconnect Bug.', mins: 50 },
      { user: 1, text: 'Ich schaue mir das gleich an. 👀', mins: 40 }
    ],
    [sales.id]: [
      { user: 0, text: 'Q3 Pipeline Update: Wir haben 3 neue Enterprise Leads diese Woche.', mins: 300 },
      { user: 5, text: 'Großartig! Wie sieht es mit dem ACME Deal aus?', mins: 290 },
      { user: 0, text: 'Sollte nächste Woche closen. Verhandlung läuft gut, der Kunde ist sehr interessiert.', mins: 280 },
      { user: 5, text: 'Perfekt. Das wäre unser größter Deal dieses Quartal.', mins: 270 },
      { user: 7, text: 'Ich habe das Demo-Material für den Termin am Freitag vorbereitet.', mins: 150 },
      { user: 0, text: 'Danke Daniel! Schick es mir bitte zur Review durch.', mins: 145 }
    ],
    [design.id]: [
      { user: 6, text: 'Neue Design-Tokens sind im Figma verfügbar. Bitte updated eure Komponenten. 🎨', mins: 240 },
      { user: 4, text: 'Sieht super aus! Die neue Color Palette ist viel harmonischer.', mins: 235 },
      { user: 6, text: 'Danke! Ich habe mich von den neuesten Accessibility Guidelines inspirieren lassen.', mins: 230 },
      { user: 8, text: 'Können wir die Button-Variants nochmal diskutieren? Ich bin nicht ganz glücklich mit dem Secondary Button.', mins: 100 },
      { user: 6, text: 'Klar, lass uns morgen ein 30-Min Design Sync machen. Ich schicke eine Einladung.', mins: 95 },
      { user: 8, text: 'Perfekt, danke! 🙌', mins: 90 }
    ],
    [random.id]: [
      { user: 4, text: 'Freitag! 🎉 Hat jemand gute Serien-Empfehlungen fürs Wochenende?', mins: 600 },
      { user: 3, text: 'Schaut euch "Dark" an, wenn ihr es noch nicht gesehen habt. Mind-blowing.', mins: 590 },
      { user: 9, text: 'Oder "The Office" für etwas leichteres 😂', mins: 580 },
      { user: 2, text: 'Kann "Severance" empfehlen — weird aber brilliant.', mins: 570 },
      { user: 4, text: 'Danke euch! Ich fange mit Severance an.', mins: 560 },
      { user: 10, text: 'Hier ist ein Meme zum Freitag. 😄', mins: 120 },
      { user: 1, text: '😂😂😂', mins: 115 },
      { user: 0, text: 'Klassisch! Schönes Wochenende allen! 🌟', mins: 30 }
    ]
  }

  for (const [channelId, convo] of Object.entries(conversations)) {
    for (const msg of convo) {
      const id = createId()
      const message = {
        id,
        channel_id: channelId,
        user_id: users[msg.user].id,
        content: msg.text,
        type: 'text',
        created_at: minutesAgo(msg.mins),
        updated_at: minutesAgo(msg.mins)
      }
      messages.push(message)
      await db('messages').insert(message)
    }
  }

  // Add a few DM messages
  const dmMessages = [
    { channelIdx: 0, user: 0, text: 'Hey Sarah, hast du kurz Zeit für das Sprint-Review?', mins: 120 },
    { channelIdx: 0, user: 2, text: 'Klar! Was brauchst du?', mins: 118 },
    { channelIdx: 0, user: 0, text: 'Kannst du die Search API Demo übernehmen? Du kennst das am besten.', mins: 116 },
    { channelIdx: 0, user: 2, text: 'Mache ich! Bereite eine kurze Slides vor. 🚀', mins: 114 },
    { channelIdx: 1, user: 1, text: 'Tobias, der PR ist approved. Kannst du mergen.', mins: 20 },
    { channelIdx: 1, user: 3, text: 'Super, mache ich gleich. Danke für die schnelle Review! 🙏', mins: 15 },
    { channelIdx: 2, user: 0, text: 'Nina, kannst du mir die Retro-Notizen schicken?', mins: 90 },
    { channelIdx: 2, user: 4, text: 'Klar, schicke sie dir direkt! Eine Sekunde.', mins: 88 },
    { channelIdx: 2, user: 4, text: 'Hier sind sie: Die wichtigsten Action Items sind dokumentiert.', mins: 85 },
    { channelIdx: 2, user: 0, text: 'Danke dir! 🙌', mins: 82 }
  ]

  // Get DM channels
  const dmChannels = await db('channels').where({ type: 'dm' }).select('id')

  for (const msg of dmMessages) {
    const id = createId()
    const message = {
      id,
      channel_id: dmChannels[msg.channelIdx].id,
      user_id: users[msg.user].id,
      content: msg.text,
      type: 'text',
      created_at: minutesAgo(msg.mins),
      updated_at: minutesAgo(msg.mins)
    }
    messages.push(message)
    await db('messages').insert(message)
  }

  console.log(`[seed] Created ${messages.length} messages`)
  return messages
}

async function seedReactions(db, messages) {
  const emojis = ['👍', '❤️', '🎉', '😂', '🙏', '👀', '🚀']
  const reactions = []
  let count = 0

  // Add reactions to roughly every 3rd message
  for (let i = 0; i < messages.length; i += 3) {
    const msg = messages[i]
    if (!msg || msg.type !== 'text') continue

    // 1-3 reactions per message
    const numReactions = Math.floor(Math.random() * 3) + 1
    const usedEmojis = new Set()
    const usedUsers = new Set()

    for (let r = 0; r < numReactions; r++) {
      const emoji = emojis[Math.floor(Math.random() * emojis.length)]
      if (usedEmojis.has(emoji)) continue
      usedEmojis.add(emoji)

      const userIdx = Math.floor(Math.random() * DEMO_USERS.length)
      if (usedUsers.has(userIdx)) continue
      usedUsers.add(userIdx)

      const reaction = {
        id: createId(),
        message_id: msg.id,
        user_id: DEMO_USERS[userIdx] ? undefined : undefined, // will be set below
        emoji,
        created_at: minutesAgo(Math.floor(Math.random() * 60) + 10)
      }

      // We need actual user IDs — fetch them
      reactions.push(reaction)
      count++
    }
  }

  // Fetch all user IDs
  const allUsers = await db('users').select('id')

  // Now insert reactions with valid user IDs
  for (const reaction of reactions) {
    const randomUser = allUsers[Math.floor(Math.random() * allUsers.length)]
    try {
      await db('reactions').insert({
        ...reaction,
        user_id: randomUser.id
      })
    } catch {
      // Skip duplicate (unique constraint on message_id + user_id + emoji)
    }
  }

  console.log(`[seed] Created ~${count} reactions`)
}

async function seedPinnedMessages(db, messages, channels) {
  const pins = []
  const pinData = [
    { channelIdx: 0, msgIdx: 6 },  // Tobias deployment message in general
    { channelIdx: 0, msgIdx: 8 },  // Marco sprint review announcement
    { channelIdx: 1, msgIdx: 6 },  // Sarah search API message
    { channelIdx: 3, msgIdx: 0 },  // Lisa design tokens message
    { channelIdx: 0, msgIdx: 0 }   // Alexandra good morning
  ]

  for (const pin of pinData) {
    const channel = channels[pin.channelIdx]
    // Find messages in this channel
    const channelMessages = await db('messages')
      .where({ channel_id: channel.id })
      .orderBy('created_at', 'asc')
      .select('id')

    const msg = channelMessages[pin.msgIdx]
    if (!msg) continue

    const pinnedBy = await db('users').first('id').orderBy('created_at', 'asc')

    try {
      await db('pinned_messages').insert({
        id: createId(),
        channel_id: channel.id,
        message_id: msg.id,
        pinned_by: pinnedBy.id,
        created_at: daysAgo(5)
      })
      pins.push(msg.id)
    } catch {
      // Skip duplicates
    }
  }

  console.log(`[seed] Created ${pins.length} pinned messages`)
}

async function seedFiles(db, messages, users) {
  const files = [
    { name: 'Sprint-Review-v2.4.pdf',     mime: 'application/pdf',         size: 2456789, user: 1 },
    { name: 'design-tokens-v3.png',        mime: 'image/png',               size: 892341,  user: 6 },
    { name: 'retro-action-items.docx',     mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 45678, user: 4 },
    { name: 'architecture-diagram.png',    mime: 'image/png',               size: 1234567, user: 3 }
  ]

  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    await db('files').insert({
      id: createId(),
      message_id: null,
      user_id: users[f.user].id,
      original_name: f.name,
      storage_key: `demo/${createId()}/${f.name}`,
      mime_type: f.mime,
      size: f.size,
      bucket: 'nebulynk-files',
      purpose: 'attachment',
      created_at: daysAgo(7 - i),
      updated_at: daysAgo(7 - i)
    })
  }

  console.log(`[seed] Created ${files.length} file metadata entries`)
}

async function seedMeetings(db, users, channels) {
  // Meeting 1: Active meeting
  const activeMeetingId = createId()
  const chatChannel1 = createId()

  // Create chat channel for the active meeting
  await db('channels').insert({
    id: chatChannel1,
    name: 'meeting-sprint-review-42',
    type: 'private',
    purpose: 'meeting',
    created_by: users[1].id,
    is_archived: false,
    created_at: minutesAgo(30),
    updated_at: now()
  })

  // Add members to meeting chat channel
  const meeting1Members = users.slice(0, 7).map((u, i) => ({
    id: createId(),
    channel_id: chatChannel1,
    user_id: u.id,
    role: i === 1 ? 'owner' : 'member',
    last_read_at: minutesAgo(5),
    notifications: 'all',
    created_at: minutesAgo(30),
    updated_at: now()
  }))
  await db('channel_members').insert(meeting1Members)

  await db('meetings').insert({
    id: activeMeetingId,
    title: 'Sprint 42 Review',
    status: 'active',
    source_channel_id: channels[0].id,
    chat_channel_id: chatChannel1,
    host_user_id: users[1].id,
    language: 'de',
    started_at: minutesAgo(30),
    ended_at: null,
    ended_by: null,
    created_at: minutesAgo(30),
    updated_at: now()
  })

  // Add participants to active meeting
  const activeParticipants = users.slice(0, 6).map((u, i) => ({
    id: createId(),
    meeting_id: activeMeetingId,
    user_id: u.id,
    role: i === 1 ? 'host' : 'participant',
    invite_status: 'joined',
    invited_at: minutesAgo(35),
    joined_at: minutesAgo(30 - i * 2),
    left_at: null,
    created_at: minutesAgo(35),
    updated_at: now()
  }))
  await db('meeting_participants').insert(activeParticipants)

  // Meeting 2: Ended meeting with transcript and summary
  const endedMeetingId = createId()
  const chatChannel2 = createId()

  await db('channels').insert({
    id: chatChannel2,
    name: 'meeting-product-sync',
    type: 'private',
    purpose: 'meeting',
    created_by: users[0].id,
    is_archived: false,
    created_at: daysAgo(2),
    updated_at: daysAgo(2)
  })

  const meeting2Members = users.slice(0, 8).map((u, i) => ({
    id: createId(),
    channel_id: chatChannel2,
    user_id: u.id,
    role: i === 0 ? 'owner' : 'member',
    last_read_at: daysAgo(2),
    notifications: 'all',
    created_at: daysAgo(2),
    updated_at: daysAgo(2)
  }))
  await db('channel_members').insert(meeting2Members)

  await db('meetings').insert({
    id: endedMeetingId,
    title: 'Product Sync - Q3 Roadmap',
    status: 'ended',
    source_channel_id: channels[0].id,
    chat_channel_id: chatChannel2,
    host_user_id: users[0].id,
    language: 'de',
    started_at: daysAgo(2),
    ended_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000).toISOString(),
    ended_by: users[0].id,
    created_at: daysAgo(2),
    updated_at: daysAgo(2)
  })

  const endedParticipants = users.slice(0, 7).map((u, i) => ({
    id: createId(),
    meeting_id: endedMeetingId,
    user_id: u.id,
    role: i === 0 ? 'host' : 'participant',
    invite_status: 'left',
    invited_at: daysAgo(2),
    joined_at: daysAgo(2),
    left_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 40 * 60 * 1000).toISOString(),
    created_at: daysAgo(2),
    updated_at: daysAgo(2)
  }))
  await db('meeting_participants').insert(endedParticipants)

  // Meeting 3: Scheduled (future) meeting
  const scheduledMeetingId = createId()
  const chatChannel3 = createId()

  await db('channels').insert({
    id: chatChannel3,
    name: 'meeting-all-hands',
    type: 'private',
    purpose: 'meeting',
    created_by: users[0].id,
    is_archived: false,
    created_at: hoursAgo(5),
    updated_at: hoursAgo(5)
  })

  const meeting3Members = users.map((u, i) => ({
    id: createId(),
    channel_id: chatChannel3,
    user_id: u.id,
    role: i === 0 ? 'owner' : 'member',
    last_read_at: hoursAgo(5),
    notifications: 'all',
    created_at: hoursAgo(5),
    updated_at: hoursAgo(5)
  }))
  await db('channel_members').insert(meeting3Members)

  await db('meetings').insert({
    id: scheduledMeetingId,
    title: 'All-Hands Meeting - July 2026',
    status: 'scheduled',
    source_channel_id: channels[0].id,
    chat_channel_id: chatChannel3,
    host_user_id: users[0].id,
    language: 'de',
    started_at: null,
    ended_at: null,
    ended_by: null,
    created_at: hoursAgo(5),
    updated_at: hoursAgo(5)
  })

  const scheduledParticipants = users.map((u, i) => ({
    id: createId(),
    meeting_id: scheduledMeetingId,
    user_id: u.id,
    role: i === 0 ? 'host' : 'participant',
    invite_status: 'invited',
    invited_at: hoursAgo(5),
    joined_at: null,
    left_at: null,
    created_at: hoursAgo(5),
    updated_at: hoursAgo(5)
  }))
  await db('meeting_participants').insert(scheduledParticipants)

  console.log(`[seed] Created 3 meetings (1 active, 1 ended, 1 scheduled)`)

  // --- Meeting artifacts (transcript + summary for ended meeting) ---

  // Transcript artifact with segments
  const transcriptSegments = [
    { speakerLabel: 'Alexandra Schmidt', startMs: 0,     endMs: 15000, text: 'Willkommen alle zum Product Sync. Heute geht es um die Q3 Roadmap und unsere Prioritäten.' },
    { speakerLabel: 'Marco Weber',       startMs: 15000, endMs: 32000, text: 'Danke Alex. Ich möchte zuerst den Status des aktuellen Sprints teilen. Wir sind auf einem guten Weg.' },
    { speakerLabel: 'Sarah Klein',       startMs: 32000, endMs: 48000, text: 'Die Search API ist fast fertig. Die Performance-Tests sehen sehr gut aus — 40% schneller.' },
    { speakerLabel: 'Tobias Frank',      startMs: 48000, endMs: 65000, text: 'Ich habe das Deployment-Problem gelöst. Die Migrations-Reihenfolge war das Problem, wie Marco vermutet hat.' },
    { speakerLabel: 'Nina Becker',       startMs: 65000, endMs: 80000, text: 'Aus QA-Sicht: Wir haben 95% Test-Abdeckung. Die verbleibenden Tests sind für nächste Woche geplant.' },
    { speakerLabel: 'Alexandra Schmidt', startMs: 80000, endMs: 95000, text: 'Perfekt. Lass uns über die Q3 Prioritäten sprechen. Ich schlage vor, wir fokussieren uns auf Performance und UX.' },
    { speakerLabel: 'Lisa Hoffmann',     startMs: 95000, endMs: 110000, text: 'Aus Design-Sicht stimme ich zu. Das neue Design-System ist bereit für die Implementierung.' },
    { speakerLabel: 'Alexandra Schmidt', startMs: 110000, endMs: 120000, text: 'Großartig. Dann lassen wir es dabei. Danke für eure Arbeit! Das nächste Meeting ist in zwei Wochen.' }
  ]

  await db('meeting_artifacts').insert({
    id: createId(),
    meeting_id: endedMeetingId,
    artifact_type: 'transcript',
    status: 'ready',
    payload: { segments: transcriptSegments },
    created_at: daysAgo(2),
    updated_at: daysAgo(2)
  })

  // Summary artifact
  const summaryText = `## Meeting Zusammenfassung: Product Sync - Q3 Roadmap

**Datum:** vor 2 Tagen
**Teilnehmer:** 7

### Hauptpunkte:
1. **Sprint Status:** Der aktuelle Sprint ist auf gutem Weg. Alle wichtigen Features sind implementiert.
2. **Search API:** Sarah berichtet von 40% Performance-Verbesserung. Fast bereit für Release.
3. **Deployment:** Tobias hat das Migrations-Problem gelöst (Reihenfolge-Problem, wie Marco vermutet hat).
4. **QA Status:** 95% Test-Abdeckung erreicht. Verbleibende Tests für nächste Woche.

### Q3 Prioritäten:
- Fokus auf **Performance** und **UX**
- Neues **Design-System** ist ready für Implementierung
- Nächstes Sync-Meeting in 2 Wochen

### Action Items:
- [ ] Sarah: Search API Benchmarks dokumentieren
- [ ] Tobias: Migrations-Reihenfolge in README dokumentieren
- [ ] Lisa: Design-System Komponentenliste finalisieren
- [ ] Nina: Verbleibende Tests nächste Woche abschließen`

  await db('meeting_artifacts').insert({
    id: createId(),
    meeting_id: endedMeetingId,
    artifact_type: 'summary',
    status: 'ready',
    payload: {
      language: 'de',
      mini_summary: 'Der Product Sync hat Sprint 42 abgeschlossen und die Q3-Roadmap auf Performance und UX ausgerichtet. Die Search API ist fast releasebereit, das Deployment-Problem ist geloest, und das Design-System bildet die Grundlage fuer die naechsten UX-Arbeiten.',
      summary_points: [
        'Sprint 42 ist auf Kurs; die wichtigsten Features sind implementiert.',
        'Die neue Search API erreicht rund 40% bessere Performance und steht kurz vor dem Release.',
        'Das Deployment-Problem wurde auf die Migrations-Reihenfolge zurueckgefuehrt und behoben.',
        'QA meldet 95% Test-Abdeckung; verbleibende Tests sind fuer naechste Woche geplant.',
        'Q3 fokussiert sich auf Performance und UX, gestuetzt durch das neue Design-System.'
      ],
      decisions: [
        {
          id: 'decision-1',
          text: 'Q3 priorisiert Performance und UX als gemeinsame Produkt- und Engineering-Schwerpunkte.'
        },
        {
          id: 'decision-2',
          text: 'Die Search API bleibt Ziel fuer den naechsten Release, sobald die Benchmarks dokumentiert sind.'
        },
        {
          id: 'decision-3',
          text: 'Neue Migrationen sollen ihre Abhaengigkeiten explizit dokumentieren.'
        }
      ],
      open_items: [
        {
          id: 'open-1',
          kind: 'risk',
          text: 'Die verbleibenden QA-Tests und bekannte Flakes koennen den Release-Termin beeinflussen.'
        },
        {
          id: 'open-2',
          kind: 'question',
          text: 'Die finale Komponentenliste des Design-Systems muss noch mit Engineering geteilt werden.'
        }
      ],
      topic_chapters: [
        {
          id: 'topic-1',
          title: 'Sprint Status',
          summary: 'Marco berichtet, dass Sprint 42 auf gutem Weg ist und die Hauptfeatures implementiert sind.',
          start_ms: 15000,
          end_ms: 32000
        },
        {
          id: 'topic-2',
          title: 'Search API Performance',
          summary: 'Sarah zeigt eine Performance-Verbesserung von 40% und bereitet die finalen Benchmarks vor.',
          start_ms: 32000,
          end_ms: 48000
        },
        {
          id: 'topic-3',
          title: 'Deployment und Migrationen',
          summary: 'Tobias bestaetigt, dass die Migrations-Reihenfolge das Deployment-Problem verursacht hat.',
          start_ms: 48000,
          end_ms: 65000
        },
        {
          id: 'topic-4',
          title: 'Q3 Roadmap',
          summary: 'Das Team einigt sich auf Performance und UX als Q3-Fokus.',
          start_ms: 80000,
          end_ms: 110000
        }
      ],
      coverage: {
        basis: ['transcript'],
        transcript_status: 'ready',
        transcript_completeness: 'complete',
        transcript_warning_count: 0,
        chat_message_count: 0,
        chat_author_count: 0
      },
      markdown: summaryText
    },
    created_at: daysAgo(2),
    updated_at: daysAgo(2)
  })

  // Meeting recording metadata
  await db('meeting_recordings').insert({
    id: createId(),
    meeting_id: endedMeetingId,
    user_id: users[0].id,
    participant_identity: 'alexandra',
    participant_display_name: 'Alexandra Schmidt',
    status: 'completed',
    storage_bucket: 'nebulynk-files',
    storage_key: `meetings/${endedMeetingId}/recording.webm`,
    mime_type: 'audio/webm',
    duration_ms: 120000,
    started_at: daysAgo(2),
    ended_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 2 * 60 * 1000).toISOString(),
    created_at: daysAgo(2),
    updated_at: daysAgo(2)
  })

  console.log(`[seed] Created meeting artifacts (transcript + summary + recording)`)

  return { activeMeetingId, endedMeetingId, scheduledMeetingId }
}

async function seedMeetingQuestions(db, users, meetingIds) {
  const questions = [
    { user: 2, question: 'Was sind die konkreten Performance-Ziele für Q3?', answer: 'Wir streben eine 50% Reduzierung der durchschnittlichen Antwortzeit an, insbesondere bei der Search API. Aktuell sind wir schon bei 40%.', lang: 'de' },
    { user: 3, question: 'Wann wird das Migrations-Problem vollständig behoben sein?', answer: 'Der Fix ist bereits im PR #484. Nach dem Review heute sollte er morgen gemerged werden. Die Dokumentation folgt in der gleichen PR.', lang: 'de' },
    { user: 6, question: 'Wie viele Komponenten umfasst das neue Design-System?', answer: 'Das Design-System umfasst 42 Komponenten in 6 Kategorien: Forms, Navigation, Feedback, Data Display, Overlay und Utilities.', lang: 'de' }
  ]

  for (const q of questions) {
    await db('meeting_questions').insert({
      id: createId(),
      meeting_id: meetingIds.endedMeetingId,
      user_id: users[q.user].id,
      question: q.question,
      answer: q.answer,
      language: q.lang,
      citations: [],
      created_at: daysAgo(2),
      updated_at: daysAgo(2)
    })
  }

  console.log(`[seed] Created ${questions.length} meeting questions`)
}

async function seedMessageSummaries(db, users, channels) {
  // Summary for the engineering channel
  const engSummary = `## Channel Zusammenfassung: #engineering

**Zeitraum:** Letzte 24 Stunden
**Nachrichten:** 10

### Wichtige Themen:
1. **Knex Migration Problem:** Tobias hatte ein "relation does not exist" Problem. Marco identifizierte ein Reihenfolge-Problem mit Migration 043/044.
2. **Search API Performance:** Sarah meldet 40% Performance-Verbesserung durch neue Indizes. Benchmarks folgen.
3. **PR Review:** PR #482 (Socket.IO reconnect Bug fix) ist ready for review.

### Action Items:
- Marco: PR #482 reviewen
- Sarah: Search API Benchmarks an Alexandra senden
- Tobias: Migrations-Dokumentation aktualisieren

### Entschlüsselungen:
- Das Migrations-Reihenfolge-Problem wurde gelöst
- Die Search API ist fast bereit für Release`

  await db('message_summaries').insert({
    id: createId(),
    channel_id: channels[1].id,
    user_id: users[0].id,
    scope: 'channel',
    status: 'ready',
    summary: engSummary,
    payload: { markdown: engSummary },
    source_message_ids: [],
    source_started_at: hoursAgo(24),
    source_ended_at: now(),
    message_count: 10,
    created_at: minutesAgo(20),
    updated_at: minutesAgo(20)
  })

  // Summary for the general channel
  const generalSummary = `## Channel Zusammenfassung: #allgemein

**Zeitraum:** Letzte 24 Stunden
**Nachrichten:** 11

### Wichtige Themen:
1. **Sprint Review:** Geplant für heute 14:00 Uhr. Marco hat die Präsentation vorbereitet.
2. **Deployment v2.4:** Erfolgreich abgeschlossen. Alle Services sind online.
3. **Retro-Notizen:** Nina teilt die Action Items vom letzten Retro per DM.

### Action Items:
- Alle: Sprint Review um 14:00 Uhr besuchen
- Alexandra: Retro-Notizen von Nina erhalten und teilen
- Lisa: Release Notes aktualisieren

### Ankündigungen:
- Das Deployment von v2.4 ist live ✅
- Die neue Echtzeit-Suche wird im Sprint-Review demonstriert`

  await db('message_summaries').insert({
    id: createId(),
    channel_id: channels[0].id,
    user_id: users[0].id,
    scope: 'channel',
    status: 'ready',
    summary: generalSummary,
    payload: { markdown: generalSummary },
    source_message_ids: [],
    source_started_at: hoursAgo(24),
    source_ended_at: now(),
    message_count: 11,
    created_at: minutesAgo(15),
    updated_at: minutesAgo(15)
  })

  console.log(`[seed] Created 2 message summaries`)
}

async function seedNotifications(db, users, channels, messages) {
  const notifs = [
    { userIdx: 0, type: 'mention', actorIdx: 4, msgIdx: 4,  channelIdx: 0, snippet: '@Alexandra Schmidt du hattest doch die Action Items notiert, oder?', read: false, mins: 155 },
    { userIdx: 0, type: 'mention', actorIdx: 3, msgIdx: 6,  channelIdx: 0, snippet: 'FYI: Das Deployment von v2.4 lief erfolgreich durch...', read: false, mins: 90 },
    { userIdx: 2, type: 'mention', actorIdx: 0, msgIdx: 8,  channelIdx: 0, snippet: 'Klar, ich lade sie gleich hoch...', read: false, mins: 60 },
    { userIdx: 3, type: 'mention', actorIdx: 1, msgIdx: 9,  channelIdx: 1, snippet: 'Schau dir mal die Timestamps an...', read: false, mins: 185 },
    { userIdx: 4, type: 'mention', actorIdx: 0, msgIdx: 4,  channelIdx: 0, snippet: '@Nina Becker du hattest doch die Action Items...', read: true, mins: 155 },
    { userIdx: 0, type: 'mention_all', actorIdx: 1, msgIdx: 8, channelIdx: 0, snippet: 'Perfekt. Das Sprint-Review ist um 14:00...', read: false, mins: 60 },
    { userIdx: 6, type: 'mention', actorIdx: 8, msgIdx: 4, channelIdx: 3, snippet: 'Können wir die Button-Variants nochmal diskutieren?', read: false, mins: 100 },
    { userIdx: 1, type: 'mention', actorIdx: 3, msgIdx: 8, channelIdx: 1, snippet: 'PR #482 ist ready for review...', read: false, mins: 50 },
    { userIdx: 0, type: 'mention', actorIdx: 2, msgIdx: 9, channelIdx: 0, snippet: 'Ich habe eine Demo vorbereitet...', read: false, mins: 45 },
    { userIdx: 5, type: 'mention', actorIdx: 0, msgIdx: 0, channelIdx: 2, snippet: 'Q3 Pipeline Update: Wir haben 3 neue Enterprise Leads...', read: true, mins: 300 }
  ]

  // Fetch messages per channel to map indices
  for (const notif of notifs) {
    const channelMessages = await db('messages')
      .where({ channel_id: channels[notif.channelIdx].id })
      .orderBy('created_at', 'asc')
      .select('id')

    const msg = channelMessages[notif.msgIdx]
    if (!msg) continue

    try {
      await db('notifications').insert({
        id: createId(),
        user_id: users[notif.userIdx].id,
        type: notif.type,
        message_id: msg.id,
        channel_id: channels[notif.channelIdx].id,
        actor_id: users[notif.actorIdx].id,
        actor_display_name: users[notif.actorIdx].display_name,
        message_snippet: notif.snippet,
        is_read: notif.read,
        created_at: minutesAgo(notif.mins)
      })
    } catch {
      // Skip on error
    }
  }

  console.log(`[seed] Created ~${notifs.length} notifications`)
}

async function seedVoiceParticipants(db, users, channels) {
  // Create a voice channel
  const voiceChannelId = createId()
  await db('channels').insert({
    id: voiceChannelId,
    name: 'Team Voice',
    description: 'Voice Channel für spontane Gespräche',
    type: 'public',
    purpose: 'default',
    created_by: users[0].id,
    is_archived: false,
    is_voice: true,
    created_at: daysAgo(20),
    updated_at: now()
  })

  // Add all users as members
  const voiceMembers = users.map((u, i) => ({
    id: createId(),
    channel_id: voiceChannelId,
    user_id: u.id,
    role: i === 0 ? 'owner' : 'member',
    last_read_at: daysAgo(1),
    notifications: 'all',
    created_at: daysAgo(20),
    updated_at: now()
  }))
  await db('channel_members').insert(voiceMembers)

  // Add 2 active voice participants
  await db('voice_participants').insert([
    {
      id: createId(),
      channel_id: voiceChannelId,
      user_id: users[2].id,
      is_muted: false,
      is_deafened: false,
      joined_at: minutesAgo(15)
    },
    {
      id: createId(),
      channel_id: voiceChannelId,
      user_id: users[3].id,
      is_muted: true,
      is_deafened: false,
      joined_at: minutesAgo(12)
    }
  ])

  console.log(`[seed] Created voice channel with 2 active participants`)
}

async function seedPlatformSettings(db) {
  const settings = [
    { key: 'initialized', value: 'true' },
    { key: 'platform_name', value: 'Nebulynk' },
    { key: 'domain', value: '' },
    { key: 'default_locale', value: 'de' },
    { key: 'auto_away_minutes', value: '15' }
  ]

  for (const s of settings) {
    const existing = await db('platform_settings').where('key', s.key).first()
    if (existing) {
      await db('platform_settings').where('key', s.key).update({ value: s.value })
    } else {
      await db('platform_settings').insert({ key: s.key, value: s.value })
    }
  }

  console.log(`[seed] Ensured platform settings`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=========================================')
  console.log('  Nebulynk Demo Data Seeder')
  console.log('=========================================')
  console.log()

  // Step 1: Create demo database
  console.log('[1/5] Creating demo database...')
  await createDemoDatabase()

  // Step 2: Connect and run migrations
  console.log('[2/5] Running migrations...')
  const db = knex({
    client: 'pg',
    connection: {
      host: PG_HOST,
      port: PG_PORT,
      database: DEMO_DB,
      user: PG_USER,
      password: PG_PASSWORD
    },
    migrations: {
      directory: resolve(__dirname, '../migrations')
    },
    pool: { min: 2, max: 10 }
  })

  await db.migrate.latest()
  console.log('[seed] Migrations complete')

  // Step 3: Seed data
  console.log('[3/5] Seeding users...')
  const users = await seedUsers(db)

  console.log('[4/5] Seeding content...')
  await seedPlatformSettings(db)
  const channels = await seedChannels(db, users)
  await seedChannelMembers(db, users, channels)
  await seedDms(db, users)
  const messages = await seedMessages(db, users, channels)
  await seedReactions(db, messages)
  await seedPinnedMessages(db, messages, channels)
  await seedFiles(db, messages, users)
  const meetingIds = await seedMeetings(db, users, channels)
  await seedMeetingQuestions(db, users, meetingIds)
  await seedMessageSummaries(db, users, channels)
  await seedNotifications(db, users, channels, messages)
  await seedVoiceParticipants(db, users, channels)

  // Step 5: Print login info
  console.log()
  console.log('[5/5] Done!')
  console.log()
  console.log('=========================================')
  console.log('  Demo Database Ready!')
  console.log('=========================================')
  console.log()
  console.log(`Database: ${DEMO_DB} on ${PG_HOST}:${PG_PORT}`)
  console.log()
  console.log('Login Credentials (all users have the same password):')
  console.log(`  Password: ${DEFAULT_PASSWORD}`)
  console.log()
  console.log('Users:')
  for (const u of DEMO_USERS) {
    const isAdmin = u.role === 'admin' ? ' [ADMIN]' : ''
    const status = u.status.padEnd(7)
    console.log(`  ${status}  ${u.email.padEnd(28)}  ${u.display_name}${isAdmin}`)
  }
  console.log()
  console.log('Next steps:')
  console.log(`  1. Set POSTGRES_DB=${DEMO_DB} in .env (or run: npm run db:switch)`)
  console.log('  2. Start backend:  npm run dev')
  console.log('  3. Start frontend: (in frontend/) npm run dev')
  console.log('  4. Start presence simulator: npm run seed:presence')
  console.log('  5. Login with any user above and take screenshots!')
  console.log()

  await db.destroy()
}

main().catch((err) => {
  console.error('[seed] FATAL:', err)
  process.exit(1)
})
