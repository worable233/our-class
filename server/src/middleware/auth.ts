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
    const user = db.prepare(
      'SELECT id, username, display_name, role, class FROM users WHERE id = ?',
    ).get(payload.id) as Omit<Express.Request['user'], 'permissions'>

    if (!user) throw new AuthError()

    const permRows = db.prepare(`
      SELECT DISTINCT gp.permission_code
      FROM group_permissions gp
      JOIN users u ON u.group_id = gp.group_id
      WHERE u.id = ?
    `).all(payload.id) as { permission_code: string }[]

    req.user = { ...user, permissions: permRows.map(r => r.permission_code) }
    next()
  } catch (err) {
    if (err instanceof AuthError) throw err
    throw new AuthError()
  }
}
