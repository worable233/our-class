import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { existsSync, mkdirSync, readdirSync, statSync, renameSync, unlinkSync, createReadStream, copyFileSync } from 'fs'
import { join, extname, basename, dirname } from 'path'
import { fileURLToPath } from 'url'
import { dirname as pathDirname } from 'path'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/init.js'
import { validate } from '../middleware/validate.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'
import { ok, fail } from '../lib/response.js'
import { NotFoundError, ValidationError } from '../lib/errors.js'

const __dirname = pathDirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = join(__dirname, '..', '..', 'storage')

const router = Router()

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const createSchema = z.object({
  title: z.string().min(1, '请输入标题'),
  description: z.string().optional().default(''),
  due_date: z.string().min(1, '请输入截止日期'),
  course: z.string().optional().default(''),
  course_id: z.number().int(),
  created_by: z.number().optional(),
})

const gradeSchema = z.object({
  score: z.number().min(0).max(100).nullable(),
  feedback: z.string().optional().default(''),
})

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

interface AssignmentRow {
  id: number
  title: string
  description: string | null
  due_date: string
  course: string
  course_id: number | null
  course_name?: string | null
  course_class?: string | null
  created_by: number
  created_at: string
  teacher_name: string
  submit_status?: string | null
  submit_score?: number | null
}

interface SubmissionRow {
  id: number
  assignment_id: number
  student_id: number
  content: string
  files: string
  status: string
  score: number | null
  feedback: string | null
  submitted_at: string
  student_name: string
  class: string
}

// ---------------------------------------------------------------------------
// File helpers（复用 storage.ts 路径逻辑）
// ---------------------------------------------------------------------------

/** 获取用户网盘根目录 */
function getUserDir(userId: number): string {
  const dir = join(STORAGE_ROOT, `user_${userId}`)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** 安全解析路径，防 ../ 越权 */
function resolveSafePath(userId: number, relPath: string): string {
  const root = getUserDir(userId).replace(/\\/g, '/')
  const safe = relPath.replace(/^\/+/, '').replace(/\\/g, '/')
  const full = join(root, safe).replace(/\\/g, '/')
  if (full !== root && !full.startsWith(root + '/')) throw new ValidationError('路径不合法')
  return full
}

/** 格式化文件大小 */
function fmtSize(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB'
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return bytes + ' B'
}

/** 获取作业提交文件的目标目录：/{course_name}/{student_id}_{student_display_name}/ */
function getSubmissionDir(courseName: string, studentId: number, studentName: string, teacherId: number): string {
  const safeCourse = courseName.replace(/[/\\:*?"<>|]/g, '_')
  const safeName = `${studentId}_${studentName.replace(/[/\\:*?"<>|]/g, '_')}`
  return join(getUserDir(teacherId), '作业提交', safeCourse, safeName)
}

// ---------------------------------------------------------------------------
// Multer 配置 — 接收作业附件
// ---------------------------------------------------------------------------

const submitUploader = multer({
  storage: multer.diskStorage({
    destination: STORAGE_ROOT,
    filename: (_req, file, cb) => cb(null, `_submit_${uuidv4()}_${file.originalname}`),
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB/个
})

const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/

function validateFileName(name: string): void {
  if (!name || name.trim() === '') throw new ValidationError('文件名不能为空')
  if (name.length > 255) throw new ValidationError('文件名过长（最多 255 字符）')
  if (INVALID_FILENAME_CHARS.test(name)) throw new ValidationError('文件名包含非法字符')
}

// ---------------------------------------------------------------------------
// GET /api/assignments
// ---------------------------------------------------------------------------

router.get('/', requirePermission('assignments.write'), (req: Request, res: Response) => {
  const db = getDb()
  const { student_id } = req.query
  const { permissions, class: userClass } = req.user!
  const hasViewAll = permissions.includes('classes.view_all')

  let classFilter = ''
  const params: any[] = []
  if (!hasViewAll) {
    const allowed = userClass.split(',').filter(Boolean).map(c => c.trim())
    if (allowed.length > 0) {
      classFilter = ` AND (c.class IN (${allowed.map(() => '?').join(',')}) OR a.course_id IS NULL)`
      params.push(...allowed)
    }
  }

  if (student_id) {
    const id = Number(student_id)
    const assignments = db
      .prepare(
        `SELECT a.*, u.display_name as teacher_name, c.name as course_name, c.class as course_class,
          (SELECT status FROM submissions WHERE assignment_id = a.id AND student_id = ?) as submit_status,
          (SELECT score FROM submissions WHERE assignment_id = a.id AND student_id = ?) as submit_score
        FROM assignments a
        JOIN users u ON a.created_by = u.id
        LEFT JOIN courses c ON a.course_id = c.id
        WHERE 1=1${classFilter}
        ORDER BY a.due_date`,
      )
      .all(id, id, ...params) as AssignmentRow[]
    ok(res, assignments)
  } else {
    const assignments = db
      .prepare(
        `SELECT a.*, u.display_name as teacher_name, c.name as course_name, c.class as course_class
        FROM assignments a
        JOIN users u ON a.created_by = u.id
        LEFT JOIN courses c ON a.course_id = c.id
        WHERE 1=1${classFilter}
        ORDER BY a.created_at DESC`,
      )
      .all(...params) as AssignmentRow[]
    ok(res, assignments)
  }
})

// ---------------------------------------------------------------------------
// POST /api/assignments
router.post('/', requirePermission('assignments.write'), validate(createSchema), (req: Request, res: Response) => {
  const db = getDb()
  const { title, description, due_date, course_id, created_by } = req.body

  const course = db.prepare('SELECT name, class FROM courses WHERE id = ?').get(course_id) as any
  if (!course) throw new NotFoundError('课程不存在')

  // 班级限制：验证课程在自己班级内
  if (!req.user?.permissions?.includes('classes.view_all')) {
    const myClasses = (req.user?.class || '').split(',').filter(Boolean).map(c => c.trim())
    if (!myClasses.includes(course.class)) {
      return fail(res, 403, 'FORBIDDEN', '无权为其他班级课程布置作业')
    }
  }

  const courseName = course.name

  const result = db
    .prepare(
      `INSERT INTO assignments (title, description, due_date, course, course_id, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(title, description, due_date, courseName, course_id, created_by ?? req.user?.id)
  ok(res, { id: result.lastInsertRowid, title, description, due_date, course: courseName, course_id })
})

// ---------------------------------------------------------------------------
// GET /api/assignments/:id/submissions
// ---------------------------------------------------------------------------

router.get('/:id/submissions', requirePermission('assignments.write'), (req: Request, res: Response) => {
  const db = getDb()
  const { permissions, class: userClass } = req.user!
  const hasViewAll = permissions.includes('classes.view_all')

  const asgn = db.prepare(`
    SELECT a.*, c.class as course_class FROM assignments a
    LEFT JOIN courses c ON a.course_id = c.id
    WHERE a.id = ?
  `).get(req.params.id) as any
  if (!asgn) throw new NotFoundError('作业不存在')
  if (!hasViewAll && asgn.course_class) {
    const allowed = userClass.split(',').filter(Boolean).map(c => c.trim())
    if (!allowed.includes(asgn.course_class)) throw new NotFoundError('作业不存在')
  }

  const subs = db
    .prepare(
      `SELECT s.*, u.display_name as student_name, u.class
      FROM submissions s
      JOIN users u ON s.student_id = u.id
      WHERE s.assignment_id = ?
      ORDER BY s.submitted_at`,
    )
    .all(req.params.id) as SubmissionRow[]
  ok(res, subs)
})

// ---------------------------------------------------------------------------
// POST /api/assignments/:id/submit — 提交作业（文本 + 文件）
// ---------------------------------------------------------------------------
// 接受 multipart/form-data（文件 + 字段）或 application/json
// 字段:
//   student_id, content
//   files (JSON) — 从学生网盘选择的文件数组 [{ name, disk_path }]
// 文件字段: 直接用 multipart 的 file 字段（可多个）

router.post('/:id/submit', requirePermission('assignments.submit'), (req: Request, res: Response) => {
  const ct = req.headers['content-type'] || ''

  if (ct.includes('multipart/form-data')) {
    submitUploader.any()(req, res, (err: any) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          return fail(res, 400, 'FILE_TOO_LARGE', '文件大小超出限制（最大 100MB）')
        }
        return fail(res, 400, 'UPLOAD_ERROR', err.message || '上传失败')
      }
      doSubmit(req, res)
    })
  } else {
    doSubmit(req, res)
  }
})

async function doSubmit(req: Request, res: Response) {
  const db = getDb()
  const assignmentId = Number(req.params.id)

  // ── 解析请求 ──────────────────────────────────────────────────────
  let studentId: number
  let content = ''
  const fileEntries: { name: string; disk_path?: string }[] = []

  if (Array.isArray(req.files) && req.files.length > 0) {
    studentId = Number(req.body.student_id || req.user?.id)
    content = req.body.content || ''
    // 本地上传的文件
    for (const f of req.files as Express.Multer.File[]) {
      fileEntries.push({ name: f.originalname, disk_path: f.path })
    }
    // 从网盘选择的文件（disk_files JSON）
    try {
      const diskFiles = JSON.parse(req.body.disk_files || '[]')
      for (const df of diskFiles) {
        if (df.name && df.disk_path) fileEntries.push({ name: df.name, disk_path: `__disk__${df.disk_path}` })
      }
    } catch {}
  } else {
    studentId = Number(req.body.student_id || req.user?.id)
    content = req.body.content || ''
    const files = req.body.files || []
    for (const f of files) {
      if (f.name && f.disk_path) fileEntries.push({ name: f.name, disk_path: `__disk__${f.disk_path}` })
    }
  }

  if (!studentId) return fail(res, 400, 'VALIDATION', '缺少学生信息')

  // ── 检查作业 ──────────────────────────────────────────────────────
  const assignment = db.prepare(`
    SELECT a.*, c.name as course_name FROM assignments a
    LEFT JOIN courses c ON a.course_id = c.id
    WHERE a.id = ?
  `).get(assignmentId) as any
  if (!assignment) throw new NotFoundError('作业不存在')
  if (assignment.due_date && assignment.due_date < new Date().toISOString().split('T')[0]) {
    return fail(res, 400, 'OVERDUE', '该作业已截止，无法提交')
  }

  const student = db.prepare('SELECT id, display_name FROM users WHERE id = ?').get(studentId) as any
  if (!student) throw new NotFoundError('学生不存在')

  const teacherId = assignment.created_by
  const courseName = assignment.course_name || assignment.course || '未分类'

  // ── 保存文件到教师网盘 ────────────────────────────────────────────
  const savedFiles: { name: string; size: number; path: string; size_display: string }[] = []

  for (const fe of fileEntries) {
    try {
      validateFileName(fe.name)
      const subDir = getSubmissionDir(courseName, studentId, student.display_name, teacherId)
      if (!existsSync(subDir)) mkdirSync(subDir, { recursive: true })

      let finalName = fe.name
      let dest = join(subDir, finalName)
      if (existsSync(dest)) {
        const ext = extname(finalName)
        const base = basename(finalName, ext)
        finalName = `${base}_${Date.now()}${ext}`
        dest = join(subDir, finalName)
      }

      if (fe.disk_path?.startsWith('__disk__')) {
        // 从学生网盘复制
        const srcPath = fe.disk_path.slice(8) // 去掉 __disk__ 前缀
        try {
          const src = resolveSafePath(studentId, srcPath)
          if (!existsSync(src)) continue
          copyFileSync(src, dest)
        } catch { continue }
      } else if (fe.disk_path) {
        // 从 multer 临时文件移动
        if (!existsSync(fe.disk_path)) continue
        renameSync(fe.disk_path, dest)
      } else {
        continue
      }

      const st = statSync(dest)
      const relPath = join('作业提交', courseName, `${studentId}_${student.display_name}`, finalName)
      savedFiles.push({
        name: finalName,
        size: st.size,
        size_display: fmtSize(st.size),
        path: relPath,
      })
    } catch {}
  }

  const filesJson = JSON.stringify(savedFiles)

  // ── 写入数据库 ────────────────────────────────────────────────────
  const existing = db
    .prepare('SELECT id FROM submissions WHERE assignment_id = ? AND student_id = ?')
    .get(assignmentId, studentId) as { id: number } | undefined

  if (existing) {
    // 合并已存文件和新文件
    const existingSub = db.prepare('SELECT files FROM submissions WHERE id = ?').get(existing.id) as any
    let existingFiles: any[] = []
    try { existingFiles = JSON.parse(existingSub.files || '[]') } catch {}
    const mergedFiles = JSON.stringify([...existingFiles, ...savedFiles])

    db.prepare(
      'UPDATE submissions SET content = ?, files = ?, submitted_at = CURRENT_TIMESTAMP, status = ? WHERE id = ?',
    ).run(content, mergedFiles, 'pending', existing.id)
    ok(res, { success: true, updated: true, files: mergedFiles })
    return
  }

  const result = db
    .prepare('INSERT INTO submissions (assignment_id, student_id, content, files) VALUES (?, ?, ?, ?)')
    .run(assignmentId, studentId, content, filesJson)
  ok(res, { id: result.lastInsertRowid, files: savedFiles })
}

// ---------------------------------------------------------------------------
// GET /api/assignments/submissions/:id/download — 下载提交附件
// ---------------------------------------------------------------------------

router.get('/submissions/:id/download', requirePermission('assignments.write'), (req: Request, res: Response) => {
  const db = getDb()
  const sub = db.prepare(`
    SELECT s.*, a.created_by as teacher_id
    FROM submissions s
    JOIN assignments a ON s.assignment_id = a.id
    WHERE s.id = ?
  `).get(req.params.id) as any
  if (!sub) throw new NotFoundError('提交记录不存在')

  const filePath = req.query.path as string
  if (!filePath) throw new ValidationError('请指定文件路径')

  const fullPath = resolveSafePath(sub.teacher_id, filePath)
  if (!existsSync(fullPath)) throw new NotFoundError('文件已不存在')

  const displayName = basename(filePath)
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(displayName)}`)
  res.setHeader('Content-Type', 'application/octet-stream')
  const stream = createReadStream(fullPath)
  stream.pipe(res)
})

// ---------------------------------------------------------------------------
// GET /api/assignments/submissions/:id/files — 列出提交附件列表
// ---------------------------------------------------------------------------

router.get('/submissions/:id/files', requirePermission('assignments.write'), (req: Request, res: Response) => {
  const db = getDb()
  const sub = db.prepare('SELECT files FROM submissions WHERE id = ?').get(req.params.id) as any
  if (!sub) throw new NotFoundError('提交记录不存在')
  let files: any[] = []
  try { files = JSON.parse(sub.files || '[]') } catch {}
  ok(res, files)
})

// ---------------------------------------------------------------------------
// PUT /api/assignments/submissions/:id/grade
// ---------------------------------------------------------------------------

router.put(
  '/submissions/:id/grade',
  requirePermission('assignments.write'),
  validate(gradeSchema),
  (req: Request, res: Response) => {
    const db = getDb()
    const { score, feedback } = req.body

    // 班级限制：验证提交属于自己的班级
    if (!req.user?.permissions?.includes('classes.view_all')) {
      const sub = db.prepare(`
        SELECT s.id FROM submissions s
        JOIN assignments a ON s.assignment_id = a.id
        JOIN courses c ON a.course_id = c.id
        WHERE s.id = ?
      `).get(req.params.id) as any
      if (!sub) return fail(res, 404, 'NOT_FOUND', '提交记录不存在')
    }

    const status = score !== null ? 'graded' : 'pending'
    db.prepare('UPDATE submissions SET score = ?, feedback = ?, status = ? WHERE id = ?').run(
      score,
      feedback,
      status,
      req.params.id,
    )
    ok(res, { success: true })
  },
)

export default router
