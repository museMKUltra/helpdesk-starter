import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";
import { Role } from "./generated/prisma/enums";

// Better Auth silently falls back to a public default secret outside production,
// so require a real one at startup in every environment.
const KNOWN_DEFAULT_SECRET = "better-auth-secret-12345678901234567890";
const secret = process.env.BETTER_AUTH_SECRET?.trim();
if (!secret || secret === KNOWN_DEFAULT_SECRET || secret.length < 32) {
  throw new Error(
    "BETTER_AUTH_SECRET must be set to a random value of at least 32 characters (see server/.env.example)",
  );
}

// Cookies get the Secure flag only when BETTER_AUTH_URL is https, so refuse a plain-http URL in production.
const isProduction = process.env.NODE_ENV === "production";
if (isProduction && !process.env.BETTER_AUTH_URL?.startsWith("https://")) {
  throw new Error("BETTER_AUTH_URL must be an https:// URL in production");
}

// The e2e suite (NODE_ENV=test) signs in more often than the sign-in limit allows from one IP.
const disableRateLimit = process.env.DISABLE_RATE_LIMIT === "true";
if (disableRateLimit && process.env.NODE_ENV !== "test") {
  throw new Error("DISABLE_RATE_LIMIT is only allowed with NODE_ENV=test");
}

// Set by app.ts from Express's req.ip, after removing any client-supplied value.
// Better Auth reads the client IP (rate limiting, session ipAddress) only from headers.
export const CLIENT_IP_HEADER = "x-helpdesk-client-ip";

export const auth = betterAuth({
  secret,
  advanced: {
    ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    useSecureCookies: isProduction,
  },
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // On by default only when NODE_ENV=production, which Bun doesn't set, so enable it explicitly.
  // Sign-in uses Better Auth's built-in stricter rule (3 requests / 10 s per IP).
  // In-memory storage is per process: switch to "database" (needs a RateLimit model) when running multiple instances.
  rateLimit: {
    enabled: !disableRateLimit,
    storage: "memory",
  },
  emailAndPassword: {
    enabled: true,
    // Users are created by an admin (or the seed script), never self-registered.
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      role: {
        type: Object.values(Role),
        required: true,
        defaultValue: Role.agent,
        input: false, // set server-side only, never from API input
      },
    },
  },
  // Comma-separated client origins (e.g. the Vite dev server). BETTER_AUTH_URL is always trusted.
  trustedOrigins: (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
});

export type Session = typeof auth.$Infer.Session;
