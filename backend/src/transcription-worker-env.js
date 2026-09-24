import dotenv from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: process.env.NEBULYNK_ENV_FILE || resolve(directory, '../../.env') })
