# AGENTS.md — OurClass

## Architecture

Vue 3 + TypeScript frontend (Vite, Naive UI, Tailwind CSS, Pinia) + Express backend (TypeScript via tsx, better-sqlite3, JWT auth, Anthropic Claude API).

- Frontend: `src/` — Vue SFC with `<script setup lang="ts">`, path alias `@/` → `src/`
- Backend: `server/src/` — Express routes, SQLite DB, migrations in `server/src/db/migrations/`
- Two user roles: `teacher` and `student` — determined by `permission_groups.group_type` at login time

## Commands

```sh
# Frontend (root)
npm run dev          # Vite dev server (port 5173), proxies /api → localhost:3000
npm run build        # type-check + production build
npm run type-check   # vue-tsc --build
npm run format       # prettier --write src/

# Backend (server/)
cd server && npm run dev   # tsx watch src/index.ts (port 3000)
cd server && npm run start # production start without watch
```

## Key Conventions

- **No semicolons, single quotes, 100-char print width** (`.prettierrc.json` enforced)
- Server ESM: all imports use `.js` extension (e.g. `import { config } from './config/index.js'`) — required for tsx/ts-node ESM
- Server responses: `{ success: boolean, data: T }` or `{ success: false, error: { code, message } }` — use `ok()`/`fail()` helpers from `server/src/lib/errors.js`
- Auth: JWT via `Authorization: Bearer <token>` header. `authMiddleware` loads user + permissions into `req.user`. Skip auth for public endpoints (article images, health check)
- Frontend API client: `src/api/client.ts` — wraps fetch with JWT header injection
- Database: better-sqlite3 (synchronous), WAL mode, foreign keys ON. DB file at `server/data.db`
- Migrations: numbered SQL files in `server/src/db/migrations/` — run automatically via `migrate.ts`
- The `server/` directory is a separate package with its own `package.json` and `node_modules`

## Gotchas

- `.env` contains `JWT_SECRET` — the server throws on startup if it's missing or `"change-me"` (check `server/src/config/index.ts`)
- Server static file serving: `/uploads` maps to `server/uploads/` and `server/storage/` — article images are public, everything else requires JWT
- Vite dev proxy: `/api` and `/uploads` both proxy to `localhost:3000` (see `vite.config.ts`)
- `noUncheckedIndexedAccess: true` in tsconfig — array/object indexed access returns `T | undefined`
- Frontend `Chat.vue` is a large monolithic component (~800 lines)
- Shared views (e.g. `PointsManage.vue`) are mounted for both roles via router — check both roles when modifying
- `playwright` is a direct dependency (used for browser testing/visual checks in `scripts/`)
