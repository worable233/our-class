import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { getDb } from '../db/init.js'
import { config } from '../config/index.js'
import { AuthError, ForbiddenError } from '../lib/errors.js'

export interface JwtPayload {
  id: number
  role: 'teacher' | 'student'
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number
        username: string
        display_name: string
        role: 'teacher' | 'student'
        class: string
        permissions: string[]
      }
    }
  }
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' })
}

export function requirePermission(code: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user?.permissions?.includes(code)) {
      throw new ForbiddenError('权限不足')
    }
    next()
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError()
  }

  try {
    const payload = jwt.verify(authHeader.slice(7), config.jwtSecret) as JwtPayload
    const db = getDb()
    const row = db.prepare(`
      SELECT u.id, u.username, u.display_name, u.class, u.group_id, pg.name as group_name
      FROM users u
      LEFT JOIN permission_groups pg ON u.group_id = pg.id
      WHERE u.id = ?
    `).get(payload.id) as { id: number; username: string; display_name: string; class: string; group_id: number | null; group_name: string | null } | undefined

    if (!row) throw new AuthError()

    // 从权限组名称推导角色
    const role = row.group_name === '教师' ? 'teacher' as const : 'student' as const

    let permissions: string[] = []
    if (row.group_id) {
      const permRows = db.prepare(`
        SELECT DISTINCT gp.permission_code
        FROM group_permissions gp
        WHERE gp.group_id = ?
      `).all(row.group_id) as { permission_code: string }[]
      permissions = permRows.map(r => r.permission_code)
    } else {
      // User has no group — assign to default group
      const defaultGroup = db.prepare(
        "SELECT id FROM permission_groups WHERE name = ?"
      ).get('学生') as { id: number } | undefined
      if (defaultGroup) {
        db.prepare("UPDATE users SET group_id = ? WHERE id = ? AND group_id IS NULL").run(defaultGroup.id, row.id)
        const permRows = db.prepare(
          "SELECT permission_code FROM group_permissions WHERE group_id = ?"
        ).all(defaultGroup.id) as { permission_code: string }[]
        permissions = permRows.map(r => r.permission_code)
      }
    }

    req.user = { id: row.id, username: row.username, display_name: row.display_name, role, class: row.class, permissions }
    next()
  } catch (err) {
    if (err instanceof AuthError) throw err
    throw new AuthError()
  }
}
