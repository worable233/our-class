CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT CHECK(role IN ('teacher', 'student')) NOT NULL,
  class TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  token TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_class ON users(class);

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  course TEXT NOT NULL,
  exam_name TEXT NOT NULL,
  score REAL NOT NULL,
  total_score REAL DEFAULT 100,
  date TEXT NOT NULL,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_scores_student ON scores(student_id);
CREATE INDEX IF NOT EXISTS idx_scores_course_exam ON scores(course, exam_name);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  due_date TEXT NOT NULL,
  course TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  content TEXT DEFAULT '',
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  score REAL DEFAULT NULL,
  feedback TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);

CREATE TABLE IF NOT EXISTS point_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  type TEXT CHECK(type IN ('add', 'deduct')) NOT NULL,
  amount INTEGER NOT NULL,
  created_by INTEGER NOT NULL,
  date TEXT NOT NULL,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_points_student ON point_records(student_id);
CREATE INDEX IF NOT EXISTS idx_points_date ON point_records(date);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id INTEGER NOT NULL,
  tags TEXT DEFAULT '',
  likes INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);

-- Seed data (users)
INSERT OR IGNORE INTO users (id, username, display_name, role, class) VALUES
  (1, 'teacher1', '张老师', 'teacher', ''),
  (2, 'zhangming', '张明', 'student', '高三(2)班'),
  (3, 'lihua', '李华', 'student', '高三(2)班'),
  (4, 'wangfang', '王芳', 'student', '高三(2)班'),
  (5, 'zhaolei', '赵雷', 'student', '高三(2)班'),
  (6, 'chenwei', '陈伟', 'student', '高三(2)班'),
  (7, 'liuna', '刘娜', 'student', '高三(2)班'),
  (8, 'sunyang', '孙洋', 'student', '高三(2)班'),
  (9, 'zhoujie', '周杰', 'student', '高三(2)班'),
  (10, 'wumei', '吴梅', 'student', '高三(2)班');
