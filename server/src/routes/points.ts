import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getDb } from '../db/init.js'
import { validate } from '../middleware/validate.js'
import { ok, fail } from '../lib/response.js'
import { ValidationError } from '../lib/errors.js'

const router = Router()

const createPointSchema = z.object({
  student_id: z.number(),
  reason: z.string().min(1, '请输入原因'),
  type: z.enum(['add', 'deduct']),
  amount: z.number().int().min(1).max(100),
  date: z.string().optional(),
})

// GET /api/points?student_id=xxx&class=xxx
router.get('/', (req: Request, res: Response) => {
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
router.get('/summary', (req: Request, res: Response) => {
  const db = getDb()
  const { class: className } = req.query
  let sql = `
    SELECT u.id, u.display_name, u.class,
      COALESCE(SUM(CASE WHEN p.type = 'add' THEN p.amount ELSE 0 END), 0) as total_added,
      COALESCE(SUM(CASE WHEN p.type = 'deduct' THEN p.amount ELSE 0 END), 0) as total_deducted,
      COALESCE(SUM(CASE WHEN p.type = 'add' THEN p.amount ELSE -p.amount END), 0) as total_points
    FROM users u
    LEFT JOIN point_records p ON u.id = p.student_id
    WHERE u.role = 'student'`
  const params: (string | number)[] = []

  if (className) {
    sql += ` AND u.class = ?`
    params.push(className as string)
  }
  sql += ` GROUP BY u.id ORDER BY total_points DESC`

  ok(res, db.prepare(sql).all(...params))
})

// POST /api/points
router.post('/', validate(createPointSchema), (req: Request, res: Response) => {
  const db = getDb()
  const { student_id, reason, type, amount, date } = req.body
  const result = db.prepare(
    `INSERT INTO point_records (student_id, reason, type, amount, created_by, date) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(student_id, reason, type, amount, req.user?.id ?? 1, date ?? new Date().toISOString().split('T')[0])
  ok(res, { id: result.lastInsertRowid, ...req.body })
})

export default router
