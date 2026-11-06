// Settings shared by the Playwright config and the test-database reset script.
// The e2e servers use their own ports and database, so they can run alongside `bun run dev`.

export const SERVER_PORT = 3100;
export const CLIENT_PORT = 5174;

export const SERVER_URL = `http://localhost:${SERVER_PORT}`;
export const CLIENT_URL = `http://localhost:${CLIENT_PORT}`;

// Override with TEST_DATABASE_URL (e.g. in CI). The reset script refuses any database whose name doesn't end in "_test".
export const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://helpdesk:helpdesk@localhost:5432/helpdesk_test?schema=public";

// Seeded by the reset script before the server starts.
export const ADMIN_EMAIL = "admin@example.com";
export const ADMIN_PASSWORD = "e2e-admin-password";

// Environment for the server and for the Prisma / seed commands run against the test database.
// These override anything in server/.env.
export const serverEnv: Record<string, string> = {
  NODE_ENV: "test",
  PORT: String(SERVER_PORT),
  DATABASE_URL,
  BETTER_AUTH_SECRET: "e2e-only-secret-do-not-use-anywhere-else-0123456789",
  BETTER_AUTH_URL: SERVER_URL,
  BETTER_AUTH_TRUSTED_ORIGINS: CLIENT_URL,
  // Tests sign in far more often than the 3-per-10s sign-in limit allows from one IP.
  DISABLE_RATE_LIMIT: "true",
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
};
