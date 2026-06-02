import { Router, Request, Response } from 'express'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import { getDb } from '../db/init.js'
import { authMiddleware } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ok, fail } from '../lib/response.js'

const router = Router()

// All chat routes require authentication
router.use(authMiddleware)

// ── Types ────────────────────────────────────────────────────────────────

interface ApiKeyRow {
  id: number
  user_id: number
  provider: string
  api_key: string
  model: string
  is_active: number
  created_at: string
}

interface ConversationRow {
  id: number
  user_id: number
  title: string
  model: string
  created_at: string
  updated_at: string
}

interface MessageRow {
  id: number
  conversation_id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  tokens: number
  created_at: string
}

// ── Helpers ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  '你是一个班级管理系统 OurClass 的智能助手，帮助教师和学生管理积分、成绩、作业等。请用中文回答，简洁准确。'

function maskApiKey(key: string): string {
  if (key.length <= 8) return key.slice(0, 3) + '...' + key.slice(-4)
  return key.slice(0, 7) + '...' + key.slice(-4)
}

function buildMessages(history: MessageRow[], newContent: string) {
  const messages: any[] = []

  // System prompt - always cached (block 1)
  messages.push({
    role: 'system',
    content: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
  })

  // History messages - cache oldest batches but not the last 2
  // Strategy: cache system + oldest continuous block to maximize cache hits
  // while staying within the 4-block cache_control limit
  for (let i = 0; i < history.length; i++) {
    const msg: any = {
      role: history[i].role,
      content: [{ type: 'text', text: history[i].content }],
    }
    if (i < history.length - 2) {
      msg.content[0].cache_control = { type: 'ephemeral' }
    }
    messages.push(msg)
  }

  // Latest user message - never cached
  messages.push({
    role: 'user',
    content: [{ type: 'text', text: newContent }],
  })

  return messages
}

// ── Validation Schemas ───────────────────────────────────────────────────

const saveConfigSchema = z.object({
  api_key: z.string().min(1, '请输入 API Key'),
  model: z.string().optional(),
})

const createConversationSchema = z.object({
  title: z.string().optional(),
})

const chatMessageSchema = z.object({
  message: z.string().min(1, '请输入消息'),
})

// ── Routes ───────────────────────────────────────────────────────────────

/**
 * GET /api/chat/config
 * Returns the user's active API config with masked key, or null if not configured.
 */
router.get('/config', (req: Request, res: Response) => {
  const db = getDb()
  const keyRecord = db
    .prepare('SELECT * FROM api_keys WHERE user_id = ? AND is_active = 1')
    .get(req.user!.id) as ApiKeyRow | undefined

  if (!keyRecord) {
    return ok(res, null)
  }

  ok(res, {
    id: keyRecord.id,
    provider: keyRecord.provider,
    api_key: maskApiKey(keyRecord.api_key),
    model: keyRecord.model,
    created_at: keyRecord.created_at,
  })
})

/**
 * POST /api/chat/config
 * Save or update API key and model. Teacher role only.
 */
router.post(
  '/config',
  validate(saveConfigSchema),
  (req: Request, res: Response) => {
    if (req.user?.role !== 'teacher') {
      return fail(res, 403, 'FORBIDDEN', '只有教师可以配置 API')
    }

    const db = getDb()
    const { api_key, model } = req.body

    db.prepare(
      `INSERT INTO api_keys (user_id, provider, api_key, model)
       VALUES (?, 'anthropic', ?, ?)
       ON CONFLICT(user_id, provider)
       DO UPDATE SET api_key = excluded.api_key, model = excluded.model`,
    ).run(req.user!.id, api_key, model || 'claude-sonnet-4-20250514')

    ok(res, { message: 'API 配置已保存' })
  },
)

/**
 * GET /api/chat/conversations
 * List all conversations for the current user, ordered by most recent.
 */
router.get('/conversations', (req: Request, res: Response) => {
  const db = getDb()
  const conversations = db
    .prepare(
      'SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC',
    )
    .all(req.user!.id) as ConversationRow[]

  ok(res, conversations)
})

/**
 * POST /api/chat/conversations
 * Create a new conversation.
 */
router.post(
  '/conversations',
  validate(createConversationSchema),
  (req: Request, res: Response) => {
    const db = getDb()
    const title = req.body.title || '新对话'

    const result = db
      .prepare('INSERT INTO conversations (user_id, title) VALUES (?, ?)')
      .run(req.user!.id, title)

    const conversation = db
      .prepare('SELECT * FROM conversations WHERE id = ?')
      .get(result.lastInsertRowid) as ConversationRow

    ok(res, conversation)
  },
)

/**
 * GET /api/chat/conversations/:id
 * Get a conversation with all its messages (verifies ownership).
 */
router.get('/conversations/:id', (req: Request, res: Response) => {
  const db = getDb()
  const convId = Number(req.params.id)

  if (isNaN(convId)) {
    return fail(res, 400, 'VALIDATION_ERROR', '无效的对话 ID')
  }

  const conversation = db
    .prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?')
    .get(convId, req.user!.id) as ConversationRow | undefined

  if (!conversation) {
    return fail(res, 404, 'NOT_FOUND', '对话不存在')
  }

  const messages = db
    .prepare(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC',
    )
    .all(convId) as MessageRow[]

  ok(res, { conversation, messages })
})

/**
 * DELETE /api/chat/conversations/:id
 * Delete a conversation and its messages (verifies ownership).
 * Messages are deleted via ON DELETE CASCADE.
 */
router.delete('/conversations/:id', (req: Request, res: Response) => {
  const db = getDb()
  const convId = Number(req.params.id)

  if (isNaN(convId)) {
    return fail(res, 400, 'VALIDATION_ERROR', '无效的对话 ID')
  }

  const conversation = db
    .prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?')
    .get(convId, req.user!.id) as ConversationRow | undefined

  if (!conversation) {
    return fail(res, 404, 'NOT_FOUND', '对话不存在')
  }

  db.prepare('DELETE FROM conversations WHERE id = ?').run(convId)

  ok(res, { message: '对话已删除' })
})

/**
 * POST /api/chat/conversations/:id/chat
 * Send a message to the AI assistant and stream the response via SSE.
 *
 * This route:
 * 1. Verifies conversation ownership
 * 2. Loads the user's saved API key
 * 3. Retrieves all prior messages as context
 * 4. Calls the Anthropic API with prompt caching enabled
 * 5. Streams each text delta as an SSE event
 * 6. Saves both the user message and the complete assistant response to DB
 */
router.post(
  '/conversations/:id/chat',
  validate(chatMessageSchema),
  async (req: Request, res: Response) => {
    const db = getDb()
    const convId = Number(req.params.id)

    if (isNaN(convId)) {
      return fail(res, 400, 'VALIDATION_ERROR', '无效的对话 ID')
    }

    // ── Verify conversation belongs to user ──
    const conversation = db
      .prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?')
      .get(convId, req.user!.id) as ConversationRow | undefined

    if (!conversation) {
      return fail(res, 404, 'NOT_FOUND', '对话不存在')
    }

    // ── Get user's API key ──
    const keyRecord = db
      .prepare('SELECT * FROM api_keys WHERE user_id = ? AND is_active = 1')
      .get(req.user!.id) as ApiKeyRow | undefined

    if (!keyRecord) {
      return fail(res, 400, 'NO_API_KEY', '请先配置 API Key')
    }

    // ── Load previous messages as context ──
    const history = db
      .prepare(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC',
      )
      .all(convId) as MessageRow[]

    // ── Build Anthropic messages with prompt caching ──
    const newContent = req.body.message
    const builtMessages = buildMessages(history, newContent)

    // ── Set up SSE response headers ──
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    // ── Call Anthropic API and stream response ──
    const anthropic = new Anthropic({ apiKey: keyRecord.api_key })

    let fullResponse = ''
    let inputTokens = 0
    let outputTokens = 0

    try {
      const stream = await anthropic.messages.create({
        model: keyRecord.model || 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        stream: true,
        messages: builtMessages,
      })

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta && 'text' in chunk.delta && typeof chunk.delta.text === 'string') {
          fullResponse += chunk.delta.text
          res.write(
            `data: ${JSON.stringify({ type: 'text', content: chunk.delta.text })}\n\n`,
          )
        }

        if (chunk.type === 'message_start' && chunk.message?.usage) {
          inputTokens = chunk.message.usage.input_tokens || 0
          outputTokens = chunk.message.usage.output_tokens || 0
          res.write(
            `data: ${JSON.stringify({
              type: 'usage',
              input_tokens: inputTokens,
              output_tokens: outputTokens,
            })}\n\n`,
          )
        }

        if (chunk.type === 'message_delta' && chunk.usage) {
          outputTokens = chunk.usage.output_tokens || 0
          res.write(
            `data: ${JSON.stringify({
              type: 'usage',
              output_tokens: outputTokens,
            })}\n\n`,
          )
        }
      }

      // ── Persist messages to database ──
      db.prepare(
        'INSERT INTO messages (conversation_id, role, content, tokens) VALUES (?, ?, ?, ?)',
      ).run(convId, 'user', newContent, inputTokens || 0)

      db.prepare(
        'INSERT INTO messages (conversation_id, role, content, tokens) VALUES (?, ?, ?, ?)',
      ).run(convId, 'assistant', fullResponse, outputTokens || 0)

      db.prepare(
        'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ).run(convId)

      // ── Signal completion ──
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
      res.end()
    } catch (err: any) {
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          content: err.message || '请求失败',
        })}\n\n`,
      )
      res.end()
    }
  },
)

export default router
