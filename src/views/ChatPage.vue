<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import HomeHeader from '@/components/HomeHeader.vue'
import ChatView from '@/views/Chat.vue'
import LoginModal from '@/components/LoginModal.vue'

const router = useRouter()
const auth = useAuthStore()
const sidebarOpen = ref(true)
const showLogin = ref(false)
const chatRef = ref<InstanceType<typeof ChatView> | null>(null)

function toggleHistory() { sidebarOpen.value = !sidebarOpen.value }
function toggleSearch() { chatRef.value?.toggleSearch() }
</script>

<template>
  <div class="h-screen flex flex-col bg-[#f8f9fa] dark:bg-[#0a0b0d] transition-colors">
    <HomeHeader :sidebar-open="sidebarOpen" @history="toggleHistory" @search="toggleSearch" />
    <div class="flex-1 min-h-0 flex">
      <ChatView ref="chatRef" :sidebar-open="sidebarOpen" @login="showLogin = true" @close-sidebar="sidebarOpen = false" />
    </div>
    <LoginModal v-model:show="showLogin" />
  </div>
</template>
