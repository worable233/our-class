import { Router, Request, Response } from 'express'
import { getDb } from '../db/init.js'
import { authMiddleware } from '../middleware/auth.js'
import { ok } from '../lib/response.js'

const router = Router()
router.use(authMiddleware)

// ── Helper: track page view ───────────────────────────────────────────────

export function trackPageView(path: string) {
  try {
    const db = getDb()
    db.prepare('INSERT INTO page_views (path) VALUES (?)').run(path)
  } catch {}
}

// ── GET /api/analytics/dashboard ───────────────────────────────────────────

router.get('/dashboard', (_req: Request, res: Response) => {
  const db = getDb()

  // 1. User counts
  const totalUsers = db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number }
  const studentCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='student'").get() as { c: number }
  const teacherCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='teacher'").get() as { c: number }

  // 2. Record counts
  const totalPointRecords = db.prepare("SELECT COUNT(*) as c FROM point_records").get() as { c: number }
  const totalSubmissions = db.prepare("SELECT COUNT(*) as c FROM submissions").get() as { c: number }
  const totalMessages = db.prepare("SELECT COUNT(*) as c FROM messages").get() as { c: number }
  const totalConversations = db.prepare("SELECT COUNT(*) as c FROM conversations").get() as { c: number }

  // 3. API call trend — real data from messages table (last 30 days)
  const apiTrendRaw = db.prepare(`
    SELECT DATE(m.created_at) as date, COUNT(*) as calls,
           COALESCE(SUM(m.tokens), 0) as tokens,
           COALESCE(c.model, '') as model
    FROM messages m
    LEFT JOIN conversations c ON m.conversation_id = c.id
    WHERE m.created_at >= DATE('now', '-30 days')
    GROUP BY DATE(m.created_at), c.model
    ORDER BY date ASC
  `).all() as { date: string; calls: number; tokens: number; model: string }[]

  // Aggregate per day: sum calls, sum tokens, collect models
  const apiDayMap = new Map<string, { calls: number; tokens: number; models: Set<string> }>()
  for (const r of apiTrendRaw) {
    if (!apiDayMap.has(r.date)) apiDayMap.set(r.date, { calls: 0, tokens: 0, models: new Set() })
    const day = apiDayMap.get(r.date)!
    day.calls += r.calls
    day.tokens += r.tokens
    if (r.model) day.models.add(r.model)
  }

  // 4. Page view trend — real data from page_views (last 30 days)
  const visitTrendRaw = db.prepare(`
    SELECT DATE(visited_at) as date, COUNT(*) as visits
    FROM page_views
    WHERE visited_at >= DATE('now', '-30 days')
    GROUP BY DATE(visited_at)
    ORDER BY date ASC
  `).all() as { date: string; visits: number }[]

  // 5. Activity data — combine point_records + submissions as historical activity
  const activityRaw = db.prepare(`
    SELECT date, SUM(cnt) as visits FROM (
      SELECT date, COUNT(*) as cnt FROM point_records
        WHERE date >= DATE('now', '-30 days')
        GROUP BY date
      UNION ALL
      SELECT DATE(submitted_at) as date, COUNT(*) as cnt FROM submissions
        WHERE submitted_at >= DATE('now', '-30 days')
        GROUP BY DATE(submitted_at)
    ) GROUP BY date ORDER BY date
  `).all() as { date: string; visits: number }[]

  // Build full 30-day series, merging all data sources
  const visitTrend: { date: string; visits: number }[] = []
  const apiTrend: { date: string; calls: number; tokens: number; models: string[] }[] = []
  const now = new Date()

  const visitMap = new Map<string, number>()
  for (const r of visitTrendRaw) visitMap.set(r.date, r.visits)
  // Merge activity data for days without page_views
  for (const r of activityRaw) {
    visitMap.set(r.date, (visitMap.get(r.date) || 0) + r.visits)
  }

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    visitTrend.push({ date: dateStr, visits: visitMap.get(dateStr) || 0 })
    const day = apiDayMap.get(dateStr)
    apiTrend.push({
      date: dateStr,
      calls: day?.calls || 0,
      tokens: day?.tokens || 0,
      models: day ? [...day.models] : [],
    })
  }

  // 6. Total page views (all time)
  const totalViews = db.prepare("SELECT COUNT(*) as c FROM page_views").get() as { c: number }

  // 7. Tech stack
  const techStack = [
    { name: 'Vue 3', category: '前端框架', description: '渐进式 JavaScript 框架', color: '#4FC08D' },
    { name: 'TypeScript', category: '编程语言', description: '类型安全的 JavaScript 超集', color: '#3178C6' },
    { name: 'Vite', category: '构建工具', description: '下一代前端构建工具', color: '#646CFF' },
    { name: 'Naive UI', category: 'UI 组件库', description: 'Vue 3 组件库', color: '#5E6AD2' },
    { name: 'Tailwind CSS', category: 'CSS 框架', description: '原子化 CSS 框架', color: '#06B6D4' },
    { name: 'Express', category: '后端框架', description: 'Node.js Web 框架', color: '#666' },
    { name: 'SQLite', category: '数据库', description: '轻量级嵌入式数据库', color: '#003B57' },
    { name: 'Anthropic Claude', category: 'AI 服务', description: '大语言模型 API', color: '#D97757' },
    { name: 'Pinia', category: '状态管理', description: 'Vue 状态管理库', color: '#F7D94C' },
    { name: 'Lucide', category: '图标库', description: '开源图标库', color: '#888' },
  ]

  ok(res, {
    users: { total: totalUsers.c, students: studentCount.c, teachers: teacherCount.c },
    totalPointRecords: totalPointRecords.c,
    totalSubmissions: totalSubmissions.c,
    totalMessages: totalMessages.c,
    totalConversations: totalConversations.c,
    totalViews: totalViews.c + totalPointRecords.c + totalSubmissions.c,
    visitTrend,
    apiTrend,
    techStack,
  })
})

// ── GET /api/analytics/traffic ────────────────────────────────────────────

router.get('/traffic', (_req: Request, res: Response) => {
  const db = getDb()

  const sources = db.prepare(`
    SELECT city, lat, lng,
           COUNT(*) as count,
           COALESCE(SUM(upload_bytes),0) as upload,
           COALESCE(SUM(download_bytes),0) as download
    FROM traffic_logs
    WHERE city != ''
    GROUP BY city, lat, lng
    ORDER BY count DESC
  `).all() as { city: string; lat: number; lng: number; count: number; upload: number; download: number }[]

  const totals = db.prepare(`
    SELECT COUNT(*) as total_requests,
           COALESCE(SUM(upload_bytes),0) as total_upload,
           COALESCE(SUM(download_bytes),0) as total_download
    FROM traffic_logs
  `).get() as { total_requests: number; total_upload: number; total_download: number }

  ok(res, { sources, totals })
})

export default router
