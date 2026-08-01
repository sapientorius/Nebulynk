/**
 * English Demo Data Seeder for Nebulynk.
 *
 * Creates a separate "nebulynk_demo_en" database, runs all migrations,
 * and seeds realistic English content for screenshots.
 *
 * Usage:
 *   node scripts/seed-demo-db-en.mjs            # create + migrate + seed
 *   node scripts/seed-demo-db-en.mjs --reset    # drop & recreate demo DB first
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
const DEMO_DB = process.env.DEMO_POSTGRES_DB_EN || 'nebulynk_demo_en'
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

// ---------------------------------------------------------------------------
// Data definitions
// ---------------------------------------------------------------------------

const DEMO_USERS = [
  { display_name: 'Alexandra Schmidt', email: 'alex@nebulynk.dev', role: 'admin', status: 'online', custom_status: 'Ready to help', custom_status_emoji: '💬' },
  { display_name: 'Marco Weber', email: 'marco@nebulynk.dev', role: 'admin', status: 'online', custom_status: 'In a meeting', custom_status_emoji: '🎥' },
  { display_name: 'Sarah Klein', email: 'sarah@nebulynk.dev', role: 'member', status: 'online', custom_status: null, custom_status_emoji: null },
  { display_name: 'Tobias Frank', email: 'tobias@nebulynk.dev', role: 'member', status: 'online', custom_status: '🔧 Dev work', custom_status_emoji: '🔧' },
  { display_name: 'Nina Becker', email: 'nina@nebulynk.dev', role: 'member', status: 'away', custom_status: 'Short break', custom_status_emoji: '☕' },
  { display_name: 'Jonas Wagner', email: 'jonas@nebulynk.dev', role: 'member', status: 'away', custom_status: 'Away', custom_status_emoji: null },
  { display_name: 'Lisa Hoffmann', email: 'lisa@nebulynk.dev', role: 'member', status: 'dnd', custom_status: 'Do not disturb', custom_status_emoji: '🔴' },
  { display_name: 'Daniel Roth', email: 'daniel@nebulynk.dev', role: 'member', status: 'offline', custom_status: null, custom_status_emoji: null },
  { display_name: 'Emma Zimmermann', email: 'emma@nebulynk.dev', role: 'member', status: 'offline', custom_status: null, custom_status_emoji: null },
  { display_name: 'Felix Bauer', email: 'felix@nebulynk.dev', role: 'member', status: 'offline', custom_status: null, custom_status_emoji: null },
  { display_name: 'Clara Vogel', email: 'clara@nebulynk.dev', role: 'member', status: 'offline', custom_status: null, custom_status_emoji: null },
  { display_name: 'Michael Richter', email: 'michael@nebulynk.dev', role: 'member', status: 'offline', custom_status: null, custom_status_emoji: null }
]

const DEMO_CHANNELS = [
  { name: 'general', description: 'Company-wide announcements and general topics', topic: 'Welcome to Nebulynk!', type: 'public' },
  { name: 'engineering', description: 'Development, code reviews and tech discussions', topic: 'Sprint 42 in progress', type: 'public' },
  { name: 'sales', description: 'Sales, pipeline and customer conversations', topic: 'Q3 Targets', type: 'private' },
  { name: 'design', description: 'UI/UX, branding and design feedback', topic: 'New Design System', type: 'public' },
  { name: 'random', description: 'Off-topic, memes and coffee chats', topic: 'Friday Memes', type: 'public' }
]

// ---------------------------------------------------------------------------
// Database creation
// ---------------------------------------------------------------------------

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
// Seed functions
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
      preferred_locale: 'en',
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

// ---------------------------------------------------------------------------
// DMs
// ---------------------------------------------------------------------------

async function seedDms(db, users) {
  // Create 8 DM channels (more than German seed)
  const dmPairs = [
    [users[0], users[2]],  // Alexandra <-> Sarah
    [users[1], users[3]],  // Marco <-> Tobias
    [users[0], users[4]],  // Alexandra <-> Nina
    [users[2], users[5]],  // Sarah <-> Jonas
    [users[3], users[6]],  // Tobias <-> Lisa
    [users[1], users[7]],  // Marco <-> Daniel
    [users[4], users[8]],  // Nina <-> Emma
    [users[5], users[9]]   // Jonas <-> Felix
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

  // Create 2 group DMs (3-4 people)
  const groupDm1 = createId()
  await db('channels').insert({
    id: groupDm1,
    name: 'DM_Project_Alpha_Team',
    type: 'group',
    purpose: 'default',
    created_by: users[0].id,
    is_archived: false,
    created_at: daysAgo(5),
    updated_at: now()
  })
  for (const u of users.slice(0, 4)) {
    await db('channel_members').insert({
      id: createId(),
      channel_id: groupDm1,
      user_id: u.id,
      role: u.id === users[0].id ? 'owner' : 'member',
      last_read_at: minutesAgo(60),
      notifications: 'all',
      created_at: daysAgo(5),
      updated_at: now()
    })
  }
  dmChannels.push({ id: groupDm1 })

  const groupDm2 = createId()
  await db('channels').insert({
    id: groupDm2,
    name: 'DM_Design_Sync',
    type: 'group',
    purpose: 'default',
    created_by: users[6].id,
    is_archived: false,
    created_at: daysAgo(3),
    updated_at: now()
  })
  for (const u of [users[4], users[6], users[8], users[9]]) {
    await db('channel_members').insert({
      id: createId(),
      channel_id: groupDm2,
      user_id: u.id,
      role: u.id === users[6].id ? 'owner' : 'member',
      last_read_at: minutesAgo(45),
      notifications: 'all',
      created_at: daysAgo(3),
      updated_at: now()
    })
  }
  dmChannels.push({ id: groupDm2 })

  console.log(`[seed] Created ${dmChannels.length} DM channels`)
  return dmChannels
}

// ---------------------------------------------------------------------------
// Notes (personal DM channel with only the user as member)
// ---------------------------------------------------------------------------

async function seedNotesChannels(db, users) {
  // Per-user notes content. Each entry is an array of note messages.
  const notesByUser = {
    0: [
      { text: '## Sprint 42 Review Prep\n\n- [x] Confirm agenda with Marco\n- [x] Book main meeting room\n- [ ] Send reminder to all participants\n- [ ] Prepare demo laptop with latest build\n\n**Key demo points:**\n1. New real-time search (Sarah)\n2. Design System v3 (Lisa)\n3. v2.4 deployment success (Tobias)', mins: 240 },
      { text: 'Reminder: Q3 OKR review with the leadership team next Monday. Need to finalize the roadmap slides and the hiring plan forecast before EOD Friday.', mins: 180 },
      { text: 'Idea: Could we introduce a weekly "demo Friday" where teams show what they shipped? Would boost morale and cross-team awareness. Bring it up at the next sync.', mins: 120 },
      { text: '1:1 notes — Sarah\n- Very motivated, wants to take on more responsibility\n- Suggested she could lead the Search API rollout\n- Action: Set up a mentoring pairing with Marco for next quarter', mins: 60 },
      { text: 'Personal TODO\n- [ ] Renew domain certificates (expires in 14 days)\n- [ ] Review the security audit findings from last week\n- [ ] Reply to the ACME procurement team', mins: 25 }
    ],
    1: [
      { text: '## Migration 043/044 — Root Cause\n\nThe issue was a missing dependency declaration. Migration 044 created a table that 043 expected to already exist.\n\n**Fix:** Added explicit `depends_on` in the migration header. PR #484 ready for review.', mins: 200 },
      { text: 'Architecture decision record draft:\n\n**ADR-014: Real-time search indexing**\n- Context: Search latency above 800ms p95\n- Decision: Move to incremental indexing with a background worker\n- Consequences: +1 Redis queue, simpler rollback, ~40% faster queries', mins: 150 },
      { text: 'Standup notes — Engineering\n- Sarah: Search API 40% faster, writing benchmarks\n- Tobias: Migration fix in review, Socket.IO PR ready\n- Jonas: Out of office Thursday, will pre-record update', mins: 90 },
      { text: 'Reminder: Review PR #482 (Socket.IO reconnect) and PR #484 (migration order) before EOD. Both are blocking the v2.5 cut.', mins: 30 }
    ],
    2: [
      { text: '## Search API Benchmarks\n\n| Query type | Before | After | Improvement |\n|-------------|--------|-------|-------------|\n| Prefix | 820ms | 490ms | 40% |\n| Fuzzy | 1100ms | 640ms | 42% |\n| Faceted | 950ms | 560ms | 41% |\n\nIndexes on `tsv` + GIN made the biggest difference. Next: test with 10x dataset.', mins: 220 },
      { text: 'Demo script for Sprint Review:\n1. Open the new search bar\n2. Type "deployment" — show instant results\n3. Filter by channel + date\n4. Show the fuzzy match for a typo ("deploiment")\n5. Highlight the 40% perf improvement chart', mins: 100 },
      { text: 'Learning list:\n- [ ] Finish "Designing Data-Intensive Applications" ch. 5\n- [ ] Watch the Postgres 17 release talk\n- [ ] Try the new Knex batch insert helpers', mins: 45 }
    ],
    3: [
      { text: '## Deployment Log — v2.4\n\n- Started: 09:42 UTC\n- Completed: 09:51 UTC\n- Services: api, worker, presence, egress\n- Rollback: not required\n- Health checks: all green within 30s\n\n**Post-deploy notes:** Migration 043 ran cleanly after the order fix. No customer-facing incidents reported.', mins: 260 },
      { text: 'Infra TODO\n- [ ] Rotate the egress API keys (quarterly)\n- [ ] Increase the DB connection pool to 20\n- [ ] Document the new backup retention policy', mins: 70 },
      { text: 'PR #482 — Socket.IO reconnect bug\nRoot cause: the client retried with a stale token after a reconnect. Fix clears the token on disconnect and re-auths before rejoining rooms. Added a regression test.', mins: 35 }
    ],
    4: [
      { text: '## Retro Action Items (from last retro)\n\n- [x] Document the incident response process\n- [x] Share the QA checklist with new joiners\n- [ ] Schedule a pair-testing session with Emma\n- [ ] Propose a "definition of done" update for QA', mins: 300 },
      { text: 'QA status — Sprint 42\n- 95% coverage, 12 remaining tests\n- 3 flaky tests identified in the presence suite\n- Action: stabilize flaky tests before the v2.5 cut', mins: 160 },
      { text: 'Reminder: Send the retro notes to Alexandra and update the action item tracker in the wiki.', mins: 40 }
    ],
    6: [
      { text: '## Design System v3 — Component Inventory\n\n| Category | Components | Status |\n|----------|-----------|--------|\n| Forms | 8 | Ready |\n| Navigation | 6 | Ready |\n| Feedback | 5 | Ready |\n| Data Display | 9 | In review |\n| Overlay | 7 | Ready |\n| Utilities | 7 | Ready |\n\nTotal: 42 components across 6 categories.', mins: 280 },
      { text: 'Design sync agenda (tomorrow 3pm):\n1. Button variants — secondary contrast\n2. Disabled state redesign\n3. New icon set preview\n4. Token naming convention\n5. Engineering integration Q&A', mins: 120 },
      { text: 'Feedback from Emma & Felix:\n- Secondary button: darker border, clearer hover\n- Disabled state: confusing, needs a distinct visual language\n- Suggestion: use opacity + a "locked" glyph for disabled', mins: 50 }
    ],
    8: [
      { text: 'Design review prep:\n- [x] Export the updated button variants from Figma\n- [ ] Prepare the before/after slides\n- [ ] Collect accessibility contrast screenshots\n- [ ] Share the Figma link in the meeting chat', mins: 140 },
      { text: 'Question for Lisa: Should we introduce a "destructive" button variant alongside the primary/secondary/ghost set? Would help with delete confirmations.', mins: 60 }
    ],
    9: [
      { text: 'Tickets to create this week:\n- [ ] Disabled state redesign (all components)\n- [ ] Codemod for the button variant rename\n- [ ] Migration guide for the new token names\n- [ ] Update the Storybook stories', mins: 130 },
      { text: 'Reminder: Pair with Sarah on the CSS variable integration. She mentioned the naming should match the Figma tokens 1:1.', mins: 55 }
    ]
  }

  let notesCount = 0
  let messageCount = 0

  for (const [userIdxStr, notes] of Object.entries(notesByUser)) {
    const userIdx = Number(userIdxStr)
    const user = users[userIdx]
    if (!user) continue

    const channelId = createId()
    const nowTs = now()

    await db('channels').insert({
      id: channelId,
      name: 'notes',
      type: 'dm',
      purpose: 'default',
      created_by: user.id,
      is_archived: false,
      created_at: daysAgo(15),
      updated_at: nowTs
    })

    await db('channel_members').insert({
      id: createId(),
      channel_id: channelId,
      user_id: user.id,
      role: 'owner',
      last_read_at: minutesAgo(10),
      notifications: 'all',
      created_at: daysAgo(15),
      updated_at: nowTs
    })

    notesCount++

    for (const note of notes) {
      const id = createId()
      await db('messages').insert({
        id,
        channel_id: channelId,
        user_id: user.id,
        content: note.text,
        type: 'text',
        created_at: minutesAgo(note.mins),
        updated_at: minutesAgo(note.mins)
      })
      messageCount++
    }
  }

  console.log(`[seed] Created ${notesCount} notes channels with ${messageCount} notes`)
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

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
      { user: 0, text: 'Good morning everyone! ☀️ Hope you all slept well.', mins: 180 },
      { user: 2, text: 'Morning! Yes, thanks. Ready for the sprint review this afternoon?', mins: 175 },
      { user: 1, text: 'Absolutely! I\'ve prepared the presentation. The new features look great.', mins: 170 },
      { user: 4, text: 'Can someone share the notes from the last retro? I can\'t find them anymore 😅', mins: 160 },
      { user: 0, text: 'Sure, I\'ll upload them. @Nina Becker you took the action items, right?', mins: 155 },
      { user: 4, text: 'Exactly! I\'ll send them to you via DM.', mins: 150 },
      { user: 3, text: 'FYI: The v2.4 deployment completed successfully. All services are online. ✅', mins: 90 },
      { user: 6, text: 'Great, thanks Tobias! I\'ll update the release notes.', mins: 85 },
      { user: 1, text: 'Perfect. Sprint Review is at 2:00 PM in the main meeting room. Please be on time! 📅', mins: 60 },
      { user: 2, text: 'I\'ve prepared a demo — the new real-time search is really impressive.', mins: 45 },
      { user: 0, text: 'Sounds great! Looking forward to it. See you then! 👋', mins: 30 }
    ],
    [engineering.id]: [
      { user: 3, text: 'Anyone have experience with the new Knex migration pattern? Getting a weird error.', mins: 200 },
      { user: 0, text: 'What error exactly? Post the stack trace.', mins: 195 },
      { user: 3, text: 'It\'s a "relation does not exist" — I think the migration runs in the wrong order.', mins: 190 },
      { user: 1, text: 'Check the timestamps. Migration 044 must run before 043, known issue.', mins: 185 },
      { user: 3, text: 'Ah, that explains it! Thanks Marco, that helped. 🙏', mins: 180 },
      { user: 2, text: 'Working on the new Search API. Performance is already 40% better than before.', mins: 120 },
      { user: 0, text: 'Very cool! Got benchmarks? Would love to show them at sprint review.', mins: 115 },
      { user: 2, text: 'Yeah, sending them later. The indexes make the big difference.', mins: 110 },
      { user: 3, text: 'PR #482 is ready for review. Fixes the Socket.IO reconnect bug.', mins: 50 },
      { user: 1, text: 'I\'ll take a look at it. 👀', mins: 40 }
    ],
    [sales.id]: [
      { user: 0, text: 'Q3 Pipeline Update: We have 3 new Enterprise leads this week.', mins: 300 },
      { user: 5, text: 'Great! How\'s the ACME deal looking?', mins: 290 },
      { user: 0, text: 'Should close next week. Negotiation going well, client is very interested.', mins: 280 },
      { user: 5, text: 'Perfect. That would be our biggest deal this quarter.', mins: 270 },
      { user: 7, text: 'I\'ve prepared the demo materials for Friday\'s meeting.', mins: 150 },
      { user: 0, text: 'Thanks Daniel! Please send it over for review.', mins: 145 }
    ],
    [design.id]: [
      { user: 6, text: 'New design tokens are available in Figma. Please update your components. 🎨', mins: 240 },
      { user: 4, text: 'Looks awesome! The new color palette is much more harmonious.', mins: 235 },
      { user: 6, text: 'Thanks! I was inspired by the latest accessibility guidelines.', mins: 230 },
      { user: 8, text: 'Can we discuss the button variants again? Not quite happy with the secondary button.', mins: 100 },
      { user: 6, text: 'Sure, let\'s do a 30-min design sync tomorrow. I\'ll send an invite.', mins: 95 },
      { user: 8, text: 'Perfect, thanks! 🙌', mins: 90 }
    ],
    [random.id]: [
      { user: 4, text: 'TGIF! 🎉 Anyone have good series recommendations for the weekend?', mins: 600 },
      { user: 3, text: 'Watch "Dark" if you haven\'t seen it. Mind-blowing.', mins: 590 },
      { user: 9, text: 'Or "The Office" for something lighter 😂', mins: 580 },
      { user: 2, text: 'Can recommend "Severance" — weird but brilliant.', mins: 570 },
      { user: 4, text: 'Thanks all! Starting with Severance.', mins: 560 },
      { user: 10, text: 'Here\'s a meme for Friday. 😄', mins: 120 },
      { user: 1, text: '😂😂😂', mins: 115 },
      { user: 0, text: 'Classic! Have a great weekend everyone! 🌟', mins: 30 }
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
    { channelIdx: 0, user: 0, text: 'Hey Sarah, got a minute for the sprint review?', mins: 120 },
    { channelIdx: 0, user: 2, text: 'Sure! What do you need?', mins: 118 },
    { channelIdx: 0, user: 0, text: 'Can you handle the Search API demo? You know it best.', mins: 116 },
    { channelIdx: 0, user: 2, text: 'On it! Preparing a short slide deck. 🚀', mins: 114 },
    { channelIdx: 1, user: 1, text: 'Tobias, PR is approved. You can merge.', mins: 20 },
    { channelIdx: 1, user: 3, text: 'Great, doing it now. Thanks for the quick review! 🙏', mins: 15 },
    { channelIdx: 2, user: 0, text: 'Nina, can you send me the retro notes?', mins: 90 },
    { channelIdx: 2, user: 4, text: 'Sure thing, sending them over! One sec.', mins: 88 },
    { channelIdx: 2, user: 4, text: 'Here they are: The key action items are documented.', mins: 85 },
    { channelIdx: 2, user: 0, text: 'Thanks! 🙌', mins: 82 },
    // Group DM messages
    { channelIdx: 8, user: 0, text: 'Team, Project Alpha kickoff is Monday 10am. Please review the brief beforehand.', mins: 300 },
    { channelIdx: 8, user: 2, text: 'Got it. Will go through it over the weekend.', mins: 295 },
    { channelIdx: 8, user: 1, text: 'I\'ll share the technical approach doc by EOD today.', mins: 290 },
    { channelIdx: 8, user: 3, text: 'Sounds good. See you Monday!', mins: 285 },
    // Design group DM
    { channelIdx: 9, user: 6, text: 'Design sync tomorrow at 3pm. Agenda: button variants, new icon set.', mins: 200 },
    { channelIdx: 9, user: 4, text: 'Perfect, I\'ll be there.', mins: 198 },
    { channelIdx: 9, user: 8, text: 'Count me in.', mins: 195 },
    { channelIdx: 9, user: 9, text: 'Same here.', mins: 193 }
  ]

  // Get DM channels
  const dmChannels = await db('channels').whereIn('type', ['dm', 'group']).select('id')

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

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

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
        user_id: undefined, // will be set below
        emoji,
        created_at: minutesAgo(Math.floor(Math.random() * 60) + 10)
      }

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

// ---------------------------------------------------------------------------
// Pinned Messages
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

async function seedFiles(db, messages, users) {
  const files = [
    { name: 'Sprint-Review-v2.4.pdf', mime: 'application/pdf', size: 2456789, user: 1 },
    { name: 'design-tokens-v3.png', mime: 'image/png', size: 892341, user: 6 },
    { name: 'retro-action-items.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 45678, user: 4 },
    { name: 'architecture-diagram.png', mime: 'image/png', size: 1234567, user: 3 }
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

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

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
    language: 'en',
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
    language: 'en',
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
    language: 'en',
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

  // Meeting 4: Ended meeting - Design Review (with transcript/summary)
  const designMeetingId = createId()
  const chatChannel4 = createId()

  await db('channels').insert({
    id: chatChannel4,
    name: 'meeting-design-review',
    type: 'private',
    purpose: 'meeting',
    created_by: users[6].id,
    is_archived: false,
    created_at: daysAgo(5),
    updated_at: daysAgo(5)
  })

  const designMeetingMembers = [users[4], users[6], users[8], users[9], users[2]].map((u, i) => ({
    id: createId(),
    channel_id: chatChannel4,
    user_id: u.id,
    role: i === 0 ? 'owner' : 'member',
    last_read_at: daysAgo(5),
    notifications: 'all',
    created_at: daysAgo(5),
    updated_at: daysAgo(5)
  }))
  await db('channel_members').insert(designMeetingMembers)

  await db('meetings').insert({
    id: designMeetingId,
    title: 'Design System Review',
    status: 'ended',
    source_channel_id: channels[3].id,
    chat_channel_id: chatChannel4,
    host_user_id: users[6].id,
    language: 'en',
    started_at: daysAgo(5),
    ended_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
    ended_by: users[6].id,
    created_at: daysAgo(5),
    updated_at: daysAgo(5)
  })

  const designParticipants = [users[4], users[6], users[8], users[9], users[2]].map((u, i) => ({
    id: createId(),
    meeting_id: designMeetingId,
    user_id: u.id,
    role: i === 0 ? 'host' : 'participant',
    invite_status: 'left',
    invited_at: daysAgo(5),
    joined_at: daysAgo(5),
    left_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 55 * 60 * 1000).toISOString(),
    created_at: daysAgo(5),
    updated_at: daysAgo(5)
  }))
  await db('meeting_participants').insert(designParticipants)

  // Meeting 5: Active meeting - Engineering Standup
  const standupMeetingId = createId()
  const chatChannel5 = createId()

  await db('channels').insert({
    id: chatChannel5,
    name: 'meeting-engineering-standup',
    type: 'private',
    purpose: 'meeting',
    created_by: users[1].id,
    is_archived: false,
    created_at: minutesAgo(10),
    updated_at: now()
  })

  const standupMembers = users.slice(0, 5).map((u, i) => ({
    id: createId(),
    channel_id: chatChannel5,
    user_id: u.id,
    role: i === 1 ? 'owner' : 'member',
    last_read_at: minutesAgo(5),
    notifications: 'all',
    created_at: minutesAgo(10),
    updated_at: now()
  }))
  await db('channel_members').insert(standupMembers)

  await db('meetings').insert({
    id: standupMeetingId,
    title: 'Engineering Daily Standup',
    status: 'active',
    source_channel_id: channels[1].id,
    chat_channel_id: chatChannel5,
    host_user_id: users[1].id,
    language: 'en',
    started_at: minutesAgo(10),
    ended_at: null,
    ended_by: null,
    created_at: minutesAgo(10),
    updated_at: now()
  })

  const standupParticipants = users.slice(0, 4).map((u, i) => ({
    id: createId(),
    meeting_id: standupMeetingId,
    user_id: u.id,
    role: i === 1 ? 'host' : 'participant',
    invite_status: 'joined',
    invited_at: minutesAgo(15),
    joined_at: minutesAgo(10 - i * 2),
    left_at: null,
    created_at: minutesAgo(15),
    updated_at: now()
  }))
  await db('meeting_participants').insert(standupParticipants)

  console.log(`[seed] Created 5 meetings (2 active, 2 ended, 1 scheduled)`)

  // --- Meeting artifacts (transcript + summary for ended meetings) ---

  // Transcript artifact for Product Sync
  const transcriptSegments = [
    { speakerLabel: 'Alexandra Schmidt', startMs: 0, endMs: 15000, text: 'Welcome everyone to the Product Sync. Today we\'re covering the Q3 Roadmap and our priorities.' },
    { speakerLabel: 'Marco Weber', startMs: 15000, endMs: 32000, text: 'Thanks Alex. I want to share the current sprint status first. We\'re on track.' },
    { speakerLabel: 'Sarah Klein', startMs: 32000, endMs: 48000, text: 'The Search API is almost done. Performance tests look great — 40% faster.' },
    { speakerLabel: 'Tobias Frank', startMs: 48000, endMs: 65000, text: 'I fixed the deployment issue. The migration order was the problem, just as Marco suspected.' },
    { speakerLabel: 'Nina Becker', startMs: 65000, endMs: 80000, text: 'From QA: We\'re at 95% test coverage. Remaining tests are scheduled for next week.' },
    { speakerLabel: 'Alexandra Schmidt', startMs: 80000, endMs: 95000, text: 'Perfect. Let\'s talk about Q3 priorities. I propose we focus on Performance and UX.' },
    { speakerLabel: 'Lisa Hoffmann', startMs: 95000, endMs: 110000, text: 'From Design: I agree. The new Design System is ready for implementation.' },
    { speakerLabel: 'Alexandra Schmidt', startMs: 110000, endMs: 120000, text: 'Great. Let\'s wrap it up. Thanks for your work! Next meeting in two weeks.' }
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

  // Summary artifact for Product Sync
  const summaryText = `# Meeting Summary — Product Sync: Q3 Roadmap

> **Auto-generated summary** • Based on the transcript of the recorded meeting.

| | |
|---|---|
| **Date** | 2 days ago, 10:00–10:45 |
| **Host** | Alexandra Schmidt |
| **Participants** | 7 (Alexandra, Marco, Sarah, Tobias, Nina, Lisa, Jonas) |
| **Duration** | 45 minutes |
| **Language** | English |
| **Recording** | Available (audio, 2:00 min) |

---

## Overview

The Product Sync focused on closing out Sprint 42 and aligning the team on the Q3 roadmap priorities. The sprint is on track, the new Search API is nearing release with a 40% performance gain, and the v2.4 deployment issue has been resolved. The team agreed to concentrate Q3 efforts on **Performance** and **UX**, with the new Design System as a key enabler.

---

## Key Discussion Points

### 1. Sprint 42 Status
Marco opened with the sprint status. All major features are implemented and the team is on track to close the sprint today. No blockers reported. The Sprint Review is scheduled for 2:00 PM in the main meeting room.

### 2. Search API Performance
Sarah shared the latest performance results. The new indexing approach delivers a **40% improvement** on average query latency, with fuzzy and faceted queries improving by 41–42%. Benchmarks will be documented and shared with the team before the v2.5 cut.

### 3. Deployment & Migration Fix
Tobias explained the root cause of the v2.4 deployment issue: a missing dependency declaration between migrations 043 and 044. The fix is in PR #484 and adds an explicit \`depends_on\` header. Marco had suspected the ordering issue earlier in the week.

### 4. QA Status
Nina reported 95% test coverage for the sprint. 12 tests remain, scheduled for next week. Three flaky tests in the presence suite were identified and will be stabilized before the v2.5 cut.

### 5. Q3 Priorities
Alexandra proposed focusing Q3 on **Performance** and **UX**. Lisa confirmed the new Design System is ready for implementation and will be the foundation for the UX work. The team agreed to revisit the roadmap in the next sync.

---

## Decisions Made

- **Q3 focus:** Performance and UX, anchored on the new Design System.
- **Search API:** Targeted for the v2.5 release pending final benchmarks.
- **Migration hygiene:** Explicit \`depends_on\` headers are now required for all new migrations.
- **Next sync:** Scheduled in two weeks; Alexandra will send the invite.

---

## Action Items

- [ ] **Sarah** — Document Search API benchmarks and share with the team (due Friday)
- [ ] **Tobias** — Document the migration order requirement in the README (due tomorrow)
- [ ] **Tobias** — Merge PR #484 after review (due tomorrow)
- [ ] **Marco** — Review PR #482 (Socket.IO reconnect) and PR #484 (due EOD)
- [ ] **Lisa** — Finalize the Design System component list and share with engineering
- [ ] **Nina** — Complete the remaining 12 tests and stabilize the 3 flaky presence tests (next week)
- [ ] **Alexandra** — Send the next sync invite and finalize the Q3 roadmap slides

---

## Risks & Blockers

- **Flaky presence tests** could delay the v2.5 cut if not stabilized next week.
- **Design System adoption** depends on the button variant fixes landing in Figma today.
- **ACME deal** (sales pipeline) may require a custom demo before close — Daniel to coordinate.

---

## Next Steps

1. Sprint Review today at 2:00 PM — Marco presenting, Sarah demoing the Search API.
2. Lisa updates the Figma library with the button fixes by EOD.
3. Next Product Sync in two weeks (invite pending from Alexandra).`

  await db('meeting_artifacts').insert({
    id: createId(),
    meeting_id: endedMeetingId,
    artifact_type: 'summary',
    status: 'ready',
    payload: {
      language: 'en',
      mini_summary: 'The Product Sync closed out Sprint 42 and aligned the Q3 roadmap around Performance and UX. The Search API is nearly ready with a 40% performance gain, the deployment issue has been resolved, and the Design System is ready to support the next UX push.',
      summary_points: [
        'Sprint 42 is on track and the major features are implemented.',
        'The Search API is nearly release-ready with roughly 40% better performance.',
        'The v2.4 deployment issue was traced to migration ordering and fixed.',
        'QA is at 95% coverage, with the remaining tests scheduled for next week.',
        'Q3 priorities are Performance and UX, anchored by the new Design System.'
      ],
      decisions: [
        {
          id: 'decision-1',
          text: 'Q3 work will prioritize Performance and UX across product and engineering.'
        },
        {
          id: 'decision-2',
          text: 'The Search API remains targeted for the v2.5 release after final benchmarks are documented.'
        },
        {
          id: 'decision-3',
          text: 'New migrations must document explicit dependency ordering.'
        }
      ],
      open_items: [
        {
          id: 'open-1',
          kind: 'risk',
          text: 'Remaining QA tests and flaky presence coverage could affect the v2.5 release timeline.'
        },
        {
          id: 'open-2',
          kind: 'question',
          text: 'The final Design System component list still needs to be shared with engineering.'
        }
      ],
      topic_chapters: [
        {
          id: 'topic-1',
          title: 'Sprint 42 Status',
          summary: 'Marco confirms the sprint is on track and the main features are implemented.',
          start_ms: 15000,
          end_ms: 32000
        },
        {
          id: 'topic-2',
          title: 'Search API Performance',
          summary: 'Sarah reports a 40% average latency improvement and prepares final benchmark documentation.',
          start_ms: 32000,
          end_ms: 48000
        },
        {
          id: 'topic-3',
          title: 'Deployment and Migration Fix',
          summary: 'Tobias explains that migration ordering caused the deployment issue and that PR #484 fixes it.',
          start_ms: 48000,
          end_ms: 65000
        },
        {
          id: 'topic-4',
          title: 'Q3 Roadmap',
          summary: 'The team agrees to focus Q3 on Performance and UX with the new Design System as an enabler.',
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

  // Transcript for Design Review
  const designTranscript = [
    { speakerLabel: 'Lisa Hoffmann', startMs: 0, endMs: 20000, text: 'Welcome to the Design System Review. Let\'s go through the new component library.' },
    { speakerLabel: 'Nina Becker', startMs: 20000, endMs: 35000, text: 'The new tokens look great. Color contrast passes WCAG AA across the board.' },
    { speakerLabel: 'Emma Zimmermann', startMs: 35000, endMs: 50000, text: 'I have some concerns about the button variants. The secondary button is hard to distinguish.' },
    { speakerLabel: 'Felix Bauer', startMs: 50000, endMs: 65000, text: 'Agreed. The hover state needs more contrast. Also the disabled state is confusing.' },
    { speakerLabel: 'Lisa Hoffmann', startMs: 65000, endMs: 80000, text: 'Good feedback. Let\'s adjust the secondary button — darker border, clearer hover.' },
    { speakerLabel: 'Sarah Klein', startMs: 80000, endMs: 95000, text: 'From engineering: The new tokens are easy to integrate. CSS variables work well.' },
    { speakerLabel: 'Lisa Hoffmann', startMs: 95000, endMs: 105000, text: 'Perfect. I\'ll update the Figma library today. Next review in two weeks.' }
  ]

  await db('meeting_artifacts').insert({
    id: createId(),
    meeting_id: designMeetingId,
    artifact_type: 'transcript',
    status: 'ready',
    payload: { segments: designTranscript },
    created_at: daysAgo(5),
    updated_at: daysAgo(5)
  })

  // Summary for Design Review
  const designSummary = `# Meeting Summary — Design System Review

> **Auto-generated summary** • Based on the transcript of the recorded meeting.

| | |
|---|---|
| **Date** | 5 days ago, 14:00–15:00 |
| **Host** | Lisa Hoffmann |
| **Participants** | 5 (Lisa, Nina, Emma, Felix, Sarah) |
| **Duration** | 60 minutes |
| **Language** | English |
| **Recording** | Available (audio, 1:45 min) |

---

## Overview

The Design System Review covered the new component library (v3), the accessibility validation of the design tokens, and detailed feedback on the button variants and disabled states. The team agreed on concrete adjustments to the secondary button and a full redesign of the disabled state across all components. Engineering confirmed the new CSS variable tokens are straightforward to integrate.

---

## Key Discussion Points

### 1. Design Tokens v3
Lisa walked through the new token set. All color combinations pass **WCAG AA** contrast requirements. The palette was inspired by the latest accessibility guidelines and is now available in Figma for the team to adopt.

### 2. Button Variants
Emma raised concerns about the secondary button — it is hard to distinguish from the surrounding UI, especially in dense data views. Felix agreed and added that the hover state lacks contrast. The group decided on a darker border and a clearer hover treatment.

### 3. Disabled State
Both Emma and Felix flagged the current disabled state as confusing. It relies on opacity alone, which can read as a loading state. The suggestion is to combine reduced opacity with a small "locked" glyph and a distinct cursor.

### 4. Engineering Integration
Sarah reported that the new tokens are easy to integrate as CSS variables. The naming maps 1:1 to the Figma tokens, which will reduce friction during adoption. Engineering is ready to start integration once the button fixes land.

### 5. Component Inventory
Lisa shared the component inventory: **42 components** across 6 categories (Forms, Navigation, Feedback, Data Display, Overlay, Utilities). Data Display is still in review; the remaining categories are ready.

---

## Decisions Made

- **Secondary button:** Darker border + clearer hover state. Lisa to update Figma today.
- **Disabled state:** Full redesign across all components — opacity + "locked" glyph + distinct cursor.
- **Destructive variant:** Emma to explore a dedicated destructive button variant for delete confirmations (proposal by next review).
- **Token naming:** Keep the 1:1 mapping between Figma and CSS variables.
- **Next review:** In two weeks; Emma to present the destructive variant proposal.

---

## Action Items

- [ ] **Lisa** — Update the Figma library with the secondary button fixes (due EOD today)
- [ ] **Lisa** — Share the updated Figma link in the meeting chat
- [ ] **Felix** — Create the ticket for the disabled state redesign (due today)
- [ ] **Felix** — Create a codemod for the button variant rename (due next sprint)
- [ ] **Emma** — Prepare a proposal for the destructive button variant (due next review)
- [ ] **Sarah** — Verify the CSS variable integration in the engineering spike (due Friday)
- [ ] **All designers** — Update local components with the new tokens

---

## Risks & Blockers

- **Disabled state redesign** is a breaking change — a migration guide and codemod are required to avoid blocking adoption.
- **Data Display category** is still in review and may slip past the next sprint if feedback is delayed.
- **Storybook stories** need to be updated to reflect the new variants — Felix to coordinate.

---

## Next Steps

1. Lisa publishes the updated Figma library by EOD today.
2. Felix opens the disabled state redesign ticket and the codemod ticket.
3. Sarah runs the engineering integration spike and reports back on Friday.
4. Next Design System Review in two weeks — destructive variant proposal on the agenda.`

  await db('meeting_artifacts').insert({
    id: createId(),
    meeting_id: designMeetingId,
    artifact_type: 'summary',
    status: 'ready',
    payload: {
      language: 'en',
      mini_summary: 'The Design System Review covered component library v3, accessibility validation, and feedback on button variants and disabled states. The team agreed on specific secondary-button updates, a broader disabled-state redesign, and a smooth CSS-variable integration path.',
      summary_points: [
        'Design tokens v3 are available in Figma and pass WCAG AA contrast checks.',
        'The secondary button needs a darker border and clearer hover treatment.',
        'Disabled states should use more than opacity so they do not look like loading states.',
        'Engineering confirmed the token names map cleanly to CSS variables.',
        'The library currently covers 42 components across 6 categories.'
      ],
      decisions: [
        {
          id: 'decision-1',
          text: 'Lisa will update the secondary button treatment in Figma by end of day.'
        },
        {
          id: 'decision-2',
          text: 'The disabled state will be redesigned across components with opacity, a locked glyph, and a distinct cursor.'
        },
        {
          id: 'decision-3',
          text: 'Figma token names will stay aligned 1:1 with CSS variable names.'
        }
      ],
      open_items: [
        {
          id: 'open-1',
          kind: 'risk',
          text: 'The disabled-state redesign is a breaking change and needs a migration guide plus codemod.'
        },
        {
          id: 'open-2',
          kind: 'question',
          text: 'Emma will prepare a proposal for a dedicated destructive button variant.'
        }
      ],
      topic_chapters: [
        {
          id: 'topic-1',
          title: 'Design Tokens v3',
          summary: 'Lisa introduces the new token set and Nina confirms contrast compliance.',
          start_ms: 0,
          end_ms: 35000
        },
        {
          id: 'topic-2',
          title: 'Button Variants',
          summary: 'Emma and Felix flag the secondary button and hover state as too subtle.',
          start_ms: 35000,
          end_ms: 65000
        },
        {
          id: 'topic-3',
          title: 'Disabled States',
          summary: 'The team agrees that opacity alone is ambiguous and a broader redesign is needed.',
          start_ms: 50000,
          end_ms: 80000
        },
        {
          id: 'topic-4',
          title: 'Engineering Integration',
          summary: 'Sarah confirms the tokens can be integrated cleanly as CSS variables.',
          start_ms: 80000,
          end_ms: 95000
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
      markdown: designSummary
    },
    created_at: daysAgo(5),
    updated_at: daysAgo(5)
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

  await db('meeting_recordings').insert({
    id: createId(),
    meeting_id: designMeetingId,
    user_id: users[6].id,
    participant_identity: 'lisa',
    participant_display_name: 'Lisa Hoffmann',
    status: 'completed',
    storage_bucket: 'nebulynk-files',
    storage_key: `meetings/${designMeetingId}/recording.webm`,
    mime_type: 'audio/webm',
    duration_ms: 105000,
    started_at: daysAgo(5),
    ended_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 1 * 60 * 1000).toISOString(),
    created_at: daysAgo(5),
    updated_at: daysAgo(5)
  })

  console.log(`[seed] Created meeting artifacts (transcripts + summaries + recordings)`)

  return { activeMeetingId, endedMeetingId, scheduledMeetingId, designMeetingId, standupMeetingId }
}

// ---------------------------------------------------------------------------
// Meeting Questions
// ---------------------------------------------------------------------------

async function seedMeetingQuestions(db, users, meetingIds) {
  const questions = [
    { user: 2, question: 'What are the concrete performance targets for Q3?', answer: 'We\'re targeting a 50% reduction in average response time, especially for the Search API. We\'re already at 40%.', lang: 'en' },
    { user: 3, question: 'When will the migration issue be fully resolved?', answer: 'The fix is already in PR #484. After review today it should be merged tomorrow. Documentation will follow in the same PR.', lang: 'en' },
    { user: 6, question: 'How many components does the new Design System include?', answer: 'The Design System includes 42 components across 6 categories: Forms, Navigation, Feedback, Data Display, Overlay, and Utilities.', lang: 'en' },
    { user: 4, question: 'What\'s the timeline for the button variant fixes?', answer: 'Lisa will update the Figma library today. Engineering can start integrating the fixed variants tomorrow.', lang: 'en' },
    { user: 8, question: 'Will the disabled state redesign affect existing components?', answer: 'Yes, it\'s a breaking change for the disabled state. We\'ll provide a migration guide and the Felix will create a codemod for automated updates.', lang: 'en' }
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

  // Questions for design meeting
  const designQuestions = [
    { user: 8, question: 'Can we see the updated button variants before the next review?', answer: 'Yes, Lisa will share the updated Figma file by EOD today. We\'ll also add it to the meeting chat.', lang: 'en' },
    { user: 9, question: 'Is there a timeline for the disabled state redesign?', answer: 'Felix will create the ticket today. We\'re targeting the next sprint for implementation.', lang: 'en' }
  ]

  for (const q of designQuestions) {
    await db('meeting_questions').insert({
      id: createId(),
      meeting_id: meetingIds.designMeetingId,
      user_id: users[q.user].id,
      question: q.question,
      answer: q.answer,
      language: q.lang,
      citations: [],
      created_at: daysAgo(5),
      updated_at: daysAgo(5)
    })
  }

  console.log(`[seed] Created ${questions.length + designQuestions.length} meeting questions`)
}

// ---------------------------------------------------------------------------
// Message Summaries
// ---------------------------------------------------------------------------

async function seedMessageSummaries(db, users, channels) {
  // Summary for the engineering channel
  const engSummary = `## Channel Summary: #engineering

**Period:** Last 24 hours
**Messages:** 10

### Key Topics:
1. **Knex Migration Issue:** Tobias had a "relation does not exist" problem. Marco identified an order issue with Migration 043/044.
2. **Search API Performance:** Sarah reports 40% performance improvement via new indexes. Benchmarks to follow.
3. **PR Review:** PR #482 (Socket.IO reconnect bug fix) is ready for review.

### Action Items:
- Marco: Review PR #482
- Sarah: Send Search API benchmarks to Alexandra
- Tobias: Update migration documentation

### Resolutions:
- Migration order issue resolved
- Search API nearly ready for release`

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
  const generalSummary = `## Channel Summary: #general

**Period:** Last 24 hours
**Messages:** 11

### Key Topics:
1. **Sprint Review:** Scheduled for today 2:00 PM. Marco has prepared the presentation.
2. **Deployment v2.4:** Successfully completed. All services online.
3. **Retro Notes:** Nina sharing action items from last retro via DM.

### Action Items:
- All: Attend Sprint Review at 2:00 PM
- Alexandra: Receive and share retro notes from Nina
- Lisa: Update release notes

### Announcements:
- v2.4 deployment is live ✅
- New real-time search will be demoed at Sprint Review`

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

  // Summary for design channel
  const designSummary = `## Channel Summary: #design

**Period:** Last 24 hours
**Messages:** 6

### Key Topics:
1. **Design Tokens:** New tokens available in Figma. Accessibility-inspired color palette.
2. **Button Variants:** Discussion about secondary button distinction. Design sync scheduled.
3. **Component Library:** Ready for engineering integration via CSS variables.

### Action Items:
- Lisa: Send design sync invite
- All designers: Update components with new tokens
- Engineering: Verify CSS variable integration`

  await db('message_summaries').insert({
    id: createId(),
    channel_id: channels[3].id,
    user_id: users[6].id,
    scope: 'channel',
    status: 'ready',
    summary: designSummary,
    payload: { markdown: designSummary },
    source_message_ids: [],
    source_started_at: hoursAgo(24),
    source_ended_at: now(),
    message_count: 6,
    created_at: minutesAgo(10),
    updated_at: minutesAgo(10)
  })

  console.log(`[seed] Created 3 message summaries`)
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

async function seedNotifications(db, users, channels, messages) {
  const notifs = [
    { userIdx: 0, type: 'mention', actorIdx: 4, msgIdx: 4, channelIdx: 0, snippet: '@Alexandra Schmidt you took the action items, right?', read: false, mins: 155 },
    { userIdx: 0, type: 'mention', actorIdx: 3, msgIdx: 6, channelIdx: 0, snippet: 'FYI: The v2.4 deployment completed successfully...', read: false, mins: 90 },
    { userIdx: 2, type: 'mention', actorIdx: 0, msgIdx: 8, channelIdx: 0, snippet: 'Sure, I\'ll upload them...', read: false, mins: 60 },
    { userIdx: 3, type: 'mention', actorIdx: 1, msgIdx: 9, channelIdx: 1, snippet: 'Check the timestamps. Migration 044 must run before 043...', read: false, mins: 185 },
    { userIdx: 4, type: 'mention', actorIdx: 0, msgIdx: 4, channelIdx: 0, snippet: '@Nina Becker you took the action items...', read: true, mins: 155 },
    { userIdx: 0, type: 'mention_all', actorIdx: 1, msgIdx: 8, channelIdx: 0, snippet: 'Perfect. Sprint Review is at 2:00 PM...', read: false, mins: 60 },
    { userIdx: 6, type: 'mention', actorIdx: 8, msgIdx: 4, channelIdx: 3, snippet: 'Can we discuss the button variants again?', read: false, mins: 100 },
    { userIdx: 1, type: 'mention', actorIdx: 3, msgIdx: 8, channelIdx: 1, snippet: 'PR #482 is ready for review...', read: false, mins: 50 },
    { userIdx: 0, type: 'mention', actorIdx: 2, msgIdx: 9, channelIdx: 0, snippet: 'I\'ve prepared a demo — the new real-time search...', read: false, mins: 45 },
    { userIdx: 5, type: 'mention', actorIdx: 0, msgIdx: 0, channelIdx: 2, snippet: 'Q3 Pipeline Update: We have 3 new Enterprise leads...', read: true, mins: 300 }
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

// ---------------------------------------------------------------------------
// Voice Participants
// ---------------------------------------------------------------------------

async function seedVoiceParticipants(db, users, channels) {
  // Create a voice channel with is_voice: true
  const voiceChannelId = createId()
  await db('channels').insert({
    id: voiceChannelId,
    name: 'Team Voice',
    description: 'Voice channel for spontaneous conversations',
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

// ---------------------------------------------------------------------------
// Platform Settings
// ---------------------------------------------------------------------------

async function seedPlatformSettings(db) {
  const settings = [
    { key: 'initialized', value: 'true' },
    { key: 'platform_name', value: 'Nebulynk' },
    { key: 'domain', value: '' },
    { key: 'default_locale', value: 'en' },
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
  console.log('  Nebulynk English Demo Data Seeder')
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
  const dmChannels = await seedDms(db, users)
  await seedNotesChannels(db, users)
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
  console.log('  4. Start presence simulator: npm run seed:presence:en')
  console.log('  5. Login with any user above and take screenshots!')
  console.log()

  await db.destroy()
}

main().catch((err) => {
  console.error('[seed] FATAL:', err)
  process.exit(1)
})
