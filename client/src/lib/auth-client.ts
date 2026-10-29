import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

// No baseURL: requests go to this origin's /api/auth, which Vite proxies to the server.
export const authClient = createAuthClient({
  plugins: [
    // Mirrors the server's `role` additional field (server/src/auth.ts). Declared by hand so the
    // client doesn't type-check against server sources or the generated Prisma client.
    inferAdditionalFields({
      user: {
        role: { type: ["admin", "agent"], required: true, input: false },
      },
    }),
  ],
});

export const { useSession, signIn, signOut } = authClient;
