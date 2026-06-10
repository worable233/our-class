import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getDb } from '../db/init.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ok } from '../lib/response.js'

const router = Router()
router.use(authMiddleware)

const updateSchema = z.object({
  site_title: z.string().min(1, '网站标题不能为空').optional(),
  site_icon: z.string().optional(),
  site_description: z.string().optional(),
  footer_text: z.string().optional(),
})

// GET /api/site-settings — 获取站点设置
router.get('/', (_req: Request, res: Response) => {
  const db = getDb()
  let settings = db.prepare('SELECT * FROM site_settings WHERE id = 1').get() as any
  if (!settings) {
    db.prepare('INSERT INTO site_settings (id, site_title) VALUES (1, ?)').run('OurClass')
    settings = { id: 1, site_title: 'OurClass', site_icon: '', site_description: '', footer_text: '' }
  }
  ok(res, settings)
})

// PUT /api/site-settings — 更新站点设置
router.put('/', requirePermission('chat.config'), validate(updateSchema), (req: Request, res: Response) => {
  const db = getDb()
  const fields: string[] = []
  const params: any[] = []
  const allowed = ['site_title', 'site_icon', 'site_description', 'footer_text']
  for (const key of allowed) {
    if ((req.body as any)[key] !== undefined) {
      fields.push(`${key} = ?`)
      params.push((req.body as any)[key])
    }
  }
  if (fields.length > 0) {
    fields.push('updated_at = CURRENT_TIMESTAMP')
    db.prepare(`UPDATE site_settings SET ${fields.join(', ')} WHERE id = 1`).run(...params)
  }
  const settings = db.prepare('SELECT * FROM site_settings WHERE id = 1').get() as any
  ok(res, settings)
})

export default router
