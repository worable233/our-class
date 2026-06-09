import { Router, Request, Response } from 'express'
import { execSync } from 'child_process'
import { ok, fail } from '../lib/response.js'

const router = Router()

// GET /api/system/update/check — 检查远程是否有新版本
router.get('/check', (_req: Request, res: Response) => {
  try {
    const fetchOut = execSync('git fetch origin main 2>&1', { encoding: 'utf-8', timeout: 15000 })
    const localSha = execSync('git rev-parse HEAD', { encoding: 'utf-8', timeout: 5000 }).trim()
    const remoteSha = execSync('git rev-parse origin/main', { encoding: 'utf-8', timeout: 5000 }).trim()
    const behind = localSha !== remoteSha

    let commits: { message: string; author: string; date: string }[] = []
    if (behind) {
      const log = execSync(
        `git log --oneline --pretty=format:"%h|%an|%ar|%s" ${localSha}..origin/main`,
        { encoding: 'utf-8', timeout: 5000 },
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
    if (e.message?.includes('不是 git 命令') || e.message?.includes('not found') || e.message?.includes('是一个外部命令')) {
      return fail(res, 400, 'GIT_NOT_FOUND', 'Git 未安装或不在系统 PATH 中')
    }
    fail(res, 500, 'CHECK_FAILED', '检查更新失败: ' + (e.message || '未知错误'))
  }
})

// POST /api/system/update/apply — 拉取最新代码并安装依赖
router.post('/apply', (_req: Request, res: Response) => {
  try {
    const pullOut = execSync('git pull origin main 2>&1', { encoding: 'utf-8', timeout: 30000 })
    const npmOut = execSync('npm install 2>&1', { encoding: 'utf-8', cwd: process.cwd(), timeout: 60000 })
    ok(res, {
      message: '更新成功，请重启服务器以生效',
      pull: pullOut.trim(),
    })
  } catch (e: any) {
    fail(res, 500, 'UPDATE_FAILED', '更新失败: ' + (e.message || '未知错误'))
  }
})

export default router
