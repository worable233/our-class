import { Router, Request, Response } from 'express'
import { getDb } from '../db/init.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'
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

router.get('/dashboard', requirePermission('audit_logs.read'), (_req: Request, res: Response) => {
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

// ── GET /api/analytics/waf-stats ──────────────────────────────────────────

router.get('/waf-stats', (_req: Request, res: Response) => {
  const db = getDb()

  // 1. Basic metrics
  const total = db.prepare("SELECT COUNT(*) as c FROM traffic_logs").get() as { c: number }
  const pv = db.prepare("SELECT COUNT(*) as c FROM traffic_logs WHERE method='GET'").get() as { c: number }
  const cities = db.prepare("SELECT COUNT(DISTINCT city) as c FROM traffic_logs WHERE city!=''").get() as { c: number }
  const intercepted = db.prepare("SELECT COUNT(*) as c FROM traffic_logs WHERE is_intercepted=1").get() as { c: number }
  const attackCities = db.prepare("SELECT COUNT(DISTINCT city) as c FROM traffic_logs WHERE is_attack=1 AND city!=''").get() as { c: number }
  const err4x = db.prepare("SELECT COUNT(*) as c FROM traffic_logs WHERE status_code>=400 AND status_code<500").get() as { c: number }
  const err5x = db.prepare("SELECT COUNT(*) as c FROM traffic_logs WHERE status_code>=500").get() as { c: number }
  const totalUpload = db.prepare("SELECT COALESCE(SUM(upload_bytes), 0) as s FROM traffic_logs").get() as { s: number }
  const totalDownload = db.prepare("SELECT COALESCE(SUM(download_bytes), 0) as s FROM traffic_logs").get() as { s: number }

  // 2. Geo distribution
  const geoRaw = db.prepare(`
    SELECT city, lat, lng, COUNT(*) as value
    FROM traffic_logs WHERE city != ''
    GROUP BY city ORDER BY value DESC
  `).all() as { city: string; lat: number; lng: number; value: number }[]

  // 3. Status code distribution
  const statusRaw = db.prepare(`
    SELECT status_code as code, COUNT(*) as count
    FROM traffic_logs GROUP BY status_code ORDER BY count DESC
  `).all() as { code: number; count: number }[]

  // 4. Client type (from user_agent)
  const clientRaw = db.prepare(`
    SELECT user_agent, COUNT(*) as count
    FROM traffic_logs GROUP BY user_agent ORDER BY count DESC
  `).all() as { user_agent: string; count: number }[]

  // Parse user agents into client types
  const clientMap = new Map<string, number>()
  for (const r of clientRaw) {
    const ua = r.user_agent
    let type = 'Unknown'
    if (ua.includes('Macintosh') || ua.includes('Mac OS')) type = 'MacOS'
    else if (ua.includes('Windows')) type = 'Windows'
    else if (ua.includes('curl') || ua.includes('python') || ua.includes('Go-http')) type = 'Go-http-client'
    else if (ua.includes('Mozilla') && ua.includes('Chrome')) type = 'Chrome'
    else if (ua.includes('Mozilla') && ua.includes('Firefox')) type = 'Firefox'
    else if (ua.includes('Edge')) type = 'Edge'
    else if (ua.includes('Mozilla')) type = 'Mozilla'
    else if (ua.includes('compatible') || ua.includes('Bot')) type = 'Unknown'
    clientMap.set(type, (clientMap.get(type) || 0) + r.count)
  }
  const clientData = Array.from(clientMap.entries()).map(([name, value]) => ({ name, value }))

  // 5. Referer domains & pages
  const refererRaw = db.prepare(`
    SELECT referer, COUNT(*) as count
    FROM traffic_logs WHERE referer != ''
    GROUP BY referer ORDER BY count DESC LIMIT 10
  `).all() as { referer: string; count: number }[]

  const refererDomains = new Map<string, number>()
  const refererPages: { url: string; count: number }[] = []
  for (const r of refererRaw) {
    refererPages.push({ url: r.referer, count: r.count })
    try {
      const u = new URL(r.referer)
      refererDomains.set(u.hostname, (refererDomains.get(u.hostname) || 0) + r.count)
    } catch {
      refererDomains.set(r.referer, (refererDomains.get(r.referer) || 0) + r.count)
    }
  }

  // 6. Visited domains & pages
  const visitedRaw = db.prepare(`
    SELECT path, COUNT(*) as count
    FROM traffic_logs GROUP BY path ORDER BY count DESC LIMIT 10
  `).all() as { path: string; count: number }[]

  const visitedDomains = Array.from(new Set(visitedRaw.map(r => r.path))).map(d => ({ domain: (() => { try { return new URL(d).hostname } catch { return d } })(), count: visitedRaw.filter(r => r.path === d).reduce((s, r) => s + r.count, 0) }))
  const visitedPages = visitedRaw.map(r => ({
    url: r.path,
    count: r.count,
  }))

  // 7. Time-series (QPS / access / intercept — hourly, 近 24 小时)
  const hourlyRaw = db.prepare(`
    SELECT strftime('%Y-%m-%d %H:00', created_at) as hour,
           COUNT(*) as total,
           SUM(CASE WHEN is_intercepted=1 THEN 1 ELSE 0 END) as intercepted
    FROM traffic_logs
    WHERE created_at >= datetime('now', '-24 hours')
    GROUP BY hour ORDER BY hour
  `).all() as { hour: string; total: number; intercepted: number }[]

  const qpsData: { time: string; value: number }[] = []
  const accessData: { time: string; value: number }[] = []
  const interceptData: { time: string; value: number }[] = []

  for (const r of hourlyRaw) {
    const time = r.hour.split(' ')[1]
    qpsData.push({ time, value: Math.round(r.total / 3600) })
    accessData.push({ time, value: r.total })
    interceptData.push({ time, value: r.intercepted })
  }

  ok(res, {
    requests: total.c,
    pv: pv.c,
    uv: cities.c,
    uniqueIps: totalUpload.s + totalDownload.s,
    intercepts: intercepted.c,
    attackIps: attackCities.c,
    err4xxCount: err4x.c,
    err4xxRate: total.c > 0 ? ((err4x.c / total.c) * 100).toFixed(1) + '%' : '0%',
    err5xxCount: err5x.c,
    err5xxRate: total.c > 0 ? ((err5x.c / total.c) * 100).toFixed(2) + '%' : '0%',
    qpsData,
    accessData,
    interceptData,
    geoData: geoRaw.map(g => ({ country: g.city, value: g.value, lat: g.lat, lng: g.lng })),
    clientData,
    statusData: statusRaw,
    refererDomains: Array.from(refererDomains.entries()).map(([domain, count]) => ({ domain, count })),
    refererPages,
    visitedDomains,
    visitedPages,
  })
})

export default router
