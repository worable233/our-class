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
  let sql = `SELECT s.*, u.display_name as student_name, u.class FROM scores s JOIN users u ON s.student_id = u.id WHERE 1=1`
  const params: any[] = []

  // 班级限制：无 classes.view_all 权限时只返回自己班级的数据
  if (!req.user?.permissions?.includes('classes.view_all')) {
    const myClasses = (req.user?.class || '').split(',').filter(Boolean).map(c => c.trim())
    if (myClasses.length > 0) {
      const placeholders = myClasses.map(() => '?').join(',')
      sql += ` AND u.class IN (${placeholders})`
      params.push(...myClasses)
    }
  }

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

  // 班级限制
  if (!req.user?.permissions?.includes('classes.view_all')) {
    const myClasses = (req.user?.class || '').split(',').filter(Boolean).map(c => c.trim())
    if (myClasses.length > 0) {
      const placeholders = myClasses.map(() => '?').join(',')
      sql += ` AND u.class IN (${placeholders})`
      params.push(...myClasses)
    }
  }

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

  // 班级限制：验证学生在自己班级内
  if (!req.user?.permissions?.includes('classes.view_all')) {
    const student = db.prepare('SELECT class FROM users WHERE id = ?').get(student_id) as any
    if (!student) return fail(res, 404, 'NOT_FOUND', '学生不存在')
    const myClasses = (req.user?.class || '').split(',').filter(Boolean).map(c => c.trim())
    if (!myClasses.includes(student.class)) {
      return fail(res, 403, 'FORBIDDEN', '无权为其他班级学生录入成绩')
    }
  }

  const result = db.prepare(
    `INSERT INTO scores (student_id, course, exam_name, score, date) VALUES (?, ?, ?, ?, ?)`,
  ).run(student_id, course, exam_name, score, date || new Date().toISOString().split('T')[0])
  ok(res, { id: result.lastInsertRowid, ...req.body })
})

// PUT /api/scores/:id
router.put('/:id', requirePermission('scores.write'), validate(updateScoreSchema), (req: Request, res: Response) => {
  const db = getDb()
  const existing = db.prepare('SELECT s.*, u.class FROM scores s JOIN users u ON s.student_id = u.id WHERE s.id = ?').get(req.params.id) as any
  if (!existing) throw new NotFoundError('成绩记录不存在')

  // 班级限制
  if (!req.user?.permissions?.includes('classes.view_all')) {
    const myClasses = (req.user?.class || '').split(',').filter(Boolean).map(c => c.trim())
    if (!myClasses.includes(existing.class)) {
      return fail(res, 403, 'FORBIDDEN', '无权修改其他班级学生的成绩')
    }
  }

  const { score } = req.body
  db.prepare('UPDATE scores SET score = ? WHERE id = ?').run(score, req.params.id)
  ok(res, { success: true })
})

// DELETE /api/scores/:id
router.delete('/:id', requirePermission('scores.write'), (req: Request, res: Response) => {
  const db = getDb()
  const existing = db.prepare('SELECT s.*, u.class FROM scores s JOIN users u ON s.student_id = u.id WHERE s.id = ?').get(req.params.id) as any
  if (!existing) throw new NotFoundError('成绩记录不存在')

  // 班级限制
  if (!req.user?.permissions?.includes('classes.view_all')) {
    const myClasses = (req.user?.class || '').split(',').filter(Boolean).map(c => c.trim())
    if (!myClasses.includes(existing.class)) {
      return fail(res, 403, 'FORBIDDEN', '无权删除其他班级学生的成绩')
    }
  }

  db.prepare('DELETE FROM scores WHERE id = ?').run(req.params.id)
  ok(res, { success: true })
})

export default router
