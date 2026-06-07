import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

// Try env var first, then fallback to ~/.claude/settings.local.json
function getApiKey() {
  if (process.env.MIMO_API_KEY) return process.env.MIMO_API_KEY
  const settingsPath = join(homedir(), '.claude', 'settings.local.json')
  if (existsSync(settingsPath)) {
    try {
      const cfg = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      if (cfg.env?.MIMO_API_KEY) return cfg.env.MIMO_API_KEY
    } catch {}
  }
  return ''
}

const API_KEY = getApiKey()

async function main() {
  const prompt = process.argv[2] || '请详细描述这张截图中的内容。'
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const pages = browser.contexts()[0]?.pages() || []
  if (!pages.length) { console.log('❌ 没有找到标签页'); await browser.close(); return }
  const page = pages[pages.length - 1]
  const title = await page.title()
  const url = page.url()

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.screenshot({ path: '_screenshot.png' })

  // 调用 MiMo API
  const fs = await import('fs')
  const b64 = fs.readFileSync('_screenshot.png').toString('base64')
  const res = await fetch('https://api.xiaomimimo.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': API_KEY },
    body: JSON.stringify({
      model: 'mimo-v2.5',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } }
        ]
      }],
      max_tokens: 2048
    })
  })
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content || '识别失败'
  console.log(`📄 ${title}\n🔗 ${url}\n`)
  console.log(content)

  await browser.close()
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })
