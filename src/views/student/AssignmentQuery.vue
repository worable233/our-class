<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { Assignment } from '@/types'
import { NButton, NCard, NModal, NInput, NForm, NFormItem, NSpace, NTag, NSpin, NEmpty, NText } from 'naive-ui'

const auth = useAuthStore()
const assignments = ref<Assignment[]>([])
const loading = ref(true)
const showSubmit = ref(false)
const submittingId = ref<number | null>(null)
const submitContent = ref('')

async function load() {
  loading.value = true
  assignments.value = await api.get<Assignment[]>(`/assignments?student_id=${auth.user?.id}`)
  loading.value = false
}

function openSubmit(assignmentId: number) {
  submittingId.value = assignmentId
  submitContent.value = ''
  showSubmit.value = true
}

async function submit() {
  if (submittingId.value === null) return
  await api.post(`/assignments/${submittingId.value}/submit`, {
    student_id: auth.user?.id,
    content: submitContent.value,
  })
  showSubmit.value = false
  submittingId.value = null
  submitContent.value = ''
  await load()
}

function handleClose() {
  showSubmit.value = false
  submittingId.value = null
  submitContent.value = ''
}

onMounted(load)
</script>

<template>
  <div>
    <div class="page-header">
      <p style="font-size: 14px; color: var(--text-muted)">查看与提交作业</p>
    </div>

    <n-spin :show="loading">
      <div
        v-if="!loading && assignments.length === 0"
        style="display: flex; justify-content: center; padding: 48px 0"
      >
        <n-empty description="暂无作业" />
      </div>
      <div v-else style="display: flex; flex-direction: column; gap: 16px">
        <n-card v-for="a in assignments" :key="a.id" :hoverable="true">
          <template #header>
            <div class="assign-head">
              <div class="assign-info" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
                <n-text strong style="font-size: 16px">{{ a.title }}</n-text>
                <n-tag size="small">{{ a.course }}</n-tag>
                <n-text depth="3">{{ a.teacher_name }}</n-text>
              </div>
              <div class="assign-status" style="white-space: nowrap">
                <n-tag v-if="a.submit_status === 'graded'" size="small" type="success">
                  已批改 {{ a.submit_score }}分
                </n-tag>
                <n-tag v-else-if="a.submit_status === 'pending'" size="small" type="warning">
                  已提交待批改
                </n-tag>
                <n-tag v-else size="small" type="default">
                  未提交
                </n-tag>
              </div>
            </div>
          </template>
          <p style="font-size: 14px; line-height: 1.6; margin: 0 0 16px 0; color: var(--text-secondary)">
            {{ a.description }}
          </p>
          <template #footer>
            <div class="assign-foot" style="display: flex; justify-content: space-between; align-items: center; padding-top: 16px; border-top: 1px solid var(--hairline)">
              <n-text depth="3" style="display: flex; align-items: center; gap: 6px">
                <font-awesome-icon :icon="['fas', 'calendar']" /> 截止：{{ a.due_date }}
              </n-text>
              <n-button
                v-if="a.submit_status !== 'graded'"
                type="primary"
                size="small"
                @click="openSubmit(a.id)"
              >
                {{ a.submit_status === 'pending' ? '重新提交' : '提交作业' }}
              </n-button>
            </div>
          </template>
        </n-card>
      </div>
    </n-spin>

    <!-- Submit Modal -->
    <n-modal
      v-model:show="showSubmit"
      preset="card"
      title="提交作业"
      style="width: 500px"
      :mask-closable="false"
      @update:show="(val) => { if (!val) handleClose() }"
    >
      <n-form>
        <n-form-item label="作业内容">
          <n-input type="textarea" v-model:value="submitContent" placeholder="输入作业内容或备注..." />
        </n-form-item>
      </n-form>
      <template #footer>
        <div style="display: flex; gap: 8px; justify-content: flex-end">
          <n-button @click="handleClose">取消</n-button>
          <n-button type="primary" @click="submit" :disabled="!submitContent">提交</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>
