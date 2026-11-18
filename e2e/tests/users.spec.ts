// Admin-only user list: GET /api/admin/users and the /users page (client/src/pages/UsersPage.tsx).
// Basic /users route protection (signed out -> /login) is in auth-roles.spec.ts.
import type { Page } from "@playwright/test";
import { CLIENT_URL } from "../test-env";
import { ADMIN, createUser, expect, signInViaApi, test } from "./fixtures";

type ApiUser = { id: string; name: string; email: string; role: string; createdAt: string };

const USER_FIELDS = ["createdAt", "email", "id", "name", "role"];

/** The table row on /users for a given email. */
function userRow(page: Page, email: string) {
  return page.getByRole("row").filter({ has: page.getByRole("cell", { name: email, exact: true }) });
}

test.describe("GET /api/admin/users", () => {
  test("is 401 without a session", async ({ request }) => {
    const res = await request.get("/api/admin/users");
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  test("is 403 for an agent and returns no user data", async ({ request, agent }) => {
    await signInViaApi(request, agent.email, agent.password);
    const res = await request.get("/api/admin/users");
    expect(res.status()).toBe(403);

    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "Forbidden" });
    expect(text).not.toContain(ADMIN.email);
    expect(text).not.toContain(agent.email);
  });

  test("returns every user with exactly id, name, email, role and createdAt", async ({ request, agent }) => {
    await signInViaApi(request, ADMIN.email, ADMIN.password);
    const res = await request.get("/api/admin/users");
    expect(res.status()).toBe(200);

    const body = (await res.json()) as { users: ApiUser[] };
    expect(Object.keys(body)).toEqual(["users"]);
    expect(body.users.length).toBeGreaterThanOrEqual(2);
    for (const user of body.users) {
      expect(Object.keys(user).sort(), `fields of ${user.email}`).toEqual(USER_FIELDS);
      expect(Number.isNaN(Date.parse(user.createdAt)), `createdAt of ${user.email}`).toBe(false);
    }

    expect(body.users).toContainEqual(expect.objectContaining({ email: ADMIN.email, name: ADMIN.name, role: "admin" }));
    expect(body.users).toContainEqual(
      expect.objectContaining({ id: agent.id, email: agent.email, name: agent.name, role: "agent" }),
    );
  });

  test("never includes password hashes, sessions or accounts", async ({ request }) => {
    await signInViaApi(request, ADMIN.email, ADMIN.password);
    const text = await (await request.get("/api/admin/users")).text();

    for (const leaked of ["password", "token", "session", "account", "emailVerified", "updatedAt"]) {
      expect(text, `response mentions "${leaked}"`).not.toContain(leaked);
    }
    // Better Auth's scrypt hashes look like "<hex salt>:<hex key>".
    expect(text).not.toMatch(/[0-9a-f]{32}:[0-9a-f]{64,}/);
  });

  test("is ordered by createdAt, oldest first", async ({ request }) => {
    const newest = createUser({ role: "agent" });
    await signInViaApi(request, ADMIN.email, ADMIN.password);
    const { users } = (await (await request.get("/api/admin/users")).json()) as { users: ApiUser[] };

    const times = users.map((u) => Date.parse(u.createdAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    // The seeded admin is created before any test runs; the user just created is the newest.
    expect(users[0]?.email).toBe(ADMIN.email);
    expect(users.at(-1)?.email).toBe(newest.email);
  });
});

test.describe("/users as admin", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaApi(page, ADMIN.email, ADMIN.password);
  });

  test("the Users nav link opens the user list", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation").getByRole("link", { name: "Users" }).click();

    await expect(page).toHaveURL(`${CLIENT_URL}/users`);
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("the table has Name, Email, Role and Created columns", async ({ page }) => {
    await page.goto("/users");
    await expect(page.getByRole("columnheader")).toHaveText(["Name", "Email", "Role", "Created"]);
  });

  test("lists the seeded admin with role admin", async ({ page }) => {
    await page.goto("/users");
    const row = userRow(page, ADMIN.email);
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("cell")).toHaveText([ADMIN.name, ADMIN.email, "admin", /\S/]);
  });

  test("lists a newly created agent with role agent and its creation date", async ({ page }) => {
    const agent = createUser({ role: "agent" });
    await page.goto("/users");

    const row = userRow(page, agent.email);
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("cell").nth(0)).toHaveText(agent.name);
    await expect(row.getByRole("cell").nth(2)).toHaveText("agent");

    // Created is rendered with the browser's toLocaleDateString(), so compute the expected text there.
    const { users } = (await (await page.request.get("/api/admin/users")).json()) as { users: ApiUser[] };
    const createdAt = users.find((u) => u.email === agent.email)?.createdAt;
    expect(createdAt).toBeDefined();
    const expectedDate = await page.evaluate((iso) => new Date(iso).toLocaleDateString(), createdAt!);
    await expect(row.getByRole("cell").nth(3)).toHaveText(expectedDate);
  });

  test("shows a loading state until the users arrive", async ({ page }) => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/admin/users", async (route) => {
      await released;
      await route.continue();
    });

    await page.goto("/users");
    await expect(page.getByText("Loading users…")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);

    release();
    await expect(userRow(page, ADMIN.email)).toBeVisible();
    await expect(page.getByText("Loading users…")).toHaveCount(0);
  });

  test("shows 'No users found' for an empty list", async ({ page }) => {
    await page.route("**/api/admin/users", (route) => route.fulfill({ json: { users: [] } }));
    await page.goto("/users");

    await expect(page.getByText("No users found")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });

  test("shows an error alert when the request fails", async ({ page }) => {
    await page.route("**/api/admin/users", (route) =>
      route.fulfill({ status: 500, json: { error: "Internal Server Error" } }),
    );
    await page.goto("/users");

    await expect(page.getByRole("alert")).toHaveText("Couldn't load users");
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByText("Loading users…")).toHaveCount(0);
  });
});

test.describe("/users as agent", () => {
  test("an agent has no Users link, is redirected from /users and never sees the list", async ({ page, agent }) => {
    const adminUsersRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/admin/users")) adminUsersRequests.push(req.url());
    });
    await signInViaApi(page, agent.email, agent.password);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("navigation").getByRole("link", { name: "Users" })).toHaveCount(0);

    await page.goto("/users");
    await expect(page).toHaveURL(`${CLIENT_URL}/`);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByText(ADMIN.email)).toHaveCount(0);
    // RequireAdmin redirects before UsersPage mounts, so the admin API isn't even called.
    expect(adminUsersRequests).toEqual([]);
  });
});
