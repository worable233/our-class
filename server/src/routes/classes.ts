import { Router, Request, Response } from 'express'
import { getDb } from '../db/init.js'

const router = Router()

// GET /api/classes
router.get('/', (_req: Request, res: Response) => {
  const db = getDb()
  const classes = db.prepare(
    `SELECT DISTINCT class FROM users WHERE role = 'student' AND class != '' ORDER BY class`
  ).all() as { class: string }[]
  res.json(classes.map(c => c.class))
})

export default router
