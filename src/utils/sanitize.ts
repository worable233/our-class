/**
 * XSS 防护 — HTML 净化工具
 * 在 v-html 渲染之前使用 DOMPurify 过滤所有用户/AI 生成内容
 */
import DOMPurify from 'dompurify'

const purify = DOMPurify(window as any)

/** 安全的 HTML 渲染，带 XSS 过滤 */
export function safeHtml(html: string): string {
  return purify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'hr',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'pre', 'code',
      'blockquote', 'strong', 'em', 'del', 'ins', 'sub', 'sup',
      'a', 'img',
      'div', 'span', 'section',
      'input',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel',
      'src', 'alt', 'width', 'height',
      'class', 'id',
      'type', 'checked', 'disabled',
    ],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'], // for links
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'svg', 'math'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  })
}
