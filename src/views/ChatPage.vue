<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import HomeHeader from '@/components/HomeHeader.vue'
import ChatView from '@/views/Chat.vue'
import LoginModal from '@/components/LoginModal.vue'

const router = useRouter()
const auth = useAuthStore()
const savedChatSidebar = localStorage.getItem('ourclass_chat_sidebar')
const sidebarOpen = ref(savedChatSidebar !== null ? savedChatSidebar === 'true' : true)
watch(sidebarOpen, (val) => localStorage.setItem('ourclass_chat_sidebar', String(val)))
const showLogin = ref(false)
const chatRef = ref<InstanceType<typeof ChatView> | null>(null)

function toggleHistory() {
  const wasOpen = sidebarOpen.value
  sidebarOpen.value = !sidebarOpen.value
  if (wasOpen) chatRef.value?.closeSearch()
}
function toggleSearch() { chatRef.value?.toggleSearch() }
function newChat() {
  if (auth.isLoggedIn) {
    chatRef.value?.newConversation()
    if (!sidebarOpen.value) sidebarOpen.value = true
  } else {
    showLogin.value = true
  }
}
</script>

<template>
  <div class="h-screen flex flex-col transition-colors" style="background: var(--ground)">
    <HomeHeader :sidebar-open="sidebarOpen" @history="toggleHistory" @search="toggleSearch" @new-chat="newChat" />
    <div class="flex-1 min-h-0 flex">
      <ChatView ref="chatRef" :sidebar-open="sidebarOpen" @login="showLogin = true" @close-sidebar="sidebarOpen = false" />
    </div>
    <LoginModal v-model:show="showLogin" />
  </div>
</template>
