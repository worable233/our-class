import { Router, Request, Response } from 'express'
import { getDb } from '../db/init.js'
import { requirePermission } from '../middleware/auth.js'
import { ok, fail } from '../lib/response.js'

const router = Router()

// GET /api/classes — 班级列表（含人数统计）
router.get('/', requirePermission('students.write'), (req: Request, res: Response) => {
  const db = getDb()
  const { permissions, class: userClass } = req.user!
  const hasViewAll = permissions.includes('classes.view_all')

  let where = ''
  const params: unknown[] = []
  if (!hasViewAll) {
    const myClasses = userClass.split(',').filter(Boolean).map(c => c.trim())
    if (myClasses.length > 0) {
      where = `WHERE c.name IN (${myClasses.map(() => '?').join(',')})`
      params.push(...myClasses)
    }
  }

  const rows = db.prepare(`
    SELECT c.id, c.name, COUNT(u.id) AS student_count
    FROM classes c
    LEFT JOIN users u ON u.class = c.name AND u.group_id = (SELECT id FROM permission_groups WHERE group_type = 'student' LIMIT 1)
    ${where}
    GROUP BY c.id, c.name
    ORDER BY c.name
  `).all(...params) as { id: number; name: string; student_count: number }[]
  ok(res, rows)
})

// POST /api/classes — 创建班级
router.post('/', requirePermission('students.write'), (req: Request, res: Response) => {
  const db = getDb()
  const { name } = req.body
  if (!name || typeof name !== 'string' || !name.trim()) {
    return fail(res, 400, 'INVALID_NAME', '请输入班级名称')
  }
  const trimmed = name.trim()
  const existing = db.prepare('SELECT id FROM classes WHERE name = ?').get(trimmed)
  if (existing) {
    return fail(res, 409, 'DUPLICATE', '该班级已存在')
  }
  const result = db.prepare('INSERT INTO classes (name) VALUES (?)').run(trimmed)
  ok(res, { id: result.lastInsertRowid, name: trimmed, student_count: 0 }, 201)
})

// PUT /api/classes/:id — 重命名班级
router.put('/:id', requirePermission('students.write'), (req: Request, res: Response) => {
  const db = getDb()
  const id = Number(req.params.id)
  const { name } = req.body
  if (!name || typeof name !== 'string' || !name.trim()) {
    return fail(res, 400, 'INVALID_NAME', '请输入班级名称')
  }
  const trimmed = name.trim()
  const dup = db.prepare('SELECT id FROM classes WHERE name = ? AND id != ?').get(trimmed, id)
  if (dup) {
    return fail(res, 409, 'DUPLICATE', '该班级名称已存在')
  }
  const old = db.prepare('SELECT name FROM classes WHERE id = ?').get(id) as { name: string } | undefined
  if (!old) {
    return fail(res, 404, 'NOT_FOUND', '班级不存在')
  }

  // 班级限制：只能修改自己班级
  if (!req.user?.permissions?.includes('classes.view_all')) {
    const myClasses = (req.user?.class || '').split(',').filter(Boolean).map(c => c.trim())
    if (!myClasses.includes(old.name)) {
      return fail(res, 403, 'FORBIDDEN', '无权修改其他班级')
    }
  }

  db.prepare('UPDATE classes SET name = ? WHERE id = ?').run(trimmed, id)
  // 同步更新 users 表中的班级名称
  db.prepare('UPDATE users SET class = ? WHERE class = ?').run(trimmed, old.name)
  ok(res, { id, name: trimmed })
})

// DELETE /api/classes/:id — 删除班级
router.delete('/:id', requirePermission('students.write'), (req: Request, res: Response) => {
  const db = getDb()
  const id = Number(req.params.id)
  const cls = db.prepare('SELECT name FROM classes WHERE id = ?').get(id) as { name: string } | undefined
  if (!cls) {
    return fail(res, 404, 'NOT_FOUND', '班级不存在')
  }

  // 班级限制：只能删除自己班级
  if (!req.user?.permissions?.includes('classes.view_all')) {
    const myClasses = (req.user?.class || '').split(',').filter(Boolean).map(c => c.trim())
    if (!myClasses.includes(cls.name)) {
      return fail(res, 403, 'FORBIDDEN', '无权删除其他班级')
    }
  }

  // 将该班级学生的 class 置空
  db.prepare('UPDATE users SET class = \'\' WHERE class = ?').run(cls.name)
  db.prepare('DELETE FROM classes WHERE id = ?').run(id)
  ok(res, { success: true })
})

export default router
