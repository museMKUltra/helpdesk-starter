// Smoke test for the e2e setup itself: test servers, Vite proxy, test database, auth cookies.
import { expect, test, type Page } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, CLIENT_URL } from "../test-env";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("smoke", () => {
  test("redirects signed-out users to the login page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Sign in to Helpdesk")).toBeVisible();
  });

  test("shows an error for a wrong password", async ({ page }) => {
    await signIn(page, ADMIN_EMAIL, "wrong-password");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("admin can sign in, open Users and sign out", async ({ page }) => {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await expect(page).toHaveURL(`${CLIENT_URL}/`);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    // Fetched through the Vite proxy from the test server, which queries the test database.
    await expect(page.getByText("API: ok · DB: connected")).toBeVisible();
    await expect(page.getByText("Admin", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Users" }).click();
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("sign-in is not rate limited outside production", async ({ request }) => {
    // Rate limiting is on only with NODE_ENV=production; there the 4th sign-in in 10 s would get a 429.
    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await request.post("/api/auth/sign-in/email", {
        headers: { Origin: CLIENT_URL },
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
      expect(res.status(), `sign-in attempt ${attempt}`).toBe(200);
    }
  });
});
