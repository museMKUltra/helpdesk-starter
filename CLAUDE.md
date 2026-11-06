# CLAUDE.md

AI-powered helpdesk / ticket management system. Product context lives in `project-scope.md`, stack choices in `tech-stack.md`, and the phased roadmap in `implementation-plan.md` (check off items there as they are completed).

## Documentation

Always use the **context7** MCP server (`resolve-library-id` → `query-docs`) to fetch up-to-date documentation before writing or changing code that uses a library, framework, or CLI — Bun, Express, React, React Router, Vite, Tailwind, Prisma, the Anthropic SDK, SendGrid/Mailgun, etc. Do this even for well-known APIs; training data may be outdated (e.g. Express 5, Tailwind v4, React Router 7 and Prisma all changed setup/APIs in recent majors).

## Stack

- **Runtime / package manager:** Bun (workspaces). Use `bun` / `bunx`, not npm/npx — Node is not installed on this machine.
- **Server (`server/`):** Express 5 + TypeScript, run directly by Bun (no build step for dev). Prisma 7 with PostgreSQL via the `@prisma/adapter-pg` driver adapter. The database URL is set in `server/prisma.config.ts` (not in `schema.prisma`); the client is generated into `server/src/generated/prisma` (gitignored, regenerated on `bun install` and by `bun run db:generate`). Import it from `./generated/prisma/client`, never from `@prisma/client`.
- **Client (`client/`):** React 19 + TypeScript, Vite, Tailwind CSS v4 (`@tailwindcss/vite`), React Router 7 (import from `react-router`).
- **UI components:** shadcn (`client/components.json`, style `base-nova` on Base UI, neutral base color, CSS variables in `src/index.css`, Lucide icons). Add components from `client/` with `bunx --bun shadcn@latest add <name>`; they land in `src/components/ui`. Import via the `@/` alias (`@/components/ui/button`, `cn` from `@/lib/utils`).
- Vite dev server proxies `/api/*` to the Express server on port 3000. All API routes are prefixed with `/api`.

## Commands

Run from the repo root unless noted:

```sh
bun install              # install all workspaces
bun run dev              # client (:5173) + server (:3000) with watch
bun run typecheck        # tsc --noEmit in both workspaces
bun run build            # build both workspaces
bun run test:e2e         # Playwright e2e tests (starts its own servers + test DB)
bun run test:e2e:ui      # same, in Playwright's UI mode

# in server/
bun run db:migrate       # prisma migrate dev
bun run db:generate      # prisma generate
bun run db:studio        # prisma studio
bun run db:seed          # create the admin user from ADMIN_EMAIL / ADMIN_PASSWORD
```

## Auth

Better Auth with email/password and database sessions stored in Postgres via the Prisma adapter. Sessions are cookie-based: the browser sends the session cookie to `/api/*` on the same origin (the Vite proxy in dev), so no tokens are handled in app code.

### Server

- **Config:** `server/src/auth.ts`. `emailAndPassword` is enabled with `disableSignUp: true`, so there is no public registration. `trustedOrigins` comes from `BETTER_AUTH_TRUSTED_ORIGINS` (`BETTER_AUTH_URL` is always trusted). Add any new client origin there, or Better Auth rejects its requests.
- **Mounting:** `app.all("/api/auth/*splat", toNodeHandler(auth))` in `src/app.ts`, **before** `express.json()`, because Better Auth reads the raw body. All sign-in, sign-out and session endpoints live under `/api/auth/*`. Don't write custom login/logout routes.
- **Protecting routes:** add `requireAuth` (`src/middleware/requireAuth.ts`). It calls `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })`, returns `401 { error: "Unauthorized" }` when there's no session, and otherwise sets `req.session` (`{ user, session }`, typed as `Session` from `auth.ts`). `GET /api/me` is the example.
- **Creating users:** sign-up is disabled, so users are created server-side through Better Auth's internal adapter (`(await auth.$context).internalAdapter.createUser` + `linkAccount` with `providerId: "credential"` and a password hashed by `ctx.password.hash`). `src/seed.ts` does this for the admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD`, and re-running it promotes an existing user to admin. Follow the same pattern for the planned admin "create agent" endpoint.

### Roles

- `User.role` is the Prisma `Role` enum (`admin` | `agent`, default `agent`). In server code use `Role` from `./generated/prisma/enums`, not string literals.
- It's a Better Auth additional field with `input: false`, so clients can never set it through auth endpoints. It can only be set server-side.
- Admin-only API routes use `requireAdmin` (`src/middleware/requireAdmin.ts`) **after** `requireAuth`: `app.get("/api/admin/...", requireAuth, requireAdmin, handler)`. It returns `403 { error: "Forbidden" }` unless `req.session.user.role === Role.admin`. The client-side `RequireAdmin` (see Client below) is only for UX; it doesn't protect data.

### Hardening

- `auth.ts` throws at startup unless `BETTER_AUTH_SECRET` is set (at least 32 chars, not Better Auth's public default). This also applies to the seed script.
- Better Auth rate limiting is enabled explicitly (it's otherwise on only when `NODE_ENV=production`), with in-memory storage, which is per process. The sign-in limit is 3 requests per 10 s per IP.
- **Client IP:** Better Auth reads the IP only from headers, so `app.ts` overwrites `x-helpdesk-client-ip` (`CLIENT_IP_HEADER`) with Express's `req.ip` before the auth handler, and Better Auth reads only that header. `req.ip` is the socket address unless `TRUST_PROXY` (Express `trust proxy`: a hop count or proxy IPs/CIDRs; `true` is rejected) is set. Set `TRUST_PROXY` when deploying behind a reverse proxy, or every client gets the proxy's IP.
- `helmet()` sets security headers (CSP, HSTS, `X-Frame-Options`, …) and `x-powered-by` is disabled. Whatever serves `client/dist` in production needs equivalent headers.
- With `NODE_ENV=production`, `auth.ts` requires an `https://` `BETTER_AUTH_URL` and forces `Secure` cookies.
- `app.ts` ends with an error handler that logs the error and returns `500 { error: "Internal Server Error" }`, so stack traces never reach the client. Keep it the last `app.use`.
- `bun run start` sets `NODE_ENV=production`.

### Schema

- The auth models (`User`, `Session`, `Account`, `Verification`) in `schema.prisma` are maintained by hand. Don't run `auth generate --output prisma/schema.prisma`: it would overwrite the `Role` enum with `String`.
- Prisma 7's `migrate dev` doesn't regenerate the client, so run `db:generate` after migrating.

### Client

- **Auth client:** `client/src/lib/auth-client.ts` creates it with `createAuthClient` from `better-auth/react`. It has no `baseURL`, so requests go to this origin's `/api/auth`. It exports `useSession`, `signIn` and `signOut`, so import those rather than calling `authClient` directly.
- **Role type:** the client mirrors the server's `role` field by hand with `inferAdditionalFields({ user: { role: { type: ["admin", "agent"], required: true, input: false } } })`, so it doesn't type-check against server sources. If you change `Role` or add user fields, update this too.
- **Route protection:** `RequireAuth` (`src/components/RequireAuth.tsx`) is a layout route in `App.tsx`. It shows a loading state while `useSession` is pending, redirects to `/login` when there's no session, and otherwise renders `NavBar` and the child route. Put new authenticated routes inside `<Route element={<RequireAuth />}>`.
- **Admin routes:** `RequireAdmin` (`src/components/RequireAdmin.tsx`) is a layout route nested inside `RequireAuth`. The session is already loaded there. It redirects to `/` unless `session.user.role === "admin"`. Put admin-only pages inside `<Route element={<RequireAdmin />}>`. `/users` (`UsersPage`) is the example.
- **Admin nav links:** `RequireAuth` passes `isAdmin` to `NavBar`, which renders admin-only links (currently "Users") only when it's true. Add new admin links there.
- **Login:** `LoginPage` calls `signIn.email({ email, password })`. On error it sets `root.server`; on success it navigates to `/`. A user who is already signed in is redirected from `/login` to `/`.
- **Logout:** `NavBar` calls `signOut()` and then navigates to `/login`.
- `useSession` is reactive, so components re-render after sign-in and sign-out without manual refetching.

## E2E tests (Playwright)

- The `e2e/` workspace holds `playwright.config.ts`, `test-env.ts` (ports, test DB URL, server env, seeded admin credentials) and specs in `e2e/tests/`. Chromium only. Install the browser once with `bunx playwright install chromium` from `e2e/`.
- Each run starts its **own** servers, so it can run alongside `bun run dev`: Express on **:3100** and Vite on **:5174**. Vite's `/api` proxy target comes from `API_PROXY_TARGET` (default `http://localhost:3000`). `reuseExistingServer` is off so the DB is always reset.
- **Test database:** `helpdesk_test` on the same Postgres (override with `TEST_DATABASE_URL`; the name must end in `_test`). Before the server starts, `e2e/scripts/reset-test-db.ts` runs `prisma migrate deploy` (which creates the DB if it's missing), truncates every table except `_prisma_migrations`, and seeds the admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `test-env.ts`. It doesn't use `migrate reset`, because Prisma blocks that command when it runs under an AI agent.
- Playwright starts `webServer` **before** `globalSetup`, and `/api/health` needs the DB. That's why the reset is chained into the server's `webServer` command and isn't in global setup.
- The test server runs with `NODE_ENV=test` and `DISABLE_RATE_LIMIT=true`. `auth.ts` throws if `DISABLE_RATE_LIMIT` is set under any other `NODE_ENV`.
- `workers: 1`: all tests share one database.

## Layout

```
client/src/        React app (main.tsx, App.tsx, index.css — Tailwind + shadcn theme)
client/src/pages/  route components (LoginPage, HomePage, UsersPage)
client/src/components/     app components (NavBar, RequireAuth, RequireAdmin)
client/src/components/ui/  shadcn components (generated by the CLI; edit only to customize)
client/src/lib/    auth-client.ts (Better Auth client), utils.ts (cn)
server/src/        index.ts (listen), app.ts (Express app + routes), db.ts (Prisma client)
server/prisma/     schema.prisma (models + migrations)
server/prisma.config.ts  Prisma CLI config (schema path, migrations path, DATABASE_URL)
e2e/               Playwright config, test env, DB reset script, tests/
```

## Environment

- `server/.env` (gitignored; template in `server/.env.example`) holds `PORT`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS` (comma-separated client origins, e.g. `http://localhost:5173`), and the seed's `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Bun and Prisma load it automatically.
- Local PostgreSQL 17 runs as the Windows service `postgresql-17` (binaries in `%LOCALAPPDATA%\Programs\PostgreSQL17\pgsql\bin`, not on PATH). Dev credentials: user `helpdesk`, password `helpdesk`, database `helpdesk`.
- `docker-compose.yml` defines an alternative Postgres on the same port 5432 — don't run both at once.
- Bun lives at `%USERPROFILE%\.bun\bin`; prepend it to PATH in a shell if `bun` is not found.

## Conventions

- TypeScript strict mode with `verbatimModuleSyntax` — use `import type` for type-only imports.
- Build UI from shadcn components and theme tokens (`bg-muted`, `text-muted-foreground`, `text-destructive`, …) rather than raw Tailwind colors like `gray-*` / `blue-*`. `NavBar`, `RequireAuth` and `HomePage` still use the old raw-color styling and should be migrated.
- Forms: React Hook Form + Zod (`zodResolver`), laid out with shadcn `Field` / `FieldLabel` / `FieldError` (`errors={[errors.x]}`), with `data-invalid` on `Field` and `aria-invalid` on the input. Show server errors via `setError("root.server", …)` in a destructive `Alert`. `LoginPage` is the reference.
- Verify changes with `bun run typecheck` before considering work done.
