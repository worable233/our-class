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
        role_id?: number | null
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
      SELECT u.id, u.username, u.display_name, u.class, u.group_id, u.role_id, pg.name as group_name, pg.group_type
      FROM users u
      LEFT JOIN permission_groups pg ON u.group_id = pg.id
      WHERE u.id = ?
    `).get(payload.id) as { id: number; username: string; display_name: string; class: string; group_id: number | null; role_id: number | null; group_name: string | null; group_type: string | null } | undefined

    if (!row) throw new AuthError()

    // 从权限组类型推导角色：只有明确标记为 student 的组才用学生端，其余（teacher/admin/custom）均为教师端
    const role = row.group_type === 'student' ? ('student' as const) : ('teacher' as const)

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
        "SELECT id FROM permission_groups WHERE group_type = 'student' ORDER BY id LIMIT 1"
      ).get() as { id: number } | undefined
      if (defaultGroup) {
        db.prepare("UPDATE users SET group_id = ? WHERE id = ? AND group_id IS NULL").run(defaultGroup.id, row.id)
        const permRows = db.prepare(
          "SELECT permission_code FROM group_permissions WHERE group_id = ?"
        ).all(defaultGroup.id) as { permission_code: string }[]
        permissions = permRows.map(r => r.permission_code)
      }
    }

    // Load role extra permissions (role_id overrides/adds to group permissions)
    if (row.role_id) {
      const rolePermRows = db.prepare(
        'SELECT DISTINCT gp.permission_code FROM group_permissions gp WHERE gp.group_id = ?'
      ).all(row.role_id) as { permission_code: string }[]
      const rolePerms = rolePermRows.map(r => r.permission_code)
      permissions = [...new Set([...permissions, ...rolePerms])]
    }

    req.user = { id: row.id, username: row.username, display_name: row.display_name, role, class: row.class, role_id: row.role_id, permissions }
    next()
  } catch (err) {
    if (err instanceof AuthError) throw err
    throw new AuthError()
  }
}
