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
}

function getState(): SetupState {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
  } catch {
    return { step: 'idle', admin_created: false, api_configured: false, port: 3000 }
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
  // Ensure tables exist (in case migrations had issues)
  db.exec(`
    CREATE TABLE IF NOT EXISTS permission_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      group_type TEXT NOT NULL DEFAULT 'custom'
    );
    CREATE TABLE IF NOT EXISTS group_permissions (
      group_id INTEGER NOT NULL,
      permission_code TEXT NOT NULL,
      PRIMARY KEY (group_id, permission_code),
      FOREIGN KEY (group_id) REFERENCES permission_groups(id) ON DELETE CASCADE
    );
  `)

  // 只检查 admin 组是否存在——种子数据可能已有 教师/学生 组但没有 运维 组
  const adminExists = db.prepare("SELECT COUNT(*) as c FROM permission_groups WHERE group_type = 'admin'").get() as { c: number }
  if (adminExists.c > 0) return

  const insert = db.prepare('INSERT INTO group_permissions (group_id, permission_code) VALUES (?, ?)')

  // ── 运维组：拥有所有权限 ──────────────────────────────────────────
  const adminGroup = db.prepare('INSERT INTO permission_groups (name, description, group_type) VALUES (?, ?, ?)')
    .run('运维', '系统运维管理员，拥有全部权限', 'admin')

  const adminPermissions = [
    'students.write',
    'points.read', 'points.write',
    'scores.read', 'scores.write',
    'assignments.write', 'assignments.read', 'assignments.submit',
    'chat.access', 'chat.config', 'chat.unlimited',
    'roles.manage',
    'audit_logs.read',
    'classes.view_all',
    'tool.student.read', 'tool.student.write',
    'tool.score.read', 'tool.score.write',
    'tool.assignment', 'tool.utility', 'tool.article',
    'articles.manage', 'articles.read',
  ]
  for (const perm of adminPermissions) {
    insert.run(adminGroup.lastInsertRowid, perm)
  }

  // ── 教师组：教学相关权限（无系统管理权限） ─────────────────────────
  const teacherGroup = db.prepare('INSERT INTO permission_groups (name, description, group_type) VALUES (?, ?, ?)')
    .run('教师', '默认教师权限组，拥有教学管理权限', 'teacher')

  const teacherPermissions = [
    'students.write',
    'points.read', 'points.write',
    'scores.read', 'scores.write',
    'assignments.write', 'assignments.read',
    'chat.access', 'chat.unlimited',
    'tool.student.read', 'tool.student.write',
    'tool.score.read', 'tool.score.write',
    'tool.assignment', 'tool.utility', 'tool.article',
    'articles.read',
  ]
  for (const perm of teacherPermissions) {
    insert.run(teacherGroup.lastInsertRowid, perm)
  }

  // ── 学生组：基础权限 ─────────────────────────────────────────────
  const studentGroup = db.prepare('INSERT INTO permission_groups (name, description, group_type) VALUES (?, ?, ?)')
    .run('学生', '默认学生权限组，拥有基础权限', 'student')

  const studentPermissions = [
    'points.read',
    'scores.read',
    'assignments.read',
    'assignments.submit',
    'chat.access',
    'tool.student.read',
    'tool.score.read',
    'tool.assignment',
    'tool.utility',
    'tool.article',
    'articles.read',
  ]
  for (const perm of studentPermissions) {
    insert.run(studentGroup.lastInsertRowid, perm)
  }
}

const distPath = join(PROJECT_ROOT, 'dist')
const publicPath = join(PROJECT_ROOT, 'public')

const app = express()

// ── CORS (needed when accessed from different origin) ─────────────────
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

// Serve favicon — 都返回 SVG logo，覆盖浏览器默认请求 /favicon.ico
app.get(['/favicon.ico', '/favicon.svg'], (_req, res) => {
  const faviconPath = join(publicPath, 'favicon.svg')
  if (existsSync(faviconPath)) {
    res.type('image/svg+xml').sendFile(faviconPath)
  } else {
    res.status(404).end()
  }
})

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

    // 查找运维权限组（按 group_type + 名称双重回退）
    let groupRow = db.prepare("SELECT id FROM permission_groups WHERE group_type = 'admin' LIMIT 1").get() as any
    if (!groupRow) {
      groupRow = db.prepare("SELECT id FROM permission_groups WHERE name = '运维' LIMIT 1").get() as any
    }
    if (!groupRow) {
      // 仍没找到，直接创建
      const result = db.prepare("INSERT INTO permission_groups (name, description, group_type) VALUES (?, ?, ?)")
        .run('运维', '系统运维管理员，拥有全部权限', 'admin')
      groupRow = { id: result.lastInsertRowid }
    }
    const groupId = groupRow.id

    // Hash password with bcrypt before storing
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS)

    db.prepare(
      'INSERT INTO users (username, display_name, role, class, password, group_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(username, display_name || '管理员', 'teacher', stuClass || '', hashedPassword, groupId)

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

// 5. 启动服务（流式输出日志）
app.post('/api/setup/apply', async (req, res) => {
  let port = getState().port || 3000

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

  // ── Start streaming response ──
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  function emit(msg: string) {
    try { res.write(msg + '\n') } catch { /* client disconnected */ }
  }
  function emitDone(payload: object) {
    try { res.write('__DONE__:' + JSON.stringify(payload) + '\n') } catch {}
    try { res.end() } catch {}
  }

  try {
    // 1. Build frontend
    emit('[1/2] 构建前端...')
    try {
      execSync('npm run build-only 2>&1', { encoding: 'utf-8', timeout: 120000, cwd: PROJECT_ROOT })
      emit('✅ 前端构建完成')
    } catch (buildErr: any) {
      emit('⚠️ 前端构建失败: ' + buildErr.message)
    }

    // 2. Start server
    emit('[2/2] 启动服务...')

    const isWin = process.platform === 'win32'
    const serverCwd = join(PROJECT_ROOT, 'server')
    const targetPort = getState().port || 3000

    // Try multiple methods to start the server
    let started = false
    let lastError = ''

    // Method 1: Use npx tsx (most reliable across platforms)
    emit('  尝试启动服务...')
    try {
      const child = spawn('npx', ['tsx', 'src/index.ts'], {
        cwd: serverCwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: false,
        shell: isWin,
      })

      // Capture errors
      let stderr = ''
      child.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      // Check if process exits immediately
      let exited = false
      child.on('exit', (code) => {
        exited = true
        if (code !== 0) {
          lastError = stderr || `进程退出码: ${code}`
        }
      })

      // Wait a bit to see if process stays alive
      await new Promise(r => setTimeout(r, 2000))

      if (exited) {
        emit(`  ⚠️ 进程立即退出: ${lastError.slice(0, 200)}`)
      } else {
        // Process is alive, wait for health check
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 1000))
          try {
            const r = await fetch(`http://localhost:${targetPort}/api/health`)
            if (r.ok) { started = true; break }
          } catch { /* not ready yet */ }
        }
      }
    } catch (spawnErr: any) {
      lastError = spawnErr.message
    }

    // Method 2: Fallback to direct node command if npx failed
    if (!started) {
      emit('  尝试备用启动方式...')
      try {
        const tsxCli = join(serverCwd, 'node_modules', 'tsx', 'dist', 'cli.mjs')
        const child2 = spawn('node', [tsxCli, 'src/index.ts'], {
          cwd: serverCwd,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: false,
          shell: isWin,
        })

        let stderr2 = ''
        child2.stderr?.on('data', (data) => {
          stderr2 += data.toString()
        })

        let exited2 = false
        child2.on('exit', (code) => {
          exited2 = true
          if (code !== 0) {
            lastError = stderr2 || `进程退出码: ${code}`
          }
        })

        await new Promise(r => setTimeout(r, 2000))

        if (!exited2) {
          for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 1000))
            try {
              const r = await fetch(`http://localhost:${targetPort}/api/health`)
              if (r.ok) { started = true; break }
            } catch { /* not ready yet */ }
          }
        }
      } catch (spawnErr2: any) {
        lastError = spawnErr2.message
      }
    }

    if (started) {
      emit(`✅ 服务启动成功 (http://localhost:${targetPort})`)
    } else {
      emit('⚠️ 服务启动失败')
      if (lastError) {
        emit(`  错误: ${lastError.slice(0, 300)}`)
      }
      emit('  请手动启动: cd server && npx tsx src/index.ts')
    }

    saveState({ step: 'done' })
    emitDone({ success: true, port: targetPort })
  } catch (e: any) {
    console.error('[setup] apply error:', e)
    emitDone({ success: false, error: e.message })
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
