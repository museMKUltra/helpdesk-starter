// Creates a user with a credential (email/password) account in the e2e test database.
// Public sign-up is disabled, so this uses Better Auth's internal adapter like server/src/seed.ts.
//
// Usage (run with cwd = server/ and env = serverEnv from test-env.ts, see tests/fixtures.ts):
//   bun ../e2e/scripts/create-user.ts <email> <password> <admin|agent> [name]
// Prints the created user as JSON on the last line of stdout.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DATABASE_URL } from "../test-env";

const [email, password, role, name = "E2E User"] = process.argv.slice(2);
if (!email || !password || (role !== "admin" && role !== "agent")) {
  throw new Error("Usage: create-user.ts <email> <password> <admin|agent> [name]");
}

// Same guard as reset-test-db.ts: never write to anything but a *_test database.
const dbName = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
if (!dbName.endsWith("_test") || process.env.DATABASE_URL !== DATABASE_URL) {
  throw new Error(`Refusing to create users in "${dbName}": run with serverEnv from test-env.ts`);
}

// Imported dynamically so the e2e typecheck doesn't pull in server sources.
const serverSrc = path.join(import.meta.dirname, "..", "..", "server", "src");
const { auth } = await import(pathToFileURL(path.join(serverSrc, "auth.ts")).href);
const { prisma } = await import(pathToFileURL(path.join(serverSrc, "db.ts")).href);

try {
  const ctx = await auth.$context;
  const normalizedEmail = email.toLowerCase();
  if (await ctx.internalAdapter.findUserByEmail(normalizedEmail)) {
    throw new Error(`User ${normalizedEmail} already exists`);
  }
  const user = await ctx.internalAdapter.createUser(
    { email: normalizedEmail, name, emailVerified: true, role },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(password),
  });
  console.log(JSON.stringify({ id: user.id, email: user.email, name: user.name, role: user.role }));
} finally {
  await prisma.$disconnect();
}
