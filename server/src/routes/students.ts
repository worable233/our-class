import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getDb } from '../db/init.js'
import { validate } from '../middleware/validate.js'
import { ok, fail } from '../lib/response.js'
import { NotFoundError, ValidationError } from '../lib/errors.js'

const router = Router()

const createSchema = z.object({
  display_name: z.string().min(1, '请输入学生姓名'),
  class: z.string().optional().default(''),
  username: z.string().optional(),
})

const updateSchema = z.object({
  display_name: z.string().min(1),
  class: z.string().optional().default(''),
})

// GET /api/students?class=xxx
router.get('/', (req: Request, res: Response) => {
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
router.post('/', validate(createSchema), (req: Request, res: Response) => {
  const db = getDb()
  const { display_name, class: stuClass, username } = req.body

  const uname = username || display_name.toLowerCase().replace(/\s/g, '')
  const result = db
    .prepare(
      'INSERT INTO users (username, display_name, role, class) VALUES (?, ?, ?, ?)',
    )
    .run(uname, display_name, 'student', stuClass)

  const student = db
    .prepare(
      'SELECT id, username, display_name, role, class, avatar FROM users WHERE id = ?',
    )
    .get(result.lastInsertRowid)
  ok(res, student)
})

// GET /api/students/:id
router.get('/:id', (req: Request, res: Response) => {
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
router.put('/:id', validate(updateSchema), (req: Request, res: Response) => {
  const db = getDb()
  const { display_name, class: stuClass } = req.body

  db.prepare('UPDATE users SET display_name = ?, class = ? WHERE id = ? AND role = ?').run(
    display_name,
    stuClass,
    req.params.id,
    'student',
  )

  const updated = db
    .prepare(
      'SELECT id, username, display_name, role, class, avatar FROM users WHERE id = ?',
    )
    .get(req.params.id)

  if (!updated) throw new NotFoundError('学生不存在')
  ok(res, updated)
})

// DELETE /api/students/:id
router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb()
  db.prepare('DELETE FROM users WHERE id = ? AND role = ?').run(req.params.id, 'student')
  db.prepare('DELETE FROM scores WHERE student_id = ?').run(req.params.id)
  db.prepare('DELETE FROM point_records WHERE student_id = ?').run(req.params.id)
  ok(res, { success: true })
})

export default router
