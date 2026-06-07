#!/usr/bin/env node
/**
 * 浏览器查看 MCP 服务器
 * 提供一个 see_browser 工具: 截取 Edge 页面 → MiMo 识别 → 返回描述
 */
import { chromium } from 'playwright'
import { readFileSync } from 'fs'
import { createInterface } from 'readline'

const MIMO_API_KEY = process.env.MIMO_API_KEY || ''
const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9222'

if (!MIMO_API_KEY) {
  console.error('错误: 请设置 MIMO_API_KEY 环境变量')
  process.exit(1)
}

// ====== MCP 协议实现 ======
const rl = createInterface({ input: process.stdin })
let msgId = 0

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
}
function respondError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n')
}

async function handleRequest(msg) {
  const { id, method, params } = msg
  switch (method) {
    case 'initialize':
      respond(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'browser-see', version: '1.0.0' }
      })
      break
    case 'initialized':
      break
    case 'tools/list':
      respond(id, {
        tools: [{
          name: 'see_browser',
          description: '查看 Edge 浏览器当前页面的截图,用 MiMo 视觉模型识别后返回页面内容描述。不需要任何参数。',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: '可选:针对截图的具体问题,例如"这个页面有哪些按钮?"'
              }
            }
          }
        }]
      })
      break
    case 'tools/call':
      await handleToolCall(id, params)
      break
    default:
      respond(id, {})
  }
}

async function handleToolCall(id, params) {
  const { name, arguments: args } = params
  if (name !== 'see_browser') {
    respondError(id, -32601, `Unknown tool: ${name}`)
    return
  }

  try {
    const browser = await chromium.connectOverCDP(CDP_URL)
    const pages = browser.contexts()[0]?.pages() || []
    if (!pages.length) {
      respondError(id, -32000, '浏览器中没有打开的标签页')
      await browser.close()
      return
    }
    const page = pages[pages.length - 1]
    const title = await page.title()
    const url = page.url()

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.screenshot({ path: '_screenshot.png' })

    const b64 = readFileSync('_screenshot.png').toString('base64')
    const prompt = args?.prompt || '请详细描述这张截图中的内容，包括标题、按钮、文字、布局等所有可见元素。'

    const res = await fetch('https://api.xiaomimimo.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': MIMO_API_KEY },
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
    const description = data.choices?.[0]?.message?.content || '(识别失败)'

    const pageText = await page.evaluate(() => document.body.innerText)

    await browser.close()

    respond(id, {
      content: [
        { type: 'text', text: `📄 ${title}\n🔗 ${url}\n\n${description}\n\n--- 页面文字 ---\n${pageText.substring(0, 2000)}` }
      ]
    })
  } catch (err) {
    respondError(id, -32000, err.message)
  }
}

for await (const line of rl) {
  if (!line.trim()) continue
  try {
    const msg = JSON.parse(line)
    if (msg.method && (msg.id !== undefined || msg.id === null)) {
      handleRequest(msg).catch(e => respondError(msg.id, -32603, e.message))
    }
  } catch {}
}
