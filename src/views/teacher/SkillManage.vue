<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { api } from '@/api/client'
import { useDialog, useMessage } from 'naive-ui'
import {
  NButton, NModal, NForm, NFormItem, NInput, NInputNumber,
  NSpace, NSpin, NEmpty, NTag, NAlert, NPopconfirm, NSwitch, NText,
  NList, NListItem,
} from 'naive-ui'
import { Plus, Pencil, Trash2, GripVertical, BookOpen, ArrowUp, ArrowDown } from '@lucide/vue'
import type { Skill } from '@/types'

// CodeMirror
import { Codemirror } from 'vue-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { languages } from '@codemirror/language-data'

const dialog = useDialog()
const message = useMessage()

const skills = ref<Skill[]>([])
const loading = ref(true)
const saving = ref(false)
const showModal = ref(false)
const editing = ref<Skill | null>(null)
const form = ref({ name: '', content: '', enabled: true })
const dragIndex = ref<number | null>(null)
const dropIndex = ref<number | null>(null)

const cmExtensions = [
  markdown({ base: markdownLanguage, codeLanguages: languages }),
  oneDark,
  EditorView.lineWrapping,
]

async function load() {
  loading.value = true
  try {
    skills.value = await api.get<Skill[]>('/chat/skills')
  } catch {
    message.error('加载数据失败')
  } finally {
    loading.value = false
  }
}

function openNew() {
  editing.value = null
  form.value = { name: '', content: '', enabled: true }
  showModal.value = true
}

function openEdit(s: Skill) {
  editing.value = s
  form.value = { name: s.name, content: s.content, enabled: s.enabled }
  showModal.value = true
}

async function save() {
  if (!form.value.name.trim()) { message.warning('请输入名称'); return }
  saving.value = true
  try {
    if (editing.value) {
      await api.put(`/chat/skills/${editing.value.id}`, form.value)
      message.success('已更新')
    } else {
      await api.post('/chat/skills', form.value)
      message.success('已创建')
    }
    showModal.value = false
    await load()
  } catch (e: any) {
    message.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function remove(id: number) {
  dialog.warning({
    title: '确认删除',
    content: '确定要删除这条 Skill 吗？这将影响 AI 的参考数据。',
    positiveText: '确认删除',
    negativeText: '取消',
    positiveButtonProps: { type: 'error' as const },
    onPositiveClick: async () => {
      try {
        await api.delete(`/chat/skills/${id}`)
        message.success('已删除')
        await load()
      } catch {
        message.error('删除失败')
      }
    },
  })
}

// ── Drag & drop sort ──────────────────────────────────────────────────────

function onDragStart(e: DragEvent, index: number) {
  dragIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }
}

function onDragOver(e: DragEvent, index: number) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dropIndex.value = index
}

function onDragLeave() {
  dropIndex.value = null
}

async function onDrop(e: DragEvent, index: number) {
  e.preventDefault()
  dropIndex.value = null
  if (dragIndex.value === null || dragIndex.value === index) {
    dragIndex.value = null
    return
  }

  const items = [...skills.value]
  const [moved] = items.splice(dragIndex.value, 1)
  items.splice(index, 0, moved)
  dragIndex.value = null

  // Update sort_order
  const reorder = items.map((item, i) => ({ id: item.id, sort_order: i }))
  skills.value = items.map((item, i) => ({ ...item, sort_order: i }))

  try {
    await api.put('/chat/skills/reorder', { items: reorder })
  } catch {
    await load()
  }
}

function moveUp(index: number) {
  if (index <= 0) return
  const items = [...skills.value];
  [items[index - 1], items[index]] = [items[index], items[index - 1]]
  skills.value = items.map((item, i) => ({ ...item, sort_order: i }))
  api.put('/chat/skills/reorder', { items: items.map((item, i) => ({ id: item.id, sort_order: i })) }).catch(() => load())
}

function moveDown(index: number) {
  if (index >= skills.value.length - 1) return
  const items = [...skills.value];
  [items[index], items[index + 1]] = [items[index + 1], items[index]]
  skills.value = items.map((item, i) => ({ ...item, sort_order: i }))
  api.put('/chat/skills/reorder', { items: items.map((item, i) => ({ id: item.id, sort_order: i })) }).catch(() => load())
}

onMounted(load)
</script>

<template>
  <div class="skill-page">
    <div class="skill-header">
      <NText tag="h2" class="skill-title">Skill 管理</NText>
      <NButton type="primary" @click="openNew" round>
        <template #icon><Plus :size="16" /></template>
        新建 Skill
      </NButton>
    </div>

    <!-- Cache hint -->
    <NAlert type="warning" :bordered="false" style="margin-bottom: 20px">
      <template #header>⚠️ 关于修改 Skill 的提示</template>
      <div style="font-size: 13px; line-height: 1.6">
        <p>Skill 数据会作为系统提示词的一部分发送给 AI 模型，频繁修改会 <strong>降低 AI 缓存命中率</strong>，导致：</p>
        <ul style="margin: 4px 0 0 16px; padding: 0">
          <li>AI 响应速度变慢（缓存失效后需重新处理上下文）</li>
          <li>API Token 消耗增加</li>
        </ul>
        <p style="margin-top: 4px">建议：集中修改后尽量减少改动频率。</p>
      </div>
    </NAlert>

    <!-- List -->
    <NSpin :show="loading" style="min-height: 200px">
      <template v-if="skills.length > 0">
        <NList hoverable>
          <NListItem
            v-for="(skill, index) in skills"
            :key="skill.id"
            :class="{ 'drag-over': dropIndex === index }"
          >
            <template #prefix>
              <div class="skill-drag-handle" title="拖拽排序"
                draggable="true"
                @dragstart="onDragStart($event, index)"
                @dragover="onDragOver($event, index)"
                @dragleave="onDragLeave"
                @drop="onDrop($event, index)"
              >
                <GripVertical :size="16" />
              </div>
            </template>

            <div class="skill-content">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                <BookOpen :size="16" style="color:var(--accent);flex-shrink:0" />
                <NText style="font-weight:600;flex:1">{{ skill.name }}</NText>
                <NSwitch
                  :value="skill.enabled"
                  size="small"
                  @update:value="async (v) => {
                    const old = skill.enabled
                    skill.enabled = v
                    try { await api.put(`/chat/skills/${skill.id}`, { enabled: v }) } catch { skill.enabled = old }
                  }"
                />
              </div>
              <NText depth="3" style="font-size:12px;line-height:1.5;display:block;margin-bottom:4px">
                {{ skill.content?.slice(0, 120) || '（空）' }}{{ skill.content?.length > 120 ? '...' : '' }}
              </NText>
              <div style="display:flex;align-items:center;gap:8px">
                <NTag size="tiny" :bordered="false">#{{ skill.sort_order + 1 }}</NTag>
                <NText depth="3" style="font-size:11px">更新于 {{ skill.updated_at?.slice(0, 10) }}</NText>
              </div>
            </div>

            <template #suffix>
              <div style="display:flex;gap:2px;flex-shrink:0">
                <NButton quaternary size="tiny" @click="moveUp(index)" :disabled="index === 0">
                  <template #icon><ArrowUp :size="14" /></template>
                </NButton>
                <NButton quaternary size="tiny" @click="moveDown(index)" :disabled="index === skills.length - 1">
                  <template #icon><ArrowDown :size="14" /></template>
                </NButton>
                <NButton quaternary size="tiny" @click="openEdit(skill)">
                  <template #icon><Pencil :size="14" /></template>
                </NButton>
                <NPopconfirm @positive-click="remove(skill.id)">
                  <template #trigger>
                    <NButton quaternary size="tiny" type="error">
                      <template #icon><Trash2 :size="14" /></template>
                    </NButton>
                  </template>
                  确定删除「{{ skill.name }}」？
                </NPopconfirm>
              </div>
            </template>
          </NListItem>
        </NList>
      </template>
      <NEmpty v-else description="暂无 Skill，点击上方按钮创建" />
    </NSpin>

    <!-- Edit Modal -->
    <NModal
      v-model:show="showModal"
      preset="card"
      :title="editing ? '编辑 Skill' : '新建 Skill'"
      style="width: 780px; max-width: 94vw"
      :mask-closable="false"
      :segmented="{ content: true, footer: true }"
      header-style="font-size:18px;font-weight:600"
      content-style="padding: 16px 24px"
      footer-style="padding: 16px 24px"
    >
      <NForm :model="form" label-placement="top">
        <NFormItem label="名称" required>
          <NInput v-model:value="form.name" placeholder="例如：班级管理规则" :maxlength="100" show-count clearable />
        </NFormItem>
        <NFormItem label="启用">
          <NSwitch v-model:value="form.enabled" />
        </NFormItem>
        <NFormItem label="内容（Markdown 格式）">
          <div class="cm-editor-wrap">
            <Codemirror
              v-model="form.content"
              :extensions="cmExtensions"
              :style="{ height: '420px', width: '100%' }"
              :placeholder="'编写 Skill 内容...\n\n支持 Markdown 格式\n这些内容将作为 AI 的参考数据注入系统提示词'"
            />
          </div>
        </NFormItem>
      </NForm>

      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px">
          <NButton @click="showModal = false" :disabled="saving" quaternary>取消</NButton>
          <NButton type="primary" @click="save" :disabled="!form.name.trim()" :loading="saving" round>
            {{ editing ? '保存修改' : '创建' }}
          </NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.skill-page { max-width: 800px; margin: 0 auto; }
.skill-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 20px;
}
.skill-title { font-size: 20px; font-weight: 600; color: var(--text-primary); margin: 0; }

.skill-drag-handle {
  cursor: grab; color: var(--text-muted);
  display: flex; padding: 4px;
  border-radius: 4px;
  transition: all .12s;
}
.skill-drag-handle:hover { color: var(--text-secondary); background: var(--surface-2); }
.skill-drag-handle:active { cursor: grabbing; }

.cm-editor-wrap {
  border: 1px solid var(--hairline);
  border-radius: 8px;
  overflow: hidden;
}
.cm-editor-wrap :deep(.cm-editor) { height: 420px; }
.cm-editor-wrap :deep(.cm-scroller) { font-family: 'JetBrains Mono', 'Fira Code', monospace !important; font-size: 13px; }

@media (max-width: 768px) {
  .skill-drag-handle { display: none; }
}
</style>
