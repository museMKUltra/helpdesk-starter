# helpdesk-starter

AI-powered ticket management system. See `project-scope.md`, `tech-stack.md` and `implementation-plan.md`.

## Setup

Requires [Bun](https://bun.sh) and Docker.

```sh
bun install                           # also generates the Prisma client
cp server/.env.example server/.env
bun run db:up                         # start PostgreSQL
bun run dev                           # client on :5173, server on :3000
```
