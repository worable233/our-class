<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import LoginModal from '@/components/LoginModal.vue'
import { Plus, ArrowRight, Star, BarChart3, FileText, MessageSquare } from '@lucide/vue'

const router = useRouter()
const auth = useAuthStore()
auth.loadFromStorage()

const input = ref('')
const showLogin = ref(false)

function handleSubmit() {
  if (!input.value.trim()) return
  if (auth.isLoggedIn && auth.isTeacher) {
    router.push('/chat')
  } else {
    showLogin.value = true
  }
}
</script>

<template>
  <div class="h-screen w-full flex flex-col bg-white">
    <!-- Floating header -->
    <div class="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 h-[34px] px-1.5 rounded-full bg-white border border-gray-200/80 shadow-sm">
      <div class="flex items-center gap-1.5">
        <button class="flex items-center justify-center h-7 w-7 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M9.67272 0.522841C10.8339 0.522841 11.76 0.522714 12.4963 0.602493C13.2453 0.683657 13.8789 0.854248 14.4264 1.25197C14.7504 1.48739 15.0355 1.77247 15.2709 2.0965C15.6686 2.64394 15.8392 3.27758 15.9204 4.02655C16.0002 4.7629 16 5.68895 16 6.85014V9.14986C16 10.3111 16.0002 11.2371 15.9204 11.9735C15.8392 12.7224 15.6686 13.3561 15.2709 13.9035C15.0355 14.2275 14.7504 14.5126 14.4264 14.748C13.8789 15.1458 13.2453 15.3163 12.4963 15.3975C11.76 15.4773 10.8339 15.4772 9.67272 15.4772H6.3273C5.16611 15.4772 4.24006 15.4773 3.50371 15.3975C2.75474 15.3163 2.1211 15.1458 1.57366 14.748C1.24963 14.5126 0.964549 14.2275 0.729131 13.9035C0.331407 13.3561 0.160817 12.7224 0.0796529 11.9735C-0.000126137 11.2371 1.25338e-09 10.3111 1.25338e-09 9.14986V6.85014C1.25329e-09 5.68895 -0.000126137 4.7629 0.0796529 4.02655C0.160817 3.27758 0.331407 2.64394 0.729131 2.0965C0.964549 1.77247 1.24963 1.48739 1.57366 1.25197C2.1211 0.854248 2.75474 0.683657 3.50371 0.602493C4.24006 0.522714 5.16611 0.522841 6.3273 0.522841H9.67272ZM5.54303 1.88715V14.1118C5.78636 14.1128 6.04709 14.1169 6.3273 14.1169H9.67272C10.8639 14.1169 11.7032 14.1164 12.3493 14.0465C12.9824 13.9779 13.3497 13.8494 13.6268 13.6482C13.8354 13.4966 14.0195 13.3125 14.1711 13.1039C14.3723 12.8268 14.5007 12.4595 14.5693 11.8264C14.6393 11.1803 14.6398 10.341 14.6398 9.14986V6.85014C14.6398 5.65896 14.6393 4.81967 14.5693 4.1736C14.5007 3.54048 14.3723 3.17318 14.1711 2.89609C14.0195 2.68747 13.8354 2.50337 13.6268 2.35179C13.3497 2.1506 12.9824 2.02212 12.3493 1.95353C11.7032 1.88358 10.8639 1.88307 9.67272 1.88307H6.3273C6.04709 1.88307 5.78636 1.8862 5.54303 1.88715ZM4.1828 1.91166C3.99125 1.9216 3.8148 1.93577 3.65076 1.95353C3.01764 2.02212 2.65034 2.1506 2.37325 2.35179C2.16463 2.50337 1.98052 2.68747 1.82895 2.89609C1.62776 3.17318 1.49928 3.54048 1.43069 4.1736C1.36074 4.81967 1.36023 5.65896 1.36023 6.85014V9.14986C1.36023 10.341 1.36074 11.1803 1.43069 11.8264C1.49928 12.4595 1.62776 12.8268 1.82895 13.1039C1.98052 13.3125 2.16463 13.4966 2.37325 13.6482C2.65034 13.8494 3.01764 13.9779 3.65076 14.0465C3.81478 14.0642 3.99127 14.0774 4.1828 14.0873V1.91166Z" fill="currentColor"/>
          </svg>
        </button>
        <div class="w-px h-4 bg-gray-200" />
        <button class="flex items-center justify-center h-7 w-7 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M11.894845 6.647401C11.894845 3.725463 9.534486 1.356779 6.623219 1.35657C3.711786 1.35657 1.351635 3.725338 1.351635 6.647401C1.351843 9.569296 3.711911 11.938273 6.623219 11.938273C9.534361 11.938064 11.894637 9.569171 11.894845 6.647401ZM13.245462 6.647401C13.245254 10.317935 10.280401 13.293613 6.623219 13.293821C2.965871 13.293821 0.000204 10.31806 0 6.647401C0 2.976574 2.965746 0 6.623219 0C10.280526 0.000205 13.245462 2.9767 13.245462 6.647401Z" fill="currentColor"/>
            <path d="M16.000417 15.041079L15.044449 16.000433L11.530434 12.473588L12.486298 11.514234L16.000417 15.041079Z" fill="currentColor"/>
          </svg>
        </button>
        <button class="flex items-center justify-center h-7 w-7 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 0.599609C3.91309 0.599609 0.599609 3.91309 0.599609 8C0.599609 9.13376 0.855461 10.2098 1.3125 11.1719L1.5918 11.7588L2.76562 11.2012L2.48633 10.6143C2.11034 9.82278 1.90039 8.93675 1.90039 8C1.90039 4.63106 4.63106 1.90039 8 1.90039C11.3689 1.90039 14.0996 4.63106 14.0996 8C14.0996 11.3689 11.3689 14.0996 8 14.0996C7.31041 14.0996 6.80528 14.0514 6.35742 13.9277C5.91623 13.8059 5.49768 13.6021 4.99707 13.2529C4.26492 12.7422 3.21611 12.5616 2.35156 13.1074L2.33789 13.1162L2.32422 13.126L1.58789 13.6436L2.01953 14.9297L3.0459 14.207C3.36351 14.0065 3.83838 14.0294 4.25293 14.3184C4.84547 14.7317 5.39743 15.011 6.01172 15.1807C6.61947 15.3485 7.25549 15.4004 8 15.4004C12.0869 15.4004 15.4004 12.0869 15.4004 8C15.4004 3.91309 12.0869 0.599609 8 0.599609ZM7.34473 4.93945V7.34961H4.93945V8.65039H7.34473V11.0605H8.64551V8.65039H11.0605V7.34961H8.64551V4.93945H7.34473Z" fill="currentColor"/>
          </svg>
        </button>
      </div>
      <div class="w-px h-4 bg-gray-200" />
      <div class="flex items-center gap-1.5">
        <button v-if="auth.isLoggedIn && auth.isTeacher" class="h-7 px-3 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors" @click="router.push('/teacher/points')">进入系统</button>
        <template v-else>
          <button class="h-7 px-3 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors" @click="showLogin = true">登录</button>
          <button class="h-7 px-3 rounded-full text-xs font-medium text-white bg-gray-900 hover:bg-gray-800 transition-colors" @click="showLogin = true">注册</button>
        </template>
      </div>
    </div>

    <!-- Center -->
    <div class="flex-1 flex flex-col items-start justify-center px-6 max-w-6xl mx-auto w-full">
      <!-- Section label -->
      <div class="flex items-center gap-1 text-xs uppercase tracking-wide mb-4" style="font-family: var(--font-orbix);">
        <span class="text-[#5E6AD2]">/</span>
        <span class="text-gray-400">Welcome to OurClass</span>
      </div>
      <h1 class="text-[clamp(2rem,4vw,3rem)] font-medium leading-[1.2] tracking-tight text-gray-900 mb-3" style="font-family: 'Inter Tight', sans-serif;">班级管理系统</h1>

      <div class="flex flex-wrap items-center gap-2 mt-10">
        <button class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors" @click="auth.isLoggedIn && auth.isTeacher ? router.push('/chat') : showLogin = true"><Star :size="14" />积分管理</button>
        <button class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors" @click="auth.isLoggedIn && auth.isTeacher ? router.push('/chat') : showLogin = true"><BarChart3 :size="14" />成绩分析</button>
        <button class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors" @click="auth.isLoggedIn && auth.isTeacher ? router.push('/chat') : showLogin = true"><FileText :size="14" />作业管理</button>
        <button class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors" @click="auth.isLoggedIn && auth.isTeacher ? router.push('/chat') : showLogin = true"><MessageSquare :size="14" />班级圈</button>
      </div>
    </div>

    <!-- Composer -->
    <div class="shrink-0 px-4 pb-3">
      <div class="max-w-[48rem] mx-auto">
        <div class="relative border border-gray-200 rounded-2xl bg-gray-50 p-1.5 grid grid-cols-[auto_1fr_auto] items-end gap-1">
          <button class="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0">
            <Plus :size="18" />
          </button>
          <textarea
            v-model="input"
            rows="1"
            placeholder="输入你想了解的功能..."
            class="w-full resize-none bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none py-1.5 leading-5"
            @keydown.enter.prevent="handleSubmit"
          />
          <button
            class="h-8 w-8 flex items-center justify-center rounded-full text-white transition-colors shrink-0"
            :class="input.trim() ? 'bg-gray-900 hover:bg-gray-800' : 'bg-gray-200'"
            :disabled="!input.trim()"
            @click="handleSubmit"
          >
            <ArrowRight :size="16" />
          </button>
        </div>
        <p class="text-xs text-gray-300 text-center mt-2">内容由 AI 生成，仅供参考</p>
      </div>
    </div>
  </div>

  <!-- Login Modal -->
  <LoginModal v-model:show="showLogin" />
</template>
