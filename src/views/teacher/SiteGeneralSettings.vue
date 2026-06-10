<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api/client'
import { useMessage } from 'naive-ui'
import {
  NButton, NInput, NCard, NText, NSpace, NDivider, NSpin, NAlert,
} from 'naive-ui'
import { Save, Globe, Image as ImageIcon, FileText, MessageSquare } from '@lucide/vue'

interface SiteSettings {
  site_title: string
  site_icon: string
  site_description: string
  footer_text: string
}

const message = useMessage()
const settings = ref<SiteSettings>({
  site_title: 'OurClass',
  site_icon: '',
  site_description: '',
  footer_text: '',
})
const loading = ref(false)
const saving = ref(false)
const loaded = ref(false)

async function load() {
  loading.value = true
  try {
    const data = await api.get<SiteSettings>('/site-settings')
    if (data) Object.assign(settings.value, data)
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
    await api.put('/site-settings', settings.value)
    message.success('设置已保存')
  } catch (e: any) {
    message.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

function handleIconUpload() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    // Read as base64 or upload
    const reader = new FileReader()
    reader.onload = (e) => {
      settings.value.site_icon = e.target?.result as string
    }
    reader.readAsDataURL(file)
  }
  input.click()
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
                    v-if="settings.site_icon"
                    :src="settings.site_icon"
                    style="width:100%;height:100%;object-fit:contain;display:block;"
                    alt="site icon"
                  />
                  <ImageIcon v-else :size="28" style="color:var(--text-muted);" />
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                  <NButton size="tiny" @click="handleIconUpload" secondary round>
                    上传图标
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
                  <NText depth="3" style="font-size:11px;">推荐 32×32 或 64×64 PNG</NText>
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

            <NDivider style="margin:0;" />

            <!-- 页脚文字 -->
            <div>
              <div style="font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:6px;display:flex;align-items:center;gap:6px;">
                <MessageSquare :size="14" />
                <span>页脚文字</span>
              </div>
              <NInput
                v-model:value="settings.footer_text"
                placeholder="页脚显示的文字（可选）"
                :maxlength="100"
                show-count
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
      </template>
    </NSpin>
  </div>
</template>

<style scoped>
</style>
