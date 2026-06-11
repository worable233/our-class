import { Router, Request, Response } from 'express'
import { execSync, spawn } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { ok, fail } from '../lib/response.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'
import { getDb } from '../db/init.js'
import { writeAuditLog } from './audit.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '../..')
const FRONTEND_ROOT = join(PROJECT_ROOT, '..')  // 前端项目根目录（含 package.json、dist/）

let updating = false

const router = Router()

function getProxyEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) {
    const val = process.env[key]
    if (val) env[key] = val
  }
  return env
}

function execOpts(extra: Record<string, any> = {}) {
  return { ...extra, env: { ...process.env, ...getProxyEnv(), ...(extra.env || {}) } }
}

function sse(res: Response, type: string, data: any) {
  res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
}

function runCommand(cmd: string, args: string[], opts: any, onOutput: (chunk: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, env: { ...process.env, ...getProxyEnv() } })
    const timeout = opts.timeout || 0
    let timer: NodeJS.Timeout | null = null
    if (timeout) timer = setTimeout(() => { child.kill(); reject(new Error('Command timed out')) }, timeout)
    child.stdout.on('data', (data: Buffer) => onOutput(data.toString()))
    child.stderr.on('data', (data: Buffer) => onOutput(data.toString()))
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error('command exited with code ' + code))
    })
    child.on('error', reject)
  })
}

router.use(authMiddleware)
router.use(requirePermission('chat.config'))

// ── Settings ────────────────────────────────────────────────────────────────

// GET /api/system/update/settings — 获取自动检测设置
router.get('/settings', (_req: Request, res: Response) => {
  const db = getDb()
  let row = db.prepare('SELECT * FROM update_settings WHERE id = 1').get() as any
  if (!row) {
    db.prepare('INSERT INTO update_settings (id, auto_check_interval, ping_timeout) VALUES (1, 3600, 3)').run()
    row = db.prepare('SELECT * FROM update_settings WHERE id = 1').get()
  }
  ok(res, {
    auto_check_interval: row.auto_check_interval,
    ping_timeout: row.ping_timeout,
    last_check_time: row.last_check_time || null,
  })
})

// PUT /api/system/update/settings — 保存自动检测设置
router.put('/settings', (req: Request, res: Response) => {
  const db = getDb()
  const { auto_check_interval, ping_timeout } = req.body
  db.prepare('INSERT INTO update_settings (id, auto_check_interval, ping_timeout) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET auto_check_interval = COALESCE(?, auto_check_interval), ping_timeout = COALESCE(?, ping_timeout), updated_at = CURRENT_TIMESTAMP')
    .run(auto_check_interval ?? 3600, ping_timeout ?? 3, auto_check_interval ?? null, ping_timeout ?? null)
  writeAuditLog(req.user!.id, req.user!.display_name, 'update_settings', 'system', undefined, { auto_check_interval, ping_timeout })
  ok(res, { saved: true })
})

// ── Version info ────────────────────────────────────────────────────────────

// GET /api/system/update/version — 获取当前版本和上次检查时间
router.get('/version', (_req: Request, res: Response) => {
  try {
    execSync('git --version', execOpts({ encoding: 'utf-8', timeout: 3000 }))
  } catch {
    return fail(res, 400, 'GIT_NOT_FOUND', 'Git 未安装')
  }
  try {
    const sha = execSync('git rev-parse --short HEAD', execOpts({ encoding: 'utf-8', timeout: 3000, cwd: PROJECT_ROOT })).trim()
    const date = execSync('git log -1 --format=%cI', execOpts({ encoding: 'utf-8', timeout: 3000, cwd: PROJECT_ROOT })).trim()
    const msg = execSync('git log -1 --format=%s', execOpts({ encoding: 'utf-8', timeout: 3000, cwd: PROJECT_ROOT })).trim()
    const author = execSync('git log -1 --format=%an', execOpts({ encoding: 'utf-8', timeout: 3000, cwd: PROJECT_ROOT })).trim()
    const db = getDb()
    const settings = db.prepare('SELECT last_check_time FROM update_settings WHERE id = 1').get() as any
    ok(res, { sha, date, message: msg, author, last_check_time: settings?.last_check_time || null })
  } catch {
    fail(res, 500, 'VERSION_FAILED', '获取版本信息失败，请确认项目是 Git 仓库')
  }
})

// ── History ─────────────────────────────────────────────────────────────────

// GET /api/system/update/history — 获取历史版本列表（最近30条）
router.get('/history', (_req: Request, res: Response) => {
  try {
    execSync('git --version', execOpts({ encoding: 'utf-8', timeout: 3000 }))
  } catch {
    return fail(res, 400, 'GIT_NOT_FOUND', 'Git 未安装')
  }
  try {
    const log = execSync(
      'git log --oneline --pretty=format:"%h|%an|%cI|%s" -30',
      execOpts({ encoding: 'utf-8', timeout: 5000, cwd: PROJECT_ROOT }),
    ).trim()
    const commits = log.split('\n').filter(Boolean).map(line => {
      const [hash, author, date, ...msgParts] = line.split('|')
      return { hash, author, date, message: msgParts.join('|') || '' }
    })
    ok(res, commits)
  } catch {
    ok(res, [])
  }
})

// ── Check ───────────────────────────────────────────────────────────────────

// POST /api/system/update/check — ping + fetch + 比较，返回新版本信息
router.post('/check', async (req: Request, res: Response) => {
  try {
    try { execSync('git --version', execOpts({ encoding: 'utf-8', timeout: 3000 })) }
    catch { return fail(res, 400, 'GIT_NOT_FOUND', 'Git 未安装') }

    const settings = (() => {
      const db = getDb()
      return db.prepare('SELECT auto_check_interval, ping_timeout FROM update_settings WHERE id = 1').get() as any || { ping_timeout: 3 }
    })()
    const pingTimeout = settings.ping_timeout || 3

    // fetch（直接 fetch，跳过 ping — ICMP 无法通过 HTTP 代理）
    try {
      execSync('git fetch origin main 2>&1', execOpts({ encoding: 'utf-8', timeout: 30000, cwd: PROJECT_ROOT }))
    } catch {
      return fail(res, 400, 'NETWORK_ERROR', '无法连接到 GitHub，请检查网络或代理设置')
    }

    // compare
    const localSha = execSync('git rev-parse --short HEAD', execOpts({ encoding: 'utf-8', timeout: 3000, cwd: PROJECT_ROOT })).trim()
    const remoteSha = execSync('git rev-parse --short origin/main', execOpts({ encoding: 'utf-8', timeout: 3000, cwd: PROJECT_ROOT })).trim()
    const behind = localSha !== remoteSha

    let commits: { hash: string; message: string; author: string; date: string }[] = []
    if (behind) {
      const log = execSync(
        `git log --oneline --pretty=format:"%h|%an|%cI|%s" ${localSha}..origin/main`,
        execOpts({ encoding: 'utf-8', timeout: 5000, cwd: PROJECT_ROOT }),
      ).trim()
      commits = log.split('\n').filter(Boolean).map(line => {
        const [hash, author, date, ...msgParts] = line.split('|')
        return { hash, author: author || '', date: date || '', message: msgParts.join('|') || '' }
      })
    }

    // 更新上次检查时间
    const db = getDb()
    db.prepare("INSERT INTO update_settings (id, last_check_time) VALUES (1, datetime('now')) ON CONFLICT(id) DO UPDATE SET last_check_time = datetime('now')").run()

    ok(res, { current: localSha, latest: remoteSha, behind, commits: commits.slice(0, 20) })
  } catch (e: any) {
    fail(res, 500, 'CHECK_FAILED', '检查更新失败')
  }
})

// ── Apply ───────────────────────────────────────────────────────────────────

// POST /api/system/update/apply — 流式输出更新过程
router.post('/apply', async (req: Request, res: Response) => {
  if (updating) return fail(res, 429, 'UPDATE_IN_PROGRESS', '更新任务正在进行中')

  updating = true
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  let aborted = false
  let currentChild: { kill: () => void } | null = null
  const onClose = () => {
    aborted = true
    if (currentChild) { try { currentChild.kill() } catch {} }
    res.end()
  }
  req.on('close', onClose)

  function emit(type: string, data: any) { if (!aborted) sse(res, type, data) }

  try {
    if (aborted) return
    emit('step', { message: '正在检查 Git...' })
    try { execSync('git --version', execOpts({ encoding: 'utf-8', timeout: 3000 })) }
    catch { emit('error', { message: 'Git 未安装' }); return }

    if (aborted) return
    emit('success', { message: 'Git 可用' })

    emit('step', { message: '正在连接 GitHub...' })
    // 直接尝试拉取（跳过 ping — ICMP 无法通过 HTTP 代理）
    for (const [label, cmd, args, opts, critical] of [
      ['拉取代码', 'git', ['fetch', 'origin', 'main'], { timeout: 30000 }, true],
      ['同步代码', 'git', ['reset', '--hard', 'origin/main'], { timeout: 15000 }, true],
      ['清理文件', 'git', ['clean', '-fd'], { timeout: 10000 }, false],
      ['安装依赖', 'npm', ['install'], { timeout: 120000 }, true],
      ['构建前端', 'npm', ['run', 'build-only'], { timeout: 120000, cwd: FRONTEND_ROOT }, false],
    ] as const) {
      if (aborted) return
      emit('step', { message: '正在' + label + '...' })
      try {
        currentChild = null
        await runCommand(cmd as string, args as string[], execOpts({ cwd: PROJECT_ROOT, ...opts }), (chunk) => emit('output', { text: chunk }))
      } catch (e: any) {
        if (aborted) return
        if (critical) { emit('error', { message: label + '失败' }); return }
      }
    }

    if (aborted) return
    // 写入操作日志
    writeAuditLog(req.user!.id, req.user!.display_name, 'update_apply', 'system', undefined, { message: '系统更新已应用' })
    emit('done', { message: '更新成功，即将重启...' })
    res.end()
    res.on('finish', () => {
      setTimeout(() => {
        const child = spawn(process.argv[0], process.argv.slice(1), { cwd: PROJECT_ROOT, stdio: 'inherit', detached: true })
        child.unref()
        process.exit(0)
      }, 1000)
    })
  } finally {
    req.removeListener('close', onClose)
    if (!aborted) res.end()
    updating = false
  }
})

export default router
