// Prepares the e2e test database: applies migrations (creating the database if needed),
// empties every table and seeds the admin user.
// Run by the Playwright server webServer command before the server starts (see playwright.config.ts).
import { execFileSync } from "node:child_process";
import path from "node:path";
import { DATABASE_URL, serverEnv } from "../test-env";

const dbName = new URL(DATABASE_URL).pathname.slice(1);
if (!dbName.endsWith("_test")) {
  throw new Error(`Refusing to reset "${dbName}": the e2e database name must end in "_test"`);
}

const serverDir = path.join(import.meta.dirname, "..", "..", "server");
const run = (args: string[], input?: string) =>
  execFileSync("bun", args, {
    cwd: serverDir,
    env: { ...process.env, ...serverEnv },
    input,
    stdio: [input === undefined ? "inherit" : "pipe", "inherit", "inherit"],
  });

// Empties all tables in the current schema except Prisma's migration history.
const TRUNCATE_ALL = `
DO $$
DECLARE tables text;
BEGIN
  SELECT string_agg(format('%I', tablename), ', ') INTO tables
  FROM pg_tables
  WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations';
  IF tables IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || tables || ' RESTART IDENTITY CASCADE';
  END IF;
END $$;
`;

run(["x", "--bun", "prisma", "migrate", "deploy"]);
run(["x", "--bun", "prisma", "db", "execute", "--stdin"], TRUNCATE_ALL);
run(["src/seed.ts"]);
