import { Router, Request, Response } from 'express'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { getDb } from '../db/init.js'
import { signToken, authMiddleware } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ok, fail } from '../lib/response.js'
import { AuthError } from '../lib/errors.js'

const BCRYPT_ROUNDS = 10

const router = Router()

interface UserRow {
  id: number
  username: string
  display_name: string
  class: string
  avatar: string | null
  student_no: string | null
  nickname: string | null
  group_id: number | null
  group_type?: string
}

const loginSchema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
})

const updateProfileSchema = z.object({
  nickname: z.string().max(50, '昵称最长 50 字符').optional(),
  avatar: z.string().max(500, '头像 URL 过长').refine(
    (val) => !val || /^https?:\/\/.+/.test(val),
    { message: '头像必须是有效的 HTTP/HTTPS 链接' }
  ).optional(),
  password: z.string().min(6, '密码最少 6 位').max(100, '密码过长').optional(),
  old_password: z.string().optional(),
})

// POST /api/auth/login
router.post('/login', validate(loginSchema), async (req: Request, res: Response) => {
  const { username, password } = req.body

  const db = getDb()

  // Try finding by student_no, then username, then display_name
  let user = db
    .prepare('SELECT u.*, pg.name as group_name, pg.group_type FROM users u LEFT JOIN permission_groups pg ON u.group_id = pg.id WHERE u.student_no = ?')
    .get(username) as (UserRow & { password: string; group_name: string | null }) | undefined

  if (!user) {
    user = db
      .prepare('SELECT u.*, pg.name as group_name, pg.group_type FROM users u LEFT JOIN permission_groups pg ON u.group_id = pg.id WHERE u.username = ?')
      .get(username) as (UserRow & { password: string; group_name: string | null }) | undefined
  }

  if (!user) {
    user = db
      .prepare('SELECT u.*, pg.name as group_name, pg.group_type FROM users u LEFT JOIN permission_groups pg ON u.group_id = pg.id WHERE u.display_name = ?')
      .get(username) as (UserRow & { password: string; group_name: string | null }) | undefined
  }

  if (!user) {
    return fail(res, 404, 'NOT_FOUND', '用户不存在')
  }

  // 兼容旧版明文密码与 bcrypt 哈希
  const passwordMatch = user.password.startsWith('$2b$')
    ? await bcrypt.compare(password, user.password)
    : user.password === password

  if (!passwordMatch) {
    return fail(res, 401, 'AUTH_ERROR', '密码错误')
  }

  // 升级旧版明文密码到 bcrypt
  if (!user.password.startsWith('$2b$')) {
    const hashed = await bcrypt.hash(user.password, BCRYPT_ROUNDS)
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, user.id)
  }

  // 从权限组类型推导角色：只有明确标记为 student 的组才用学生端，其余（teacher/admin/custom）均为教师端
  const groupType = user.group_type || 'custom'
  const role = groupType === 'student' ? ('student' as const) : ('teacher' as const)
  const token = signToken({ id: user.id, role })

  // Load user permissions from both group_id and role_id
  const db2 = getDb()
  const permRows = db2.prepare(`
    SELECT DISTINCT gp.permission_code
    FROM group_permissions gp
    WHERE gp.group_id = (
      SELECT group_id FROM users WHERE id = ?
    )
    OR gp.group_id = (
      SELECT role_id FROM users WHERE id = ? AND role_id IS NOT NULL
    )
  `).all(user.id, user.id) as { permission_code: string }[]
  const permissions = permRows.map(r => r.permission_code)

  ok(res, {
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role,
      class: user.class,
      avatar: user.avatar,
      student_no: user.student_no,
      nickname: user.nickname,
      token,
      permissions,
    },
    token,
  })
})

// GET /api/auth/me
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  ok(res, req.user!)
})

// GET /api/auth/permissions — get current user's permissions
router.get('/permissions', authMiddleware, (req: Request, res: Response) => {
  ok(res, req.user!.permissions)
})

// PUT /api/auth/profile — update current user's own profile
router.put('/profile', authMiddleware, validate(updateProfileSchema), async (req: Request, res: Response) => {
  const db = getDb()
  const userId = req.user!.id
  const { nickname, avatar, password, old_password } = req.body

  // Sanitize nickname: strip HTML tags
  const sanitize = (s: string) => s.replace(/<[^>]*>/g, '').trim()

  const fields: string[] = []
  const values: any[] = []

  if (nickname !== undefined) {
    fields.push('nickname = ?')
    values.push(nickname ? sanitize(nickname) : null)
  }

  if (avatar !== undefined) {
    fields.push('avatar = ?')
    values.push(avatar || null)
  }

  if (password !== undefined) {
    // Require old password for password change
    if (!old_password) {
      return fail(res, 400, 'OLD_PASSWORD_REQUIRED', '修改密码需要输入原密码')
    }
    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(userId) as { password: string } | undefined
    if (!user) return fail(res, 404, 'NOT_FOUND', '用户不存在')

    // Verify old password
    const match = user.password.startsWith('$2b$')
      ? await bcrypt.compare(old_password, user.password)
      : user.password === old_password
    if (!match) {
      return fail(res, 401, 'AUTH_ERROR', '原密码错误')
    }

    const hashedPw = await bcrypt.hash(password, BCRYPT_ROUNDS)
    fields.push('password = ?')
    values.push(hashedPw)
  }

  if (fields.length === 0) {
    return fail(res, 400, 'NO_CHANGES', '没有要修改的字段')
  }

  values.push(userId)
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values)

  // Audit log
  try {
    const { writeAuditLog } = await import('./audit.js')
    const changes: string[] = []
    if (nickname !== undefined) changes.push('nickname')
    if (avatar !== undefined) changes.push('avatar')
    if (password !== undefined) changes.push('password')
    writeAuditLog(userId, req.user!.display_name, 'update_profile', 'user', userId, { fields: changes })
  } catch {}

  // Return updated user info
  const updated = db.prepare('SELECT id, username, display_name, class, avatar, student_no, nickname FROM users WHERE id = ?').get(userId) as any

  ok(res, {
    id: updated.id,
    username: updated.username,
    display_name: updated.display_name,
    class: updated.class,
    avatar: updated.avatar,
    student_no: updated.student_no,
    nickname: updated.nickname,
  })
})

export default router
