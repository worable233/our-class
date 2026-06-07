CREATE TABLE IF NOT EXISTS review_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '📌',
  type TEXT NOT NULL CHECK(type IN ('add', 'deduct')),
  amount INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed default review types (only if table is empty)
INSERT INTO review_types (name, emoji, type, amount, sort_order)
SELECT * FROM (
  SELECT '积极发言' as name, '🙋' as emoji, 'add' as type, 2 as amount, 1 as sort_order
  UNION ALL SELECT '作业优秀', '📝', 'add', 3, 2
  UNION ALL SELECT '帮助同学', '🤝', 'add', 1, 3
  UNION ALL SELECT '竞赛获奖', '🏆', 'add', 5, 4
  UNION ALL SELECT '课堂表现好', '👍', 'add', 2, 5
  UNION ALL SELECT '考试进步', '📈', 'add', 3, 6
  UNION ALL SELECT '认真听课', '👂', 'add', 1, 7
  UNION ALL SELECT '好人好事', '⭐', 'add', 2, 8
  UNION ALL SELECT '上课迟到', '⏰', 'deduct', 1, 1
  UNION ALL SELECT '未完成作业', '📕', 'deduct', 2, 2
  UNION ALL SELECT '上课讲话', '💬', 'deduct', 1, 3
  UNION ALL SELECT '课堂违纪', '🚫', 'deduct', 2, 4
  UNION ALL SELECT '作业不认真', '❌', 'deduct', 1, 5
  UNION ALL SELECT '早退', '🏃', 'deduct', 1, 6
  UNION ALL SELECT '上课睡觉', '😴', 'deduct', 1, 7
  UNION ALL SELECT '不文明行为', '👎', 'deduct', 2, 8
) WHERE NOT EXISTS (SELECT 1 FROM review_types LIMIT 1);
