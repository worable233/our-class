import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getDb } from '../db/init.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ok, fail } from '../lib/response.js'
import { NotFoundError, ForbiddenError } from '../lib/errors.js'

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

/** 获取用户的班级列表 */
function getUserClasses(user: NonNullable<Request['user']>): string[] {
  return user.class.split(',').filter(Boolean).map(c => c.trim())
}

/** 检查是否有权限操作指定 scope 的点评类型 */
function assertReviewTypeScope(
  user: NonNullable<Request['user']>,
  reviewClass: string | undefined | null,
  operation: string,
): void {
  const hasViewAll = user.permissions.includes('classes.view_all')

  // 全局点评（class 为空或未指定）
  if (!reviewClass) {
    if (!hasViewAll) {
      throw new ForbiddenError(`无权限${operation}全局点评类型`)
    }
    return
  }

  // 班级点评
  if (!hasViewAll) {
    const myClasses = getUserClasses(user)
    if (!myClasses.includes(reviewClass)) {
      throw new ForbiddenError(`无权在该班级${operation}点评类型`)
    }
  }
}

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
    const myClasses = getUserClasses(req.user!)
    visibleClasses = filterClass
      ? (myClasses.includes(filterClass) ? [filterClass, ''] : [''])
      : [...myClasses, '']
  }

  const placeholders = visibleClasses.map(() => '?').join(',')
  const sql = visibleClasses.length > 0
    ? `SELECT * FROM review_types WHERE class IN (${placeholders}) ORDER BY type, sort_order, id`
    : 'SELECT * FROM review_types ORDER BY type, sort_order, id'

  const types = db.prepare(sql).all(...visibleClasses)
  ok(res, types)
})

// POST /api/review-types — 创建
router.post('/', requirePermission('points.write'), validate(createSchema), (req: Request, res: Response) => {
  const db = getDb()
  const { name, emoji, type, amount, class: reviewClass } = req.body

  // 检查班级/全局权限
  assertReviewTypeScope(req.user!, reviewClass, '创建')

  const result = db.prepare(
    'INSERT INTO review_types (name, emoji, type, amount, class) VALUES (?, ?, ?, ?, ?)'
  ).run(name, emoji, type, amount, reviewClass || '')
  const row = db.prepare('SELECT * FROM review_types WHERE id = ?').get(result.lastInsertRowid)
  ok(res, row)
})

// PUT /api/review-types/:id — 更新
router.put('/:id', requirePermission('points.write'), validate(updateSchema), (req: Request, res: Response) => {
  const db = getDb()
  const id = Number(req.params.id)
  const existing = db.prepare('SELECT * FROM review_types WHERE id = ?').get(id) as any
  if (!existing) throw new NotFoundError('点评类型不存在')

  const { name, emoji, type, amount, is_active, class: reviewClass } = req.body

  // 权限校验：检查是否可操作该点评类型
  assertReviewTypeScope(req.user!, existing.class, '修改')

  // 如果要修改 scope（班级归属），额外校验
  if (reviewClass !== undefined && reviewClass !== existing.class) {
    assertReviewTypeScope(req.user!, reviewClass, '修改为')
  }

  const fields: string[] = []
  const vals: unknown[] = []
  if (name !== undefined) { fields.push('name = ?'); vals.push(name) }
  if (emoji !== undefined) { fields.push('emoji = ?'); vals.push(emoji) }
  if (type !== undefined) { fields.push('type = ?'); vals.push(type) }
  if (amount !== undefined) { fields.push('amount = ?'); vals.push(amount) }
  if (is_active !== undefined) { fields.push('is_active = ?'); vals.push(is_active ? 1 : 0) }
  if (reviewClass !== undefined) { fields.push('class = ?'); vals.push(reviewClass) }
  if (fields.length > 0) {
    vals.push(id)
    db.prepare(`UPDATE review_types SET ${fields.join(', ')} WHERE id = ?`).run(...vals)

    // 名字变了，同步更新已有积分记录
    if (name !== undefined) {
      db.prepare('UPDATE point_records SET reason = ? WHERE review_type_id = ?').run(name, id)
    }
  }
  const row = db.prepare('SELECT * FROM review_types WHERE id = ?').get(id)

  let msg = '已保存'
  if (name !== undefined) msg = '名称已更新，历史记录同步更新'
  else if (amount !== undefined) msg = `分值已改为 ${amount} 分，已有记录不受影响`
  ok(res, { ...(row as any), message: msg })
})

// DELETE /api/review-types/:id — 删除
router.delete('/:id', requirePermission('points.write'), (req: Request, res: Response) => {
  const db = getDb()
  const id = Number(req.params.id)
  const existing = db.prepare('SELECT * FROM review_types WHERE id = ?').get(id) as any
  if (!existing) throw new NotFoundError('点评类型不存在')

  // 权限校验：检查是否可操作该点评类型
  assertReviewTypeScope(req.user!, existing.class, '删除')

  // 检查是否有积分记录引用
  const usage = db.prepare('SELECT COUNT(*) as c FROM point_records WHERE review_type_id = ?').get(id) as { c: number }
  if (usage.c > 0) {
    return fail(res, 400, 'IN_USE', `该点评类型已被 ${usage.c} 条记录使用，无法删除。建议修改为"已停用"状态`)
  }

  db.prepare('DELETE FROM review_types WHERE id = ?').run(id)
  ok(res, { success: true })
})

export default router
