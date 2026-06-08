<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '@/api/client'
import { useDialog, useMessage } from 'naive-ui'
import {
  NButton, NModal, NForm, NFormItem, NInput, NInputNumber,
  NSpin, NEmpty, NText, NCard, NTag,
} from 'naive-ui'
import { Plus, Trash2, ThumbsUp, ShieldBan } from '@lucide/vue'

interface ReviewType {
  id: number
  name: string
  emoji: string
  type: 'add' | 'deduct'
  amount: number
  sort_order: number
  is_active: number
}

const dialog = useDialog()
const message = useMessage()
const types = ref<ReviewType[]>([])
const loading = ref(true)
const saving = ref(false)
const showModal = ref(false)
const editing = ref<ReviewType | null>(null)
const form = ref({ name: '', emoji: '', type: 'add' as 'add' | 'deduct', amount: 1 })

const commonEmojis = [
  '🙋', '📝', '🤝', '🏆', '👍', '📈', '👂', '⭐', '🌟', '💯',
  '🎯', '🎉', '💪', '🔥', '✨', '🎵', '🎨', '📚', '💡', '🔔',
  '⏰', '📕', '💬', '🚫', '❌', '🏃', '😴', '👎', '💢', '😤',
  '😡', '🤬', '💔', '⚠️', '🔇', '📛', '🛑', '🧊', '😪', '🤫',
]

const addTypes = computed(() => types.value.filter(t => t.type === 'add'))
const deductTypes = computed(() => types.value.filter(t => t.type === 'deduct'))

function load() {
  loading.value = true
  api.get<ReviewType[]>('/review-types').then(d => { types.value = d || []; loading.value = false })
    .catch(() => { message.error('加载失败'); loading.value = false })
}

function openNew() {
  editing.value = null
  form.value = { name: '', emoji: '👍', type: 'add', amount: 1 }
  showModal.value = true
}

function openEdit(t: ReviewType) {
  editing.value = t
  form.value = { name: t.name, emoji: t.emoji, type: t.type, amount: t.amount }
  showModal.value = true
}

async function save() {
  if (!form.value.name || !form.value.emoji) return
  saving.value = true
  try {
    if (editing.value) {
      const res = await api.put<any>(`/review-types/${editing.value.id}`, form.value)
      message.success(res?.message || '已保存')
    } else {
      await api.post('/review-types', form.value)
      message.success('已创建')
    }
    showModal.value = false
    load()
  } catch { message.error('保存失败') }
  finally { saving.value = false }
}

async function remove(id: number) {
  dialog.warning({
    title: '确认删除',
    content: '删除后无法恢复。确定要删除吗？',
    positiveText: '删除', negativeText: '取消',
    positiveButtonProps: { type: 'error' as const },
    onPositiveClick: async () => {
      try { await api.delete(`/review-types/${id}`); message.success('已删除'); load() }
      catch (e: any) { message.error(e.message || '删除失败') }
    },
  })
}

onMounted(load)
</script>

<template>
  <div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
      <div>
        <NText tag="h2" style="margin:0 0 4px;font-size:24px;font-weight:700;">点评类型</NText>
        <NText depth="3" style="display:block;margin:0;font-size:14px;">管理加减分的点评项，可在积分管理中使用</NText>
      </div>
      <NButton type="primary" @click="openNew" round>
        <template #icon><Plus :size="16" /></template>
        新建点评
      </NButton>
    </div>

    <NSpin :show="loading" style="min-height:200px">
      <template v-if="types.length > 0">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <NCard size="small" :bordered="true">
            <template #header>
              <div style="display:flex;align-items:center;gap:8px">
                <ThumbsUp :size="16" style="color:#18a058" />
                <NText style="font-weight:600">正向加分</NText>
                <NTag size="small" type="success" round :bordered="false">{{ addTypes.length }}</NTag>
              </div>
            </template>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <NButton v-for="t in addTypes" :key="t.id" quaternary block style="padding:8px;height:auto" @click="openEdit(t)">
                <span style="font-size:20px;line-height:1;margin-right:6px">{{ t.emoji }}</span>
                <span style="flex:1;font-size:13px;font-weight:500;text-align:left">{{ t.name }}</span>
                <span style="font-size:13px;font-weight:700;color:#18a058">+{{ t.amount }}</span>
              </NButton>
            </div>
          </NCard>
          <NCard size="small" :bordered="true">
            <template #header>
              <div style="display:flex;align-items:center;gap:8px">
                <ShieldBan :size="16" style="color:#d03050" />
                <NText style="font-weight:600">负向约束</NText>
                <NTag size="small" type="error" round :bordered="false">{{ deductTypes.length }}</NTag>
              </div>
            </template>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <NButton v-for="t in deductTypes" :key="t.id" quaternary block style="padding:8px;height:auto" @click="openEdit(t)">
                <span style="font-size:20px;line-height:1;margin-right:6px">{{ t.emoji }}</span>
                <span style="flex:1;font-size:13px;font-weight:500;text-align:left">{{ t.name }}</span>
                <span style="font-size:13px;font-weight:700;color:#d03050">-{{ t.amount }}</span>
              </NButton>
            </div>
          </NCard>
        </div>
      </template>
      <NEmpty v-else description="暂无点评类型" />
    </NSpin>

    <!-- Modal -->
    <NModal
      v-model:show="showModal" preset="card"
      :title="editing ? '编辑点评' : '新建点评'"
      style="width:480px;max-width:92vw"
      :mask-closable="false"
      :segmented="{ content: true, footer: true }"
      header-style="font-size:18px;font-weight:600"
      content-style="padding:20px 24px"
      footer-style="padding:12px 24px"
    >
      <NForm :model="form" label-placement="top">
        <NFormItem label="点评类型" required>
          <div style="display:flex;gap:8px;width:100%">
            <NButton
              :type="form.type === 'add' ? 'primary' : 'default'"
              @click="form.type = 'add'" style="flex:1" round
            ><ThumbsUp :size="15" style="margin-right:4px" /> 加分</NButton>
            <NButton
              :type="form.type === 'deduct' ? 'primary' : 'default'"
              @click="form.type = 'deduct'" style="flex:1" round
            ><ShieldBan :size="15" style="margin-right:4px" /> 扣分</NButton>
          </div>
        </NFormItem>
        <NFormItem label="名称" required>
          <NInput v-model:value="form.name" placeholder="例如：积极发言" :maxlength="10" show-count clearable />
        </NFormItem>
        <NFormItem label="分值" required>
          <NInputNumber v-model:value="form.amount" :min="1" :max="100" style="width:120px" />
        </NFormItem>
        <NFormItem label="图标" required>
          <div style="display:flex;flex-wrap:wrap;gap:4px">
            <NButton
              v-for="e in commonEmojis" :key="e"
              size="tiny"
              :type="form.emoji === e ? 'primary' : 'default'"
              :secondary="form.emoji === e"
              @click="form.emoji = e"
              style="font-size:16px;padding:2px 6px;min-width:32px"
            >{{ e }}</NButton>
          </div>
        </NFormItem>
      </NForm>
      <template #footer>
        <div style="display:flex;justify-content:space-between;gap:10px">
          <NButton v-if="editing" type="error" quaternary @click="remove(editing.id)" :disabled="saving">
            <template #icon><Trash2 :size="14" /></template>删除
          </NButton>
          <span style="flex:1" />
          <NButton @click="showModal = false" quaternary :disabled="saving">取消</NButton>
          <NButton type="primary" @click="save" :disabled="!form.name || !form.emoji" :loading="saving" round>
            {{ editing ? '保存' : '创建' }}
          </NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
@media (max-width: 768px) {
  .palette { grid-template-columns: 1fr; gap: 20px; }
  .matrix { grid-template-columns: 1fr 1fr; }
}

</style>
