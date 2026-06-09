import Database from 'better-sqlite3'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { v4 as uuid } from 'uuid'
import { runMigrations } from './migrate.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, '..', '..', 'data.db')

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    seedPermissionGroups(db)
    seedUsers(db)
    seedAllData(db)
  }
  return db
}

function seedPermissionGroups(db: Database.Database) {
  const count = db.prepare('SELECT COUNT(*) as c FROM permission_groups').get() as { c: number }
  if (count.c > 0) return

  // Default teacher group — all permissions
  const teacherGroup = db.prepare('INSERT INTO permission_groups (name, description) VALUES (?, ?)')
    .run('教师', '默认教师权限组，拥有全部权限')

  // Default student group — basic permissions
  const studentGroup = db.prepare('INSERT INTO permission_groups (name, description) VALUES (?, ?)')
    .run('学生', '默认学生权限组，拥有基础权限')

  const allPermissions = [
    'students.read', 'students.write', 'students.delete',
    'points.read', 'points.write',
    'scores.read', 'scores.write', 'scores.delete',
    'assignments.read', 'assignments.write', 'assignments.submit', 'assignments.grade',
    'chat.access', 'chat.config', 'chat.skills',
    'roles.manage',
    'audit_logs.read',
    'classes.read', 'classes.view_all',
    // AI 工具权限 - 教师拥有全部
    'tool.list_students', 'tool.get_student_points', 'tool.add_points',
    'tool.get_score_rankings', 'tool.list_assignments', 'tool.get_submissions',
    'tool.get_weather', 'tool.web_search', 'tool.random_pick',
    'tool.get_current_time', 'tool.get_class_list', 'tool.view_file',
    'tool.create_student', 'tool.update_student', 'tool.delete_student',
    'tool.get_point_details',
  ]

  const studentPermissions = [
    'points.read',
    'scores.read',
    'assignments.read', 'assignments.submit',
    'chat.access',
    'classes.read',
    // AI 工具权限 - 学生拥有基础查询工具
    'tool.list_students', 'tool.get_student_points',
    'tool.get_score_rankings', 'tool.list_assignments', 'tool.get_submissions',
    'tool.get_current_time', 'tool.get_class_list', 'tool.view_file',
    'tool.get_point_details',
  ]

  const insert = db.prepare('INSERT INTO group_permissions (group_id, permission_code) VALUES (?, ?)')
  for (const perm of allPermissions) {
    insert.run(teacherGroup.lastInsertRowid, perm)
  }
  for (const perm of studentPermissions) {
    insert.run(studentGroup.lastInsertRowid, perm)
  }

  // Backfill existing users with appropriate group
  db.prepare("UPDATE users SET group_id = ? WHERE role = 'teacher' AND group_id IS NULL").run(teacherGroup.lastInsertRowid)
  db.prepare("UPDATE users SET group_id = ? WHERE role = 'student' AND group_id IS NULL").run(studentGroup.lastInsertRowid)
}

function seedUsers(db: Database.Database) {
  const count = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }
  if (count.c > 0) return

  const insertUser = db.prepare(
    'INSERT INTO users (username, display_name, role, class, password, group_id, student_no) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )

  // Find the teacher and student group IDs
  const tGroup = db.prepare("SELECT id FROM permission_groups WHERE name = '教师'").get() as { id: number }
  const sGroup = db.prepare("SELECT id FROM permission_groups WHERE name = '学生'").get() as { id: number }

  insertUser.run('teacher1', '张老师', 'teacher', '', '123456', tGroup.id, null)
  insertUser.run('zhangming', '张明', 'student', '高三(2)班', '123456', sGroup.id, 'S2025001')
  insertUser.run('lihua', '李华', 'student', '高三(2)班', '123456', sGroup.id, 'S2025002')
  insertUser.run('wangfang', '王芳', 'student', '高三(2)班', '123456', sGroup.id, 'S2025003')
  insertUser.run('zhaolei', '赵雷', 'student', '高三(2)班', '123456', sGroup.id, 'S2025004')
  insertUser.run('chenwei', '陈伟', 'student', '高三(2)班', '123456', sGroup.id, 'S2025005')
  insertUser.run('liuna', '刘娜', 'student', '高三(2)班', '123456', sGroup.id, 'S2025006')
  insertUser.run('sunyang', '孙洋', 'student', '高三(2)班', '123456', sGroup.id, 'S2025007')
  insertUser.run('zhoujie', '周杰', 'student', '高三(2)班', '123456', sGroup.id, 'S2025008')
  insertUser.run('wumei', '吴梅', 'student', '高三(2)班', '123456', sGroup.id, 'S2025009')
}

function seedAllData(db: Database.Database) {
  const count = db.prepare('SELECT COUNT(*) as c FROM point_records').get() as { c: number }
  if (count.c > 0) return

  const students = [2, 3, 4, 5, 6, 7, 8, 9, 10]
  const courses = ['数学', '英语', '语文', '物理']
  const exams = ['第一次月考', '期中考试', '第二次月考', '期末考试']

  // Seed scores
  const insertScore = db.prepare(
    'INSERT INTO scores (student_id, course, exam_name, score, date) VALUES (?, ?, ?, ?, ?)',
  )
  for (const sid of students) {
    for (const course of courses) {
      for (let i = 0; i < exams.length; i++) {
        const base = course === '数学' ? 75 : course === '英语' ? 70 : course === '语文' ? 80 : 72
        const variation = Math.floor(Math.random() * 20) - 10
        const score = Math.min(100, Math.max(40, base + variation + i * 3))
        const month = (9 + i).toString()
        insertScore.run(sid, course, exams[i], score, `2025-${month.padStart(2, '0')}-15`)
      }
    }
  }

  // Seed assignments
  const insertAssignment = db.prepare(
    'INSERT INTO assignments (title, description, due_date, course, created_by) VALUES (?, ?, ?, ?, ?)',
  )
  insertAssignment.run('第三章练习题', '完成课本第三章所有练习题，写在作业本上拍照提交。', '2026-06-05', '数学', 1)
  insertAssignment.run('英语作文：我的梦想', '写一篇不少于120词的英语作文，主题为"My Dream"。', '2026-06-07', '英语', 1)
  insertAssignment.run('物理实验报告', '完成自由落体实验并撰写实验报告，包含实验数据和分析。', '2026-06-10', '物理', 1)
  insertAssignment.run('语文阅读理解', '完成课文《荷塘月色》的阅读理解题目，共10道题。', '2026-06-03', '语文', 1)

  // Seed submissions
  const insertSubmission = db.prepare(
    'INSERT INTO submissions (assignment_id, student_id, content, status, score, feedback) VALUES (?, ?, ?, ?, ?, ?)',
  )
  insertSubmission.run(1, 2, '已完成第三章所有练习题，详见拍照附件。', 'graded', 92, '完成得很好，解题步骤清晰。')
  insertSubmission.run(1, 3, '作业已提交。', 'graded', 85, '部分题目有计算错误，请仔细检查。')
  insertSubmission.run(1, 4, '', 'pending', null, '')
  insertSubmission.run(2, 2, 'My Dream is to become a scientist...', 'graded', 90, 'Good essay! Well-structured.')
  insertSubmission.run(2, 3, '', 'pending', null, '')

  // Seed point records
  const insertPoint = db.prepare(
    'INSERT INTO point_records (student_id, reason, type, amount, created_by, date) VALUES (?, ?, ?, ?, ?, ?)',
  )
  const pointData = [
    [2, '课堂积极发言', 'add', 2, 1, '2026-05-20'],
    [2, '作业优秀', 'add', 3, 1, '2026-05-22'],
    [3, '帮助同学解答问题', 'add', 2, 1, '2026-05-21'],
    [4, '上课迟到', 'deduct', 1, 1, '2026-05-23'],
    [5, '未完成作业', 'deduct', 2, 1, '2026-05-24'],
    [6, '课堂表现优秀', 'add', 3, 1, '2026-05-25'],
    [7, '数学竞赛获奖', 'add', 5, 1, '2026-05-26'],
    [8, '上课讲话', 'deduct', 1, 1, '2026-05-27'],
    [9, '作业优秀', 'add', 2, 1, '2026-05-22'],
    [10, '积极回答问题', 'add', 2, 1, '2026-05-28'],
  ]
  for (const row of pointData) insertPoint.run(...row)

}

console.log('✅ Database initialized at:', DB_PATH)
