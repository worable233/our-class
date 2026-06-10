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
import articleRoutes from './routes/articles.js'

const app = express()

// ── Security ──────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }))

// ── Rate limiting ─────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
})
app.use((req, res, next) => {
  if (req.path === '/api/analytics/pv') return next() // 不限制页面浏览跟踪
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
// Auth middleware that accepts both Authorization header and ?token= query param
// Skip auth for article images (public content from WeChat)
app.use('/uploads', (req, res, next) => {
  if (req.path.startsWith('/articles/')) return next()
  const token = (req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : (req.query.token as string)) || ''
  if (!token) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '未登录' } })
  try {
    jwt.verify(token, config.jwtSecret)
    next()
  } catch {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '登录已过期' } })
  }
}, express.static(join(__dirname, '..', 'uploads')))

// ── Routes ────────────────────────────────────────────────────────────

// Public routes
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

// ── Error handler (must be last) ──────────────────────────────────────
app.use(errorHandler)

// ── Init DB ───────────────────────────────────────────────────────────
getDb()

app.listen(config.port, () => {
  console.log(`🚀 OurClass API running at http://localhost:${config.port}`)
})





