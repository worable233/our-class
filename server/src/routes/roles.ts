import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getDb } from '../db/init.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ok, fail } from '../lib/response.js'
import { NotFoundError } from '../lib/errors.js'
import { writeAuditLog } from './audit.js'

const router = Router()
router.use(authMiddleware)

// ── Zod Schemas ────────────────────────────────────────────────────────────

const createGroupSchema = z.object({
  name: z.string().min(1, '请输入权限组名称'),
  description: z.string().optional().default(''),
  permissions: z.array(z.string()).optional().default([]),
  parent_id: z.number().int().nullable().optional(),
  class: z.string().optional().default(''),
  group_type: z.enum(['admin', 'teacher', 'student', 'custom']).optional().default('custom'),
})

const updateGroupSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  class: z.string().optional(),
  group_type: z.enum(['admin', 'teacher', 'student', 'custom']).optional(),
})

// ── Routes ─────────────────────────────────────────────────────────────────

// GET /api/roles/permissions — list all available permission codes (from DB registry)
router.get('/permissions', (_req: Request, res: Response) => {
  const db = getDb()
  const perms = db.prepare('SELECT code, label, category, description FROM permissions ORDER BY category, code').all()
  ok(res, perms)
})

// GET /api/roles/groups — list all permission groups (支持 ?class=xxx 筛选)
router.get('/groups', (req: Request, res: Response) => {
  const db = getDb()
  const { permissions, class: userClass } = req.user!
  const hasViewAll = permissions.includes('classes.view_all')
  const filterClass = req.query.class as string | undefined

  // 非 viewAll 用户：职位（有 parent_id）只显示自己班级的
  let classFilter = ''
  const params: unknown[] = []
  if (!hasViewAll) {
    const myClasses = userClass.split(',').filter(Boolean).map(c => c.trim())
    if (myClasses.length > 0) {
      classFilter = ` AND (pg.parent_id IS NULL OR pg.class IN (${myClasses.map(() => '?').join(',')}))`
      params.push(...myClasses)
    }
  } else if (filterClass) {
    classFilter = ' AND pg.class = ?'
    params.push(filterClass)
  }

  const groups = db.prepare(`
    SELECT pg.*, parent.name as parent_name
    FROM permission_groups pg
    LEFT JOIN permission_groups parent ON pg.parent_id = parent.id
    WHERE 1=1${classFilter}
    ORDER BY pg.id
  `).all(...params) as any[]

  // Load permissions for each group
  const result = groups.map(g => {
    const perms = db.prepare(
      'SELECT permission_code FROM group_permissions WHERE group_id = ?'
    ).all(g.id) as { permission_code: string }[]
    return { ...g, permissions: perms.map(p => p.permission_code) }
  })

  ok(res, result)
})

// GET /api/roles/groups/:id
router.get('/groups/:id', (req: Request, res: Response) => {
  const db = getDb()
  const id = Number(req.params.id)
  if (isNaN(id)) {
    return fail(res, 400, 'VALIDATION_ERROR', '无效的 ID')
  }

  const group = db.prepare('SELECT pg.*, parent.name as parent_name FROM permission_groups pg LEFT JOIN permission_groups parent ON pg.parent_id = parent.id WHERE pg.id = ?').get(id) as {
    id: number; name: string; description: string; created_at: string
  } | undefined

  if (!group) throw new NotFoundError('权限组不存在')

  const perms = db.prepare(
    'SELECT permission_code FROM group_permissions WHERE group_id = ?'
  ).all(id) as { permission_code: string }[]

  ok(res, { ...group, permissions: perms.map(p => p.permission_code) })
})

// POST /api/roles/groups — create a new permission group
router.post('/groups', requirePermission('roles.manage'), validate(createGroupSchema), (req: Request, res: Response) => {
  const db = getDb()
  const { name, description, permissions } = req.body

  // 检查名称唯一性
  const dup = db.prepare('SELECT id FROM permission_groups WHERE name = ?').get(name)
  if (dup) {
    return fail(res, 409, 'DUPLICATE_NAME', `权限组「${name}」已存在`)
  }

  const groupType = req.body.group_type || 'custom'
  const result = db.prepare(
    'INSERT INTO permission_groups (name, description, parent_id, class, group_type) VALUES (?, ?, ?, ?, ?)'
  ).run(name, description, req.body.parent_id || null, req.body.class || '', groupType)

  const groupId = result.lastInsertRowid

  // Insert permissions
  const insertPerm = db.prepare(
    'INSERT INTO group_permissions (group_id, permission_code) VALUES (?, ?)'
  )
  for (const code of permissions) {
    insertPerm.run(groupId, code)
  }

  const group = db.prepare('SELECT * FROM permission_groups WHERE id = ?').get(groupId)
  writeAuditLog(req.user!.id, req.user!.display_name, 'create_role', 'role', groupId as number, { name, permissions })
  ok(res, { ...(group as any), permissions })
})

// PUT /api/roles/groups/:id — update permission group
router.put('/groups/:id', requirePermission('roles.manage'), validate(updateGroupSchema), (req: Request, res: Response) => {
  const db = getDb()
  const id = Number(req.params.id)
  if (isNaN(id)) {
    return fail(res, 400, 'VALIDATION_ERROR', '无效的 ID')
  }

  const existing = db.prepare('SELECT * FROM permission_groups WHERE id = ?').get(id)
  if (!existing) throw new NotFoundError('权限组不存在')

  // 检查名称唯一性（排除自身）
  if (req.body.name) {
    const dup = db.prepare('SELECT id FROM permission_groups WHERE name = ? AND id != ?').get(req.body.name, id)
    if (dup) {
      return fail(res, 409, 'DUPLICATE_NAME', `权限组「${req.body.name}」已存在`)
    }
    db.prepare('UPDATE permission_groups SET name = ? WHERE id = ?').run(req.body.name, id)
  }
  if (req.body.description !== undefined) {
    db.prepare('UPDATE permission_groups SET description = ? WHERE id = ?').run(req.body.description, id)
  }
  if (req.body.class !== undefined) {
    db.prepare("UPDATE permission_groups SET class = ? WHERE id = ?").run(req.body.class, id)
  }
  if (req.body.group_type !== undefined) {
    db.prepare("UPDATE permission_groups SET group_type = ? WHERE id = ?").run(req.body.group_type, id)
  }

  // Update permissions if provided
  if (req.body.permissions) {
    db.prepare('DELETE FROM group_permissions WHERE group_id = ?').run(id)
    const insertPerm = db.prepare(
      'INSERT INTO group_permissions (group_id, permission_code) VALUES (?, ?)'
    )
    for (const code of req.body.permissions) {
      insertPerm.run(id, code)
    }
  }

  const updated = db.prepare('SELECT * FROM permission_groups WHERE id = ?').get(id)
  const perms = db.prepare(
    'SELECT permission_code FROM group_permissions WHERE group_id = ?'
  ).all(id) as { permission_code: string }[]

  writeAuditLog(req.user!.id, req.user!.display_name, 'update_role', 'role', id, {
    name: (updated as any).name,
    permissions: perms.map(p => p.permission_code),
  })
  ok(res, { ...(updated as any), permissions: perms.map(p => p.permission_code) })
})

// DELETE /api/roles/groups/:id
router.delete('/groups/:id', requirePermission('roles.manage'), (req: Request, res: Response) => {
  const db = getDb()
  const id = Number(req.params.id)
  if (isNaN(id)) {
    return fail(res, 400, 'VALIDATION_ERROR', '无效的 ID')
  }

  const existing = db.prepare('SELECT * FROM permission_groups WHERE id = ?').get(id)
  if (!existing) throw new NotFoundError('权限组不存在')

  // Unlink users from this group and role
  db.prepare('UPDATE users SET group_id = NULL WHERE group_id = ?').run(id)
  db.prepare('UPDATE users SET role_id = NULL WHERE role_id = ?').run(id)
  // Delete group (cascades to group_permissions)
  db.prepare('DELETE FROM permission_groups WHERE id = ?').run(id)

  writeAuditLog(req.user!.id, req.user!.display_name, 'delete_role', 'role', id, { name: (existing as any).name })
  ok(res, { success: true })
})



// ── Role Groups (子权限组) ─────────────────────────────────────────

// POST /api/roles/role-groups — 创建子权限组（教师可操作，无需 roles.manage）
router.post('/role-groups', authMiddleware, validate(createGroupSchema), (req: Request, res: Response) => {
  const db = getDb()
  const { name, description, parent_id, class: roleClass, permissions } = req.body
  if (!parent_id) return fail(res, 400, 'VALIDATION', '请选择父权限组')
  if (!roleClass) return fail(res, 400, 'VALIDATION', '请选择班级')

  // Check parent exists and is an identity group (no parent)
  const parent = db.prepare('SELECT id FROM permission_groups WHERE id = ? AND parent_id IS NULL').get(parent_id) as any
  if (!parent) return fail(res, 400, 'INVALID_PARENT', '父权限组不存在或不是身份组')

  // Check duplicate name
  const dup = db.prepare('SELECT id FROM permission_groups WHERE name = ? AND parent_id = ?').get(name, parent_id)
  if (dup) return fail(res, 409, 'DUPLICATE_NAME', '该身份下已存在同名职位')

  // Check class permission
  const userPerms = (req.user as any)?.permissions || []
  if (!userPerms.includes('classes.view_all') && req.user!.class !== roleClass) {
    return fail(res, 403, 'FORBIDDEN', '无权在该班级创建职位')
  }

  // Check delegate permission: user must have all permissions they're granting
  const extra = (permissions || []) as string[]
  for (const code of extra) {
    if (!userPerms.includes(code)) {
      return fail(res, 403, 'FORBIDDEN', `您没有权限「${code}」，无法将其授予职位`)
    }
  }

  const result = db.prepare('INSERT INTO permission_groups (name, description, parent_id, class) VALUES (?, ?, ?, ?)')
    .run(name, description || '', parent_id, roleClass)
  const gid = result.lastInsertRowid

  const insert = db.prepare('INSERT INTO group_permissions (group_id, permission_code) VALUES (?, ?)')
  for (const code of extra) insert.run(gid, code)

  const group = db.prepare('SELECT pg.*, parent.name as parent_name FROM permission_groups pg LEFT JOIN permission_groups parent ON pg.parent_id = parent.id WHERE pg.id = ?').get(gid)
  writeAuditLog(req.user!.id, req.user!.display_name, 'create_role_group', 'role', gid as number, { name, parent_id, class: roleClass, extra_permissions: extra })
  ok(res, { ...(group as any), permissions: extra })
})

// PUT /api/roles/role-groups/:id — 更新子权限组
router.put('/role-groups/:id', authMiddleware, validate(updateGroupSchema), (req: Request, res: Response) => {
  const db = getDb()
  const id = Number(req.params.id)
  if (isNaN(id)) return fail(res, 400, 'VALIDATION', '无效ID')

  const group = db.prepare('SELECT * FROM permission_groups WHERE id = ? AND parent_id IS NOT NULL').get(id) as any
  if (!group) return fail(res, 404, 'NOT_FOUND', '子权限组不存在')

  const userPerms = (req.user as any)?.permissions || []
  const targetClass = req.body.class ?? group.class
  if (!userPerms.includes('classes.view_all') && req.user!.class !== targetClass) {
    return fail(res, 403, 'FORBIDDEN', '无权修改该班级的职位')
  }

  if (req.body.name) {
    db.prepare('UPDATE permission_groups SET name = ? WHERE id = ?').run(req.body.name, id)
  }
  if (req.body.class !== undefined) {
    db.prepare('UPDATE permission_groups SET class = ? WHERE id = ?').run(req.body.class, id)
  }

  if (req.body.permissions) {
    const extra = req.body.permissions as string[]
    for (const code of extra) {
      if (!userPerms.includes(code)) {
        return fail(res, 403, 'FORBIDDEN', `您没有权限「${code}」`)
      }
    }
    db.prepare('DELETE FROM group_permissions WHERE group_id = ?').run(id)
    const insert = db.prepare('INSERT INTO group_permissions (group_id, permission_code) VALUES (?, ?)')
    for (const code of extra) insert.run(id, code)
  }

  const updated = db.prepare('SELECT pg.*, parent.name as parent_name FROM permission_groups pg LEFT JOIN permission_groups parent ON pg.parent_id = parent.id WHERE pg.id = ?').get(id)
  const perms = db.prepare('SELECT permission_code FROM group_permissions WHERE group_id = ?').all(id) as { permission_code: string }[]
  writeAuditLog(req.user!.id, req.user!.display_name, 'update_role_group', 'role', id, { name: req.body.name, extra_permissions: perms.map(p => p.permission_code) })
  ok(res, { ...(updated as any), permissions: perms.map(p => p.permission_code) })
})

// DELETE /api/roles/role-groups/:id — 删除子权限组
router.delete('/role-groups/:id', authMiddleware, (req: Request, res: Response) => {
  const db = getDb()
  const id = Number(req.params.id)
  if (isNaN(id)) return fail(res, 400, 'VALIDATION', '无效ID')

  const group = db.prepare('SELECT * FROM permission_groups WHERE id = ? AND parent_id IS NOT NULL').get(id) as any
  if (!group) return fail(res, 404, 'NOT_FOUND', '子权限组不存在')

  const userPerms = (req.user as any)?.permissions || []
  if (!userPerms.includes('classes.view_all') && req.user!.class !== group.class) {
    return fail(res, 403, 'FORBIDDEN', '无权删除该班级的职位')
  }

  db.prepare('UPDATE users SET role_id = NULL WHERE role_id = ?').run(id)
  db.prepare('DELETE FROM permission_groups WHERE id = ?').run(id)
  writeAuditLog(req.user!.id, req.user!.display_name, 'delete_role_group', 'role', id, { name: group.name })
  ok(res, { success: true })
})

export default router
