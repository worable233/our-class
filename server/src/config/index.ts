import dotenv from 'dotenv'
import { resolve } from 'path'

// Load .env from server/ directory (where setup wizard saves config)
dotenv.config({ path: resolve(import.meta.dirname, '..', '..', '.env') })

function envStr(key: string, fallback: string): string {
  return process.env[key] || fallback
}

function envInt(key: string, fallback: number): number {
  const v = process.env[key]
  return v ? parseInt(v, 10) : fallback
}

export const config = {
  port: envInt('PORT', 3000),
  jwtSecret: (() => {
    const secret = process.env['JWT_SECRET']
    if (!secret || secret === 'change-me') {
      throw new Error('JWT_SECRET 环境变量未设置或使用了默认值，请设置一个安全的密钥')
    }
    return secret
  })(),
  jwtExpiresIn: envStr('JWT_EXPIRES_IN', '7d'),
  corsOrigin: envStr('CORS_ORIGIN', 'http://localhost:5173'),
  nodeEnv: envStr('NODE_ENV', 'development'),
  logLevel: envStr('LOG_LEVEL', 'info'),
} as const

/**
 * 系统内置的免费 AI 模型（DeepSeek）。
 * 首次使用或 api_keys 表为空时自动填充，用户无需配置即可使用 AI 聊天。
 * 用户仍可自行添加自定义模型覆盖。
 */
export const BUILTIN_MODEL = {
  provider: 'openai' as const,
  model: 'deepseek-v4-flash',
  apiUrl: 'http://llm.zuon.top/v1',
  apiKey: 'sk-1SICxki4hWBm9pyN5qbpdl4G3OQaFpnUh0uaCiWQPCngXu7w',
} as const
