import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import jwt from 'jsonwebtoken'
import { config } from './config/index.js'
import { errorHandler } from './middleware/errorHandler.js'
import { existsSync } from 'fs'
import { requestLogger } from './middleware/requestLogger.js'
import { authMiddleware } from './middleware/auth.js'
import { getDb } from './db/init.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

import authRoutes from './routes/auth.js'
import classRoutes from './routes/classes.js'
import studentRoutes from './routes/students.js'
import scoreRoutes from './routes/scores.js'
import assignmentRoutes from './routes/assignments.js'
import pointRoutes from './routes/points.js'
import chatRoutes from './routes/chat.js'
import chatSettingsRoutes from './routes/chat-settings.js'
import skillRoutes from './routes/skills.js'
import uploadRoutes from './routes/upload.js'
import roleRoutes from './routes/roles.js'
import auditRoutes from './routes/audit.js'
import analyticsRoutes, { trackPageView } from './routes/analytics.js'
import reviewTypeRoutes from './routes/reviewTypes.js'
import teacherRoutes from './routes/teachers.js'
import updateRoutes from './routes/update.js'
import storageRoutes from './routes/storage.js'
import backupRoutes from './routes/backup.js'
import articleRoutes from './routes/articles.js'
import siteSettingsRoutes from './routes/site-settings.js'
import courseRoutes from './routes/courses.js'

const app = express()

// ── Security ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:', 'http:'],
      connectSrc: ["'self'", 'https://api.anthropic.com', 'https://*.openai.com'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  // 禁用 HSTS——本地开发/部署场景没有 HTTPS 证书，
  // 开启 HSTS 会导致浏览器强制 HTTPS 访问失败（白屏 + TLS 错误）
  strictTransportSecurity: false,
}))

// ── Rate limiting ─────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
})

const pvLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: '请求过于频繁' } },
})

// Login rate limiter: 5 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: '登录尝试过于频繁，请 15 分钟后重试' } },
})

app.use((req, res, next) => {
  if (req.path === '/api/analytics/pv') {
    return pvLimiter(req, res, next)
  }
  limiter(req, res, next)
})

// ── CORS (from config) ────────────────────────────────────────────────
app.use(cors({ origin: config.corsOrigin.split(',').map((s) => s.trim()) }))

// ── Request logging ───────────────────────────────────────────────────
app.use(requestLogger)

// ── Body parsing ──────────────────────────────────────────────────────
app.use(express.json())

// ── Analytics: track only frontend page visits, not every API call ───
app.post('/api/analytics/pv', (req, res) => {
  const path = (req.body as any)?.path || '/'
  try { trackPageView(path) } catch {}
  res.json({ success: true })
})

// ── Static files (uploads) ────────────────────────────────────────────────
// Auth middleware — JWT valid only via Authorization header (NOT ?token= query param)
// Skip auth for article images (public content from WeChat)
app.use('/uploads', (req, res, next) => {
  if (req.path.startsWith('/articles/') || req.path.startsWith('/course_covers/')) return next()
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '未登录' } })
  }
  try {
    const payload = jwt.verify(authHeader.slice(7), config.jwtSecret) as { id: number; iat?: number }

    // Check token freshness
    const db = getDb()
    const user = db.prepare('SELECT password_changed_at FROM users WHERE id = ?').get(payload.id) as { password_changed_at: string | null } | undefined
    if (user?.password_changed_at && payload.iat) {
      const passwordChangedAt = new Date(user.password_changed_at).getTime() / 1000
      if (payload.iat < passwordChangedAt) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '登录已过期' } })
      }
    }

    next()
  } catch {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '登录已过期' } })
  }
}, express.static(join(__dirname, '..', 'uploads')))

// 聊天上传的文件存储在 storage/user_{id}/upload/，也通过 /uploads 提供访问
// 用户隔离：只能访问自己目录下的文件（管理员可访问所有）
app.use('/uploads', (req, res, next) => {
  // 从路径中提取 user_id: /user_{id}/...
  const match = req.path.match(/^\/user_(\d+)\//)
  if (!match) return next() // 非用户目录，放行

  const requestedUserId = parseInt(match[1], 10)
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '未登录' } })
  }

  try {
    const payload = jwt.verify(authHeader.slice(7), config.jwtSecret) as { id: number; role: string; iat?: number }

    // Check token freshness (same as authMiddleware)
    const db = getDb()
    const user = db.prepare('SELECT password_changed_at FROM users WHERE id = ?').get(payload.id) as { password_changed_at: string | null } | undefined
    if (user?.password_changed_at && payload.iat) {
      const passwordChangedAt = new Date(user.password_changed_at).getTime() / 1000
      if (payload.iat < passwordChangedAt) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '登录已过期' } })
      }
    }

    // 管理员（有 classes.view_all）可以访问所有文件
    if (payload.role === 'teacher' && requestedUserId !== payload.id) {
      // 检查是否有 classes.view_all 权限
      const permRows = db.prepare(`
        SELECT 1 FROM group_permissions gp
        JOIN users u ON u.group_id = gp.group_id
        WHERE u.id = ? AND gp.permission_code = 'classes.view_all'
      `).get(payload.id)
      if (!permRows) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '无权访问此文件' } })
      }
    }
    // 普通用户只能访问自己的目录
    if (payload.role === 'student' && requestedUserId !== payload.id) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '无权访问此文件' } })
    }
    next()
  } catch {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '登录已过期' } })
  }
}, express.static(join(__dirname, '..', 'storage')))

// ── Routes ────────────────────────────────────────────────────────────

// Health check endpoint (no auth required)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Public routes
app.use('/api/auth/login', loginLimiter)
app.use('/api/auth', authRoutes)

// Protected routes
app.use('/api/classes', authMiddleware, classRoutes)
app.use('/api/students', authMiddleware, studentRoutes)
app.use('/api/teachers', authMiddleware, teacherRoutes)
app.use('/api/scores', authMiddleware, scoreRoutes)
app.use('/api/assignments', authMiddleware, assignmentRoutes)
app.use('/api/points', authMiddleware, pointRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/chat', chatSettingsRoutes)
app.use('/api/chat', skillRoutes)
app.use('/api/chat', uploadRoutes)
app.use('/api/roles', authMiddleware, roleRoutes)
app.use('/api/audit', auditRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/review-types', reviewTypeRoutes)
app.use('/api/system/update', authMiddleware, updateRoutes)
app.use('/api/storage', storageRoutes)
app.use('/api/articles', articleRoutes)
app.use('/api/site-settings', siteSettingsRoutes)
app.use('/api/courses', courseRoutes)
app.use('/api/backup', backupRoutes)

// ── Frontend static files (production) ────────────────────────────────
const distPath = join(__dirname, '..', '..', 'dist')
if (existsSync(distPath)) {
  app.use(express.static(distPath))
  // SPA fallback: 所有非 API 请求返回 index.html
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(join(distPath, 'index.html'))
  })
}

// ── Error handler (must be last) ──────────────────────────────────────
app.use(errorHandler)

// ── Init DB ───────────────────────────────────────────────────────────
getDb()

app.listen(config.port, () => {
  console.log(`🚀 OurClass API running at http://localhost:${config.port}`)
})





