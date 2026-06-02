import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getDb } from '../db/init.js'
import { validate } from '../middleware/validate.js'
import { ok, fail } from '../lib/response.js'
import { NotFoundError, ValidationError } from '../lib/errors.js'

const router = Router()

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const createSchema = z.object({
  title: z.string().min(1, '请输入标题'),
  description: z.string().optional().default(''),
  due_date: z.string().min(1, '请输入截止日期'),
  course: z.string().min(1, '请输入科目'),
  created_by: z.number().optional(),
})

const submitSchema = z.object({
  student_id: z.number(),
  content: z.string().optional().default(''),
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
  status: string
  score: number | null
  feedback: string | null
  submitted_at: string
  student_name: string
  class: string
}

// ---------------------------------------------------------------------------
// GET /api/assignments
// ---------------------------------------------------------------------------

router.get('/', (req: Request, res: Response) => {
  const db = getDb()
  const { student_id } = req.query

  if (student_id) {
    const id = Number(student_id)
    const assignments = db
      .prepare(
        `SELECT a.*, u.display_name as teacher_name,
          (SELECT status FROM submissions WHERE assignment_id = a.id AND student_id = ?) as submit_status,
          (SELECT score FROM submissions WHERE assignment_id = a.id AND student_id = ?) as submit_score
        FROM assignments a
        JOIN users u ON a.created_by = u.id
        ORDER BY a.due_date`,
      )
      .all(id, id) as AssignmentRow[]
    ok(res, assignments)
  } else {
    const assignments = db
      .prepare(
        `SELECT a.*, u.display_name as teacher_name
        FROM assignments a
        JOIN users u ON a.created_by = u.id
        ORDER BY a.created_at DESC`,
      )
      .all() as AssignmentRow[]
    ok(res, assignments)
  }
})

// ---------------------------------------------------------------------------
// POST /api/assignments
// ---------------------------------------------------------------------------

router.post('/', validate(createSchema), (req: Request, res: Response) => {
  const db = getDb()
  const { title, description, due_date, course, created_by } = req.body
  const result = db
    .prepare(
      `INSERT INTO assignments (title, description, due_date, course, created_by) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(title, description, due_date, course, created_by ?? req.user?.id)
  ok(res, { id: result.lastInsertRowid, title, description, due_date, course })
})

// ---------------------------------------------------------------------------
// GET /api/assignments/:id/submissions
// ---------------------------------------------------------------------------

router.get('/:id/submissions', (req: Request, res: Response) => {
  const db = getDb()
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
// POST /api/assignments/:id/submit
// ---------------------------------------------------------------------------

router.post('/:id/submit', validate(submitSchema), (req: Request, res: Response) => {
  const db = getDb()
  const { student_id, content } = req.body
  const existing = db
    .prepare('SELECT id FROM submissions WHERE assignment_id = ? AND student_id = ?')
    .get(req.params.id, student_id) as { id: number } | undefined

  if (existing) {
    db.prepare(
      'UPDATE submissions SET content = ?, submitted_at = CURRENT_TIMESTAMP, status = ? WHERE id = ?',
    ).run(content, 'pending', existing.id)
    ok(res, { success: true, updated: true })
    return
  }

  const result = db
    .prepare('INSERT INTO submissions (assignment_id, student_id, content) VALUES (?, ?, ?)')
    .run(req.params.id, student_id, content)
  ok(res, { id: result.lastInsertRowid })
})

// ---------------------------------------------------------------------------
// PUT /api/assignments/submissions/:id/grade
// ---------------------------------------------------------------------------

router.put(
  '/submissions/:id/grade',
  validate(gradeSchema),
  (req: Request, res: Response) => {
    const db = getDb()
    const { score, feedback } = req.body
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
