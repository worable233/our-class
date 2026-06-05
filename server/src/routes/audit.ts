import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getDb } from '../db/init.js'
import { validate } from '../middleware/validate.js'
import { ok } from '../lib/response.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'

const router = Router()
router.use(authMiddleware)

// ── Helper: write an audit log ──────────────────────────────────────────────

export function writeAuditLog(
  userId: number,
  userName: string,
  action: string,
  entityType: string,
  entityId?: number,
  details?: Record<string, unknown>,
) {
  const db = getDb()
  db.prepare(
    'INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(userId, userName, action, entityType, entityId || null, JSON.stringify(details || {}))
}

// ── Validation ───────────────────────────────────────────────────────────────

const listSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
  entity_type: z.string().optional(),
  action: z.string().optional(),
})

// ── GET /api/audit — list audit logs ────────────────────────────────────────

router.get('/', requirePermission('audit_logs.read'), validate(listSchema, 'query'), (req: Request, res: Response) => {
  const db = getDb()
  const { page, pageSize, entity_type, action } = req.query as unknown as z.infer<typeof listSchema>

  let where = 'WHERE 1=1'
  const params: unknown[] = []
  if (entity_type) { where += ' AND entity_type = ?'; params.push(entity_type) }
  if (action) { where += ' AND action = ?'; params.push(action) }

  const countRow = db.prepare(`SELECT COUNT(*) as c FROM audit_logs ${where}`).get(...params) as { c: number }
  const total = countRow.c

  const offset = (page - 1) * pageSize
  const rows = db.prepare(
    `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  ).all(...params, pageSize, offset)

  ok(res, rows, {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  })
})

// ── GET /api/audit/types — get distinct entity types for filter ─────────────

router.get('/types', requirePermission('audit_logs.read'), (_req: Request, res: Response) => {
  const db = getDb()
  const types = db.prepare(
    'SELECT DISTINCT entity_type FROM audit_logs ORDER BY entity_type',
  ).all() as { entity_type: string }[]
  ok(res, types.map(t => t.entity_type))
})

export default router
