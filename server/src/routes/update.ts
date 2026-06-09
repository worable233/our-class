import { Router, Request, Response } from 'express'
import { execSync, spawn } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { ok, fail } from '../lib/response.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '../..')

// 并发锁：防止同时执行多个更新操作
let updating = false

const router = Router()

// 获取系统代理配置（从环境变量或系统设置）
function getProxyEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  const proxyVars = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']
  for (const key of proxyVars) {
    const val = process.env[key]
    if (val) env[key] = val
  }
  return env
}

function execOpts(extra: Record<string, any> = {}) {
  return { ...extra, env: { ...process.env, ...getProxyEnv(), ...(extra.env || {}) } }
}

// SSE 辅助：发送事件
function sse(res: Response, type: string, data: any) {
  res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
}

// 所有更新路由都需要教师权限
router.use(authMiddleware)
router.use(requirePermission('chat.config'))

// GET /api/system/update/check — 检查远程是否有新版本
router.get('/check', async (_req: Request, res: Response) => {
  try {
    try {
      execSync('git --version', execOpts({ encoding: 'utf-8', timeout: 3000 }))
    } catch {
      return fail(res, 400, 'GIT_NOT_FOUND', 'Git 未安装或不在系统 PATH 中')
    }

    try {
      execSync('ping -c 1 -t 3 github.com 2>&1', execOpts({ encoding: 'utf-8', timeout: 3000 }))
    } catch {
      return fail(res, 400, 'NETWORK_ERROR', '无法连接到 GitHub，请检查网络连接')
    }

    const fetchOut = execSync('git fetch origin main 2>&1', execOpts({ encoding: 'utf-8', timeout: 15000, cwd: PROJECT_ROOT }))
    const localSha = execSync('git rev-parse HEAD', execOpts({ encoding: 'utf-8', timeout: 5000, cwd: PROJECT_ROOT })).trim()
    const remoteSha = execSync('git rev-parse origin/main', execOpts({ encoding: 'utf-8', timeout: 5000, cwd: PROJECT_ROOT })).trim()
    const behind = localSha !== remoteSha

    let commits: { message: string; author: string; date: string }[] = []
    if (behind) {
      const log = execSync(
        `git log --oneline --pretty=format:"%h|%an|%ar|%s" ${localSha}..origin/main`,
        execOpts({ encoding: 'utf-8', timeout: 5000, cwd: PROJECT_ROOT }),
      ).trim()
      commits = log.split('\n').filter(Boolean).map(line => {
        const [hash, author, date, ...msgParts] = line.split('|')
        return { message: msgParts.join('|') || '', author: author || '', date: date || '', hash: hash || '' }
      })
    }

    ok(res, {
      current: localSha.slice(0, 7),
      latest: remoteSha.slice(0, 7),
      behind,
      commits: commits.slice(0, 20),
    })
  } catch (e: any) {
    fail(res, 500, 'CHECK_FAILED', '检查更新失败，请检查网络连接或稍后重试')
  }
})

// 带输出的 spawn 包装：实时捕获 stdout/stderr
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
      else reject(new Error(`命令退出码: ${code}`))
    })
    child.on('error', reject)
  })
}

// POST /api/system/update/apply — 流式输出更新过程
router.post('/apply', async (_req: Request, res: Response) => {
  if (updating) {
    return fail(res, 429, 'UPDATE_IN_PROGRESS', '更新任务正在进行中，请等待完成')
  }

  updating = true

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  function emit(type: string, data: any) { sse(res, type, data) }

  try {
    // ① 检查 Git
    emit('step', { message: '正在检查 Git...' })
    try {
      execSync('git --version', execOpts({ encoding: 'utf-8', timeout: 3000 }))
    } catch {
      emit('error', { message: 'Git 未安装或不在系统 PATH 中' })
      res.end(); return
    }
    emit('success', { message: '✓ Git 可用' })

    // ② ping GitHub
    emit('step', { message: '正在连接 GitHub...' })
    try {
      execSync('ping -c 1 -t 3 github.com 2>&1', execOpts({ encoding: 'utf-8', timeout: 3000 }))
    } catch {
      emit('error', { message: '无法连接到 GitHub，请检查网络连接' })
      res.end(); return
    }
    emit('success', { message: '✓ 网络连通' })

    // ③ git fetch
    emit('step', { message: '正在拉取最新代码...' })
    try {
      await runCommand('git', ['fetch', 'origin', 'main'], execOpts({ cwd: PROJECT_ROOT, timeout: 30000 }),
        (chunk) => emit('output', { text: chunk })
      )
    } catch (e: any) {
      emit('error', { message: '拉取代码失败: ' + (e.message || '') })
      res.end(); return
    }

    // ④ git reset --hard
    emit('step', { message: '正在同步代码...' })
    try {
      await runCommand('git', ['reset', '--hard', 'origin/main'], execOpts({ cwd: PROJECT_ROOT, timeout: 15000 }),
        (chunk) => emit('output', { text: chunk })
      )
    } catch (e: any) {
      emit('error', { message: '同步代码失败: ' + (e.message || '') })
      res.end(); return
    }

    // ⑤ git clean
    emit('step', { message: '正在清理文件...' })
    try {
      await runCommand('git', ['clean', '-fd'], execOpts({ cwd: PROJECT_ROOT, timeout: 10000 }),
        (chunk) => emit('output', { text: chunk })
      )
    } catch (e: any) {
      emit('error', { message: '清理文件失败: ' + (e.message || '') })
      res.end(); return
    }

    // ⑥ npm install
    emit('step', { message: '正在安装依赖...' })
    try {
      await runCommand('npm', ['install'], execOpts({ cwd: PROJECT_ROOT, timeout: 120000 }),
        (chunk) => emit('output', { text: chunk })
      )
    } catch (e: any) {
      emit('error', { message: '安装依赖失败，请检查控制台输出' })
      res.end(); return
    }

    // 全部完成
    emit('done', { message: '更新成功，即将重启服务器...' })
    res.end()

    // 等待响应发送完毕，然后自重启
    res.on('finish', () => {
      setTimeout(() => {
        const child = spawn(process.argv[0], process.argv.slice(1), {
          cwd: PROJECT_ROOT,
          stdio: 'inherit',
          detached: true,
        })
        child.unref()
        process.exit(0)
      }, 1000)
    })
  } catch (e: any) {
    emit('error', { message: '更新失败，已自动回退代码变更' })
    res.end()
    // 尝试恢复 git 状态
    try { execSync('git reset --hard HEAD 2>&1', execOpts({ cwd: PROJECT_ROOT, timeout: 10000 })) } catch {}
  } finally {
    updating = false
  }
})

export default router
