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

// ── Constants ──────────────────────────────────────────────────────────────

const ALL_PERMISSIONS = [
  { code: 'students.read', label: '查看学生', category: '学生管理' },
  { code: 'students.write', label: '添加/编辑学生', category: '学生管理' },
  { code: 'students.delete', label: '删除学生', category: '学生管理' },
  { code: 'points.read', label: '查看积分', category: '积分管理' },
  { code: 'points.write', label: '加减积分', category: '积分管理' },
  { code: 'scores.read', label: '查看成绩', category: '成绩管理' },
  { code: 'scores.write', label: '录入成绩', category: '成绩管理' },
  { code: 'scores.delete', label: '删除成绩', category: '成绩管理' },
  { code: 'assignments.read', label: '查看作业', category: '作业管理' },
  { code: 'assignments.write', label: '布置作业', category: '作业管理' },
  { code: 'assignments.submit', label: '提交作业', category: '作业管理' },
  { code: 'assignments.grade', label: '批改作业', category: '作业管理' },
  { code: 'chat.access', label: '使用AI助手', category: 'AI助手' },
  { code: 'chat.config', label: '配置API Key', category: 'AI助手' },
  { code: 'chat.skills', label: '管理 Skill', category: 'AI助手' },
  { code: 'chat.unlimited', label: '不受调用限制', category: 'AI助手' },
  { code: 'roles.manage', label: '管理权限组', category: '系统设置' },
  { code: 'audit_logs.read', label: '查看操作日志', category: '系统设置' },
  { code: 'classes.read', label: '查看班级列表', category: '系统设置' },
  { code: 'classes.view_all', label: '查看全部班级', category: '系统设置' },
  // AI 工具权限（tool. 前缀统一管理）
  { code: 'tool.list_students', label: '查询学生列表', category: 'AI 工具' },
  { code: 'tool.get_student_points', label: '查询学生积分', category: 'AI 工具' },
  { code: 'tool.add_points', label: '加减积分', category: 'AI 工具' },
  { code: 'tool.get_score_rankings', label: '成绩排名', category: 'AI 工具' },
  { code: 'tool.list_assignments', label: '作业列表', category: 'AI 工具' },
  { code: 'tool.get_submissions', label: '提交情况', category: 'AI 工具' },
  { code: 'tool.get_weather', label: '天气查询', category: 'AI 工具' },
  { code: 'tool.web_search', label: '联网搜索', category: 'AI 工具' },
  { code: 'tool.random_pick', label: '随机抽取', category: 'AI 工具' },
  { code: 'tool.get_current_time', label: '当前时间', category: 'AI 工具' },
  { code: 'tool.get_class_list', label: '班级列表', category: 'AI 工具' },
  { code: 'tool.view_file', label: '查看文件', category: 'AI 工具' },
  { code: 'tool.create_student', label: '创建学生', category: 'AI 工具' },
  { code: 'tool.update_student', label: '修改学生', category: 'AI 工具' },
  { code: 'tool.delete_student', label: '删除学生', category: 'AI 工具' },
]

// ── Zod Schemas ────────────────────────────────────────────────────────────

const createGroupSchema = z.object({
  name: z.string().min(1, '请输入权限组名称'),
  description: z.string().optional().default(''),
  permissions: z.array(z.string()).optional().default([]),
})

const updateGroupSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
})

// ── Routes ─────────────────────────────────────────────────────────────────

// GET /api/roles/permissions — list all available permission codes
router.get('/permissions', (_req: Request, res: Response) => {
  ok(res, ALL_PERMISSIONS)
})

// GET /api/roles/groups — list all permission groups
router.get('/groups', (_req: Request, res: Response) => {
  const db = getDb()
  const groups = db.prepare('SELECT * FROM permission_groups ORDER BY id').all() as {
    id: number; name: string; description: string; created_at: string
  }[]

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

  const group = db.prepare('SELECT * FROM permission_groups WHERE id = ?').get(id) as {
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

  const result = db.prepare(
    'INSERT INTO permission_groups (name, description) VALUES (?, ?)'
  ).run(name, description)

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

  // Unlink users from this group
  db.prepare('UPDATE users SET group_id = NULL WHERE group_id = ?').run(id)
  // Delete group (cascades to group_permissions)
  db.prepare('DELETE FROM permission_groups WHERE id = ?').run(id)

  writeAuditLog(req.user!.id, req.user!.display_name, 'delete_role', 'role', id, { name: (existing as any).name })
  ok(res, { success: true })
})

export default router
