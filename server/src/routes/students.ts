import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getDb } from '../db/init.js'
import { requirePermission } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ok, fail } from '../lib/response.js'
import { NotFoundError, ValidationError } from '../lib/errors.js'

const router = Router()

const createSchema = z.object({
  display_name: z.string().min(1, '请输入学生姓名'),
  class: z.string().optional().default(''),
  username: z.string().optional(),
  password: z.string().optional().default('123456'),
  group_id: z.number().int().nullable().optional(),
})

const updateSchema = z.object({
  display_name: z.string().min(1),
  class: z.string().optional().default(''),
  username: z.string().optional(),
  password: z.string().optional(),
  group_id: z.number().int().nullable().optional(),
})

// GET /api/students?class=xxx
router.get('/', requirePermission('students.read'), (req: Request, res: Response) => {
  const db = getDb()
  const { class: className } = req.query
  let sql = `SELECT id, username, display_name, role, class, avatar FROM users WHERE role = 'student'`
  const params: string[] = []

  if (className) {
    sql += ` AND class = ?`
    params.push(String(className))
  }
  sql += ` ORDER BY id`

  ok(res, db.prepare(sql).all(...params))
})

// POST /api/students
router.post('/', requirePermission('students.write'), validate(createSchema), (req: Request, res: Response) => {
  const db = getDb()
  const { display_name, class: stuClass, username, group_id } = req.body

  const uname = username || display_name.toLowerCase().replace(/\s/g, '')
  const pw = req.body.password
  const result = db
    .prepare(
      'INSERT INTO users (username, display_name, role, class, password, group_id) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(uname, display_name, 'student', stuClass, pw, group_id ?? null)

  const student = db
    .prepare(
      'SELECT id, username, display_name, role, class, avatar FROM users WHERE id = ?',
    )
    .get(result.lastInsertRowid)
  ok(res, student)
})

// GET /api/students/:id
router.get('/:id', requirePermission('students.read'), (req: Request, res: Response) => {
  const db = getDb()
  const student = db
    .prepare(
      `SELECT id, username, display_name, role, class, avatar FROM users WHERE id = ? AND role = 'student'`,
    )
    .get(req.params.id)

  if (!student) throw new NotFoundError('学生不存在')
  ok(res, student)
})

// PUT /api/students/:id
router.put('/:id', requirePermission('students.write'), validate(updateSchema), (req: Request, res: Response) => {
  const db = getDb()
  const { display_name, class: stuClass } = req.body

  const fields: string[] = []
  const values: any[] = []

  fields.push('display_name = ?')
  values.push(display_name)

  if (stuClass !== undefined) {
    fields.push('class = ?')
    values.push(stuClass)
  }

  if (req.body.username !== undefined) {
    fields.push('username = ?')
    values.push(req.body.username)
  }

  if (req.body.password !== undefined) {
    fields.push('password = ?')
    values.push(req.body.password)
  }

  if (req.body.group_id !== undefined) {
    fields.push('group_id = ?')
    values.push(req.body.group_id)
  }

  values.push(req.params.id, 'student')

  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ? AND role = ?`).run(...values)

  const updated = db
    .prepare(
      'SELECT id, username, display_name, role, class, avatar FROM users WHERE id = ?',
    )
    .get(req.params.id)

  if (!updated) throw new NotFoundError('学生不存在')
  ok(res, updated)
})

// DELETE /api/students/:id
router.delete('/:id', requirePermission('students.delete'), (req: Request, res: Response) => {
  const db = getDb()
  const id = req.params.id

  // Check student exists
  const student = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'student'").get(id)
  if (!student) throw new NotFoundError('学生不存在')

  // Cascade delete all related data
  db.prepare('DELETE FROM comments WHERE author_id = ?').run(id)
  db.prepare('DELETE FROM posts WHERE author_id = ?').run(id)
  db.prepare('DELETE FROM submissions WHERE student_id = ?').run(id)
  db.prepare('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)').run(id)
  db.prepare('DELETE FROM conversations WHERE user_id = ?').run(id)
  db.prepare('DELETE FROM api_keys WHERE user_id = ?').run(id)
  db.prepare('DELETE FROM scores WHERE student_id = ?').run(id)
  db.prepare('DELETE FROM point_records WHERE student_id = ?').run(id)
  db.prepare('DELETE FROM users WHERE id = ? AND role = ?').run(id, 'student')

  ok(res, { success: true })
})

export default router
