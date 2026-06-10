import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getDb } from '../db/init.js'
import { requirePermission } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ok, fail } from '../lib/response.js'
import { ValidationError } from '../lib/errors.js'
import { writeAuditLog } from './audit.js'

const router = Router()

const createPointSchema = z.object({
  student_id: z.number(),
  reason: z.string().min(1, '请输入原因'),
  type: z.enum(['add', 'deduct']),
  amount: z.number().int().min(1).max(100),
  date: z.string().optional(),
  review_type_id: z.number().int().optional(),
})

// GET /api/points?student_id=xxx&class=xxx
router.get('/', requirePermission('points.read'), (req: Request, res: Response) => {
  const db = getDb()
  const { student_id, class: className } = req.query
  let sql = `
    SELECT p.*, u.display_name as student_name, u.class, u2.display_name as teacher_name
    FROM point_records p
    JOIN users u ON p.student_id = u.id
    JOIN users u2 ON p.created_by = u2.id
    WHERE 1=1`
  const params: (string | number)[] = []

  if (student_id) {
    sql += ` AND p.student_id = ?`
    params.push(Number(student_id))
  }
  if (className) {
    sql += ` AND u.class = ?`
    params.push(className as string)
  }
  sql += ` ORDER BY p.id DESC LIMIT 100`

  ok(res, db.prepare(sql).all(...params))
})

// GET /api/points/summary?class=xxx
router.get('/summary', requirePermission('points.read'), (req: Request, res: Response) => {
  const db = getDb()
  const { class: className } = req.query
  let sql = `
    SELECT u.id, u.display_name, u.class,
      COALESCE(SUM(CASE WHEN p.type = 'add' THEN p.amount ELSE 0 END), 0) as total_added,
      COALESCE(SUM(CASE WHEN p.type = 'deduct' THEN p.amount ELSE 0 END), 0) as total_deducted,
      COALESCE(SUM(CASE WHEN p.type = 'add' THEN p.amount ELSE -p.amount END), 0) as total_points
    FROM users u
    LEFT JOIN point_records p ON u.id = p.student_id
    JOIN permission_groups pg ON pg.group_type = 'student'
    WHERE u.group_id = pg.id`
  const params: (string | number)[] = []

  if (className) {
    sql += ` AND u.class = ?`
    params.push(className as string)
  }
  sql += ` GROUP BY u.id ORDER BY total_points DESC`

  ok(res, db.prepare(sql).all(...params))
})

// GET /api/points/top?days=7 — 最近 N 天积分排行
router.get('/top', requirePermission('points.read'), (req: Request, res: Response) => {
  const db = getDb()
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 365)
  const rows = db.prepare(`
    SELECT u.id, u.display_name, u.class,
      SUM(CASE WHEN p.type = 'add' THEN p.amount ELSE 0 END) as total_added,
      SUM(CASE WHEN p.type = 'deduct' THEN p.amount ELSE 0 END) as total_deducted,
      SUM(CASE WHEN p.type = 'add' THEN p.amount ELSE -p.amount END) as total
    FROM point_records p
    JOIN users u ON p.student_id = u.id
    WHERE p.date >= date('now', '-' || ? || ' days')
    GROUP BY u.id
    ORDER BY total DESC
    LIMIT 10
  `).all(days)
  ok(res, rows)
})

// POST /api/points
router.post('/', requirePermission('points.write'), validate(createPointSchema), (req: Request, res: Response) => {
  const db = getDb()
  const { student_id, reason, type, amount, date, review_type_id } = req.body
  const result = db.prepare(
    `INSERT INTO point_records (student_id, reason, type, amount, created_by, date, review_type_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(student_id, reason, type, amount, req.user?.id ?? 1, date ?? new Date().toISOString().split('T')[0], review_type_id || null)
  // 写入操作日志
  const student = db.prepare('SELECT display_name FROM users WHERE id = ?').get(student_id) as { display_name: string } | undefined
  writeAuditLog(
    req.user!.id,
    req.user!.display_name,
    type === 'add' ? 'add_points' : 'deduct_points',
    'point',
    result.lastInsertRowid as number,
    { student_id, student_name: student?.display_name || '', reason, amount, type },
  )
  ok(res, { id: result.lastInsertRowid, ...req.body })
})

export default router
