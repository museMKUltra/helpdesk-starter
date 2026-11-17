// Session lifetime: persistence, cookie attributes, sign-out (client and server side), multiple tabs.
import { CLIENT_URL } from "../test-env";
import { ADMIN, expect, getSessionCookie, SESSION_COOKIE, signInViaApi, test } from "./fixtures";

test.describe("session persistence", () => {
  test("the session survives a reload and a new page in the same context", async ({ page, context, agent }) => {
    await signInViaApi(page, agent.email, agent.password);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(`${CLIENT_URL}/`);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    const second = await context.newPage();
    await second.goto("/");
    await expect(second).toHaveURL(`${CLIENT_URL}/`);
    await expect(second.getByRole("navigation").getByText(agent.name, { exact: true })).toBeVisible();
  });

  test("a fresh browser context is signed out", async ({ page, browser, agent }) => {
    await signInViaApi(page, agent.email, agent.password);

    const fresh = await browser.newContext({ baseURL: CLIENT_URL });
    try {
      const other = await fresh.newPage();
      await other.goto("/");
      await expect(other).toHaveURL(/\/login$/);
      expect(await getSessionCookie(fresh)).toBeUndefined();
    } finally {
      await fresh.close();
    }
  });
});

test.describe("session cookie", () => {
  test("is HttpOnly, SameSite=Lax and scoped to the whole site", async ({ page, context, agent }) => {
    const res = await signInViaApi(page, agent.email, agent.password);

    // Raw Set-Cookie, so we know the attributes are really sent (not browser defaults).
    const setCookie = res
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value)
      .find((value) => value.startsWith(`${SESSION_COOKIE}=`));
    expect(setCookie, "session Set-Cookie header").toBeDefined();
    expect(setCookie).toMatch(/;\s*HttpOnly/i);
    expect(setCookie).toMatch(/;\s*SameSite=Lax/i);
    expect(setCookie).toMatch(/;\s*Path=\//i);

    const cookie = await getSessionCookie(context);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
    // Plain http in the test env; production forces Secure (useSecureCookies in server/src/auth.ts).
    expect(cookie?.secure).toBe(false);
  });

  test("is not readable from page JavaScript", async ({ page, agent }) => {
    await signInViaApi(page, agent.email, agent.password);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    expect(await page.evaluate(() => document.cookie)).not.toContain(SESSION_COOKIE);
  });
});

test.describe("sign-out", () => {
  test("after signing out, / and /users redirect to /login", async ({ page }) => {
    await signInViaApi(page, ADMIN.email, ADMIN.password);
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/users");
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Sign in to Helpdesk")).toBeVisible();
  });

  test("browser back after sign-out doesn't show protected content", async ({ page }) => {
    await signInViaApi(page, ADMIN.email, ADMIN.password);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await page.getByRole("link", { name: "Users" }).click();
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Sign in to Helpdesk")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  });

  test("signing out removes the session cookie and invalidates it on the server", async ({
    page,
    context,
    playwright,
    agent,
  }) => {
    await signInViaApi(page, agent.email, agent.password);
    const cookie = await getSessionCookie(context);
    expect(cookie, "session cookie after sign-in").toBeDefined();

    // Replays the captured cookie from a separate client, like a stolen or copied cookie would be.
    const replay = await playwright.request.newContext({
      baseURL: CLIENT_URL,
      extraHTTPHeaders: { Cookie: `${SESSION_COOKIE}=${cookie!.value}` },
    });
    try {
      expect((await replay.get("/api/me")).status(), "old cookie before sign-out").toBe(200);

      await page.goto("/");
      await page.getByRole("button", { name: "Sign out" }).click();
      await expect(page).toHaveURL(/\/login$/);
      expect(await getSessionCookie(context)).toBeUndefined();

      const me = await replay.get("/api/me");
      expect(me.status(), "old cookie after sign-out").toBe(401);
      expect(await me.json()).toEqual({ error: "Unauthorized" });
    } finally {
      await replay.dispose();
    }
  });

  test("after signing out in one tab, another tab goes to /login on reload", async ({ page, context, agent }) => {
    await signInViaApi(page, agent.email, agent.password);
    await page.goto("/");
    const otherTab = await context.newPage();
    await otherTab.goto("/");
    await expect(otherTab.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await otherTab.reload();
    await expect(otherTab).toHaveURL(/\/login$/);
    await expect(otherTab.getByText("Sign in to Helpdesk")).toBeVisible();
  });
});
