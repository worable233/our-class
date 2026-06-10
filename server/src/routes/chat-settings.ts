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

// ── Zod Schemas ───────────────────────────────────────────────────────────

const updateSettingsSchema = z.object({
  enable_deep_think: z.boolean().optional(),
  enable_file_upload: z.boolean().optional(),
  allowed_file_types: z.string().optional(),
  max_file_size: z.number().positive().optional(),
  max_files_per_conversation: z.number().positive().optional(),
})

const updateToolConfigSchema = z.object({
  config_json: z.string().optional(),
  max_result_length: z.number().positive().optional(),
  enabled: z.boolean().optional(),
})

// ── Available tools with defaults ──────────────────────────────────────────

const DEFAULT_TOOLS = [
  { tool_name: 'list_students', config_json: '{"max_results":50}', max_result_length: 500, enabled: true },
  { tool_name: 'get_student_points', config_json: '{"max_recent":20}', max_result_length: 500, enabled: true },
  { tool_name: 'add_points', config_json: '{}', max_result_length: 200, enabled: true },
  { tool_name: 'get_score_rankings', config_json: '{}', max_result_length: 800, enabled: true },
  { tool_name: 'list_assignments', config_json: '{}', max_result_length: 500, enabled: true },
  { tool_name: 'get_submissions', config_json: '{}', max_result_length: 800, enabled: true },
  { tool_name: 'get_weather', config_json: '{"default_city":"北京"}', max_result_length: 300, enabled: true },
  { tool_name: 'web_search', config_json: '{"max_results":5}', max_result_length: 800, enabled: true },
  { tool_name: 'random_pick', config_json: '{"max_count":20}', max_result_length: 300, enabled: true },
  { tool_name: 'get_current_time', config_json: '{}', max_result_length: 200, enabled: true },
  { tool_name: 'get_class_list', config_json: '{}', max_result_length: 200, enabled: true },
  { tool_name: 'view_file', config_json: '{}', max_result_length: 5000, enabled: true },
  { tool_name: 'create_students', config_json: '{}', max_result_length: 300, enabled: true },
  { tool_name: 'update_student', config_json: '{}', max_result_length: 300, enabled: true },
  { tool_name: 'delete_students', config_json: '{}', max_result_length: 200, enabled: true },
  { tool_name: 'manage_roles', config_json: '{}', max_result_length: 500, enabled: true },
  { tool_name: 'search_articles', config_json: '{"max_results":5}', max_result_length: 2000, enabled: true },
]

// ── Routes ─────────────────────────────────────────────────────────────────

// GET /api/chat/settings — 获取全局 AI 设置
router.get(
  '/settings',
  authMiddleware,
  (_req: Request, res: Response) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM chat_settings ORDER BY id ASC LIMIT 1').get() as any

    if (!row) {
      return ok(res, {
        enable_deep_think: false,
        enable_file_upload: false,
        allowed_file_types: '.doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.txt,.csv,.md,.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg',
        max_file_size: 10485760,
        max_files_per_conversation: 10,
      })
    }

    ok(res, {
      enable_deep_think: !!row.enable_deep_think,
      enable_file_upload: !!row.enable_file_upload,
      allowed_file_types: row.allowed_file_types,
      max_file_size: row.max_file_size,
      max_files_per_conversation: row.max_files_per_conversation,
    })
  },
)

// PUT /api/chat/settings — 更新全局 AI 设置
router.put(
  '/settings',
  requirePermission('chat.config'),
  validate(updateSettingsSchema),
  (req: Request, res: Response) => {
    const db = getDb()
    const userId = req.user!.id
    const existing = db.prepare('SELECT id FROM chat_settings WHERE user_id = ?').get(userId) as any

    if (existing) {
      const fields: string[] = []
      const params: any[] = []
      const allowed = ['enable_deep_think', 'enable_file_upload', 'allowed_file_types', 'max_file_size', 'max_files_per_conversation']
      for (const key of allowed) {
        if ((req.body as any)[key] !== undefined) {
          fields.push(`${key} = ?`)
          // Convert booleans to integers for SQLite compatibility
          let val = (req.body as any)[key]
          if (typeof val === 'boolean') val = val ? 1 : 0
          params.push(val)
        }
      }
      if (fields.length > 0) {
        fields.push('updated_at = CURRENT_TIMESTAMP')
        db.prepare(`UPDATE chat_settings SET ${fields.join(', ')} WHERE user_id = ?`).run(...params, userId)
      }
    } else {
      db.prepare(`
        INSERT INTO chat_settings (user_id, enable_deep_think, enable_file_upload, allowed_file_types, max_file_size, max_files_per_conversation)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        req.body.enable_deep_think ? 1 : 0,
        req.body.enable_file_upload ? 1 : 0,
        req.body.allowed_file_types ?? '.doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.txt,.csv,.md',
        req.body.max_file_size ?? 10485760,
        req.body.max_files_per_conversation ?? 10,
      )
    }

    writeAuditLog(userId, req.user!.display_name, 'update_chat_settings', 'config', undefined, { ...req.body })
    ok(res, { message: 'AI 设置已更新' })
  },
)

// GET /api/chat/tools/defaults — 获取默认工具配置列表
router.get(
  '/tools/defaults',
  requirePermission('chat.config'),
  (_req: Request, res: Response) => {
    ok(res, DEFAULT_TOOLS)
  },
)

// GET /api/chat/tools — 获取所有工具配置
router.get(
  '/tools',
  requirePermission('chat.config'),
  (_req: Request, res: Response) => {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM tool_configs').all() as any[]

    // Merge with defaults: show default if no custom config exists
    const result = DEFAULT_TOOLS.map(def => {
      const custom = rows.find((r: any) => r.tool_name === def.tool_name)
      return custom
        ? { tool_name: custom.tool_name, config_json: custom.config_json, max_result_length: custom.max_result_length, enabled: !!custom.enabled }
        : def
    })
    ok(res, result)
  },
)

// GET /api/chat/tools/:name — 获取单个工具配置
router.get(
  '/tools/:name',
  requirePermission('chat.config'),
  (req: Request, res: Response) => {
    const db = getDb()
    const name = req.params.name
    const row = db.prepare('SELECT * FROM tool_configs WHERE tool_name = ? ORDER BY id ASC LIMIT 1').get(name) as any

    if (row) {
      return ok(res, { tool_name: row.tool_name, config_json: row.config_json, max_result_length: row.max_result_length, enabled: !!row.enabled })
    }

    // Return default if no custom config
    const def = DEFAULT_TOOLS.find(t => t.tool_name === name)
    if (def) return ok(res, { ...def })
    throw new NotFoundError(`工具「${name}」不存在`)
  },
)

// PUT /api/chat/tools/:name — 更新工具配置
router.put(
  '/tools/:name',
  requirePermission('chat.config'),
  validate(updateToolConfigSchema),
  (req: Request, res: Response) => {
    const db = getDb()
    const userId = req.user!.id
    const name = req.params.name

    const existing = db.prepare('SELECT id FROM tool_configs WHERE tool_name = ? ORDER BY id ASC LIMIT 1').get(name) as any

    if (existing) {
      const fields: string[] = []
      const params: any[] = []
      if (req.body.config_json !== undefined) { fields.push('config_json = ?'); params.push(req.body.config_json) }
      if (req.body.max_result_length !== undefined) { fields.push('max_result_length = ?'); params.push(req.body.max_result_length) }
      if (req.body.enabled !== undefined) { fields.push('enabled = ?'); params.push(req.body.enabled ? 1 : 0) }
      if (fields.length > 0) {
        db.prepare(`UPDATE tool_configs SET ${fields.join(', ')} WHERE tool_name = ?`).run(...params, name)
      }
    } else {
      db.prepare(`
        INSERT INTO tool_configs (user_id, tool_name, config_json, max_result_length, enabled)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        userId,
        name,
        req.body.config_json || '{}',
        req.body.max_result_length ?? 500,
        req.body.enabled !== undefined ? (req.body.enabled ? 1 : 0) : 1,
      )
    }

    writeAuditLog(userId, req.user!.display_name, 'update_tool_config', 'config', undefined, { tool: name, ...req.body })
    ok(res, { message: `工具「${name}」配置已更新` })
  },
)

// ── Rate Limits ─────────────────────────────────────────────────────────

router.get('/rate-limits', requirePermission('chat.config'), (_req: Request, res: Response) => {
  const db = getDb()
  const row = db.prepare('SELECT * FROM rate_limits WHERE id = 1').get() as any
  if (!row) return ok(res, { max_rounds: 50, context_window: 20, max_agent_loops: 5, rapid_gap_ms: 1500, rapid_delay_ms: 2000 })
  ok(res, {
    max_rounds: row.max_rounds,
    context_window: row.context_window,
    max_agent_loops: row.max_agent_loops,
    rapid_gap_ms: row.rapid_gap_ms,
    rapid_delay_ms: row.rapid_delay_ms,
  })
})

router.put('/rate-limits', requirePermission('chat.config'), (req: Request, res: Response) => {
  const db = getDb()
  const { max_rounds, context_window, max_agent_loops, rapid_gap_ms, rapid_delay_ms } = req.body
  db.prepare(`INSERT INTO rate_limits (id, max_rounds, context_window, max_agent_loops, rapid_gap_ms, rapid_delay_ms)
    VALUES (1, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET max_rounds=COALESCE(?,max_rounds), context_window=COALESCE(?,context_window),
    max_agent_loops=COALESCE(?,max_agent_loops), rapid_gap_ms=COALESCE(?,rapid_gap_ms), rapid_delay_ms=COALESCE(?,rapid_delay_ms), updated_at=CURRENT_TIMESTAMP`)
    .run(
      max_rounds ?? 50, context_window ?? 20, max_agent_loops ?? 5, rapid_gap_ms ?? 1500, rapid_delay_ms ?? 2000,
      max_rounds ?? null, context_window ?? null, max_agent_loops ?? null, rapid_gap_ms ?? null, rapid_delay_ms ?? null,
    )
  ok(res, { saved: true })
})

export default router
