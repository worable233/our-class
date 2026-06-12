import { Router, Request, Response } from 'express'
import { execSync, spawn, type ChildProcess } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { ok, fail } from '../lib/response.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'
import { getDb } from '../db/init.js'
import { writeAuditLog } from './audit.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '../..')
const FRONTEND_ROOT = join(PROJECT_ROOT, '..')  // 前端项目根目录（含 package.json、dist/）
const IS_WIN = process.platform === 'win32'

// 与安装脚本 installer/main.go 保持一致的镜像源
const REPO_URL = 'https://github.com/worable233/our-class.git'
const REPO_MIRROR = 'https://github.chenc.dev/github.com/worable233/our-class'

let updating = false

const router = Router()

// ── 跨平台工具函数 ─────────────────────────────────────────────────────────

function getProxyEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) {
    const val = process.env[key]
    if (val) env[key] = val
  }
  return env
}

/** execSync 的默认选项，注入代理环境变量 */
function execOpts(extra: Record<string, any> = {}): Record<string, any> {
  return {
    env: { ...process.env, ...getProxyEnv() },
    windowsHide: true,
    ...extra,
  }
}

/**
 * 跨平台找 npm 可执行文件
 * Windows 下 npm 是 .cmd 批处理文件，spawn 默认找不到
 */
function npmCmd(): string {
  if (!IS_WIN) return 'npm'
  try {
    execSync('where npm.cmd', execOpts({ encoding: 'utf-8', timeout: 3000, stdio: 'pipe' }))
    return 'npm.cmd'
  } catch {
    return 'npm'
  }
}

/**
 * 跨平台找 node 可执行文件路径
 */
function nodeCmd(): string {
  if (!IS_WIN) return process.argv[0]
  try {
    const out = execSync('where node', execOpts({ encoding: 'utf-8', timeout: 3000, stdio: 'pipe' })).trim()
    return out.split('\n')[0].trim() || process.argv[0]
  } catch {
    return process.argv[0]
  }
}

function sse(res: Response, type: string, data: any) {
  if (!res.writableEnded) {
    try { res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`) } catch {}
  }
}

/** 杀掉整个进程组（包括子进程的子进程） */
function killTree(child: ChildProcess) {
  if (!child.pid) return
  if (IS_WIN) {
    try { spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }) } catch {}
  } else {
    try { process.kill(-child.pid, 'SIGTERM') } catch {}
    setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL') } catch {} }, 3000)
  }
}

/**
 * 运行子命令，返回 child 引用（供 abort 时 kill）。
 */
function runCommand(
  cmd: string, args: string[], opts: any, onOutput: (chunk: string) => void,
): { promise: Promise<number>; child: ChildProcess } {
  const { timeout: _timeout, ...spawnOpts } = opts
  const child = spawn(cmd, args, {
    ...spawnOpts,
    env: { ...process.env, ...getProxyEnv() },
    detached: !IS_WIN,
    windowsHide: true,
    shell: IS_WIN,
  })
  const timeout = _timeout || 0
  let timer: NodeJS.Timeout | null = null
  let killed = false
  if (timeout) timer = setTimeout(() => { killed = true; killTree(child) }, timeout)
  child.stdout?.on('data', (data: Buffer) => onOutput(data.toString()))
  child.stderr?.on('data', (data: Buffer) => onOutput(data.toString()))
  const promise = new Promise<number>((resolve, reject) => {
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      if (killed) reject(new Error('命令超时'))
      else resolve(code ?? 1)
    })
    child.on('error', reject)
  })
  return { promise, child }
}

/** 带重试的命令执行 */
async function runWithRetry(
  cmd: string, args: string[], opts: any, onOutput: (chunk: string) => void,
  retries = 1,
): Promise<void> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      onOutput(`[重试 ${attempt}/${retries}] ...\n`)
      await new Promise(r => setTimeout(r, 2000))
    }
    try {
      const { promise } = runCommand(cmd, args, opts, onOutput)
      const code = await promise
      if (code === 0) return
      lastError = new Error(`命令退出码 ${code}`)
    } catch (e: any) {
      lastError = e
    }
  }
  throw lastError || new Error('命令执行失败')
}

// ── Git 镜像源 fetch ───────────────────────────────────────────────────────

/**
 * 带镜像源兜底的 git fetch
 * 优先级: origin 直连 → origin 重试 → 镜像源
 * 返回 true 表示成功
 */
async function fetchWithMirror(
  cwd: string,
  onOutput: (chunk: string) => void,
): Promise<boolean> {
  const execFetch = (url: string, label: string, timeout: number) => {
    try {
      execSync(`git fetch ${url} main`, execOpts({ encoding: 'utf-8', timeout, cwd, stdio: 'pipe' }))
      return true
    } catch {
      return false
    }
  }

  // 1. origin 直连（重试 2 次）
  for (let i = 0; i < 2; i++) {
    if (i > 0) {
      onOutput('[重试] origin fetch ...\n')
      await new Promise(r => setTimeout(r, 2000))
    }
    if (execFetch('origin', 'origin', 30000)) return true
  }

  // 2. shallow clone 兜底
  onOutput('[尝试] shallow fetch ...\n')
  if (execFetch('origin', 'shallow', 30000)) return true

  // 3. 镜像源兜底
  onOutput('[尝试] 镜像源 ' + REPO_MIRROR + ' ...\n')
  try {
    // 设置临时 remote
    try { execSync('git remote remove mirror', execOpts({ encoding: 'utf-8', timeout: 5000, cwd, stdio: 'pipe' })) } catch {}
    execSync(`git remote add mirror ${REPO_MIRROR}`, execOpts({ encoding: 'utf-8', timeout: 5000, cwd, stdio: 'pipe' }))
    // fetch 镜像源（重试 2 次）
    for (let i = 0; i < 2; i++) {
      if (i > 0) {
        onOutput('[重试] 镜像源 fetch ...\n')
        await new Promise(r => setTimeout(r, 2000))
      }
      if (execFetch('mirror', 'mirror', 60000)) {
        // 镜像 fetch 成功，把 mirror/main 同步到 origin/main
        try {
          execSync('git fetch origin', execOpts({ encoding: 'utf-8', timeout: 10000, cwd, stdio: 'pipe' }))
        } catch {
          // origin 不可达时，直接用 mirror 的 ref
          try {
            execSync('git update-ref refs/remotes/origin/main refs/remotes/mirror/main', execOpts({ encoding: 'utf-8', timeout: 5000, cwd, stdio: 'pipe' }))
          } catch {}
        }
        return true
      }
    }
  } catch {
    // 镜像源设置失败，忽略
  }

  return false
}

// ── 路由 ───────────────────────────────────────────────────────────────────

router.use(authMiddleware)
router.use(requirePermission('chat.config'))

// ── Settings ────────────────────────────────────────────────────────────────

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

router.put('/settings', (req: Request, res: Response) => {
  const db = getDb()
  const { auto_check_interval, ping_timeout } = req.body
  db.prepare('INSERT INTO update_settings (id, auto_check_interval, ping_timeout) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET auto_check_interval = COALESCE(?, auto_check_interval), ping_timeout = COALESCE(?, ping_timeout), updated_at = CURRENT_TIMESTAMP')
    .run(auto_check_interval ?? 3600, ping_timeout ?? 3, auto_check_interval ?? null, ping_timeout ?? null)
  writeAuditLog(req.user!.id, req.user!.display_name, 'update_settings', 'system', undefined, { auto_check_interval, ping_timeout })
  ok(res, { saved: true })
})

// ── Version info ────────────────────────────────────────────────────────────

function checkGit(): boolean {
  try {
    execSync('git --version', execOpts({ encoding: 'utf-8', timeout: 5000, stdio: 'pipe' }))
    return true
  } catch {
    return false
  }
}

router.get('/version', (_req: Request, res: Response) => {
  if (!checkGit()) return fail(res, 400, 'GIT_NOT_FOUND', 'Git 未安装')
  try {
    const sha = execSync('git rev-parse --short HEAD', execOpts({ encoding: 'utf-8', timeout: 5000, cwd: FRONTEND_ROOT })).trim()
    const date = execSync('git log -1 --format=%ci', execOpts({ encoding: 'utf-8', timeout: 5000, cwd: FRONTEND_ROOT })).trim()
    const msg = execSync('git log -1 --format=%s', execOpts({ encoding: 'utf-8', timeout: 5000, cwd: FRONTEND_ROOT })).trim()
    const author = execSync('git log -1 --format=%an', execOpts({ encoding: 'utf-8', timeout: 5000, cwd: FRONTEND_ROOT })).trim()
    const db = getDb()
    const settings = db.prepare('SELECT last_check_time FROM update_settings WHERE id = 1').get() as any
    ok(res, { sha, date, message: msg, author, last_check_time: settings?.last_check_time || null })
  } catch {
    fail(res, 500, 'VERSION_FAILED', '获取版本信息失败，请确认项目是 Git 仓库')
  }
})

// ── History ─────────────────────────────────────────────────────────────────

router.get('/history', (_req: Request, res: Response) => {
  if (!checkGit()) return fail(res, 400, 'GIT_NOT_FOUND', 'Git 未安装')
  try {
    const log = execSync(
      'git log --oneline --pretty=format:%h|%an|%ci|%s -30',
      execOpts({ encoding: 'utf-8', timeout: 10000, cwd: FRONTEND_ROOT }),
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

router.post('/check', async (req: Request, res: Response) => {
  try {
    if (!checkGit()) return fail(res, 400, 'GIT_NOT_FOUND', 'Git 未安装')

    const fetchOk = await fetchWithMirror(FRONTEND_ROOT, () => {})
    if (!fetchOk) return fail(res, 400, 'NETWORK_ERROR', '无法连接到 GitHub 或镜像源，请检查网络')

    // compare
    const localSha = execSync('git rev-parse --short HEAD', execOpts({ encoding: 'utf-8', timeout: 5000, cwd: FRONTEND_ROOT })).trim()
    const remoteSha = execSync('git rev-parse --short origin/main', execOpts({ encoding: 'utf-8', timeout: 5000, cwd: FRONTEND_ROOT })).trim()
    const behind = localSha !== remoteSha

    let commits: { hash: string; message: string; author: string; date: string }[] = []
    if (behind) {
      try {
        const log = execSync(
          `git log --oneline --pretty=format:%h|%an|%ci|%s ${localSha}..origin/main`,
          execOpts({ encoding: 'utf-8', timeout: 10000, cwd: FRONTEND_ROOT }),
        ).trim()
        commits = log.split('\n').filter(Boolean).map(line => {
          const [hash, author, date, ...msgParts] = line.split('|')
          return { hash, author: author || '', date: date || '', message: msgParts.join('|') || '' }
        })
      } catch {}
    }

    // 更新上次检查时间
    const db = getDb()
    db.prepare("INSERT INTO update_settings (id, last_check_time) VALUES (1, datetime('now')) ON CONFLICT(id) DO UPDATE SET last_check_time = datetime('now')").run()

    ok(res, { current: localSha, latest: remoteSha, behind, commits: commits.slice(0, 20) })
  } catch (e: any) {
    fail(res, 500, 'CHECK_FAILED', '检查更新失败: ' + (e.message || '未知错误'))
  }
})

// ── Apply ───────────────────────────────────────────────────────────────────

router.post('/apply', async (req: Request, res: Response) => {
  if (updating) return fail(res, 429, 'UPDATE_IN_PROGRESS', '更新任务正在进行中')

  updating = true
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  let aborted = false
  let currentChild: ChildProcess | null = null
  const onClose = () => {
    aborted = true
    if (currentChild) killTree(currentChild)
  }
  req.on('close', onClose)

  function emit(type: string, data: any) { if (!aborted) sse(res, type, data) }

  try {
    // ── Step 0: Git 检查 ──
    if (aborted) return
    emit('step', { message: '正在检查 Git...' })
    if (!checkGit()) { emit('error', { message: 'Git 未安装' }); return }
    emit('success', { message: 'Git 可用' })

    // ── Step 1: 保存未提交的更改 ──
    if (aborted) return
    let hasStash = false
    try {
      const status = execSync('git status --porcelain', execOpts({ encoding: 'utf-8', timeout: 5000, cwd: FRONTEND_ROOT })).trim()
      if (status) {
        emit('step', { message: '检测到未提交的更改，暂存中...' })
        execSync('git stash push -m "auto-stash-before-update"', execOpts({ encoding: 'utf-8', timeout: 10000, cwd: FRONTEND_ROOT, stdio: 'pipe' }))
        hasStash = true
        emit('success', { message: '已暂存本地更改' })
      }
    } catch {}

    // ── Step 2: Fetch（带镜像源兜底） ──
    if (aborted) return
    emit('step', { message: '正在拉取代码...' })
    const fetchOk = await fetchWithMirror(FRONTEND_ROOT, (text) => emit('output', { text }))
    if (!fetchOk) {
      emit('error', { message: '拉取代码失败: 无法连接到 GitHub 或镜像源' })
      if (hasStash) { try { execSync('git stash pop', execOpts({ encoding: 'utf-8', timeout: 10000, cwd: FRONTEND_ROOT, stdio: 'pipe' })) } catch {} }
      return
    }
    emit('success', { message: '拉取代码完成' })

    const env = { ...process.env, ...getProxyEnv() }
    const npm = npmCmd()

    // ── Step 3-7: 后续步骤（带重试） ──
    const steps: [string, string, string[], Record<string, any>, boolean, number][] = [
      ['同步代码', 'git', ['reset', '--hard', 'origin/main'], { timeout: 15000, cwd: FRONTEND_ROOT }, true, 0],
      ['清理旧文件', 'git', ['clean', '-fd',
        '-e', '.env',
        '-e', 'node_modules',
        '-e', 'server/data.db',
        '-e', 'server/storage',
        '-e', 'server/uploads',
        '-e', 'server/backups',
      ], { timeout: 15000, cwd: FRONTEND_ROOT }, false, 0],
      ['安装前端依赖', npm, ['install', '--prefer-offline'], { timeout: 300000, cwd: FRONTEND_ROOT }, true, 2],
      ['安装后端依赖', npm, ['install', '--prefer-offline'], { timeout: 180000, cwd: PROJECT_ROOT }, true, 2],
      ['构建前端', npm, ['run', 'build-only'], { timeout: 300000, cwd: FRONTEND_ROOT }, true, 1],
    ]

    for (const [label, cmd, args, opts, critical, retries] of steps) {
      if (aborted) return
      emit('step', { message: '正在' + label + '...' })
      try {
        await runWithRetry(cmd, args, { env, ...opts }, (chunk) => emit('output', { text: chunk }), retries)
        emit('success', { message: label + '完成' })
      } catch (e: any) {
        if (aborted) return
        if (critical) {
          emit('error', { message: label + '失败: ' + (e.message || '未知错误') })
          if (hasStash) { try { execSync('git stash pop', execOpts({ encoding: 'utf-8', timeout: 10000, cwd: FRONTEND_ROOT, stdio: 'pipe' })) } catch {} }
          return
        }
        emit('output', { text: `[警告] ${label}失败，继续执行...\n` })
      }
    }

    // ── Step 8: 恢复 stash ──
    if (hasStash) {
      try {
        execSync('git stash pop', execOpts({ encoding: 'utf-8', timeout: 10000, cwd: FRONTEND_ROOT, stdio: 'pipe' }))
        emit('success', { message: '已恢复本地更改' })
      } catch {
        emit('output', { text: '[警告] 恢复本地更改失败，请手动执行 git stash pop\n' })
      }
    }

    if (aborted) return
    try { writeAuditLog(req.user!.id, req.user!.display_name, 'update_apply', 'system', undefined, { message: '系统更新已应用' }) } catch {}
    emit('done', { message: '更新成功，2 秒后重启...' })
    res.end()

    // ── Step 9: 重启 ──
    setTimeout(() => {
      const node = nodeCmd()
      const child = spawn(node, process.argv.slice(1), {
        cwd: FRONTEND_ROOT,
        stdio: 'inherit',
        detached: !IS_WIN,
        windowsHide: true,
      })
      child.unref()
      process.exit(0)
    }, 2000)
  } finally {
    req.removeListener('close', onClose)
    if (!aborted) { try { res.end() } catch {} }
    updating = false
  }
})

export default router
