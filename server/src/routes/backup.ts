import { Router, Request, Response } from 'express'
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, unlinkSync, renameSync, createReadStream, createWriteStream } from 'fs'
import { join, basename, resolve, normalize } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { v4 as uuidv4 } from 'uuid'
import multer from 'multer'
import jwt from 'jsonwebtoken'
import { getDb } from '../db/init.js'
import { config } from '../config/index.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'
import { ok, fail } from '../lib/response.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const UPLOAD_ROOT = resolve(join(__dirname, '..', '..', 'uploads'))
const STORAGE_ROOT = resolve(join(__dirname, '..', '..', 'storage'))
const BACKUP_DIR = resolve(join(__dirname, '..', '..', 'backups'))
if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })

const router = Router()
router.use(authMiddleware)

// Multer config for import upload
const upload = multer({
  dest: join(UPLOAD_ROOT, '_pending'),
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB max
})

// ── Helpers ──

const BACKUP_VERSION = 1

/** Tables to backup/restore in dependency-safe order */
const BACKUP_TABLES = [
  'permission_groups',
  'permissions',
  'group_permissions',
  'rate_limits',
  'chat_settings',
  'api_keys',
  'tool_configs',
  'users',
  'scores',
  'assignments',
  'submissions',
  'point_records',
  'posts',
  'comments',
  'conversations',
  'messages',
  'uploaded_files',
  'audit_logs',
  'page_views',
  'traffic_logs',
  'review_types',
  'articles',
  'site_settings',
  'classes',
  'storage_meta',
  'storage_quotas',
  'courses',
]

/** Resolve a path safely within a root directory (prevents path traversal) */
function safeJoin(root: string, relative: string): string | null {
  const target = resolve(join(root, relative))
  if (!target.startsWith(root)) return null
  return target
}

/** Collect all files recursively, excluding _pending */
function collectFiles(dir: string, basePath = ''): { path: string; src: string }[] {
  const results: { path: string; src: string }[] = []
  if (!existsSync(dir)) return results
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === '_pending') continue // skip temp uploads
    const fullPath = join(dir, entry.name)
    const relPath = basePath ? `${basePath}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, relPath))
    } else {
      results.push({ path: relPath, src: fullPath })
    }
  }
  return results
}

function getTableNames(db: any): string[] {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]
  return rows.map((r: any) => r.name).filter((n: string) => n !== '_migrations')
}

// ── Routes ──

// GET /api/backup/stats — 各表数据统计（供选择备份弹窗使用）
router.get('/stats', requirePermission('chat.config'), (_req: Request, res: Response) => {
  const db = getDb()
  const tables = BACKUP_TABLES
  const stats = tables.map(name => {
    try {
      const row = db.prepare(`SELECT COUNT(*) as c FROM "${name}"`).get() as { c: number }
      return { name, count: row.c }
    } catch { return { name, count: 0 } }
  })
  // 文件存储大小
  let uploadsSize = 0
  try { uploadsSize = collectFiles(UPLOAD_ROOT).reduce((s, f) => s + statSync(f.src).size, 0) } catch {}
  let storageSize = 0
  try { storageSize = collectFiles(STORAGE_ROOT).reduce((s, f) => s + statSync(f.src).size, 0) } catch {}
  ok(res, { tables: stats, uploads_size: uploadsSize, storage_size: storageSize })
})

// POST /api/backup/create — 创建备份到服务端（可选表）
router.post('/create', requirePermission('chat.config'), async (req: Request, res: Response) => {
  const selectedTables = req.body.tables as string[] | undefined
  const db = getDb()

  const tables = selectedTables && selectedTables.length > 0
    ? selectedTables.filter(t => BACKUP_TABLES.includes(t))
    : BACKUP_TABLES

  const { ZipArchive } = await import('archiver')
  const archive = new ZipArchive({ zlib: { level: 6 } })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const tag = uuidv4().slice(0, 8)
  const filename = `backup-${timestamp}-${tag}.zip`
  const filePath = join(BACKUP_DIR, filename)

  const writeStream = createWriteStream(filePath)
  archive.pipe(writeStream)

  // 1. Database data
  const dbData: Record<string, any[]> = {}
  for (const table of tables) {
    try {
      dbData[table] = db.prepare(`SELECT * FROM "${table}"`).all()
    } catch {}
  }
  archive.append(JSON.stringify(dbData, null, 2), { name: 'database.json' })

  // 2. Uploaded + storage files（跳过已被删除的）
  const uploadFiles = collectFiles(UPLOAD_ROOT)
  const storageFiles = collectFiles(STORAGE_ROOT)
  const allFiles = [...uploadFiles, ...storageFiles]
  for (const f of allFiles) {
    try { if (existsSync(f.src)) archive.file(f.src, { name: `files/${f.path}` }) } catch {}
  }

  // 3. Metadata
  const totalRecords = Object.values(dbData).reduce((sum, arr) => sum + arr.length, 0)
  archive.append(JSON.stringify({
    version: BACKUP_VERSION, created_at: new Date().toISOString(),
    db_tables: tables.length, db_records: totalRecords,
    files_count: allFiles.length, selected_tables: tables,
  }, null, 2), { name: 'backup.json' })

  await archive.finalize()
  await new Promise<void>((resolve, reject) => {
    writeStream.on('close', resolve)
    writeStream.on('error', reject)
  })

  if (!existsSync(filePath) || statSync(filePath).size === 0) {
    return fail(res, 500, 'BACKUP_FAILED', '备份文件生成失败')
  }

  const st = statSync(filePath)
  ok(res, { name: filename, size: st.size, size_display: fmtSize(st.size) })
})

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

// PUT /api/backup/:name — 重命名备份
router.put('/:name', requirePermission('chat.config'), (req: Request, res: Response) => {
  const oldName = basename(req.params.name)
  const newName = req.body.name as string
  if (!oldName.endsWith('.zip')) return fail(res, 400, 'INVALID_NAME', '无效的备份文件名')
  if (!newName || !newName.endsWith('.zip')) return fail(res, 400, 'INVALID_NAME', '新文件名必须以 .zip 结尾')
  const oldPath = join(BACKUP_DIR, oldName)
  const newPath = join(BACKUP_DIR, newName)
  if (!existsSync(oldPath)) return fail(res, 404, 'NOT_FOUND', '备份文件不存在')
  if (existsSync(newPath)) return fail(res, 409, 'DUPLICATE', '目标文件名已存在')
  try { renameSync(oldPath, newPath) } catch { return fail(res, 500, 'RENAME_FAILED', '重命名失败') }
  ok(res, { success: true })
})

// POST /api/backup/restore/:name — 从服务端备份恢复
router.post('/restore/:name', requirePermission('chat.config'), async (req: Request, res: Response) => {
  const name = basename(req.params.name)
  if (!name.endsWith('.zip')) return fail(res, 400, 'INVALID_NAME', '无效的备份文件名')
  const zipPath = join(BACKUP_DIR, name)
  if (!existsSync(zipPath)) return fail(res, 404, 'NOT_FOUND', '备份文件不存在')

  const AdmZip = (await import('adm-zip'))
  const zip = new AdmZip.default(zipPath)

  const backupEntry = zip.getEntry('backup.json')
  if (!backupEntry) return fail(res, 400, 'INVALID_BACKUP', '缺少 backup.json')
  const backupMeta = JSON.parse(backupEntry.getData().toString('utf-8'))
  if (typeof backupMeta.version !== 'number' || backupMeta.version < 1 || backupMeta.version > BACKUP_VERSION) {
    return fail(res, 400, 'VERSION_MISMATCH', `备份版本 ${backupMeta.version} 不兼容`)
  }

  const dbEntry = zip.getEntry('database.json')
  if (!dbEntry) return fail(res, 400, 'INVALID_BACKUP', '缺少 database.json')
  const dbData = JSON.parse(dbEntry.getData().toString('utf-8'))

  const db = getDb()
  const errors: string[] = []

  db.pragma('foreign_keys = OFF')
  try {
    const transaction = db.transaction(() => {
      const tables = getTableNames(db)
      for (const table of BACKUP_TABLES.slice().reverse()) {
        if (dbData[table]) { try { db.prepare(`DELETE FROM "${table}"`).run() } catch {} }
      }
      for (const table of BACKUP_TABLES) {
        const rows = dbData[table]
        if (!rows || !Array.isArray(rows) || rows.length === 0) continue
        try {
          const columns = Object.keys(rows[0]).filter(c => typeof c === 'string')
          const placeholders = columns.map(() => '?').join(',')
          const insert = db.prepare(`INSERT INTO "${table}" (${columns.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`)
          for (const row of rows) {
            try { insert.run(...columns.map(c => row[c] ?? null)) } catch (e: any) { errors.push(`${table}: ${e.message}`) }
          }
        } catch (e: any) { errors.push(`${table}: ${e.message}`) }
      }
    })
    transaction()
  } finally { db.pragma('foreign_keys = ON') }

  const zipEntries = zip.getEntries()
  let restoredFiles = 0
  for (const entry of zipEntries) {
    if (!entry.entryName.startsWith('files/') || entry.isDirectory) continue
    const relPath = entry.entryName.slice(6)
    if (!relPath || relPath.includes('..')) continue
    const safePath = safeJoin(UPLOAD_ROOT, relPath) || safeJoin(STORAGE_ROOT, relPath)
    if (!safePath) continue
    const dir = join(safePath, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    try { writeFileSync(safePath, entry.getData()); restoredFiles++ } catch {}
  }

  ok(res, {
    tables_restored: Object.keys(dbData).filter(k => dbData[k]?.length).length,
    records_total: Object.values(dbData).reduce((sum: number, arr: any) => sum + (arr?.length || 0), 0),
    files_restored: restoredFiles,
    errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
  })
})

// GET /api/backup/list — list server-side backup files
router.get('/list', requirePermission('chat.config'), (_req: Request, res: Response) => {
  if (!existsSync(BACKUP_DIR)) { ok(res, []); return }
  const files = readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.zip'))
    .map(f => {
      const fp = join(BACKUP_DIR, f)
      const st = statSync(fp)
      return { name: f, size: st.size, created_at: st.mtime.toISOString() }
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  ok(res, files)
})

// POST /api/backup/export — create and download a full backup
router.post('/export', requirePermission('chat.config'), async (req: Request, res: Response) => {
  let cleanupPath: string | null = null
  try {
    const { Archiver } = await import('archiver')
    const db = getDb()
    const archive = new Archiver('zip', { zlib: { level: 6 } })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const tag = uuidv4().slice(0, 8)
    const filename = `backup-${timestamp}-${tag}.zip`
    const filePath = join(BACKUP_DIR, filename)
    cleanupPath = filePath

    const writeStream = createWriteStream(filePath)
    archive.pipe(writeStream)

    // 1. Database data
    const dbData: Record<string, any[]> = {}
    const tables = getTableNames(db)
    for (const table of tables) {
      try {
        dbData[table] = db.prepare(`SELECT * FROM ${table}`).all()
      } catch { /* skip tables that can't be queried */ }
    }
    archive.append(JSON.stringify(dbData, null, 2), { name: 'database.json' })

    // 2. Uploaded files
    const uploadFiles = collectFiles(UPLOAD_ROOT)
    const storageFiles = collectFiles(STORAGE_ROOT)
    const allFiles = [...uploadFiles, ...storageFiles]
    for (const f of allFiles) {
      try { if (existsSync(f.src)) archive.file(f.src, { name: `files/${f.path}` }) } catch {}
    }

    // 3. Backup metadata (compute all fields before writing)
    const totalRecords = Object.values(dbData).reduce((sum, arr) => sum + arr.length, 0)
    const backupMeta = {
      version: BACKUP_VERSION,
      created_at: new Date().toISOString(),
      db_tables: tables.length,
      db_records: totalRecords,
      files_count: allFiles.length,
    }
    archive.append(JSON.stringify(backupMeta, null, 2), { name: 'backup.json' })

    await archive.finalize()
    await new Promise<void>((resolve, reject) => {
      writeStream.on('close', resolve)
      writeStream.on('error', reject)
    })

    // Verify the zip was written
    if (!existsSync(filePath) || statSync(filePath).size === 0) {
      throw new Error('备份文件生成失败')
    }

    // Stream download to client
    const st = statSync(filePath)
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', st.size)
    const rs = createReadStream(filePath)
    rs.pipe(res)
    rs.on('error', () => { /* client disconnected — cleanup handled below */ })
  } catch (e: any) {
    // Clean up partial file on error
    if (cleanupPath && existsSync(cleanupPath)) {
      try { unlinkSync(cleanupPath) } catch {}
    }
    return fail(res, 500, 'BACKUP_FAILED', `导出失败: ${e.message}`)
  }
})

// POST /api/backup/upload — 上传备份文件到服务端（不恢复，仅存储）
router.post('/upload', requirePermission('chat.config'), upload.single('backup'), (req: Request, res: Response) => {
  if (!req.file) return fail(res, 400, 'NO_FILE', '请选择备份文件')
  const src = req.file.path
  const dest = join(BACKUP_DIR, req.file.originalname.endsWith('.zip') ? req.file.originalname : `backup-${Date.now()}.zip`)
  if (existsSync(dest)) return fail(res, 409, 'DUPLICATE', '备份文件已存在')
  try {
    renameSync(src, dest)
    const st = statSync(dest)
    ok(res, { name: basename(dest), size: st.size, size_display: fmtSize(st.size), created_at: st.mtime.toISOString() })
  } catch { try { unlinkSync(src) } catch {}; return fail(res, 500, 'UPLOAD_FAILED', '上传失败') }
})

// POST /api/backup/import — restore from a backup zip
router.post('/import', requirePermission('chat.config'), upload.single('backup'), async (req: Request, res: Response) => {
  if (!req.file) return fail(res, 400, 'NO_FILE', '请选择备份文件')
  const uploadPath = req.file.path

  try {
    const AdmZip = (await import('adm-zip'))
    const zip = new AdmZip.default(uploadPath)

    // Read and validate metadata
    const backupEntry = zip.getEntry('backup.json')
    if (!backupEntry) return fail(res, 400, 'INVALID_BACKUP', '无效的备份文件：缺少 backup.json')
    const backupMeta = JSON.parse(backupEntry.getData().toString('utf-8'))
    if (typeof backupMeta.version !== 'number' || backupMeta.version < 1 || backupMeta.version > BACKUP_VERSION) {
      return fail(res, 400, 'VERSION_MISMATCH',
        `备份版本 ${backupMeta.version} 不兼容，当前支持版本 v${BACKUP_VERSION}`)
    }

    // Read database data
    const dbEntry = zip.getEntry('database.json')
    if (!dbEntry) return fail(res, 400, 'INVALID_BACKUP', '无效的备份文件：缺少 database.json')
    const dbData = JSON.parse(dbEntry.getData().toString('utf-8'))
    if (typeof dbData !== 'object' || Array.isArray(dbData)) {
      return fail(res, 400, 'INVALID_BACKUP', '无效的备份文件：database.json 格式错误')
    }

    const db = getDb()
    const errors: string[] = []

    // Restore database
    db.pragma('foreign_keys = OFF')
    try {
      const transaction = db.transaction(() => {
        // Clear all existing data
        const tables = getTableNames(db)
        for (const table of BACKUP_TABLES.slice().reverse()) {
          if (dbData[table]) {
            db.prepare(`DELETE FROM ${table}`).run()
          }
        }
        // Insert data in dependency-safe order
        for (const table of BACKUP_TABLES) {
          const rows = dbData[table]
          if (!rows || !Array.isArray(rows) || rows.length === 0) continue
          try {
            const columns = Object.keys(rows[0]).filter(c => typeof c === 'string')
            const placeholders = columns.map(() => '?').join(',')
            const insert = db.prepare(`INSERT INTO "${table}" (${columns.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`)
            for (const row of rows) {
              try {
                insert.run(...columns.map(c => row[c] ?? null))
              } catch (e: any) {
                errors.push(`${table}: ${e.message}`)
              }
            }
          } catch (e: any) {
            errors.push(`${table}: ${e.message}`)
          }
        }
      })
      transaction()
    } finally {
      db.pragma('foreign_keys = ON') // always re-enable, even on error
    }

    // Restore files (with path traversal protection)
    const zipEntries = zip.getEntries()
    let restoredFiles = 0
    for (const entry of zipEntries) {
      if (!entry.entryName.startsWith('files/') || entry.isDirectory) continue
      const relPath = entry.entryName.slice(6) // remove 'files/'
      if (!relPath || relPath.includes('..')) continue // block path traversal

      const safePath = safeJoin(UPLOAD_ROOT, relPath)
      if (!safePath) continue // rejects paths escaping uploads/

      const targetDir = join(safePath, '..')
      if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })
      try {
        writeFileSync(safePath, entry.getData())
        restoredFiles++
      } catch { /* skip individual file errors */ }
    }

    // Cleanup temp upload
    try { unlinkSync(uploadPath) } catch {}

    ok(res, {
      success: true,
      tables_restored: Object.keys(dbData).filter(k => dbData[k]?.length).length,
      records_total: Object.values(dbData).reduce((sum: number, arr: any) => sum + (arr?.length || 0), 0),
      files_restored: restoredFiles,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    })
  } catch (e: any) {
    try { unlinkSync(uploadPath) } catch {}
    return fail(res, 500, 'IMPORT_FAILED', `导入失败: ${e.message}`)
  }
})

// GET /api/backup/download/:name — download a server-side backup
router.get('/download/:name', requirePermission('chat.config'), (req: Request, res: Response) => {
  const name = basename(req.params.name)
  if (!name.endsWith('.zip')) return fail(res, 400, 'INVALID_NAME', '无效的备份文件名')
  const fp = join(BACKUP_DIR, name)
  if (!existsSync(fp)) return fail(res, 404, 'NOT_FOUND', '备份文件不存在')
  const st = statSync(fp)
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
  res.setHeader('Content-Length', st.size)
  createReadStream(fp).pipe(res)
})

// DELETE /api/backup/:name — delete a server-side backup
router.delete('/:name', requirePermission('chat.config'), (req: Request, res: Response) => {
  const name = basename(req.params.name)
  if (!name.endsWith('.zip')) return fail(res, 400, 'INVALID_NAME', '无效的备份文件名')
  const fp = join(BACKUP_DIR, name)
  if (!existsSync(fp)) return fail(res, 404, 'NOT_FOUND', '备份文件不存在')
  unlinkSync(fp)
  ok(res, { success: true })
})

export default router
