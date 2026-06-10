# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OurClass — a classroom management web app for teachers (homeroom teacher) and students. Teachers manage points, assignments, and students; students view their points, leaderboard, assignments, and social posts.

**Stack:** Vue 3 + TypeScript frontend (Vite 8, Naive UI, Tailwind CSS 4, Pinia) + Express backend (TypeScript via tsx, better-sqlite3, JWT auth, Anthropic Claude API for AI chat).

## Commands

### Frontend (root directory)

- `npm run dev` — Start Vite dev server with HMR (port 5173)
- `npm run build` — Type-check then build for production
- `npm run build-only` — Build without type-checking
- `npm run preview` — Serve production build locally
- `npm run type-check` — Run `vue-tsc --build`
- `npm run format` — Format src/ with Prettier

### Backend (`server/` directory)

- `cd server && npm run dev` — Start Express API dev server with hot-reload via tsx watch (port 3000)
- `cd server && npm run start` — Start Express API without watch mode

### Both

Start both simultaneously: `npm run dev` in root for frontend, `cd server && npm run dev` for backend. The Vite dev server proxies `/api` requests to `http://localhost:3000`.

### Edge 调试模式（查看浏览器）

```bash
! ./scripts/edge-debug.sh
```
启动后可在对话中调用 `see_browser` MCP 工具查看当前页面。

## Architecture

### Frontend (`src/`)

```
src/
├── api/client.ts         # HTTP client: fetch wrapper with JWT, ApiEnvelope unwrapping
├── router/index.ts       # Vue Router with role-based guards (teacher vs student)
├── stores/auth.ts        # Pinia auth store: login/logout, localStorage persistence
├── types/index.ts        # All TypeScript interfaces (User, Score, Assignment, PointRecord, etc.)
├── layouts/DashboardLayout.vue  # Sidebar + Header shell for authenticated pages
├── components/
│   ├── chat/             # AI chat UI (ChatLayout, ChatSidebar, ChatThread, ChatInput, etc.)
│   ├── dashboard/        # Sidebar navigation, Header
│   ├── landing/          # Landing page section headings
│   ├── HomePage.vue      # Public landing page
│   ├── LoginModal.vue    # Login modal used on landing page
│   └── Logo.vue
├── views/
│   ├── Login.vue         # Standalone login page
│   ├── Chat.vue          # AI assistant page (teacher only) — 800+ lines, large monolithic component
│   ├── ChatPage.vue      # Chat page wrapper (also the public landing at /)
│   ├── student/          # Student views (see below)
│   └── teacher/          # Teacher views (see below, 19 views)
└── composables/
    ├── useCountUp.ts     # Animated number counter
    ├── useScrollReveal.ts # Scroll-triggered reveal animations
    ├── useRefresh.ts     # Injects refreshTick to trigger data reloads across components
    ├── useSearchPanel.ts # Shared search panel state (singleton) — displays web search results with favicons
    └── useTheme.ts       # Theme toggle (light/dark)

**Teacher views** (`src/views/teacher/`): DashboardHome, PointsManage, AssignmentCollect, UserManage, RoleManage, ReviewTypeManage, GradeManage, AuditLogs, TrafficMonitor, DiskManage, CourseManage, Articles, PointDetails, SettingsPage, SiteGeneralSettings, SiteData, SystemUpdate, SkillManage, BackupManage

**Student views** (`src/views/student/`): StudentPoints, Leaderboard, Profile, AssignmentQuery, ScoreDetails, GradeRanking, StudentDisk, DashboardHome

**Shared views** (used by both roles via router meta): `PointsManage.vue` (teachers always; students with `points.write`), `Articles.vue` (teachers; students with `articles.read`)
```

- **No registration:** All accounts are created by teachers via the student management page. Students log in with teacher-assigned credentials (default password `123456`). There is no public registration endpoint.
- **Routing:** `/` is public landing (ChatPage). `/login` is the fallback. `/teacher/*` and `/student/*` require auth + matching role. The router guard calls `auth.loadFromStorage()` on each navigation (reads `localStorage` key `ourclass_user`), checks role, then checks granular permission codes via `route.meta.permissions`. Unauthorized → redirect to `/`. `router.afterEach` tracks page views via `POST /api/analytics/pv`.

  Route meta permissions pattern: `meta: { permissions: ['points.read'] }` — the guard requires at least one match via `authStore.hasPermission()`. Student routes may also declare permissions (e.g. `/student/points-manage` requires `points.write`). Routes without meta.permissions only check the role.
- **State:** Pinia `useAuthStore` holds current user. `loadFromStorage()` hydrates from `localStorage('ourclass_user')` on each navigation. JWT token is stored inside the user object.
- **API client:** `src/api/client.ts` wraps `fetch` with automatic JWT header injection, JSON parsing, and error handling. All responses follow `{ success: boolean, data: T }` envelope — the client unwraps `data` or throws on `success: false`.
- **UI:** Naive UI component library with a dark theme and custom theme overrides (`primaryColor: #5E6AD2`). Tailwind CSS 4 for utility styles.
- **icons:** `@lucide/vue` for icons. `font-awesome-icon` is NOT available (use emoji or lucide instead).
- **Chat component** (src/views/Chat.vue) is a large monolithic component (~800 lines) handling SSE streaming, tool execution display, random pick animation, base64-encoded conversation IDs.
- **Shared views pattern:** Some `.vue` components are shared between teacher and student routes via the router. E.g., `PointsManage.vue` mounts at both `/teacher/points` and `/student/points-manage`; `Articles.vue` mounts at `/teacher/articles` and `/student/articles`. The component checks `authStore.permissions` internally to gate actions. When modifying a shared component, test both roles.
- **Scripts directory** (`scripts/`): Contains browser debugging utilities — `edge-debug.sh` (starts Edge with CDP port 9222), `mcp-browser.mjs` (MCP browser server for screenshots + vision analysis via MiMo), `screenshot.sh` (macOS screencapture wrapper). Other scripts are development utilities.

### Backend (`server/src/`)

```
server/src/
├── index.ts              # Express app setup: security, CORS, routes, error handler
├── config/index.ts       # Config from env vars with defaults (PORT, JWT_SECRET, etc.)
├── db/
│   ├── init.ts           # DB singleton (better-sqlite3), runs migrations + seeds demo data
│   ├── migrate.ts        # File-based SQL migration runner
│   └── migrations/       # Numbered SQL migration files (001_schema.sql → 037_article_read_permission.sql)
├── lib/
│   ├── errors.ts         # AppError hierarchy: NotFoundError, ValidationError, AuthError, ForbiddenError
│   ├── response.ts       # ok() and fail() helpers — consistent JSON envelope
│   └── logger.ts         # Pino logger
├── middleware/
│   ├── auth.ts           # JWT sign/verify, Express Request user augmentation, permission check
│   ├── validate.ts       # Zod schema validation middleware (body/query/params)
│   ├── errorHandler.ts   # Catches AppError → fail(), unknown errors → 500
│   └── requestLogger.ts  # HTTP request logging via Pino
└── routes/
    ├── auth.ts           # POST /login, GET /me, GET /permissions
    ├── students.ts       # CRUD for students (teacher only, cascade deletes posts/comments/scores/etc.)
    ├── scores.ts         # Score CRUD + rankings
    ├── assignments.ts    # Assignment CRUD + submissions + grading
    ├── points.ts         # Point records CRUD + summaries
    ├── roles.ts          # Permission groups CRUD + permission listing
    ├── audit.ts          # Audit log listing with pagination + entity type filter
    ├── analytics.ts      # Dashboard stats, visit trends, API trends, traffic map data
    ├── chat.ts           # Anthropic Claude + OpenAI-compatible API integration (SSE streaming, tool execution, conversations, config)
    └── classes.ts        # Class list
```

- **Database:** SQLite via `better-sqlite3` (synchronous API). DB file at `server/data.db`. Migrations run automatically on first `getDb()` call. Latest schema includes 37 migrations covering: `users`, `scores`, `assignments`, `submissions`, `point_records`, `review_types`, `posts`, `comments`, `api_keys`, `conversations`, `messages`, `permission_groups`, `group_permissions`, `audit_logs`, `page_views`, `traffic_logs`, `articles`, `storage_files`, `site_settings`, `courses`.
- **Auth:** JWT-based. `signToken()` creates tokens with `{ id, role }` payload. `authMiddleware` verifies Bearer token, looks up user in DB, attaches `req.user` with `permissions[]`. Password comparison is plaintext (demo project).
- **Permissions:** Role-based access control via `requirePermission(code)` middleware. Each user belongs to a `permission_group`. Default groups: 教师 (all perms), 学生 (basic perms). Permission codes: `students.read/write/delete`, `points.read/write`, `scores.read/write/delete`, `assignments.read/write/submit/grade`, `chat.access/config`, `roles.manage`, `audit_logs.read`, `classes.read`, `articles.read/manage`, `tools.manage`, `settings.manage`.
- **Response format:** All endpoints return `{ success: true, data }` or `{ success: false, error: { code, message } }`. Use `ok(res, data)` and `fail(res, status, code, message)` helpers.
- **Routes (21 files):** `auth.ts`, `analytics.ts`, `articles.ts`, `assignments.ts`, `audit.ts`, `backup.ts`, `chat.ts`, `chat-settings.ts`, `classes.ts`, `courses.ts`, `points.ts`, `reviewTypes.ts`, `roles.ts`, `scores.ts`, `site-settings.ts`, `skills.ts`, `storage.ts`, `students.ts`, `teachers.ts`, `update.ts`, `upload.ts`
- **Validation:** Zod schemas passed to `validate(schema, source?)` middleware. Supports `body`, `query`, `params` sources.
- **Seeding:** `init.ts` → `seedAllData()` seeds 1 teacher + 9 students, scores (4 exams × 4 courses), assignments, submissions, point records. Seeds only run if the `users` and `point_records` tables are empty.
- **Chat/AI:** `POST /api/chat/conversations/:id/chat` streams AI responses via SSE. Supports both Anthropic Claude (default) and OpenAI-compatible APIs (DeepSeek, Zhipu/GLM). Tool execution for data queries (points, scores, students, weather, web search, random pick). Messages stored in DB with prompt caching. Config via `POST /api/chat/config`.
- **File upload:** Uses `multer` (multipart form data). Backup at `server/src/routes/upload.ts` supports XLSX/PDF/docx parsing. Student data can be imported/exported via XLSX. File storage managed via `storage.ts` and `storage_files` table.

### Roles

- **teacher** — manages points, assignments, students, posts; has access to AI chat, audit logs, dashboard analytics
- **student** — views own points, leaderboard, assignments, posts, profile; can submit assignments and use AI chat

Seeded credentials: `teacher1` / `123456` (teacher), `zhangming` / `123456` (student).

### Browser Inspection Tool

- **see_browser MCP tool** — connects to Edge via CDP (`--remote-debugging-port=9222`), takes screenshots, analyzes with MiMo-V2.5 vision model. Configured in `.mcp.json`.
- Start Edge debug mode: `! ./scripts/edge-debug.sh`
- MCP server: `scripts/mcp-browser.mjs` (Node.js MCP server that screenshots + analyzes via MiMo API)
- `MIMO_API_KEY` must be set in `~/.claude/settings.local.json` (already configured)
- Screenshot helper: `scripts/screenshot.sh` (uses macOS `screencapture`)

## Code Style

- No semicolons, single quotes, 100-char print width (enforced by `.prettierrc.json`)
- `.vue` components use `<script setup lang="ts">`
- `@/` path alias resolves to `src/`
- TypeScript config: `tsconfig.app.json` (app code), `tsconfig.node.json` (Node config), `server/tsconfig.json` (backend)
- Backend uses `.js` extension in imports (for ESM compatibility with tsx)
- Route handlers use Zod for validation, `ok`/`fail` for responses, `throw AppError` for errors (caught by errorHandler middleware)
