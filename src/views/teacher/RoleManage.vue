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
  <div style="max-width: 1000px; margin: 0 auto">
    <!-- 页面头部 -->
    <div
      style="
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 28px;
      "
    >
      <div>
        <h2 style="margin: 0 0 6px; font-size: 24px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.02em">
          职位管理
        </h2>
        <p style="margin: 0; font-size: 14px; color: var(--text-muted)">
          管理班干部职位及其权限，老师与普通学生也在此配置
        </p>
      </div>
      <NButton type="primary" @click="openNew" round :disabled="allPermissions.length === 0">
        <template #icon><Plus :size="16" /></template>
        新建职位
      </NButton>
    </div>

    <!-- 统计卡片 -->
    <NGrid :cols="3" :x-gap="16" style="margin-bottom: 28px">
      <NGi>
        <div class="stat-card">
          <div class="stat-label">职位总数</div>
          <div class="stat-value">
            <NNumberAnimation :from="0" :to="groups.length" :duration="600" />
          </div>
        </div>
      </NGi>
      <NGi>
        <div class="stat-card">
          <div class="stat-label">可分配权限</div>
          <div class="stat-value accent">
            <NNumberAnimation :from="0" :to="totalPermissions" :duration="600" />
          </div>
        </div>
      </NGi>
      <NGi>
        <div class="stat-card">
          <div class="stat-label">已分配权限</div>
          <div class="stat-value">
            <NNumberAnimation :from="0" :to="groupedCount" :duration="600" />
          </div>
        </div>
      </NGi>
    </NGrid>

    <!-- 职位卡片网格 -->
    <NSpin :show="loading" style="min-height: 200px">
      <template v-if="groups.length > 0">
        <div class="role-grid">
          <div
            v-for="group in groups"
            :key="group.id"
            class="role-card"
          >
            <!-- 卡片头部 -->
            <div class="role-card-header">
              <div class="role-icon">
                <Shield :size="22" />
              </div>
              <div class="role-info">
                <div class="role-name">{{ group.name }}</div>
                <div class="role-desc">{{ group.description || '暂无描述' }}</div>
              </div>
              <NTag :type="tagType(group.permissions.length)" size="small" round :bordered="false">
                {{ group.permissions.length }} 项权限
              </NTag>
            </div>

            <!-- 分隔线 -->
            <div class="role-divider" />

            <!-- 权限列表 -->
            <div class="role-perms">
              <div
                v-for="code in group.permissions.slice(0, 5)"
                :key="code"
                class="perm-chip"
              >
                <Check :size="12" class="perm-check" />
                <span class="perm-label">{{ allPermissions.find(p => p.code === code)?.label || code }}</span>
              </div>
              <div v-if="group.permissions.length > 5" class="perm-more">
                +{{ group.permissions.length - 5 }} 项更多权限
              </div>
              <div v-if="group.permissions.length === 0" class="perm-empty">
                暂无权限
              </div>
            </div>

            <!-- 操作区 -->
            <div class="role-actions">
              <NButton
                quaternary
                size="tiny"
                @click="openEdit(group)"
                style="padding: 4px 12px; border-radius: 6px"
              >
                <template #icon><Pencil :size="14" /></template>
                编辑
              </NButton>
              <NButton
                quaternary
                size="tiny"
                type="error"
                @click="remove(group.id)"
                style="padding: 4px 12px; border-radius: 6px"
              >
                <template #icon><Trash2 :size="14" /></template>
                删除
              </NButton>
            </div>
          </div>
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
      header-style="padding: 24px 28px 0; font-size: 18px; font-weight: 600"
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
.stat-card {
  background: var(--surface-1);
  border: 1px solid var(--hairline);
  border-radius: 6px;
  padding: 18px 22px;
  transition: border-color 0.2s;
}
.stat-card:hover {
  border-color: var(--accent);
}
.stat-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.03em;
  line-height: 1;
}
.stat-value.accent {
  color: var(--accent);
}

/* ── 职位卡片网格 ── */
.role-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.role-card {
  background: var(--surface-1);
  border: 1px solid var(--hairline);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  transition: border-color 0.2s, transform 0.2s;
}
.role-card:hover {
  border-color: rgba(94, 106, 210, 0.3);
  transform: translateY(-1px);
}

/* 卡片头部 */
.role-card-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 20px 14px;
}
.role-icon {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  background: rgba(94, 106, 210, 0.12);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.role-info {
  flex: 1;
  min-width: 0;
}
.role-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}
.role-desc {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 分隔线 */
.role-divider {
  height: 1px;
  background: var(--hairline);
  margin: 0 20px;
}

/* 权限列表 */
.role-perms {
  padding: 14px 20px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.perm-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}
.perm-check {
  color: var(--accent);
  flex-shrink: 0;
}
.perm-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.perm-more {
  font-size: 11px;
  color: var(--text-muted);
  padding: 2px 0;
}
.perm-empty {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}

/* 操作区 */
.role-actions {
  display: flex;
  gap: 6px;
  padding: 10px 20px 16px;
  justify-content: flex-end;
}

/* 响应式 */
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .role-grid {
    grid-template-columns: 1fr;
  }
}
</style>
