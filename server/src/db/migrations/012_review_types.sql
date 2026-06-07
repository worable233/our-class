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

-- Seed default review types
INSERT INTO review_types (name, emoji, type, amount, sort_order) VALUES
  ('积极发言', '🙋', 'add', 2, 1),
  ('作业优秀', '📝', 'add', 3, 2),
  ('帮助同学', '🤝', 'add', 1, 3),
  ('竞赛获奖', '🏆', 'add', 5, 4),
  ('课堂表现好', '👍', 'add', 2, 5),
  ('考试进步', '📈', 'add', 3, 6),
  ('认真听课', '👂', 'add', 1, 7),
  ('好人好事', '⭐', 'add', 2, 8),
  ('上课迟到', '⏰', 'deduct', 1, 1),
  ('未完成作业', '📕', 'deduct', 2, 2),
  ('上课讲话', '💬', 'deduct', 1, 3),
  ('课堂违纪', '🚫', 'deduct', 2, 4),
  ('作业不认真', '❌', 'deduct', 1, 5),
  ('早退', '🏃', 'deduct', 1, 6),
  ('上课睡觉', '😴', 'deduct', 1, 7),
  ('不文明行为', '👎', 'deduct', 2, 8)
WHERE (SELECT COUNT(*) FROM review_types) = 0;
