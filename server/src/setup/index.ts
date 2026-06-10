import express from 'express'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, writeFileSync, readFileSync } from 'fs'
import { execSync, spawn } from 'child_process'
import crypto from 'crypto'
import bcrypt from 'bcrypt'
import cors from 'cors'
import { getDb } from '../db/init.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..', '..', '..')
const STATE_FILE = join(__dirname, 'setup-state.json')

const BCRYPT_ROUNDS = 10

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
  try {
    const state = { ...getState(), ...s }
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
  } catch (e) {
    console.error('[setup] Failed to save state:', e)
  }
}

/**
 * Validate a port number is in the valid range (1–65535).
 * Returns null if valid, or an error message string if invalid.
 */
function validatePort(port: unknown): string | null {
  const n = typeof port === 'string' ? parseInt(port, 10) : Number(port)
  if (isNaN(n) || n !== n) return '端口号必须是数字'
  if (!Number.isInteger(n)) return '端口号必须是整数'
  if (n < 1 || n > 65535) return '端口号必须在 1–65535 之间'
  if (n < 1024) return '端口号小于 1024 需要管理员权限，建议使用 1024 以上的端口'
  return null
}

/**
 * Initialize default permission groups if they don't exist.
 * This replaces the old seed data that was removed.
 */
function ensurePermissionGroups(db: any) {
  const count = db.prepare('SELECT COUNT(*) as c FROM permission_groups').get() as { c: number }
  if (count.c > 0) return

  // Default teacher group — all permissions
  const teacherGroup = db.prepare('INSERT INTO permission_groups (name, description, group_type) VALUES (?, ?, ?)')
    .run('教师', '默认教师权限组，拥有全部权限', 'teacher')

  // Default student group — basic permissions
  const studentGroup = db.prepare('INSERT INTO permission_groups (name, description, group_type) VALUES (?, ?, ?)')
    .run('学生', '默认学生权限组，拥有基础权限', 'student')

  const allPermissions = [
    'students.write',
    'points.read', 'points.write',
    'scores.write',
    'assignments.write', 'assignments.submit',
    'chat.access', 'chat.config', 'chat.unlimited',
    'roles.manage',
    'audit_logs.read',
    'classes.view_all',
    'tool.student.read', 'tool.student.write',
    'tool.score.read', 'tool.score.write',
    'tool.assignment',
    'tool.utility',
  ]
  const studentPermissions = [
    'points.read',
    'assignments.submit',
    'chat.access',
    'tool.student.read',
    'tool.score.read',
    'tool.assignment',
  ]

  const insert = db.prepare('INSERT INTO group_permissions (group_id, permission_code) VALUES (?, ?)')
  for (const perm of allPermissions) {
    insert.run(teacherGroup.lastInsertRowid, perm)
  }
  for (const perm of studentPermissions) {
    insert.run(studentGroup.lastInsertRowid, perm)
  }
}

const distPath = join(PROJECT_ROOT, 'dist')

const app = express()

// ── CORS (needed when accessed from different origin) ─────────────────
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

// Serve built frontend (setup wizard reuses it with /setup route)
if (existsSync(distPath)) {
  app.use(express.static(distPath))
}

// ── Setup HTML page (with no-cache headers) ────────────
const SETUP_HTML = readFileSync(join(__dirname, 'index.html'), 'utf-8')

const noCache = (_req: any, res: any, next: any) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  res.set('Pragma', 'no-cache')
  res.set('Expires', '0')
  next()
}

app.get('/setup', noCache, (_req, res) => { res.send(SETUP_HTML) })
app.get('/setup/*', noCache, (_req, res) => { res.send(SETUP_HTML) })

// ── API ─────────────────────────────────────────────────────────────

// 1. 检测环境
app.post('/api/setup/check-env', (_req, res) => {
  const result: any = { node: false, npm: false, git: false }
  try { execSync('node --version', { encoding: 'utf-8', timeout: 3000 }); result.node = true } catch (e) { console.error('[setup] node check failed:', e) }
  try { execSync('npm --version', { encoding: 'utf-8', timeout: 3000 }); result.npm = true } catch (e) { console.error('[setup] npm check failed:', e) }
  try { execSync('git --version', { encoding: 'utf-8', timeout: 3000 }); result.git = true } catch (e) { console.error('[setup] git check failed:', e) }
  const state = getState()
  res.json({ ...result, step: state.step })
})

// 2. 获取状态
app.get('/api/setup/status', (_req, res) => {
  res.json(getState())
})

// 3. 创建管理员
app.post('/api/setup/admin', async (req, res) => {
  const { username, password, display_name, class: stuClass } = req.body
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' })
  if (password.length < 6) return res.status(400).json({ error: '密码长度不能少于 6 位' })
  if (!/^[a-zA-Z0-9_一-鿿]{2,32}$/.test(username)) {
    return res.status(400).json({ error: '用户名只能包含字母、数字、下划线和中文，长度 2-32 位' })
  }

  try {
    const db = getDb()

    // Ensure default permission groups exist (in case seed data was removed)
    ensurePermissionGroups(db)

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (existing) return res.status(409).json({ error: '用户名已存在' })

    const groupId = db.prepare("SELECT id FROM permission_groups WHERE group_type = 'teacher' LIMIT 1").get() as any
    if (!groupId) return res.status(500).json({ error: '权限组初始化失败' })

    // Hash password with bcrypt before storing
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS)

    db.prepare(
      'INSERT INTO users (username, display_name, role, class, password, group_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(username, display_name || '管理员', 'teacher', stuClass || '', hashedPassword, groupId.id)

    saveState({ admin_created: true, step: 'admin' })
    res.json({ success: true })
  } catch (e: any) {
    console.error('[setup] create admin error:', e)
    res.status(500).json({ error: '创建管理员失败: ' + e.message })
  }
})

// 4. 配置 API
app.post('/api/setup/config', (req, res) => {
  const { api_key, api_url, model, provider, port } = req.body

  // Validate port if provided
  if (port !== undefined && port !== null && port !== '') {
    const portErr = validatePort(port)
    if (portErr) return res.status(400).json({ error: portErr })
  }

  try {
    const envPath = join(PROJECT_ROOT, 'server', '.env')
    let env = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : ''

    // Write/update .env (for documentation/reference — actual API keys are read from the DB)
    const setEnv = (key: string, val: string) => {
      const re = new RegExp(`^${key}=.*`, 'm')
      if (re.test(env)) env = env.replace(re, `${key}=${val}`)
      else env += `\n${key}=${val}`
    }

    if (api_key) setEnv('API_KEY', api_key)
    if (api_url) setEnv('API_URL', api_url)
    if (model) setEnv('MODEL', model)
    if (provider) setEnv('PROVIDER', provider)
    if (port !== undefined && port !== null && port !== '') setEnv('PORT', String(Number(port)))

    // Only regenerate JWT_SECRET if it doesn't already exist in .env
    const existingEnv = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : ''
    if (!/^JWT_SECRET=/m.test(existingEnv)) {
      setEnv('JWT_SECRET', crypto.randomBytes(32).toString('hex'))
    }

    writeFileSync(envPath, env.trim())

    // ── Also write API key to `api_keys` DB table (the chat system reads from here) ──
    const db = getDb()
    const adminUser = db.prepare("SELECT id FROM users WHERE role = 'teacher' ORDER BY id ASC LIMIT 1").get() as any
    if (adminUser && api_key) {
      const existingKey = db.prepare('SELECT id FROM api_keys ORDER BY id ASC LIMIT 1').get() as any
      if (existingKey) {
        db.prepare('DELETE FROM api_keys').run()
      }
      db.prepare(
        'INSERT INTO api_keys (user_id, provider, api_key, api_url, model) VALUES (?, ?, ?, ?, ?)'
      ).run(adminUser.id, provider || 'anthropic', api_key, api_url || '', model || '')
    }

    saveState({ api_configured: true, port: Number(port) || 3000, step: 'config' })
    res.json({ success: true })
  } catch (e: any) {
    console.error('[setup] config save error:', e)
    res.status(500).json({ error: '保存配置失败: ' + e.message })
  }
})

// 5. 安装 PM2 并启动服务
app.post('/api/setup/apply', async (req, res) => {
  const { use_pm2 } = req.body
  const port = getState().port || 3000

  // Validate: admin and config must be done
  const state = getState()
  if (!state.admin_created) {
    return res.status(400).json({ error: '请先创建管理员账号' })
  }
  if (!state.api_configured) {
    return res.status(400).json({ error: '请先完成 AI 接口配置' })
  }

  // Verify JWT_SECRET exists in .env before starting
  const envPath = join(PROJECT_ROOT, 'server', '.env')
  let jwtSecretSet = false
  if (existsSync(envPath)) {
    const env = readFileSync(envPath, 'utf-8')
    jwtSecretSet = /^JWT_SECRET=./m.test(env)
  }
  if (!jwtSecretSet) {
    return res.status(400).json({ error: 'JWT_SECRET 未配置，请先保存配置' })
  }

  try {
    // Install PM2
    if (use_pm2) {
      execSync('npm install -g pm2 2>&1', { encoding: 'utf-8', timeout: 120000 })
    }

    // Write ecosystem.config.js
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
      // Use 'pm2' directly (just installed globally) rather than 'npx pm2'
      execSync(`cd "${PROJECT_ROOT}" && pm2 start ecosystem.config.js 2>&1`, { encoding: 'utf-8', timeout: 15000 })
      execSync(`cd "${PROJECT_ROOT}" && pm2 save 2>&1`, { encoding: 'utf-8', timeout: 10000 })
    } else {
      // 直接启动（后台进程）— 使用 stdio: 'ignore' 确保父进程退出后子进程独立运行
      const child = spawn('npx', ['tsx', 'src/index.ts'], {
        cwd: join(PROJECT_ROOT, 'server'),
        stdio: 'ignore',
        detached: true,
      })
      child.on('error', (err) => {
        console.error('[setup] failed to spawn server:', err)
      })
      child.unref()
    }

    saveState({ step: 'done', pm2_installed: !!use_pm2 })
    res.json({ success: true, port, pm2: !!use_pm2 })
  } catch (e: any) {
    console.error('[setup] apply error:', e)
    res.status(500).json({ error: e.message })
  }
})

// ── Start ───────────────────────────────────────────────────────────
// Try port 3001, fall back if taken
const WIZARD_PORT = 3001
const server = app.listen(WIZARD_PORT)
server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ❌ 端口 ${WIZARD_PORT} 已被占用`)
    console.error(`  请检查是否有其他进程在使用该端口`)
    console.error(`  或手动终止占用进程后重试\n`)
    process.exit(1)
  }
  throw err
})
server.on('listening', () => {
  console.log(`\n  🚀 OurClass 配置向导已启动`)
  console.log(`  ─────────────────────────────`)
  console.log(`  请打开浏览器访问:`)
  console.log(`  http://localhost:${WIZARD_PORT}/setup`)
  console.log(`  ─────────────────────────────\n`)
})
