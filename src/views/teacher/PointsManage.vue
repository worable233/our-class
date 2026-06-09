<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { Student, PointSummary } from '@/types'
import { useMessage } from 'naive-ui'
import {
  NButton, NCard, NModal, NTag, NEmpty, NText, NAvatar, NGrid, NGi, NSpin, NIcon,
} from 'naive-ui'
import { useRefresh } from '@/composables/useRefresh'
import { Shuffle, Star, ArrowLeft, School, Users } from '@lucide/vue'

interface ReviewType {
  id: number; name: string; emoji: string
  type: 'add' | 'deduct'; amount: number; is_active: number
}

interface ClassInfo {
  id: number
  name: string
  student_count: number
}

const message = useMessage()
const auth = useAuthStore()
const allClasses = ref<ClassInfo[]>([])
const selectedClass = ref<ClassInfo | null>(null)

// 有 classes.view_all 权限看到全部，否则只看自己管理的班级
const classList = computed(() => {
  if (auth.permissions.includes('classes.view_all')) return allClasses.value
  const myClasses = (auth.user?.class || '').split(',').filter(Boolean).map(c => c.trim())
  if (myClasses.length === 0) return allClasses.value
  return allClasses.value.filter(c => myClasses.includes(c.name))
})
const students = ref<Student[]>([])
const pointSummary = ref<PointSummary[]>([])
const reviewTypes = ref<ReviewType[]>([])
const loading = ref(false)

// Quick action state
const quickAction = ref<{ student: Student; show: boolean } | null>(null)
const selectedReview = ref<ReviewType | null>(null)
const celebration = ref<{ emoji: string; name: string; text: string; type: string; show: boolean } | null>(null)

// 预生成随机光点位置和浮动参数
const dotPositions = Array.from({ length: 24 }, () => ({
  left: Math.random() * 100,
  top: Math.random() * 100,
  size: 3 + Math.random() * 7,
  delay: Math.random() * 2.5,
  dur: 4 + Math.random() * 3,
  offsetX: (Math.random() - 0.5) * 120,
  offsetY: 60 + Math.random() * 80,
  curveX: (Math.random() - 0.5) * 60,
}))

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
  allClasses.value = await api.get<ClassInfo[]>('/classes').catch(() => [])
}

async function loadStudents() {
  if (!selectedClass.value) return
  const url = `/students?class=${encodeURIComponent(selectedClass.value.name)}`
  students.value = await api.get<Student[]>(url)
}

async function loadPoints() {
  if (!selectedClass.value) return
  const url = `/points/summary?class=${encodeURIComponent(selectedClass.value.name)}`
  pointSummary.value = await api.get<PointSummary[]>(url)
}

async function loadReviewTypes() {
  try { reviewTypes.value = (await api.get<ReviewType[]>('/review-types')) || [] } catch {}
}

async function loadAll() {
  loading.value = true
  await Promise.all([loadStudents(), loadPoints(), loadReviewTypes()])
  loading.value = false
}

function enterClass(cls: ClassInfo) {
  selectedClass.value = cls
  loadAll()
}

function backToClasses() {
  selectedClass.value = null
  students.value = []
  pointSummary.value = []
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

    const name = quickAction.value.student.display_name
    const sign = r.type === 'add' ? '+' : '-'
    message.success(`${name} ${sign}${r.amount} ${r.reason || r.name}`)

    // 全屏庆祝动画（3s，渐显渐隐）
    celebration.value = {
      emoji: r.emoji,
      name,
      text: `${sign}${r.amount}`,
      type: r.type,
      show: true,
    }
    setTimeout(() => { if (celebration.value) celebration.value.show = false }, 3200)
    setTimeout(() => { celebration.value = null }, 3800)

    quickAction.value = null
    selectedReview.value = null
    await loadPoints()
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

function quickForRandom(rt: ReviewType) {
  if (!randomResult.value) return
  randomStop = true; randoming.value = false
  randomModalVisible.value = false
  api.post('/points', {
    student_id: randomResult.value.id,
    reason: rt.name,
    type: rt.type,
    amount: rt.amount,
    review_type_id: rt.id,
  }).then(() => {
    loadPoints()
    const sign = rt.type === 'add' ? '+' : '-'
    message.success(`${randomResult.value!.display_name} ${sign}${rt.amount} ${rt.name}`)
    // 全屏庆祝
    celebration.value = {
      emoji: rt.emoji,
      name: randomResult.value!.display_name,
      text: `${sign}${rt.amount}`,
      type: rt.type,
      show: true,
    }
    setTimeout(() => { if (celebration.value) celebration.value.show = false }, 3200)
    setTimeout(() => { celebration.value = null }, 3800)
  }).catch((e: any) => message.error(e.message || '操作失败'))
}

function openScoreCard(student: Student) {
  openQuick(student)
}

async function refreshAll() { await loadClasses() }
useRefresh(refreshAll)
onMounted(loadClasses)
</script>

<template>
  <div>
    <!-- ════ 班级内部视图 ════ -->
    <template v-if="selectedClass">
      <!-- 路径导航 -->
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
        <NButton quaternary size="tiny" @click="backToClasses" style="padding:0;font-size:13px;color:var(--text-muted);height:auto;min-height:0" :bordered="false">
          积分管理
        </NButton>
        <span style="color:var(--text-muted);font-size:12px">/</span>
        <span style="font-size:13px;font-weight:600;color:var(--text-primary)">{{ selectedClass.name }}</span>
        <NTag size="tiny" type="info" round :bordered="false" style="margin-left:2px">{{ selectedClass.student_count }} 人</NTag>
        <div style="flex:1" />
        <NButton @click="openRandomModal" round size="small">
          <template #icon><Shuffle :size="16" /></template>
          抽号
        </NButton>
      </div>
    </template>

    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
      <div>
        <NText tag="h2" style="margin:0 0 4px;font-size:24px;font-weight:700;">积分管理</NText>
        <NText depth="3" style="display:block;margin:0;font-size:14px;">选择班级后管理学生积分，支持加减分与随机抽取</NText>
      </div>
    </div>

    <!-- ════ 班级选择视图 ════ -->
    <template v-if="!selectedClass">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
        <School :size="20" style="color:var(--accent-text)" />
        <NText style="font-size:17px;font-weight:700;color:var(--text-primary)">选择班级</NText>
        <NText depth="3" style="font-size:13px">共 {{ classList.length }} 个班级</NText>
      </div>

      <n-grid :cols="4" :x-gap="16" :y-gap="16">
        <n-gi v-for="cls in classList" :key="cls.id">
          <NCard
            hoverable
            size="small"
            :bordered="true"
            class="class-card"
            @click="enterClass(cls)"
          >
            <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:12px 0">
              <div class="class-card-icon">
                <School :size="28" />
              </div>
              <NText style="font-size:16px;font-weight:700;color:var(--text-primary);text-align:center">{{ cls.name }}</NText>
              <NTag size="small" type="info" round :bordered="false">
                <template #icon><Users :size="12" /></template>
                {{ cls.student_count }} 人
              </NTag>
            </div>
          </NCard>
        </n-gi>
        <n-gi v-if="classList.length === 0">
          <NEmpty description="暂无班级数据，请先创建班级" />
        </n-gi>
      </n-grid>
    </template>

    <!-- ════ 班级内部视图：内容 ════ -->
    <template v-if="selectedClass">

      <NSpin :show="loading" style="min-height:300px">
        <template v-if="students.length > 0">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px;margin-bottom:32px">
            <NCard v-for="s in students" :key="s.id" size="small" hoverable
              style="position:relative;overflow:hidden;cursor:pointer"
              @click="openScoreCard(s)"
            >
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
          </div>
        </template>
        <div v-else style="display:flex;justify-content:center;padding:60px 0">
          <NEmpty description="该班级暂无学生" />
        </div>
      </NSpin>
    </template>

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

      <div style="display:flex;flex-direction:column;gap:20px">
        <div v-if="addTypes.length > 0">
          <NText :style="{fontSize:'14px',fontWeight:700,color:'#18a058',display:'block',marginBottom:'16px'}">
            <span style="margin-right:6px">🎉</span>表扬
          </NText>
          <n-grid :cols="4" :x-gap="24" :y-gap="20">
            <n-gi v-for="t in addTypes" :key="t.id">
              <div class="review-option" :class="{ selected: selectedReview?.id === t.id }" @click="selectedReview = t; confirmQuick()">
                <div class="review-option-circle add">
                  <span class="review-option-emoji">{{ t.emoji }}</span>
                  <n-tag size="tiny" round :bordered="false" class="review-option-badge" style="position:absolute;top:-5px;right:-5px;background:#18a058;color:#fff;font-weight:800;font-size:10px;padding:0 4px;line-height:20px;min-width:24px;justify-content:center">+{{ t.amount }}</n-tag>
                </div>
                <span class="review-option-name">{{ t.name }}</span>
              </div>
            </n-gi>
          </n-grid>
        </div>

        <div v-if="deductTypes.length > 0">
          <NText :style="{fontSize:'14px',fontWeight:700,color:'#d03050',display:'block',marginBottom:'16px'}">
            <span style="margin-right:6px">🔧</span>待改进
          </NText>
          <n-grid :cols="4" :x-gap="24" :y-gap="20">
            <n-gi v-for="t in deductTypes" :key="t.id">
              <div class="review-option" :class="{ selected: selectedReview?.id === t.id }" @click="selectedReview = t; confirmQuick()">
                <div class="review-option-circle deduct">
                  <span class="review-option-emoji">{{ t.emoji }}</span>
                  <n-tag size="tiny" round :bordered="false" class="review-option-badge" style="position:absolute;top:-5px;right:-5px;background:#d03050;color:#fff;font-weight:800;font-size:10px;padding:0 4px;line-height:20px;min-width:24px;justify-content:center">-{{ t.amount }}</n-tag>
                </div>
                <span class="review-option-name">{{ t.name }}</span>
              </div>
            </n-gi>
          </n-grid>
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
          <div v-if="randomResult && !randoming" style="padding-top:16px">
            <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:14px">为 <span style="color:var(--accent-text)">{{ randomResult.display_name }}</span> 选择点评：</div>
            <div v-if="addTypes.length > 0" style="display:flex;flex-wrap:wrap;gap:20px;margin-bottom:16px;justify-content:center">
              <div
                v-for="t in addTypes" :key="t.id"
                class="review-option" style="gap:6px"
                @click="quickForRandom(t)"
              >
                <div class="review-option-circle add" style="width:56px;height:56px">
                  <span class="review-option-emoji" style="font-size:22px">{{ t.emoji }}</span>
                  <n-tag size="tiny" round :bordered="false" class="review-option-badge" style="position:absolute;top:-4px;right:-4px;background:#18a058;color:#fff;font-weight:800;font-size:9px;padding:0 3px;line-height:18px;min-width:20px;justify-content:center">+{{ t.amount }}</n-tag>
                </div>
                <span class="review-option-name" style="font-size:12px;max-width:64px">{{ t.name }}</span>
              </div>
            </div>
            <div v-if="deductTypes.length > 0" style="display:flex;flex-wrap:wrap;gap:20px;justify-content:center">
              <div
                v-for="t in deductTypes" :key="t.id"
                class="review-option" style="gap:6px"
                @click="quickForRandom(t)"
              >
                <div class="review-option-circle deduct" style="width:56px;height:56px">
                  <span class="review-option-emoji" style="font-size:22px">{{ t.emoji }}</span>
                  <n-tag size="tiny" round :bordered="false" class="review-option-badge" style="position:absolute;top:-4px;right:-4px;background:#d03050;color:#fff;font-weight:800;font-size:9px;padding:0 3px;line-height:18px;min-width:20px;justify-content:center">-{{ t.amount }}</n-tag>
                </div>
                <span class="review-option-name" style="font-size:12px;max-width:64px">{{ t.name }}</span>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </n-modal>

    <!-- Celebration overlay -->
    <Transition name="celebration-fade">
      <div v-if="celebration?.show" class="celebration-overlay" :class="celebration.type">
        <div class="celebration-bg-dots">
          <span v-for="(d, i) in dotPositions" :key="i" class="celebration-dot" :style="{ left: d.left + '%', top: d.top + '%', width: d.size + 'px', height: d.size + 'px', animationDelay: d.delay + 's', animationDuration: d.dur + 's', '--ox': d.offsetX + 'px', '--oy': d.offsetY + 'px', '--cx': d.curveX + 'px' }" />
        </div>
        <div class="celebration-content">
          <div class="celebration-emoji">{{ celebration.emoji }}</div>
          <div class="celebration-text">
            <span class="celebration-name">{{ celebration.name }}</span>
            <span class="celebration-score">{{ celebration.text }}</span>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.class-card {
  cursor: pointer;
  transition: transform 0.2s var(--ease-out), border-color 0.2s var(--ease-out);
}
.class-card:hover {
  transform: translateY(-4px);
  border-color: var(--accent) !important;
}
.class-card-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--accent-glow);
  color: var(--accent-text);
  display: flex;
  align-items: center;
  justify-content: center;
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

.review-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: transform 0.2s var(--ease-out);
}
.review-option:hover {
  transform: translateY(-4px);
}
.review-option.selected .review-option-circle {
  box-shadow: 0 0 0 3px var(--accent), 0 4px 16px rgba(94,106,210,0.25);
}

.review-option-circle {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: box-shadow 0.2s var(--ease-out);
}
.review-option:hover .review-option-circle {
  box-shadow: 0 6px 20px rgba(0,0,0,0.12);
}
.review-option-circle.add {
  background: linear-gradient(135deg, rgba(24,160,88,0.15), rgba(24,160,88,0.06));
  border: 2px solid rgba(24,160,88,0.25);
}
.review-option-circle.deduct {
  background: linear-gradient(135deg, rgba(208,48,80,0.15), rgba(208,48,80,0.06));
  border: 2px solid rgba(208,48,80,0.25);
}

.review-option-emoji {
  font-size: 28px;
  line-height: 1;
}

.review-option-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
  max-width: 80px;
  line-height: 1.3;
}

@media (max-width:768px) {
  .page-header { flex-direction:column; align-items:flex-start; gap:12px; }
  .page-header .n-button { width:100%; }
}

/* ── 全屏庆祝动画 ── */
.celebration-fade-enter-active { transition: opacity 0.35s ease-out; }
.celebration-fade-leave-active { transition: opacity 0.5s ease-in; }
.celebration-fade-enter-from,
.celebration-fade-leave-to { opacity: 0; }

.celebration-overlay {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(4px);
}
.celebration-overlay.add { --glow: rgba(34,197,94,0.6); }
.celebration-overlay.deduct { --glow: rgba(239,68,68,0.6); }

.celebration-bg-dots {
  position: absolute; inset: 0; overflow: hidden;
  pointer-events: none;
}

.celebration-dot {
  position: absolute;
  border-radius: 50%;
  background: var(--glow);
  box-shadow: 0 0 8px 2px var(--glow), 0 0 20px 4px var(--glow);
  animation: dotFloatUp ease-in-out infinite;
  opacity: 0.4;
  pointer-events: none;
  will-change: transform;
}
.celebration-overlay.deduct .celebration-dot {
  animation-name: dotFloatDown;
}

/* 加分：轻盈上升，带曲线飘移 */
@keyframes dotFloatUp {
  0%   { transform: translate(0, 0) scale(0.7); }
  30%  { transform: translate(calc(var(--cx) * 0.5), calc(var(--oy) * -0.3)) scale(1); }
  50%  { transform: translate(var(--cx), calc(var(--oy) * -0.55)) scale(1.15); }
  70%  { transform: translate(calc(var(--cx) * 0.3), calc(var(--oy) * -0.8)) scale(0.95); }
  100% { transform: translate(var(--ox), calc(var(--oy) * -1)) scale(0.5); }
}

/* 减分：缓缓下降，带曲线飘移 */
@keyframes dotFloatDown {
  0%   { transform: translate(0, 0) scale(0.7); }
  30%  { transform: translate(calc(var(--cx) * 0.5), calc(var(--oy) * 0.3)) scale(1); }
  50%  { transform: translate(var(--cx), calc(var(--oy) * 0.55)) scale(1.15); }
  70%  { transform: translate(calc(var(--cx) * 0.3), calc(var(--oy) * 0.8)) scale(0.95); }
  100% { transform: translate(var(--ox), calc(var(--oy) * 1)) scale(0.5); }
}

@keyframes dotFloat {
  0%, 100% {
    transform: translate(0, 0) scale(1);
    opacity: 0.6;
  }
  25% {
    transform: translate(40px, -30px) scale(1.3);
    opacity: 0.9;
  }
  50% {
    transform: translate(-20px, -60px) scale(0.8);
    opacity: 0.4;
  }
  75% {
    transform: translate(30px, -20px) scale(1.1);
    opacity: 0.8;
  }
}

.celebration-content {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  position: relative; z-index: 1;
}

.celebration-emoji {
  font-size: 72px;
  line-height: 1;
  filter: drop-shadow(0 0 20px var(--glow));
  animation: celebBounce 0.6s ease-out;
}

@keyframes celebBounce {
  0% { transform: scale(0.3); opacity: 0; }
  50% { transform: scale(1.15); }
  70% { transform: scale(0.95); }
  100% { transform: scale(1); opacity: 1; }
}

.celebration-text {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
}

.celebration-name {
  font-size: 18px; font-weight: 600; color: rgba(255,255,255,0.85);
}

.celebration-score {
  font-size: 40px; font-weight: 800;
  color: #22c55e;
  text-shadow: 0 0 20px rgba(34,197,94,0.5);
}
.celebration-overlay.deduct .celebration-score {
  color: #ef4444;
  text-shadow: 0 0 20px rgba(239,68,68,0.5);
}
</style>
