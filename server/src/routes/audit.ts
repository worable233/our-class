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

// ── Helper: get user's class list ───────────────────────────────────────────

function getUserClasses(user: NonNullable<Request['user']>): string[] {
  return user.class.split(',').filter(Boolean).map(c => c.trim())
}

// ── Validation ───────────────────────────────────────────────────────────────

const listSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
  entity_type: z.string().optional(),
  action: z.string().optional(),
  class: z.string().optional(),
})

// ── GET /api/audit — list audit logs ────────────────────────────────────────

router.get('/', requirePermission('audit_logs.read'), validate(listSchema, 'query'), (req: Request, res: Response) => {
  const db = getDb()
  const { page, pageSize, entity_type, action, class: filterClass } = req.query as unknown as z.infer<typeof listSchema>
  const user = req.user!
  const hasViewAll = user.permissions.includes('classes.view_all')

  // 决定 class 过滤条件
  let targetClass = filterClass || ''
  if (!hasViewAll) {
    // 没有全部班级权限，只看自己班级
    const myClasses = getUserClasses(user)
    targetClass = myClasses[0] || ''
  }

  let where = 'WHERE 1=1'
  const params: unknown[] = []
  if (entity_type) { where += ' AND a.entity_type = ?'; params.push(entity_type) }
  if (action) { where += ' AND a.action = ?'; params.push(action) }

  // 按班级过滤（仅对 point 类型的 audit 日志生效）
  if (targetClass) {
    where += ` AND (a.entity_type != 'point' OR a.entity_id IN (
      SELECT p.id FROM point_records p JOIN users u ON p.student_id = u.id WHERE u.class = ?
    ))`
    params.push(targetClass)
  }

  const countRow = db.prepare(`SELECT COUNT(*) as c FROM audit_logs a ${where}`).get(...params) as { c: number }
  const total = countRow.c

  const offset = (page - 1) * pageSize
  const rows = db.prepare(
    `SELECT a.* FROM audit_logs a ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
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
