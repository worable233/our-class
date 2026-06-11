import { Router, Request, Response } from 'express'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import Anthropic from '@anthropic-ai/sdk'
import { existsSync, unlinkSync, readdirSync, rmdirSync, statSync, mkdirSync } from 'fs'
import { join, extname, basename, dirname as pathDirname } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { getDb } from '../db/init.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ok, fail } from '../lib/response.js'
import { writeAuditLog } from './audit.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = join(__dirname, '..', '..', 'storage')

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
### list_students — 查学生（可按班级筛选，也可按姓名列表批量查）
### get_student_points — 查某个学生的积分，student_name(必填)
### add_points — 加减分（仅教师可用），student_name(必填), amount(必填，正数加分负数扣分), reason(必填)
### get_score_rankings — 查成绩排名，course(可选), exam_name(可选)
### list_assignments — 查作业列表，course(可选)
### get_submissions — 查某个作业的提交和批改情况，assignment_id(必填)
### get_class_list — 查所有班级
### get_current_time — 获取当前日期和时间
### get_point_details — 查询积分明细，可按学生姓名和日期范围筛选
### random_pick — 随机抽取学生，class(可选班级), count(可选数量，默认1)
### manage_roles — 管理权限组（创建/更新/删除/查询/分配），仅管理员可用
### web_search — 联网搜索知识点、新闻、概念等公开资料（query必填）
- 拿到搜索结果后，必须在正文每句话末尾使用[N]标注引用来源（如"广州塔是标志性建筑[1]"，N对应搜索结果序号）
- 禁止在正文中列出完整URL，禁止使用Markdown链接格式，只写核心信息并在句末加[N]序号
- 搜索结果已展示在搜索面板中，不需要在正文重复罗列
### search_articles — 搜索已保存的公众号文章（query必填），返回匹配的文章标题和内容摘要
### get_weather — 查询指定城市的天气，city(可选，留空使用默认城市)
### view_file — 查看用户上传的文件内容。用户上传文件后调用此工具读取内容。支持 .txt/.md/.pdf/.docx/.xlsx 等格式
### create_students — 批量创建新学生账号（支持同时创建多人）。仅教师可用。students(必填，学生列表)
### update_student — 修改学生信息（姓名/班级/密码）。仅教师可用。student_id(必填)
### delete_students — 批量删除学生账号。confirm(必填true)确认，student_ids(必填)学生ID列表。仅教师可用，不可撤销
### update_self_profile — 修改自己的个人资料（头像和昵称）。avatar_url(可选)头像URL，nickname(可选)显示昵称
### browse_files — 浏览用户网盘中的文件和目录。像 ls/cd 一样操作，path(可选)目录路径，留空查看根目录`

// Bot detection
const lastMsgTime = new Map<number, number>()

// 从数据库读取限制配置
function getLimits() {
  try {
    const db = getDb()
    const row = db.prepare('SELECT max_rounds, context_window, max_agent_loops, rapid_gap_ms, rapid_delay_ms FROM rate_limits WHERE id = 1').get() as any
    if (row) return row
  } catch {}
  return { max_rounds: 50, context_window: 20, max_agent_loops: 5, rapid_gap_ms: 1500, rapid_delay_ms: 2000 }
}

// ── Tool definitions ──────────────────────────────────────────────────────

interface ToolDef {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

const TOOLS: ToolDef[] = [
  {
    name: 'list_students',
    description: '查询学生列表，可按班级筛选，也可按姓名列表批量查询',
    input_schema: {
      type: 'object',
      properties: {
        class: { type: 'string', description: '班级名，如高三(2)班。留空查全部' },
        names: { type: 'array', items: { type: 'string' }, description: '学生姓名列表，如["张三","李四"]。按姓名批量查询' },
      },
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
    name: 'search_articles',
    description: '搜索已保存的公众号文章。按关键词检索文章标题和正文内容，返回匹配的文章列表。',
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
  {
    name: 'view_file',
    description: '查看用户上传的文件内容。用户发送文件后，使用此工具查看文件的具体内容。只能查看当前对话中的文件。',
    input_schema: {
      type: 'object',
      properties: {
        file_id: { type: 'integer', description: '文件 ID，用户发送消息时会附带文件 ID' },
      },
      required: ['file_id'],
    },
  },
  {
    name: 'create_students',
    description: '批量创建新学生账号（支持同时创建多人）。仅教师可用。创建时若班级为空则默认为操作者所在班级。',
    input_schema: {
      type: 'object',
      properties: {
        students: {
          type: 'array',
          description: '要创建的学生列表',
          items: {
            type: 'object',
            properties: {
              username: { type: 'string', description: '登录用户名（唯一，小写英文字母）' },
              display_name: { type: 'string', description: '显示姓名（中文真实姓名）' },
              class: { type: 'string', description: '班级名，如高三(2)班。不填则使用操作者所在班级' },
              password: { type: 'string', description: '登录密码，留空默认为 123456' },
            },
            required: ['username', 'display_name'],
          },
        },
      },
      required: ['students'],
    },
  },
  {
    name: 'update_student',
    description: '修改学生信息，如修改姓名、班级等。仅教师可用。',
    input_schema: {
      type: 'object',
      properties: {
        student_id: { type: 'integer', description: '学生 ID' },
        display_name: { type: 'string', description: '新的显示姓名' },
        class: { type: 'string', description: '新的班级' },
        password: { type: 'string', description: '新的登录密码' },
      },
      required: ['student_id'],
    },
  },
  {
    name: 'delete_students',
    description: '批量删除学生账号（支持同时删除多人）及相关所有数据。仅教师可用，操作不可撤销。',
    input_schema: {
      type: 'object',
      properties: {
        student_ids: { type: 'array', items: { type: 'integer' }, description: '要删除的学生 ID 列表，如[1,2,3]' },
        confirm: { type: 'boolean', description: '确认删除，必须设为 true 才会执行' },
      },
      required: ['student_ids', 'confirm'],
    },
  },
  {
    name: 'manage_roles',
    description: '管理权限组（身份组和职位）。创建班长等职位时需要指定 parent_id 和 class；创建身份组需要 roles.manage + classes.view_all 权限。',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'create', 'update', 'delete', 'assign'], description: '操作类型：list=查询, create=创建, update=更新, delete=删除, assign=分配给用户' },
        group_id: { type: 'integer', description: '权限组 ID（update/delete/assign 时需要）' },
        name: { type: 'string', description: '权限组名称（create/update 时需要）' },
        description: { type: 'string', description: '权限组描述（create/update 时可选）' },
        permissions: { type: 'array', items: { type: 'string' }, description: '权限 code 列表（create/update 时可选）' },
        user_ids: { type: 'array', items: { type: 'integer' }, description: '要分配的用户 ID 列表（assign 时需要）' },
        parent_id: { type: 'integer', description: '父身份组 ID（创建职位时必填，表示继承哪个身份组的权限）' },
        class: { type: 'string', description: '班级名称（创建/更新职位时必填，如"高三(1)班"）' },
        group_type: { type: 'string', enum: ['admin', 'teacher', 'student', 'custom'], description: '权限组类型（创建身份组时可选，默认 custom）' },
        assign_role_id: { type: 'boolean', description: 'assign 时是否设置职位（role_id）而非身份（group_id），默认 false' },
      },
      required: ['action'],
    },
  },
  {
    name: 'get_point_details',
    description: '查询学生的积分加减明细记录，可按日期范围筛选。返回每条记录的学生姓名、分值、原因、日期。',
    input_schema: {
      type: 'object',
      properties: {
        student_name: { type: 'string', description: '学生姓名（可选，留空查全部学生）' },
        start_date: { type: 'string', description: '起始日期，格式 YYYY-MM-DD（可选）' },
        end_date: { type: 'string', description: '结束日期，格式 YYYY-MM-DD（可选）' },
      },
    },
  },
  {
    name: 'update_self_profile',
    description: '修改自己的个人资料（头像和昵称）。头像需要用用户已上传的图片 URL，昵称可随意设置。只能修改自己的，改不了别人。',
    input_schema: {
      type: 'object',
      properties: {
        avatar_url: { type: 'string', description: '新头像图片的 URL（用户上传图片后得到的地址，可选）' },
        nickname: { type: 'string', description: '新的显示昵称（可选）' },
      },
    },
  },
  {
    name: 'browse_files',
    description: '浏览用户网盘中的文件和目录。像 ls/cd 一样操作，列出目录内容。只能访问当前用户自己的文件，无法访问别人的。返回文件列表含名称、大小、修改时间、类型。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '目录路径。相对于用户网盘根目录，留空或 "/" 查看根目录。示例："/upload/", "/文档/"' },
        show_hidden: { type: 'boolean', description: '是否显示隐藏文件（以 . 开头的文件），默认 false' },
      },
    },
  },
]

// ── Tool execution ────────────────────────────────────────────────────────

// Tool -> permission code mapping (grouped permissions)
const TOOL_PERM_MAP: Record<string, string> = {
  'list_students': 'tool.student.read',
  'get_student_points': 'tool.student.read',
  'create_students': 'tool.student.write',
  'update_student': 'tool.student.write',
  'delete_students': 'tool.student.write',
  'get_score_rankings': 'tool.score.read',
  'get_point_details': 'tool.score.read',
  'add_points': 'tool.score.write',
  'list_assignments': 'tool.assignment',
  'get_submissions': 'tool.assignment',
  'get_weather': 'tool.utility',
  'web_search': 'tool.utility',
  'random_pick': 'tool.utility',
  'get_current_time': 'tool.utility',
  'get_class_list': 'tool.utility',
  'view_file': 'tool.utility',
  'manage_roles': 'roles.manage',
  'search_articles': 'tool.article',
}

/** 获取权限范围内的班级 SQL 条件（空字符串表示无限制） */
function getClassFilter(userClass: string, userPermissions: string[]): { sql: string; params: string[] } {
  if (userPermissions.includes('classes.view_all')) return { sql: '', params: [] }
  const classes = userClass.split(',').filter(Boolean).map(c => c.trim())
  if (classes.length === 0) return { sql: '', params: [] }
  return { sql: `AND class IN (${classes.map(() => '?').join(',')})`, params: classes }
}

async function executeTool(name: string, input: Record<string, unknown>, userId: number, userRole: string, userPermissions: string[] = [], userClass: string = ''): Promise<string> {
  const db = getDb()

  // Check tool permission（不在 TOOL_PERM_MAP 的工具默认允许所有人使用）
  const toolPerm = TOOL_PERM_MAP[name]
  if (toolPerm && !userPermissions.includes(toolPerm)) {
    return JSON.stringify({ error: `您没有权限使用「${name}」工具` })
  }

  // Look up current user name for audit logging
  const curUser = db.prepare('SELECT display_name FROM users WHERE id = ?').get(userId) as any
  const userName = curUser?.display_name || ''

  // Load tool config for max_result_length (全局，所有用户共享)
  const config = db.prepare('SELECT config_json, max_result_length FROM tool_configs WHERE tool_name = ? ORDER BY id ASC LIMIT 1').get(name) as any
  const configData = config ? JSON.parse(config.config_json || '{}') : {}

  switch (name) {
    case 'list_students': {
      const cls = input.class as string | undefined
      const names = input.names as string[] | undefined
      const cf = getClassFilter(userClass, userPermissions)
      const studentGroupSub = "(SELECT id FROM permission_groups WHERE group_type = 'student' LIMIT 1)"
      let sql = `SELECT id, display_name, class FROM users WHERE group_id = ${studentGroupSub}`
      const params: string[] = []
      if (names && names.length > 0) {
        const placeholders = names.map(() => '?').join(',')
        sql += ` AND display_name IN (${placeholders})`
        params.push(...names)
      }
      if (cls) { sql += ' AND class=?'; params.push(cls) }
      else if (cf.sql) { sql += ' ' + cf.sql; params.push(...cf.params) }
      sql += ' ORDER BY id LIMIT 50'
      const rows = db.prepare(sql).all(...params)
      if (rows.length === 0) return JSON.stringify({ error: '暂无学生数据' })
      return JSON.stringify({ total: rows.length, students: rows })
    }

    case 'get_student_points': {
      const name = input.student_name as string
      const cf = getClassFilter(userClass, userPermissions)
      let stuSql = `SELECT id, display_name, class FROM users WHERE display_name=? AND group_id = (SELECT id FROM permission_groups WHERE group_type = 'student' LIMIT 1)`
      if (cf.sql) stuSql += ' ' + cf.sql
      const student = db.prepare(stuSql).get(name, ...cf.params) as any
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
      const cf = getClassFilter(userClass, userPermissions)
      let stuSql = `SELECT id FROM users WHERE display_name=? AND group_id = (SELECT id FROM permission_groups WHERE group_type = 'student' LIMIT 1)`
      if (cf.sql) stuSql += ' ' + cf.sql
      const student = db.prepare(stuSql).get(input.student_name as string, ...cf.params) as any
      if (!student) return JSON.stringify({ error: `未找到学生「${input.student_name}」` })
      const amount = input.amount as number
      // Sanity cap: ±100 per operation
      if (Math.abs(amount) > 100) return JSON.stringify({ error: '单次加减分不能超过 100' })
      const type = amount >= 0 ? 'add' : 'deduct'
      const absAmt = Math.abs(amount)
      db.prepare('INSERT INTO point_records (student_id, reason, type, amount, created_by, date) VALUES (?,?,?,?,?,?)')
        .run(student.id, input.reason, type, absAmt, userId, new Date().toISOString().split('T')[0])
      writeAuditLog(userId, userName, 'add_points', 'point_record', student.id, { student_name: input.student_name, amount, reason: input.reason })
      return JSON.stringify({ success: true, message: `已为「${input.student_name}」${type === 'add' ? '加' : '扣'}${absAmt}分，原因：${input.reason}` })
    }

    case 'get_score_rankings': {
      const course = input.course as string | undefined
      const exam = input.exam_name as string | undefined
      const cf = getClassFilter(userClass, userPermissions)
      let sql = `SELECT s.student_id, u.display_name as student_name, u.class, s.score, s.exam_name, s.course
        FROM scores s JOIN users u ON s.student_id = u.id WHERE 1=1`
      const params: any[] = []
      if (course) { sql += ' AND s.course=?'; params.push(course) }
      if (exam) { sql += ' AND s.exam_name=?'; params.push(exam) }
      if (cf.sql) { sql += ' ' + cf.sql; params.push(...cf.params) }
      sql += ' ORDER BY s.score DESC LIMIT 50'
      const rows = db.prepare(sql).all(...params) as any[]
      if (rows.length === 0) return JSON.stringify({ error: '暂无成绩数据' })
      return JSON.stringify(rows.map((r: any, i: number) => ({ rank: i + 1, name: r.student_name, class: r.class, score: r.score, exam: r.exam_name, course: r.course })))
    }

    case 'list_assignments': {
      const course = input.course as string | undefined
      const cf = getClassFilter(userClass, userPermissions)
      let sql = 'SELECT a.id, a.title, a.course, a.due_date FROM assignments a JOIN courses c ON a.course = c.name WHERE 1=1'
      const params: any[] = []
      if (course) { sql += ' AND a.course=?'; params.push(course) }
      if (cf.sql) {
        const cls = userClass.split(',').filter(Boolean).map(c => c.trim())
        sql += ` AND c.class IN (${cls.map(() => '?').join(',')})`
        params.push(...cls)
      }
      sql += ' ORDER BY a.due_date LIMIT 50'
      const rows = db.prepare(sql).all(...params)
      if (rows.length === 0) return JSON.stringify({ error: '暂无作业' })
      return JSON.stringify({ total: rows.length, assignments: rows })
    }

    case 'get_submissions': {
      const aid = input.assignment_id as number
      const cf = getClassFilter(userClass, userPermissions)
      let subSql = `SELECT u.display_name as student_name, u.class, s.status, s.score
        FROM submissions s JOIN users u ON s.student_id = u.id WHERE s.assignment_id=?`
      if (cf.sql) subSql += ' ' + cf.sql
      subSql += ' ORDER BY s.id LIMIT 100'
      const rows = db.prepare(subSql).all(aid, ...cf.params)
      if (rows.length === 0) return JSON.stringify({ error: '暂无提交记录' })
      return JSON.stringify({ total: rows.length, submissions: rows })
    }

    case 'get_class_list': {
      const cf = getClassFilter(userClass, userPermissions)
      let sql = 'SELECT name FROM classes ORDER BY name'
      if (cf.sql) {
        // classes 表没有 class 字段，改用 users 表获取用户有权限的班级
        sql = `SELECT DISTINCT u.class as name FROM users u WHERE u.class != '' AND u.class IS NOT NULL`
        if (userPermissions.includes('classes.view_all')) {
          sql = 'SELECT name FROM classes ORDER BY name'
        } else {
          sql += ` AND u.class IN (${cf.params.map(() => '?').join(',')})`
          sql += ' ORDER BY u.class'
        }
      }
      const rows = db.prepare(sql).all(...(cf.sql ? cf.params : [])) as any[]
      return JSON.stringify(rows.map(r => r.name))
    }

    case 'view_file': {
      const fileId = input.file_id as number
      const file = db.prepare('SELECT * FROM uploaded_files WHERE id = ?').get(fileId) as any
      if (!file) return JSON.stringify({ error: '文件不存在' })
      if (file.user_id !== userId) return JSON.stringify({ error: '无权访问该文件' })

      let filePath = join(__dirname, '..', '..', 'uploads', file.stored_path)
      if (!existsSync(filePath)) filePath = join(__dirname, '..', '..', 'storage', file.stored_path)
      if (!existsSync(filePath)) return JSON.stringify({ error: '文件已被删除' })

      const ext = extname(file.original_name).toLowerCase()
      const maxLen = config?.max_result_length || 5000
      const base = { file_name: file.original_name, file_size: file.file_size, mime_type: file.mime_type }

      // ── 文件类型限制检查 ──
      const allowedSetting = db.prepare('SELECT allowed_file_types FROM chat_settings WHERE user_id = ?').get(file.user_id) as any
      const allowedStr = allowedSetting?.allowed_file_types || ''
      if (allowedStr) {
        const allowedExts = allowedStr.split(',').map((s: string) => s.trim().toLowerCase())
        if (!allowedExts.includes(ext)) {
          return JSON.stringify({ error: `无法阅读此文件类型（${ext}）` })
        }
      }

      // ── 纯文本文件 ──
      const textExts = ['.txt', '.csv', '.md', '.json', '.xml', '.yaml', '.yml', '.log', '.js', '.ts', '.py', '.html', '.css', '.sql', '.sh', '.env', '.ini', '.cfg', '.conf', '.bat', '.ps1']
      if (textExts.includes(ext)) {
        const fs = await import('fs/promises')
        const content = await fs.readFile(filePath, 'utf-8')
        const truncated = content.length > maxLen ? content.slice(0, maxLen) + `\n\n...（文件过长，仅显示前 ${maxLen} 字符）` : content
        return JSON.stringify({ ...base, content: truncated })
      }

      // ── Word (.docx) ──
      if (ext === '.docx') {
        try {
          const mammoth = await import('mammoth')
          const result = await mammoth.extractRawText({ path: filePath })
          const text = result.value.trim()
          if (!text) return JSON.stringify({ ...base, note: '文档内容为空', content: '' })
          const truncated = text.length > maxLen ? text.slice(0, maxLen) + `\n\n...（文档过长，仅显示前 ${maxLen} 字符）` : text
          return JSON.stringify({
            ...base,
            format: 'word',
            content: truncated,
            paragraphs: result.messages.filter((m: any) => m.type === 'warning').length,
          })
        } catch (e: any) {
          return JSON.stringify({ ...base, error: `无法解析 Word 文档: ${e.message}` })
        }
      }

      // ── Excel (.xlsx) ──
      if (ext === '.xlsx' || ext === '.xls') {
        try {
          const XLSX = await import('xlsx')
          const workbook = XLSX.readFile(filePath)
          const sheets = workbook.SheetNames
          const allTables: string[] = []
          for (const sheetName of sheets) {
            const sheet = workbook.Sheets[sheetName]
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
            if (jsonData.length === 0) continue
            // Build markdown table
            const rows = jsonData.slice(0, 200) // max 200 rows per sheet
            const cols = rows[0] || []
            const sep = `| ${cols.map(() => '---').join(' | ')} |`
            const mdRows = rows.map((row: any[]) =>
              `| ${cols.map((_: any, ci: number) => String(row[ci] ?? '').replace(/\n/g, ' ')).join(' | ')} |`,
            )
            mdRows.splice(1, 0, sep) // insert separator after header
            allTables.push(`## Sheet: ${sheetName}\n\n${mdRows.join('\n')}`)
            if (sheets.length > 4) break // max 4 sheets
          }
          if (allTables.length === 0) return JSON.stringify({ ...base, note: '表格内容为空', content: '' })
          let content = allTables.join('\n\n')
          if (content.length > maxLen) content = content.slice(0, maxLen) + `\n\n...（表格过长，仅显示前 ${maxLen} 字符）`
          return JSON.stringify({
            ...base,
            format: 'excel',
            sheets: sheets.slice(0, 4),
            content,
            total_sheets: sheets.length,
          })
        } catch (e: any) {
          return JSON.stringify({ ...base, error: `无法解析 Excel 文件: ${e.message}` })
        }
      }

      // ── PDF ──
      if (ext === '.pdf') {
        try {
          const fs = await import('fs/promises')
          const pdfParse = await import('pdf-parse')
          const buf = await fs.readFile(filePath)
          const data = await pdfParse.default(buf)
          const text = data.text.trim()
          if (!text) return JSON.stringify({ ...base, note: 'PDF 内容为空（可能为扫描件）', content: '' })
          const truncated = text.length > maxLen ? text.slice(0, maxLen) + `\n\n...（PDF 过长，仅显示前 ${maxLen} 字符）` : text
          return JSON.stringify({
            ...base,
            format: 'pdf',
            content: truncated,
            pages: data.numpages,
          })
        } catch (e: any) {
          return JSON.stringify({ ...base, error: `无法解析 PDF 文件: ${e.message}` })
        }
      }

      // ── 图片 → 发给 AI 视觉阅读 ──
      const imgExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']
      if (imgExts.includes(ext)) {
        return JSON.stringify({
          _image: true,
          text: `用户上传了图片：${file.original_name}（${(file.file_size / 1024).toFixed(1)}KB）`,
          file_path: file.stored_path,
          mime_type: file.mime_type || `image/${ext.replace('.', '')}`,
          file_name: file.original_name,
        })
      }

      // ── 其他 ──
      return JSON.stringify({
        ...base,
        note: `用户上传了文件：${file.original_name}（${(file.file_size / 1024).toFixed(1)}KB），类型：${file.mime_type || ext || '未知'}。`,
      })
    }

    case 'get_weather': {
      const city = (input.city as string) || ''
      const targetCity = city || (configData as any)?.default_city || ''
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
      const studentGroupSql = "group_id = (SELECT id FROM permission_groups WHERE group_type = 'student' LIMIT 1)"
      let rows: any[]
      if (cls) {
        // 校验班级权限
        if (!userPermissions.includes('classes.view_all')) {
          const myClasses = userClass.split(',').filter(Boolean).map(c => c.trim())
          if (!myClasses.includes(cls)) return JSON.stringify({ error: `无权在班级「${cls}」抽取` })
        }
        rows = db.prepare(`SELECT display_name, class FROM users WHERE ${studentGroupSql} AND class=? ORDER BY id`).all(cls)
        if (rows.length === 0) {
          if (!userPermissions.includes('classes.view_all')) {
            return JSON.stringify({ error: `没有找到班级「${cls}」的学生，请确认班级名是否正确` })
          }
          const allClasses = db.prepare(`SELECT DISTINCT class FROM users WHERE ${studentGroupSql} AND class!=''`).all() as any[]
          const classList = allClasses.map((r: any) => r.class).join('、')
          return JSON.stringify({ error: `没有找到班级「${cls}」的学生。可选班级：${classList || '暂无'}。请让用户确认班级名。` })
        }
      } else {
        const cf = getClassFilter(userClass, userPermissions)
        let sql = `SELECT display_name, class FROM users WHERE ${studentGroupSql}`
        if (cf.sql) sql += ' ' + cf.sql
        sql += ' ORDER BY id'
        rows = db.prepare(sql).all(...cf.params)
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

    case 'search_articles': {
      const query = input.query as string
      if (!query?.trim()) return JSON.stringify({ error: '请输入搜索关键词' })
      const maxResults = (configData.max_results as number) || 5
      const rows = db.prepare(`
        SELECT id, title, author, created_at,
               substr(content_md, 1, 300) as snippet,
               LENGTH(content_md) as content_length
        FROM articles
        WHERE title LIKE ? OR content_md LIKE ?
        ORDER BY updated_at DESC
        LIMIT ?
      `).all(`%${query}%`, `%${query}%`, maxResults) as any[]
      if (rows.length === 0) return JSON.stringify({ message: '未找到相关文章' })
      return JSON.stringify(rows.map((r: any) => ({
        id: r.id,
        title: r.title,
        author: r.author,
        created_at: r.created_at,
        snippet: r.snippet,
        content_length: r.content_length,
      })))
    }

    case 'web_search': {
      const query = input.query as string
      if (!query?.trim()) return JSON.stringify({ error: '请输入搜索关键词' })
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 15000)
        const res = await fetch('https://uapis.cn/api/v1/search/aggregate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, count: (input.count as number) || 5 }),
          signal: ctrl.signal,
        })
        clearTimeout(timer)
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

    case 'create_students': {
      const students = input.students as any[] || []
      if (students.length === 0) return JSON.stringify({ error: '请提供要创建的学生列表' })
      const hasViewAll = userPermissions.includes('classes.view_all')
      const results: any[] = []
      for (const s of students) {
        const { username, display_name, class: stuClass, password } = s
        if (!username || !display_name) { results.push({ username, error: '用户名和姓名不能为空' }); continue }
        const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username)
        if (existing) { results.push({ username, error: `用户名「${username}」已存在` }); continue }
        const cls = stuClass || userClass
        if (!hasViewAll && cls && !userClass.split(',').map(c => c.trim()).includes(cls)) {
          results.push({ username, error: `无权在班级「${cls}」创建学生` }); continue
        }
        const studentNo = String(Date.now()).slice(-8) + String(Math.floor(Math.random() * 100)).padStart(2, '0')
        const result = db.prepare(
          'INSERT INTO users (username, display_name, role, class, password, group_id, student_no) VALUES (?,?,?,?,?,(SELECT id FROM permission_groups WHERE group_type = ?),?)'
        ).run(username, display_name, 'student', cls || '', password || studentNo, 'student', studentNo)
        writeAuditLog(userId, userName, 'create_student', 'user', result.lastInsertRowid, { username, display_name, class: cls })
        results.push({ success: true, id: result.lastInsertRowid, username, display_name, class: cls || '' })
      }
      return JSON.stringify({ total: students.length, created: results.filter((r: any) => r.success).length, results })
    }

    case 'update_student': {
      const updateId = input.student_id as number
      const cf = getClassFilter(userClass, userPermissions)
      let stuSql = "SELECT * FROM users WHERE id = ? AND group_id = (SELECT id FROM permission_groups WHERE group_type = 'student' LIMIT 1)"
      if (cf.sql) stuSql += ' ' + cf.sql
      const student = db.prepare(stuSql).get(updateId, ...cf.params) as any
      if (!student) return JSON.stringify({ error: `未找到 ID 为 ${updateId} 的学生` })
      const fields: string[] = []
      const params: any[] = []
      if (input.display_name) { fields.push('display_name = ?'); params.push(input.display_name) }
      if (input.class) { fields.push('class = ?'); params.push(input.class) }
      if (input.password) { fields.push('password = ?'); params.push(input.password) }
      if (fields.length > 0) {
        db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...params, updateId)
      }
      const updated = db.prepare("SELECT id, username, display_name, class FROM users WHERE id = ?").get(updateId)
      writeAuditLog(userId, userName, 'update_student', 'user', updateId, { display_name: input.display_name, class: input.class })
      return JSON.stringify({ success: true, student: updated, message: `已更新学生信息` })
    }

    case 'delete_students': {
      if (!input.confirm) return JSON.stringify({ error: '请将 confirm 设为 true 以确认删除操作' })
      const ids = input.student_ids as number[] || []
      if (ids.length === 0) return JSON.stringify({ error: '请提供要删除的学生 ID 列表' })
      const cf = getClassFilter(userClass, userPermissions)
      const results: any[] = []
      for (const id of ids) {
        let delSql = "SELECT id, display_name, class FROM users WHERE id = ? AND group_id = (SELECT id FROM permission_groups WHERE group_type = 'student' LIMIT 1)"
        if (cf.sql) delSql += ' ' + cf.sql
        const student = db.prepare(delSql).get(id, ...cf.params) as any
        if (!student) { results.push({ id, error: `未找到 ID 为 ${id} 的学生或无权操作` }); continue }
        // Cascade delete all related data
        db.prepare('DELETE FROM comments WHERE author_id = ?').run(id)
        db.prepare('DELETE FROM posts WHERE author_id = ?').run(id)
        db.prepare('DELETE FROM submissions WHERE student_id = ?').run(id)
        db.prepare('DELETE FROM scores WHERE student_id = ?').run(id)
        db.prepare('DELETE FROM point_records WHERE student_id = ?').run(id)
        db.prepare('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)').run(id)
        db.prepare('DELETE FROM conversations WHERE user_id = ?').run(id)
        db.prepare('DELETE FROM api_keys WHERE user_id = ?').run(id)
        db.prepare("DELETE FROM users WHERE id = ?").run(id)
        writeAuditLog(userId, userName, 'delete_student', 'user', id, { display_name: student.display_name, class: student.class })
        results.push({ id, success: true, display_name: student.display_name })
      }
      return JSON.stringify({ total: ids.length, deleted: results.filter((r: any) => r.success).length, results })
    }

    case 'update_self_profile': {
      const updates: string[] = []
      const params: any[] = []
      if (input.nickname !== undefined) {
        updates.push('nickname = ?')
        params.push(input.nickname as string)
      }
      if (input.avatar_url !== undefined) {
        updates.push('avatar = ?')
        params.push(input.avatar_url as string)
      }
      if (updates.length === 0) return JSON.stringify({ error: '请提供要修改的字段（昵称或头像）' })
      params.push(userId)
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params)
      const updated = db.prepare('SELECT display_name, nickname, avatar FROM users WHERE id = ?').get(userId) as any
      writeAuditLog(userId, userName, 'update_self_profile', 'user', userId, { nickname: input.nickname, avatar: input.avatar_url })
      const changes: string[] = []
      if (input.nickname !== undefined) changes.push(`昵称 → ${input.nickname}`)
      if (input.avatar_url !== undefined) changes.push('头像已更新')
      return JSON.stringify({ success: true, message: `已更新：${changes.join('，')}`, profile: { display_name: updated.display_name, nickname: updated.nickname, avatar: updated.avatar } })
    }

    case 'browse_files': {
      const browsePath = (input.path as string) || ''
      const showHidden = input.show_hidden === true
      const root = join(STORAGE_ROOT, `user_${userId}`)
      if (!existsSync(root)) mkdirSync(root, { recursive: true })
      const safe = browsePath.replace(/^\/+/, '').replace(/\\/g, '/')
      const dirPath = join(root, safe)
      if (!dirPath.startsWith(root + '/') && dirPath !== root) return JSON.stringify({ error: '路径越权' })
      if (!existsSync(dirPath)) return JSON.stringify({ error: `目录不存在：${browsePath || '/'}` })
      if (!statSync(dirPath).isDirectory()) return JSON.stringify({ error: '路径不是目录' })
      const items = readdirSync(dirPath)
        .filter(name => showHidden || !name.startsWith('.'))
        .map(name => {
          const fp = join(dirPath, name)
          const st = statSync(fp)
          const isDir = st.isDirectory()
          return {
            name,
            type: isDir ? 'dir' : 'file',
            size: isDir ? 0 : st.size,
            modified: st.mtime.toISOString(),
          }
        })
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
          return a.name.localeCompare(b.name, 'zh-CN')
        })
      const parent = safe ? pathDirname(safe).replace(/\\/g, '/') : null
      const parentDir = parent === '.' ? null : parent
      const usage = db.prepare('SELECT storage_used, storage_limit FROM user_storage WHERE user_id = ?').get(userId) as any
      return JSON.stringify({
        path: browsePath || '/',
        parent: parentDir,
        total: items.length,
        items,
        storage: usage ? { used: usage.storage_used, limit: usage.storage_limit } : undefined,
      })
    }

    case 'manage_roles': {
      const hasManage = userPermissions.includes('roles.manage')
      const hasViewAll = userPermissions.includes('classes.view_all')
      if (!hasManage) return JSON.stringify({ error: '您没有管理权限组的权限' })

      const action = input.action as string

      // ── Helper: 权限委托检查（只能授予自己拥有的权限） ──
      function checkDelegation(perms: string[]): string | null {
        for (const code of perms) {
          if (!userPermissions.includes(code)) return `您没有权限「${code}」，无法授予他人`
        }
        return null
      }

      // ── Helper: 验证权限码有效性 ──
      function validatePermCodes(perms: string[]): string | null {
        if (perms.length === 0) return null
        const validCodes = db.prepare('SELECT code FROM permissions').all() as any[]
        const validSet = new Set(validCodes.map(c => c.code))
        const invalid = perms.filter(code => !validSet.has(code))
        if (invalid.length > 0) return `无效的权限码: ${invalid.join(', ')}`
        return null
      }

      // ── Helper: 班级限制检查 ──
      function checkClassScope(targetClass: string): string | null {
        if (hasViewAll) return null
        const myClasses = userClass.split(',').filter(Boolean).map(c => c.trim())
        if (!myClasses.includes(targetClass)) return `您只能管理自己班级（${userClass}）的职位`
        return null
      }

      if (action === 'list') {
        let groups: any[]
        if (hasViewAll) {
          groups = db.prepare('SELECT * FROM permission_groups ORDER BY id').all() as any[]
        } else {
          // 无 view_all：返回所有身份组 + 自己班级的职位
          const myClasses = userClass.split(',').filter(Boolean).map(c => c.trim())
          if (myClasses.length > 0) {
            const placeholders = myClasses.map(() => '?').join(',')
            groups = db.prepare(`SELECT * FROM permission_groups WHERE parent_id IS NULL OR class IN (${placeholders}) ORDER BY id`).all(...myClasses) as any[]
          } else {
            groups = db.prepare('SELECT * FROM permission_groups WHERE parent_id IS NULL ORDER BY id').all() as any[]
          }
        }
        const result = groups.map((g: any) => {
          const perms = db.prepare('SELECT permission_code FROM group_permissions WHERE group_id = ?').all(g.id) as any[]
          return { ...g, permissions: perms.map((p: any) => p.permission_code) }
        })
        return JSON.stringify({ groups: result })
      }

      if (action === 'create') {
        const name = input.name as string
        const desc = (input.description as string) || ''
        const permissions = (input.permissions as string[]) || []
        const parentId = input.parent_id as number | undefined
        const cls = (input.class as string) || ''

        if (!name) return JSON.stringify({ error: '请提供权限组名称' })

        // 验证权限码有效性
        if (permissions.length > 0) {
          const permErr = validatePermCodes(permissions)
          if (permErr) return JSON.stringify({ error: permErr })
        }

        if (parentId) {
          // ── 创建职位（子权限组）──
          const parent = db.prepare('SELECT id, name FROM permission_groups WHERE id = ? AND parent_id IS NULL').get(parentId) as any
          if (!parent) return JSON.stringify({ error: '父身份组不存在' })
          if (!cls) return JSON.stringify({ error: '创建职位时必须指定班级' })
          const classErr = checkClassScope(cls)
          if (classErr) return JSON.stringify({ error: classErr })
          const permErr = checkDelegation(permissions)
          if (permErr) return JSON.stringify({ error: permErr })

          const result = db.prepare('INSERT INTO permission_groups (name, description, parent_id, class) VALUES (?,?,?,?)').run(name, desc, parentId, cls)
          const gid = result.lastInsertRowid
          const insert = db.prepare('INSERT INTO group_permissions (group_id, permission_code) VALUES (?,?)')
          for (const code of permissions) insert.run(gid, code)
          writeAuditLog(userId, userName, 'create_role', 'role', gid, { name, parent_id: parentId, class: cls, permissions })
          return JSON.stringify({ success: true, id: gid, name, parent: parent.name, class: cls, message: `职位「${name}」已创建，继承自「${parent.name}」` })
        } else {
          // ── 创建身份组 ──
          if (!hasViewAll) return JSON.stringify({ error: '创建身份组需要 classes.view_all 权限' })
          const groupType = (input.group_type as string) || 'custom'
          const dup = db.prepare('SELECT id FROM permission_groups WHERE name = ? AND parent_id IS NULL').get(name)
          if (dup) return JSON.stringify({ error: '身份组名称已存在' })

          const result = db.prepare('INSERT INTO permission_groups (name, description, group_type) VALUES (?,?,?)').run(name, desc, groupType)
          const gid = result.lastInsertRowid
          const insert = db.prepare('INSERT INTO group_permissions (group_id, permission_code) VALUES (?,?)')
          for (const code of permissions) insert.run(gid, code)
          writeAuditLog(userId, userName, 'create_identity', 'identity', gid, { name, group_type: groupType, permissions })
          return JSON.stringify({ success: true, id: gid, name, group_type: groupType, message: `身份组「${name}」已创建` })
        }
      }

      if (action === 'update') {
        const gid = input.group_id as number
        if (!gid) return JSON.stringify({ error: '请提供权限组 ID' })
        const existing = db.prepare('SELECT * FROM permission_groups WHERE id = ?').get(gid) as any
        if (!existing) return JSON.stringify({ error: '权限组不存在' })

        if (existing.parent_id) {
          // ── 更新职位 ──
          if (existing.class) {
            const classErr = checkClassScope(existing.class)
            if (classErr) return JSON.stringify({ error: classErr })
          }
          if (input.permissions) {
            const permErr = checkDelegation(input.permissions as string[])
            if (permErr) return JSON.stringify({ error: permErr })
          }
        } else {
          // ── 更新身份组 ──
          if (!hasViewAll) return JSON.stringify({ error: '更新身份组需要 classes.view_all 权限' })
        }

        // 验证权限码有效性
        if (input.permissions) {
          const permErr = validatePermCodes(input.permissions as string[])
          if (permErr) return JSON.stringify({ error: permErr })
        }

        if (input.name) db.prepare('UPDATE permission_groups SET name = ? WHERE id = ?').run(input.name, gid)
        if (input.description !== undefined) db.prepare('UPDATE permission_groups SET description = ? WHERE id = ?').run(input.description, gid)
        if (input.class !== undefined && existing.parent_id) {
          // 修改班级时需要对新值做权限检查
          const newClass = (input.class as string) || ''
          if (newClass) {
            const classErr = checkClassScope(newClass)
            if (classErr) return JSON.stringify({ error: classErr })
          }
          db.prepare('UPDATE permission_groups SET class = ? WHERE id = ?').run(newClass, gid)
        }
        if (input.permissions) {
          db.prepare('DELETE FROM group_permissions WHERE group_id = ?').run(gid)
          const insert = db.prepare('INSERT INTO group_permissions (group_id, permission_code) VALUES (?,?)')
          for (const code of input.permissions as string[]) insert.run(gid, code)
        }
        writeAuditLog(userId, userName, existing.parent_id ? 'update_role' : 'update_identity', existing.parent_id ? 'role' : 'identity', gid, { name: input.name, permissions: input.permissions })
        return JSON.stringify({ success: true, message: '权限组已更新' })
      }

      if (action === 'delete') {
        const gid = input.group_id as number
        if (!gid) return JSON.stringify({ error: '请提供权限组 ID' })
        const existing = db.prepare('SELECT * FROM permission_groups WHERE id = ?').get(gid) as any
        if (!existing) return JSON.stringify({ error: '权限组不存在' })

        if (existing.parent_id) {
          // ── 删除职位 ──
          if (existing.class) {
            const classErr = checkClassScope(existing.class)
            if (classErr) return JSON.stringify({ error: classErr })
          }
          db.prepare('UPDATE users SET role_id = NULL WHERE role_id = ?').run(gid)
        } else {
          // ── 删除身份组 ──
          if (!hasViewAll) return JSON.stringify({ error: '删除身份组需要 classes.view_all 权限' })
          if (existing.group_type === 'admin' || existing.group_type === 'student') return JSON.stringify({ error: '无法删除系统内置身份组' })
          // 级联删除子职位组
          const children = db.prepare('SELECT id FROM permission_groups WHERE parent_id = ?').all(gid) as any[]
          for (const child of children) {
            db.prepare('UPDATE users SET role_id = NULL WHERE role_id = ?').run(child.id)
            db.prepare('DELETE FROM group_permissions WHERE group_id = ?').run(child.id)
            db.prepare('DELETE FROM permission_groups WHERE id = ?').run(child.id)
          }
          db.prepare('UPDATE users SET group_id = NULL WHERE group_id = ?').run(gid)
          db.prepare('UPDATE users SET role_id = NULL WHERE role_id = ?').run(gid)
        }
        db.prepare('DELETE FROM permission_groups WHERE id = ?').run(gid)
        writeAuditLog(userId, userName, existing.parent_id ? 'delete_role' : 'delete_identity', existing.parent_id ? 'role' : 'identity', gid, {})
        return JSON.stringify({ success: true, message: '权限组已删除' })
      }

      if (action === 'assign') {
        const gid = input.group_id as number
        const userIds = input.user_ids as number[] || []
        const assignRoleId = input.assign_role_id === true
        if (!gid) return JSON.stringify({ error: '请提供权限组 ID' })
        if (userIds.length === 0) return JSON.stringify({ error: '请提供要分配的用户 ID 列表' })

        const group = db.prepare('SELECT id, parent_id, name FROM permission_groups WHERE id = ?').get(gid) as any
        if (!group) return JSON.stringify({ error: '权限组不存在' })

        // 验证：role_id 只能指向职位，group_id 只能指向身份组
        if (assignRoleId && !group.parent_id) return JSON.stringify({ error: 'assign_role_id=true 时只能分配职位（子权限组），不能分配身份组' })
        if (!assignRoleId && group.parent_id) return JSON.stringify({ error: 'assign_role_id=false（默认）时只能分配身份组，不能分配职位。如需分配职位请设置 assign_role_id: true' })

        // 职位分配需要班级限制检查
        if (assignRoleId && group.parent_id) {
          const roleGroup = db.prepare('SELECT class FROM permission_groups WHERE id = ?').get(gid) as any
          if (roleGroup?.class) {
            const classErr = checkClassScope(roleGroup.class)
            if (classErr) return JSON.stringify({ error: classErr })
          }
        }

        const column = assignRoleId ? 'role_id' : 'group_id'
        const results: any[] = []
        for (const uid of userIds) {
          const user = db.prepare('SELECT id, display_name FROM users WHERE id = ?').get(uid) as any
          if (!user) { results.push({ id: uid, error: '用户不存在' }); continue }
          db.prepare(`UPDATE users SET ${column} = ? WHERE id = ?`).run(gid, uid)
          results.push({ id: uid, display_name: user.display_name, success: true })
        }
        writeAuditLog(userId, userName, 'assign_role', 'role', gid, { column, user_ids: userIds, assigned: results.filter((r: any) => r.success).length })
        return JSON.stringify({ group: group.name, column, total: userIds.length, assigned: results.filter((r: any) => r.success).length, results })
      }

      return JSON.stringify({ error: '未知操作: ' + action })
    }

    case 'get_point_details': {
      const sname = input.student_name as string | undefined
      const startDate = input.start_date as string | undefined
      const endDate = input.end_date as string | undefined
      let sql = `SELECT p.id, u.display_name as student_name, u.class, p.reason, p.type, p.amount, p.date
        FROM point_records p JOIN users u ON p.student_id = u.id WHERE 1=1`
      const params: any[] = []
      if (sname) { sql += ' AND u.display_name=?'; params.push(sname) }
      if (startDate) { sql += ' AND p.date>=?'; params.push(startDate) }
      if (endDate) { sql += ' AND p.date<=?'; params.push(endDate) }
      // Class filter
      const cf = getClassFilter(userClass, userPermissions)
      if (cf.sql) { sql += ' ' + cf.sql; params.push(...cf.params) }
      sql += ' ORDER BY p.id DESC LIMIT 100'
      const rows = db.prepare(sql).all(...params) as any[]
      if (rows.length === 0) return JSON.stringify({ error: '暂无匹配的积分记录' })
      const summary = { total_added: rows.filter(r => r.type === 'add').reduce((s, r) => s + r.amount, 0), total_deducted: rows.filter(r => r.type === 'deduct').reduce((s, r) => s + r.amount, 0) }
      return JSON.stringify({ total: rows.length, summary, records: rows })
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
  res: Response, convId: number, db: any, newContent: string, userId: number, userRole: string,
  isContinue = false, thinking = false, webSearch = true, userPermissions: string[] = [], userClass = '',
) {
  const limits = getLimits()
  const loopMessages = [...messages]
  let fullResponse = ''
  let totalInput = 0
  let totalOutput = 0

  // Filter tools based on web_search
  const activeTools = webSearch ? [...TOOLS] : TOOLS.filter(t => t.name !== 'web_search')

  for (let i = 0; i < limits.max_agent_loops; i++) {
    let stream
    try {
      const apiParams: any = {
        model,
        max_tokens: thinking ? 32000 : 4096,
        stream: true,
        messages: loopMessages,
      }

      if (thinking) {
        apiParams.thinking = { type: 'enabled', budget_tokens: 16000 }
        // No tools when thinking mode — Anthropic API limitation
      } else if (activeTools.length > 0) {
        apiParams.tools = activeTools.map(t => ({
          name: t.name, description: t.description, input_schema: t.input_schema,
        }))
      }

      // Emit thinking indicator upfront when deep think is enabled
      if (thinking && i === 0) res.write(`data: ${JSON.stringify({ type: 'thinking_start' })}\n\n`)
      stream = await anthropic.messages.create(apiParams)
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
        } else if (cb.type === 'thinking') {
          blocks.push({ type: 'thinking', content: cb.thinking || '', id: '', name: '', input: '' })
          res.write(`data: ${JSON.stringify({ type: 'thinking_start' })}\n\n`)
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
        if (d.thinking_delta?.thinking) {
          blocks[curIdx].content += d.thinking_delta.thinking
          res.write(`data: ${JSON.stringify({ type: 'thinking', content: d.thinking_delta.thinking })}\n\n`)
        }
        if (d.input_json_delta?.partial_json) {
          blocks[curIdx].input += d.input_json_delta.partial_json
        }
      }
    }

    // Check for tool calls
    const toolCalls = blocks.filter(b => b.type === 'tool_use')
    const textParts = blocks.filter(b => b.type === 'text').map(b => b.content).join('')
    const thinkingParts = blocks.filter(b => b.type === 'thinking').map(b => b.content).join('')
    if (thinkingParts) {
      res.write(`data: ${JSON.stringify({ type: 'thinking_done' })}\n\n`)
    }

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

        let result: string
        try {
          result = await executeTool(tc.name, parsed, userId, userRole, userPermissions, userClass)
        } catch (e: any) {
          result = JSON.stringify({ error: `工具执行出错: ${e.message || e}` })
        }

        try {
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

          if (tc.name === 'web_search') {
            try {
              const parsed = JSON.parse(result)
              if (Array.isArray(parsed)) {
                res.write(`data: ${JSON.stringify({ type: 'search_results', results: parsed })}\n\n`)
              }
            } catch {}
          }

          // ── 图片工具结果：base64 编码后以 image block 发送 ──
          let resultContent: any = result
          try {
            const parsedResult = JSON.parse(result)
            if (parsedResult._image) {
              const imagePath = join(__dirname, '..', '..', 'uploads', parsedResult.file_path)
              if (existsSync(imagePath)) {
                const imgBuf = await import('fs/promises').then(m => m.readFile(imagePath))
                const b64 = imgBuf.toString('base64')
                resultContent = [
                  { type: 'text', text: parsedResult.text },
                  { type: 'image', source: { type: 'base64', media_type: parsedResult.mime_type, data: b64 } },
                ]
              }
            }
          } catch {}

          loopMessages.push({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: tc.id, content: resultContent }],
          })
        } catch (e: any) {
          res.write(`data: ${JSON.stringify({ type: 'error', content: `工具处理出错: ${e.message || e}` })}\n\n`)
        }
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

  // Emit thinking done after loop completes (if deep think was active)
  if (thinking) res.write(`data: ${JSON.stringify({ type: 'thinking_done' })}\n\n`)

  // If thinking/planning content was generated, persist it as JSON alongside the text
  if (thinkingParts) {
    fullResponse = JSON.stringify({ text: fullResponse, reasoning: thinkingParts })
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
    const keyRec = db.prepare('SELECT * FROM api_keys WHERE is_active = 1 ORDER BY id ASC LIMIT 1').get() as any
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
  personalizedPrompt: string, res: Response, convId: number, db: any, userId: number, userRole: string,
  isContinue = false, thinking = false, webSearch = true, userPermissions: string[] = [], userClass = '',
) {
  const limits = getLimits()
  const base = (apiUrl || 'https://api.openai.com').replace(/\/+$/, '')
  const hasVersion = /\/v\d+$/.test(base)
  const url = hasVersion ? `${base}/chat/completions` : `${base}/v1/chat/completions`
  const isZhipu = apiUrl.includes('bigmodel')
  const isMiMo = apiUrl.includes('xiaomimimo') || apiUrl.includes('mimo')
  const authKey = isZhipu ? zhipuAuth(apiKey) : apiKey

  const allTools = TOOLS.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }))
  const tools = webSearch ? allTools : allTools.filter((t: any) => t.function.name !== 'web_search')

  // Filter out tool messages — they're UI decorations, not valid API message format
  const filteredHistory = contextHistory.filter(m => m.role !== 'tool')
  const loopMessages: any[] = [
    { role: 'system', content: personalizedPrompt },
    ...filteredHistory.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: newContent },
  ]

  let fullResponse = ''
  let totalTokens = 0

  for (let i = 0; i < limits.max_agent_loops; i++) {
    let data: any
    try {
      // Emit thinking indicator upfront
      if (thinking && i === 0) res.write(`data: ${JSON.stringify({ type: 'thinking_start' })}\n\n`)

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authKey}` },
        body: JSON.stringify({
          model,
          max_completion_tokens: isMiMo ? 32768 : 4096,
          messages: loopMessages,
          tools,
          ...(thinking ? (isMiMo ? { thinking: { type: 'enabled' } } : {}) : {}),
        }),
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

        let result: string
        try {
          result = await executeTool(tc.function.name, parsed, userId, userRole, userPermissions, userClass)
        } catch (e: any) {
          result = JSON.stringify({ error: `工具执行出错: ${e.message || e}` })
        }


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

        // ── 图片工具结果：OpenAI 格式传 base64（部分模型支持） ──
        let toolResultContent: any = result
        try {
          const parsedResult = JSON.parse(result)
          if (parsedResult._image) {
            const imagePath = join(__dirname, '..', '..', 'uploads', parsedResult.file_path)
            if (existsSync(imagePath)) {
              toolResultContent = parsedResult.text
            }
          }
        } catch {}

        loopMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: toolResultContent,
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

      // Handle reasoning_content (DeepSeek R1 etc.) when available
      const reasoning = msg?.reasoning_content || ''
      if (reasoning && i === 0) {
        res.write(`data: ${JSON.stringify({ type: 'thinking', content: reasoning.slice(0, 500) })}\n\n`)
      }

      // Store reasoning alongside text for persistence
      fullResponse = reasoning ? JSON.stringify({ text, reasoning }) : text
      res.write(`data: ${JSON.stringify({ type: 'text', content: text || '' })}\n\n`)
      break
    }
  }

  // Emit thinking done after loop completes
  if (thinking) res.write(`data: ${JSON.stringify({ type: 'thinking_done' })}\n\n`)

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
    const keyRec = db.prepare('SELECT * FROM api_keys WHERE is_active = 1 ORDER BY id ASC LIMIT 1').get() as any
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
    case 'create_students': return `批量创建 ${(input.students as any[] || []).length} 名学生`
    case 'get_point_details': return '查询积分明细'
    case 'update_student': return `修改学生 #${input.student_id}`
    case 'delete_students': return `批量删除 ${(input.student_ids as number[] || []).length} 名学生`
    case 'update_self_profile': return '修改个人资料'
    case 'browse_files': return `浏览目录: ${(input.path as string) || '/'}`
    case 'manage_roles': return `管理权限组: ${input.action}`
    default: return `调用 ${name}`
  }
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return key.slice(0, 3) + '...' + key.slice(-4)
  return key.slice(0, 7) + '...' + key.slice(-4)
}

function extractMessageText(content: string): string {
  if (content.startsWith('{')) {
    try {
      const parsed = JSON.parse(content)
      // Handle both user messages with files and assistant messages with reasoning
      return parsed.text || parsed.content || content
    } catch {}
  }
  return content
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
    const text = extractMessageText(filtered[i].content)
    const msg: any = { role: filtered[i].role, content: [{ type: 'text', text }] }
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
      const authKey = apiUrl.includes('bigmodel') ? zhipuAuth(keyRecord.api_key) : keyRecord.api_key
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authKey}` },
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
    if (lower.includes('openai.com') || lower.includes('deepseek') || lower.includes('bigmodel') || lower.includes('zhipu') || lower.includes('xiaomimimo') || lower.includes('mimo')) return 'openai'
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
  thinking: z.boolean().optional(),
  web_search: z.boolean().optional(),
  file_ids: z.array(z.number()).optional(),
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
      'Authorization': `Bearer ${authKey}`,
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

router.get(
  '/config',
  requirePermission('chat.config'),
  (req: Request, res: Response) => {
    const db = getDb()
    const keyRecord = db
      .prepare('SELECT * FROM api_keys WHERE is_active = 1 ORDER BY id ASC LIMIT 1')
      .get() as ApiKeyRow | undefined

    if (!keyRecord) {
      return ok(res, null)
    }

    ok(res, {
      id: keyRecord.id,
      provider: keyRecord.provider,
      has_key: !!keyRecord.api_key,
      api_key: keyRecord.api_key ? maskApiKey(keyRecord.api_key) : '',
      api_url: keyRecord.api_url || '',
      model: keyRecord.model,
      search_api_url: keyRecord.search_api_url || '',
      has_search_key: !!keyRecord.search_api_key,
      created_at: keyRecord.created_at,
    })
  },
)

router.post(
  '/config',
  requirePermission('chat.config'),
  validate(saveConfigSchema),
  (req: Request, res: Response) => {
    const db = getDb()
    const { api_key, api_url, model, provider: explicitProvider, search_api_url, search_api_key } = req.body
    const provider = explicitProvider || detectProvider(api_url || '', model || '')
    const userId = req.user!.id

    const existing = db.prepare('SELECT * FROM api_keys ORDER BY id ASC LIMIT 1').get() as ApiKeyRow | undefined
    const finalKey = api_key || existing?.api_key || ''
    if (!finalKey) return fail(res, 400, 'NO_API_KEY', '请先输入 API Key')

    db.prepare('DELETE FROM api_keys').run()
    db.prepare(
      'INSERT INTO api_keys (user_id, provider, api_key, api_url, model, search_api_url, search_api_key) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(userId, provider, finalKey, api_url || '', model || '', search_api_url || '', search_api_key || '')

    writeAuditLog(req.user!.id, req.user!.display_name, 'update_api_config', 'config', undefined, { provider, model: model || '' })
    ok(res, { message: 'API 配置已保存', provider })
  },
)

router.get('/conversations', (req: Request, res: Response) => {
  const db = getDb()
  const conversations = db
    .prepare('SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC')
    .all(req.user!.id) as ConversationRow[]
  ok(res, conversations)
})

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

router.get('/conversations/:id', (req: Request, res: Response) => {
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

  // Enrich user messages with file metadata
  const allFileIds: number[] = []
  const fileIdToMsgIndex = new Map<number, number>()
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.role === 'user' && m.content.startsWith('{')) {
      try {
        const parsed = JSON.parse(m.content)
        if (Array.isArray(parsed.files)) {
          for (const fid of parsed.files) {
            allFileIds.push(fid)
            fileIdToMsgIndex.set(fid, i)
          }
        }
      } catch {}
    }
  }

  let fileMap: Record<number, any> = {}
  if (allFileIds.length > 0) {
    const placeholders = allFileIds.map(() => '?').join(',')
    const files = db.prepare(`SELECT id, original_name, stored_path, mime_type, file_size FROM uploaded_files WHERE id IN (${placeholders})`).all(...allFileIds) as any[]
    for (const f of files) {
      fileMap[f.id] = { id: f.id, name: f.original_name, url: `/uploads/${f.stored_path}`, mime_type: f.mime_type, size: f.file_size }
    }
  }

  // Extract reasoning_content from assistant messages for frontend display
  const reasoningMap: Record<number, string> = {}
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.role === 'assistant' && m.content.startsWith('{')) {
      try {
        const parsed = JSON.parse(m.content)
        if (parsed.reasoning) {
          reasoningMap[m.id] = parsed.reasoning
          messages[i].content = parsed.text || parsed.content || m.content
        }
      } catch {}
    }
  }

  ok(res, { conversation, messages, file_map: fileMap, reasoning_map: reasoningMap })
})

router.delete('/conversations/:id', (req: Request, res: Response) => {
  const db = getDb()
  const convId = Number(req.params.id)
  if (isNaN(convId)) return fail(res, 400, 'VALIDATION_ERROR', '无效的对话 ID')

  const conversation = db
    .prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?')
    .get(convId, req.user!.id) as ConversationRow | undefined
  if (!conversation) return fail(res, 404, 'NOT_FOUND', '对话不存在')

  // Clean up uploaded files (disk + DB)
  const files = db.prepare('SELECT * FROM uploaded_files WHERE conversation_id = ?').all(convId) as any[]
  const UPLOAD_ROOT = join(__dirname, '..', '..', 'uploads')
  for (const file of files) {
    try {
      const fpath = join(UPLOAD_ROOT, file.stored_path)
      if (existsSync(fpath)) unlinkSync(fpath)
    } catch {}
  }
  // Try to remove conversation directory
  try {
    const convDir = join(UPLOAD_ROOT, `conv_${convId}`)
    if (existsSync(convDir)) {
      const remaining = readdirSync(convDir)
      if (remaining.length === 0) rmdirSync(convDir)
    }
  } catch {}

  // FK CASCADE will delete uploaded_files records when conversation is deleted
  db.prepare('DELETE FROM conversations WHERE id = ?').run(convId)
  ok(res, { message: '对话已删除' })
})

router.post(
  '/conversations/:id/chat',
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
      .prepare('SELECT * FROM api_keys WHERE is_active = 1 ORDER BY id ASC LIMIT 1')
      .get() as ApiKeyRow | undefined
    if (!keyRecord) return fail(res, 400, 'NO_API_KEY', '请先配置 API Key')

    const history = db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC')
      .all(convId) as MessageRow[]

    // ── Protections ──────────────────────────────────────────────────────
    const userPerms = (req.user as any)?.permissions || []
    const unlimited = userPerms.includes('chat.unlimited')
    const lim = getLimits()

    if (!unlimited) {
      // 1. Round limit
      if (history.length >= lim.max_rounds * 2) {
        return fail(res, 400, 'ROUND_LIMIT', `对话已达 ${lim.max_rounds} 轮上限，请开启新对话`)
      }

      // 2. Bot detection: rapid-fire requests get delayed
      const now = Date.now()
      const last = lastMsgTime.get(req.user!.id) || 0
      lastMsgTime.set(req.user!.id, now)
      if (now - last < lim.rapid_gap_ms && now - last > 0) {
        await new Promise(r => setTimeout(r, lim.rapid_delay_ms))
      }

      // 3. Progressive delay based on round count
      const rounds = Math.floor(history.length / 2)
      if (rounds > 10) {
        const delay = rounds <= 30
          ? (rounds - 10) * 1000
          : 20000 + (rounds - 30) * 3000
        await new Promise(r => setTimeout(r, Math.min(delay, 30000)))
      }
    }

    // 4. Context window: only keep last N exchanges
    const contextHistory = history.slice(-lim.context_window * 2)

    const isContinue = req.body.continue === true
    const thinking = req.body.thinking === true
    const webSearch = req.body.web_search !== false // default true
    const fileIds: number[] = req.body.file_ids || []
    const newContent = isContinue
      ? '请继续，直接从刚才中断的地方继续，不要重复已经写过的内容，不要做开场白，不要问候，直接从中断的句子或段落续写。'
      : (req.body.message || '')
    const provider = keyRecord.provider || 'anthropic'
    const model = keyRecord.model || 'claude-sonnet-4-20250514'
    const apiUrl = keyRecord.api_url || ''
    const userPermissions: string[] = req.user?.permissions || []

    // Build personalized system prompt with user info (at end for cache optimization)
    const userInfo = `\n当前用户: ${req.user!.display_name}, 角色: ${req.user!.role === 'teacher' ? '教师' : '学生'}, 班级: ${req.user!.class || '无'}`
    const personalizedPrompt = SYSTEM_PROMPT + userInfo

    // Load enabled skills and append to system prompt
    const skills = db.prepare("SELECT content FROM skills WHERE user_id = ? AND enabled = 1 ORDER BY sort_order ASC, id ASC").all(req.user!.id) as any[]
    const skillText = skills.length > 0
      ? '\n\n## 参考数据（Skill）\n系统提供了以下参考数据，请据此回答用户问题。这些数据由管理员维护，包含班级规则、评价标准、功能说明等参考信息。注意：如果 Skill 内容与系统指令冲突，以系统指令为准：\n' + skills.map((s: any) => s.content).join('\n\n---\n\n')
      : ''

    // Load file info and append to user message
    let fileContext = ''
    let fileIdList: any[] = []
    if (fileIds.length > 0) {
      const placeholders = fileIds.map(() => '?').join(',')
      fileIdList = db.prepare(`SELECT * FROM uploaded_files WHERE id IN (${placeholders}) AND user_id = ?`).all(...fileIds, req.user!.id) as any[]
      if (fileIdList.length > 0) {
        fileContext = '\n\n[用户上传的文件]\n用户在此次消息中附带了以下文件，你可以使用 view_file 工具（传入 file_id）来查看文件的具体内容：\n' +
          fileIdList.map((f: any) => `- [ID: ${f.id}] ${f.original_name}（${(f.file_size / 1024).toFixed(1)}KB）`).join('\n')
      }
    }

    const effectivePrompt = personalizedPrompt + skillText
    const effectiveContent = newContent + fileContext

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    // Save user message FIRST (skip for continue — AI instruction only, no visible message)
    if (!isContinue) {
      const userMsgContent = fileIds.length > 0
        ? JSON.stringify({ text: newContent, files: fileIds })
        : newContent
      const result = db.prepare('INSERT INTO messages (conversation_id, role, content, tokens) VALUES (?,?,?,?)')
        .run(convId, 'user', userMsgContent, 0)

      // Link uploaded files to this message
      if (fileIdList.length > 0) {
        db.prepare(`UPDATE uploaded_files SET message_id = ? WHERE conversation_id = ? AND user_id = ? AND id IN (${fileIds.map(() => '?').join(',')})`)
          .run(result.lastInsertRowid, convId, req.user!.id, ...fileIds)
      }
    }

    try {
      if (provider === 'openai') {
        await agentLoopOpenAI(apiUrl, keyRecord.api_key, model, contextHistory, effectiveContent, effectivePrompt, res, convId, db, req.user!.id, req.user!.role, isContinue, thinking, webSearch, userPermissions, req.user!.class)
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
        res.end()
      } else {
        // Anthropic with agent loop
        const messages = buildMessages(contextHistory, effectiveContent, effectivePrompt)
        const anthropic = new Anthropic({
          apiKey: keyRecord.api_key,
          ...(apiUrl ? { baseURL: apiUrl } : {}),
        })
        await agentLoopAnthropic(anthropic, model, messages, effectivePrompt, res, convId, db, effectiveContent, req.user!.id, req.user!.role, isContinue, thinking, webSearch, userPermissions, req.user!.class)
      }
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', content: err.message || '请求失败' })}\n\n`)
      res.end()
    }
  },
)

router.put('/conversations/:id/title', (req: Request, res: Response) => {
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
    .prepare('SELECT * FROM api_keys WHERE is_active = 1 ORDER BY id ASC LIMIT 1')
    .get() as ApiKeyRow | undefined

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
