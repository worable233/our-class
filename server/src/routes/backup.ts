import { Router, Request, Response } from 'express'
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync, unlinkSync, createReadStream, copyFileSync, renameSync } from 'fs'
import { join, extname, basename } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { v4 as uuidv4 } from 'uuid'
import multer from 'multer'
import { getDb } from '../db/init.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'
import { ok, fail } from '../lib/response.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const UPLOAD_ROOT = join(__dirname, '..', '..', 'uploads')
const STORAGE_ROOT = join(__dirname, '..', '..', 'storage')
const BACKUP_DIR = join(__dirname, '..', '..', 'backups')
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

/** Tables to backup in dependency-safe order */
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
  'rate_limits',
  'courses',
]

/** Collect all files recursively */
function collectFiles(dir: string, basePath = ''): { path: string; src: string }[] {
  const results: { path: string; src: string }[] = []
  if (!existsSync(dir)) return results
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
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
  try {
    const Archiver = (await import('archiver')).default
    const db = getDb()
    const archive = Archiver('zip', { zlib: { level: 6 } })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `backup-${timestamp}.zip`
    const filePath = join(BACKUP_DIR, filename)

    const output = createReadStream // will be used later
    const writeStream = require('fs').createWriteStream(filePath)
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

    // 2. Backup metadata
    const backupMeta = {
      version: BACKUP_VERSION,
      created_at: new Date().toISOString(),
      db_tables: tables.length,
      db_records: Object.values(dbData).reduce((sum, arr) => sum + arr.length, 0),
    }
    archive.append(JSON.stringify(backupMeta, null, 2), { name: 'backup.json' })

    // 3. Uploaded files
    const uploadFiles = collectFiles(UPLOAD_ROOT)
    const storageFiles = collectFiles(STORAGE_ROOT)
    for (const f of [...uploadFiles, ...storageFiles]) {
      archive.file(f.src, { name: `files/${f.path}` })
    }
    backupMeta.files_count = uploadFiles.length + storageFiles.length

    await archive.finalize()

    await new Promise<void>((resolve, reject) => {
      writeStream.on('close', resolve)
      writeStream.on('error', reject)
    })

    // Stream download to client
    const st = statSync(filePath)
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', st.size)
    const rs = createReadStream(filePath)
    rs.pipe(res)
    rs.on('end', () => {
      // Don't delete the backup file - keep it server-side
    })
  } catch (e: any) {
    return fail(res, 500, 'BACKUP_FAILED', `导出失败: ${e.message}`)
  }
})

// POST /api/backup/import — restore from a backup zip
router.post('/import', requirePermission('chat.config'), upload.single('backup'), async (req: Request, res: Response) => {
  if (!req.file) return fail(res, 400, 'NO_FILE', '请选择备份文件')
  const filePath = req.file.path

  try {
    const AdmZip = (await import('adm-zip'))
    const zip = new AdmZip.default(filePath)

    // Read metadata
    const backupEntry = zip.getEntry('backup.json')
    if (!backupEntry) return fail(res, 400, 'INVALID_BACKUP', '无效的备份文件：缺少 backup.json')
    const backupMeta = JSON.parse(backupEntry.getData().toString('utf-8'))
    if (!backupMeta.version || backupMeta.version > BACKUP_VERSION) {
      return fail(res, 400, 'VERSION_MISMATCH', `备份版本 ${backupMeta.version} 不兼容，当前支持版本 ${BACKUP_VERSION}`)
    }

    // Read database data
    const dbEntry = zip.getEntry('database.json')
    if (!dbEntry) return fail(res, 400, 'INVALID_BACKUP', '无效的备份文件：缺少 database.json')
    const dbData = JSON.parse(dbEntry.getData().toString('utf-8'))

    const db = getDb()
    const errors: string[] = []

    // Restore database
    db.pragma('foreign_keys = OFF')
    const transaction = db.transaction(() => {
      // Clear all tables (reverse order for FK safety)
      const tables = getTableNames(db)
      for (const table of tables) {
        if (dbData[table]) {
          db.prepare(`DELETE FROM ${table}`).run()
        }
      }
      // Insert data in table order
      for (const table of BACKUP_TABLES) {
        const rows = dbData[table]
        if (!rows || rows.length === 0) continue
        try {
          const columns = Object.keys(rows[0])
          const placeholders = columns.map(() => '?').join(',')
          const insert = db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`)
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

    // Restore files
    const zipEntries = zip.getEntries()
    let restoredFiles = 0
    for (const entry of zipEntries) {
      if (entry.entryName.startsWith('files/') && !entry.isDirectory) {
        const relPath = entry.entryName.slice(6) // remove 'files/'
        const targetPath = join(UPLOAD_ROOT, relPath)
        const targetDir = join(targetPath, '..')
        if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })
        try {
          writeFileSync(targetPath, entry.getData())
          restoredFiles++
        } catch { /* skip file errors */ }
      }
    }

    db.pragma('foreign_keys = ON')

    // Cleanup temp file
    try { unlinkSync(filePath) } catch {}

    ok(res, {
      success: true,
      tables_restored: Object.keys(dbData).filter(k => dbData[k]?.length).length,
      records_total: Object.values(dbData).reduce((sum: number, arr: any) => sum + (arr?.length || 0), 0),
      files_restored: restoredFiles,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    })
  } catch (e: any) {
    try { unlinkSync(filePath) } catch {}
    return fail(res, 500, 'IMPORT_FAILED', `导入失败: ${e.message}`)
  }
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
