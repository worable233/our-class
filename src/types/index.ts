export interface User {
  id: number
  username: string
  display_name: string
  role: 'teacher' | 'student'
  class: string
  avatar: string
  token?: string
  student_no?: string
  nickname?: string
  password?: string  // only visible to teachers in student management
}

export interface Student extends User {
  role: 'student'
}

export interface Score {
  id: number
  student_id: number
  student_name?: string
  course: string
  exam_name: string
  score: number
  total_score: number
  date: string
}

export interface ScoreRanking {
  student_id: number
  student_name: string
  class: string
  score: number
  total_score: number
  exam_name: string
  course: string
  rank: number
}

export interface Assignment {
  id: number
  title: string
  description: string
  due_date: string
  course: string
  created_by: number
  teacher_name?: string
  created_at: string
  submit_status?: string
  submit_score?: number | null
}

export interface Submission {
  id: number
  assignment_id: number
  student_id: number
  student_name?: string
  class?: string
  content: string
  submitted_at: string
  score: number | null
  feedback: string
  status: string
}

export interface PointRecord {
  id: number
  student_id: number
  student_name?: string
  teacher_name?: string
  reason: string
  type: 'add' | 'deduct'
  amount: number
  created_by: number
  date: string
}

export interface PointSummary {
  id: number
  display_name: string
  class: string
  total_added: number
  total_deducted: number
  total_points: number
}

export interface PermissionDef {
  code: string
  label: string
  category: string
}

export interface PermissionGroup {
  id: number
  name: string
  description: string
  permissions: string[]
  created_at?: string
}
