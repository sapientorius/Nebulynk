/**
 * Switches the POSTGRES_DB value in .env between the main dev database
 * ("nebulynk") and the demo database ("nebulynk_demo").
 *
 * Usage:
 *   node scripts/switch-db.mjs           # toggle between the two
 *   node scripts/switch-db.mjs demo      # switch to demo DB
 *   node scripts/switch-db.mjs dev       # switch to dev DB
 */

import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = resolve(__dirname, '../../.env')
const DEV_DB = 'nebulynk'
const DEMO_DB = 'nebulynk_demo'

function readEnvFile() {
  if (!existsSync(ENV_PATH)) {
    return ''
  }
  return readFileSync(ENV_PATH, 'utf8')
}

function getCurrentDb(envContent) {
  const match = envContent.match(/^POSTGRES_DB=(.+)$/m)
  if (!match) return DEV_DB
  return match[1].trim()
}

function switchDb(target) {
  const envContent = readEnvFile()
  const current = getCurrentDb(envContent)

  let next
  if (target === 'demo') {
    next = DEMO_DB
  } else if (target === 'dev') {
    next = DEV_DB
  } else {
    // Toggle
    next = current === DEMO_DB ? DEV_DB : DEMO_DB
  }

  if (current === next) {
    console.log(`[db:switch] Already using "${next}" — no change needed.`)
    return
  }

  let newContent
  if (/^POSTGRES_DB=/m.test(envContent)) {
    newContent = envContent.replace(
      /^POSTGRES_DB=.+$/m,
      `POSTGRES_DB=${next}`
    )
  } else {
    // Append if not present
    const separator = envContent.length > 0 && !envContent.endsWith('\n') ? '\n' : ''
    newContent = `${envContent}${separator}POSTGRES_DB=${next}\n`
  }

  writeFileSync(ENV_PATH, newContent, 'utf8')
  console.log(`[db:switch] POSTGRES_DB changed: "${current}" → "${next}"`)
  console.log()
  console.log(`  Active database: ${next}`)
  if (next === DEMO_DB) {
    console.log('  → Demo mode active. Restart backend to apply.')
  } else {
    console.log('  → Dev mode active. Restart backend to apply.')
  }
}

const arg = process.argv[2]
const target = arg === 'demo' ? 'demo' : arg === 'dev' ? 'dev' : 'toggle'

console.log('=========================================')
console.log('  Nebulynk DB Switcher')
console.log('=========================================')
console.log()

if (target === 'toggle') {
  const current = getCurrentDb(readEnvFile())
  console.log(`Current database: ${current}`)
  console.log(`Toggling to:      ${current === DEMO_DB ? DEV_DB : DEMO_DB}`)
  console.log()
}

switchDb(target === 'toggle' ? null : target)