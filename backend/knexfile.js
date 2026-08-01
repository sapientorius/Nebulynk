import 'dotenv/config'

export default {
  client: 'pg',
  connection: {
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: Number(process.env.POSTGRES_PORT) || 5433,
    database: process.env.POSTGRES_DB || 'nebulynk',
    user: process.env.POSTGRES_USER || 'nebulynk',
    password: process.env.POSTGRES_PASSWORD || 'nebulynk_dev_password'
  },
  migrations: {
    directory: './migrations'
  },
  pool: {
    min: 2,
    max: 10
  }
}
