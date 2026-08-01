import { createLogger, format, transports } from 'winston'

export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, ...rest }) => {
          const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : ''
          return `${timestamp} [${level}]: ${message}${extra}`
        })
      )
    })
  ]
})
