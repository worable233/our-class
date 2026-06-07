import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getDb } from '../db/init.js'
import { signToken, authMiddleware } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ok, fail } from '../lib/response.js'
import { AuthError } from '../lib/errors.js'

const router = Router()

interface UserRow {
  id: number
  username: string
  display_name: string
  role: 'teacher' | 'student'
  class: string
  avatar: string | null
  student_no: string | null
  nickname: string | null
}

const loginSchema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
})

// POST /api/auth/login
router.post('/login', validate(loginSchema), (req: Request, res: Response) => {
  const { username, password } = req.body

  const db = getDb()

  // Try finding by student_no, then username, then display_name
  let user = db
    .prepare('SELECT * FROM users WHERE student_no = ?')
    .get(username) as (UserRow & { password: string }) | undefined

  if (!user) {
    user = db
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(username) as (UserRow & { password: string }) | undefined
  }

  if (!user) {
    user = db
      .prepare('SELECT * FROM users WHERE display_name = ?')
      .get(username) as (UserRow & { password: string }) | undefined
  }

  if (!user) {
    return fail(res, 404, 'NOT_FOUND', '用户不存在')
  }

  if (user.password !== password) {
    return fail(res, 401, 'AUTH_ERROR', '密码错误')
  }

  const token = signToken({ id: user.id, role: user.role })

  ok(res, {
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      class: user.class,
      avatar: user.avatar,
      student_no: user.student_no,
      nickname: user.nickname,
      token,
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
