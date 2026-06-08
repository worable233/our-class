<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Shield, Plus, Pencil, Trash2, Check, X } from '@lucide/vue'
import { api } from '@/api/client'
import type { PermissionGroup, PermissionDef } from '@/types'
import { useDialog, useMessage } from 'naive-ui'
import {
  NButton, NCard, NModal, NForm, NFormItem, NInput,
  NSpace, NTag, NSpin, NEmpty, NCheckbox, NCheckboxGroup,
  NDivider, NGi, NGrid, NStatistic, NNumberAnimation, NAlert,
  NBadge, NIcon, NPopconfirm, NScrollbar, NButtonGroup,
} from 'naive-ui'

const dialog = useDialog()
const message = useMessage()
const groups = ref<PermissionGroup[]>([])
const allPermissions = ref<PermissionDef[]>([])
const loading = ref(true)
const saving = ref(false)
const showModal = ref(false)
const editing = ref<PermissionGroup | null>(null)
const form = ref({
  name: '',
  description: '',
  permissions: [] as string[],
})

const permissionCategories = computed(() => {
  const map: Record<string, PermissionDef[]> = {}
  for (const p of allPermissions.value) {
    const category = p.category
    if (!map[category]) map[category] = []
    map[category].push(p)
  }
  return Object.entries(map)
})

const totalPermissions = computed(() => allPermissions.value.length)

const groupedCount = computed(() =>
  groups.value.reduce((sum, g) => sum + g.permissions.length, 0),
)

function tagType(count: number) {
  if (count >= 15) return 'info' as const
  if (count >= 8) return 'warning' as const
  return 'success' as const
}

async function load() {
  loading.value = true
  try {
    const [g, p] = await Promise.all([
      api.get<PermissionGroup[]>('/roles/groups'),
      api.get<PermissionDef[]>('/roles/permissions'),
    ])
    groups.value = g
    allPermissions.value = p
  } catch {
    message.error('加载数据失败')
  } finally {
    loading.value = false
  }
}

function openNew() {
  editing.value = null
  form.value = { name: '', description: '', permissions: [] }
  showModal.value = true
}

function openEdit(g: PermissionGroup) {
  editing.value = g
  form.value = { name: g.name, description: g.description, permissions: [...g.permissions] }
  showModal.value = true
}

async function save() {
  if (!form.value.name) return
  saving.value = true
  try {
    if (editing.value) {
      await api.put(`/roles/groups/${editing.value.id}`, form.value)
      message.success('职位已更新')
    } else {
      await api.post('/roles/groups', form.value)
      message.success('职位已创建')
    }
    showModal.value = false
    await load()
  } catch {
    message.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function remove(id: number) {
  dialog.warning({
    title: '确认删除',
    content: '删除该职位后，拥有该职位的用户将失去相关权限。确定要删除吗？',
    positiveText: '确认删除',
    negativeText: '取消',
    positiveButtonProps: { type: 'error' as const },
    onPositiveClick: async () => {
      try {
        await api.delete(`/roles/groups/${id}`)
        message.success('已删除')
        await load()
      } catch {
        message.error('删除失败')
      }
    },
  })
}

onMounted(load)
</script>

<template>
  <div>
    <div style="margin-bottom: 16px; text-align: right;">
      <NButton type="primary" @click="openNew" round :disabled="allPermissions.length === 0">
        <template #icon><Plus :size="16" /></template>
        新建职位
      </NButton>
    </div>

    <!-- 统计卡片 -->
    <NGrid :cols="3" :x-gap="16" style="margin-bottom: 28px">
      <NGi>
        <NCard size="small" :bordered="true">
          <NText depth="3" style="font-size:12px;display:block;margin-bottom:4px">职位总数</NText>
          <NText style="font-size:28px;font-weight:700;letter-spacing:-0.03em">
            <NNumberAnimation :from="0" :to="groups.length" :duration="600" />
          </NText>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" :bordered="true">
          <NText depth="3" style="font-size:12px;display:block;margin-bottom:4px">可分配权限</NText>
          <NText style="font-size:28px;font-weight:700;letter-spacing:-0.03em;color:var(--accent-text)">
            <NNumberAnimation :from="0" :to="totalPermissions" :duration="600" />
          </NText>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" :bordered="true">
          <NText depth="3" style="font-size:12px;display:block;margin-bottom:4px">已分配权限</NText>
          <NText style="font-size:28px;font-weight:700;letter-spacing:-0.03em">
            <NNumberAnimation :from="0" :to="groupedCount" :duration="600" />
          </NText>
        </NCard>
      </NGi>
    </NGrid>

    <!-- 职位卡片网格 -->
    <NSpin :show="loading" style="min-height: 200px">
      <template v-if="groups.length > 0">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">
          <NCard v-for="group in groups" :key="group.id" size="small" :bordered="true" hoverable>
            <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:12px">
              <div style="width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:var(--accent-glow);color:var(--accent-text);flex-shrink:0">
                <Shield :size="20" />
              </div>
              <div style="flex:1;min-width:0">
                <NText style="font-weight:600;font-size:15px;display:block">{{ group.name }}</NText>
                <NText depth="3" style="font-size:12px;display:block">{{ group.description || '暂无描述' }}</NText>
              </div>
              <NTag :type="tagType(group.permissions.length)" size="small" round :bordered="false">
                {{ group.permissions.length }} 项权限
              </NTag>
            </div>

            <NDivider style="margin:8px 0" />

            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
              <NTag v-for="code in group.permissions.slice(0, 5)" :key="code" size="tiny" :bordered="false" style="display:flex;align-items:center;gap:2px">
                <template #icon><Check :size="10" /></template>
                {{ allPermissions.find(p => p.code === code)?.label || code }}
              </NTag>
              <NText v-if="group.permissions.length > 5" depth="3" style="font-size:11px;padding:2px 4px">+{{ group.permissions.length - 5 }} 项</NText>
              <NText v-if="group.permissions.length === 0" depth="3" style="font-size:11px;padding:2px 4px">暂无权限</NText>
            </div>

            <div style="display:flex;gap:8px;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--hairline)">
              <NButton quaternary size="tiny" @click="openEdit(group)">
                <template #icon><Pencil :size="14" /></template>编辑
              </NButton>
              <NPopconfirm @positive-click="remove(group.id)">
                <template #trigger>
                  <NButton quaternary size="tiny" type="error">
                    <template #icon><Trash2 :size="14" /></template>删除
                  </NButton>
                </template>
                确定删除职位「{{ group.name }}」？
              </NPopconfirm>
            </div>
          </NCard>
        </div>
      </template>
      <NEmpty v-else description="暂无职位，点击上方按钮创建" />
    </NSpin>

    <!-- 新建/编辑弹窗 -->
    <NModal
      v-model:show="showModal"
      preset="card"
      :title="editing ? '编辑职位' : '新建职位'"
      style="width: 640px; max-width: 92vw"
      :mask-closable="false"
      :segmented="{ content: true, footer: true }"
      header-style="font-size:18px;font-weight:600"
      content-style="padding: 20px 28px"
      footer-style="padding: 16px 28px"
    >
      <NForm :model="form" label-placement="top">
        <NFormItem label="职位名称" required>
          <NInput
            v-model:value="form.name"
            placeholder="例如：班长、纪律委员、课代表"
            :maxlength="20"
            show-count
            clearable
          />
        </NFormItem>
        <NFormItem label="描述（选填）">
          <NInput
            v-model:value="form.description"
            placeholder="简要说明该职位的职责范围"
            :maxlength="100"
            show-count
            clearable
            type="textarea"
            :rows="2"
          />
        </NFormItem>

        <NDivider style="margin: 20px 0 16px">
          <NTag size="small" :bordered="false" round>权限配置</NTag>
        </NDivider>

        <NAlert type="info" :bordered="false" style="margin-bottom: 20px">
          <template #header>勾选该职位拥有的权限</template>
          老师默认拥有全部权限，学生默认只有基础权限
        </NAlert>

        <div style="max-height: 360px; overflow-y: auto; padding-right: 4px">
          <NCheckboxGroup v-model:value="form.permissions">
            <div
              v-for="[category, perms] in permissionCategories"
              :key="category"
              style="margin-bottom: 16px"
            >
              <div
                style="
                  display: flex; align-items: center; gap: 8px;
                  padding: 8px 12px; margin-bottom: 8px;
                  border-radius: 6px;
                  background: var(--ground);
                  font-size: 13px; font-weight: 600;
                  color: var(--text-secondary);
                "
              >
                <NBadge :value="perms.length" :max="99" />
                {{ category }}
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 6px 12px; padding-left: 4px">
                <NCheckbox
                  v-for="p in perms"
                  :key="p.code"
                  :value="p.code"
                  style="padding: 3px 0; min-width: 140px"
                >
                  {{ p.label }}
                </NCheckbox>
              </div>
            </div>
          </NCheckboxGroup>
        </div>
      </NForm>

      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px">
          <NButton @click="showModal = false" :disabled="saving" quaternary>取消</NButton>
          <NButton
            type="primary"
            @click="save"
            :disabled="!form.name"
            :loading="saving"
            round
          >
            {{ editing ? '保存修改' : '创建职位' }}
          </NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
}
</style>
