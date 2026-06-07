<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { Student, PointRecord, PointSummary } from '@/types'
import {
  NButton, NCard, NModal, NInput, NSelect, NSpace,
  NGrid, NGi, NTag, NAvatar, NEmpty, NScrollbar, NText,
} from 'naive-ui'
import { useRefresh } from '@/composables/useRefresh'
import { Shuffle, Star, Plus, Minus } from '@lucide/vue'

const auth = useAuthStore()
const classes = ref<string[]>([])
const currentClass = ref('')
const students = ref<Student[]>([])
const pointSummary = ref<PointSummary[]>([])
const records = ref<PointRecord[]>([])
const loading = ref(true)

// Quick action state
const quickAction = ref<{
  student: Student; type: 'add' | 'deduct'; amount: number; show: boolean
} | null>(null)
const quickReason = ref('')
const customReason = ref('')
const floatingAnim = ref<{ id: number; text: string; type: string } | null>(null)

const commonReasons = {
  add: [
    { label: '积极发言', amount: 2 },
    { label: '作业优秀', amount: 3 },
    { label: '帮助同学', amount: 1 },
    { label: '竞赛获奖', amount: 5 },
    { label: '课堂表现好', amount: 2 },
    { label: '考试进步', amount: 3 },
    { label: '认真听课', amount: 1 },
    { label: '好人好事', amount: 2 },
  ],
  deduct: [
    { label: '上课迟到', amount: 1 },
    { label: '未完成作业', amount: 2 },
    { label: '上课讲话', amount: 1 },
    { label: '课堂违纪', amount: 2 },
    { label: '作业不认真', amount: 1 },
    { label: '早退', amount: 1 },
    { label: '上课睡觉', amount: 1 },
    { label: '不文明行为', amount: 2 },
  ],
}

const quickReasons = computed(() =>
  quickAction.value ? commonReasons[quickAction.value.type] : [],
)

// Get current points for a student
function getPoints(studentId: number): number {
  return pointSummary.value.find(p => p.id === studentId)?.total_points || 0
}

// Get rank for points display
function getRank(studentId: number): number {
  const sorted = [...pointSummary.value].sort((a, b) => b.total_points - a.total_points)
  return sorted.findIndex(p => p.id === studentId) + 1
}

async function loadClasses() {
  const cls = await api.get<string[]>('/classes')
  classes.value = cls || []
  const first = classes.value[0]; if (first) currentClass.value = first
}

async function loadStudents() {
  const url = currentClass.value ? `/students?class=${encodeURIComponent(currentClass.value)}` : '/students'
  students.value = await api.get<Student[]>(url)
}

async function loadPoints() {
  const url = currentClass.value ? `/points/summary?class=${encodeURIComponent(currentClass.value)}` : '/points/summary'
  pointSummary.value = await api.get<PointSummary[]>(url)
}

async function loadRecords() {
  const url = currentClass.value ? `/points?class=${encodeURIComponent(currentClass.value)}` : '/points'
  records.value = await api.get<PointRecord[]>(url)
}

async function loadAll() {
  loading.value = true
  await Promise.all([loadStudents(), loadPoints(), loadRecords()])
  loading.value = false
}

async function switchClass(cls: string) {
  currentClass.value = cls
  await loadAll()
}

// Open quick action modal
function openQuick(student: Student, type: 'add' | 'deduct', amount: number) {
  quickAction.value = { student, type, amount, show: true }
  quickReason.value = ''
  customReason.value = ''
}

// Execute the point action
async function confirmQuick() {
  if (!quickAction.value) return
  const reason = quickReason.value || customReason.value
  if (!reason) return

  await api.post('/points', {
    student_id: quickAction.value.student.id,
    reason,
    type: quickAction.value.type,
    amount: quickAction.value.amount,
  })

  // Show floating animation
  const sign = quickAction.value.type === 'add' ? '+' : '-'
  floatingAnim.value = {
    id: quickAction.value.student.id,
    text: `${sign}${quickAction.value.amount}`,
    type: quickAction.value.type,
  }
  setTimeout(() => { floatingAnim.value = null }, 1200)

  quickAction.value = null
  await loadPoints()
  await loadRecords()
}

// Random student picker (modal-based)
const randomModalVisible = ref(false)
const randomResult = ref<Student | null>(null)
const randoming = ref(false)
const randomDisplayName = ref('')
let randomStop = false

function openRandomModal() {
  randomStop = true
  randoming.value = false
  randomResult.value = null
  randomDisplayName.value = ''
  randomModalVisible.value = true
}

function closeRandomModal() {
  randomStop = true
  randoming.value = false
  randomModalVisible.value = false
}

function startRandomPick() {
  if (students.value.length === 0) return
  randoming.value = true
  randomResult.value = null
  randomDisplayName.value = ''
  randomStop = false

  let count = 0
  const maxLoops = 25
  let delay = 50

  function tick() {
    if (randomStop) return
    const idx = Math.floor(Math.random() * students.value.length)
    const s = students.value[idx]
    if (s) randomDisplayName.value = s.display_name
    count++
    if (count >= maxLoops) {
      randoming.value = false
      const finalIdx = Math.floor(Math.random() * students.value.length)
      const finalS = students.value[finalIdx]
      if (finalS) randomResult.value = finalS
      return
    }
    if (count > maxLoops * 0.5) delay += 25
    setTimeout(tick, delay)
  }

  tick()
}

// Quick action for random student
function quickForRandom(type: 'add' | 'deduct', amount: number) {
  if (randomResult.value) {
    randomStop = true
    randoming.value = false
    randomModalVisible.value = false
    openQuick(randomResult.value, type, amount)
  }
}

// Open score modal from student card click
function openScoreCard(student: Student) {
  openQuick(student, 'add', 1)
}

async function refreshAll() { await loadClasses(); await loadAll(); }
useRefresh(refreshAll);
onMounted(refreshAll)
</script>

<template>
  <div>

    <!-- Top Bar -->
    <div
      style="display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 32px; padding: 16px 20px; background: var(--surface-1); border: 1px solid var(--hairline); border-radius: var(--radius-md);"
    >
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <n-text depth="3" style="font-size: 13px; font-weight: 500; margin-right: 4px;">班级</n-text>
        <n-button
          v-for="cls in classes"
          :key="cls"
          size="small"
          :type="cls === currentClass ? 'primary' : 'default'"
          @click="switchClass(cls)"
        >
          {{ cls }}
        </n-button>
      </div>
      <n-button @click="openRandomModal">
        <Shuffle :size="16" /> 抽号
      </n-button>
    </div>

    <!-- Student Grid Section Header -->
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
      <n-text strong style="font-size: 15px; letter-spacing: -0.01em;">学生花名册</n-text>
      <n-text depth="3" style="font-size: 12px;">{{ students.length }} 人</n-text>
    </div>

    <!-- Student Grid -->
    <div
      style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; margin-bottom: 32px;"
    >
      <n-card
        v-for="s in students"
        :key="s.id"
        size="small"
        hoverable
        style="position: relative; overflow: hidden; cursor: pointer;"
        @click="openScoreCard(s)"
        :class="{ 'has-anim': floatingAnim?.id === s.id }"
      >
        <!-- Floating point animation -->
        <div v-if="floatingAnim?.id === s.id" class="float-point" :class="floatingAnim.type">
          {{ floatingAnim.text }}
        </div>
        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
          <div
            style="width: 46px; height: 46px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 18px; margin-bottom: 4px;"
            :style="{ background: `hsl(${(s.id * 47) % 360}, 60%, 50%)` }"
          >
            {{ s.display_name.charAt(0) }}
          </div>
          <n-text style="font-size: 14px; font-weight: 600; text-align: center; line-height: 1.3;">
            {{ s.display_name }}
          </n-text>
          <div
            style="font-size: 20px; font-weight: 700; color: var(--accent-text); letter-spacing: -0.02em; display: flex; align-items: center; gap: 4px;"
          >
            <Star :size="16" /> {{ getPoints(s.id) }}
          </div>
        </div>
      </n-card>

      <n-empty v-if="students.length === 0" description="该班级暂无学生" />
    </div>

    <!-- Recent Activity -->
    <n-card size="small" style="margin-bottom: 24px;">
      <template #header>
        <n-text strong style="font-size: 15px;">最近动态</n-text>
      </template>
      <div
        v-for="r in records.slice(0, 15)"
        :key="r.id"
        style="display: flex; align-items: center; gap: 12px; padding: 8px; font-size: 13px;"
      >
        <n-tag :type="r.type === 'add' ? 'success' : 'error'" size="small" :bordered="false">
          {{ r.type === 'add' ? '+' : '−' }}
        </n-tag>
        <div style="flex: 1; display: flex; gap: 8px; align-items: center; min-width: 0;">
          <n-text style="font-weight: 500; white-space: nowrap;">{{ r.student_name }}</n-text>
          <n-text depth="3" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ r.reason }}</n-text>
        </div>
        <n-text
          :type="r.type === 'add' ? 'success' : 'error'"
          style="font-weight: 700; font-size: 14px; min-width: 28px; text-align: right;"
        >
          {{ r.type === 'add' ? '+' : '' }}{{ r.amount }}
        </n-text>
        <n-text depth="3" style="font-size: 12px; min-width: 80px; text-align: right; flex-shrink: 0;">
          {{ r.date }}
        </n-text>
      </div>
      <n-empty v-if="records.length === 0" description="暂无记录" />
    </n-card>

    <!-- Quick Action Modal -->
    <n-modal
      :show="quickAction !== null"
      @update:show="(val: boolean) => { if (!val) quickAction = null }"
      preset="card"
      style="width: 420px;"
      :mask-closable="true"
    >
      <template #header>
        <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
          <div
            style="width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px; color: #fff; flex-shrink: 0;"
            :style="{ background: quickAction?.type === 'add' ? '#22c55e' : '#ef4444' }"
          >
            {{ quickAction?.student?.display_name?.charAt(0) || '' }}
          </div>
          <div style="flex: 1; font-size: 15px; color: var(--text-secondary);">
            给 <n-text strong>{{ quickAction?.student?.display_name }}</n-text>
            {{ quickAction?.type === 'add' ? '加分' : '扣分' }}
          </div>
          <n-text
            :type="quickAction?.type === 'add' ? 'success' : 'error'"
            style="font-size: 28px; font-weight: 800; letter-spacing: -0.03em;"
          >
            {{ quickAction?.type === 'add' ? '+' : '-' }}{{ quickAction?.amount }}
          </n-text>
        </div>
      </template>

      <div style="display: flex; flex-direction: column; gap: 16px;">
        <!-- Type Tabs -->
        <div style="display: flex; gap: 8px;">
          <n-button
            style="flex: 1;"
            :type="quickAction?.type === 'add' ? 'primary' : 'default'"
            @click="quickAction && (quickAction.type = 'add')"
          >
            <Plus :size="16" /> 加分
          </n-button>
          <n-button
            style="flex: 1;"
            :type="quickAction?.type === 'deduct' ? 'primary' : 'default'"
            @click="quickAction && (quickAction.type = 'deduct')"
          >
            <Minus :size="16" /> 扣分
          </n-button>
        </div>

        <!-- Amount Bar -->
        <div style="display: flex; align-items: center; gap: 8px;">
          <n-text depth="3" style="font-size: 13px;">分值：</n-text>
          <n-button
            v-for="n in [1, 2, 3, 5]"
            :key="n"
            size="small"
            :type="quickAction?.amount === n ? 'primary' : 'default'"
            @click="quickAction && (quickAction.amount = n)"
          >
            {{ quickAction?.type === 'add' ? '+' : '-' }}{{ n }}
          </n-button>
        </div>

        <!-- Reason List -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <n-button
            v-for="r in quickReasons"
            :key="r.label"
            quaternary
            :type="quickReason === r.label ? (quickAction?.type === 'add' ? 'success' : 'error') : 'default'"
            @click="quickReason = r.label; customReason = ''"
            style="justify-content: space-between;"
          >
            <span>{{ r.label }}</span>
            <n-text
              :type="quickAction?.type === 'add' ? 'success' : 'error'"
              style="font-size: 12px; font-weight: 700;"
            >
              {{ quickAction?.type === 'add' ? '+' : '-' }}{{ r.amount }}
            </n-text>
          </n-button>
        </div>

        <!-- Custom Input -->
        <n-input
          v-model:value="customReason"
          placeholder="或输入自定义原因..."
          @focus="quickReason = ''"
        />
      </div>

      <template #footer>
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <n-button @click="quickAction = null">取消</n-button>
          <n-button
            type="primary"
            :disabled="!quickReason && !customReason"
            @click="confirmQuick"
          >
            确认{{ quickAction?.type === 'add' ? '加分' : '扣分' }}
          </n-button>
        </div>
      </template>
    </n-modal>

    <!-- Random Pick Modal (keep existing custom implementation) -->
    <Teleport to="body">
      <div v-if="randomModalVisible" class="modal-mask" @click.self="closeRandomModal">
        <div class="random-modal">
          <div class="rm-header">
            <h3 class="rm-title"><Shuffle :size="16" /> 随机抽号</h3>
            <button class="rm-close" @click="closeRandomModal">✕</button>
          </div>

          <div class="rm-body">
            <div class="rm-display" :class="{ randoming, hasResult: !!randomResult }">
              <div class="rm-display-name">
                {{ randomResult ? randomResult.display_name : (randomDisplayName || '点击下方按钮开始') }}
              </div>
              <div v-if="randoming" class="rm-spinner"></div>
            </div>

            <div class="rm-controls">
              <button
                class="rm-start-btn"
                :class="{ randoming }"
                :disabled="randoming"
                @click="startRandomPick"
              >
                <Shuffle :size="20" />
                {{ randoming ? '抽选中...' : '开始抽选' }}
              </button>
            </div>

            <Transition name="result-fade">
              <div v-if="randomResult && !randoming" class="rm-result">
                <div class="rm-result-label">为 <strong>{{ randomResult.display_name }}</strong> 快速操作：</div>
                <div class="rm-result-btns">
                  <button class="rm-qb add" @click="quickForRandom('add', 2)">+2</button>
                  <button class="rm-qb add" @click="quickForRandom('add', 3)">+3</button>
                  <button class="rm-qb deduct" @click="quickForRandom('deduct', 1)">-1</button>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* ─── Floating Point Animation (KEEP) ─── */
.float-point {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 44px;
  font-weight: 800;
  pointer-events: none;
  animation: floatUp 1.2s var(--ease-out-quint) forwards;
  z-index: 5;
}
.float-point.add { color: #22c55e; }
.float-point.deduct { color: #ef4444; }
@keyframes floatUp {
  0% { opacity: 1; transform: translate(-50%, -30%) scale(0.4); }
  40% { opacity: 1; transform: translate(-50%, -80%) scale(1.15); }
  100% { opacity: 0; transform: translate(-50%, -140%) scale(0.9); }
}

/* ─── Modal Mask (KEEP — used by random modal) ─── */
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
  backdrop-filter: blur(4px);
}
@keyframes modalIn {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

/* ─── Random Modal (KEEP) ─── */
.random-modal {
  width: 400px;
  max-height: 90vh;
  overflow-y: auto;
  background: var(--surface-1);
  border: 1px solid var(--hairline-strong);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  animation: modalIn 200ms var(--ease-out);
}
.rm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-lg);
  padding-bottom: var(--space-lg);
  border-bottom: 1px solid var(--hairline);
}
.rm-title {
  font-family: 'Inter Tight', sans-serif;
  font-weight: 700;
  font-size: 18px;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
.rm-close {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 150ms var(--ease-out);
}
.rm-close:hover { background: var(--surface-2); color: var(--text-primary); }
.rm-body { display: flex; flex-direction: column; gap: var(--space-lg); }
.rm-display {
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  position: relative;
  overflow: hidden;
  transition: all 200ms var(--ease-out);
}
.rm-display.randoming { animation: rmPulse 0.3s ease-in-out infinite alternate; }
.rm-display.hasResult { border-color: var(--accent); background: rgba(94, 106, 210, 0.06); }
@keyframes rmPulse {
  from { box-shadow: inset 0 0 0 0 rgba(167, 139, 250, 0); }
  to { box-shadow: inset 0 0 30px 0 rgba(167, 139, 250, 0.15); }
}
.rm-display-name {
  font-size: 32px;
  font-weight: 800;
  color: var(--text-primary);
  transition: all 80ms var(--ease-out);
  text-align: center;
  padding: 0 var(--space-md);
}
.randoming .rm-display-name { color: var(--accent-text); }
.rm-spinner {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  background-size: 200% 100%;
  animation: rmSlide 0.4s linear infinite;
}
@keyframes rmSlide {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.rm-controls { display: flex; justify-content: center; }
.rm-start-btn {
  padding: 10px 32px;
  border-radius: 100px;
  border: 1px solid var(--hairline-strong);
  background: var(--surface-2);
  color: var(--accent-text);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms var(--ease-out);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
.rm-start-btn:hover { border-color: var(--accent); background: rgba(167, 139, 250, 0.08); }
.rm-start-btn.randoming { opacity: 0.5; cursor: not-allowed; }
.rm-result { text-align: center; animation: resultIn 400ms var(--ease-out); }
@keyframes resultIn {
  from { opacity: 0; transform: translateY(10px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.rm-result-label {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: var(--space-md);
}
.rm-result-label strong { color: var(--accent-text); }
.rm-result-btns { display: flex; gap: var(--space-sm); justify-content: center; }
.rm-qb {
  width: 52px;
  height: 36px;
  border-radius: var(--radius-sm);
  border: none;
  cursor: pointer;
  font-size: 15px;
  font-weight: 700;
  transition: all 100ms var(--ease-out);
}
.rm-qb.add { background: rgba(34, 197, 94, 0.12); color: #22c55e; }
.rm-qb.add:hover { background: rgba(34, 197, 94, 0.25); }
.rm-qb.deduct { background: rgba(239, 68, 68, 0.12); color: #ef4444; }
.rm-qb.deduct:hover { background: rgba(239, 68, 68, 0.25); }
.result-fade-enter-active,
.result-fade-leave-active { transition: all 400ms var(--ease-out); }
.result-fade-enter-from,
.result-fade-leave-to { opacity: 0; transform: translateY(10px) scale(0.95); }

@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
  .page-header .n-button { width: 100%; }
}
</style>
