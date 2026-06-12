import { Router, Request, Response } from 'express'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { rmSync } from 'fs'
import { join } from 'path'
import { getDb } from '../db/init.js'
import { requirePermission } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ok, fail } from '../lib/response.js'
import { NotFoundError } from '../lib/errors.js'

const BCRYPT_ROUNDS = 10

/** 转义 LIKE 通配符 % 和 _ */
function escapeLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

const router = Router()

const TEACHER_GROUP_SUBQUERY = "(SELECT id FROM permission_groups WHERE group_type = 'teacher' LIMIT 1)"

const createSchema = z.object({
  display_name: z.string().min(1),
  username: z.string().min(1),
  password: z.string().optional(),
  class: z.string().optional(),
  nickname: z.string().nullable().optional(),
  group_id: z.number().int().nullable().optional(),
  role_id: z.number().int().nullable().optional(),
})

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
      const classConds = myClasses.map(() => `(u.class LIKE '%' || ? || '%' ESCAPE '\\' OR u.class = ?)`)
      sql += ` AND (${classConds.join(' OR ')})`
      for (const c of myClasses) {
        params.push(escapeLike(c), c) // LIKE 参数转义通配符，精确匹配不转义
      }
    }
  } else if (filterClass) {
    sql += ` AND (u.class LIKE '%' || ? || '%' ESCAPE '\\' OR u.class = ?)`
    params.push(escapeLike(filterClass), filterClass)
  }

  sql += ' ORDER BY u.id'
  const teachers = db.prepare(sql).all(...params)
  ok(res, teachers)
})

// POST /api/teachers — create teacher
router.post('/', requirePermission('students.write'), validate(createSchema), async (req: Request, res: Response) => {
  const db = getDb()
  const { display_name, username, password, class: cls, nickname, group_id, role_id } = req.body

  // Validate username format
  if (!/^[a-zA-Z0-9_]{2,32}$/.test(username)) {
    return fail(res, 400, 'VALIDATION_ERROR', '用户名只能包含字母、数字、下划线，长度 2-32 位')
  }

  // Check if username already exists
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existing) return fail(res, 409, 'DUPLICATE', '用户名已存在')

  // Permission escalation check: can only assign groups you have permission for
  if (group_id) {
    const userPerms = req.user?.permissions || []
    if (!userPerms.includes('roles.manage')) {
      // Non-admin users can only assign teacher group
      const targetGroup = db.prepare('SELECT group_type FROM permission_groups WHERE id = ?').get(group_id) as any
      if (!targetGroup || targetGroup.group_type !== 'teacher') {
        return fail(res, 403, 'FORBIDDEN', '无权限分配该身份组')
      }
    }
  }

  // Use teacher group if no group_id specified
  const finalGroupId = group_id || (() => {
    const g = db.prepare("SELECT id FROM permission_groups WHERE group_type = 'teacher' LIMIT 1").get() as any
    return g?.id || null
  })()

  // Validate role_id if provided
  if (role_id) {
    const role = db.prepare('SELECT id FROM permission_groups WHERE id = ? AND parent_id IS NOT NULL').get(role_id)
    if (!role) return fail(res, 400, 'VALIDATION_ERROR', '无效的职位 ID')
  }

  const hashedPw = await bcrypt.hash(password || '123456', BCRYPT_ROUNDS)

  const result = db.prepare(
    'INSERT INTO users (username, display_name, role, class, password, nickname, group_id, role_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(username, display_name, 'teacher', cls || '', hashedPw, nickname || null, finalGroupId, role_id || null)

  // Audit log
  try {
    const { writeAuditLog } = await import('./audit.js')
    writeAuditLog(req.user!.id, req.user!.display_name, 'create_teacher', 'user', Number(result.lastInsertRowid), { username, display_name, class: cls })
  } catch {}

  const created = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.class, u.avatar, u.student_no, u.nickname, u.group_id, u.role_id
    FROM users u WHERE u.id = ?
  `).get(result.lastInsertRowid)

  ok(res, created)
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
router.put('/:id', requirePermission('students.write'), validate(updateSchema), async (req: Request, res: Response) => {
  const db = getDb()
  const id = Number(req.params.id)
  if (isNaN(id)) return fail(res, 400, 'VALIDATION_ERROR', '无效的 ID')

  const existing = db.prepare(`SELECT id FROM users WHERE id = ? AND group_id = ${TEACHER_GROUP_SUBQUERY}`).get(id)
  if (!existing) throw new NotFoundError('教师不存在')

  const fields: string[] = []
  const values: any[] = []

  if (req.body.display_name !== undefined) { fields.push('display_name = ?'); values.push(req.body.display_name) }
  if (req.body.username !== undefined) { fields.push('username = ?'); values.push(req.body.username) }
  if (req.body.password !== undefined) {
    const hashedPw = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS)
    fields.push('password = ?')
    values.push(hashedPw)
  }
  if (req.body.class !== undefined) { fields.push('class = ?'); values.push(req.body.class) }
  if (req.body.nickname !== undefined) { fields.push('nickname = ?'); values.push(req.body.nickname) }
  if (req.body.avatar !== undefined) { fields.push('avatar = ?'); values.push(req.body.avatar) }
  if (req.body.group_id !== undefined) {
    // 权限提升防护：需要 roles.manage 权限才能修改权限组
    if (!req.user?.permissions?.includes('roles.manage')) {
      return fail(res, 403, 'FORBIDDEN', '无权限修改权限组')
    }
    fields.push('group_id = ?'); values.push(req.body.group_id)
    // 同步存储配额
    const quota = db.prepare('SELECT storage_limit FROM group_storage_quota WHERE group_id = ?').get(req.body.group_id) as any
    if (quota) db.prepare('UPDATE user_storage SET storage_limit = ? WHERE user_id = ?').run(quota.storage_limit, id)
  }
  if (req.body.role_id !== undefined) {
    // 权限提升防护：需要 roles.manage 权限才能修改职位
    if (!req.user?.permissions?.includes('roles.manage')) {
      return fail(res, 403, 'FORBIDDEN', '无权限修改角色')
    }
    fields.push('role_id = ?'); values.push(req.body.role_id)
  }

  if (fields.length === 0) return fail(res, 400, 'NO_CHANGES', '没有要修改的字段')

  values.push(id)
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values)

  const updated = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.class, u.avatar, u.student_no, u.nickname, u.group_id, u.role_id
    FROM users u WHERE u.id = ?
  `).get(id)

  ok(res, updated)
})

// DELETE /api/teachers/:id — delete teacher
router.delete('/:id', requirePermission('students.write'), async (req: Request, res: Response) => {
  const db = getDb()
  const id = Number(req.params.id)
  if (isNaN(id)) return fail(res, 400, 'VALIDATION_ERROR', '无效的 ID')

  // 确认是教师
  const teacher = db.prepare(`SELECT id, username, display_name FROM users WHERE id = ? AND group_id = ${TEACHER_GROUP_SUBQUERY}`).get(id) as any
  if (!teacher) throw new NotFoundError('教师不存在')

  // 不能删除自己
  if (id === req.user?.id) {
    return fail(res, 400, 'CANNOT_DELETE_SELF', '不能删除自己的账号')
  }

  // 级联删除相关数据
  db.prepare('DELETE FROM comments WHERE author_id = ?').run(id)
  db.prepare('DELETE FROM posts WHERE author_id = ?').run(id)
  db.prepare('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)').run(id)
  db.prepare('DELETE FROM conversations WHERE user_id = ?').run(id)
  db.prepare('DELETE FROM api_keys WHERE user_id = ?').run(id)
  db.prepare('DELETE FROM uploaded_files WHERE user_id = ?').run(id)

  // 删除物理存储目录
  try {
    rmSync(join(process.cwd(), 'storage', `user_${id}`), { recursive: true, force: true })
  } catch {}

  // 删除用户
  db.prepare('DELETE FROM users WHERE id = ?').run(id)

  // 审计日志
  try {
    const { writeAuditLog } = await import('./audit.js')
    writeAuditLog(req.user!.id, req.user!.display_name, 'delete_teacher', 'user', id, { username: teacher.username, display_name: teacher.display_name })
  } catch {}

  ok(res, { success: true })
})

export default router
