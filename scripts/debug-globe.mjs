import { chromium } from 'playwright'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const page = (await browser.contexts()[0]?.pages())?.find(p => p.url().includes('5173'))
await page.goto('http://localhost:5173/teacher/traffic')
await page.waitForTimeout(8000)

const result = await page.evaluate(() => {
  // Find WebGL canvases (globe uses WebGL, ECharts uses 2D canvas with ZRender)
  const allCanvas = document.querySelectorAll('canvas')
  const info = []
  for (const c of allCanvas) {
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    info.push({
      w: c.width, h: c.height,
      isWebGL: !!gl,
      hasZr: c.hasAttribute('data-zr-dom-id'),
    })
  }

  // Find the globe container specifically
  const globeWrap = document.querySelector('[class*="globe-wrap"]')

  return {
    canvasInfo: info,
    hasGlobeWrap: !!globeWrap,
    globeWrapSize: globeWrap ? `${globeWrap.scrollWidth}x${globeWrap.scrollHeight}` : 'none',
    globeWrapChildren: globeWrap ? globeWrap.children.length : 0,
    globeWrapHTML: globeWrap ? globeWrap.innerHTML.substring(0, 200) : 'none',
  }
})

console.log(JSON.stringify(result, null, 2))
await browser.close()
