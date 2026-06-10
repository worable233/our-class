import { Router, Request, Response } from 'express'
import { existsSync, mkdirSync, readdirSync, statSync, renameSync, unlinkSync, rmdirSync, createReadStream } from 'fs'
import { join, extname, basename, dirname, relative } from 'path'
import { fileURLToPath } from 'url'
import { dirname as pathDirname } from 'path'
import multer from 'multer'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/init.js'
import { authMiddleware } from '../middleware/auth.js'
import { config } from '../config/index.js'
import { ok, fail } from '../lib/response.js'
import { ValidationError, NotFoundError } from '../lib/errors.js'

const __dirname = pathDirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = join(__dirname, '..', '..', 'storage')
if (!existsSync(STORAGE_ROOT)) mkdirSync(STORAGE_ROOT, { recursive: true })

const router = Router()
router.use(authMiddleware)

// ── Helpers ──────────────────────────────────────────────────────────

/** 获取用户存储根目录，不存在则创建 */
function getUserDir(userId: number): string {
  const dir = join(STORAGE_ROOT, `user_${userId}`)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** 安全解析路径：防止 ../ 越权 */
function resolveSafePath(userId: number, relPath: string): string {
  const root = getUserDir(userId)
  // 去掉前导斜杠，防止 absolute path
  const safe = relPath.replace(/^\/+/, '').replace(/\\/g, '/')
  // 解析并验证仍在 root 内（用分隔符防止 user_1 访问 user_1_secret）
  const full = join(root, safe)
  const rootWithSep = root + '/'
  if (full !== root && !full.startsWith(rootWithSep)) throw new ValidationError('路径不合法')
  return full
}

/** 获取文件图标类型 */
function fileIcon(ext: string): string {
  const map: Record<string, string> = {
    '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image', '.webp': 'image', '.svg': 'image', '.bmp': 'image',
    '.mp4': 'video', '.avi': 'video', '.mkv': 'video', '.mov': 'video', '.wmv': 'video',
    '.mp3': 'audio', '.wav': 'audio', '.flac': 'audio', '.aac': 'audio',
    '.pdf': 'pdf',
    '.doc': 'doc', '.docx': 'doc',
    '.xls': 'excel', '.xlsx': 'excel',
    '.ppt': 'ppt', '.pptx': 'ppt',
    '.zip': 'archive', '.rar': 'archive', '.7z': 'archive', '.tar': 'archive', '.gz': 'archive',
    '.txt': 'text', '.md': 'text', '.csv': 'text', '.json': 'text', '.xml': 'text', '.yaml': 'text', '.yml': 'text',
    '.js': 'code', '.ts': 'code', '.py': 'code', '.java': 'code', '.c': 'code', '.cpp': 'code', '.go': 'code', '.rs': 'code',
    '.html': 'code', '.css': 'code', '.vue': 'code',
  }
  return map[ext.toLowerCase()] || 'file'
}

/** 格式化文件大小 */
function fmtSize(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB'
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return bytes + ' B'
}

/** 计算目录大小（迭代，防栈溢出） */
function dirSize(dirPath: string): number {
  let total = 0
  const stack = [dirPath]
  while (stack.length > 0) {
    const current = stack.pop()!
    try {
      for (const name of readdirSync(current)) {
        const fp = join(current, name)
        const st = statSync(fp)
        if (st.isDirectory()) stack.push(fp)
        else total += st.size
      }
    } catch {}
  }
  return total
}

/** 更新用户的已用存储量 */
function updateStorageUsed(userId: number): void {
  const db = getDb()
  const used = dirSize(getUserDir(userId))
  db.prepare('UPDATE user_storage SET storage_used = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(used, userId)
}

/** 检查用户配额 */
function checkQuota(userId: number, neededBytes: number): void {
  const db = getDb()
  const row = db.prepare('SELECT storage_limit, storage_used FROM user_storage WHERE user_id = ?').get(userId) as any
  if (!row) throw new NotFoundError('存储记录不存在')
  if (row.storage_used + neededBytes > row.storage_limit) {
    const free = row.storage_limit - row.storage_used
    throw new ValidationError(`存储空间不足，剩余 ${fmtSize(Math.max(0, free))}，需要 ${fmtSize(neededBytes)}`)
  }
}

// ── Multer config ────────────────────────────────────────────────────
const uploadMulter = multer({
  storage: multer.diskStorage({
    destination: STORAGE_ROOT, // temp, will be moved
    filename: (_req, file, cb) => cb(null, `_tmp_${uuidv4()}_${file.originalname}`),
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max per file
})

// ── Routes ───────────────────────────────────────────────────────────

// GET /api/storage/info — 存储概览
router.get('/info', (req: Request, res: Response) => {
  const db = getDb()
  const { id: userId } = req.user!
  const row = db.prepare('SELECT storage_limit, storage_used FROM user_storage WHERE user_id = ?').get(userId) as any
  if (!row) {
    // 兜底创建
    db.prepare('INSERT OR IGNORE INTO user_storage (user_id) VALUES (?)').run(userId)
    return ok(res, { storage_limit: 104857600, storage_used: 0, used_percent: 0, used_display: '0 B', limit_display: '100 MB' })
  }
  updateStorageUsed(userId) // 刷新用量
  const updated = db.prepare('SELECT storage_limit, storage_used FROM user_storage WHERE user_id = ?').get(userId) as any
  ok(res, {
    storage_limit: updated.storage_limit,
    storage_used: updated.storage_used,
    used_percent: Math.min(100, Math.round((updated.storage_used / Math.max(updated.storage_limit, 1)) * 100 * 10) / 10),
    used_display: fmtSize(updated.storage_used),
    limit_display: fmtSize(updated.storage_limit),
  })
})

// GET /api/storage/list?path=xxx — 列出目录内容
router.get('/list', (req: Request, res: Response) => {
  const { id: userId } = req.user!
  const relPath = (req.query.path as string) || ''
  const dirPath = resolveSafePath(userId, relPath)
  if (!existsSync(dirPath)) throw new NotFoundError('目录不存在')
  if (!statSync(dirPath).isDirectory()) throw new ValidationError('路径不是目录')

  const entries = readdirSync(dirPath).map(name => {
    const fp = join(dirPath, name)
    const st = statSync(fp)
    const isDir = st.isDirectory()
    return {
      name,
      path: relPath ? `${relPath}/${name}` : name,
      is_dir: isDir,
      size: isDir ? 0 : st.size,
      size_display: isDir ? '-' : fmtSize(st.size),
      modified: st.mtime.toISOString(),
      icon: isDir ? 'folder' : fileIcon(extname(name)),
    }
  }).sort((a, b) => {
    // 文件夹在前，按名称排序
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-CN')
  })

  // 父路径
  const parent = relPath ? dirname(relPath).replace(/\\/g, '/') : null

  ok(res, { path: relPath || '/', parent, entries })
})

// POST /api/storage/mkdir — 创建文件夹
router.post('/mkdir', (req: Request, res: Response) => {
  const { id: userId } = req.user!
  const { path } = req.body
  if (!path || typeof path !== 'string') throw new ValidationError('请输入路径')
  const dirPath = resolveSafePath(userId, path)
  if (existsSync(dirPath)) throw new ValidationError('文件或文件夹已存在')
  mkdirSync(dirPath, { recursive: true })
  updateStorageUsed(userId)
  ok(res, { success: true, path })
})

// POST /api/storage/upload — 上传文件
router.post('/upload', (req: Request, res: Response) => {
  const { id: userId } = req.user!
  uploadMulter.single('file')(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') return fail(res, 400, 'FILE_TOO_LARGE', '文件大小超出限制（最大 500MB）')
        return fail(res, 400, 'UPLOAD_ERROR', err.message)
      }
      return fail(res, 400, 'UPLOAD_ERROR', err.message || '上传失败')
    }
    if (!req.file) return fail(res, 400, 'NO_FILE', '请选择文件')

    const targetPath = (req.body.path as string) || ''
    const targetDir = resolveSafePath(userId, targetPath)
    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })

    // 检查配额
    try {
      checkQuota(userId, req.file.size)
    } catch (e: any) {
      try { unlinkSync(req.file.path) } catch {}
      return fail(res, 400, 'QUOTA_EXCEEDED', e.message)
    }

    // 处理文件名冲突（basename 去除路径穿越）
    let fileName = basename(req.file.originalname)
    const destPath = join(targetDir, fileName)
    if (existsSync(destPath)) {
      const ext = extname(fileName)
      const base = basename(fileName, ext)
      fileName = `${base}_${Date.now()}${ext}`
    }

    // 从临时路径移动到目标
    const finalPath = join(targetDir, fileName)
    try { unlinkSync(finalPath) } catch {}
    renameSync(req.file.path, finalPath)

    updateStorageUsed(userId)

    const st = statSync(finalPath)
    ok(res, {
      name: fileName,
      path: targetPath ? `${targetPath}/${fileName}` : fileName,
      size: st.size,
      size_display: fmtSize(st.size),
      icon: fileIcon(extname(fileName)),
    })
  })
})

// GET /api/storage/download?path=xxx&token=xxx — 下载文件
router.get('/download', (req: Request, res: Response) => {
  // 支持 ?token= 参数（用于 <a> 标签直接下载）
  const tokenFromQuery = req.query.token as string | undefined
  if (tokenFromQuery) {
    try {
      const payload = jwt.verify(tokenFromQuery, config.jwtSecret) as any
      ;(req as any).user = { id: payload.id }
    } catch { return fail(res, 401, 'UNAUTHORIZED', '登录已过期') }
  }
  if (!req.user) return fail(res, 401, 'UNAUTHORIZED', '未登录')
  const { id: userId } = req.user!
  const relPath = req.query.path as string
  if (!relPath) throw new ValidationError('请指定文件路径')
  const filePath = resolveSafePath(userId, relPath)
  if (!existsSync(filePath)) throw new NotFoundError('文件不存在')
  if (statSync(filePath).isDirectory()) throw new ValidationError('不能下载文件夹（请打包后下载）')

  const fileName = basename(filePath)
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  res.setHeader('Content-Type', 'application/octet-stream')
  const stream = createReadStream(filePath)
  stream.pipe(res)
})

// DELETE /api/storage/delete — 删除文件或文件夹
router.delete('/delete', (req: Request, res: Response) => {
  const { id: userId } = req.user!
  const relPath = req.query.path as string
  if (!relPath) throw new ValidationError('请指定路径')
  const filePath = resolveSafePath(userId, relPath)
  const root = getUserDir(userId)
  if (filePath === root) throw new ValidationError('不能删除根目录')
  if (!existsSync(filePath)) throw new NotFoundError('文件或文件夹不存在')

  const st = statSync(filePath)
  if (st.isDirectory()) {
    rmdirSync(filePath, { recursive: true })
  } else {
    unlinkSync(filePath)
  }
  updateStorageUsed(userId)
  ok(res, { success: true })
})

// PUT /api/storage/rename — 重命名
router.put('/rename', (req: Request, res: Response) => {
  const { id: userId } = req.user!
  const { path, new_name } = req.body
  if (!path || !new_name) throw new ValidationError('请指定路径和新名称')
  const oldPath = resolveSafePath(userId, path)
  const root = getUserDir(userId)
  if (oldPath === root) throw new ValidationError('不能重命名根目录')
  if (!existsSync(oldPath)) throw new NotFoundError('文件或文件夹不存在')
  const parent = dirname(oldPath)
  const newPath = join(parent, new_name)
  if (existsSync(newPath)) throw new ValidationError('目标名称已存在')
  try { renameSync(oldPath, newPath) } catch {
    throw new ValidationError('重命名失败，文件可能被占用')
  }
  ok(res, { success: true, name: new_name })
})

// ── 管理端 API ──────────────────────────────────────────────────────

// GET /api/storage/groups — 获取所有父权限组的配额设置
router.get('/groups', (req: Request, res: Response) => {
  const db = getDb()
  const groups = db.prepare(`
    SELECT pg.id, pg.name, pg.group_type,
           COALESCE(gsq.storage_limit, 104857600) as storage_limit,
           (SELECT COUNT(*) FROM users u WHERE u.group_id = pg.id) as user_count
    FROM permission_groups pg
    LEFT JOIN group_storage_quota gsq ON pg.id = gsq.group_id
    WHERE pg.parent_id IS NULL
    ORDER BY pg.id
  `).all()
  ok(res, groups)
})

// PUT /api/storage/groups/:id — 设置权限组配额
router.put('/groups/:id', (req: Request, res: Response) => {
  const db = getDb()
  const id = Number(req.params.id)
  const { storage_limit } = req.body
  if (!storage_limit || storage_limit < 1) throw new ValidationError('请输入有效的配额大小')
  // 检查是否为父权限组
  const group = db.prepare('SELECT id FROM permission_groups WHERE id = ? AND parent_id IS NULL').get(id) as any
  if (!group) throw new NotFoundError('权限组不存在或不是父权限组')

  db.prepare(`
    INSERT INTO group_storage_quota (group_id, storage_limit) VALUES (?, ?)
    ON CONFLICT(group_id) DO UPDATE SET storage_limit = ?, updated_at = CURRENT_TIMESTAMP
  `).run(id, storage_limit, storage_limit)

  // 同步该组下所有用户的默认配额
  db.prepare(`
    UPDATE user_storage SET storage_limit = ?
    WHERE user_id IN (SELECT id FROM users WHERE group_id = ?) AND storage_limit < ?
  `).run(storage_limit, id, storage_limit)

  ok(res, { success: true })
})

export default router
