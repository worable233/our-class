<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useDialog, useMessage } from 'naive-ui'
import type { DataTableColumn } from 'naive-ui'
import { safeHtml } from '@/utils/sanitize'
import {
  NButton, NInput, NModal, NSpin, NEmpty, NText, NCard, NDivider,
  NScrollbar, NSpace, NTag, NIcon, NDataTable, NAlert,
} from 'naive-ui'
import {
  ExternalLink, Trash2, Eye, Globe, RefreshCw, Link as LinkIcon,
  Newspaper, CalendarDays, User, FileText, Plus, Loader2,
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

interface ArticlePreview {
  title: string
  cover_url: string
  author: string
  url: string
  already_saved: boolean
  created_at?: string
}

const dialog = useDialog()
const message = useMessage()
const auth = useAuthStore()
const isStudent = computed(() => auth.isStudent)

const articles = ref<Article[]>([])
const loading = ref(false)
const refreshingId = ref<number | null>(null)

// ── Parse modal ──
const showParseModal = ref(false)
const parseUrl = ref('')
const parsing = ref(false)
const preview = ref<ArticlePreview | null>(null)
const saving = ref(false)

// Detail modal
const showDetail = ref(false)
const detailArticle = ref<Article | null>(null)
const detailLoading = ref(false)

const totalCount = computed(() => articles.value.length)

async function refreshArticle(row: Article) {
  refreshingId.value = row.id
  try {
    await api.post(`/articles/${row.id}/refresh`, {})
    message.success('文章已刷新')
    load()
    if (showDetail.value && detailArticle.value?.id === row.id) {
      const full = await api.get<Article>(`/articles/${row.id}`)
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

// ── Parse flow ──

function openParseModal() {
  showParseModal.value = true
  parseUrl.value = ''
  preview.value = null
}

function closeParseModal() {
  showParseModal.value = false
  parseUrl.value = ''
  preview.value = null
}

async function previewArticle() {
  if (!parseUrl.value.trim()) return
  parsing.value = true
  preview.value = null
  try {
    const res = await api.post<ArticlePreview>('/articles/preview', { url: parseUrl.value.trim() })
    preview.value = res
  } catch (e: any) {
    message.error(e.message || '解析失败')
  } finally {
    parsing.value = false
  }
}

async function confirmSave() {
  if (!preview.value || !parseUrl.value.trim()) return
  saving.value = true
  try {
    await api.post('/articles/fetch', { url: parseUrl.value.trim() })
    message.success('文章已保存')
    closeParseModal()
    load()
  } catch (e: any) {
    message.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// ── Detail modal ──

async function openDetail(row: Article) {
  showDetail.value = true
  detailLoading.value = true
  detailArticle.value = null
  try {
    const full = await api.get<Article>(`/articles/${row.id}`)
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

function confirmDelete(row: Article) {
  dialog.warning({
    title: '确认删除',
    content: `确定要删除「${row.title || '未命名文章'}」吗？图片文件也会一并删除。`,
    positiveText: '删除',
    negativeText: '取消',
    positiveButtonProps: { type: 'error' as const },
    onPositiveClick: async () => {
      try {
        await api.delete(`/articles/${row.id}`)
        message.success('已删除')
        load()
        if (showDetail.value && detailArticle.value?.id === row.id) closeDetail()
      } catch (e: any) { message.error(e.message || '删除失败') }
    },
  })
}

function formatDate(d: string) {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function formatDateTime(d: string) {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
}

function renderMarkdown(md: string) {
  if (!md) return ''
  let html = marked.parse(md) as string
  // XSS 防护：用 DOMPurify 过滤渲染后的 HTML
  html = safeHtml(html)
  html = html.replace(
    /<pre><code class="language-(\w*)">([\s\S]*?)<\/code><\/pre>/g,
    (_, lang, code) =>
      `<div class="code-block-wrapper"><div class="code-block-header"><figcaption>${lang || 'code'}</figcaption><button class="code-copy-btn" data-action="copy-code"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button></div><div class="code-block-body"><pre><code>${code}</code></pre></div></div>`,
  )
  return html
}

// ── DataTable columns ──

const columns = computed<DataTableColumn[]>(() => [
  {
    key: 'title',
    title: '标题',
    width: 320,
    ellipsis: { tooltip: true },
    render(row: Article) {
      return h('div', { style: 'display:flex;align-items:center;gap:10px;' }, [
        row.cover_url
          ? h('img', {
              src: row.cover_url,
              style: 'width:44px;height:30px;border-radius:4px;object-fit:cover;flex-shrink:0;background:var(--surface-2);display:block;',
              onError: (e: Event) => ((e.target as HTMLElement).style.display = 'none'),
            })
          : h('div', {
              style: 'width:44px;height:30px;border-radius:4px;background:var(--surface-2);display:flex;align-items:center;justify-content:center;flex-shrink:0;',
            }, [h(Newspaper, { size: 16, style: 'color:var(--text-muted)' })]),
        h('span', {
          style: 'font-weight:500;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;',
          onClick: () => openDetail(row),
        }, row.title || '未命名文章'),
      ])
    },
  },
  {
    key: 'author',
    title: '作者',
    width: 100,
    render(row: Article) {
      return row.author
        ? h('span', { style: 'font-size:12px;color:var(--text-muted);' }, row.author)
        : h('span', { style: 'font-size:12px;color:var(--text-muted);' }, '—')
    },
  },
  {
    key: 'content_length',
    title: '字数',
    width: 70,
    align: 'right',
    sorter: (a: Article, b: Article) => (a.content_length || 0) - (b.content_length || 0),
    render(row: Article) {
      return row.content_length
        ? h('span', { style: 'font-size:12px;color:var(--text-muted);' }, `${(row.content_length / 1000).toFixed(1)}K`)
        : ''
    },
  },
  {
    key: 'created_at',
    title: '日期',
    width: 110,
    sorter: (a: Article, b: Article) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    render(row: Article) {
      return h('span', { style: 'font-size:12px;color:var(--text-muted);' }, formatDate(row.created_at))
    },
  },
  {
    key: 'actions',
    title: '操作',
    width: isStudent.value ? 54 : 130,
    align: 'right',
    render(row: Article) {
      const btns: any[] = []
      if (!isStudent.value) {
        btns.push(h(NButton, {
          size: 'tiny', quaternary: true,
          loading: refreshingId.value === row.id,
          disabled: refreshingId.value !== null,
          onClick: (e: Event) => { e.stopPropagation(); refreshArticle(row) },
          round: true,
        }, { default: () => h(RefreshCw, { size: 13 }) }))
      }
      btns.push(h(NButton, {
        size: 'tiny', quaternary: true, type: 'primary' as any,
        onClick: (e: Event) => { e.stopPropagation(); openDetail(row) },
        round: true,
      }, { default: () => h(Eye, { size: 13 }) }))
      if (!isStudent.value) {
        btns.push(h(NButton, {
          size: 'tiny', quaternary: true, type: 'error' as any,
          onClick: (e: Event) => { e.stopPropagation(); confirmDelete(row) },
          round: true,
        }, { default: () => h(Trash2, { size: 13 }) }))
      }
      return h('div', { style: 'display:flex;gap:4px;justify-content:flex-end;' }, btns)
    },
  },
])

onMounted(load)
</script>

<template>
  <div style="display:flex;flex-direction:column;gap:20px;">
    <!-- ═══ 页面标题 ═══ -->
    <div style="display:flex;align-items:flex-start;justify-content:space-between;">
      <div>
        <NText tag="h1" depth="1" style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.03em;">公众号文章</NText>
        <NText depth="3" style="margin-top:4px;display:block;font-size:13px;">
          输入链接自动解析并保存为 Markdown 格式
        </NText>
      </div>
      <NButton v-if="!isStudent" type="primary" @click="openParseModal" round>
        <template #icon><Plus :size="16" /></template>
        解析文章
      </NButton>
    </div>

    <!-- ═══ 解析弹窗 ═══ -->
    <NModal
      v-model:show="showParseModal"
      preset="card"
      title="解析公众号文章"
      style="width:520px;max-width:92vw;"
      :mask-closable="false"
      :segmented="{ content: true, footer: true }"
      header-style="font-size:18px;font-weight:600;"
      content-style="padding:20px 24px;min-height:160px;"
      footer-style="padding:12px 20px;"
      @close="closeParseModal"
    >
      <!-- Step 1: URL input -->
      <template v-if="!preview">
        <div style="display:flex;flex-direction:column;gap:16px;">
          <div>
            <div style="font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:6px;display:flex;align-items:center;gap:6px;">
              <Globe :size="14" />
              <span>公众号文章链接</span>
            </div>
            <NInput
              v-model:value="parseUrl"
              placeholder="https://mp.weixin.qq.com/s/..."
              :disabled="parsing"
              clearable
              @keyup.enter="previewArticle"
              size="large"
            />
          </div>
          <NButton
            type="primary"
            @click="previewArticle"
            :loading="parsing"
            :disabled="!parseUrl.trim()"
            block
            round
            size="large"
          >
            {{ parsing ? '解析中...' : '解析预览' }}
          </NButton>
        </div>
      </template>

      <!-- Step 2: Preview -->
      <template v-else>
        <div style="display:flex;flex-direction:column;gap:16px;">
          <!-- Already saved alert -->
          <NAlert v-if="preview.already_saved" type="warning" :bordered="false" closable>
            该文章已保存过
          </NAlert>

          <!-- Cover -->
          <div
            v-if="preview.cover_url"
            style="width:100%;height:180px;border-radius:8px;overflow:hidden;background:var(--surface-2);"
          >
            <img
              :src="preview.cover_url"
              style="width:100%;height:100%;object-fit:cover;display:block;"
              @error="($event.target as HTMLImageElement).style.display='none'"
            />
          </div>

          <!-- Info -->
          <div style="display:flex;flex-direction:column;gap:6px;">
            <NText tag="div" style="font-size:17px;font-weight:700;line-height:1.4;">
              {{ preview.title }}
            </NText>
            <div style="display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px;color:var(--text-muted);">
              <span v-if="preview.author" style="display:flex;align-items:center;gap:4px;">
                <User :size="13" /> {{ preview.author }}
              </span>
              <span v-if="preview.created_at" style="display:flex;align-items:center;gap:4px;">
                <CalendarDays :size="13" /> {{ formatDate(preview.created_at) }}
              </span>
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <div style="display:flex;justify-content:space-between;gap:8px;">
          <NButton quaternary @click="preview ? preview = null : closeParseModal()" round>
            {{ preview ? '返回修改' : '取消' }}
          </NButton>
          <NButton
            v-if="preview"
            type="primary"
            @click="confirmSave"
            :loading="saving"
            :disabled="preview.already_saved"
            round
          >
            {{ saving ? '保存中...' : '确认保存' }}
          </NButton>
        </div>
      </template>
    </NModal>

    <!-- ═══ 文章列表 ═══ -->
    <NDataTable
      :columns="columns"
      :data="articles"
      :loading="loading"
      :bordered="true"
      :single-line="false"
      :row-key="(row: Article) => row.id"
      size="small"
      striped
      :max-height="560"
      :empty="h(NEmpty, { description: '暂无已解析的文章', style: 'padding:80px 0;' })"
    />

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
      footer-style="padding:14px 24px;"
      @close="closeDetail"
    >
      <NSpin :show="detailLoading" style="min-height:300px;">
        <template v-if="detailArticle">
          <NScrollbar style="max-height:65vh;padding:24px 28px;">
            <h2 style="font-size:22px;font-weight:700;margin:0 0 10px;line-height:1.4;letter-spacing:-0.02em;color:var(--text-primary);">
              {{ detailArticle.title }}
            </h2>
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
            <NButton v-if="detailArticle" size="tiny" quaternary
              :loading="refreshingId === detailArticle?.id" :disabled="refreshingId !== null"
              @click="refreshArticle(detailArticle)" round>
              <template #icon><RefreshCw :size="13" /></template>刷新
            </NButton>
            <NButton v-if="detailArticle" size="tiny" quaternary type="error"
              @click="confirmDelete(detailArticle)" round>
              <template #icon><Trash2 :size="13" /></template>删除
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
.text-bot :deep(p) { margin: 1.25em 0; }
.text-bot :deep(p:first-child) { margin-top: 0; }
.text-bot :deep(p:last-child) { margin-bottom: 0; }
.text-bot :deep(h1), .text-bot :deep(h2), .text-bot :deep(h3), .text-bot :deep(h4),
.text-bot :deep(h5), .text-bot :deep(h6) {
  line-height: 1.35; font-weight: 600; letter-spacing: -0.02em; color: var(--text-primary);
}
.text-bot :deep(h1) { font-size: 1.5rem; margin: 1.2em 0 0.6em; }
.text-bot :deep(h2) { font-size: 1.3rem; margin: 1.6em 0 0.5em; }
.text-bot :deep(h3) { font-size: 1.15rem; margin: 1.2em 0 0.4em; }
.text-bot :deep(h4) { font-size: 1.05rem; margin: 1em 0 0.3em; }
.text-bot :deep(ul) { list-style: disc outside; margin: 1em 0; padding-left: 1.625em; }
.text-bot :deep(ol) { list-style: decimal outside; margin: 1em 0; padding-left: 1.625em; }
.text-bot :deep(li) { margin: 0.4em 0; display: list-item; }
.text-bot :deep(li::marker) { color: var(--text-muted); }
.text-bot :deep(li > ul), .text-bot :deep(li > ol) { margin: 0.4em 0; }
.text-bot :deep(a) {
  color: var(--text-primary); text-decoration: underline; text-underline-offset: 3.5px;
  text-decoration-thickness: 1.5px; text-decoration-color: color-mix(in srgb, var(--accent) 50%, transparent);
  font-weight: 500; transition: opacity 0.2s;
}
.text-bot :deep(a:hover) { opacity: 0.8; }
.text-bot :deep(strong) { font-weight: 600; color: var(--text-primary); }
.text-bot :deep(blockquote) {
  font-style: italic; font-weight: 500; border-left: 3px solid var(--hairline-strong);
  padding: 0.5em 1em; margin: 1.2em 0; background: var(--surface-2);
  border-radius: 0 6px 6px 0; color: var(--text-secondary);
}
.text-bot :deep(blockquote p) { margin: 0.75em 0; }
.text-bot :deep(blockquote p:first-child) { margin-top: 0; }
.text-bot :deep(blockquote p:last-child) { margin-bottom: 0; }
.text-bot :deep(.code-block-wrapper) {
  position: relative; margin: 1.5em 0; border-radius: 8px; border: 1px solid var(--hairline);
  background: var(--surface-1); overflow: hidden;
}
.text-bot :deep(.code-block-header) {
  display: flex; align-items: center; padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--hairline); background: var(--surface-2);
  font-size: 0.8125rem; color: var(--text-muted); font-family: 'JetBrains Mono','Fira Code',monospace;
}
.text-bot :deep(.code-block-header figcaption) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.text-bot :deep(.code-block-header .code-copy-btn) {
  margin-left: auto; display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 6px; border: none; background: transparent;
  color: var(--text-muted); cursor: pointer; padding: 0; flex-shrink: 0; transition: all .12s; opacity: 0;
}
.text-bot :deep(.code-block-wrapper:hover .code-copy-btn) { opacity: 1; }
.text-bot :deep(.code-copy-btn:hover) { background: var(--surface-2); color: var(--text-primary); }
.text-bot :deep(.code-copy-btn:active) { transform: scale(0.88); }
.text-bot :deep(.code-block-body) { overflow-x: auto; }
.text-bot :deep(.code-block-body pre) {
  margin: 0; padding: 1.25em 1.5em; border: none; border-radius: 0; background: transparent;
  font-size: 0.8125rem; line-height: 1.7; font-family: 'JetBrains Mono','Fira Code',monospace; -webkit-font-smoothing: auto;
}
.text-bot :deep(.code-block-body pre code) { background: transparent; border: none; padding: 0; font-size: inherit; line-height: inherit; color: var(--text-primary); }
.text-bot :deep(code) {
  font-family: 'JetBrains Mono','Fira Code',monospace; background: var(--surface-2);
  border: 1px solid var(--hairline); border-radius: 4px; padding: 0.15em 0.4em; font-size: 0.875em; color: var(--text-primary);
}
.text-bot :deep(pre code) { background: transparent; border: 0; padding: 0; font-size: inherit; color: inherit; }
.text-bot :deep(hr) { margin: 1.5em 0; border: 0; border-top: 1px solid var(--hairline); opacity: 0.3; }
.text-bot :deep(table) { width: max-content; min-width: 100%; border-collapse: separate; border-spacing: 0; background: var(--surface-1); }
.text-bot :deep(th) {
  font-weight: 600; font-size: 0.8125rem; letter-spacing: 0.02em; color: var(--text-secondary);
  border-bottom: 1px solid var(--hairline-strong); padding: 0.625rem 1rem; text-align: left; background: transparent;
}
.text-bot :deep(td) { padding: 0.625rem 1rem; border-bottom: 1px solid var(--hairline); font-size: 0.875rem; }
.text-bot :deep(tr:last-child td) { border-bottom: none; }
.text-bot :deep(tbody tr:hover) { background: var(--surface-2); }
.text-bot :deep(img) { max-width: 100%; border-radius: 8px; margin: 12px 0; display: block; }
</style>
