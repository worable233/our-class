import express from 'express'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, writeFileSync, readFileSync } from 'fs'
import { execSync, spawn } from 'child_process'
import crypto from 'crypto'
import { getDb } from '../db/init.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..', '..', '..')
const STATE_FILE = join(__dirname, 'setup-state.json')

interface SetupState {
  step: 'idle' | 'admin' | 'config' | 'done'
  admin_created: boolean
  api_configured: boolean
  port: number
  pm2_installed: boolean
}

function getState(): SetupState {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
  } catch {
    return { step: 'idle', admin_created: false, api_configured: false, port: 3000, pm2_installed: false }
  }
}

function saveState(s: Partial<SetupState>) {
  const state = { ...getState(), ...s }
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

const distPath = join(PROJECT_ROOT, 'dist')

const app = express()
app.use(express.json())

// Serve built frontend (setup wizard reuses it with /setup route)
if (existsSync(distPath)) {
  app.use(express.static(distPath))
}

// ── Setup HTML page ─────────────────────────────────────────────────
const SETUP_HTML = readFileSync(join(__dirname, 'index.html'), 'utf-8')

app.get('/setup', (_req, res) => { res.send(SETUP_HTML) })
app.get('/setup/*', (_req, res) => { res.send(SETUP_HTML) })

// ── API ─────────────────────────────────────────────────────────────

// 1. 检测环境
app.post('/api/setup/check-env', (_req, res) => {
  const result: any = { node: false, npm: false, git: false }
  try { execSync('node --version', { encoding: 'utf-8', timeout: 3000 }); result.node = true } catch {}
  try { execSync('npm --version', { encoding: 'utf-8', timeout: 3000 }); result.npm = true } catch {}
  try { execSync('git --version', { encoding: 'utf-8', timeout: 3000 }); result.git = true } catch {}
  const state = getState()
  res.json({ ...result, step: state.step })
})

// 2. 获取状态
app.get('/api/setup/status', (_req, res) => {
  res.json(getState())
})

// 3. 创建管理员
app.post('/api/setup/admin', (req, res) => {
  const { username, password, display_name, class: stuClass } = req.body
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' })

  try {
    const db = getDb()

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (existing) return res.status(409).json({ error: '用户名已存在' })

    const groupId = db.prepare("SELECT id FROM permission_groups WHERE group_type = 'teacher' LIMIT 1").get() as any
    if (!groupId) return res.status(500).json({ error: '权限组未初始化，请先运行数据库迁移' })

    db.prepare(
      'INSERT INTO users (username, display_name, role, class, password, group_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(username, display_name || '管理员', 'teacher', stuClass || '', password, groupId.id)

    saveState({ admin_created: true, step: 'admin' })
    res.json({ success: true })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

// 4. 配置 API
app.post('/api/setup/config', (req, res) => {
  const { api_key, api_url, model, provider, port } = req.body

  try {
    const envPath = join(PROJECT_ROOT, 'server', '.env')
    let env = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : ''

    // Write/update .env
    const setEnv = (key: string, val: string) => {
      const re = new RegExp(`^${key}=.*`, 'm')
      if (re.test(env)) env = env.replace(re, `${key}=${val}`)
      else env += `\n${key}=${val}`
    }

    if (api_key) setEnv('API_KEY', api_key)
    if (api_url) setEnv('API_URL', api_url)
    if (model) setEnv('MODEL', model)
    if (provider) setEnv('PROVIDER', provider)
    if (port) setEnv('PORT', String(port))
    setEnv('JWT_SECRET', crypto.randomBytes(32).toString('hex'))

    writeFileSync(envPath, env.trimStart())
    saveState({ api_configured: true, port: port || 3000, step: 'config' })
    res.json({ success: true })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

// 5. 安装 PM2 并启动服务
app.post('/api/setup/apply', async (req, res) => {
  const { use_pm2 } = req.body
  const port = getState().port || 3000

  try {
    // 安装 PM2
    if (use_pm2) {
      execSync('npm install -g pm2 2>&1', { encoding: 'utf-8', timeout: 60000 })
    }

    // 写入 ecosystem.config.js
    const ecoConfig = {
      name: 'ourclass',
      script: 'node_modules/.bin/tsx',
      args: 'src/index.ts',
      cwd: join(PROJECT_ROOT, 'server'),
      env: { NODE_ENV: 'production' },
      instances: 1,
      exec_mode: 'fork',
    }

    writeFileSync(join(PROJECT_ROOT, 'ecosystem.config.js'),
      `module.exports = { apps: [${JSON.stringify(ecoConfig, null, 2)}] }`)

    if (use_pm2) {
      execSync(`cd "${PROJECT_ROOT}" && npx pm2 start ecosystem.config.js 2>&1`, { encoding: 'utf-8', timeout: 15000 })
      execSync(`cd "${PROJECT_ROOT}" && npx pm2 save 2>&1`, { encoding: 'utf-8', timeout: 10000 })
    } else {
      // 直接启动（后台进程）
      const child = spawn('npx', ['tsx', 'src/index.ts'], {
        cwd: join(PROJECT_ROOT, 'server'),
        stdio: 'inherit',
        detached: true,
      })
      child.unref()
    }

    saveState({ step: 'done', pm2_installed: !!use_pm2 })
    res.json({ success: true, port, pm2: !!use_pm2 })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

// ── Start ───────────────────────────────────────────────────────────
const WIZARD_PORT = 3001
app.listen(WIZARD_PORT, () => {
  console.log(`\n  🚀 OurClass 配置向导已启动`)
  console.log(`  ─────────────────────────────`)
  console.log(`  请打开浏览器访问:`)
  console.log(`  ${`http://localhost:${WIZARD_PORT}/setup`}`)
  console.log(`  ─────────────────────────────\n`)
})
