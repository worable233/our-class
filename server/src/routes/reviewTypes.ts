import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getDb } from '../db/init.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ok, fail } from '../lib/response.js'
import { NotFoundError } from '../lib/errors.js'

const router = Router()
router.use(authMiddleware)

const createSchema = z.object({
  name: z.string().min(1, '请输入名称'),
  emoji: z.string().min(1, '请选择图标'),
  type: z.enum(['add', 'deduct']),
  amount: z.number().int().min(1).max(100),
  class: z.string().optional().default(''),
})

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  emoji: z.string().optional(),
  type: z.enum(['add', 'deduct']).optional(),
  amount: z.number().int().min(1).max(100).optional(),
  is_active: z.boolean().optional(),
  class: z.string().optional(),
})

// GET /api/review-types?class=xxx — 按班级获取点评类型
router.get('/', (req: Request, res: Response) => {
  const db = getDb()
  const { permissions, class: userClass } = req.user!
  const hasViewAll = permissions.includes('classes.view_all')
  const filterClass = req.query.class as string | undefined

  // 决定可见的班级范围
  let visibleClasses: string[] = []
  if (hasViewAll) {
    // 有全部权限时，可按筛选参数过滤
    visibleClasses = filterClass ? [filterClass] : []
  } else {
    // 无全部权限时，只看自己班级 + 全局的('')
    const myClasses = userClass.split(',').filter(Boolean).map(c => c.trim())
    visibleClasses = filterClass
      ? (myClasses.includes(filterClass) ? [filterClass, ''] : [''])  // 请求的班级不在权限内
      : [...myClasses, '']
  }

  const placeholders = visibleClasses.map(() => '?').join(',')
  const sql = visibleClasses.length > 0
    ? `SELECT * FROM review_types WHERE class IN (${placeholders}) ORDER BY type, sort_order, id`
    : 'SELECT * FROM review_types ORDER BY type, sort_order, id'

  const types = db.prepare(sql).all(...visibleClasses)
  ok(res, types)
})

// POST /api/review-types
router.post('/', requirePermission('points.write'), validate(createSchema), (req: Request, res: Response) => {
  const db = getDb()
  const { name, emoji, type, amount, class: reviewClass } = req.body
  // 班级权限检查
  if (reviewClass) {
    const hasViewAll = req.user!.permissions.includes('classes.view_all')
    if (!hasViewAll) {
      const myClasses = req.user!.class.split(',').filter(Boolean).map(c => c.trim())
      if (!myClasses.includes(reviewClass)) return fail(res, 403, 'FORBIDDEN', '无权在该班级创建点评')
    }
  }
  const result = db.prepare(
    'INSERT INTO review_types (name, emoji, type, amount, class) VALUES (?, ?, ?, ?, ?)'
  ).run(name, emoji, type, amount, reviewClass || '')
  const row = db.prepare('SELECT * FROM review_types WHERE id = ?').get(result.lastInsertRowid)
  ok(res, row)
})

// PUT /api/review-types/:id
router.put('/:id', requirePermission('points.write'), validate(updateSchema), (req: Request, res: Response) => {
  const db = getDb()
  const id = Number(req.params.id)
  const existing = db.prepare('SELECT * FROM review_types WHERE id = ?').get(id)
  if (!existing) throw new NotFoundError('点评类型不存在')

  const { name, emoji, type, amount, is_active, class: reviewClass } = req.body
  const fields: string[] = []; const vals: unknown[] = []
  if (name !== undefined) { fields.push('name = ?'); vals.push(name) }
  if (emoji !== undefined) { fields.push('emoji = ?'); vals.push(emoji) }
  if (type !== undefined) { fields.push('type = ?'); vals.push(type) }
  if (amount !== undefined) { fields.push('amount = ?'); vals.push(amount) }
  if (is_active !== undefined) { fields.push('is_active = ?'); vals.push(is_active ? 1 : 0) }
  if (reviewClass !== undefined) { fields.push('class = ?'); vals.push(reviewClass) }
  if (fields.length > 0) {
    vals.push(id)
    db.prepare(`UPDATE review_types SET ${fields.join(', ')} WHERE id = ?`).run(...vals)

    // If name changed, backfill existing point records so history stays consistent
    if (name !== undefined) {
      db.prepare('UPDATE point_records SET reason = ? WHERE review_type_id = ?').run(name, id)
    }
  }
  const row = db.prepare('SELECT * FROM review_types WHERE id = ?').get(id)

  // Build response message
  let msg = '已保存'
  if (name !== undefined) msg = '名称已更新，历史记录同步更新'
  else if (amount !== undefined) msg = `分值已改为 ${amount} 分，已有记录不受影响`
  ok(res, { ...(row as any), message: msg })
})

// DELETE /api/review-types/:id
router.delete('/:id', requirePermission('points.write'), (req: Request, res: Response) => {
  const db = getDb()
  const id = Number(req.params.id)
  const existing = db.prepare('SELECT * FROM review_types WHERE id = ?').get(id)
  if (!existing) throw new NotFoundError('点评类型不存在')

  // Check if any point records reference this review type
  const usage = db.prepare('SELECT COUNT(*) as c FROM point_records WHERE review_type_id = ?').get(id) as { c: number }
  if (usage.c > 0) {
    return fail(res, 400, 'IN_USE', `该点评类型已被 ${usage.c} 条记录使用，无法删除。建议修改为"已停用"状态`)
  }

  db.prepare('DELETE FROM review_types WHERE id = ?').run(id)
  ok(res, { success: true })
})

export default router
