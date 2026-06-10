import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { existsSync, mkdirSync, renameSync, unlinkSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/init.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ok, fail } from '../lib/response.js'
import { NotFoundError, ValidationError } from '../lib/errors.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const COVER_DIR = join(__dirname, '..', '..', 'uploads', 'course_covers')
if (!existsSync(COVER_DIR)) mkdirSync(COVER_DIR, { recursive: true })

const router = Router()
router.use(authMiddleware)

const createSchema = z.object({
  name: z.string().min(1, '请输入课程名称'),
  description: z.string().optional().default(''),
  class: z.string().min(1, '请选择班级'),
})

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  class: z.string().optional(),
})

// Multer for cover image upload
const coverUploader = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, COVER_DIR),
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname)
      cb(null, `cover_${uuidv4()}${ext}`)
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('仅支持图片格式'))
    cb(null, true)
  },
})

// GET /api/courses — 课程列表（教师可查看自己权限范围内的班级的课程）
router.get('/', (req: Request, res: Response) => {
  const db = getDb()
  const { id: userId, permissions, class: userClass } = req.user!
  const hasViewAll = permissions.includes('classes.view_all')
  const allowedClasses = hasViewAll ? null : userClass.split(',').filter(Boolean).map(c => c.trim())

  let sql = 'SELECT c.*, u.display_name as creator_name FROM courses c JOIN users u ON c.created_by = u.id'
  const params: string[] = []

  if (!hasViewAll && allowedClasses && allowedClasses.length > 0) {
    sql += ` WHERE c.class IN (${allowedClasses.map(() => '?').join(',')})`
    params.push(...allowedClasses)
  }

  sql += ' ORDER BY c.updated_at DESC'

  ok(res, db.prepare(sql).all(...params))
})

// GET /api/courses/classes — 教师有权限的班级列表
router.get('/classes', (req: Request, res: Response) => {
  const db = getDb()
  const { permissions, class: userClass } = req.user!
  const hasViewAll = permissions.includes('classes.view_all')

  if (hasViewAll) {
    const rows = db.prepare('SELECT name FROM classes ORDER BY name').all() as { name: string }[]
    return ok(res, rows.map(r => r.name))
  }

  const classes = userClass.split(',').filter(Boolean).map(c => c.trim())
  ok(res, classes)
})

// POST /api/courses — 创建课程
router.post('/', requirePermission('points.read'), validate(createSchema), (req: Request, res: Response) => {
  const db = getDb()
  const { name, description, class: courseClass } = req.body
  const { id: userId, permissions, class: userClass } = req.user!

  // 检查班级权限
  if (!permissions.includes('classes.view_all')) {
    const allowed = userClass.split(',').filter(Boolean).map(c => c.trim())
    if (!allowed.includes(courseClass)) return fail(res, 403, 'FORBIDDEN', '无权在该班级创建课程')
  }

  const result = db.prepare(
    'INSERT INTO courses (name, description, class, created_by) VALUES (?, ?, ?, ?)'
  ).run(name, description, courseClass, userId)

  const course = db.prepare('SELECT c.*, u.display_name as creator_name FROM courses c JOIN users u ON c.created_by = u.id WHERE c.id = ?').get(result.lastInsertRowid)
  ok(res, course)
})

// PUT /api/courses/:id — 更新课程
router.put('/:id', requirePermission('points.read'), validate(updateSchema), (req: Request, res: Response) => {
  const db = getDb()
  const id = Number(req.params.id)
  if (isNaN(id)) return fail(res, 400, 'VALIDATION', '无效 ID')

  const existing = db.prepare('SELECT * FROM courses WHERE id = ?').get(id) as any
  if (!existing) throw new NotFoundError('课程不存在')

  const fields: string[] = []
  const values: any[] = []

  if (req.body.name) { fields.push('name = ?'); values.push(req.body.name) }
  if (req.body.description !== undefined) { fields.push('description = ?'); values.push(req.body.description) }
  if (req.body.class) { fields.push('class = ?'); values.push(req.body.class) }

  fields.push("updated_at = CURRENT_TIMESTAMP")
  values.push(id)

  db.prepare(`UPDATE courses SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  const updated = db.prepare('SELECT c.*, u.display_name as creator_name FROM courses c JOIN users u ON c.created_by = u.id WHERE c.id = ?').get(id)
  ok(res, updated)
})

// POST /api/courses/:id/cover — 上传封面图
router.post('/:id/cover', (req: Request, res: Response) => {
  const db = getDb()
  const id = Number(req.params.id)
  if (isNaN(id)) return fail(res, 400, 'VALIDATION', '无效 ID')

  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(id) as any
  if (!course) throw new NotFoundError('课程不存在')

  coverUploader.single('file')(req, res, (err: any) => {
    if (err) {
      if (err.message === '仅支持图片格式') return fail(res, 400, 'INVALID_TYPE', err.message)
      if (err instanceof multer.MulterError) return fail(res, 400, 'UPLOAD_ERROR', err.message)
      return fail(res, 400, 'UPLOAD_ERROR', err.message || '上传失败')
    }
    if (!req.file) return fail(res, 400, 'NO_FILE', '请选择文件')

    const coverUrl = `/uploads/course_covers/${req.file.filename}`

    // 删除旧封面
    if (course.cover_url) {
      const oldPath = join(__dirname, '..', '..', course.cover_url)
      try { if (existsSync(oldPath)) unlinkSync(oldPath) } catch {}
    }

    db.prepare("UPDATE courses SET cover_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(coverUrl, id)
    ok(res, { cover_url: coverUrl })
  })
})

// DELETE /api/courses/:id — 删除课程
router.delete('/:id', requirePermission('points.read'), (req: Request, res: Response) => {
  const db = getDb()
  const id = Number(req.params.id)
  if (isNaN(id)) return fail(res, 400, 'VALIDATION', '无效 ID')

  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(id) as any
  if (!course) throw new NotFoundError('课程不存在')

  // 删除封面文件
  if (course.cover_url) {
    const filePath = join(__dirname, '..', '..', course.cover_url)
    try { if (existsSync(filePath)) unlinkSync(filePath) } catch {}
  }

  db.prepare('DELETE FROM courses WHERE id = ?').run(id)
  ok(res, { success: true })
})

export default router
