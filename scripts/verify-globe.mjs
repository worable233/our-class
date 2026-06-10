import { readFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { chromium } from 'playwright'

function getKey() {
  const p = join(homedir(), '.claude', 'settings.local.json')
  if (existsSync(p)) {
    try { const c = JSON.parse(readFileSync(p, 'utf-8')); if (c.env?.MIMO_API_KEY) return c.env.MIMO_API_KEY } catch {}
  }
  return ''
}

const KEY = getKey()
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const pages = browser.contexts()[0]?.pages() || []
const page = pages.find(p => p.url().includes('5173')) || pages[0]
await page.goto('http://localhost:5173/teacher/traffic')
await page.waitForTimeout(10000)
await page.screenshot({ path: '_screenshot_globe.png' })

if (KEY) {
  const b64 = readFileSync('_screenshot_globe.png').toString('base64')
  const res = await fetch('https://api.xiaomimimo.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': KEY },
    body: JSON.stringify({
      model: 'mimo-v2.5',
      messages: [{ role: 'user', content: [{ type: 'text', text: '看图：3D地球能看到国家轮廓/多边形吗？有颜色吗？一句回答。' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,' + b64 } }] }],
      max_tokens: 128
    })
  })
  const d = await res.json()
  console.log('结果:', d.choices?.[0]?.message?.content || '失败')
} else {
  console.log('NO_KEY')
}
await browser.close()
