import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { config } from './config/index.js'
import { errorHandler } from './middleware/errorHandler.js'
import { requestLogger } from './middleware/requestLogger.js'
import { authMiddleware } from './middleware/auth.js'
import { getDb } from './db/init.js'

import authRoutes from './routes/auth.js'
import classRoutes from './routes/classes.js'
import studentRoutes from './routes/students.js'
import scoreRoutes from './routes/scores.js'
import assignmentRoutes from './routes/assignments.js'
import pointRoutes from './routes/points.js'
import chatRoutes from './routes/chat.js'
import roleRoutes from './routes/roles.js'
import auditRoutes from './routes/audit.js'
import analyticsRoutes, { trackPageView } from './routes/analytics.js'
import reviewTypeRoutes from './routes/reviewTypes.js'

const app = express()

// ── Security ──────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }))

// ── Rate limiting ─────────────────────────────────────────────────────
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
}))

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

// ── Routes ────────────────────────────────────────────────────────────

// Public routes
app.use('/api/auth', authRoutes)

// Protected routes
app.use('/api/classes', authMiddleware, classRoutes)
app.use('/api/students', authMiddleware, studentRoutes)
app.use('/api/scores', authMiddleware, scoreRoutes)
app.use('/api/assignments', authMiddleware, assignmentRoutes)
app.use('/api/points', authMiddleware, pointRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/roles', authMiddleware, roleRoutes)
app.use('/api/audit', auditRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/review-types', reviewTypeRoutes)

// ── Error handler (must be last) ──────────────────────────────────────
app.use(errorHandler)

// ── Init DB ───────────────────────────────────────────────────────────
getDb()

app.listen(config.port, () => {
  console.log(`🚀 OurClass API running at http://localhost:${config.port}`)
})




