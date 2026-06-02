<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { Post, Comment } from '@/types'
import { NButton, NCard, NModal, NInput, NForm, NFormItem, NSpace, NTag, NSpin, NEmpty, NText, NAvatar } from 'naive-ui'

const auth = useAuthStore()
const posts = ref<Post[]>([])
const loading = ref(true)
const showNew = ref(false)
const showPost = ref<(Post & { comments: Comment[] }) | null>(null)
const newForm = ref({ title: '', content: '', tags: '' })
const newComment = ref('')

async function load() {
  loading.value = true
  posts.value = await api.get<Post[]>('/posts')
  loading.value = false
}

async function createPost() {
  await api.post('/posts', {
    ...newForm.value,
    author_id: auth.user?.id,
  })
  showNew.value = false
  newForm.value = { title: '', content: '', tags: '' }
  await load()
}

async function openPost(post: Post) {
  const detail = await api.get<Post & { comments: Comment[] }>(`/posts/${post.id}`)
  showPost.value = detail
  newComment.value = ''
}

function onDetailUpdateShow(val: boolean) {
  if (!val) showPost.value = null
}

async function likePost(postId: number) {
  const res = await api.post<{ likes: number }>(`/posts/${postId}/like`)
  if (showPost.value && showPost.value.id === postId) showPost.value.likes = res.likes
  const p = posts.value.find(x => x.id === postId)
  if (p) p.likes = res.likes
}

async function addComment(postId: number) {
  if (!newComment.value) return
  await api.post(`/posts/${postId}/comments`, {
    author_id: auth.user?.id,
    content: newComment.value,
  })
  newComment.value = ''
  if (showPost.value?.id === postId) openPost(showPost.value)
}

onMounted(load)
</script>

<template>
  <div style="max-width: 800px">
    <div
      style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
      "
    >
      <n-text depth="3" style="font-size: 14px">班级社区，交流与分享</n-text>
      <n-button type="primary" @click="showNew = true">
        <font-awesome-icon :icon="['fas', 'plus']" /> 发布帖子
      </n-button>
    </div>

    <!-- New Post Modal -->
    <n-modal
      v-model:show="showNew"
      preset="card"
      title="发布新帖"
      style="width: 500px"
      :mask-closable="false"
    >
      <n-form>
        <n-form-item label="标题">
          <n-input v-model:value="newForm.title" placeholder="帖子标题" />
        </n-form-item>
        <n-form-item label="标签（逗号分隔）">
          <n-input v-model:value="newForm.tags" placeholder="数学, 作业求助" />
        </n-form-item>
        <n-form-item label="内容">
          <n-input
            type="textarea"
            v-model:value="newForm.content"
            rows="5"
            placeholder="写点什么..."
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showNew = false">取消</n-button>
          <n-button
            type="primary"
            @click="createPost"
            :disabled="!newForm.title || !newForm.content"
          >
            发布
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- Post Detail Modal -->
    <n-modal
      :show="!!showPost"
      @update:show="onDetailUpdateShow"
      preset="card"
      style="width: 600px"
      :mask-closable="false"
    >
      <template v-if="showPost">
        <div style="margin-bottom: 16px">
          <n-text style="font-size: 20px; font-weight: 700; letter-spacing: -0.02em">
            {{ showPost.title }}
          </n-text>
          <div
            style="
              display: flex;
              align-items: center;
              gap: 8px;
              font-size: 13px;
              flex-wrap: wrap;
              margin-top: 8px;
            "
          >
            <n-text depth="3">{{ showPost.author_name }}</n-text>
            <n-text depth="3">{{ showPost.created_at?.slice(0, 10) }}</n-text>
            <n-tag
              v-for="t in (showPost.tags || '').split(',').filter(Boolean)"
              :key="t"
              size="tiny"
            >
              {{ t }}
            </n-tag>
          </div>
        </div>
        <p style="font-size: 15px; line-height: 1.7; margin-bottom: 24px">
          {{ showPost.content }}
        </p>
        <div style="margin-bottom: 24px">
          <n-button quaternary size="small" @click="likePost(showPost.id)">
            <font-awesome-icon :icon="['fas', 'thumbs-up']" /> {{ showPost.likes }}
          </n-button>
        </div>

        <div
          style="
            border-top: 1px solid rgba(255, 255, 255, 0.09);
            padding-top: 20px;
          "
        >
          <n-text
            style="
              font-size: 14px;
              font-weight: 600;
              display: block;
              margin-bottom: 16px;
            "
          >
            评论 ({{ showPost.comments?.length || 0 }})
          </n-text>
          <div
            style="
              display: flex;
              flex-direction: column;
              gap: 8px;
              margin-bottom: 16px;
            "
          >
            <div
              v-for="c in showPost.comments"
              :key="c.id"
              style="
                padding: 8px 12px;
                border-radius: 4px;
                border: 1px solid rgba(255, 255, 255, 0.09);
              "
            >
              <div
                style="
                  display: flex;
                  align-items: center;
                  gap: 8px;
                  margin-bottom: 4px;
                "
              >
                <n-avatar :size="20" round>{{ c.author_name?.charAt(0) }}</n-avatar>
                <n-text style="font-size: 12px; font-weight: 500">{{ c.author_name }}</n-text>
                <n-tag v-if="c.author_role === 'teacher'" size="tiny">教师</n-tag>
              </div>
              <p style="font-size: 13px; margin: 0">{{ c.content }}</p>
              <div style="font-size: 11px; margin-top: 4px">
                {{ c.created_at?.slice(0, 10) }}
              </div>
            </div>
            <n-empty v-if="!showPost.comments?.length" description="暂无评论" />
          </div>

          <div style="display: flex; gap: 8px">
            <n-input
              v-model:value="newComment"
              placeholder="写下你的评论..."
              @keyup.enter="addComment(showPost.id)"
            />
            <n-button type="primary" @click="addComment(showPost.id)" :disabled="!newComment">
              发送
            </n-button>
          </div>
        </div>
      </template>
    </n-modal>

    <!-- Post List -->
    <n-spin :show="loading">
      <div v-if="posts.length" style="display: flex; flex-direction: column; gap: 12px">
        <n-card
          v-for="p in posts"
          :key="p.id"
          :hoverable="true"
          @click="openPost(p)"
          style="cursor: pointer"
        >
          <div
            style="
              display: flex;
              align-items: center;
              gap: 8px;
              margin-bottom: 12px;
            "
          >
            <n-avatar :size="24" round>{{ p.author_name?.charAt(0) }}</n-avatar>
            <n-text style="font-size: 13px; font-weight: 500">{{ p.author_name }}</n-text>
            <n-tag v-if="p.author_role === 'teacher'" size="small">教师</n-tag>
            <n-text depth="3" style="font-size: 12px; margin-left: auto">
              {{ p.created_at?.slice(0, 10) }}
            </n-text>
          </div>
          <n-text
            style="
              font-size: 16px;
              font-weight: 600;
              display: block;
              margin-bottom: 8px;
            "
          >
            {{ p.title }}
          </n-text>
          <n-text
            depth="3"
            style="
              font-size: 14px;
              display: block;
              margin-bottom: 16px;
            "
          >
            {{ p.content.slice(0, 120) }}{{ p.content.length > 120 ? '...' : '' }}
          </n-text>
          <div
            style="
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding-top: 16px;
              border-top: 1px solid rgba(255, 255, 255, 0.09);
            "
          >
            <div style="display: flex; gap: 4px; flex-wrap: wrap">
              <n-tag
                v-for="t in (p.tags || '').split(',').filter(Boolean)"
                :key="t"
                size="tiny"
              >
                {{ t }}
              </n-tag>
            </div>
            <div style="display: flex; gap: 16px; font-size: 13px">
              <n-text depth="3">
                <font-awesome-icon :icon="['fas', 'thumbs-up']" /> {{ p.likes }}
              </n-text>
              <n-text depth="3">
                <font-awesome-icon :icon="['fas', 'comments']" /> {{ p.comment_count || 0 }}
              </n-text>
            </div>
          </div>
        </n-card>
      </div>
      <n-empty v-else description="暂无帖子" />
    </n-spin>
  </div>
</template>
