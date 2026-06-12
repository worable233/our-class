import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getDb } from '../db/init.js'
import { validate } from '../middleware/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { ok, fail } from '../lib/response.js'
import { NotFoundError, ValidationError } from '../lib/errors.js'

const router = Router()

const createScoreSchema = z.object({
  student_id: z.number().int().positive(),
  course: z.string().min(1).max(100),
  exam_name: z.string().min(1).max(100),
  score: z.number().min(0).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式无效').optional(),
})

const updateScoreSchema = z.object({
  score: z.number().min(0).max(100),
})

const batchScoreSchema = z.object({
  course: z.string().min(1).max(100),
  exam_name: z.string().min(1).max(100),
  scores: z.array(z.object({
    student_id: z.number().int().positive(),
    score: z.number().min(0).max(100),
  })).min(1).max(500),
})

const deleteExamSchema = z.object({
  course: z.string().min(1),
  exam_name: z.string().min(1),
})

// ─── 辅助：构建班级过滤 SQL ───────────────────────────────────────────────
// 安全策略：无班级分配的用户一律返回空结果，不允许穿透
function classFilter(req: Request): { sql: string; params: string[] } {
  if (req.user?.permissions?.includes('classes.view_all')) return { sql: '', params: [] }
  const myClasses = (req.user?.class || '').split(',').filter(Boolean).map(c => c.trim())
  if (myClasses.length === 0) return { sql: 'AND 1=0', params: [] }
  return { sql: `AND u.class IN (${myClasses.map(() => '?').join(',')})`, params: myClasses }
}

// ─── 辅助：验证 ID 参数 ────────────────────────────────────────────────────
function parseId(val: string | string[] | undefined): number | null {
  if (!val || Array.isArray(val)) return null
  const id = Number(val)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

// ─── GET /api/scores ────────────────────────────────────────────────────────
router.get('/', requirePermission('scores.read'), (req: Request, res: Response) => {
  const db = getDb()
  const { student_id, course, exam_name, class: cls } = req.query
  let sql = `SELECT s.id, s.student_id, s.course, s.exam_name, s.score, s.total_score, s.date, u.display_name as student_name, u.class FROM scores s JOIN users u ON s.student_id = u.id WHERE 1=1`
  const params: any[] = []

  const cf = classFilter(req)
  if (cf.sql) { sql += ' ' + cf.sql; params.push(...cf.params) }

  // 学生角色只能查自己的成绩（防 IDOR）
  if (req.user?.role === 'student') {
    sql += ` AND s.student_id = ?`
    params.push(req.user.id)
  } else if (student_id) {
    sql += ` AND s.student_id = ?`
    params.push(Number(student_id))
  }

  if (course) { sql += ` AND s.course = ?`; params.push(course) }
  if (exam_name) { sql += ` AND s.exam_name = ?`; params.push(exam_name) }
  if (cls) { sql += ` AND u.class = ?`; params.push(cls) }

  sql += ` ORDER BY s.date LIMIT 500`
  const scores = db.prepare(sql).all(...params)
  ok(res, scores)
})

// ─── GET /api/scores/exams ──────────────────────────────────────────────────
router.get('/exams', requirePermission('scores.read'), (req: Request, res: Response) => {
  const db = getDb()
  const { course } = req.query
  if (!course) return fail(res, 400, 'MISSING_COURSE', '请指定课程')

  let sql = `
    SELECT s.exam_name, MAX(s.date) as date, COUNT(*) as count
    FROM scores s JOIN users u ON s.student_id = u.id
    WHERE s.course = ?`
  const params: any[] = [course]

  const cf = classFilter(req)
  if (cf.sql) { sql += ' ' + cf.sql; params.push(...cf.params) }

  sql += ` GROUP BY s.exam_name ORDER BY MAX(s.date) DESC`
  const exams = db.prepare(sql).all(...params)
  ok(res, exams)
})

// ─── GET /api/scores/rankings ───────────────────────────────────────────────
router.get('/rankings', requirePermission('scores.read'), (req: Request, res: Response) => {
  const db = getDb()
  const { course, exam_name, class: cls } = req.query
  let sql = `
    SELECT s.student_id, u.display_name as student_name, u.class,
           s.score, s.total_score, s.exam_name, s.course
    FROM scores s JOIN users u ON s.student_id = u.id
    WHERE 1=1`
  const params: any[] = []

  const cf = classFilter(req)
  if (cf.sql) { sql += ' ' + cf.sql; params.push(...cf.params) }

  if (course) { sql += ` AND s.course = ?`; params.push(course) }
  if (exam_name) { sql += ` AND s.exam_name = ?`; params.push(exam_name) }
  if (cls) { sql += ` AND u.class = ?`; params.push(cls) }

  sql += ` ORDER BY s.score DESC LIMIT 200`

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }))
  ok(res, ranked)
})

// ─── POST /api/scores ──────────────────────────────────────────────────────
router.post('/', requirePermission('scores.write'), validate(createScoreSchema), (req: Request, res: Response) => {
  const db = getDb()
  const { student_id, course, exam_name, score, date } = req.body

  if (!req.user?.permissions?.includes('classes.view_all')) {
    const student = db.prepare('SELECT class FROM users WHERE id = ?').get(student_id) as any
    if (!student) return fail(res, 404, 'NOT_FOUND', '学生不存在')
    const myClasses = (req.user?.class || '').split(',').filter(Boolean).map(c => c.trim())
    if (myClasses.length === 0 || !myClasses.includes(student.class)) {
      return fail(res, 403, 'FORBIDDEN', '无权为其他班级学生录入成绩')
    }
  }

  const result = db.prepare(
    `INSERT INTO scores (student_id, course, exam_name, score, date) VALUES (?, ?, ?, ?, ?)`,
  ).run(student_id, course, exam_name, score, date || new Date().toISOString().split('T')[0])
  ok(res, { id: result.lastInsertRowid, student_id, course, exam_name, score, date: date || new Date().toISOString().split('T')[0] })
})

// ─── POST /api/scores/batch ────────────────────────────────────────────────
router.post('/batch', requirePermission('scores.write'), validate(batchScoreSchema), (req: Request, res: Response) => {
  const db = getDb()
  const { course, exam_name, scores: scoreList } = req.body

  const isViewAll = req.user?.permissions?.includes('classes.view_all')
  const myClasses = isViewAll
    ? null
    : (req.user?.class || '').split(',').filter(Boolean).map(c => c.trim())

  // 空班级的教师不允许批量操作
  if (!isViewAll && myClasses !== null && myClasses.length === 0) {
    return fail(res, 403, 'FORBIDDEN', '未分配班级，无法录入成绩')
  }

  let created = 0
  let updated = 0
  const errors: string[] = []

  const insertStmt = db.prepare(`INSERT INTO scores (student_id, course, exam_name, score, date) VALUES (?, ?, ?, ?, ?)`)
  const updateStmt = db.prepare(`UPDATE scores SET score = ? WHERE id = ?`)
  const findStmt = db.prepare(`SELECT id FROM scores WHERE student_id = ? AND course = ? AND exam_name = ?`)
  const studentStmt = db.prepare(`SELECT id, display_name, class FROM users WHERE id = ?`)

  const today = new Date().toISOString().split('T')[0]

  const runBatch = db.transaction(() => {
    for (const item of scoreList) {
      const student = studentStmt.get(item.student_id) as any
      if (!student) { errors.push(`学生 ID ${item.student_id} 不存在`); continue }
      if (myClasses && !myClasses.includes(student.class)) {
        errors.push(`学生 ID ${item.student_id} 不在您管理的班级中`); continue
      }
      const existing = findStmt.get(item.student_id, course, exam_name) as any
      if (existing) {
        updateStmt.run(item.score, existing.id)
        updated++
      } else {
        insertStmt.run(item.student_id, course, exam_name, item.score, today)
        created++
      }
    }
  })
  runBatch()

  ok(res, { created, updated, errors })
})

// ─── PUT /api/scores/:id ───────────────────────────────────────────────────
router.put('/:id', requirePermission('scores.write'), validate(updateScoreSchema), (req: Request, res: Response) => {
  const id = parseId(req.params.id)
  if (!id) return fail(res, 400, 'INVALID_ID', '无效的成绩 ID')

  const db = getDb()
  const existing = db.prepare('SELECT s.*, u.class FROM scores s JOIN users u ON s.student_id = u.id WHERE s.id = ?').get(id) as any
  if (!existing) throw new NotFoundError('成绩记录不存在')

  if (!req.user?.permissions?.includes('classes.view_all')) {
    const myClasses = (req.user?.class || '').split(',').filter(Boolean).map(c => c.trim())
    if (myClasses.length === 0 || !myClasses.includes(existing.class)) {
      return fail(res, 403, 'FORBIDDEN', '无权修改其他班级学生的成绩')
    }
  }

  const { score } = req.body
  db.prepare('UPDATE scores SET score = ? WHERE id = ?').run(score, id)
  ok(res, { success: true })
})

// ─── DELETE /api/scores/exams ───────────────────────────────────────────────
router.delete('/exams', requirePermission('scores.write'), validate(deleteExamSchema, 'body'), (req: Request, res: Response) => {
  const db = getDb()
  const { course, exam_name } = req.body

  if (!req.user?.permissions?.includes('classes.view_all')) {
    const myClasses = (req.user?.class || '').split(',').filter(Boolean).map(c => c.trim())
    // 空班级一律禁止删除
    if (myClasses.length === 0) {
      return fail(res, 403, 'FORBIDDEN', '未分配班级，无法删除成绩')
    }
    const placeholders = myClasses.map(() => '?').join(',')
    const affected = db.prepare(
      `DELETE FROM scores WHERE course = ? AND exam_name = ? AND student_id IN (SELECT id FROM users WHERE class IN (${placeholders}))`
    ).run(course, exam_name, ...myClasses)
    return ok(res, { deleted: affected.changes })
  }

  const affected = db.prepare('DELETE FROM scores WHERE course = ? AND exam_name = ?').run(course, exam_name)
  ok(res, { deleted: affected.changes })
})

// ─── DELETE /api/scores/:id ─────────────────────────────────────────────────
router.delete('/:id', requirePermission('scores.write'), (req: Request, res: Response) => {
  const id = parseId(req.params.id)
  if (!id) return fail(res, 400, 'INVALID_ID', '无效的成绩 ID')

  const db = getDb()
  const existing = db.prepare('SELECT s.*, u.class FROM scores s JOIN users u ON s.student_id = u.id WHERE s.id = ?').get(id) as any
  if (!existing) throw new NotFoundError('成绩记录不存在')

  if (!req.user?.permissions?.includes('classes.view_all')) {
    const myClasses = (req.user?.class || '').split(',').filter(Boolean).map(c => c.trim())
    if (myClasses.length === 0 || !myClasses.includes(existing.class)) {
      return fail(res, 403, 'FORBIDDEN', '无权删除其他班级学生的成绩')
    }
  }

  db.prepare('DELETE FROM scores WHERE id = ?').run(id)
  ok(res, { success: true })
})

export default router
