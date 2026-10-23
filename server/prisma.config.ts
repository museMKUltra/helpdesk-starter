import path from "node:path";
import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Bun loads .env automatically, but tools that load this file with Node
// (e.g. the IDE's Prisma plugin via tsx) don't.
config({ path: path.join(import.meta.dirname, ".env"), quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
