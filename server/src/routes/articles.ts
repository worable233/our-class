import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync, rmdirSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { v4 as uuidv4 } from 'uuid'
import * as cheerio from 'cheerio'
import TurndownService from 'turndown'
import { getDb } from '../db/init.js'
import { authMiddleware, requirePermission } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ok, fail } from '../lib/response.js'
import { NotFoundError, ValidationError } from '../lib/errors.js'
import { writeAuditLog } from './audit.js'

/** 允许抓取的文章域名白名单（SSRF 防护） */
const ALLOWED_ARTICLE_DOMAINS = [
  'mp.weixin.qq.com',
  'weixin.qq.com',
]

const __dirname = dirname(fileURLToPath(import.meta.url))
const UPLOAD_ROOT = join(__dirname, '..', '..', 'uploads')
const ARTICLES_DIR = join(UPLOAD_ROOT, 'articles')

// Ensure articles image directory exists
if (!existsSync(ARTICLES_DIR)) mkdirSync(ARTICLES_DIR, { recursive: true })

const router = Router()
router.use(authMiddleware)

// ── Public: recent articles for homepage carousel (no auth required) ──
router.get('/recent', (_req: Request, res: Response) => {
  const db = getDb()
  const articles = db.prepare(`
    SELECT id, title, cover_url, author, created_at
    FROM articles
    ORDER BY created_at DESC
    LIMIT 10
  `).all()
  ok(res, articles)
})

// ── Turndown config ──────────────────────────────────────────────────────────

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
})

// Preserve image alt text, and clean up excessive spacing
turndown.addRule('images', {
  filter: 'img',
  replacement: (_content, node) => {
    const el = node as HTMLElement
    const src = el.getAttribute('src') || ''
    const alt = el.getAttribute('alt') || ''
    return src ? `![${alt}](${src})` : ''
  },
})

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const fetchArticleSchema = z.object({
  url: z.string().url('请输入有效的 URL'),
})

// ── Helpers ──────────────────────────────────────────────────────────────────

const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.50'

/** 验证 URL 是否在允许的域名白名单中（SSRF 防护） */
function isAllowedArticleUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    // 仅允许 HTTPS
    if (parsed.protocol !== 'https:') return false
    // 禁止内网/私有地址
    const hostname = parsed.hostname.toLowerCase()
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.16.') ||
      hostname.startsWith('192.168.') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) return false
    // 白名单匹配
    return ALLOWED_ARTICLE_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))
  } catch {
    return false
  }
}

/** 验证 URL 并且禁止内网/本地地址（SSRF 防护，用于通用 URL 检查） */
function validateExternalUrl(url: string): void {
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('仅支持 HTTP/HTTPS 协议')
    }
    const hostname = parsed.hostname.toLowerCase()
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.16.') ||
      hostname.startsWith('172.17.') ||
      hostname.startsWith('172.18.') ||
      hostname.startsWith('172.19.') ||
      hostname.startsWith('172.20.') ||
      hostname.startsWith('172.21.') ||
      hostname.startsWith('172.22.') ||
      hostname.startsWith('172.23.') ||
      hostname.startsWith('172.24.') ||
      hostname.startsWith('172.25.') ||
      hostname.startsWith('172.26.') ||
      hostname.startsWith('172.27.') ||
      hostname.startsWith('172.28.') ||
      hostname.startsWith('172.29.') ||
      hostname.startsWith('172.30.') ||
      hostname.startsWith('172.31.') ||
      hostname.startsWith('192.168.') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      throw new Error('不允许访问内网地址')
    }
  } catch (e: any) {
    if (e.message === '仅支持 HTTP/HTTPS 协议' || e.message === '不允许访问内网地址') throw e
    throw new Error('无效的 URL')
  }
}

/** Download a single image and return the local path */
async function downloadImage(url: string, articleDir: string): Promise<string | null> {
  try {
    // Only download http/https images
    if (!url.startsWith('http://') && !url.startsWith('https://')) return null

    const resp = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': UA, Referer: 'https://mp.weixin.qq.com/' },
    })
    if (!resp.ok) return null

    const contentType = resp.headers.get('content-type') || ''
    const buffer = Buffer.from(await resp.arrayBuffer())

    // Determine extension
    let ext = '.jpg'
    if (contentType.includes('png')) ext = '.png'
    else if (contentType.includes('gif')) ext = '.gif'
    else if (contentType.includes('webp')) ext = '.webp'
    // 禁止 SVG（存储型 XSS 向量）
    else if (contentType.includes('svg')) return null

    // If no content-type, try from URL path
    const urlExt = extname(new URL(url).pathname).toLowerCase()
    if (!contentType || contentType === 'application/octet-stream') {
      if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(urlExt)) ext = urlExt
    }

    const filename = `${uuidv4()}${ext}`
    const filePath = join(articleDir, filename)
    writeFileSync(filePath, buffer)
    return `/uploads/articles/${articleDir.split('\\').pop()}/${filename}`
  } catch {
    return null
  }
}

/** Find content container in a WeChat article page */
function findContentContainer($: cheerio.CheerioAPI): cheerio.Cheerio<any> | null {
  // WeChat official article
  const jsContent = $('#js_content')
  if (jsContent.length > 0) return jsContent

  // rich_media_content (alternative WeChat container)
  const richContent = $('.rich_media_content')
  if (richContent.length > 0) return richContent

  // General article containers
  const article = $('article')
  if (article.length > 0) return article

  // Largest div by HTML length (fallback)
  let largest: cheerio.Cheerio<any> | null = null
  let maxLen = 0
  $('div').each((_i: number, el: any) => {
    const html = $(el).html() || ''
    if (html.length > maxLen) {
      maxLen = html.length
      largest = $(el)
    }
  })
  return largest
}

/** Extract page title from meta tags or heading */
function extractTitle($: cheerio.CheerioAPI): string {
  return (
    $('meta[property="og:title"]').attr('content') ||
    $('#activity-name').text().trim() ||
    $('title').text().trim() ||
    ''
  )
}

/** Extract cover image URL from meta */
function extractCover($: cheerio.CheerioAPI): string {
  return $('meta[property="og:image"]').attr('content') || ''
}

/** Extract author name */
function extractAuthor($: cheerio.CheerioAPI): string {
  return (
    $('meta[property="og:article:author"]').attr('content') ||
    $('#js_name').text().trim() ||
    $('.rich_media_meta_nickname').text().trim() ||
    ''
  )
}

// ── Routes ───────────────────────────────────────────────────────────────────

// POST /api/articles/preview — preview article metadata without saving
router.post(
  '/preview',
  requirePermission('articles.manage'),
  validate(fetchArticleSchema),
  async (req: Request, res: Response) => {
    const { url } = req.body

    // SSRF 防护：验证 URL 白名单
    if (!isAllowedArticleUrl(url)) {
      return fail(res, 400, 'URL_NOT_ALLOWED', '仅支持微信公众号文章链接')
    }

    // Check duplicate
    const db = getDb()
    const dup = db.prepare('SELECT id, title, cover_url, author, created_at FROM articles WHERE url = ?').get(url) as any
    if (dup) {
      return ok(res, { ...dup, already_saved: true })
    }

    let html: string
    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(30000),
        headers: { 'User-Agent': UA },
      })
      if (!resp.ok) {
        return fail(res, 400, 'FETCH_FAILED', `无法访问该页面 (HTTP ${resp.status})`)
      }
      html = await resp.text()
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.code === 'ETIMEOUT' || err.name === 'AbortError') {
        return fail(res, 400, 'TIMEOUT', '请求超时，请稍后重试')
      }
      return fail(res, 400, 'FETCH_FAILED', '无法获取页面内容，请检查链接是否有效')
    }

    const $ = cheerio.load(html)
    const title = extractTitle($)
    const cover = extractCover($)
    const author = extractAuthor($)

    if (!title) {
      return fail(res, 400, 'CONTENT_NOT_FOUND', '未能解析到文章标题，请确认链接有效')
    }

    ok(res, { title, cover_url: cover, author, already_saved: false, url })
  },
)

// POST /api/articles/fetch — fetch a WeChat article and save to DB
router.post(
  '/fetch',
  requirePermission('articles.manage'),
  validate(fetchArticleSchema),
  async (req: Request, res: Response) => {
    const db = getDb()
    const { url } = req.body
    const userId = req.user!.id

    // SSRF 防护：验证 URL 白名单
    if (!isAllowedArticleUrl(url)) {
      return fail(res, 400, 'URL_NOT_ALLOWED', '仅支持微信公众号文章链接')
    }

    // Check duplicate
    const dup = db.prepare('SELECT id FROM articles WHERE url = ?').get(url)
    if (dup) {
      return fail(res, 409, 'DUPLICATE_URL', '该文章已存在')
    }

    // 1. Fetch page
    let html: string
    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(30000),
        headers: { 'User-Agent': UA },
      })
      if (!resp.ok) {
        return fail(res, 400, 'FETCH_FAILED', `无法访问该页面 (HTTP ${resp.status})`)
      }
      html = await resp.text()
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.code === 'ETIMEOUT' || err.name === 'AbortError') {
        return fail(res, 400, 'TIMEOUT', '请求超时，请稍后重试')
      }
      return fail(res, 400, 'FETCH_FAILED', '无法获取页面内容，请检查链接是否有效')
    }

    // 2. Parse HTML
    const $ = cheerio.load(html)
    const title = extractTitle($)
    let cover = extractCover($)
    const author = extractAuthor($)

    if (!title) {
      return fail(res, 400, 'CONTENT_NOT_FOUND', '未能解析到文章标题，请确认链接有效')
    }

    const contentContainer = findContentContainer($)
    if (!contentContainer || contentContainer.html() === null) {
      return fail(res, 400, 'CONTENT_NOT_FOUND', '未能提取到文章正文内容')
    }

    // 3. Clean up the content HTML
    const contentEl = contentContainer as cheerio.Cheerio<any>

    // Remove unwanted elements
    contentEl.find('script, style, iframe, svg, .js_pay_article, .reward_area, .rich_media_tool').remove()

    // 4. Save article placeholder to DB to get ID
    const dirId = uuidv4().slice(0, 8)
    const result = db.prepare(
      'INSERT INTO articles (url, title, content_md, cover_url, author, created_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(url, title, '(正在处理...)', cover, author, userId)
    const articleId = result.lastInsertRowid as number

    // 5. Process images: download and replace URLs
    const articleDir = join(ARTICLES_DIR, `${articleId}-${dirId}`)
    if (!existsSync(articleDir)) mkdirSync(articleDir, { recursive: true })

    const imgPromises: Promise<void>[] = []
    contentEl.find('img').each((_i: number, el: any) => {
      const $el = $(el)
      // WeChat uses data-src for lazy loading
      const imgUrl = $el.attr('data-src') || $el.attr('data-croporisrc') || $el.attr('src') || ''
      if (!imgUrl) return

      const promise = downloadImage(imgUrl, articleDir).then(localPath => {
        if (localPath) {
          // Remove width/height/style attributes, set new src
          $el.removeAttr('width').removeAttr('height').removeAttr('style')
          $el.removeAttr('data-src').removeAttr('data-croporisrc').removeAttr('data-ratio')
          $el.removeAttr('data-w').removeAttr('data-type').removeAttr('data-s')
          $el.attr('src', localPath)
        }
      })
      imgPromises.push(promise)
    })

    // Also download cover image
    if (cover && cover.startsWith('http')) {
      const coverPromise = downloadImage(cover, articleDir).then(localPath => {
        if (localPath) cover = localPath
      })
      imgPromises.push(coverPromise)
    }

    await Promise.allSettled(imgPromises)

    // 6. Get cleaned HTML and convert to Markdown
    const cleanedHtml = contentEl.html() || ''
    const contentMd = turndown.turndown(cleanedHtml)

    // 7. Update article record
    db.prepare('UPDATE articles SET content_md = ?, cover_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(contentMd, cover, articleId)

    // 8. Audit log
    writeAuditLog(userId, req.user!.display_name, 'fetch_article', 'article', articleId, { url, title })

    // 9. Return
    const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(articleId) as any
    ok(res, article)
  },
)

// POST /api/articles/:id/refresh — re-fetch an existing article by its URL
router.post(
  '/:id/refresh',
  requirePermission('articles.manage'),
  async (req: Request, res: Response) => {
    const db = getDb()
    const id = Number(req.params.id)
    if (isNaN(id)) return fail(res, 400, 'VALIDATION', '无效 ID')

    const existing = db.prepare('SELECT * FROM articles WHERE id = ?').get(id) as any
    if (!existing) throw new NotFoundError('文章不存在')

    const url = existing.url

    // SSRF 防护：验证 URL 白名单（文章已存储的 URL 再次刷新时检查）
    if (!isAllowedArticleUrl(url)) {
      return fail(res, 400, 'URL_NOT_ALLOWED', '文章来源不在允许的白名单中')
    }
    const userId = req.user!.id

    // 1. Fetch page
    let html: string
    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(30000),
        headers: { 'User-Agent': UA },
      })
      if (!resp.ok) {
        return fail(res, 400, 'FETCH_FAILED', `无法访问该页面 (HTTP ${resp.status})`)
      }
      html = await resp.text()
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.code === 'ETIMEOUT' || err.name === 'AbortError') {
        return fail(res, 400, 'TIMEOUT', '请求超时，请稍后重试')
      }
      return fail(res, 400, 'FETCH_FAILED', '无法获取页面内容，请检查链接是否有效')
    }

    // 2. Parse HTML
    const $ = cheerio.load(html)
    const title = extractTitle($)
    let cover = extractCover($)
    const author = extractAuthor($)

    if (!title) {
      return fail(res, 400, 'CONTENT_NOT_FOUND', '未能解析到文章标题')
    }

    const contentContainer = findContentContainer($)
    if (!contentContainer || contentContainer.html() === null) {
      return fail(res, 400, 'CONTENT_NOT_FOUND', '未能提取到文章正文内容')
    }

    const contentEl = contentContainer as cheerio.Cheerio<any>
    contentEl.find('script, style, iframe, svg, .js_pay_article, .reward_area, .rich_media_tool').remove()

    // 3. Clean up old images
    const articlesImgDir = join(ARTICLES_DIR)
    if (existsSync(articlesImgDir)) {
      const dirs = readdirSync(articlesImgDir)
      for (const dir of dirs) {
        if (dir.startsWith(`${id}-`)) {
          const fullPath = join(articlesImgDir, dir)
          try {
            const files = readdirSync(fullPath)
            for (const f of files) unlinkSync(join(fullPath, f))
            rmdirSync(fullPath)
          } catch { /* ignore */ }
        }
      }
    }

    // 4. Download new images
    const dirTag = uuidv4().slice(0, 8)
    const articleDir = join(ARTICLES_DIR, `${id}-${dirTag}`)
    if (!existsSync(articleDir)) mkdirSync(articleDir, { recursive: true })

    const imgPromises: Promise<void>[] = []
    contentEl.find('img').each((_i: number, el: any) => {
      const $el = $(el)
      const imgUrl = $el.attr('data-src') || $el.attr('data-croporisrc') || $el.attr('src') || ''
      if (!imgUrl) return

      const promise = downloadImage(imgUrl, articleDir).then(localPath => {
        if (localPath) {
          $el.removeAttr('width').removeAttr('height').removeAttr('style')
          $el.removeAttr('data-src').removeAttr('data-croporisrc').removeAttr('data-ratio')
          $el.removeAttr('data-w').removeAttr('data-type').removeAttr('data-s')
          $el.attr('src', localPath)
        }
      })
      imgPromises.push(promise)
    })

    if (cover && cover.startsWith('http')) {
      const coverPromise = downloadImage(cover, articleDir).then(localPath => {
        if (localPath) cover = localPath
      })
      imgPromises.push(coverPromise)
    }

    await Promise.allSettled(imgPromises)

    // 5. Convert to Markdown and update
    const cleanedHtml = contentEl.html() || ''
    const contentMd = turndown.turndown(cleanedHtml)

    db.prepare(
      'UPDATE articles SET title = ?, content_md = ?, cover_url = ?, author = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(title, contentMd, cover, author, id)

    writeAuditLog(userId, req.user!.display_name, 'refresh_article', 'article', id, { url, title })

    const updated = db.prepare('SELECT * FROM articles WHERE id = ?').get(id) as any
    ok(res, updated)
  },
)

// GET /api/articles — list all saved articles
router.get('/', requirePermission('articles.read'), (_req: Request, res: Response) => {
  const db = getDb()
  const articles = db.prepare(`
    SELECT id, url, title, cover_url, author, created_by, created_at, updated_at,
           LENGTH(content_md) as content_length
    FROM articles
    ORDER BY created_at DESC
  `).all()
  ok(res, articles)
})

// GET /api/articles/:id — get single article
router.get('/:id', requirePermission('articles.read'), (req: Request, res: Response) => {
  const db = getDb()
  const id = Number(req.params.id)
  if (isNaN(id)) return fail(res, 400, 'VALIDATION', '无效 ID')

  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(id) as any
  if (!article) throw new NotFoundError('文章不存在')

  ok(res, article)
})

// DELETE /api/articles/:id — delete article and its images
router.delete('/:id', requirePermission('articles.manage'), (req: Request, res: Response) => {
  const db = getDb()
  const id = Number(req.params.id)
  if (isNaN(id)) return fail(res, 400, 'VALIDATION', '无效 ID')

  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(id) as any
  if (!article) throw new NotFoundError('文章不存在')

  // Delete image directory
  const articlesImgDir = join(ARTICLES_DIR)
  if (existsSync(articlesImgDir)) {
    const dirs = readdirSync(articlesImgDir)
    for (const dir of dirs) {
      if (dir.startsWith(`${id}-`)) {
        const fullPath = join(articlesImgDir, dir)
        try {
          const files = readdirSync(fullPath)
          for (const f of files) unlinkSync(join(fullPath, f))
          rmdirSync(fullPath)
        } catch { /* ignore */ }
      }
    }
  }

  db.prepare('DELETE FROM articles WHERE id = ?').run(id)

  writeAuditLog(req.user!.id, req.user!.display_name, 'delete_article', 'article', id, {
    title: article.title,
  })
  ok(res, { success: true })
})

export default router
