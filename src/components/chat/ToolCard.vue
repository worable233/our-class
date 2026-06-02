<script setup lang="ts">
const props = defineProps<{ card: Record<string, unknown> }>()
</script>

<template>
  <div class="card">
    <div class="card-head">
      <h4 class="card-title">{{ card.title }}</h4>
      <span v-if="card.subtitle" class="card-sub">{{ card.subtitle }}</span>
    </div>

    <!-- Score ranking table -->
    <table v-if="card.type === 'score_ranking'" class="card-table">
      <thead><tr><th v-for="h in (card.headers as string[])" :key="h">{{ h }}</th></tr></thead>
      <tbody>
        <tr v-for="(row, i) in (card.rows as string[][])" :key="i" :class="{ top3: Number(row[0]) <= 3 }">
          <td v-for="(cell, j) in row" :key="j">{{ cell }}</td>
        </tr>
      </tbody>
    </table>

    <!-- Point summary -->
    <div v-if="card.type === 'point_summary'" class="card-points">
      <div class="point-total" :class="(card.total as number) >= 0 ? 'positive' : 'negative'">
        {{ (card.total as number) >= 0 ? '+' : '' }}{{ card.total }}
      </div>
      <div class="point-breakdown">加分 {{ card.added }} / 扣分 {{ card.deducted }}</div>
      <div v-if="(card.recent as any[])?.length" class="point-recent">
        <div v-for="(r, i) in (card.recent as any[]).slice(0, 5)" :key="i" class="point-row">
          <span :class="r.type">{{ r.type === 'add' ? '+' : '-' }}{{ r.amount }}</span>
          <span class="point-reason">{{ r.reason }}</span>
          <span class="point-date">{{ r.date }}</span>
        </div>
      </div>
    </div>

    <!-- Student list -->
    <div v-if="card.type === 'student_list'" class="card-grid">
      <div v-for="(s, i) in (card.items as any[])" :key="i" class="card-grid-item">
        <span class="stu-name">{{ s.name }}</span>
        <span class="stu-class">{{ s.class }}</span>
      </div>
    </div>

    <!-- Assignment list -->
    <div v-if="card.type === 'assignment_list'" class="card-list">
      <div v-for="(a, i) in (card.items as any[])" :key="i" class="card-list-item">
        <span class="asmt-title">{{ a.title }}</span>
        <span class="asmt-meta">{{ a.course }} · 截止 {{ a.due }}</span>
      </div>
    </div>

    <!-- Submission status -->
    <div v-if="card.type === 'submission_status'" class="card-list">
      <div v-for="(s, i) in (card.items as any[])" :key="i" class="card-list-item sub-item">
        <span class="sub-name">{{ s.name }} <span class="sub-class">{{ s.class }}</span></span>
        <span class="sub-status" :class="s.status">{{ s.status === 'graded' ? `${s.score}分` : '待批改' }}</span>
      </div>
    </div>

    <!-- Class list -->
    <div v-if="card.type === 'class_list'" class="card-grid">
      <div v-for="(c, i) in (card.items as string[])" :key="i" class="class-chip">{{ c }}</div>
    </div>
  </div>
</template>

<style scoped>
.card {
  background: var(--surface-1);
  border: 1px solid var(--hairline);
  border-radius: 12px;
  overflow: hidden;
  margin: 8px 0;
}

.card-head {
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--hairline);
}
.card-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0; }
.card-sub { font-size: 12px; color: var(--text-muted); margin-left: 8px; }

/* Table */
.card-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.card-table th { text-align: left; padding: 8px 14px; font-weight: 500; color: var(--text-muted); font-size: 11px; text-transform: uppercase; border-bottom: 1px solid var(--hairline); }
.card-table td { padding: 8px 14px; color: var(--text-secondary); border-bottom: 1px solid var(--hairline); }
.card-table tr:last-child td { border-bottom: none; }
.top3 td:first-child { color: #f59e0b; font-weight: 600; }

/* Points */
.card-points { padding: 16px; }
.point-total { font-size: 32px; font-weight: 700; }
.point-total.positive { color: #22c55e; }
.point-total.negative { color: #ef4444; }
.point-breakdown { font-size: 12px; color: var(--text-muted); margin: 4px 0 12px; }
.point-recent { border-top: 1px solid var(--hairline); padding-top: 10px; }
.point-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px; }
.point-row .add { color: #22c55e; font-weight: 600; min-width: 28px; }
.point-row .deduct { color: #ef4444; font-weight: 600; min-width: 28px; }
.point-reason { flex: 1; color: var(--text-secondary); }
.point-date { color: var(--text-muted); font-size: 11px; }

/* Grid */
.card-grid { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 14px; }
.card-grid-item { display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 6px; background: var(--surface-2); font-size: 12px; }
.stu-name { color: var(--text-primary); font-weight: 500; }
.stu-class { color: var(--text-muted); }
.class-chip { padding: 4px 12px; border-radius: 6px; background: var(--accent-glow); color: var(--accent-text); font-size: 13px; font-weight: 500; }

/* List */
.card-list { padding: 4px 0; }
.card-list-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid var(--hairline); font-size: 13px; }
.card-list-item:last-child { border-bottom: none; }
.asmt-title { color: var(--text-primary); font-weight: 500; }
.asmt-meta { color: var(--text-muted); font-size: 12px; }
.sub-name { color: var(--text-primary); }
.sub-class { color: var(--text-muted); font-size: 11px; margin-left: 4px; }
.sub-status { font-size: 12px; font-weight: 500; }
.sub-status.graded { color: #22c55e; }
.sub-status.pending { color: #f59e0b; }
</style>
