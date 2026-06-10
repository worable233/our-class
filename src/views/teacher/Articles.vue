<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api/client'
import { useDialog, useMessage } from 'naive-ui'
import {
  NButton, NInput, NModal, NSpin, NEmpty, NText, NTable, NTag, NIcon,
  NAlert, NSpace, NCard, NDivider, NScrollbar,
} from 'naive-ui'
import { Plus, ExternalLink, Trash2, Eye, Globe, Loader2, Link as LinkIcon } from '@lucide/vue'

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
const articleUrl = ref('')

// Detail modal
const showDetail = ref(false)
const detailArticle = ref<Article | null>(null)
const detailLoading = ref(false)

function load() {
  loading.value = true
  api.get<Article[]>('/articles')
    .then(d => { articles.value = d || [] })
    .catch(() => message.error('加载文章列表失败'))
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

  // If content_md is short (placeholder), fetch fresh from server
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

function renderMarkdown(md: string): string {
  if (!md) return ''
  // Simple rendering: escape HTML first, then basic markdown patterns
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:8px;margin:8px 0" />')

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr />')

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote><p>$1</p></blockquote>')

  // Line breaks
  html = html.replace(/\n\n/g, '</p><p>')
  html = html.replace(/\n/g, '<br />')

  // Unordered lists - simple handling
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>')

  return `<p>${html}</p>`
}

onMounted(load)
</script>

<template>
  <div>
    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <div>
        <NText tag="h2" style="margin:0 0 4px;font-size:24px;font-weight:700;">公众号文章</NText>
        <NText depth="3" style="display:block;margin:0;font-size:14px;">
          输入公众号文章链接，自动提取内容并保存为 Markdown 格式
        </NText>
      </div>
    </div>

    <!-- URL Input -->
    <NCard :bordered="true" size="small" style="margin-bottom:20px">
      <div style="display:flex;gap:10px;align-items:flex-end">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:6px">
            <Globe :size="14" style="display:inline;vertical-align:text-bottom;margin-right:4px" />
            公众号文章链接
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
          style="flex-shrink:0;min-width:120px;height:40px"
        >
          <template #icon>
            <template v-if="!fetching">
              <LinkIcon :size="16" />
            </template>
          </template>
          {{ fetching ? '提取中...' : '提取内容' }}
        </NButton>
      </div>
    </NCard>

    <!-- Article List -->
    <NSpin :show="loading" style="min-height:200px">
      <template v-if="articles.length > 0">
        <div style="margin-bottom:12px;display:flex;align-items:center;gap:8px">
          <NText depth="3" style="font-size:13px">共 {{ articles.length }} 篇文章</NText>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px">
          <NCard
            v-for="article in articles"
            :key="article.id"
            size="small"
            :bordered="true"
            style="cursor:pointer;transition:box-shadow 0.2s,transform 0.15s"
            hoverable
            @click="openDetail(article)"
          >
            <div style="display:flex;align-items:center;gap:14px">
              <!-- Cover -->
              <div
                v-if="article.cover_url"
                style="width:80px;height:56px;border-radius:6px;overflow:hidden;flex-shrink:0;background:var(--surface-2)"
              >
                <img
                  :src="article.cover_url"
                  alt="cover"
                  style="width:100%;height:100%;object-fit:cover"
                  @error="($event.target as HTMLImageElement).style.display='none'"
                />
              </div>

              <!-- Info -->
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:14px;color:var(--text-primary);margin-bottom:3px;line-height:1.3">
                  {{ article.title || '未命名文章' }}
                </div>
                <div style="display:flex;align-items:center;gap:10px;font-size:12px;color:var(--text-muted)">
                  <span v-if="article.author">{{ article.author }}</span>
                  <span>{{ formatDate(article.created_at) }}</span>
                  <span v-if="article.content_length !== undefined">
                    ~{{ (article.content_length / 1000).toFixed(1) }}K chars
                  </span>
                </div>
              </div>

              <!-- Actions -->
              <div style="display:flex;gap:6px;flex-shrink:0" @click.stop>
                <NButton
                  size="tiny"
                  quaternary
                  type="primary"
                  @click="openDetail(article)"
                >
                  <template #icon><Eye :size="14" /></template>
                  查看
                </NButton>
                <NButton
                  size="tiny"
                  quaternary
                  type="error"
                  @click="confirmDelete(article)"
                >
                  <template #icon><Trash2 :size="14" /></template>
                </NButton>
              </div>
            </div>
          </NCard>
        </div>
      </template>
      <NEmpty v-else :description="'暂无已提取的文章'" style="padding:60px 0" />
    </NSpin>

    <!-- Detail Modal -->
    <NModal
      v-model:show="showDetail"
      preset="card"
      title="文章详情"
      style="width:800px;max-width:95vw;max-height:90vh"
      :mask-closable="true"
      :segmented="{ content: true, footer: true }"
      header-style="font-size:18px;font-weight:600"
      content-style="padding:0"
      footer-style="padding:12px 20px"
      @close="closeDetail"
    >
      <NSpin :show="detailLoading" style="min-height:300px">
        <template v-if="detailArticle">
          <NScrollbar style="max-height:65vh;padding:20px 24px">
            <!-- Article header -->
            <h2 style="font-size:20px;font-weight:700;margin:0 0 6px;line-height:1.4">
              {{ detailArticle.title }}
            </h2>
            <div style="display:flex;gap:12px;font-size:13px;color:var(--text-muted);margin-bottom:16px">
              <span v-if="detailArticle.author">{{ detailArticle.author }}</span>
              <span>{{ formatDate(detailArticle.created_at) }}</span>
              <a
                :href="detailArticle.url"
                target="_blank"
                rel="noopener"
                style="color:var(--primary-color);text-decoration:none;display:flex;align-items:center;gap:3px"
              >
                <ExternalLink :size="12" /> 原文链接
              </a>
            </div>

            <NDivider style="margin:0 0 16px" />

            <!-- Markdown content rendered as HTML -->
            <div
              class="article-content"
              v-html="renderMarkdown(detailArticle.content_md)"
            />
          </NScrollbar>
        </template>
        <template v-else>
          <div style="padding:60px;text-align:center;color:var(--text-muted)">加载中...</div>
        </template>
      </NSpin>

      <template #footer>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <NButton
            v-if="detailArticle"
            type="error"
            quaternary
            size="small"
            @click="confirmDelete(detailArticle)"
          >
            <template #icon><Trash2 :size="14" /></template>
            删除
          </NButton>
          <span style="flex:1" />
          <NButton quaternary size="small" @click="closeDetail">关闭</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.article-content {
  font-size: 15px;
  line-height: 1.8;
  color: var(--text-primary);
  word-break: break-word;
}

.article-content :deep(h1),
.article-content :deep(h2),
.article-content :deep(h3) {
  margin: 1.2em 0 0.6em;
  font-weight: 700;
  line-height: 1.3;
}

.article-content :deep(h1) { font-size: 1.5em; }
.article-content :deep(h2) { font-size: 1.3em; }
.article-content :deep(h3) { font-size: 1.15em; }

.article-content :deep(p) {
  margin: 0 0 1em;
}

.article-content :deep(img) {
  max-width: 100%;
  border-radius: 8px;
  margin: 12px 0;
  display: block;
}

.article-content :deep(blockquote) {
  margin: 12px 0;
  padding: 8px 16px;
  border-left: 3px solid var(--primary-color);
  background: var(--surface-2);
  border-radius: 0 6px 6px 0;
  color: var(--text-secondary);
}

.article-content :deep(pre) {
  background: var(--surface-2);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.5;
  margin: 12px 0;
}

.article-content :deep(code) {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  background: var(--surface-2);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
}

.article-content :deep(pre code) {
  padding: 0;
  background: none;
}

.article-content :deep(ul),
.article-content :deep(ol) {
  padding-left: 24px;
  margin: 8px 0;
}

.article-content :deep(li) {
  margin: 4px 0;
}

.article-content :deep(a) {
  color: var(--primary-color);
  text-decoration: underline;
}

.article-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 24px 0;
}

.article-content :deep(strong) {
  font-weight: 700;
}

.article-content :deep(em) {
  font-style: italic;
}

.article-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 12px 0;
}

.article-content :deep(th),
.article-content :deep(td) {
  border: 1px solid var(--border-color);
  padding: 8px 12px;
  text-align: left;
  font-size: 14px;
}

.article-content :deep(th) {
  background: var(--surface-2);
  font-weight: 600;
}
</style>
