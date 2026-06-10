import { chromium } from 'playwright'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const page = (await browser.contexts()[0]?.pages())?.find(p => p.url().includes('5173'))
await page.goto('http://localhost:5173/teacher/traffic')
await page.waitForTimeout(8000)
await page.screenshot({ path: '_screenshot_check.png' })
console.log('OK')
await browser.close()
