import { Router, Request, Response } from 'express'
import { exec, execSync } from 'child_process'
import { promisify } from 'util'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { ok, fail } from '../lib/response.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '../..')

const asyncExec = promisify(exec)

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

// 所有更新路由都需要教师权限
router.use(authMiddleware)
router.use(requirePermission('chat.config'))

// GET /api/system/update/check — 检查远程是否有新版本
router.get('/check', async (_req: Request, res: Response) => {
  try {
    // 先检查 git 是否可用
    try {
      execSync('git --version', execOpts({ encoding: 'utf-8', timeout: 3000 }))
    } catch {
      return fail(res, 400, 'GIT_NOT_FOUND', 'Git 未安装或不在系统 PATH 中')
    }

    // ping GitHub 检查网络连通性
    try {
      execSync('ping -c 1 -t 3 github.com 2>&1', execOpts({ encoding: 'utf-8', timeout: 5000 }))
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

// POST /api/system/update/apply — 拉取最新代码并安装依赖
router.post('/apply', async (_req: Request, res: Response) => {
  if (updating) {
    return fail(res, 429, 'UPDATE_IN_PROGRESS', '更新任务正在进行中，请等待完成')
  }

  updating = true
  try {
    // 先检查 git 是否可用
    try {
      execSync('git --version', { encoding: 'utf-8', timeout: 3000 })
    } catch {
      updating = false
      return fail(res, 400, 'GIT_NOT_FOUND', 'Git 未安装或不在系统 PATH 中')
    }

    // ping GitHub 检查网络连通性
    try {
      execSync('ping -c 1 -t 3 github.com 2>&1', { encoding: 'utf-8', timeout: 5000 })
    } catch {
      updating = false
      return fail(res, 400, 'NETWORK_ERROR', '无法连接到 GitHub，请检查网络连接')
    }

    // git pull（非阻塞）
    const { stdout: pullOut } = await asyncExec('git pull origin main 2>&1', execOpts({
      timeout: 30000,
      cwd: PROJECT_ROOT,
    }))

    // npm install（非阻塞）
    await asyncExec('npm install 2>&1', execOpts({
      timeout: 120000,
      cwd: PROJECT_ROOT,
    }))

    ok(res, {
      message: '更新成功，请重启服务器以生效',
      pull: pullOut.trim(),
    })
  } catch (e: any) {
    const message = e.code === 'ETIMEDOUT' || e.killed
      ? '操作超时，请检查网络连接后重试'
      : '更新失败，请检查控制台输出或稍后重试'
    fail(res, 500, 'UPDATE_FAILED', message)
  } finally {
    updating = false
  }
})

export default router
