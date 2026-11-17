// Route protection and roles in the UI, plus GET /api/me for each role.
import { CLIENT_URL } from "../test-env";
import { ADMIN, expect, SESSION_COOKIE, signInViaApi, test } from "./fixtures";

test.describe("signed-out route protection", () => {
  for (const path of ["/", "/users"]) {
    test(`${path} redirects to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByText("Sign in to Helpdesk")).toBeVisible();
      await expect(page.getByRole("navigation")).toHaveCount(0);
    });
  }

  test("an unknown route shows no protected content", async ({ page }) => {
    // App.tsx has no catch-all route, so this renders an empty page (no 404, no redirect).
    await page.goto("/does-not-exist");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toHaveCount(0);
  });
});

test.describe("agent role", () => {
  test("an agent sees their name and no Users link", async ({ page, agent }) => {
    await signInViaApi(page, agent.email, agent.password);
    await page.goto("/");

    const nav = page.getByRole("navigation");
    await expect(nav.getByText(agent.name, { exact: true })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Users" })).toHaveCount(0);
  });

  test("an agent opening /users is redirected to /", async ({ page, agent }) => {
    await signInViaApi(page, agent.email, agent.password);
    await page.goto("/users");

    await expect(page).toHaveURL(`${CLIENT_URL}/`);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Users" })).toHaveCount(0);
  });
});

test.describe("admin role", () => {
  test("an admin sees the Users link and can open /users directly", async ({ page }) => {
    await signInViaApi(page, ADMIN.email, ADMIN.password);
    await page.goto("/");
    await expect(page.getByRole("navigation").getByRole("link", { name: "Users" })).toBeVisible();

    await page.goto("/users");
    await expect(page).toHaveURL(`${CLIENT_URL}/users`);
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  });
});

test.describe("GET /api/me", () => {
  test("is 401 without a session", async ({ request }) => {
    const res = await request.get("/api/me");
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  test("is 401 with a forged or tampered session cookie", async ({ playwright, agent }) => {
    const signedIn = await playwright.request.newContext({ baseURL: CLIENT_URL });
    try {
      await signInViaApi(signedIn, agent.email, agent.password);
      const { cookies } = await signedIn.storageState();
      const real = cookies.find((c) => c.name === SESSION_COOKIE);
      expect(real).toBeDefined();
      const [token] = decodeURIComponent(real!.value).split(".");

      for (const value of ["garbage", `${token}.not-the-signature`, token!]) {
        const forged = await playwright.request.newContext({
          baseURL: CLIENT_URL,
          extraHTTPHeaders: { Cookie: `${SESSION_COOKIE}=${encodeURIComponent(value)}` },
        });
        try {
          expect((await forged.get("/api/me")).status(), `cookie value "${value}"`).toBe(401);
        } finally {
          await forged.dispose();
        }
      }
    } finally {
      await signedIn.dispose();
    }
  });

  test("returns the admin with role admin", async ({ request }) => {
    await signInViaApi(request, ADMIN.email, ADMIN.password);
    const res = await request.get("/api/me");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({ email: ADMIN.email, name: ADMIN.name, role: "admin" });
    expect(body.session.userId).toBe(body.user.id);
  });

  test("returns an agent with role agent", async ({ request, agent }) => {
    await signInViaApi(request, agent.email, agent.password);
    const res = await request.get("/api/me");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({ id: agent.id, email: agent.email, name: agent.name, role: "agent" });
    expect(body.user).not.toHaveProperty("password");
  });

  test("never exposes the session token", async ({ playwright, agent }) => {
    const ctx = await playwright.request.newContext({ baseURL: CLIENT_URL });
    try {
      await signInViaApi(ctx, agent.email, agent.password);
      const { cookies } = await ctx.storageState();
      const cookie = cookies.find((c) => c.name === SESSION_COOKIE);
      expect(cookie).toBeDefined();
      const rawValue = decodeURIComponent(cookie!.value);
      const [token] = rawValue.split(".");
      expect(token, "session token in the cookie").toBeTruthy();

      const res = await ctx.get("/api/me");
      expect(res.status()).toBe(200);
      const text = await res.text();
      const body = JSON.parse(text);

      expect(body.session).not.toHaveProperty("token");
      expect(body.session.userId).toBe(agent.id);
      expect(body.session).toHaveProperty("id");
      expect(Number.isNaN(Date.parse(body.session.expiresAt))).toBe(false);
      expect(Date.parse(body.session.expiresAt)).toBeGreaterThan(Date.now());

      expect(text).not.toContain(token!);
      expect(text).not.toContain(rawValue);
    } finally {
      await ctx.dispose();
    }
  });
});
