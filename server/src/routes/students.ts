import { Router, Request, Response } from 'express'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { existsSync, rmSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { getDb } from '../db/init.js'
import { requirePermission } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ok, fail } from '../lib/response.js'
import { NotFoundError, ValidationError } from '../lib/errors.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = join(__dirname, '..', '..', 'storage')

const BCRYPT_ROUNDS = 10

const router = Router()

const STUDENT_GROUP_SUBQUERY = "(SELECT id FROM permission_groups WHERE group_type = 'student' LIMIT 1)"

const studentNoSchema = z.string().regex(/^\d*$/, '学号只能为数字').optional()

const createSchema = z.object({
  display_name: z.string().min(1, '请输入学生姓名'),
  class: z.string().optional().default(''),
  username: z.string().optional(),
  password: z.string().optional(),
  group_id: z.number().int().nullable().optional(),
  role_id: z.number().int().nullable().optional(),
  student_no: studentNoSchema,
  nickname: z.string().optional(),
})

const updateSchema = z.object({
  display_name: z.string().min(1),
  class: z.string().optional().default(''),
  username: z.string().optional(),
  password: z.string().optional(),
  group_id: z.number().int().nullable().optional(),
  role_id: z.number().int().nullable().optional(),
  student_no: studentNoSchema,
  nickname: z.string().optional(),
})

// GET /api/students?class=xxx
router.get('/', requirePermission('students.write'), (req: Request, res: Response) => {
  const db = getDb()
  const { permissions, class: userClass } = req.user!
  const hasViewAll = permissions.includes('classes.view_all')
  const filterClass = req.query.class as string | undefined

  let sql = `SELECT id, username, display_name, class, avatar, student_no, nickname, group_id, role_id FROM users WHERE group_id = ${STUDENT_GROUP_SUBQUERY}`
  const params: string[] = []
  const conditions: string[] = []

  if (!hasViewAll) {
    const myClasses = userClass.split(',').filter(Boolean).map(c => c.trim())
    if (myClasses.length > 0) {
      conditions.push(`class IN (${myClasses.map(() => '?').join(',')})`)
      params.push(...myClasses)
    }
  } else if (filterClass) {
    conditions.push('class = ?')
    params.push(filterClass)
  }

  if (conditions.length > 0) sql += ' AND ' + conditions.join(' AND ')
  sql += ' ORDER BY id'

  ok(res, db.prepare(sql).all(...params))
})

// POST /api/students
router.post('/', requirePermission('students.write'), validate(createSchema), async (req: Request, res: Response) => {
  const db = getDb()
  const { display_name, class: stuClass, username, group_id, role_id, nickname } = req.body
  // 学号只能为纯数字，自动生成时用时间戳后 8 位
  const studentNo = req.body.student_no || String(Date.now()).slice(-8)

  const uname = username || display_name.toLowerCase().replace(/\s/g, '')
  // 默认密码为学号（bcrypt 哈希后存储）
  const rawPw = req.body.password || studentNo
  const pw = await bcrypt.hash(rawPw, BCRYPT_ROUNDS)
  // Default to "学生" permission group if none specified
  const finalGroupId = group_id ?? (db.prepare("SELECT id FROM permission_groups WHERE group_type = 'student' ORDER BY id LIMIT 1").get() as any)?.id ?? null
  const result = db.prepare('INSERT INTO users (username, display_name, class, password, group_id, role_id, student_no, nickname, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(uname, display_name, stuClass, pw, finalGroupId, role_id ?? null, studentNo, nickname ?? null, 'student')

  const student = db
    .prepare(
      'SELECT id, username, display_name, class, avatar, student_no, nickname, group_id, role_id FROM users WHERE id = ?',
    )
    .get(result.lastInsertRowid)
  ok(res, student)
})

// GET /api/students/:id
router.get('/:id', requirePermission('students.write'), (req: Request, res: Response) => {
  const db = getDb()
  const student = db
    .prepare(
      `SELECT id, username, display_name, class, avatar, student_no, nickname, group_id, role_id FROM users WHERE id = ? AND group_id = ${STUDENT_GROUP_SUBQUERY}`,
    )
    .get(req.params.id)

  if (!student) throw new NotFoundError('学生不存在')
  ok(res, student)
})

// PUT /api/students/:id
router.put('/:id', requirePermission('students.write'), validate(updateSchema), async (req: Request, res: Response) => {
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
    // 密码用 bcrypt 哈希后存储
    const hashedPw = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS)
    fields.push('password = ?')
    values.push(hashedPw)
  }

  if (req.body.group_id !== undefined) {
    // 权限提升防护：非教师用户不能修改 group_id
    if (req.user?.role !== 'teacher') {
      return fail(res, 403, 'FORBIDDEN', '无权限修改权限组')
    }
    fields.push('group_id = ?')
    values.push(req.body.group_id)
    // 同步存储配额：根据新权限组的配额更新 user_storage.storage_limit
    const quota = db.prepare(
      'SELECT storage_limit FROM group_storage_quota WHERE group_id = ?'
    ).get(req.body.group_id) as { storage_limit: number } | undefined
    if (quota) {
      db.prepare('UPDATE user_storage SET storage_limit = ? WHERE user_id = ?')
        .run(quota.storage_limit, req.params.id)
    }
  }

  if (req.body.role_id !== undefined) {
    // 权限提升防护：非教师用户不能修改 role_id
    if (req.user?.role !== 'teacher') {
      return fail(res, 403, 'FORBIDDEN', '无权限修改角色')
    }
    fields.push('role_id = ?')
    values.push(req.body.role_id)
  }

  if (req.body.student_no !== undefined) {
    fields.push('student_no = ?')
    values.push(req.body.student_no)
  }

  if (req.body.nickname !== undefined) {
    fields.push('nickname = ?')
    values.push(req.body.nickname)
  }

  values.push(req.params.id)

  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ? AND group_id = ${STUDENT_GROUP_SUBQUERY}`).run(...values)

  const updated = db
    .prepare(
      'SELECT id, username, display_name, class, avatar, student_no, nickname, group_id, role_id FROM users WHERE id = ?',
    )
    .get(req.params.id)

  if (!updated) throw new NotFoundError('学生不存在')
  ok(res, updated)
})

// DELETE /api/students/:id
router.delete('/:id', requirePermission('students.write'), (req: Request, res: Response) => {
  const db = getDb()
  const id = req.params.id

  // Check student exists
  const student = db.prepare(`SELECT id FROM users WHERE id = ? AND group_id = ${STUDENT_GROUP_SUBQUERY}`).get(id)
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
  db.prepare('DELETE FROM uploaded_files WHERE user_id = ?').run(id)
  // user_storage has ON DELETE CASCADE, will auto-clean on user delete
  // Delete physical storage directory
  const userDir = join(STORAGE_ROOT, `user_${id}`)
  if (existsSync(userDir)) { try { rmSync(userDir, { recursive: true, force: true }) } catch {} }
  db.prepare(`DELETE FROM users WHERE id = ? AND group_id = ${STUDENT_GROUP_SUBQUERY}`).run(id)

  ok(res, { success: true })
})

export default router
