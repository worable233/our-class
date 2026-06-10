<script setup lang="ts">
import { computed } from 'vue'
import { useUploadManager } from '@/composables/useUploadManager'
import {
  NButton, NModal, NCard, NTag, NProgress, NSpace, NText, NEmpty, NScrollbar, NButtonGroup,
} from 'naive-ui'
import { Upload, X, Pause, Play, Trash2, RotateCw, CheckCircle, AlertCircle, HardDrive } from '@lucide/vue'

const {
  activeUploads, historyUploads, panelOpen, activeTab,
  pauseUpload, cancelUpload, clearHistory, removeHistoryItem,
} = useUploadManager()

const activeCount = computed(() => activeUploads.value.length)
const totalProgress = computed(() => {
  const all = [...activeUploads.value]
  if (all.length === 0) return 0
  return Math.round(all.reduce((s, u) => s + u.progress, 0) / all.length)
})

function fmtSize(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB'
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return bytes + ' B'
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function statusColor(s: string) {
  if (s === 'done') return 'success'
  if (s === 'error') return 'error'
  if (s === 'paused') return 'warning'
  return 'info'
}

function statusLabel(s: string) {
  if (s === 'done') return '已完成'
  if (s === 'error') return '失败'
  if (s === 'paused') return '已暂停'
  if (s === 'uploading') return '上传中'
  return '等待中'
}
</script>

<template>
  <!-- Floating button -->
  <div class="upload-fab" @click="panelOpen = !panelOpen">
    <div class="fab-icon">
      <Upload :size="20" />
    </div>
    <span v-if="activeCount > 0" class="fab-badge">{{ activeCount }}</span>
  </div>

  <!-- Panel modal -->
  <n-modal v-model:show="panelOpen" preset="card" title="上传管理" style="width:480px;max-height:80vh;" :mask-closable="true" header-style="padding:16px 20px;font-size:16px;font-weight:600;" content-style="padding:0;">
    <!-- Tabs -->
    <div style="display:flex;gap:0;border-bottom:1px solid var(--hairline);">
      <div @click="activeTab = 'active'"
        :style="{flex:1,padding:'10px 16px',fontSize:'13px',cursor:'pointer',textAlign:'center',fontWeight:activeTab==='active'?600:400,borderBottom:activeTab==='active'?'2px solid var(--accent)':'2px solid transparent',color:activeTab==='active'?'var(--accent)':'var(--text-muted)'}"
      >
        正在上传 ({{ activeCount }})
      </div>
      <div @click="activeTab = 'history'"
        :style="{flex:1,padding:'10px 16px',fontSize:'13px',cursor:'pointer',textAlign:'center',fontWeight:activeTab==='history'?600:400,borderBottom:activeTab==='history'?'2px solid var(--accent)':'2px solid transparent',color:activeTab==='history'?'var(--accent)':'var(--text-muted)'}"
      >
        上传历史
      </div>
    </div>

    <!-- Total progress bar -->
    <div v-if="activeCount > 0" style="padding:12px 16px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <HardDrive :size="16" style="color:var(--accent);flex-shrink:0;" />
        <n-progress :value="totalProgress" :height="14" :border-radius="6" :indicator-placement="'inside'" style="flex:1;" />
      </div>
    </div>

    <n-scrollbar style="max-height:400px;">
      <!-- Active uploads -->
      <div v-if="activeTab === 'active'" style="padding:8px 16px 16px;">
        <div v-for="task in activeUploads" :key="task.id"
          style="padding:10px 0;border-bottom:1px solid var(--hairline);font-size:13px;"
        >
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <n-tag size="tiny" :bordered="false" round :type="statusColor(task.status)">{{ statusLabel(task.status) }}</n-tag>
            <span style="flex:1;color:var(--text-primary);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ task.name }}</span>
            <span style="font-size:11px;color:var(--text-muted);">{{ fmtSize(task.size) }}</span>
          </div>
          <n-progress v-if="task.status === 'uploading'" :value="task.progress" :height="6" :border-radius="3" :indicator-placement="'inside'" />
          <div style="display:flex;justify-content:space-between;margin-top:4px;">
            <span style="font-size:11px;color:var(--text-muted);">{{ task.progress }}% · {{ task.uploaded_chunks }}/{{ task.total_chunks }} 分片</span>
            <div style="display:flex;gap:4px;">
              <n-button v-if="task.status === 'uploading'" size="tiny" quaternary @click="pauseUpload(task.id)" round><template #icon><Pause :size="12" /></template></n-button>
              <n-button size="tiny" quaternary type="error" @click="cancelUpload(task.id)" round><template #icon><Trash2 :size="12" /></template></n-button>
            </div>
          </div>
        </div>
        <n-empty v-if="activeUploads.length === 0" description="暂无正在上传的任务" style="padding:40px 0;" />
      </div>

      <!-- History -->
      <div v-if="activeTab === 'history'" style="padding:8px 16px 16px;">
        <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
          <n-button v-if="historyUploads.length > 0" size="tiny" quaternary @click="clearHistory" round>
            <template #icon><Trash2 :size="12" /></template>
            清除全部
          </n-button>
        </div>
        <div v-for="task in historyUploads" :key="task.id"
          style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--hairline);font-size:13px;"
        >
          <component :is="task.status === 'done' ? CheckCircle : AlertCircle" :size="16" :style="{color:task.status==='done'?'#18a058':'#d03050',flexShrink:0}" />
          <div style="flex:1;min-width:0;">
            <div style="color:var(--text-primary);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ task.name }}</div>
            <div style="font-size:11px;color:var(--text-muted);">{{ fmtSize(task.size) }} · {{ fmtTime(task.done_at || task.created_at) }}</div>
          </div>
          <n-tag size="tiny" :bordered="false" round :type="statusColor(task.status)">{{ statusLabel(task.status) }}</n-tag>
          <n-button size="tiny" quaternary @click="removeHistoryItem(task.id)" round><template #icon><X :size="12" /></template></n-button>
        </div>
        <n-empty v-if="historyUploads.length === 0" description="暂无上传历史" style="padding:40px 0;" />
      </div>
    </n-scrollbar>
  </n-modal>
</template>

<style scoped>
.upload-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(94, 106, 210, 0.35);
  z-index: 1000;
  transition: transform .2s, box-shadow .2s;
}
.upload-fab:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 20px rgba(94, 106, 210, 0.45);
}
.fab-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  background: #d03050;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}
</style>
