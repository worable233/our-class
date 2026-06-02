import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { getDb } from '../db/init.js'
import { config } from '../config/index.js'
import { AuthError } from '../lib/errors.js'

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
      }
    }
  }
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' })
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
    ).get(payload.id) as Express.Request['user']

    if (!user) throw new AuthError()
    req.user = user
    next()
  } catch (err) {
    if (err instanceof AuthError) throw err
    throw new AuthError()
  }
}
