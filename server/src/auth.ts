import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";
import { Role } from "./generated/prisma/enums";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
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
  trustedOrigins: ["http://localhost:5173"],
});

export type Session = typeof auth.$Infer.Session;
