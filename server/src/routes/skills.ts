import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { getDb } from '../db/init.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ok, fail } from '../lib/response.js'
import { NotFoundError, ForbiddenError } from '../lib/errors.js'
import { writeAuditLog } from './audit.js'

const router = Router()
router.use(authMiddleware)

// Allow both chat.skills and chat.config (backward compat for existing installs)
function requireSkillsOrConfig(req: Request, _res: Response, next: NextFunction) {
  if (!req.user?.permissions?.includes('chat.config')) {
    throw new ForbiddenError('权限不足')
  }
  next()
}

// ── Zod Schemas ───────────────────────────────────────────────────────────

const createSkillSchema = z.object({
  name: z.string().min(1).max(100),
  content: z.string().optional().default(''),
  enabled: z.boolean().optional().default(true),
})

const updateSkillSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  content: z.string().optional(),
  enabled: z.boolean().optional(),
})

const reorderSchema = z.object({
  items: z.array(z.object({ id: z.number(), sort_order: z.number() })),
})

// ── Routes ─────────────────────────────────────────────────────────────────

// GET /api/chat/skills — 获取所有 skill
router.get(
  '/skills',
  requireSkillsOrConfig,
  (req: Request, res: Response) => {
    const db = getDb()
    const rows = db
      .prepare('SELECT id, name, content, sort_order, enabled, created_at, updated_at FROM skills WHERE user_id = ? ORDER BY sort_order ASC, id ASC')
      .all(req.user!.id)
    ok(res, rows)
  },
)

// GET /api/chat/skills/enabled — 获取所有启用的 skill（供 chat 流程注入，无需 chat.skills 权限但需要 chat.access）
router.get(
  '/skills/enabled',
  requirePermission('chat.access'),
  (req: Request, res: Response) => {
    const db = getDb()
    const rows = db
      .prepare('SELECT name, content FROM skills WHERE user_id = ? AND enabled = 1 ORDER BY sort_order ASC, id ASC')
      .all(req.user!.id)
    ok(res, rows)
  },
)

// POST /api/chat/skills — 新建 skill
router.post(
  '/skills',
  requireSkillsOrConfig,
  validate(createSkillSchema),
  (req: Request, res: Response) => {
    const db = getDb()
    const userId = req.user!.id
    const { name, content, enabled } = req.body

    // Auto-increment sort_order
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM skills WHERE user_id = ?').get(userId) as any
    const sortOrder = maxOrder.m + 1

    const result = db
      .prepare('INSERT INTO skills (user_id, name, content, sort_order, enabled) VALUES (?, ?, ?, ?, ?)')
      .run(userId, name, content, sortOrder, enabled ? 1 : 0)

    const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(result.lastInsertRowid)
    writeAuditLog(userId, req.user!.display_name, 'create_skill', 'skill', result.lastInsertRowid as number, { name })
    ok(res, skill)
  },
)

// PUT /api/chat/skills/:id — 更新 skill
router.put(
  '/skills/:id',
  requireSkillsOrConfig,
  validate(updateSkillSchema),
  (req: Request, res: Response) => {
    const db = getDb()
    const userId = req.user!.id
    const id = Number(req.params.id)
    if (isNaN(id)) return fail(res, 400, 'VALIDATION_ERROR', '无效的 ID')

    const existing = db.prepare('SELECT * FROM skills WHERE id = ? AND user_id = ?').get(id, userId)
    if (!existing) throw new NotFoundError('Skill 不存在')

    const fields: string[] = []
    const params: any[] = []
    if (req.body.name !== undefined) { fields.push('name = ?'); params.push(req.body.name) }
    if (req.body.content !== undefined) { fields.push('content = ?'); params.push(req.body.content) }
    if (req.body.enabled !== undefined) { fields.push('enabled = ?'); params.push(req.body.enabled ? 1 : 0) }

    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP')
      db.prepare(`UPDATE skills SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...params, id, userId)
    }

    const updated = db.prepare('SELECT * FROM skills WHERE id = ?').get(id)
    writeAuditLog(userId, req.user!.display_name, 'update_skill', 'skill', id, req.body)
    ok(res, updated)
  },
)

// DELETE /api/chat/skills/:id — 删除 skill
router.delete(
  '/skills/:id',
  requireSkillsOrConfig,
  (req: Request, res: Response) => {
    const db = getDb()
    const userId = req.user!.id
    const id = Number(req.params.id)
    if (isNaN(id)) return fail(res, 400, 'VALIDATION_ERROR', '无效的 ID')

    const existing = db.prepare('SELECT * FROM skills WHERE id = ? AND user_id = ?').get(id, userId)
    if (!existing) throw new NotFoundError('Skill 不存在')

    db.prepare('DELETE FROM skills WHERE id = ? AND user_id = ?').run(id, userId)
    writeAuditLog(userId, req.user!.display_name, 'delete_skill', 'skill', id, { name: (existing as any).name })
    ok(res, { success: true })
  },
)

// PUT /api/chat/skills/reorder — 批量重排序
router.put(
  '/skills/reorder',
  requireSkillsOrConfig,
  validate(reorderSchema),
  (req: Request, res: Response) => {
    const db = getDb()
    const userId = req.user!.id
    const { items } = req.body

    const updateStmt = db.prepare('UPDATE skills SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
    const txn = db.transaction(() => {
      for (const item of items) {
        updateStmt.run(item.sort_order, item.id, userId)
      }
    })
    txn()

    writeAuditLog(userId, req.user!.display_name, 'reorder_skills', 'skill', undefined, { count: items.length })
    ok(res, { success: true })
  },
)

export default router
