<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useDialog, useMessage } from 'naive-ui'
import {
  NButton, NModal, NForm, NFormItem, NInput, NInputNumber, NSelect,
  NSpin, NEmpty, NText, NGrid, NGi, NTag, NAvatar, NIcon,
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
  class: string
}

const auth = useAuthStore()
const dialog = useDialog()
const message = useMessage()
const types = ref<ReviewType[]>([])
const classList = ref<string[]>([])
const filterClass = ref('')
const loading = ref(true)
const saving = ref(false)
const showModal = ref(false)
const editing = ref<ReviewType | null>(null)
const form = ref({ name: '', emoji: '', type: 'add' as 'add' | 'deduct', amount: 1, class: '' })

const commonEmojis = [
  '🙋', '📝', '🤝', '🏆', '👍', '📈', '👂', '⭐', '🌟', '💯',
  '🎯', '🎉', '💪', '🔥', '✨', '🎵', '🎨', '📚', '💡', '🔔',
  '⏰', '📕', '💬', '🚫', '❌', '🏃', '😴', '👎', '💢', '😤',
  '😡', '🤬', '💔', '⚠️', '🔇', '📛', '🛑', '🧊', '😪', '🤫',
]

const hasViewAll = computed(() => auth.permissions.includes('classes.view_all'))
const canEditGlobal = computed(() => hasViewAll.value)
const isEditingReadonly = computed(() => editing.value && !editing.value.class && !canEditGlobal.value)
const addTypes = computed(() => types.value.filter(t => t.type === 'add'))
const deductTypes = computed(() => types.value.filter(t => t.type === 'deduct'))

function load() {
  loading.value = true
  const params = filterClass.value ? `?class=${encodeURIComponent(filterClass.value)}` : ''
  Promise.all([
    api.get<ReviewType[]>(`/review-types${params}`),
    api.get<any[]>('/classes').catch(() => []),
  ]).then(([d, cls]) => {
    types.value = d || []
    classList.value = cls.map((c: any) => c.name) || []
    loading.value = false
  }).catch(() => { message.error('加载失败'); loading.value = false })
}

function openNew() {
  editing.value = null
  form.value = { name: '', emoji: '👍', type: 'add', amount: 1, class: filterClass.value || '' }
  showModal.value = true
}

function openEdit(t: ReviewType) {
  editing.value = t
  form.value = { name: t.name, emoji: t.emoji, type: t.type, amount: t.amount, class: t.class || '' }
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
    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
      <div>
        <NText tag="h2" style="margin:0 0 4px;font-size:24px;font-weight:700;">点评类型</NText>
        <NText depth="3" style="display:block;margin:0;font-size:14px;">管理加减分的点评项，可在积分管理中使用</NText>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <NSelect
          v-if="hasViewAll"
          v-model:value="filterClass"
          :options="[{label:'全部班级',value:''},...classList.map(c=>({label:c,value:c}))]"
          style="width:160px"
          size="small"
          placeholder="全部班级"
          clearable
          @update:value="load"
        />
        <NButton type="primary" @click="openNew" round size="small">
          <template #icon><Plus :size="16" /></template>
          新建点评
        </NButton>
      </div>
    </div>

    <NSpin :show="loading" style="min-height:300px">
      <template v-if="types.length > 0">
        <!-- 表扬区 -->
        <section style="margin-bottom:40px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
            <div style="width:32px;height:32px;border-radius:50%;background:rgba(24,160,88,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <ThumbsUp :size="16" style="color:#18a058" />
            </div>
            <NText style="font-size:18px;font-weight:700;color:var(--text-primary)">表扬</NText>
            <NTag size="small" type="success" round :bordered="false">{{ addTypes.length }} 项</NTag>
          </div>

          <n-grid v-if="addTypes.length > 0" :cols="6" :x-gap="48" :y-gap="32">
            <n-gi v-for="t in addTypes" :key="t.id">
              <div
                class="review-item"
                :class="{ 'review-item-readonly': !t.class && !canEditGlobal }"
                @click="canEditGlobal || t.class ? openEdit(t) : undefined"
                :title="!t.class && !canEditGlobal ? '仅可查看' : '点击编辑'"
              >
                <div class="review-circle-wrap">
                  <n-avatar
                    :size="80"
                    round
                    :style="{
                      background: 'linear-gradient(135deg, rgba(24,160,88,0.15), rgba(24,160,88,0.06))',
                      border: '2px solid rgba(24,160,88,0.25)',
                      fontSize: '32px',
                      cursor: !t.class && !canEditGlobal ? 'default' : 'pointer',
                      transition: 'box-shadow 0.2s var(--ease-out)',
                    }"
                    class="review-avatar"
                  >
                    {{ t.emoji }}
                  </n-avatar>
                  <n-tag
                    size="tiny"
                    round
                    :bordered="false"
                    class="review-badge"
                    :style="{
                      position: 'absolute',
                      top: '-6px',
                      right: '-6px',
                      background: '#18a058',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: '11px',
                      padding: '0 5px',
                      lineHeight: '22px',
                      minWidth: '28px',
                      justifyContent: 'center',
                    }"
                  >
                    +{{ t.amount }}
                  </n-tag>
                </div>
                <n-text class="review-name" style="display:block;text-align:center;font-size:14px;font-weight:600;margin-top:10px;max-width:90px;line-height:1.3">
                  {{ t.name }}
                </n-text>
                <n-tag v-if="t.class" size="tiny" :bordered="false" round style="margin-top:4px;font-size:9px;">{{ t.class }}</n-tag>
                <n-tag v-else-if="!canEditGlobal" size="tiny" :bordered="false" round style="margin-top:4px;font-size:9px;" type="info">全局</n-tag>
              </div>
            </n-gi>
          </n-grid>
          <NEmpty v-else :description="'暂无表扬点评项'" style="padding:24px 0" />
        </section>

        <!-- 待改进区 -->
        <section>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
            <div style="width:32px;height:32px;border-radius:50%;background:rgba(208,48,80,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <ShieldBan :size="16" style="color:#d03050" />
            </div>
            <NText style="font-size:18px;font-weight:700;color:var(--text-primary)">待改进</NText>
            <NTag size="small" type="error" round :bordered="false">{{ deductTypes.length }} 项</NTag>
          </div>

          <n-grid v-if="deductTypes.length > 0" :cols="6" :x-gap="48" :y-gap="32">
            <n-gi v-for="t in deductTypes" :key="t.id">
              <div
                class="review-item"
                :class="{ 'review-item-readonly': !t.class && !canEditGlobal }"
                @click="canEditGlobal || t.class ? openEdit(t) : undefined"
                :title="!t.class && !canEditGlobal ? '仅可查看' : '点击编辑'"
              >
                <div class="review-circle-wrap">
                  <n-avatar
                    :size="80"
                    round
                    :style="{
                      background: 'linear-gradient(135deg, rgba(208,48,80,0.15), rgba(208,48,80,0.06))',
                      border: '2px solid rgba(208,48,80,0.25)',
                      fontSize: '32px',
                      cursor: !t.class && !canEditGlobal ? 'default' : 'pointer',
                      transition: 'box-shadow 0.2s var(--ease-out)',
                    }"
                    class="review-avatar"
                  >
                    {{ t.emoji }}
                  </n-avatar>
                  <n-tag
                    size="tiny"
                    round
                    :bordered="false"
                    class="review-badge"
                    :style="{
                      position: 'absolute',
                      top: '-6px',
                      right: '-6px',
                      background: '#d03050',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: '11px',
                      padding: '0 5px',
                      lineHeight: '22px',
                      minWidth: '28px',
                      justifyContent: 'center',
                    }"
                  >
                    -{{ t.amount }}
                  </n-tag>
                </div>
                <n-text class="review-name" style="display:block;text-align:center;font-size:14px;font-weight:600;margin-top:10px;max-width:90px;line-height:1.3">
                  {{ t.name }}
                </n-text>
                <n-tag v-if="t.class" size="tiny" :bordered="false" round style="margin-top:4px;font-size:9px;">{{ t.class }}</n-tag>
                <n-tag v-else-if="!canEditGlobal" size="tiny" :bordered="false" round style="margin-top:4px;font-size:9px;" type="info">全局</n-tag>
              </div>
            </n-gi>
          </n-grid>
          <NEmpty v-else :description="'暂无待改进点评项'" style="padding:24px 0" />
        </section>
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
              :disabled="isEditingReadonly"
            ><ThumbsUp :size="15" style="margin-right:4px" /> 加分</NButton>
            <NButton
              :type="form.type === 'deduct' ? 'primary' : 'default'"
              @click="form.type = 'deduct'" style="flex:1" round
              :disabled="isEditingReadonly"
            ><ShieldBan :size="15" style="margin-right:4px" /> 扣分</NButton>
          </div>
        </NFormItem>
        <NFormItem label="班级" v-if="hasViewAll">
          <NSelect v-model:value="form.class" :options="[{label:'全局（所有班级）',value:''},...classList.map(c=>({label:c,value:c}))]" placeholder="选择班级" :disabled="!!editing || isEditingReadonly" />
        </NFormItem>
        <NFormItem label="名称" required>
          <NInput v-model:value="form.name" placeholder="例如：积极发言" :maxlength="10" show-count clearable :disabled="isEditingReadonly" />
        </NFormItem>
        <NFormItem label="分值" required>
          <NInputNumber v-model:value="form.amount" :min="1" :max="100" style="width:120px" :disabled="isEditingReadonly" />
        </NFormItem>
        <NFormItem label="图标" required>
          <div style="display:flex;flex-wrap:wrap;gap:4px">
            <NButton
              v-for="e in commonEmojis" :key="e"
              size="tiny"
              :type="form.emoji === e ? 'primary' : 'default'"
              :secondary="form.emoji === e"
              @click="isEditingReadonly ? undefined : form.emoji = e"
              style="font-size:16px;padding:2px 6px;min-width:32px"
              :disabled="isEditingReadonly"
            >{{ e }}</NButton>
          </div>
        </NFormItem>
      </NForm>
      <template #footer>
        <div style="display:flex;justify-content:space-between;gap:10px">
          <NButton v-if="editing && !isEditingReadonly" type="error" quaternary @click="remove(editing.id)" :disabled="saving">
            <template #icon><Trash2 :size="14" /></template>删除
          </NButton>
          <span style="flex:1" />
          <NButton @click="showModal = false" quaternary :disabled="saving">取消</NButton>
          <template v-if="isEditingReadonly">
            <NButton type="primary" @click="showModal = false" round>关闭</NButton>
          </template>
          <template v-else>
            <NButton type="primary" @click="save" :disabled="!form.name || !form.emoji" :loading="saving" round>
              {{ editing ? '保存' : '创建' }}
            </NButton>
          </template>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.review-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition: transform 0.2s var(--ease-out);
}
.review-item:hover {
  transform: translateY(-4px);
}
.review-item-readonly {
  cursor: default;
  opacity: 0.75;
  filter: grayscale(0.3);
}
.review-item-readonly:hover {
  transform: none;
}
.review-item:hover .review-avatar {
  box-shadow: 0 6px 20px rgba(0,0,0,0.12);
}

.review-circle-wrap {
  position: relative;
  display: inline-flex;
}

@media (max-width: 768px) {
  section :deep(.n-grid) {
    grid-template-columns: repeat(3, 1fr) !important;
  }
}
</style>
