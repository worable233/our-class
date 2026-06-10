import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getDb } from '../db/init.js'
import { requirePermission } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ok, fail } from '../lib/response.js'
import { NotFoundError } from '../lib/errors.js'

const router = Router()

const TEACHER_GROUP_SUBQUERY = "(SELECT id FROM permission_groups WHERE group_type = 'teacher' LIMIT 1)"

const updateSchema = z.object({
  display_name: z.string().min(1).optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  class: z.string().optional(),
  nickname: z.string().nullable().optional(),
  avatar: z.string().optional(),
  group_id: z.number().int().nullable().optional(),
  role_id: z.number().int().nullable().optional(),
})

// GET /api/teachers — list all teachers（支持 ?class=xxx 筛选）
router.get('/', requirePermission('students.write'), (req: Request, res: Response) => {
  const db = getDb()
  const { permissions, class: userClass } = req.user!
  const hasViewAll = permissions.includes('classes.view_all')
  const filterClass = req.query.class as string | undefined

  let sql = `
    SELECT u.id, u.username, u.display_name, u.class, u.avatar, u.student_no, u.nickname, u.group_id, u.role_id
    FROM users u
    JOIN permission_groups pg ON pg.group_type = 'teacher'
    WHERE u.group_id = pg.id
  `
  const params: string[] = []

  if (!hasViewAll) {
    const myClasses = userClass.split(',').filter(Boolean).map(c => c.trim())
    if (myClasses.length > 0) {
      // 检查 teachers 的 class 字段是否包含自己的班级（class 可能为逗号分隔的多班级）
      const classConds = myClasses.map(() => `(u.class LIKE '%' || ? || '%' OR u.class = ?)`)
      sql += ` AND (${classConds.join(' OR ')})`
      for (const c of myClasses) {
        params.push(c, c) // 每个班级两个占位符（LIKE 和精确匹配）
      }
    }
  } else if (filterClass) {
    sql += ` AND (u.class LIKE '%' || ? || '%' OR u.class = ?)`
    params.push(filterClass, filterClass)
  }

  sql += ' ORDER BY u.id'
  const teachers = db.prepare(sql).all(...params)
  ok(res, teachers)
})

// GET /api/teachers/:id
router.get('/:id', requirePermission('students.write'), (req: Request, res: Response) => {
  const db = getDb()
  const teacher = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.class, u.avatar, u.student_no, u.nickname, u.group_id, u.role_id
    FROM users u
    WHERE u.id = ? AND u.group_id = ${TEACHER_GROUP_SUBQUERY}
  `).get(req.params.id)

  if (!teacher) throw new NotFoundError('教师不存在')
  ok(res, teacher)
})

// PUT /api/teachers/:id — update teacher info
router.put('/:id', requirePermission('students.write'), validate(updateSchema), (req: Request, res: Response) => {
  const db = getDb()
  const id = Number(req.params.id)
  if (isNaN(id)) return fail(res, 400, 'VALIDATION_ERROR', '无效的 ID')

  const existing = db.prepare(`SELECT id FROM users WHERE id = ? AND group_id = ${TEACHER_GROUP_SUBQUERY}`).get(id)
  if (!existing) throw new NotFoundError('教师不存在')

  const fields: string[] = []
  const values: any[] = []

  if (req.body.display_name !== undefined) { fields.push('display_name = ?'); values.push(req.body.display_name) }
  if (req.body.username !== undefined) { fields.push('username = ?'); values.push(req.body.username) }
  if (req.body.password !== undefined) { fields.push('password = ?'); values.push(req.body.password) }
  if (req.body.class !== undefined) { fields.push('class = ?'); values.push(req.body.class) }
  if (req.body.nickname !== undefined) { fields.push('nickname = ?'); values.push(req.body.nickname) }
  if (req.body.avatar !== undefined) { fields.push('avatar = ?'); values.push(req.body.avatar) }
  if (req.body.group_id !== undefined) {
    fields.push('group_id = ?'); values.push(req.body.group_id)
    // 同步存储配额
    const quota = db.prepare('SELECT storage_limit FROM group_storage_quota WHERE group_id = ?').get(req.body.group_id) as any
    if (quota) db.prepare('UPDATE user_storage SET storage_limit = ? WHERE user_id = ?').run(quota.storage_limit, id)
  }
  if (req.body.role_id !== undefined) { fields.push('role_id = ?'); values.push(req.body.role_id) }

  if (fields.length === 0) return fail(res, 400, 'NO_CHANGES', '没有要修改的字段')

  values.push(id)
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values)

  const updated = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.class, u.avatar, u.student_no, u.nickname, u.group_id, u.role_id
    FROM users u WHERE u.id = ?
  `).get(id)

  ok(res, updated)
})

export default router
