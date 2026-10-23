# CLAUDE.md

AI-powered helpdesk / ticket management system. Product context lives in `project-scope.md`, stack choices in `tech-stack.md`, and the phased roadmap in `implementation-plan.md` (check off items there as they are completed).

## Documentation

Always use the **context7** MCP server (`resolve-library-id` → `query-docs`) to fetch up-to-date documentation before writing or changing code that uses a library, framework, or CLI — Bun, Express, React, React Router, Vite, Tailwind, Prisma, the Anthropic SDK, SendGrid/Mailgun, etc. Do this even for well-known APIs; training data may be outdated (e.g. Express 5, Tailwind v4, React Router 7 and Prisma all changed setup/APIs in recent majors).

## Stack

- **Runtime / package manager:** Bun (workspaces). Use `bun` / `bunx`, not npm/npx — Node is not installed on this machine.
- **Server (`server/`):** Express 5 + TypeScript, run directly by Bun (no build step for dev). Prisma 7 with PostgreSQL via the `@prisma/adapter-pg` driver adapter. The database URL is set in `server/prisma.config.ts` (not in `schema.prisma`); the client is generated into `server/src/generated/prisma` (gitignored, regenerated on `bun install` and by `bun run db:generate`). Import it from `./generated/prisma/client`, never from `@prisma/client`.
- **Client (`client/`):** React 19 + TypeScript, Vite, Tailwind CSS v4 (`@tailwindcss/vite`), React Router 7 (import from `react-router`).
- Vite dev server proxies `/api/*` to the Express server on port 3000. All API routes are prefixed with `/api`.

## Commands

Run from the repo root unless noted:

```sh
bun install              # install all workspaces
bun run dev              # client (:5173) + server (:3000) with watch
bun run typecheck        # tsc --noEmit in both workspaces
bun run build            # build both workspaces

# in server/
bun run db:migrate       # prisma migrate dev
bun run db:generate      # prisma generate
bun run db:studio        # prisma studio
```

## Layout

```
client/src/        React app (main.tsx, App.tsx, index.css)
server/src/        index.ts (listen), app.ts (Express app + routes), db.ts (Prisma client)
server/prisma/     schema.prisma (models + migrations)
server/prisma.config.ts  Prisma CLI config (schema path, migrations path, DATABASE_URL)
```

## Environment

- `server/.env` (gitignored; template in `server/.env.example`) holds `PORT` and `DATABASE_URL`. Bun and Prisma load it automatically.
- Local PostgreSQL 17 runs as the Windows service `postgresql-17` (binaries in `%LOCALAPPDATA%\Programs\PostgreSQL17\pgsql\bin`, not on PATH). Dev credentials: user `helpdesk`, password `helpdesk`, database `helpdesk`.
- `docker-compose.yml` defines an alternative Postgres on the same port 5432 — don't run both at once.
- Bun lives at `%USERPROFILE%\.bun\bin`; prepend it to PATH in a shell if `bun` is not found.

## Conventions

- TypeScript strict mode with `verbatimModuleSyntax` — use `import type` for type-only imports.
- Verify changes with `bun run typecheck` before considering work done.
