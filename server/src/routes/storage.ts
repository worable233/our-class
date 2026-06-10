import { Router, Request, Response } from 'express'
import { existsSync, mkdirSync, readdirSync, statSync, renameSync, unlinkSync, rmdirSync, createReadStream, readFileSync, writeFileSync, appendFileSync, rmSync, realpathSync, openSync, fstatSync, closeSync } from 'fs'
import { join, extname, basename, dirname, relative } from 'path'
import { fileURLToPath } from 'url'
import { dirname as pathDirname } from 'path'
import multer from 'multer'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/init.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'
import { config } from '../config/index.js'
import { ok, fail } from '../lib/response.js'
import { ValidationError, NotFoundError } from '../lib/errors.js'

/** 允许上传的文件扩展名白名单 */
const ALLOWED_EXTENSIONS = new Set([
  // 文档
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.pdf', '.txt', '.csv', '.md',
  // 图片
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp',
  // 音频
  '.mp3', '.wav', '.flac', '.aac',
  // 视频
  '.mp4', '.avi', '.mkv', '.mov', '.wmv',
  // 压缩包
  '.zip', '.rar', '.7z', '.tar', '.gz',
])

const __dirname = pathDirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = join(__dirname, '..', '..', 'storage')
if (!existsSync(STORAGE_ROOT)) mkdirSync(STORAGE_ROOT, { recursive: true })

/** 清理 STORAGE_ROOT 下残留的 _tmp_ 和 _assemble_ 临时文件 */
function cleanTempFiles(): void {
  try {
    for (const name of readdirSync(STORAGE_ROOT)) {
      if (name.startsWith('_tmp_') || name.startsWith('_assemble_')) {
        try { unlinkSync(join(STORAGE_ROOT, name)) } catch {}
      }
    }
  } catch {}
}
cleanTempFiles()
setInterval(cleanTempFiles, 3600000)

const router = Router()
router.use(authMiddleware)

/** Windows 非法文件名字符（含设备名，无 g 标志防 stateful regex bug） */
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/
const WINDOWS_DEVICES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

function validateFileName(name: string): void {
  if (!name || name.trim() === '') throw new ValidationError('文件名不能为空')
  if (name.length > 255) throw new ValidationError('文件名过长（最多 255 字符）')
  if (INVALID_FILENAME_CHARS.test(name)) throw new ValidationError('文件名包含非法字符：\\ / : * ? " < > |')
  if (WINDOWS_DEVICES.test(name)) throw new ValidationError('文件名不能使用系统保留名称')
  if (name === '.' || name === '..') throw new ValidationError('文件名不能为 . 或 ..')
}

// ── Helpers ──────────────────────────────────────────────────────────

/** 获取用户存储根目录，不存在则创建 */
function getUserDir(userId: number): string {
  const dir = join(STORAGE_ROOT, `user_${userId}`)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** 安全解析路径：防止 ../ 越权，并解析符号链接防 TOCTOU */
function resolveSafePath(userId: number, relPath: string): string {
  const root = getUserDir(userId).replace(/\\/g, '/')
  // 去掉前导斜杠，防止 absolute path
  const safe = relPath.replace(/^\/+/, '').replace(/\\/g, '/')
  // 解析并验证仍在 root 内（用分隔符防止 user_1 访问 user_1_secret）
  const full = join(root, safe).replace(/\\/g, '/')
  const rootWithSep = root + '/'
  if (full !== root && !full.startsWith(rootWithSep)) throw new ValidationError('路径不合法')
  // 符号链接防护：如果目标存在且是符号链接，解析真实路径后重新验证
  if (existsSync(full)) {
    try {
      const real = realpathSync(full).replace(/\\/g, '/')
      if (real !== full && !real.startsWith(rootWithSep)) {
        throw new ValidationError('路径不合法（符号链接越权）')
      }
    } catch (e: any) {
      if (e instanceof ValidationError) throw e
      // 如果无法解析（如文件已被删除），使用原路径
    }
  }
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

/** 增量更新存储用量：加减指定字节数（避免全量遍历） */
function addStorageUsed(userId: number, delta: number): void {
  const db = getDb()
  db.prepare('UPDATE user_storage SET storage_used = MAX(0, storage_used + ?), updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(delta, userId)
}

/** 更新用户的已用存储量（全量，仅用于 info 接口） */
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

// ── Chunked upload ───────────────────────────────────────────────────
const CHUNK_DIR = join(STORAGE_ROOT, '_chunks')
if (!existsSync(CHUNK_DIR)) mkdirSync(CHUNK_DIR, { recursive: true })

/** 清理超过 24 小时未完成的废分片 */
function cleanStaleChunks(): void {
  try {
    const now = Date.now()
    for (const name of readdirSync(CHUNK_DIR)) {
      const dir = join(CHUNK_DIR, name)
      try {
        const st = statSync(dir)
        if (st.isDirectory() && now - st.mtimeMs > 172800000) rmSync(dir, { recursive: true, force: true }) // 48h
      } catch {}
    }
  } catch {}
}
cleanStaleChunks()
setInterval(cleanStaleChunks, 3600000) // 每小时检查一次

/** 获取分片上传状态（已接收的分片索引） */
router.get('/upload/chunk/:identifier', requirePermission('chat.access'), (req: Request, res: Response) => {
  const { id: userId } = req.user!
  const identifier = String(req.params.identifier)
  if (!identifier) throw new ValidationError('缺少 identifier')
  // identifier 格式: userId_timestamp_random，验证归属
  if (!identifier.startsWith(`${userId}_`)) throw new ValidationError('无权访问')
  const chunkDir = join(CHUNK_DIR, identifier)
  if (!existsSync(chunkDir)) return ok(res, { received: [], total_chunks: 0 })
  const files = readdirSync(chunkDir).filter(f => /^\d+$/.test(f)).map(Number).sort((a, b) => a - b)
  const metaPath = join(chunkDir, '_meta.json')
  let totalChunks = 0
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
    totalChunks = meta.total_chunks || 0
  } catch {}
  ok(res, { received: files, total_chunks: totalChunks })
})

/** 上传一个分片 */
const chunkUploader = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, CHUNK_DIR),
    filename: (_req, file, cb) => cb(null, `_chunk_${uuidv4()}_${file.originalname}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per chunk
})

router.post('/upload/chunk', requirePermission('chat.access'), (req: Request, res: Response) => {
  const { id: userId } = req.user!
  chunkUploader.single('file')(req, res, (err: any) => {
    if (err) return fail(res, 400, 'CHUNK_ERROR', err.message || '分片上传失败')
    if (!req.file) return fail(res, 400, 'NO_FILE', '请选择文件')

    const { identifier, chunk_index, total_chunks, path: targetPath, original_name } = req.body
    if (!identifier || chunk_index === undefined || !total_chunks) {
      try { unlinkSync(req.file.path) } catch {}
      return fail(res, 400, 'VALIDATION', '缺少分片参数')
    }
    const ci = Number(chunk_index)
    const tc = Number(total_chunks)
    if (!Number.isInteger(ci) || ci < 0 || ci >= tc || !Number.isInteger(tc) || tc < 1 || tc > 10000) {
      try { unlinkSync(req.file.path) } catch {}
      return fail(res, 400, 'VALIDATION', '分片参数不合法')
    }

    const chunkDir = join(CHUNK_DIR, identifier)
    if (!existsSync(chunkDir)) mkdirSync(chunkDir, { recursive: true })

    // 原子性检查：用 _lock 文件防止并发组装
    const lockPath = join(chunkDir, '_lock')
    if (existsSync(lockPath)) return ok(res, { done: false, received: [], total: tc, locked: true })

    // 保存分片
    const chunkFile = join(chunkDir, String(ci))
    try { unlinkSync(chunkFile) } catch {}
    renameSync(req.file.path, chunkFile)

    // 写入元数据（仅第一片时写入）
    const safeOriginalName = basename(original_name || 'untitled')
    const metaPath = join(chunkDir, '_meta.json')
    if (!existsSync(metaPath)) {
      writeFileSync(metaPath, JSON.stringify({
        identifier,
        total_chunks: tc,
        original_name: safeOriginalName,
        target_path: targetPath || '',
        user_id: userId,
        created_at: new Date().toISOString(),
      }))
    }

    // 检查是否所有分片已到齐
    const existing = readdirSync(chunkDir).filter(f => /^\d+$/.test(f)).map(Number).sort((a, b) => a - b)
    if (existing.length < tc) {
      return ok(res, { done: false, received: existing.length, total: tc })
    }

    // 所有分片到齐，加锁后组装（防并发）
    try { writeFileSync(lockPath, String(Date.now())) } catch {
      return ok(res, { done: false, received: existing.length, total: tc })
    }
    // 二次确认：可能另一个请求已开始组装
    if (!existsSync(chunkDir)) return ok(res, { done: true })

    // 组装文件
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
    const targetDir = resolveSafePath(userId, meta.target_path || '')
    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })

    // 处理文件名冲突
    let finalName = basename(meta.original_name || 'untitled')
    const destPath = join(targetDir, finalName)
    if (existsSync(destPath)) {
      const ext = extname(finalName)
      const base = basename(finalName, ext)
      finalName = `${base}_${Date.now()}${ext}`
    }

    // 合并分片
    const assembledPath = join(STORAGE_ROOT, `_assemble_${uuidv4()}`)
    try {
      for (const idx of existing) {
        const chunkData = readFileSync(join(chunkDir, String(idx)))
        appendFileSync(assembledPath, chunkData)
      }
      // 检查配额
      const st = statSync(assembledPath)
      checkQuota(userId, st.size)
      // 移动到最终位置
      const finalPath = join(targetDir, finalName)
      renameSync(assembledPath, finalPath)
      // 清理分片目录
      rmSync(chunkDir, { recursive: true, force: true })
      addStorageUsed(userId, st.size)
      return ok(res, {
        done: true,
        name: finalName,
        path: meta.target_path ? `${meta.target_path}/${finalName}` : finalName,
        size: st.size,
        size_display: fmtSize(st.size),
      })
    } catch (e: any) {
      try { unlinkSync(assembledPath) } catch {}
      throw e
    }
  })
})

// ── Multer config ────────────────────────────────────────────────────
const uploadMulter = multer({
  storage: multer.diskStorage({
    destination: STORAGE_ROOT, // temp, will be moved
    filename: (_req, file, cb) => cb(null, `_tmp_${uuidv4()}_${file.originalname}`),
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max per file
})

// ── 网速限流（令牌桶算法，每用户独立限速）───────────────────────
const BANDWIDTH_LIMIT = 100 * 1024 // 100 KB/s 每人
const BANDWIDTH_BURST = 1024 * 1024 // 最多突发 1 MB

const userBuckets = new Map<number, { tokens: number; lastRefill: number }>()
/** 定时清理过期桶（5 分钟无操作） */
setInterval(() => {
  const now = Date.now()
  for (const [uid, bucket] of userBuckets) {
    if (now - bucket.lastRefill > 300_000) userBuckets.delete(uid)
  }
}, 60_000)

function getBucket(userId: number) {
  let b = userBuckets.get(userId)
  const now = Date.now()
  if (!b) {
    b = { tokens: BANDWIDTH_BURST, lastRefill: now }
    userBuckets.set(userId, b)
  }
  // 用时间差补充令牌
  const elapsedSec = (now - b.lastRefill) / 1000
  b.tokens = Math.min(BANDWIDTH_BURST, b.tokens + elapsedSec * BANDWIDTH_LIMIT)
  b.lastRefill = now
  return b
}

async function throttleBandwidth(userId: number, bytes: number): Promise<void> {
  const b = getBucket(userId)
  if (b.tokens >= bytes) {
    b.tokens -= bytes
    return
  }
  // 令牌不够 → 等待补充
  const deficit = bytes - b.tokens
  const waitMs = Math.ceil((deficit / BANDWIDTH_LIMIT) * 1000)
  b.tokens = 0
  b.lastRefill += waitMs // 预支时间，防止短时间内多重扣减
  await new Promise(resolve => setTimeout(resolve, waitMs))
}

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
  // 验证路径中每段文件名
  for (const seg of path.split('/')) validateFileName(seg)
  const dirPath = resolveSafePath(userId, path)
  if (existsSync(dirPath)) throw new ValidationError('文件或文件夹已存在')
  mkdirSync(dirPath, { recursive: true })
  // mkdir 不改变存储用量
  ok(res, { success: true, path })
})

// POST /api/storage/upload — 上传文件（带宽限速 100KB/s 每用户）
router.post('/upload', (req: Request, res: Response) => {
  const { id: userId } = req.user!
  uploadMulter.single('file')(req, res, async (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') return fail(res, 400, 'FILE_TOO_LARGE', '文件大小超出限制（最大 500MB）')
        return fail(res, 400, 'UPLOAD_ERROR', err.message)
      }
      return fail(res, 400, 'UPLOAD_ERROR', err.message || '上传失败')
    }
    if (!req.file) return fail(res, 400, 'NO_FILE', '请选择文件')

    // 验证文件名
    const rawName = basename(req.file.originalname)
    try { validateFileName(rawName) } catch (e: any) {
      try { unlinkSync(req.file.path) } catch {}
      return fail(res, 400, 'INVALID_NAME', e.message)
    }

    // 白名单校验：只允许上传指定文件类型
    const fileExt = extname(rawName).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(fileExt)) {
      try { unlinkSync(req.file.path) } catch {}
      return fail(res, 400, 'FILE_TYPE_BLOCKED', `不支持上传「${fileExt}」文件类型，允许的类型：文档/图片/音视频/压缩包`)
    }

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

    // 带宽限速：消耗令牌（根据文件大小决定等待时间）
    await throttleBandwidth(userId, req.file.size)

    // 处理文件名冲突（basename 去除路径穿越）
    let fileName = rawName
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

    const st = statSync(finalPath)
    addStorageUsed(userId, st.size)
    ok(res, {
      name: fileName,
      path: targetPath ? `${targetPath}/${fileName}` : fileName,
      size: st.size,
      size_display: fmtSize(st.size),
      icon: fileIcon(extname(fileName)),
    })
  })
})

// GET /api/storage/download?path=xxx — 下载文件
// 仅通过 Authorization header 验证（不接收 ?token= 查询参数，防止 Token 泄露到日志）
// 强制 Content-Disposition: attachment，防止浏览器直接渲染 HTML/SVG 等
router.get('/download', (req: Request, res: Response) => {
  if (!req.user) return fail(res, 401, 'UNAUTHORIZED', '未登录')
  const { id: userId } = req.user!
  const relPath = req.query.path as string
  if (!relPath) throw new ValidationError('请指定文件路径')
  const filePath = resolveSafePath(userId, relPath)
  if (!existsSync(filePath)) throw new NotFoundError('文件不存在')
  if (statSync(filePath).isDirectory()) throw new ValidationError('不能下载文件夹（请打包后下载）')

  // TOCTOU 防护：通过 fd 验证打开的文件仍是原文件
  const fd = openSync(filePath, 'r')
  try {
    const st = fstatSync(fd)
    if (!st.isFile()) throw new ValidationError('不是有效文件')
    // 再次验证真实路径（防止 stat 后文件被替换为符号链接）
    try {
      const real = realpathSync(filePath).replace(/\\/g, '/')
      const root = getUserDir(userId).replace(/\\/g, '/') + '/'
      if (!real.startsWith(root)) throw new ValidationError('路径不合法')
    } catch (e: any) {
      if (e instanceof ValidationError) throw e
    }
  } catch (e: any) {
    closeSync(fd)
    if (e instanceof ValidationError) throw e
    throw new NotFoundError('文件不存在')
  }

  const fileName = basename(filePath)
  // 强制 attachment 下载，禁止浏览器渲染（存储型 XSS 防护）
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}; filename="${encodeURIComponent(fileName)}"`)
  res.setHeader('Content-Type', 'application/octet-stream')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  const stream = createReadStream(filePath)
  stream.pipe(res)
  // 确保不再有 fd 泄露
  stream.on('close', () => { try { closeSync(fd) } catch {} })
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
  let size = 0
  if (st.isDirectory()) {
    size = dirSize(filePath)
    rmSync(filePath, { recursive: true, force: true })
  } else {
    size = st.size
    unlinkSync(filePath)
  }
  addStorageUsed(userId, -size)
  ok(res, { success: true })
})

// POST /api/storage/batch-delete — 批量删除
router.post('/batch-delete', (req: Request, res: Response) => {
  const { id: userId } = req.user!
  const { paths } = req.body
  if (!Array.isArray(paths) || paths.length === 0) throw new ValidationError('请指定路径列表')
  const root = getUserDir(userId)

  // 预验证：所有路径先校验合法性
  const resolved: string[] = []
  const errors: string[] = []
  for (const p of paths) {
    try {
      const fp = resolveSafePath(userId, p)
      if (fp === root) { errors.push(`「${p}」: 不能删除根目录`); continue }
      if (!existsSync(fp)) { errors.push(`「${p}」: 不存在`); continue }
      resolved.push(fp)
    } catch {
      errors.push(`「${p}」: 路径不合法`)
    }
  }

  let deleted = 0
  let freedBytes = 0
  for (const fp of resolved) {
    try {
      const st = statSync(fp)
      if (st.isDirectory()) {
        freedBytes += dirSize(fp)
        rmSync(fp, { recursive: true, force: true })
      } else {
        freedBytes += st.size
        unlinkSync(fp)
      }
      deleted++
    } catch {
      errors.push('部分文件删除失败')
    }
  }
  if (freedBytes > 0) addStorageUsed(userId, -freedBytes)
  ok(res, { success: true, deleted, errors: errors.length > 0 ? errors : undefined })
})

// POST /api/storage/move — 移动文件/文件夹
router.post('/move', (req: Request, res: Response) => {
  const { id: userId } = req.user!
  const { paths, target } = req.body
  if (!Array.isArray(paths) || paths.length === 0) throw new ValidationError('请指定源路径')
  if (!target) throw new ValidationError('请指定目标目录')
  const targetDir = resolveSafePath(userId, target)
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })

  const root = getUserDir(userId)
  const errors: string[] = []

  // 预验证所有路径
  const resolved: Array<{ src: string; dest: string }> = []
  for (const p of paths) {
    try {
      const src = resolveSafePath(userId, p)
      if (src === root) { errors.push(`「${p}」: 不能移动根目录`); continue }
      if (!existsSync(src)) { errors.push(`「${p}」: 不存在`); continue }
      if (targetDir.startsWith(src + '/') || targetDir === src) {
        errors.push(`「${p}」: 不能将目录移入自身`); continue
      }
      const name = basename(src)
      let dest = join(targetDir, name)
      if (existsSync(dest)) {
        const ext = extname(name)
        const base = basename(name, ext)
        dest = join(targetDir, `${base}_${Date.now()}${ext}`)
      }
      resolved.push({ src, dest })
    } catch {
      errors.push(`「${p}」: 路径不合法`)
    }
  }

  let moved = 0
  for (const { src, dest } of resolved) {
    try {
      renameSync(src, dest)
      moved++
    } catch {
      errors.push('部分文件移动失败')
    }
  }
  ok(res, { success: true, moved, errors: errors.length > 0 ? errors : undefined })
})

/** 强制保留文件扩展名（禁止改后缀） */
function enforceSameExt(oldName: string, newName: string): string {
  const oldExt = extname(oldName)
  if (!oldExt) return newName // 无扩展名的文件不限制
  const newExt = extname(newName)
  if (newExt && newExt !== oldExt) {
    throw new ValidationError(`不能修改文件扩展名，原始扩展名为「${oldExt}」`)
  }
  if (!newExt) return newName + oldExt // 没写扩展名则自动补上
  return newName
}

// PUT /api/storage/rename — 重命名（禁止改后缀）
router.put('/rename', (req: Request, res: Response) => {
  const { id: userId } = req.user!
  const { path, new_name } = req.body
  if (!path || !new_name) throw new ValidationError('请指定路径和新名称')
  validateFileName(new_name)
  const oldPath = resolveSafePath(userId, path)
  const root = getUserDir(userId)
  if (oldPath === root) throw new ValidationError('不能重命名根目录')
  if (!existsSync(oldPath)) throw new NotFoundError('文件或文件夹不存在')
  const oldName = basename(oldPath)
  const finalName = enforceSameExt(oldName, new_name)
  const parent = dirname(oldPath)
  const newPath = join(parent, finalName)
  if (existsSync(newPath)) throw new ValidationError('目标名称已存在')
  try { renameSync(oldPath, newPath) } catch {
    throw new ValidationError('重命名失败，文件可能被占用')
  }
  ok(res, { success: true, name: finalName })
})

// ── 管理端 API（需 roles.manage 权限） ──────────────────────────────

// GET /api/storage/groups — 获取所有父权限组的配额设置
router.get('/groups', requirePermission('roles.manage'), (req: Request, res: Response) => {
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
router.put('/groups/:id', requirePermission('roles.manage'), (req: Request, res: Response) => {
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

  // 同步该组下所有用户的默认配额（含子权限组）
  db.prepare(`
    UPDATE user_storage SET storage_limit = ?
    WHERE user_id IN (
      SELECT id FROM users WHERE group_id IN (
        SELECT id FROM permission_groups
        WHERE id = ? OR parent_id = ?
      )
    ) AND storage_limit < ?
  `).run(storage_limit, id, id, storage_limit)

  ok(res, { success: true })
})

// ── Batch rename ──────────────────────────────────────────────────────
// POST /api/storage/batch-rename — 批量重命名（支持替换/前缀/后缀/序号）
router.post('/batch-rename', (req: Request, res: Response) => {
  const { id: userId } = req.user!
  const { paths, mode, find, replace, text, pattern, start } = req.body

  if (!Array.isArray(paths) || paths.length === 0) throw new ValidationError('请指定文件路径列表')
  if (!mode || !['replace', 'prefix', 'suffix', 'number'].includes(mode)) throw new ValidationError('重命名模式无效')

  if (mode === 'number' && (!pattern || !pattern.includes('{n}'))) {
    throw new ValidationError('序号模式需要包含 {n} 占位符')
  }

  const root = getUserDir(userId)
  let renamed = 0
  const errors: string[] = []

  // 预验证所有路径
  const resolved: Array<{ fp: string; parent: string; oldName: string; ext: string; base: string }> = []
  for (const p of paths) {
    try {
      const fp = resolveSafePath(userId, p)
      if (fp === root) { errors.push(`「${p}」: 不能重命名根目录`); continue }
      if (!existsSync(fp)) { errors.push(`「${p}」: 不存在`); continue }
      const parent = dirname(fp)
      const oldName = basename(fp)
      const ext = extname(oldName)
      const base = basename(oldName, ext)
      resolved.push({ fp, parent, oldName, ext, base })
    } catch {
      errors.push(`「${p}」: 路径不合法`)
    }
  }

  for (let i = 0; i < resolved.length; i++) {
    try {
      const { fp, parent, oldName, ext, base } = resolved[i]

      let newName: string
      switch (mode) {
        case 'replace': {
          if (find === undefined || find === '') throw new ValidationError('替换模式需要提供查找文本')
          const rep = replace ?? ''
          newName = oldName.replaceAll(find, rep)
          break
        }
        case 'prefix':
          newName = (text || '') + oldName
          break
        case 'suffix':
          newName = base + (text || '') + ext
          break
        case 'number': {
          const num = (start || 1) + i
          newName = pattern.replace(/\{n\}/g, String(num).padStart(String(paths.length).length, '0'))
          break
        }
        default:
          throw new ValidationError('未知模式')
      }

      if (!newName) { errors.push('新名称为空'); continue }
      if (newName === oldName) { errors.push(`「${oldName}」: 新名称无变化`); continue }

      // 强制保留原扩展名
      try { newName = enforceSameExt(oldName, newName) } catch (e: any) {
        errors.push(e.message); continue
      }

      validateFileName(newName)

      const newPath = join(parent, newName)
      if (existsSync(newPath)) { errors.push(`新名称「${newName}」已存在`); continue }

      renameSync(fp, newPath)
      renamed++
    } catch (e: any) {
      errors.push('重命名失败: ' + (e.message || '未知错误'))
    }
  }

  ok(res, { success: true, renamed, errors: errors.length > 0 ? errors : undefined })
})

export default router
