import pino from 'pino'
import { config } from '../config/index.js'

export const logger = pino({
  level: config.logLevel,
  ...(config.nodeEnv === 'development'
    ? { transport: { target: 'pino-pretty' as const, options: { colorize: true } } }
    : {}),
})
