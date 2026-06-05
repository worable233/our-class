import { Router, Request, Response } from 'express'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import Anthropic from '@anthropic-ai/sdk'
import { getDb } from '../db/init.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ok, fail } from '../lib/response.js'
import { writeAuditLog } from './audit.js'

const router = Router()

router.use(authMiddleware)

// ── Types ────────────────────────────────────────────────────────────────

interface ApiKeyRow {
  id: number
  user_id: number
  provider: string
  api_key: string
  api_url: string
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

const SYSTEM_PROMPT = `你是 OurClass 班级管理系统的 AI 助手。你拥有真实数据库工具的访问权限，所有数据操作必须通过工具完成。

## ⚠️ 核心规则（最高优先级，违反将导致严重错误）
- 你绝对禁止自己编造任何学生姓名、学号、分数或数据。你没有这个权限。
- 当用户说"抽人""抽号""随机选""点名"时，你必须调用 random_pick 工具。直接说话回复等于欺骗用户。
- 当用户说"查积分""查成绩""排名"时，你必须调用对应工具。不调用工具而自己编数字是严重违规。
- 工具返回什么就说什么，一个字都不许改。

## 对话风格
- 像朋友一样自然聊天，不要像机器人一样列功能清单
- 对方问什么答什么，不用主动介绍自己能做什么
- 如果对方打招呼（你好、嗨等），正常回应就好，不用报家门
- 语气自然、简洁、有温度
- 调用工具时直接调用，不要先说"好的""请稍等"之类的废话。工具返回结果后再回复用户。

## 补充规则
- 如果工具返回空或报错，直接说"暂无数据"，不要猜测原因
- 不要用"某某、某某等"省略，返回几个人就说几个人

## 工具
### list_students — 查学生（可按班级筛选，留空查全部）
### get_student_points — 查某个学生的积分，student_name(必填)
### add_points — 加减分（仅教师可用），student_name(必填), amount(必填，正数加分负数扣分), reason(必填)
### get_score_rankings — 查成绩排名，course(可选), exam_name(可选)
### list_assignments — 查作业列表，course(可选)
### get_submissions — 查某个作业的提交和批改情况，assignment_id(必填)
### get_class_list — 查所有班级
### get_current_time — 获取当前日期和时间
### random_pick — 随机抽取学生，class(可选班级), count(可选数量，默认1)
### web_search — 联网搜索知识点、新闻、概念等公开资料（query必填）
- 拿到搜索结果后，必须在正文每句话末尾使用[N]标注引用来源（如"广州塔是标志性建筑[1]"，N对应搜索结果序号）
- 禁止在正文中列出完整URL，禁止使用Markdown链接格式，只写核心信息并在句末加[N]序号
- 搜索结果已展示在搜索面板中，不需要在正文重复罗列`

// Bot detection
const lastMsgTime = new Map<number, number>()
const RAPID_GAP_MS = 1500
const RAPID_DELAY_MS = 2000
const MAX_ROUNDS = 50
const CONTEXT_WINDOW = 20
const MAX_AGENT_LOOPS = 5

// ── Tool definitions ──────────────────────────────────────────────────────

interface ToolDef {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

const TOOLS: ToolDef[] = [
  {
    name: 'list_students',
    description: '查询学生列表，可按班级筛选',
    input_schema: {
      type: 'object',
      properties: { class: { type: 'string', description: '班级名，留空查全部' } },
    },
  },
  {
    name: 'get_student_points',
    description: '查询某个学生的积分汇总和明细',
    input_schema: {
      type: 'object',
      properties: { student_name: { type: 'string', description: '学生姓名' } },
      required: ['student_name'],
    },
  },
  {
    name: 'add_points',
    description: '给学生加分或扣分',
    input_schema: {
      type: 'object',
      properties: {
        student_name: { type: 'string', description: '学生姓名' },
        amount: { type: 'integer', description: '正数为加分，负数为扣分' },
        reason: { type: 'string', description: '原因' },
      },
      required: ['student_name', 'amount', 'reason'],
    },
  },
  {
    name: 'get_score_rankings',
    description: '查询某科目或某次考试的成绩排名',
    input_schema: {
      type: 'object',
      properties: {
        course: { type: 'string', description: '科目，如数学、英语' },
        exam_name: { type: 'string', description: '考试名，如期中考试' },
      },
    },
  },
  {
    name: 'list_assignments',
    description: '查询作业列表',
    input_schema: {
      type: 'object',
      properties: { course: { type: 'string', description: '科目，留空查全部' } },
    },
  },
  {
    name: 'get_submissions',
    description: '查询某个作业的提交情况',
    input_schema: {
      type: 'object',
      properties: { assignment_id: { type: 'integer', description: '作业ID' } },
      required: ['assignment_id'],
    },
  },
  {
    name: 'get_class_list',
    description: '查询所有班级',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_weather',
    description: '查询指定城市的天气。如果用户没有指定城市，使用已配置的默认城市。',
    input_schema: {
      type: 'object',
      properties: { city: { type: 'string', description: '城市名，如"北京"。留空则使用已配置的默认城市' } },
    },
  },
  {
    name: 'get_current_time',
    description: '获取当前日期和时间。当用户问"今天几号""现在几点""今天周几"时使用。',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'web_search',
    description: '联网搜索获取实时信息。当用户问最新新闻、近期事件、不确认的知识时使用。query参数尽量用完整关键词（如"OPC 一人公司 2026 趋势"而非"OPC"）以提高搜索精度。',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: '搜索关键词' } },
      required: ['query'],
    },
  },
  {
    name: 'random_pick',
    description: '随机抽取学生姓名，用于课堂点名、抽答问题、抽选等场景。可以指定班级和抽取人数。',
    input_schema: {
      type: 'object',
      properties: {
        class: { type: 'string', description: '班级名，如"高三(2)班"。留空则从全部学生中随机抽取' },
        count: { type: 'integer', description: '抽取人数，默认为1。上限为20人' },
      },
    },
  },
]

// ── Tool execution ────────────────────────────────────────────────────────

async function executeTool(name: string, input: Record<string, unknown>, userId: number, userRole: string): Promise<string> {
  const db = getDb()

  switch (name) {
    case 'list_students': {
      const cls = input.class as string | undefined
      const rows = cls
        ? db.prepare("SELECT id, display_name, class FROM users WHERE role='student' AND class=? ORDER BY id LIMIT 50").all(cls)
        : db.prepare("SELECT id, display_name, class FROM users WHERE role='student' ORDER BY id LIMIT 50").all()
      if (rows.length === 0) return JSON.stringify({ error: '暂无学生数据' })
      return JSON.stringify({ total: rows.length, students: rows })
    }

    case 'get_student_points': {
      const name = input.student_name as string
      const student = db.prepare("SELECT id, display_name, class FROM users WHERE display_name=? AND role='student'").get(name) as any
      if (!student) return JSON.stringify({ error: `未找到学生「${name}」` })
      const summary = db.prepare(`
        SELECT COALESCE(SUM(CASE WHEN type='add' THEN amount ELSE 0 END),0) as total_added,
               COALESCE(SUM(CASE WHEN type='deduct' THEN amount ELSE 0 END),0) as total_deducted,
               COALESCE(SUM(CASE WHEN type='add' THEN amount ELSE -amount END),0) as total
        FROM point_records WHERE student_id=?`,
      ).get(student.id)
      const records = db.prepare(
        "SELECT reason, type, amount, date FROM point_records WHERE student_id=? ORDER BY id DESC LIMIT 20"
      ).all(student.id)
      return JSON.stringify({ student: { name: student.display_name, class: student.class }, summary, recent: records })
    }

    case 'add_points': {
      // Only teachers can modify points
      if (userRole !== 'teacher') return JSON.stringify({ error: '仅教师可以加减分' })
      const student = db.prepare("SELECT id FROM users WHERE display_name=? AND role='student'").get(input.student_name as string) as any
      if (!student) return JSON.stringify({ error: `未找到学生「${input.student_name}」` })
      const amount = input.amount as number
      // Sanity cap: ±100 per operation
      if (Math.abs(amount) > 100) return JSON.stringify({ error: '单次加减分不能超过 100' })
      const type = amount >= 0 ? 'add' : 'deduct'
      const absAmt = Math.abs(amount)
      db.prepare('INSERT INTO point_records (student_id, reason, type, amount, created_by, date) VALUES (?,?,?,?,?,?)')
        .run(student.id, input.reason, type, absAmt, userId, new Date().toISOString().split('T')[0])
      return JSON.stringify({ success: true, message: `已为「${input.student_name}」${type === 'add' ? '加' : '扣'}${absAmt}分，原因：${input.reason}` })
    }

    case 'get_score_rankings': {
      const course = input.course as string | undefined
      const exam = input.exam_name as string | undefined
      let sql = `SELECT s.student_id, u.display_name as student_name, u.class, s.score, s.exam_name, s.course
        FROM scores s JOIN users u ON s.student_id = u.id WHERE 1=1`
      const params: any[] = []
      if (course) { sql += ' AND s.course=?'; params.push(course) }
      if (exam) { sql += ' AND s.exam_name=?'; params.push(exam) }
      sql += ' ORDER BY s.score DESC LIMIT 50'
      const rows = db.prepare(sql).all(...params) as any[]
      if (rows.length === 0) return JSON.stringify({ error: '暂无成绩数据' })
      return JSON.stringify(rows.map((r: any, i: number) => ({ rank: i + 1, name: r.student_name, class: r.class, score: r.score, exam: r.exam_name, course: r.course })))
    }

    case 'list_assignments': {
      const course = input.course as string | undefined
      const rows = course
        ? db.prepare('SELECT id, title, course, due_date FROM assignments WHERE course=? ORDER BY due_date LIMIT 50').all(course)
        : db.prepare('SELECT id, title, course, due_date FROM assignments ORDER BY due_date LIMIT 50').all()
      if (rows.length === 0) return JSON.stringify({ error: '暂无作业' })
      return JSON.stringify({ total: rows.length, assignments: rows })
    }

    case 'get_submissions': {
      const aid = input.assignment_id as number
      const rows = db.prepare(`
        SELECT u.display_name as student_name, u.class, s.status, s.score
        FROM submissions s JOIN users u ON s.student_id = u.id WHERE s.assignment_id=? ORDER BY s.id LIMIT 100
      `).all(aid)
      if (rows.length === 0) return JSON.stringify({ error: '暂无提交记录' })
      return JSON.stringify({ total: rows.length, submissions: rows })
    }

    case 'get_class_list': {
      const rows = db.prepare("SELECT DISTINCT class FROM users WHERE role='student' AND class!='' ORDER BY class").all()
      return JSON.stringify(rows.map((r: any) => r.class))
    }

    case 'get_weather': {
      const city = (input.city as string) || ''
      const cfg = db.prepare('SELECT city FROM api_keys WHERE user_id=? AND is_active=1').get(userId) as any
      const targetCity = city || cfg?.city || ''
      const params = targetCity ? `?city=${encodeURIComponent(targetCity)}&extended=true` : '?extended=true'
      try {
        const res = await fetch(`https://uapis.cn/api/v1/misc/weather${params}`)
        if (!res.ok) return JSON.stringify({ error: '天气查询失败' })
        const data = await res.json() as any
        return JSON.stringify({
          city: data.city || targetCity || '自动定位',
          weather: data.weather || data.text,
          temp: data.temp,
          feels_like: data.feels_like,
          humidity: data.humidity,
          wind: data.wind,
          update_time: data.update_time,
        })
      } catch (e: any) {
        return JSON.stringify({ error: `天气查询失败: ${e.message}` })
      }
    }

    case 'get_current_time': {
      const now = new Date()
      return JSON.stringify({
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().split(' ')[0],
        weekday: ['周日','周一','周二','周三','周四','周五','周六'][now.getDay()],
        iso: now.toISOString(),
      })
    }

    case 'random_pick': {
      const cls = input.class as string | undefined
      const count = Math.max(1, Math.min((input.count as number) || 1, 20))
      let rows: any[]
      if (cls) {
        rows = db.prepare("SELECT display_name, class FROM users WHERE role='student' AND class=? ORDER BY id").all(cls)
        if (rows.length === 0) {
          const allClasses = db.prepare("SELECT DISTINCT class FROM users WHERE role='student' AND class!=''").all() as any[]
          const classList = allClasses.map((r: any) => r.class).join('、')
          return JSON.stringify({ error: `没有找到班级「${cls}」。可选班级：${classList || '暂无'}。请让用户确认班级名，或不传 class 参数从全部学生中抽取。` })
        }
      } else {
        rows = db.prepare("SELECT display_name, class FROM users WHERE role='student' ORDER BY id").all()
      }
      if (rows.length === 0) return JSON.stringify({ error: '暂无学生数据' })
      // Fisher-Yates shuffle
      const shuffled = [...rows]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      const picked = shuffled.slice(0, Math.min(count, shuffled.length))
      return JSON.stringify({
        candidates: rows.map((r: any) => r.display_name),
        result: picked.map((r: any) => r.display_name),
        class: cls || rows[0]?.class || '全部',
        count: picked.length,
      })
    }

    case 'web_search': {
      const query = input.query as string
      if (!query?.trim()) return JSON.stringify({ error: '请输入搜索关键词' })
      try {
        const res = await fetch('https://uapis.cn/api/v1/search/aggregate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, count: (input.count as number) || 5 }),
        })
        if (res.ok) {
          const data = await res.json() as any
          const items = (data.results || data.data || []).slice(0, 5).map((r: any) => ({
            title: r.title || '',
            url: r.url || '',
            snippet: (r.snippet || r.description || '').slice(0, 300),
          }))
          if (items.length > 0) return JSON.stringify(items)
        }
      } catch {}
      return JSON.stringify({ error: '搜索不可用' })
    }

    default:
      return JSON.stringify({ error: `未知工具: ${name}` })
  }
}

// ── Card builder: generates rich card data from tool results ────────────

function buildCard(name: string, input: Record<string, unknown>, result: string): Record<string, unknown> | null {
  const data = JSON.parse(result)
  if (data.error) return null

  switch (name) {
    case 'get_score_rankings': {
      const rows = data as any[]
      if (!Array.isArray(rows) || rows.length === 0) return null
      return {
        type: 'score_ranking',
        title: `成绩排名`,
        subtitle: [input.course, input.exam_name].filter(Boolean).join(' · ') || '全部',
        headers: ['#', '姓名', '班级', '分数', '考试'],
        rows: rows.slice(0, 10).map((r: any) => [String(r.rank), r.student_name, r.class, String(r.score), r.exam_name]),
      }
    }

    case 'list_students': {
      const rows = data?.students as any[]
      if (!Array.isArray(rows) || rows.length === 0) return null
      return {
        type: 'student_list',
        title: input.class ? `${input.class} 学生` : '全部学生',
        subtitle: `共 ${rows.length} 人`,
        items: rows.map((r: any) => ({ name: r.display_name, class: r.class })),
      }
    }

    case 'get_student_points': {
      const d = data as any
      if (!d.student) return null
      return {
        type: 'point_summary',
        title: `${d.student.name} 的积分`,
        subtitle: `${d.student.class}`,
        total: d.summary?.total || 0,
        added: d.summary?.total_added || 0,
        deducted: d.summary?.total_deducted || 0,
        recent: (d.recent || []).slice(0, 8).map((r: any) => ({
          reason: r.reason,
          type: r.type,
          amount: r.amount,
          date: r.date,
        })),
      }
    }

    case 'list_assignments': {
      const rows = data?.assignments as any[]
      if (!Array.isArray(rows) || rows.length === 0) return null
      return {
        type: 'assignment_list',
        title: input.course ? `${input.course} 作业` : '全部作业',
        subtitle: `共 ${rows.length} 项`,
        items: rows.map((r: any) => ({ id: r.id, title: r.title, course: r.course, due: r.due_date })),
      }
    }

    case 'get_submissions': {
      const rows = data?.submissions as any[]
      if (!Array.isArray(rows) || rows.length === 0) return null
      const graded = rows.filter((r: any) => r.status === 'graded').length
      return {
        type: 'submission_status',
        title: '作业提交情况',
        subtitle: `已批改 ${graded}/${rows.length}`,
        items: rows.map((r: any) => ({
          name: r.student_name,
          class: r.class,
          status: r.status,
          score: r.score,
          feedback: r.feedback,
        })),
      }
    }

    case 'get_class_list': {
      const classes = data as string[]
      if (!Array.isArray(classes) || classes.length === 0) return null
      return {
        type: 'class_list',
        title: '班级列表',
        subtitle: `共 ${classes.length} 个班`,
        items: classes,
      }
    }

    case 'random_pick': {
      const d = data as any
      if (!d.candidates || !Array.isArray(d.candidates) || d.candidates.length === 0) return null
      return {
        type: 'random_pick',
        title: '随机抽号',
        subtitle: d.class || '',
        candidates: d.candidates,
        result: d.result,
        count: d.count,
        note: d.note || null,
      }
    }

    default:
      return null
  }
}

// ── Agent loop (Anthropic) ────────────────────────────────────────────────

async function agentLoopAnthropic(
  anthropic: any, model: string, messages: any[], personalizedPrompt: string,
  res: Response, convId: number, db: any, newContent: string, userId: number, userRole: string, isContinue = false,
) {
  const loopMessages = [...messages]
  let fullResponse = ''
  let totalInput = 0
  let totalOutput = 0

  for (let i = 0; i < MAX_AGENT_LOOPS; i++) {
    let stream
    try {
      stream = await anthropic.messages.create({
        model, max_tokens: 4096, stream: true,
        messages: loopMessages,
        tools: TOOLS.map(t => ({
          name: t.name, description: t.description, input_schema: t.input_schema,
        })),
      })
    } catch (e: any) {
      const errMsg = '请求失败: ' + (e.message || '')
      res.write(`data: ${JSON.stringify({ type: 'error', content: errMsg })}\n\n`)
      fullResponse = errMsg
      break
    }

    // Collect blocks
    const blocks: { type: string; content: string; id: string; name: string; input: string }[] = []
    let curIdx = -1

    for await (const chunk of stream) {
      if (chunk.type === 'message_start' && chunk.message?.usage) {
        totalInput += chunk.message.usage.input_tokens || 0
      }
      if (chunk.type === 'message_delta' && chunk.usage) {
        totalOutput += chunk.usage.output_tokens || 0
      }

      // New block starting
      if (chunk.type === 'content_block_start') {
        curIdx++
        const cb = chunk.content_block
        if (cb.type === 'tool_use') {
          blocks.push({ type: 'tool_use', content: '', id: cb.id || '', name: cb.name || '', input: '' })
        } else {
          blocks.push({ type: 'text', content: cb.text || '', id: '', name: '', input: '' })
        }
        continue
      }

      // Delta within current block
      if (chunk.type === 'content_block_delta' && chunk.delta && curIdx >= 0) {
        const d = chunk.delta as any
        if (d.text_delta?.text) {
          blocks[curIdx].content += d.text_delta.text
        }
        if (d.input_json_delta?.partial_json) {
          blocks[curIdx].input += d.input_json_delta.partial_json
        }
      }
    }

    // Check for tool calls
    const toolCalls = blocks.filter(b => b.type === 'tool_use')
    const textParts = blocks.filter(b => b.type === 'text').map(b => b.content).join('')

    if (toolCalls.length > 0) {
      fullResponse += textParts

      // Build assistant content block for this turn
      const assistantContent: any[] = []
      if (textParts) assistantContent.push({ type: 'text', text: textParts })
      for (const tc of toolCalls) {
        let parsed: any = {}
        try { parsed = JSON.parse(tc.input || '{}') } catch {}
        assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: parsed })
      }
      loopMessages.push({ role: 'assistant', content: assistantContent })

      // Execute tools
      for (const tc of toolCalls) {
        let parsed: any = {}
        try { parsed = JSON.parse(tc.input || '{}') } catch {}

        const label = toolLabel(tc.name, parsed)
        res.write(`data: ${JSON.stringify({ type: 'tool_start', name: tc.name, label })}\n\n`)

        const result = await executeTool(tc.name, parsed, userId, userRole)

        // Save tool message (label + result) so it persists after refresh
        // web_search needs full results for search panel, others can be truncated
        const savedResult = tc.name === 'web_search' ? result : result.slice(0, 500)
        const toolContent: any = { label, result: savedResult }

        // Persist card data so it survives page refresh
        if (tc.name === 'random_pick') {
          const cardData = buildCard(tc.name, parsed, result)
          if (cardData) toolContent.card = cardData
        }

        db.prepare('INSERT INTO messages (conversation_id, role, content, tokens) VALUES (?,?,?,?)')
          .run(convId, 'tool', JSON.stringify(toolContent), 0)

        const summaryText = tc.name === 'web_search' ? formatSearchSummary(result) : result.slice(0, 800)
        res.write(`data: ${JSON.stringify({ type: 'tool_result', name: tc.name, summary: summaryText })}\n\n`)

        // Emit tool_card for visual card display
        if (tc.name === 'random_pick') {
          const cardData = buildCard(tc.name, parsed, result)
          if (cardData) {
            res.write(`data: ${JSON.stringify({ type: 'tool_card', card: cardData })}\n\n`)
          }
        }

        if (tc.name === 'web_search') {
          try {
            const parsed = JSON.parse(result)
            if (Array.isArray(parsed)) {
              res.write(`data: ${JSON.stringify({ type: 'search_results', results: parsed })}\n\n`)
            }
          } catch {}
        }

        loopMessages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: tc.id, content: result }],
        })
      }
    } else {
      // Final response — stream text now
      fullResponse += textParts
      if (textParts) {
        res.write(`data: ${JSON.stringify({ type: 'text', content: textParts })}\n\n`)
      }
      break
    }
  }

  // Save assistant response
  if (isContinue) {
    // Append to the last assistant message instead of creating a new one
    const last = db.prepare("SELECT id FROM messages WHERE conversation_id=? AND role='assistant' ORDER BY id DESC LIMIT 1").get(convId) as any
    if (last) db.prepare('UPDATE messages SET content = content || ? WHERE id = ?').run(fullResponse, last.id)
  } else {
    db.prepare('INSERT INTO messages (conversation_id, role, content, tokens) VALUES (?,?,?,?)')
      .run(convId, 'assistant', fullResponse || '(已处理)', (totalInput + totalOutput) || 0)
  }
  db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(convId)

  const msgCount = db.prepare('SELECT COUNT(*) as c FROM messages WHERE conversation_id=?').get(convId) as any
  if (msgCount.c <= 2) {
    const keyRec = db.prepare('SELECT * FROM api_keys WHERE user_id=? AND is_active=1').get(userId) as any
    generateTitle(keyRec, model, newContent, fullResponse).then(title => {
      if (title) db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(title, convId)
    })
  }

  res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
  res.end()
}

// ── Agent loop (OpenAI-compatible) ───────────────────────────────────────

async function agentLoopOpenAI(
  apiUrl: string, apiKey: string, model: string,
  contextHistory: MessageRow[], newContent: string,
  personalizedPrompt: string, res: Response, convId: number, db: any, userId: number, userRole: string, isContinue = false,
) {
  const base = (apiUrl || 'https://api.openai.com').replace(/\/+$/, '')
  const hasVersion = /\/v\d+$/.test(base)
  const url = hasVersion ? `${base}/chat/completions` : `${base}/v1/chat/completions`
  const isZhipu = apiUrl.includes('bigmodel')
  const authKey = isZhipu ? zhipuAuth(apiKey) : apiKey

  const tools = TOOLS.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }))

  // Filter out tool messages — they're UI decorations, not valid API message format
  const filteredHistory = contextHistory.filter(m => m.role !== 'tool')
  const loopMessages: any[] = [
    { role: 'system', content: personalizedPrompt },
    ...filteredHistory.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: newContent },
  ]

  let fullResponse = ''
  let totalTokens = 0

  for (let i = 0; i < MAX_AGENT_LOOPS; i++) {
    let data: any
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authKey}` },
        body: JSON.stringify({ model, max_tokens: 4096, messages: loopMessages, tools }),
      })
      data = await response.json()
      if (!response.ok) throw new Error((typeof data?.error === 'string' ? data.error : data?.error?.message) || `HTTP ${response.status}`)
    } catch (e: any) {
      const errMsg = '请求失败: ' + (e.message || '')
      res.write(`data: ${JSON.stringify({ type: 'error', content: errMsg })}\n\n`)
      fullResponse = errMsg
      break
    }

    totalTokens += data.usage?.total_tokens || 0
    const choice = data.choices?.[0]
    const msg = choice?.message

    if (msg?.tool_calls?.length) {
      // Add assistant message with tool calls
      loopMessages.push({
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.tool_calls.map((tc: any) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      })

      for (const tc of msg.tool_calls) {
        let parsed: any = {}
        try { parsed = JSON.parse(tc.function.arguments || '{}') } catch {}

        const label = toolLabel(tc.function.name, parsed)
        res.write(`data: ${JSON.stringify({ type: 'tool_start', name: tc.function.name, label })}\n\n`)

        const result = await executeTool(tc.function.name, parsed, userId, userRole)


        // Save tool message (label + result) to DB
        const savedResult2 = tc.function.name === 'web_search' ? result : result.slice(0, 500)
        const toolContent2: any = { label, result: savedResult2 }

        // Persist card data so it survives page refresh
        if (tc.function.name === 'random_pick') {
          const cardData2 = buildCard(tc.function.name, parsed, result)
          if (cardData2) toolContent2.card = cardData2
        }

        db.prepare('INSERT INTO messages (conversation_id, role, content, tokens) VALUES (?,?,?,?)')
          .run(convId, 'tool', JSON.stringify(toolContent2), 0)

        const summaryText2 = tc.function.name === 'web_search' ? formatSearchSummary(result) : result.slice(0, 800)
        res.write(`data: ${JSON.stringify({ type: 'tool_result', name: tc.function.name, summary: summaryText2 })}\n\n`)

        // Emit tool_card for visual card display
        if (tc.function.name === 'random_pick') {
          const cardData2 = buildCard(tc.function.name, parsed, result)
          if (cardData2) {
            res.write(`data: ${JSON.stringify({ type: 'tool_card', card: cardData2 })}\n\n`)
          }
        }

        if (tc.function.name === 'web_search') {
          try {
            const parsed = JSON.parse(result)
            if (Array.isArray(parsed)) {
              res.write(`data: ${JSON.stringify({ type: 'search_results', results: parsed })}\n\n`)
            }
          } catch {}
        }

        loopMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        })
      }

      // Some providers (Zhipu/GLM) return raw delta JSON in msg.content alongside tool_calls. Skip it.
      if (msg.content) {
        const trimmed = String(msg.content).trim()
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
          fullResponse += msg.content
        }
      }
    } else {
      // Final text response
      const text = msg?.content || ''
      fullResponse += text
      if (text) res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`)
      break
    }
  }

  if (isContinue) {
    const last = db.prepare("SELECT id FROM messages WHERE conversation_id=? AND role='assistant' ORDER BY id DESC LIMIT 1").get(convId) as any
    if (last) db.prepare('UPDATE messages SET content = content || ? WHERE id = ?').run(fullResponse, last.id)
  } else {
    db.prepare('INSERT INTO messages (conversation_id, role, content, tokens) VALUES (?,?,?,?)')
      .run(convId, 'assistant', fullResponse || '(已处理)', totalTokens || 0)
  }
  db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(convId)

  const msgCount = db.prepare('SELECT COUNT(*) as c FROM messages WHERE conversation_id=?').get(convId) as any
  if (msgCount.c <= 2) {
    const keyRec = db.prepare('SELECT * FROM api_keys WHERE user_id=? AND is_active=1').get(userId) as any
    generateTitle(keyRec, model, newContent, fullResponse).then(title => {
      if (title) db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(title, convId)
    })
  }
}

function formatSearchSummary(result: string): string {
  try {
    const items = JSON.parse(result)
    if (Array.isArray(items) && items.length > 0) {
      return `找到 ${items.length} 条搜索结果，已展示在搜索面板中`
    }
  } catch {}
  return result.slice(0, 200)
}

function toolLabel(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'list_students': return input.class ? `查询 ${input.class} 的学生` : '查询所有学生'
    case 'get_student_points': return `查询 ${input.student_name} 的积分`
    case 'add_points': return `为 ${input.student_name} ${(input.amount as number) >= 0 ? '加' : '扣'}${Math.abs(input.amount as number)}分`
    case 'get_score_rankings': return `查询 ${input.course || ''} ${input.exam_name || ''} 排名`.trim()
    case 'list_assignments': return input.course ? `查询 ${input.course} 作业` : '查询所有作业'
    case 'get_submissions': return `查询作业 #${input.assignment_id} 提交情况`
    case 'get_weather': return `查询${(input.city as string) || '默认城市'}天气`
    case 'get_current_time': return '获取当前时间'
    case 'get_class_list': return '查询班级列表'
    case 'random_pick': return input.class ? `从 ${input.class} 随机抽取` : '随机抽号'
    default: return `调用 ${name}`
  }
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return key.slice(0, 3) + '...' + key.slice(-4)
  return key.slice(0, 7) + '...' + key.slice(-4)
}

function buildMessages(history: MessageRow[], newContent: string, systemPrompt: string) {
  const messages: any[] = []
  messages.push({
    role: 'system',
    content: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
  })
  // Filter out tool messages — they're display-only, not valid Anthropic-format
  const filtered = history.filter(m => m.role !== 'tool')
  for (let i = 0; i < filtered.length; i++) {
    const msg: any = { role: filtered[i].role, content: [{ type: 'text', text: filtered[i].content }] }
    if (i < filtered.length - 2) msg.content[0].cache_control = { type: 'ephemeral' }
    messages.push(msg)
  }
  messages.push({ role: 'user', content: [{ type: 'text', text: newContent }] })
  return messages
}

async function generateTitle(
  keyRecord: ApiKeyRow, model: string, userMsg: string, aiMsg: string,
) {
  const provider = keyRecord.provider || 'anthropic'
  const apiUrl = keyRecord.api_url || ''

  try {
    if (provider === 'openai') {
      const base = (apiUrl || 'https://api.openai.com').replace(/\/+$/, '')
      const url = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keyRecord.api_key}` },
        body: JSON.stringify({
          model,
          max_tokens: 15,
          messages: [
            { role: 'system', content: '生成一个极短标题（10字以内），概括这段对话主题。只输出标题，不要引号、不要解释。' },
            { role: 'user', content: userMsg },
            { role: 'assistant', content: aiMsg.slice(0, 200) },
          ],
        }),
      })
      const data = await res.json() as any
      return data?.choices?.[0]?.message?.content?.trim() || null
    }

    // Anthropic
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const anthropic = new Anthropic({
      apiKey: keyRecord.api_key,
      ...(apiUrl ? { baseURL: apiUrl } : {}),
    })
    const result = await anthropic.messages.create({
      model,
      max_tokens: 15,
      system: '生成一个极短标题（10字以内），概括这段对话主题。只输出标题，不要引号、不要解释。',
      messages: [
        { role: 'user', content: userMsg },
        { role: 'assistant', content: aiMsg.slice(0, 200) },
      ],
    })
    const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
    return text.trim() || null
  } catch {
    return null
  }
}

function zhipuAuth(apiKey: string): string {
  if (!apiKey.includes('.')) return apiKey  // already a JWT or plain key
  const [id, secret] = apiKey.split('.')
  const payload = { api_key: id, exp: Math.floor(Date.now() / 1000) + 3600, timestamp: Date.now() }
  const token = jwt.sign(payload, secret, { algorithm: 'HS256', header: { alg: 'HS256', sign_type: 'SIGN' } })
  return token
}

function detectProvider(apiUrl: string, model: string): 'anthropic' | 'openai' {
  if (apiUrl) {
    const lower = apiUrl.toLowerCase()
    // OpenAI-compatible APIs
    if (lower.includes('openai.com') || lower.includes('deepseek') || lower.includes('bigmodel') || lower.includes('zhipu')) return 'openai'
    // URLs with /v1/ /v4/ path patterns are typically OpenAI-compatible
    if (/\/v\d+\//.test(lower)) return 'openai'
  }
  const m = model.toLowerCase()
  if (m.startsWith('gpt-') || m.includes('deepseek') || m.includes('glm')) return 'openai'
  return 'anthropic'
}

// ── Validation Schemas ───────────────────────────────────────────────────

const saveConfigSchema = z.object({
  api_key: z.string().optional(),
  api_url: z.string().optional(),
  model: z.string().optional(),
  provider: z.enum(['anthropic', 'openai']).optional(),
  search_api_url: z.string().optional(),
  search_api_key: z.string().optional(),
  city: z.string().optional(),
})

const createConversationSchema = z.object({
  title: z.string().optional(),
})

const chatMessageSchema = z.object({
  message: z.string().optional(),
  continue: z.boolean().optional(),
})

// ── OpenAI-compatible API helpers ────────────────────────────────────────

async function testOpenAI(apiUrl: string, apiKey: string, model: string) {
  const base = (apiUrl || 'https://api.openai.com').replace(/\/+$/, '')
  const hasVersion = /\/v\d+$/.test(base)
  const url = hasVersion ? `${base}/chat/completions` : `${base}/v1/chat/completions`
  const authKey = apiUrl.includes('bigmodel') ? zhipuAuth(apiKey) : apiKey

  const start = Date.now()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'Hi' }],
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    const err: any = new Error((typeof data?.error === 'string' ? data.error : data?.error?.message) || `HTTP ${res.status}`)
    err.status = res.status
    throw err
  }

  return {
    model: data.model || model,
    latency_ms: Date.now() - start,
    input_tokens: data.usage?.prompt_tokens || 0,
  }
}

async function streamOpenAI(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  res: Response,
) {
  const base = (apiUrl || 'https://api.openai.com').replace(/\/+$/, '')
  const hasVersion = /\/v\d+$/.test(base)
  const url = hasVersion ? `${base}/chat/completions` : `${base}/v1/chat/completions`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      stream: true,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
    }),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error((typeof data?.error === 'string' ? data.error : data?.error?.message) || `HTTP ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No stream')

  const decoder = new TextDecoder()
  let buffer = ''
  let fullResponse = ''
  let inputTokens = 0
  let outputTokens = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      if (trimmed === 'data: [DONE]') continue

      try {
        const json = JSON.parse(trimmed.slice(6))
        const choice = json.choices?.[0]
        const delta = choice?.delta
        if (delta?.content) {
          fullResponse += delta.content
          res.write(`data: ${JSON.stringify({ type: 'text', content: delta.content })}\n\n`)
        }
        if (json.usage) {
          inputTokens = json.usage.prompt_tokens || 0
          outputTokens = json.usage.completion_tokens || 0
        }
      } catch {}
    }
  }

  return { fullResponse, inputTokens, outputTokens }
}

// ── Routes ───────────────────────────────────────────────────────────────

router.get('/config', authMiddleware, (req: Request, res: Response) => {
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
    has_key: !!keyRecord.api_key,
    api_url: keyRecord.api_url || '',
    model: keyRecord.model,
    search_api_url: keyRecord.search_api_url || '',
    has_search_key: !!keyRecord.search_api_key,
    created_at: keyRecord.created_at,
  })
})

router.post(
  '/config',
  requirePermission('chat.config'),
  validate(saveConfigSchema),
  (req: Request, res: Response) => {
    const db = getDb()
    const { api_key, api_url, model, provider: explicitProvider, search_api_url, search_api_key } = req.body
    const provider = explicitProvider || detectProvider(api_url || '', model || '')
    const userId = req.user!.id

    const existing = db.prepare('SELECT * FROM api_keys WHERE user_id = ?').get(userId) as ApiKeyRow | undefined
    const finalKey = api_key || existing?.api_key || ''
    if (!finalKey) return fail(res, 400, 'NO_API_KEY', '请先输入 API Key')

    db.prepare('DELETE FROM api_keys WHERE user_id = ?').run(userId)
    db.prepare(
      'INSERT INTO api_keys (user_id, provider, api_key, api_url, model, search_api_url, search_api_key, city) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(userId, provider, finalKey, api_url || '', model || '', search_api_url || '', search_api_key || '')

    writeAuditLog(req.user!.id, req.user!.display_name, 'update_api_config', 'config', undefined, { provider, model: model || '' })
    ok(res, { message: 'API 配置已保存', provider })
  },
)

router.get('/conversations', authMiddleware, (req: Request, res: Response) => {
  const db = getDb()
  const conversations = db
    .prepare('SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC')
    .all(req.user!.id) as ConversationRow[]
  ok(res, conversations)
})

router.post(
  '/conversations',
  authMiddleware,
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

router.get('/conversations/:id', authMiddleware, (req: Request, res: Response) => {
  const db = getDb()
  const convId = Number(req.params.id)
  if (isNaN(convId)) return fail(res, 400, 'VALIDATION_ERROR', '无效的对话 ID')

  const conversation = db
    .prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?')
    .get(convId, req.user!.id) as ConversationRow | undefined
  if (!conversation) return fail(res, 404, 'NOT_FOUND', '对话不存在')

  const messages = db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC')
    .all(convId) as MessageRow[]
  ok(res, { conversation, messages })
})

router.delete('/conversations/:id', authMiddleware, (req: Request, res: Response) => {
  const db = getDb()
  const convId = Number(req.params.id)
  if (isNaN(convId)) return fail(res, 400, 'VALIDATION_ERROR', '无效的对话 ID')

  const conversation = db
    .prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?')
    .get(convId, req.user!.id) as ConversationRow | undefined
  if (!conversation) return fail(res, 404, 'NOT_FOUND', '对话不存在')

  db.prepare('DELETE FROM conversations WHERE id = ?').run(convId)
  ok(res, { message: '对话已删除' })
})

router.post(
  '/conversations/:id/chat',
  authMiddleware,
  validate(chatMessageSchema),
  async (req: Request, res: Response) => {
    const db = getDb()
    const convId = Number(req.params.id)
    if (isNaN(convId)) return fail(res, 400, 'VALIDATION_ERROR', '无效的对话 ID')

    const conversation = db
      .prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?')
      .get(convId, req.user!.id) as ConversationRow | undefined
    if (!conversation) return fail(res, 404, 'NOT_FOUND', '对话不存在')

    const keyRecord = db
      .prepare('SELECT * FROM api_keys WHERE user_id = ? AND is_active = 1')
      .get(req.user!.id) as ApiKeyRow | undefined
    if (!keyRecord) return fail(res, 400, 'NO_API_KEY', '请先配置 API Key')

    const history = db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC')
      .all(convId) as MessageRow[]

    // ── Protections ──────────────────────────────────────────────────────

    // 1. Round limit (50 exchanges = 100 messages)
    if (history.length >= MAX_ROUNDS * 2) {
      return fail(res, 400, 'ROUND_LIMIT', `对话已达 ${MAX_ROUNDS} 轮上限，请开启新对话`)
    }

    // 2. Bot detection: rapid-fire requests get delayed
    const now = Date.now()
    const last = lastMsgTime.get(req.user!.id) || 0
    lastMsgTime.set(req.user!.id, now)
    if (now - last < RAPID_GAP_MS && now - last > 0) {
      await new Promise(r => setTimeout(r, RAPID_DELAY_MS))
    }

    // 3. Progressive delay based on round count
    const rounds = Math.floor(history.length / 2)
    if (rounds > 10) {
      const delay = rounds <= 30
        ? (rounds - 10) * 1000
        : 20000 + (rounds - 30) * 3000
      await new Promise(r => setTimeout(r, Math.min(delay, 30000)))
    }

    // 4. Context window: only keep last N exchanges
    const contextHistory = history.slice(-CONTEXT_WINDOW * 2)

    const isContinue = req.body.continue === true
    const newContent = isContinue
      ? '请继续，直接从刚才中断的地方继续，不要重复已经写过的内容，不要做开场白，不要问候，直接从中断的句子或段落续写。'
      : (req.body.message || '')
    const provider = keyRecord.provider || 'anthropic'
    const model = keyRecord.model || 'claude-sonnet-4-20250514'
    const apiUrl = keyRecord.api_url || ''

    // Build personalized system prompt with user info (at end for cache optimization)
    const userInfo = `\n当前用户: ${req.user!.display_name}, 角色: ${req.user!.role === 'teacher' ? '教师' : '学生'}, 班级: ${req.user!.class || '无'}`
    const personalizedPrompt = SYSTEM_PROMPT + userInfo

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    // Save user message FIRST (skip for continue — AI instruction only, no visible message)
    if (!isContinue) {
      db.prepare('INSERT INTO messages (conversation_id, role, content, tokens) VALUES (?,?,?,?)')
        .run(convId, 'user', newContent, 0)
    }

    try {
      if (provider === 'openai') {
        await agentLoopOpenAI(apiUrl, keyRecord.api_key, model, contextHistory, newContent, personalizedPrompt, res, convId, db, req.user!.id, req.user!.role, isContinue)
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
        res.end()
      } else {
        // Anthropic with agent loop
        const messages = buildMessages(contextHistory, newContent, personalizedPrompt)
        const anthropic = new Anthropic({
          apiKey: keyRecord.api_key,
          ...(apiUrl ? { baseURL: apiUrl } : {}),
        })
        await agentLoopAnthropic(anthropic, model, messages, personalizedPrompt, res, convId, db, newContent, req.user!.id, req.user!.role, isContinue)
      }
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', content: err.message || '请求失败' })}\n\n`)
      res.end()
    }
  },
)

router.put('/conversations/:id/title', authMiddleware, (req: Request, res: Response) => {
  const db = getDb()
  const convId = Number(req.params.id)
  const { title } = req.body
  if (!title) return fail(res, 400, 'VALIDATION_ERROR', '标题不能为空')
  db.prepare('UPDATE conversations SET title = ? WHERE id = ? AND user_id = ?')
    .run(title, convId, req.user!.id)
  ok(res, { success: true })
})

// ── Test endpoint ────────────────────────────────────────────────────────

router.post('/test', requirePermission('chat.config'), async (req: Request, res: Response) => {
  const db = getDb()
  const keyRecord = db
    .prepare('SELECT * FROM api_keys WHERE user_id = ? AND is_active = 1')
    .get(req.user!.id) as ApiKeyRow | undefined

  if (!keyRecord) {
    return fail(res, 400, 'NO_API_KEY', '请先配置 API')
  }

  const provider = keyRecord.provider || 'anthropic'
  const model = keyRecord.model || 'claude-sonnet-4-20250514'
  const apiUrl = keyRecord.api_url || ''

  try {
    if (provider === 'openai') {
      const result = await testOpenAI(apiUrl, keyRecord.api_key, model)
      return ok(res, { success: true, ...result })
    }

    // Anthropic
    const anthropic = new Anthropic({
      apiKey: keyRecord.api_key,
      ...(apiUrl ? { baseURL: apiUrl } : {}),
    })

    const start = Date.now()
    const result = await anthropic.messages.create({
      model,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'Hi' }],
    })

    ok(res, {
      success: true,
      model: result.model,
      latency_ms: Date.now() - start,
      input_tokens: result.usage?.input_tokens || 0,
    })
  } catch (err: any) {
    console.error('Test API error:', err?.status, err?.message)
    const msg = err?.status
      ? `[${err.status}] ${err.message || '未知错误'}`
      : err.message || '连接失败'
    fail(res, 400, 'TEST_FAILED', msg)
  }
})

export default router
