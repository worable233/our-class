# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vue 3 + TypeScript project scaffolded via `create-vite`. Uses Vite 8 as build tool, vue-tsc 3 for type-checking, and Prettier 3 for formatting.

## Commands

- `npm run dev` — Start Vite dev server with HMR
- `npm run build` — Type-check then build for production (runs `vue-tsc --build && vite build` via npm-run-all2)
- `npm run build-only` — Build without type-checking
- `npm run preview` — Serve production build locally
- `npm run type-check` — Run `vue-tsc --build`
- `npm run format` — Format src/ with Prettier

## Code Style

- No semicolons, single quotes, 100-char print width (enforced by `.prettierrc.json`)
- Format on save enabled in VSCode workspace settings

## Conventions

- `@/` path alias resolves to `src/` (configured in `vite.config.ts` and `tsconfig.app.json`)
- `.vue` components use `<script setup lang="ts">`
- TypeScript config is split: `tsconfig.app.json` for app code, `tsconfig.node.json` for Node-side config files
