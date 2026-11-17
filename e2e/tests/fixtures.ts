// Shared helpers and fixtures for e2e specs.
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  test as base,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, CLIENT_URL, serverEnv } from "../test-env";

export { expect };

export type Role = "admin" | "agent";

export type TestUser = {
  id: string;
  email: string;
  password: string;
  name: string;
  role: Role;
};

/** The admin seeded by e2e/scripts/reset-test-db.ts (server/src/seed.ts names it "Admin"). */
export const ADMIN = { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, name: "Admin" } as const;

// Better Auth's session cookie name over plain http (production adds the __Secure- prefix).
export const SESSION_COOKIE = "better-auth.session_token";

/** Headers for Better Auth POST endpoints: the test client origin is in trustedOrigins. */
export const AUTH_HEADERS = { Origin: CLIENT_URL } as const;

const serverDir = path.join(import.meta.dirname, "..", "..", "server");

/** Unique email so tests never collide in the shared test database. */
export function uniqueEmail(prefix = "user"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** Creates a user in helpdesk_test via e2e/scripts/create-user.ts (Better Auth internal adapter). */
export function createUser(options: { role: Role; email?: string; password?: string; name?: string }): TestUser {
  const email = options.email ?? uniqueEmail(options.role);
  const password = options.password ?? `pw-${Math.random().toString(36).slice(2)}-e2e`;
  const name = options.name ?? `E2E ${options.role} ${Math.random().toString(36).slice(2, 6)}`;
  const stdout = execFileSync("bun", ["../e2e/scripts/create-user.ts", email, password, options.role, name], {
    cwd: serverDir,
    env: { ...process.env, ...serverEnv },
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf8",
  });
  const lastLine = stdout.trim().split(/\r?\n/).pop() ?? "";
  const created = JSON.parse(lastLine) as { id: string; email: string; name: string; role: Role };
  return { ...created, password };
}

/** Fills in and submits the login form. */
export async function signInViaForm(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs in through the API; cookies land in the page's (or request context's) cookie jar. */
export async function signInViaApi(target: Page | APIRequestContext, email: string, password: string) {
  const request = "request" in target ? target.request : target;
  const res = await request.post("/api/auth/sign-in/email", {
    headers: AUTH_HEADERS,
    data: { email, password },
  });
  expect(res.status(), `API sign-in as ${email}`).toBe(200);
  return res;
}

/** The Better Auth session cookie in a browser context, if any. */
export async function getSessionCookie(context: BrowserContext) {
  return (await context.cookies()).find((cookie) => cookie.name === SESSION_COOKIE);
}

/** The server's login error alert (FieldError also has role="alert", so match the text). */
export function serverErrorAlert(page: Page) {
  return page.getByRole("alert").filter({ hasText: "Invalid email or password" });
}

type Fixtures = {
  /** A freshly created agent with a unique email. */
  agent: TestUser;
};

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  agent: async ({}, use) => {
    await use(createUser({ role: "agent" }));
  },
});
