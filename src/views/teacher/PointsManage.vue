<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { Student, PointRecord, PointSummary } from '@/types'
import { useMessage } from 'naive-ui'
import {
  NButton, NCard, NModal, NTag, NEmpty, NText, NAvatar, NButtonGroup,
} from 'naive-ui'
import { useRefresh } from '@/composables/useRefresh'
import { Shuffle, Star } from '@lucide/vue'

interface ReviewType {
  id: number; name: string; emoji: string
  type: 'add' | 'deduct'; amount: number; is_active: number
}

const message = useMessage()
const auth = useAuthStore()
const classes = ref<string[]>([])
const currentClass = ref('')
const students = ref<Student[]>([])
const pointSummary = ref<PointSummary[]>([])
const records = ref<PointRecord[]>([])
const reviewTypes = ref<ReviewType[]>([])
const loading = ref(true)

// Quick action state
const quickAction = ref<{ student: Student; show: boolean } | null>(null)
const selectedReview = ref<ReviewType | null>(null)
const floatingAnim = ref<{ id: number; text: string; type: string } | null>(null)

const addTypes = computed(() => reviewTypes.value.filter(t => t.type === 'add'))
const deductTypes = computed(() => reviewTypes.value.filter(t => t.type === 'deduct'))

function getPoints(studentId: number): number {
  return pointSummary.value.find(p => p.id === studentId)?.total_points || 0
}

function getRank(studentId: number): number {
  const sorted = [...pointSummary.value].sort((a, b) => b.total_points - a.total_points)
  return sorted.findIndex(p => p.id === studentId) + 1
}

async function loadClasses() {
  classes.value = (await api.get<string[]>('/classes')) || []
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

async function loadReviewTypes() {
  try { reviewTypes.value = (await api.get<ReviewType[]>('/review-types')) || [] } catch {}
}

async function loadAll() {
  loading.value = true
  await Promise.all([loadStudents(), loadPoints(), loadRecords(), loadReviewTypes()])
  loading.value = false
}

async function switchClass(cls: string) {
  currentClass.value = cls
  await loadAll()
}

// Open quick action modal with review types
function openQuick(student: Student) {
  selectedReview.value = null
  quickAction.value = { student, show: true }
}

// Execute the point action with selected review type
async function confirmQuick() {
  if (!quickAction.value || !selectedReview.value) return
  const r = selectedReview.value

  try {
    await api.post('/points', {
      student_id: quickAction.value.student.id,
      reason: r.name,
      type: r.type,
      amount: r.amount,
      review_type_id: r.id,
    })

    const sign = r.type === 'add' ? '+' : '-'
    floatingAnim.value = {
      id: quickAction.value.student.id,
      text: `${sign}${r.amount}`,
      type: r.type,
    }
    setTimeout(() => { floatingAnim.value = null }, 1200)

    quickAction.value = null
    selectedReview.value = null
    await loadPoints()
    await loadRecords()
  } catch (e: any) {
    message.error(e.message || '操作失败')
    quickAction.value = null
    selectedReview.value = null
  }
}

// Random student picker
const randomModalVisible = ref(false)
const randomResult = ref<Student | null>(null)
const randoming = ref(false)
const randomDisplayName = ref('')
let randomStop = false

function openRandomModal() {
  randomStop = true; randoming.value = false
  randomResult.value = null; randomDisplayName.value = ''
  randomModalVisible.value = true
}

function closeRandomModal() {
  randomStop = true; randoming.value = false
  randomModalVisible.value = false
}

function startRandomPick() {
  if (students.value.length === 0) return
  randoming.value = true; randomResult.value = null
  randomDisplayName.value = ''; randomStop = false
  let count = 0, delay = 50
  function tick() {
    if (randomStop) return
    const idx = Math.floor(Math.random() * students.value.length)
    const s = students.value[idx]
    if (s) randomDisplayName.value = s.display_name
    count++
    if (count >= 25) {
      randoming.value = false
      const finalIdx = Math.floor(Math.random() * students.value.length)
      const finalS = students.value[finalIdx]
      if (finalS) randomResult.value = finalS
      return
    }
    if (count > 12) delay += 25
    setTimeout(tick, delay)
  }
  tick()
}

function quickForRandom(type: 'add' | 'deduct', amount: number) {
  if (!randomResult.value) return
  randomStop = true; randoming.value = false
  randomModalVisible.value = false
  // Find matching review type, fall back to first of same type
  let rt = reviewTypes.value.find(t => t.type === type && t.amount === amount)
  if (!rt) rt = reviewTypes.value.find(t => t.type === type)
  if (rt) {
    selectedReview.value = rt
    quickAction.value = { student: randomResult.value, show: true }
  } else {
    message.warning('暂无可用点评类型，请先在点评类型页面创建')
  }
}

function openScoreCard(student: Student) {
  openQuick(student)
}

async function refreshAll() { await loadClasses(); await loadAll() }
useRefresh(refreshAll)
onMounted(refreshAll)
</script>

<template>
  <div>
    <!-- Top Bar -->
    <NCard size="small" :bordered="true" style="margin-bottom:24px;padding:4px 0">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <NText depth="3" style="font-size:13px;font-weight:500;margin-right:4px">班级</NText>
          <NButton v-for="cls in classes" :key="cls" size="small" :type="cls === currentClass ? 'primary' : 'default'" @click="switchClass(cls)">{{ cls }}</NButton>
        </div>
        <NButton @click="openRandomModal"><Shuffle :size="16" /> 抽号</NButton>
      </div>
    </NCard>

    <!-- Student Grid -->
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
      <NText strong style="font-size:15px;letter-spacing:-0.01em">学生花名册</NText>
      <NText depth="3" style="font-size:12px">{{ students.length }} 人</NText>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px;margin-bottom:32px">
      <NCard v-for="s in students" :key="s.id" size="small" hoverable
        style="position:relative;overflow:hidden;cursor:pointer"
        @click="openScoreCard(s)"
        :class="{ 'has-anim': floatingAnim?.id === s.id }"
      >
        <div v-if="floatingAnim?.id === s.id" class="float-point" :class="floatingAnim.type">{{ floatingAnim.text }}</div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
          <NAvatar
            :style="{ background: `hsl(${(s.id * 47) % 360}, 60%, 50%)` }"
            :size="46"
            round
          >{{ s.display_name.charAt(0) }}</NAvatar>
          <NText style="font-size:14px;font-weight:600;text-align:center;line-height:1.3">{{ s.display_name }}</NText>
          <NText style="font-size:20px;font-weight:700;color:var(--accent-text);letter-spacing:-0.02em;display:flex;align-items:center;gap:4px">
            <Star :size="16" /> {{ getPoints(s.id) }}
          </NText>
        </div>
      </NCard>
      <NEmpty v-if="students.length === 0" description="该班级暂无学生" />
    </div>

    <!-- Recent Activity -->
    <n-card size="small" style="margin-bottom:24px">
      <template #header><n-text strong style="font-size:15px">最近动态</n-text></template>
      <div v-for="r in records.slice(0, 15)" :key="r.id"
        style="display:flex;align-items:center;gap:12px;padding:8px;font-size:13px"
      >
        <n-tag :type="r.type === 'add' ? 'success' : 'error'" size="small" :bordered="false">{{ r.type === 'add' ? '+' : '−' }}</n-tag>
        <div style="flex:1;display:flex;gap:8px;align-items:center;min-width:0">
          <n-text style="font-weight:500;white-space:nowrap">{{ r.student_name }}</n-text>
          <n-text depth="3" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ r.reason }}</n-text>
        </div>
        <n-text :type="r.type === 'add' ? 'success' : 'error'" style="font-weight:700;font-size:14px;min-width:28px;text-align:right">{{ r.type === 'add' ? '+' : '' }}{{ r.amount }}</n-text>
        <n-text depth="3" style="font-size:12px;min-width:80px;text-align:right;flex-shrink:0">{{ r.date }}</n-text>
      </div>
      <n-empty v-if="records.length === 0" description="暂无记录" />
    </n-card>

    <!-- Review Type Selection Modal -->
    <n-modal
      :show="quickAction !== null"
      @update:show="(val: boolean) => { if (!val) { quickAction = null; selectedReview = null } }"
      preset="card"
      style="width:460px"
      :mask-closable="true"
      header-style="font-size:17px;font-weight:600"
      content-style="padding:16px 24px 20px"
    >
      <template #header>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;flex-shrink:0"
            :style="{ background: `hsl(${((quickAction?.student?.id || 0) * 47) % 360}, 60%, 50%)` }"
          >{{ quickAction?.student?.display_name?.charAt(0) || '' }}</div>
          <div>
            <div style="font-size:15px;font-weight:600;color:var(--text-primary)">{{ quickAction?.student?.display_name }}</div>
            <div style="font-size:12px;color:var(--text-muted)">选择点评类型</div>
          </div>
        </div>
      </template>

      <div style="display:flex;flex-direction:column;gap:16px">
        <!-- Add Types -->
        <div v-if="addTypes.length > 0">
          <NText :style="{fontSize:'12px',fontWeight:600,color:'#18a058',display:'block',marginBottom:'8px'}">正向加分</NText>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <NButton v-for="t in addTypes" :key="t.id"
              :type="selectedReview?.id === t.id ? 'success' : 'default'"
              :secondary="selectedReview?.id === t.id"
              quaternary
              block
              style="padding:10px 12px;height:auto"
              @click="selectedReview = t; confirmQuick()"
            >
              <span style="font-size:20px;line-height:1;margin-right:8px">{{ t.emoji }}</span>
              <span style="flex:1;font-size:13px;font-weight:500;text-align:left">{{ t.name }}</span>
              <span style="font-size:13px;font-weight:700;color:#18a058">+{{ t.amount }}</span>
            </NButton>
          </div>
        </div>

        <!-- Deduct Types -->
        <div v-if="deductTypes.length > 0">
          <NText :style="{fontSize:'12px',fontWeight:600,color:'#d03050',display:'block',marginBottom:'8px'}">负向约束</NText>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <NButton v-for="t in deductTypes" :key="t.id"
              :type="selectedReview?.id === t.id ? 'error' : 'default'"
              :secondary="selectedReview?.id === t.id"
              quaternary
              block
              style="padding:10px 12px;height:auto"
              @click="selectedReview = t; confirmQuick()"
            >
              <span style="font-size:20px;line-height:1;margin-right:8px">{{ t.emoji }}</span>
              <span style="flex:1;font-size:13px;font-weight:500;text-align:left">{{ t.name }}</span>
              <span style="font-size:13px;font-weight:700;color:#d03050">-{{ t.amount }}</span>
            </NButton>
          </div>
        </div>

        <n-empty v-if="addTypes.length === 0 && deductTypes.length === 0" description="暂无点评类型，请先在点评类型页面创建" />
      </div>
    </n-modal>

    <!-- Random Pick Modal -->
    <n-modal
      :show="randomModalVisible"
      @update:show="closeRandomModal"
      preset="card"
      style="width: 420px"
      title="随机抽号"
      :mask-closable="true"
      :segmented="{ content: true }"
      header-style="font-size:17px;font-weight:600"
      content-style="padding: 20px 24px"
    >
      <template #header>
        <div style="display:flex;align-items:center;gap:8px">
          <Shuffle :size="16" />
          <span>随机抽号</span>
        </div>
      </template>

      <div class="rm-body">
        <div class="rm-display" :class="{ randoming, hasResult: !!randomResult }">
          <div class="rm-display-name">{{ randomResult ? randomResult.display_name : (randomDisplayName || '点击下方按钮开始') }}</div>
          <div v-if="randoming" class="rm-spinner"></div>
        </div>
        <div class="rm-controls">
          <n-button
            :disabled="randoming"
            :type="randoming ? 'default' : 'primary'"
            size="large"
            round
            @click="startRandomPick"
          >
            <template #icon><Shuffle :size="18" /></template>
            {{ randoming ? '抽选中...' : '开始抽选' }}
          </n-button>
        </div>
        <Transition name="result-fade">
          <div v-if="randomResult && !randoming" class="rm-result">
            <div class="rm-result-label">为 <strong>{{ randomResult.display_name }}</strong> 快速操作：</div>
            <div class="rm-result-btns">
              <n-button size="small" type="success" @click="quickForRandom('add', 2)">+2</n-button>
              <n-button size="small" type="success" @click="quickForRandom('add', 3)">+3</n-button>
              <n-button size="small" type="error" @click="quickForRandom('deduct', 1)">-1</n-button>
            </div>
          </div>
        </Transition>
      </div>
    </n-modal>
  </div>
</template>

<style scoped>
.float-point {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  font-size: 44px; font-weight: 800; pointer-events: none;
  animation: floatUp 1.2s var(--ease-out-quint) forwards; z-index: 5;
}
.float-point.add { color: #22c55e; }
.float-point.deduct { color: #ef4444; }
@keyframes floatUp {
  0% { opacity: 1; transform: translate(-50%, -30%) scale(0.4); }
  40% { opacity: 1; transform: translate(-50%, -80%) scale(1.15); }
  100% { opacity: 0; transform: translate(-50%, -140%) scale(0.9); }
}

.rm-body { display:flex; flex-direction:column; gap:20px; }
.rm-display { height:120px; display:flex; align-items:center; justify-content:center; background:var(--surface-2); border:1px solid var(--hairline); border-radius:var(--radius-md); position:relative; overflow:hidden; transition:all 200ms var(--ease-out); }
.rm-display.randoming { animation:rmPulse 0.3s ease-in-out infinite alternate; }
.rm-display.hasResult { border-color:var(--accent); background:rgba(94,106,210,0.06); }
@keyframes rmPulse { from { box-shadow:inset 0 0 0 0 rgba(167,139,250,0); } to { box-shadow:inset 0 0 30px 0 rgba(167,139,250,0.15); } }
.rm-display-name { font-size:32px; font-weight:800; color:var(--text-primary); transition:all 80ms var(--ease-out); text-align:center; padding:0 16px; }
.randoming .rm-display-name { color:var(--accent-text); }
.rm-spinner { position:absolute; bottom:0; left:0; right:0; height:3px; background:linear-gradient(90deg, transparent, var(--accent), transparent); background-size:200% 100%; animation:rmSlide 0.4s linear infinite; }
@keyframes rmSlide { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }
.rm-controls { display:flex; justify-content:center; }
.rm-result { text-align:center; animation:resultIn 400ms var(--ease-out); }
@keyframes resultIn { from { opacity:0; transform:translateY(10px) scale(0.95); } to { opacity:1; transform:translateY(0) scale(1); } }
.rm-result-label { font-size:14px; color:var(--text-secondary); margin-bottom:8px; }
.rm-result-label strong { color:var(--accent-text); }
.rm-result-btns { display:flex; gap:8px; justify-content:center; }
.result-fade-enter-active, .result-fade-leave-active { transition:all 400ms var(--ease-out); }
.result-fade-enter-from, .result-fade-leave-to { opacity:0; transform:translateY(10px) scale(0.95); }

@media (max-width:768px) {
  .page-header { flex-direction:column; align-items:flex-start; gap:12px; }
  .page-header .n-button { width:100%; }
}
</style>
