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

## Architecture

### Frontend (`src/`)

```
src/
├── api/client.ts         # HTTP client: fetch wrapper with JWT, ApiEnvelope unwrapping
├── router/index.ts       # Vue Router with role-based guards (teacher vs student)
├── stores/auth.ts        # Pinia auth store: login/logout, localStorage persistence
├── types/index.ts        # All TypeScript interfaces (User, Score, Assignment, Post, etc.)
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
│   ├── Chat.vue          # AI assistant page (teacher only)
│   ├── student/          # Student views: Points, Leaderboard, Assignments, Posts, Profile
│   └── teacher/          # Teacher views: PointsManage, AssignmentCollect, StudentManage, Posts
└── composables/
    ├── useCountUp.ts     # Animated number counter
    └── useScrollReveal.ts # Scroll-triggered reveal animations
```

- **No registration:** All accounts are created by teachers via the student management page. Students log in with teacher-assigned credentials (default password `123456`). There is no public registration endpoint.
- **Routing:** `/` is public landing. `/login` is the fallback. `/teacher/*` and `/student/*` require auth + matching role. The router guard checks `localStorage` for persisted user and redirects unauthorized access.
- **State:** Pinia `useAuthStore` holds current user. `loadFromStorage()` hydrates from `localStorage('ourclass_user')` on each navigation. JWT token is stored inside the user object.
- **API client:** `src/api/client.ts` wraps `fetch` with automatic JWT header injection (reads token from localStorage), JSON parsing, and error handling. All responses follow `{ success: boolean, data: T }` envelope — the client unwraps `data` or throws on `success: false`.
- **UI:** Naive UI component library with a dark theme and custom theme overrides (`primaryColor: #5E6AD2`). Tailwind CSS 4 for utility styles.

### Backend (`server/src/`)

```
server/src/
├── index.ts              # Express app setup: security, CORS, routes, error handler
├── config/index.ts       # Config from env vars with defaults (PORT, JWT_SECRET, etc.)
├── db/
│   ├── init.ts           # DB singleton (better-sqlite3), runs migrations + seeds demo data
│   ├── migrate.ts        # File-based SQL migration runner
│   ├── schema.sql        # Full schema for reference (migrations handle actual DDL)
│   └── migrations/       # Numbered SQL migration files (001_schema.sql, 002_post_likes.sql, ...)
├── lib/
│   ├── errors.ts         # AppError hierarchy: NotFoundError, ValidationError, AuthError, ForbiddenError
│   ├── response.ts       # ok() and fail() helpers — consistent JSON envelope
│   └── logger.ts         # Pino logger
├── middleware/
│   ├── auth.ts           # JWT sign/verify, Express Request user augmentation
│   ├── validate.ts       # Zod schema validation middleware (body/query/params)
│   ├── errorHandler.ts   # Catches AppError → fail(), unknown errors → 500
│   └── requestLogger.ts  # HTTP request logging via Pino
└── routes/
    ├── auth.ts           # POST /login, GET /me (public + protected)
    ├── classes.ts        # CRUD for classes
    ├── students.ts       # Student management (teacher only)
    ├── scores.ts         # Score CRUD + rankings
    ├── assignments.ts    # Assignment CRUD + submissions + grading
    ├── points.ts         # Point records CRUD + summaries
    ├── posts.ts          # Social posts + comments + likes
    └── chat.ts           # Anthropic Claude API integration (SSE streaming, conversations)
```

- **Database:** SQLite via `better-sqlite3` (synchronous API). The DB file is `server/data.db`. Migrations run automatically on first `getDb()` call. Schema includes: `users`, `scores`, `assignments`, `submissions`, `point_records`, `posts`, `comments`, `api_keys`, `conversations`, `messages`.
- **Auth:** JWT-based. `signToken()` creates tokens with `{ id, role }` payload. `authMiddleware` verifies Bearer token, looks up user in DB, attaches `req.user`. Password comparison is plaintext (demo project).
- **Response format:** All endpoints return `{ success: true, data }` or `{ success: false, error: { code, message } }`. Use `ok(res, data)` and `fail(res, status, code, message)` helpers.
- **Validation:** Zod schemas passed to `validate(schema)` middleware. Validates body by default, supports `query` and `params` sources.
- **Seeding:** On first run, `init.ts` seeds 1 teacher + 9 students, scores, assignments, submissions, point records, posts, and comments. Seeds only run if the `users` and `point_records` tables are empty.
- **Chat/AI:** `POST /api/chat/conversations/:id/chat` streams Claude responses via SSE. Messages stored in DB with prompt caching on system prompt and older history. Teacher must configure their Anthropic API key via `POST /api/chat/config`.

### Roles

- **teacher** — manages points, assignments, students, posts; has access to AI chat
- **student** — views own points, leaderboard, assignments, posts, profile

Seeded credentials: `teacher1` / `123456` (teacher), `zhangming` / `123456` (student).

## Code Style

- No semicolons, single quotes, 100-char print width (enforced by `.prettierrc.json`)
- `.vue` components use `<script setup lang="ts">`
- `@/` path alias resolves to `src/`
- TypeScript config: `tsconfig.app.json` (app code), `tsconfig.node.json` (Node config), `server/tsconfig.json` (backend)
