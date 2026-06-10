import { chromium } from 'playwright'
import { writeFileSync } from 'fs'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const pages = browser.contexts()[0]?.pages() || []
const page = pages.find(p => p.url().includes('5173')) || pages[0]
await page.goto('http://localhost:5173/teacher/traffic')
await page.waitForTimeout(10000)

// Save full screenshot to file (no API key analysis, just save)
await page.screenshot({ path: '_screenshot_check.png', fullPage: false })
console.log('saved')

await browser.close()
