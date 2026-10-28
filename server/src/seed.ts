import { auth } from "./auth";
import { prisma } from "./db";
import { Role } from "./generated/prisma/enums";

// Creates the initial admin user. Public sign-up is disabled, so this uses
// Better Auth's internal adapter the same way its sign-up route does.
const email = process.env.ADMIN_EMAIL?.toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) {
  throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set");
}

const ctx = await auth.$context;

const existing = await ctx.internalAdapter.findUserByEmail(email);
if (existing) {
  await ctx.internalAdapter.updateUser(existing.user.id, { role: Role.admin });
  console.log(`Admin ${email} already exists`);
} else {
  const user = await ctx.internalAdapter.createUser(
    { email, name: "Admin", emailVerified: true, role: Role.admin },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(password),
  });
  console.log(`Created admin ${email}`);
}

await prisma.$disconnect();
