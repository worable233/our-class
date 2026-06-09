import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getDb } from '../db/init.js'
import { validate } from '../middleware/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { ok, fail } from '../lib/response.js'
import { NotFoundError, ValidationError } from '../lib/errors.js'

const router = Router()

const createScoreSchema = z.object({
  student_id: z.number(),
  course: z.string().min(1),
  exam_name: z.string().min(1),
  score: z.number().min(0).max(100),
  date: z.string().optional(),
})

const updateScoreSchema = z.object({
  score: z.number().min(0).max(100),
})

// GET /api/scores?student_id=xxx&course=xxx
router.get('/', requirePermission('scores.write'), (req: Request, res: Response) => {
  const db = getDb()
  const { student_id, course } = req.query
  let sql = `SELECT s.*, u.display_name as student_name FROM scores s JOIN users u ON s.student_id = u.id WHERE 1=1`
  const params: any[] = []

  if (student_id) {
    sql += ` AND s.student_id = ?`
    params.push(Number(student_id))
  }
  if (course) {
    sql += ` AND s.course = ?`
    params.push(course)
  }

  sql += ` ORDER BY s.date`
  const scores = db.prepare(sql).all(...params)
  ok(res, scores)
})

// GET /api/scores/rankings?course=xxx&exam=xxx
router.get('/rankings', requirePermission('scores.write'), (req: Request, res: Response) => {
  const db = getDb()
  const { course, exam_name } = req.query
  let sql = `
    SELECT s.student_id, u.display_name as student_name, u.class,
           s.score, s.total_score, s.exam_name, s.course
    FROM scores s JOIN users u ON s.student_id = u.id
    WHERE 1=1`
  const params: any[] = []

  if (course) {
    sql += ` AND s.course = ?`
    params.push(course)
  }
  if (exam_name) {
    sql += ` AND s.exam_name = ?`
    params.push(exam_name)
  }

  sql += ` ORDER BY s.score DESC`

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }))
  ok(res, ranked)
})

// POST /api/scores
router.post('/', requirePermission('scores.write'), validate(createScoreSchema), (req: Request, res: Response) => {
  const db = getDb()
  const { student_id, course, exam_name, score, date } = req.body
  const result = db.prepare(
    `INSERT INTO scores (student_id, course, exam_name, score, date) VALUES (?, ?, ?, ?, ?)`,
  ).run(student_id, course, exam_name, score, date || new Date().toISOString().split('T')[0])
  ok(res, { id: result.lastInsertRowid, ...req.body })
})

// PUT /api/scores/:id
router.put('/:id', requirePermission('scores.write'), validate(updateScoreSchema), (req: Request, res: Response) => {
  const db = getDb()
  const existing = db.prepare('SELECT id FROM scores WHERE id = ?').get(req.params.id)
  if (!existing) throw new NotFoundError('成绩记录不存在')
  const { score } = req.body
  db.prepare('UPDATE scores SET score = ? WHERE id = ?').run(score, req.params.id)
  ok(res, { success: true })
})

// DELETE /api/scores/:id
router.delete('/:id', requirePermission('scores.write'), (req: Request, res: Response) => {
  const db = getDb()
  const existing = db.prepare('SELECT id FROM scores WHERE id = ?').get(req.params.id)
  if (!existing) throw new NotFoundError('成绩记录不存在')
  db.prepare('DELETE FROM scores WHERE id = ?').run(req.params.id)
  ok(res, { success: true })
})

export default router
