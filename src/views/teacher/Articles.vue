<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api/client'
import { useDialog, useMessage } from 'naive-ui'
import {
  NButton, NInput, NModal, NSpin, NEmpty, NText, NCard, NDivider,
  NScrollbar, NSpace, NTag,
} from 'naive-ui'
import {
  ExternalLink, Trash2, Eye, Globe, RefreshCw, Link as LinkIcon,
  Newspaper, CalendarDays, User, FileText, ArrowUpRight,
} from '@lucide/vue'
import { marked } from 'marked'

marked.use({ breaks: true, gfm: true })

interface Article {
  id: number
  url: string
  title: string
  content_md: string
  cover_url: string
  author: string
  content_length?: number
  created_at: string
  updated_at: string
}

const dialog = useDialog()
const message = useMessage()

const articles = ref<Article[]>([])
const loading = ref(true)
const fetching = ref(false)
const refreshingId = ref<number | null>(null)
const articleUrl = ref('')

// Detail modal
const showDetail = ref(false)
const detailArticle = ref<Article | null>(null)
const detailLoading = ref(false)

async function refreshArticle(article: Article) {
  refreshingId.value = article.id
  try {
    await api.post(`/articles/${article.id}/refresh`, {})
    message.success('文章已刷新')
    load()
    if (showDetail.value && detailArticle.value?.id === article.id) {
      const full = await api.get<Article>(`/articles/${article.id}`)
      detailArticle.value = full
    }
  } catch (e: any) {
    message.error(e.message || '刷新失败')
  } finally {
    refreshingId.value = null
  }
}

function load() {
  loading.value = true
  api.get<Article[]>('/articles')
    .then(d => { articles.value = d || [] })
    .catch(() => message.error('加载失败'))
    .finally(() => { loading.value = false })
}

async function fetchArticle() {
  if (!articleUrl.value.trim()) return
  fetching.value = true
  try {
    await api.post('/articles/fetch', { url: articleUrl.value.trim() })
    message.success('文章提取成功')
    articleUrl.value = ''
    load()
  } catch (e: any) {
    message.error(e.message || '提取失败')
  } finally {
    fetching.value = false
  }
}

async function openDetail(article: Article) {
  showDetail.value = true
  detailLoading.value = true
  detailArticle.value = null
  try {
    const full = await api.get<Article>(`/articles/${article.id}`)
    detailArticle.value = full
  } catch (e: any) {
    message.error(e.message || '加载失败')
  } finally {
    detailLoading.value = false
  }
}

function closeDetail() {
  showDetail.value = false
  detailArticle.value = null
}

function confirmDelete(article: Article) {
  dialog.warning({
    title: '确认删除',
    content: `确定要删除「${article.title || '未命名文章'}」吗？图片文件也会一并删除。`,
    positiveText: '删除',
    negativeText: '取消',
    positiveButtonProps: { type: 'error' as const },
    onPositiveClick: async () => {
      try {
        await api.delete(`/articles/${article.id}`)
        message.success('已删除')
        load()
        if (showDetail.value && detailArticle.value?.id === article.id) {
          closeDetail()
        }
      } catch (e: any) {
        message.error(e.message || '删除失败')
      }
    },
  })
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function renderMarkdown(md: string): string {
  if (!md) return ''
  let html = marked.parse(md) as string
  // Code blocks with copy button (matching ChatMessage.vue)
  html = html.replace(
    /<pre><code class="language-(\w*)">([\s\S]*?)<\/code><\/pre>/g,
    (_, lang, code) => {
      return `<div class="code-block-wrapper"><div class="code-block-header"><figcaption>${lang || 'code'}</figcaption><button class="code-copy-btn" data-action="copy-code"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button></div><div class="code-block-body"><pre><code>${code}</code></pre></div></div>`
    },
  )
  return html
}

onMounted(load)
</script>

<template>
  <div style="display:flex;flex-direction:column;gap:16px;">
    <!-- ═══ 页面标题 ═══ -->
    <div>
      <NText tag="h1" depth="1" style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.03em;">公众号文章</NText>
      <NText depth="3" style="margin-top:4px;display:block;font-size:13px;">输入链接自动提取内容，保存为 Markdown 格式</NText>
    </div>

    <!-- ═══ URL 输入区 ═══ -->
    <NCard :bordered="true" size="small" style="padding:2px 0;">
      <div style="display:flex;align-items:flex-end;gap:10px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:6px;display:flex;align-items:center;gap:6px;">
            <Globe :size="14" />
            <span>公众号文章链接</span>
          </div>
          <NInput
            v-model:value="articleUrl"
            placeholder="https://mp.weixin.qq.com/s/..."
            :disabled="fetching"
            clearable
            @keyup.enter="fetchArticle"
            size="large"
          />
        </div>
        <NButton
          type="primary"
          @click="fetchArticle"
          :loading="fetching"
          :disabled="!articleUrl.trim()"
          size="large"
          round
          style="flex-shrink:0;min-width:120px;height:40px;"
        >
          <template #icon><LinkIcon :size="16" /></template>
          {{ fetching ? '提取中...' : '提取内容' }}
        </NButton>
      </div>
    </NCard>

    <!-- ═══ 文章列表 ═══ -->
    <NCard :bordered="true" size="small" style="flex:1;min-height:260px;padding:0;overflow:hidden;">
      <NSpin :show="loading" style="min-height:200px;">
        <template v-if="articles.length > 0">
          <!-- 表头 -->
          <div class="list-header">
            <div class="col-cover" style="width:52px;" />
            <div class="col-title" style="flex:1;min-width:0;">标题</div>
            <div class="col-author" style="width:100px;">作者</div>
            <div class="col-date" style="width:110px;">日期</div>
            <div class="col-size" style="width:72px;text-align:right;">字数</div>
            <div class="col-actions" style="width:144px;text-align:right;">操作</div>
          </div>
          <!-- 行 -->
          <div
            v-for="article in articles" :key="article.id"
            class="list-row"
            @click="openDetail(article)"
          >
            <div class="col-cover" style="width:52px;">
              <div
                v-if="article.cover_url"
                style="width:40px;height:28px;border-radius:4px;overflow:hidden;background:var(--surface-2);flex-shrink:0;"
              >
                <img
                  :src="article.cover_url" alt=""
                  style="width:100%;height:100%;object-fit:cover;display:block;"
                  @error="($event.target as HTMLImageElement).style.display='none'"
                />
              </div>
              <div
                v-else
                style="width:40px;height:28px;border-radius:4px;background:var(--surface-2);display:flex;align-items:center;justify-content:center;"
              >
                <Newspaper :size="16" style="color:var(--text-muted);" />
              </div>
            </div>
            <div class="col-title" style="flex:1;min-width:0;font-weight:500;">
              <span style="cursor:pointer;">{{ article.title || '未命名文章' }}</span>
            </div>
            <div class="col-author" style="width:100px;color:var(--text-muted);font-size:12px;">
              <span v-if="article.author">{{ article.author }}</span>
              <span v-else style="color:var(--text-muted);">—</span>
            </div>
            <div class="col-date" style="width:110px;color:var(--text-muted);font-size:12px;">
              {{ formatDate(article.created_at) }}
            </div>
            <div class="col-size" style="width:72px;text-align:right;color:var(--text-muted);font-size:12px;">
              <span v-if="article.content_length !== undefined">{{ (article.content_length / 1000).toFixed(1) }}K</span>
            </div>
            <div class="col-actions" style="width:144px;text-align:right;display:flex;gap:2px;justify-content:flex-end;" @click.stop>
              <NButton
                size="tiny" quaternary
                :loading="refreshingId === article.id"
                :disabled="refreshingId !== null"
                @click="refreshArticle(article)"
                round
              >
                <template #icon><RefreshCw :size="12" /></template>
              </NButton>
              <NButton size="tiny" quaternary type="primary" @click="openDetail(article)" round>
                <template #icon><Eye :size="12" /></template>
              </NButton>
              <NButton size="tiny" quaternary type="error" @click="confirmDelete(article)" round>
                <template #icon><Trash2 :size="12" /></template>
              </NButton>
            </div>
          </div>
        </template>
        <NEmpty v-else-if="!loading" description="暂无已提取的文章" style="padding:60px 0;" />
      </NSpin>
    </NCard>

    <!-- ═══ 详情弹窗 ═══ -->
    <NModal
      v-model:show="showDetail"
      preset="card"
      title=" "
      style="width:800px;max-width:95vw;max-height:90vh;"
      :mask-closable="true"
      :segmented="{ content: true, footer: true }"
      header-style="padding:0;"
      content-style="padding:0;"
      footer-style="padding:12px 20px;"
      @close="closeDetail"
    >
      <NSpin :show="detailLoading" style="min-height:300px;">
        <template v-if="detailArticle">
          <NScrollbar style="max-height:65vh;padding:24px 28px;">
            <!-- 标题 -->
            <h2 style="font-size:22px;font-weight:700;margin:0 0 10px;line-height:1.4;letter-spacing:-0.02em;color:var(--text-primary);">
              {{ detailArticle.title }}
            </h2>
            <!-- 元信息 -->
            <div style="display:flex;flex-wrap:wrap;gap:8px 16px;font-size:13px;color:var(--text-muted);margin-bottom:20px;">
              <span v-if="detailArticle.author" style="display:flex;align-items:center;gap:4px;">
                <User :size="13" /> {{ detailArticle.author }}
              </span>
              <span style="display:flex;align-items:center;gap:4px;">
                <CalendarDays :size="13" /> {{ formatDate(detailArticle.created_at) }}
              </span>
              <span v-if="detailArticle.updated_at !== detailArticle.created_at" style="display:flex;align-items:center;gap:4px;">
                更新 {{ formatDateTime(detailArticle.updated_at) }}
              </span>
              <a
                :href="detailArticle.url" target="_blank" rel="noopener"
                style="color:var(--primary-color);text-decoration:none;display:flex;align-items:center;gap:3px;"
              >
                <ExternalLink :size="13" /> 原文链接
              </a>
            </div>
            <NDivider style="margin:0 0 20px;" />
            <!-- 正文 -->
            <div class="text-bot" v-html="renderMarkdown(detailArticle.content_md)" />
          </NScrollbar>
        </template>
        <div v-else style="padding:80px;text-align:center;color:var(--text-muted);font-size:14px;">
          <NSpace justify="center"><FileText :size="24" /></NSpace>
          <div style="margin-top:8px;">加载中...</div>
        </div>
      </NSpin>

      <template #footer>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div style="display:flex;gap:6px;">
            <NButton
              v-if="detailArticle" size="tiny" quaternary
              :loading="refreshingId === detailArticle?.id"
              :disabled="refreshingId !== null"
              @click="refreshArticle(detailArticle)" round
            >
              <template #icon><RefreshCw :size="13" /></template>
              刷新
            </NButton>
            <NButton
              v-if="detailArticle" size="tiny" quaternary type="error"
              @click="confirmDelete(detailArticle)" round
            >
              <template #icon><Trash2 :size="13" /></template>
              删除
            </NButton>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <NText v-if="detailArticle" depth="3" style="font-size:11px;">
              更新于 {{ formatDateTime(detailArticle.updated_at) }}
            </NText>
            <NButton size="tiny" quaternary @click="closeDetail" round>关闭</NButton>
          </div>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
/* ── List header ── */
.list-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--hairline);
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  user-select: none;
}

/* ── List row ── */
.list-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--hairline);
  transition: background 0.12s;
  cursor: pointer;
  font-size: 13px;
}
.list-row:last-child { border-bottom: none; }
.list-row:hover { background: var(--surface-2); }

.col-cover { display:flex;align-items:center;flex-shrink:0; }
.col-title { overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.col-author { overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0; }
.col-date { flex-shrink:0; }
.col-size { flex-shrink:0; }

.col-actions {
  flex-shrink:0;
  display:flex;
  gap:2px;
  justify-content:flex-end;
  opacity:0;
  transition:opacity 0.15s;
}
.list-row:hover .col-actions { opacity:1; }

/* ═══════════════════════════════════════════
   Prose: Fumadocs-inspired — same as ChatMessage.vue
   ═══════════════════════════════════════════ */

.text-bot :deep(p) {
  margin: 1.25em 0;
}
.text-bot :deep(p:first-child) { margin-top: 0; }
.text-bot :deep(p:last-child)  { margin-bottom: 0; }

.text-bot :deep(h1),
.text-bot :deep(h2),
.text-bot :deep(h3),
.text-bot :deep(h4),
.text-bot :deep(h5),
.text-bot :deep(h6) {
  line-height: 1.35;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}
.text-bot :deep(h1) { font-size: 1.5rem;   margin: 1.2em 0 0.6em; }
.text-bot :deep(h2) { font-size: 1.3rem;   margin: 1.6em 0 0.5em; }
.text-bot :deep(h3) { font-size: 1.15rem;  margin: 1.2em 0 0.4em; }
.text-bot :deep(h4) { font-size: 1.05rem;  margin: 1em 0 0.3em;  }

.text-bot :deep(ul) {
  list-style: disc outside;
  margin: 1em 0;
  padding-left: 1.625em;
}
.text-bot :deep(ol) {
  list-style: decimal outside;
  margin: 1em 0;
  padding-left: 1.625em;
}
.text-bot :deep(li) { margin: 0.4em 0; display: list-item; }
.text-bot :deep(li::marker) { color: var(--text-muted); }
.text-bot :deep(li > ul),
.text-bot :deep(li > ol) { margin: 0.4em 0; }

.text-bot :deep(a) {
  color: var(--text-primary);
  text-decoration: underline;
  text-underline-offset: 3.5px;
  text-decoration-thickness: 1.5px;
  text-decoration-color: color-mix(in srgb, var(--accent) 50%, transparent);
  font-weight: 500;
  transition: opacity 0.2s;
}
.text-bot :deep(a:hover) { opacity: 0.8; }

.text-bot :deep(strong) { font-weight: 600; color: var(--text-primary); }

.text-bot :deep(blockquote) {
  font-style: italic;
  font-weight: 500;
  border-left: 3px solid var(--hairline-strong);
  padding: 0.5em 1em;
  margin: 1.2em 0;
  background: var(--surface-2);
  border-radius: 0 6px 6px 0;
  color: var(--text-secondary);
}
.text-bot :deep(blockquote p) { margin: 0.75em 0; }
.text-bot :deep(blockquote p:first-child) { margin-top: 0; }
.text-bot :deep(blockquote p:last-child)  { margin-bottom: 0; }

.text-bot :deep(.code-block-wrapper) {
  position: relative;
  margin: 1.5em 0;
  border-radius: 8px;
  border: 1px solid var(--hairline);
  background: var(--surface-1);
  overflow: hidden;
}
.text-bot :deep(.code-block-header) {
  display: flex;
  align-items: center;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--hairline);
  background: var(--surface-2);
  font-size: 0.8125rem;
  color: var(--text-muted);
  font-family: 'JetBrains Mono','Fira Code',monospace;
}
.text-bot :deep(.code-block-header figcaption) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.text-bot :deep(.code-block-header .code-copy-btn) {
  margin-left: auto;
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: all .12s;
  opacity: 0;
}
.text-bot :deep(.code-block-wrapper:hover .code-copy-btn) {
  opacity: 1;
}
.text-bot :deep(.code-copy-btn:hover) {
  background: var(--surface-2);
  color: var(--text-primary);
}
.text-bot :deep(.code-copy-btn:active) {
  transform: scale(0.88);
}
.text-bot :deep(.code-block-body) { overflow-x: auto; }
.text-bot :deep(.code-block-body pre) {
  margin: 0;
  padding: 1.25em 1.5em;
  border: none;
  border-radius: 0;
  background: transparent;
  font-size: 0.8125rem;
  line-height: 1.7;
  font-family: 'JetBrains Mono','Fira Code',monospace;
  -webkit-font-smoothing: auto;
}
.text-bot :deep(.code-block-body pre code) {
  background: transparent;
  border: none;
  padding: 0;
  font-size: inherit;
  line-height: inherit;
  color: var(--text-primary);
}

.text-bot :deep(code) {
  font-family: 'JetBrains Mono','Fira Code',monospace;
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  border-radius: 4px;
  padding: 0.15em 0.4em;
  font-size: 0.875em;
  color: var(--text-primary);
}
.text-bot :deep(pre code) {
  background: transparent;
  border: 0;
  padding: 0;
  font-size: inherit;
  color: inherit;
}

.text-bot :deep(hr) {
  margin: 1.5em 0;
  border: 0;
  border-top: 1px solid var(--hairline);
  opacity: 0.3;
}

.text-bot :deep(table) {
  width: max-content;
  min-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  background: var(--surface-1);
}
.text-bot :deep(th) {
  font-weight: 600;
  font-size: 0.8125rem;
  letter-spacing: 0.02em;
  text-transform: none;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--hairline-strong);
  padding: 0.625rem 1rem;
  text-align: left;
  background: transparent;
}
.text-bot :deep(td) {
  padding: 0.625rem 1rem;
  border-bottom: 1px solid var(--hairline);
  font-size: 0.875rem;
}
.text-bot :deep(tr:last-child td) { border-bottom: none; }
.text-bot :deep(tbody tr:hover) { background: var(--surface-2); }

.text-bot :deep(img) {
  max-width: 100%;
  border-radius: 8px;
  margin: 12px 0;
  display: block;
}
</style>
