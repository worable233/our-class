<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api/client'
import { useMessage } from 'naive-ui'
import {
  NButton, NInput, NCard, NText, NSpace, NDivider, NSpin, NAlert,
} from 'naive-ui'
import { Save, Globe, Image as ImageIcon, FileText } from '@lucide/vue'
import FilePicker from '@/components/FilePicker.vue'

interface SiteSettings {
  site_title: string
  site_icon: string
  site_description: string
}

const message = useMessage()
const settings = ref<SiteSettings>({
  site_title: 'OurClass',
  site_icon: '',
  site_description: '',
})
const loading = ref(false)
const saving = ref(false)
const loaded = ref(false)

function applySettings(s: SiteSettings) {
  // 更新浏览器标签标题
  if (s.site_title) document.title = s.site_title
  // 更新网站图标
  const link = document.querySelector('link[rel="icon"]') || document.querySelector('link[rel="shortcut icon"]')
  if (link && s.site_icon) (link as HTMLLinkElement).href = s.site_icon
  // 更新 meta description（SEO）
  let meta = document.querySelector('meta[name="description"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'description')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', s.site_description || 'OurClass 班级管理系统 — 现代化的课堂管理平台')
}

async function load() {
  loading.value = true
  try {
    const data = await api.get<SiteSettings>('/site-settings')
    if (data) {
      Object.assign(settings.value, data)
      applySettings(data)
    }
  } catch (e: any) {
    message.error(e.message || '加载失败')
  } finally {
    loading.value = false
    loaded.value = true
  }
}

async function save() {
  saving.value = true
  try {
    const result = await api.put<SiteSettings>('/site-settings', settings.value)
    if (result) applySettings(result)
    message.success('设置已保存')
  } catch (e: any) {
    message.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// ── File picker for icon ──
const showIconPicker = ref(false)

function onIconSelected(files: { name: string; path: string }[]) {
  if (files.length === 0) return
  // Use the selected file's path as the icon URL
  settings.value.site_icon = `/uploads/${files[0].path}`
}

function removeIcon() {
  settings.value.site_icon = ''
}

onMounted(load)
</script>

<template>
  <div style="display:flex;flex-direction:column;gap:20px;">
    <!-- ═══ 页面标题 ═══ -->
    <div>
      <NText tag="h1" depth="1" style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.03em;">普通设置</NText>
      <NText depth="3" style="margin-top:4px;display:block;font-size:13px;">配置网站标题、图标等基础信息</NText>
    </div>

    <NSpin :show="loading" style="min-height:200px;">
      <template v-if="loaded">
        <!-- ═══ 基本设置 ═══ -->
        <NCard :bordered="true" size="small" title="基本设置" style="max-width:680px;">
          <div style="display:flex;flex-direction:column;gap:20px;">
            <!-- 网站标题 -->
            <div>
              <div style="font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:6px;display:flex;align-items:center;gap:6px;">
                <Globe :size="14" />
                <span>网站标题</span>
              </div>
              <NInput
                v-model:value="settings.site_title"
                placeholder="OurClass"
                :maxlength="50"
                show-count
                size="large"
              />
            </div>

            <NDivider style="margin:0;" />

            <!-- 网站图标 -->
            <div>
              <div style="font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                <ImageIcon :size="14" />
                <span>网站图标（Favicon）</span>
              </div>
              <div style="display:flex;align-items:center;gap:16px;">
                <div
                  style="width:64px;height:64px;border-radius:12px;overflow:hidden;border:1px solid var(--hairline);background:var(--surface-2);display:flex;align-items:center;justify-content:center;flex-shrink:0;"
                >
                  <img
                    :src="settings.site_icon || '/favicon.svg'"
                    style="width:100%;height:100%;object-fit:contain;display:block;"
                    alt="site icon"
                    @error="($event.target as HTMLImageElement).src='/favicon.svg'"
                  />
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                  <NButton size="tiny" @click="showIconPicker = true" secondary round>
                    选择图标
                  </NButton>
                  <NButton
                    v-if="settings.site_icon"
                    size="tiny"
                    quaternary
                    type="error"
                    @click="removeIcon"
                    round
                  >
                    移除
                  </NButton>
                  <NText depth="3" style="font-size:11px;">推荐 32×32 或 64×64 PNG / SVG</NText>
                </div>
              </div>
            </div>

            <NDivider style="margin:0;" />

            <!-- 网站描述 -->
            <div>
              <div style="font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:6px;display:flex;align-items:center;gap:6px;">
                <FileText :size="14" />
                <span>网站描述</span>
              </div>
              <NInput
                v-model:value="settings.site_description"
                placeholder="简短描述你的网站（可选）"
                type="textarea"
                :maxlength="200"
                show-count
                :rows="3"
              />
            </div>
          </div>

          <template #footer>
            <div style="display:flex;justify-content:flex-end;">
              <NButton
                type="primary"
                @click="save"
                :loading="saving"
                round
              >
                <template #icon><Save :size="15" /></template>
                保存设置
              </NButton>
            </div>
          </template>
        </NCard>

        <!-- ═══ 图标选择器 ═══ -->
        <FilePicker
          :show="showIconPicker"
          :accept="['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico']"
          :multiple="false"
          @update:show="(v: boolean) => showIconPicker = v"
          @confirm="(files: any[]) => { showIconPicker = false; onIconSelected(files) }"
        />
      </template>
    </NSpin>
  </div>
</template>

<style scoped>
</style>
