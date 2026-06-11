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

  // Load user permissions from group
  const db2 = getDb()
  const permRows = db2.prepare(`
    SELECT DISTINCT gp.permission_code
    FROM group_permissions gp
    JOIN users u ON u.group_id = gp.group_id
    WHERE u.id = ?
  `).all(user.id) as { permission_code: string }[]
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

export default router
