<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api/client'
import type { Post, Comment } from '@/types'
import { NButton, NCard, NModal, NSpace, NTag, NSpin, NEmpty, NText, NAvatar } from 'naive-ui'

const posts = ref<Post[]>([])
const selectedPost = ref<(Post & { comments: Comment[] }) | null>(null)
const loading = ref(true)

async function load() {
  loading.value = true
  posts.value = await api.get<Post[]>('/posts')
  loading.value = false
}

async function openDetail(post: Post) {
  const detail = await api.get<Post & { comments: Comment[] }>(`/posts/${post.id}`)
  selectedPost.value = detail
}

async function deletePost(postId: number, e: Event) {
  e.stopPropagation()
  if (!confirm('确定删除该帖子及其所有评论？')) return
  await api.delete(`/posts/${postId}`)
  if (selectedPost.value?.id === postId) selectedPost.value = null
  await load()
}

async function deleteComment(commentId: number, e: Event) {
  e.stopPropagation()
  if (!confirm('确定删除该评论？')) return
  await api.delete(`/posts/comments/${commentId}`)
  if (selectedPost.value) {
    selectedPost.value.comments = selectedPost.value.comments.filter(c => c.id !== commentId)
  }
}

onMounted(load)
</script>

<template>
  <div style="max-width: 1000px;">
    <div style="margin-bottom: 24px;">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <h2 style="font-weight: 700; font-size: 22px; margin: 0; letter-spacing: -0.02em;">帖子管理</h2>
        <p style="font-size: 14px; color: #999; margin: 0;">审核管理班级帖子与评论</p>
      </div>
    </div>

    <n-spin :show="loading">
      <div class="posts-grid-layout" style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start;">
        <!-- Post List -->
        <n-card>
          <template #header>
            <div style="display: flex; align-items: center;">
              <span style="font-weight: 600; font-size: 14px;">全部帖子</span>
              <n-tag size="small" round style="margin-left: auto;">{{ posts.length }}</n-tag>
            </div>
          </template>
          <n-card
            v-for="p in posts"
            :key="p.id"
            :hoverable="true"
            style="margin-bottom: 8px; cursor: pointer;"
            @click="openDetail(p)"
          >
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              <n-avatar :size="24" round>{{ p.author_name?.charAt(0) }}</n-avatar>
              <span style="font-size: 13px; font-weight: 500;">{{ p.author_name }}</span>
              <n-tag v-if="p.author_role === 'teacher'" size="small">教师</n-tag>
              <span style="font-size: 12px; color: #999; margin-left: auto;">{{ p.created_at?.slice(0, 10) }}</span>
            </div>
            <h3 style="font-weight: 600; font-size: 15px; margin: 0 0 4px 0;">{{ p.title }}</h3>
            <p style="font-size: 13px; color: #666; line-height: 1.5; margin: 0 0 16px 0;">
              {{ p.content.slice(0, 120) }}{{ p.content.length > 120 ? '...' : '' }}
            </p>
            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid #eee;">
              <div style="font-size: 13px; color: #999; display: flex; align-items: center; gap: 8px;">
                <font-awesome-icon :icon="['fas', 'thumbs-up']" />
                {{ p.likes }}
                <font-awesome-icon :icon="['fas', 'comment']" />
                {{ p.comment_count || 0 }}
              </div>
              <n-button quaternary size="tiny" type="error" @click="deletePost(p.id, $event)">
                <font-awesome-icon :icon="['fas', 'trash-can']" /> 删除
              </n-button>
            </div>
          </n-card>
          <n-empty v-if="posts.length === 0" description="暂无数据" />
        </n-card>

        <!-- Detail Panel -->
        <n-card v-if="selectedPost" style="position: sticky; top: 80px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid #eee; gap: 16px;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <n-avatar :size="30" round>{{ selectedPost.author_name?.charAt(0) }}</n-avatar>
              <span style="font-size: 14px; font-weight: 500;">{{ selectedPost.author_name }}</span>
              <n-tag v-if="selectedPost.author_role === 'teacher'" size="small">教师</n-tag>
              <span style="font-size: 12px; color: #999;">{{ selectedPost.created_at?.slice(0, 10) }}</span>
            </div>
            <n-button quaternary size="tiny" type="error" @click="deletePost(selectedPost.id, $event)">
              <font-awesome-icon :icon="['fas', 'trash-can']" /> 删除此帖
            </n-button>
          </div>
          <h3 style="font-weight: 700; font-size: 18px; margin: 0 0 16px 0; letter-spacing: -0.01em;">{{ selectedPost.title }}</h3>
          <p style="font-size: 14px; color: #666; line-height: 1.7; margin: 0 0 24px 0;">{{ selectedPost.content }}</p>

          <div v-if="selectedPost.tags" style="display: flex; gap: 4px; margin-bottom: 24px; flex-wrap: wrap;">
            <n-tag v-for="t in selectedPost.tags.split(',').filter(Boolean)" :key="t" size="small">{{ t }}</n-tag>
          </div>

          <div style="border-top: 1px solid #eee; padding-top: 24px;">
            <h4 style="font-size: 14px; font-weight: 600; margin: 0 0 16px 0; display: flex; align-items: center; gap: 8px;">
              评论
              <n-tag size="small" round>{{ selectedPost.comments.length }}</n-tag>
            </h4>
            <div v-for="c in selectedPost.comments" :key="c.id" style="padding: 16px; border-radius: 4px; background: #f5f5f5; margin-bottom: 8px; border: 1px solid #eee;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <n-avatar :size="22" round>{{ c.author_name?.charAt(0) }}</n-avatar>
                <span style="font-size: 12px; font-weight: 500;">{{ c.author_name }}</span>
                <n-tag v-if="c.author_role === 'teacher'" size="small">教师</n-tag>
                <span style="font-size: 11px; color: #999; margin-left: auto;">{{ c.created_at?.slice(0, 10) }}</span>
                <n-button quaternary size="tiny" type="error" @click="deleteComment(c.id, $event)">删除</n-button>
              </div>
              <p style="font-size: 13px; color: #666; line-height: 1.5; margin: 0;">{{ c.content }}</p>
            </div>
            <n-empty v-if="selectedPost.comments.length === 0" description="暂无评论" />
          </div>
        </n-card>

        <n-card v-else style="position: sticky; top: 80px;" content-style="display: flex; align-items: center; justify-content: center; min-height: 240px;">
          <n-empty description="点击左侧帖子查看详情和评论" />
        </n-card>
      </div>
    </n-spin>
  </div>
</template>

<style>
@media (max-width: 768px) {
  .posts-grid-layout {
    grid-template-columns: 1fr !important;
  }
}
</style>
