<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '@/api/client'
import { useDialog, useMessage } from 'naive-ui'
import {
  NButton, NModal, NForm, NFormItem, NInput, NInputNumber,
  NSpin, NEmpty,
} from 'naive-ui'
import { Plus, Pencil, Trash2, ThumbsUp, ShieldBan } from '@lucide/vue'

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
      await api.put(`/review-types/${editing.value.id}`, form.value)
      message.success('已更新')
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
      catch { message.error('删除失败') }
    },
  })
}

onMounted(load)
</script>

<template>
  <div style="max-width: 800px; margin: 0 auto">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
      <div>
        <h2 style="margin:0 0 4px;font-size:24px;font-weight:700;color:var(--text-primary)">点评类型</h2>
        <p style="margin:0;font-size:14px;color:var(--text-muted)">管理加减分的点评项，可在积分管理中使用</p>
      </div>
      <NButton type="primary" @click="openNew" round>
        <template #icon><Plus :size="16" /></template>
        新建点评
      </NButton>
    </div>

    <NSpin :show="loading" style="min-height:200px">
      <template v-if="types.length > 0">
        <div style="display:flex;flex-direction:column;gap:24px">
          <!-- 正向加分 -->
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
              <ThumbsUp :size="18" style="color:#18a058" />
              <span style="font-size:15px;font-weight:600;color:var(--text-primary)">正向加分</span>
              <span style="font-size:12px;color:var(--text-muted)">{{ addTypes.length }} 项</span>
            </div>
            <div class="review-grid">
              <div v-for="t in addTypes" :key="t.id" class="review-card add">
                <span class="review-emoji">{{ t.emoji }}</span>
                <div class="review-info">
                  <span class="review-name">{{ t.name }}</span>
                  <span class="review-amount">+{{ t.amount }}</span>
                </div>
                <div class="review-actions">
                  <button class="mini-btn" @click="openEdit(t)" title="编辑"><Pencil :size="13" /></button>
                  <button class="mini-btn danger" @click="remove(t.id)" title="删除"><Trash2 :size="13" /></button>
                </div>
              </div>
            </div>
          </div>
          <!-- 负向约束 -->
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
              <ShieldBan :size="18" style="color:#d03050" />
              <span style="font-size:15px;font-weight:600;color:var(--text-primary)">负向约束</span>
              <span style="font-size:12px;color:var(--text-muted)">{{ deductTypes.length }} 项</span>
            </div>
            <div class="review-grid">
              <div v-for="t in deductTypes" :key="t.id" class="review-card deduct">
                <span class="review-emoji">{{ t.emoji }}</span>
                <div class="review-info">
                  <span class="review-name">{{ t.name }}</span>
                  <span class="review-amount deduct">-{{ t.amount }}</span>
                </div>
                <div class="review-actions">
                  <button class="mini-btn" @click="openEdit(t)" title="编辑"><Pencil :size="13" /></button>
                  <button class="mini-btn danger" @click="remove(t.id)" title="删除"><Trash2 :size="13" /></button>
                </div>
              </div>
            </div>
          </div>
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
      header-style="padding:20px 24px 0;font-size:18px;font-weight:600"
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
          <div class="emoji-grid">
            <button
              v-for="e in commonEmojis" :key="e"
              class="emoji-btn" :class="{ selected: form.emoji === e }"
              @click="form.emoji = e"
            >{{ e }}</button>
          </div>
        </NFormItem>
      </NForm>
      <template #footer>
        <div style="display:flex;justify-content:flex-end;gap:10px">
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
.review-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
}
.review-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--hairline);
  background: var(--surface-1);
  transition: border-color .15s;
}
.review-card.add:hover { border-color: rgba(24,160,88,0.3); }
.review-card.deduct:hover { border-color: rgba(208,48,80,0.3); }
.review-emoji { font-size: 24px; line-height:1; flex-shrink:0; }
.review-info { flex:1; min-width:0; }
.review-name { display:block; font-size:13px; font-weight:500; color:var(--text-primary); }
.review-amount { font-size:12px; font-weight:600; color:#18a058; }
.review-amount.deduct { color:#d03050; }
.review-actions {
  display:flex; gap:4px; opacity:0; transition:opacity .12s;
}
.review-card:hover .review-actions { opacity:1; }
.mini-btn {
  width:26px; height:26px; border-radius:6px;
  display:flex; align-items:center; justify-content:center;
  background:none; border:none; color:var(--text-muted);
  cursor:pointer; transition:all .1s;
}
.mini-btn:hover { background:var(--surface-2); color:var(--text-primary); }
.mini-btn.danger:hover { background:rgba(208,48,80,0.1); color:#d03050; }

.emoji-grid {
  display:flex; flex-wrap:wrap; gap:6px; max-height:200px; overflow-y:auto; padding:4px 0;
}
.emoji-btn {
  width:38px; height:38px; font-size:20px; line-height:1; display:flex;
  align-items:center; justify-content:center;
  border-radius:8px; border:1px solid transparent;
  background:var(--surface-2); cursor:pointer;
  transition:all .1s;
}
.emoji-btn:hover { border-color:var(--accent); background:var(--surface-3); }
.emoji-btn.selected { border-color:var(--accent); background:rgba(94,106,210,0.12); }
</style>
