import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getDb } from '../db/init.js'
import { validate } from '../middleware/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { ok, fail } from '../lib/response.js'
import { NotFoundError } from '../lib/errors.js'

const router = Router()

const createPostSchema = z.object({
  title: z.string().min(1, '请输入标题'),
  content: z.string().min(1, '请输入内容'),
  author_id: z.number().optional(),
  tags: z.string().optional().default(''),
})

const createCommentSchema = z.object({
  author_id: z.number().optional(),
  content: z.string().min(1, '请输入评论内容'),
})

// GET /api/posts
router.get('/', requirePermission('posts.read'), (req: Request, res: Response) => {
  const db = getDb()
  const userId = req.user?.id ?? 0
  const posts = db
    .prepare(
      `SELECT p.*, u.display_name as author_name, u.role as author_role,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
        (SELECT COUNT(*) > 0 FROM post_likes WHERE post_id = p.id AND user_id = ?) as liked
      FROM posts p
      JOIN users u ON p.author_id = u.id
      ORDER BY p.created_at DESC`,
    )
    .all(userId)
  ok(res, posts)
})

// GET /api/posts/:id
router.get('/:id', requirePermission('posts.read'), (req: Request, res: Response) => {
  const db = getDb()
  const post = db
    .prepare(
      `SELECT p.*, u.display_name as author_name, u.role as author_role
      FROM posts p JOIN users u ON p.author_id = u.id WHERE p.id = ?`,
    )
    .get(req.params.id) as Record<string, unknown> | undefined

  if (!post) throw new NotFoundError('帖子不存在')

  const comments = db
    .prepare(
      `SELECT c.*, u.display_name as author_name, u.role as author_role
      FROM comments c JOIN users u ON c.author_id = u.id
      WHERE c.post_id = ?
      ORDER BY c.created_at`,
    )
    .all(req.params.id)

  ok(res, { ...post, comments })
})

// POST /api/posts
router.post('/', requirePermission('posts.write'), validate(createPostSchema), (req: Request, res: Response) => {
  const db = getDb()
  const { title, content, author_id, tags } = req.body
  const result = db
    .prepare(`INSERT INTO posts (title, content, author_id, tags) VALUES (?, ?, ?, ?)`)
    .run(title, content, author_id ?? req.user?.id, tags)
  ok(res, { id: result.lastInsertRowid, ...req.body })
})

// POST /api/posts/:id/like
router.post('/:id/like', requirePermission('posts.read'), (req: Request, res: Response) => {
  const db = getDb()
  const userId = req.user?.id
  if (!userId) {
    fail(res, 401, 'AUTH_ERROR', '未登录')
    return
  }

  const postId = Number(req.params.id)
  const existing = db
    .prepare('SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?')
    .get(postId, userId)

  if (existing) {
    db.prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?').run(postId, userId)
    db.prepare('UPDATE posts SET likes = MAX(0, likes - 1) WHERE id = ?').run(postId)
  } else {
    db.prepare('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)').run(postId, userId)
    db.prepare('UPDATE posts SET likes = likes + 1 WHERE id = ?').run(postId)
  }

  const post = db
    .prepare('SELECT likes FROM posts WHERE id = ?')
    .get(postId) as { likes: number } | undefined
  ok(res, { likes: post?.likes ?? 0, liked: !existing })
})

// DELETE /api/posts/:id
router.delete('/:id', requirePermission('posts.delete'), (req: Request, res: Response) => {
  const db = getDb()
  db.prepare('DELETE FROM post_likes WHERE post_id = ?').run(req.params.id)
  db.prepare('DELETE FROM comments WHERE post_id = ?').run(req.params.id)
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id)
  ok(res, { success: true })
})

// DELETE /api/posts/comments/:id
router.delete('/comments/:id', requirePermission('posts.delete'), (req: Request, res: Response) => {
  const db = getDb()
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id)
  ok(res, { success: true })
})

// POST /api/posts/:id/comments
router.post('/:id/comments', requirePermission('posts.comment'), validate(createCommentSchema), (req: Request, res: Response) => {
  const db = getDb()
  const { author_id, content } = req.body
  const result = db
    .prepare(`INSERT INTO comments (post_id, author_id, content) VALUES (?, ?, ?)`)
    .run(req.params.id, author_id ?? req.user?.id, content)
  ok(res, { id: result.lastInsertRowid })
})

export default router
