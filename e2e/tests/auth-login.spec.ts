// Login form: client-side validation, server errors, email normalisation and successful sign-in.
// (The wrong-password alert for the admin and the admin sign-in round trip are in smoke.spec.ts.)
import type { Page } from "@playwright/test";
import { CLIENT_URL } from "../test-env";
import { ADMIN, expect, serverErrorAlert, signInViaApi, signInViaForm, test } from "./fixtures";

/** Records every sign-in request the page sends, to prove client-side validation blocks submission. */
function trackSignInRequests(page: Page) {
  const urls: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/auth/sign-in/")) urls.push(req.url());
  });
  return urls;
}

test.describe("login form validation", () => {
  test("an empty submit shows both field errors and marks both inputs invalid", async ({ page }) => {
    const signInRequests = trackSignInRequests(page);
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await expect(page.getByText("Enter your password")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Password")).toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL(/\/login$/);
    expect(signInRequests).toEqual([]);
  });

  test("an invalid email format shows only the email error", async ({ page }) => {
    const signInRequests = trackSignInRequests(page);
    await signInViaForm(page, "not-an-email", "some-password");

    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Enter your password")).toBeHidden();
    await expect(page.getByLabel("Password")).toHaveAttribute("aria-invalid", "false");
    expect(signInRequests).toEqual([]);
  });

  test("an empty password shows only the password error", async ({ page }) => {
    const signInRequests = trackSignInRequests(page);
    await signInViaForm(page, ADMIN.email, "");

    await expect(page.getByText("Enter your password")).toBeVisible();
    await expect(page.getByLabel("Password")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Enter a valid email address")).toBeHidden();
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "false");
    expect(signInRequests).toEqual([]);
  });

  test("fixing the fields clears their errors", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();

    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password").fill("x");

    await expect(page.getByText("Enter a valid email address")).toBeHidden();
    await expect(page.getByText("Enter your password")).toBeHidden();
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "false");
  });
});

test.describe("login server errors", () => {
  test("a wrong password and an unknown email show the same generic error", async ({ page, agent }) => {
    // Same message for both, so the form doesn't reveal which accounts exist.
    await signInViaForm(page, agent.email, "wrong-password");
    await expect(serverErrorAlert(page)).toHaveText("Invalid email or password");
    await expect(page).toHaveURL(/\/login$/);

    await signInViaForm(page, `nobody-${Date.now()}@example.com`, "wrong-password");
    await expect(serverErrorAlert(page)).toHaveText("Invalid email or password");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  });

  test("the error alert is shown again on a retry and the form stays usable", async ({ page, agent }) => {
    await signInViaForm(page, agent.email, "wrong-password");
    await expect(serverErrorAlert(page)).toBeVisible();

    await page.getByLabel("Password").fill(agent.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(`${CLIENT_URL}/`);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });
});

test.describe("login success", () => {
  test("an agent signs in through the form and lands on the dashboard", async ({ page, agent }) => {
    await signInViaForm(page, agent.email, agent.password);

    await expect(page).toHaveURL(`${CLIENT_URL}/`);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("navigation").getByText(agent.name, { exact: true })).toBeVisible();
  });

  test("the email is case-insensitive and surrounding whitespace is ignored", async ({ page }) => {
    // The type="email" input strips the whitespace; Better Auth lowercases the email on sign-in.
    await signInViaForm(page, `  ${ADMIN.email.toUpperCase()}  `, ADMIN.password);

    await expect(page).toHaveURL(`${CLIENT_URL}/`);
    await expect(page.getByRole("navigation").getByText(ADMIN.name, { exact: true })).toBeVisible();
  });

  test("the password is case-sensitive", async ({ page }) => {
    await signInViaForm(page, ADMIN.email, ADMIN.password.toUpperCase());
    await expect(serverErrorAlert(page)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("the button shows a disabled 'Signing in…' state while the request is pending", async ({ page, agent }) => {
    // Hold the sign-in request until the pending state has been checked, so there's no race.
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/auth/sign-in/email", async (route) => {
      await released;
      await route.continue();
    });

    await signInViaForm(page, agent.email, agent.password);
    const pending = page.getByRole("button", { name: "Signing in…" });
    await expect(pending).toBeVisible();
    await expect(pending).toBeDisabled();

    release();
    await expect(page).toHaveURL(`${CLIENT_URL}/`);
  });

  test("a signed-in user visiting /login is redirected to /", async ({ page, agent }) => {
    await signInViaApi(page, agent.email, agent.password);
    await page.goto("/login");

    await expect(page).toHaveURL(`${CLIENT_URL}/`);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveCount(0);
  });
});
