import { Router, Request, Response } from 'express'
import { existsSync, mkdirSync, unlinkSync, rmdirSync, readdirSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/init.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'
import { ok, fail } from '../lib/response.js'
import { NotFoundError } from '../lib/errors.js'
import { writeAuditLog } from './audit.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const UPLOAD_ROOT = join(__dirname, '..', '..', 'uploads')

// Ensure upload root exists
if (!existsSync(UPLOAD_ROOT)) mkdirSync(UPLOAD_ROOT, { recursive: true })

const router = Router()
router.use(authMiddleware)

// ── Multer config ──────────────────────────────────────────────────────────

function getMulter(userId: number): multer.Multer {
  const db = getDb()
  const settings = db.prepare('SELECT max_file_size FROM chat_settings WHERE user_id = ?').get(userId) as any
  const maxSize = settings?.max_file_size || 10485760

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      const convId = (_req.body as any).conversation_id
      const dir = join(UPLOAD_ROOT, `conv_${convId}`)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      cb(null, dir)
    },
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname)
      const name = `${uuidv4()}${ext}`
      cb(null, name)
    },
  })

  return multer({
    storage,
    limits: { fileSize: maxSize },
  })
}

// Validation helper
function validateFile(file: Express.Multer.File, allowedTypes: string): string | null {
  const ext = extname(file.originalname).toLowerCase()
  const allowed = allowedTypes.split(',').map(t => t.trim().toLowerCase())
  if (!allowed.includes(ext)) {
    return `不支持的文件类型「${ext}」，允许的类型：${allowed.join(', ')}`
  }
  return null
}

// ── Routes ─────────────────────────────────────────────────────────────────

// POST /api/chat/upload — 上传文件
router.post(
  '/upload',
  requirePermission('chat.access'),
  (req: Request, res: Response) => {
    const db = getDb()
    const userId = req.user!.id
    const convId = Number(req.body.conversation_id)
    if (!convId || isNaN(convId)) return fail(res, 400, 'VALIDATION_ERROR', '需要 conversation_id')

    // Verify conversation belongs to user
    const conv = db.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?').get(convId, userId)
    if (!conv) return fail(res, 404, 'NOT_FOUND', '对话不存在')

    // Get settings
    const settings = db.prepare('SELECT allowed_file_types, max_files_per_conversation FROM chat_settings WHERE user_id = ?').get(userId) as any
    const allowedTypes = settings?.allowed_file_types || '.doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.txt,.csv,.md'
    const maxFiles = settings?.max_files_per_conversation || 10

    // Check file count
    const count = db.prepare('SELECT COUNT(*) as c FROM uploaded_files WHERE conversation_id = ? AND user_id = ?').get(convId, userId) as any
    if (count.c >= maxFiles) {
      return fail(res, 400, 'FILE_LIMIT', `每对话最多上传 ${maxFiles} 个文件`)
    }

    const upload = getMulter(userId)
    upload.single('file')(req, res, (err: any) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') return fail(res, 400, 'FILE_TOO_LARGE', '文件大小超出限制')
          return fail(res, 400, 'UPLOAD_ERROR', err.message)
        }
        return fail(res, 400, 'UPLOAD_ERROR', err.message || '上传失败')
      }

      if (!req.file) return fail(res, 400, 'NO_FILE', '请选择文件')

      // Validate file type
      const validationError = validateFile(req.file, allowedTypes)
      if (validationError) {
        // Clean up uploaded file
        try { unlinkSync(req.file.path) } catch {}
        return fail(res, 400, 'INVALID_FILE_TYPE', validationError)
      }

      const storedPath = `conv_${convId}/${req.file.filename}`
      const result = db.prepare(`
        INSERT INTO uploaded_files (user_id, conversation_id, original_name, stored_path, mime_type, file_size)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, convId, req.file.originalname, storedPath, req.file.mimetype, req.file.size)

      writeAuditLog(userId, req.user!.display_name, 'upload_file', 'file', result.lastInsertRowid as number, {
        name: req.file.originalname,
        size: req.file.size,
        conversation_id: convId,
      })

      ok(res, {
        id: result.lastInsertRowid,
        url: `/uploads/${storedPath}`,
        name: req.file.originalname,
        size: req.file.size,
        mime_type: req.file.mimetype,
      })
    })
  },
)

// DELETE /api/chat/upload/:fileId — 删除已上传的文件
router.delete(
  '/upload/:fileId',
  requirePermission('chat.access'),
  (req: Request, res: Response) => {
    const db = getDb()
    const userId = req.user!.id
    const fileId = Number(req.params.fileId)
    if (isNaN(fileId)) return fail(res, 400, 'VALIDATION_ERROR', '无效的文件 ID')

    const file = db.prepare('SELECT * FROM uploaded_files WHERE id = ? AND user_id = ?').get(fileId, userId) as any
    if (!file) throw new NotFoundError('文件不存在')

    // Delete physical file
    const filePath = join(UPLOAD_ROOT, file.stored_path)
    try {
      if (existsSync(filePath)) unlinkSync(filePath)
      // Try to remove directory if empty
      const dir = join(UPLOAD_ROOT, `conv_${file.conversation_id}`)
      if (existsSync(dir)) {
        const remaining = readdirSync(dir)
        if (remaining.length === 0) rmdirSync(dir)
      }
    } catch {}

    db.prepare('DELETE FROM uploaded_files WHERE id = ?').run(fileId)
    writeAuditLog(userId, req.user!.display_name, 'delete_file', 'file', fileId, { name: file.original_name })
    ok(res, { success: true })
  },
)

export default router
