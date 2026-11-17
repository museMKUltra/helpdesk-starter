// Server-side auth hardening, exercised through the API (Vite proxy -> test server).
// Production rate limiting can't be tested here: it's enabled only with NODE_ENV=production
// (server/src/auth.ts) and the e2e server runs with NODE_ENV=test (see smoke.spec.ts).
import { CLIENT_URL } from "../test-env";
import { ADMIN, AUTH_HEADERS, expect, signInViaApi, test, uniqueEmail } from "./fixtures";

test.describe("public sign-up is disabled", () => {
  test("POST /api/auth/sign-up/email is rejected and creates no usable account", async ({ request }) => {
    const email = uniqueEmail("signup");
    const password = "signup-password-123";

    const res = await request.post("/api/auth/sign-up/email", {
      headers: AUTH_HEADERS,
      data: { email, password, name: "Self Registered" },
    });
    expect(res.status()).toBe(400);
    expect(await res.json()).toMatchObject({ code: "EMAIL_PASSWORD_SIGN_UP_DISABLED" });

    const signIn = await request.post("/api/auth/sign-in/email", {
      headers: AUTH_HEADERS,
      data: { email, password },
    });
    expect(signIn.status()).toBe(401);
    expect((await request.get("/api/me")).status()).toBe(401);
  });

  test("sign-up asking for the admin role is rejected too", async ({ request }) => {
    const res = await request.post("/api/auth/sign-up/email", {
      headers: AUTH_HEADERS,
      data: { email: uniqueEmail("signup"), password: "signup-password-123", name: "X", role: "admin" },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
    expect((await request.get("/api/me")).status()).toBe(401);
  });
});

test.describe("no role escalation", () => {
  test("an agent can't make themselves admin through update-user", async ({ request, agent }) => {
    await signInViaApi(request, agent.email, agent.password);

    const res = await request.post("/api/auth/update-user", {
      headers: AUTH_HEADERS,
      data: { role: "admin" },
    });
    expect(res.status()).toBe(400);
    expect(await res.json()).toMatchObject({ code: "FIELD_NOT_ALLOWED" });

    const me = await (await request.get("/api/me")).json();
    expect(me.user.role).toBe("agent");
  });

  test("smuggling role next to an allowed field rejects the whole update", async ({ request, agent }) => {
    await signInViaApi(request, agent.email, agent.password);

    const res = await request.post("/api/auth/update-user", {
      headers: AUTH_HEADERS,
      data: { name: "Renamed", role: "admin" },
    });
    expect(res.status()).toBe(400);

    const me = await (await request.get("/api/me")).json();
    expect(me.user).toMatchObject({ role: "agent", name: agent.name });
  });

  test("a role change doesn't survive a new sign-in either", async ({ playwright, agent }) => {
    const first = await playwright.request.newContext({ baseURL: CLIENT_URL });
    await signInViaApi(first, agent.email, agent.password);
    await first.post("/api/auth/update-user", { headers: AUTH_HEADERS, data: { role: "admin" } });
    await first.dispose();

    const second = await playwright.request.newContext({ baseURL: CLIENT_URL });
    try {
      const res = await signInViaApi(second, agent.email, agent.password);
      expect((await res.json()).user.role).toBe("agent");
    } finally {
      await second.dispose();
    }
  });
});

test.describe("trusted origins", () => {
  // server/src/auth.ts sets `advanced: { disableOriginCheck: false, disableCSRFCheck: false }`, so
  // Better Auth enforces its origin/CSRF checks even though the e2e server runs with NODE_ENV=test.
  // Trusted origins: CLIENT_URL (BETTER_AUTH_TRUSTED_ORIGINS) and SERVER_URL (BETTER_AUTH_URL).
  const EVIL_ORIGIN = "http://evil.example";

  test.describe("cookieless sign-in", () => {
    test("sign-in from an untrusted Origin is rejected", async ({ request }) => {
      const res = await request.post("/api/auth/sign-in/email", {
        headers: { Origin: EVIL_ORIGIN },
        data: { email: ADMIN.email, password: ADMIN.password },
      });
      expect(res.status()).toBe(403);
      expect(await res.json()).toMatchObject({ code: "INVALID_ORIGIN" });
      expect((await request.get("/api/me")).status()).toBe(401);
    });

    test("sign-in with an untrusted Referer and no Origin is rejected", async ({ request }) => {
      const res = await request.post("/api/auth/sign-in/email", {
        headers: { Referer: `${EVIL_ORIGIN}/login` },
        data: { email: ADMIN.email, password: ADMIN.password },
      });
      expect(res.status()).toBe(403);
      expect(await res.json()).toMatchObject({ code: "INVALID_ORIGIN" });
      expect((await request.get("/api/me")).status()).toBe(401);
    });

    test("a cross-site navigation sign-in (form CSRF) is blocked", async ({ request }) => {
      const res = await request.post("/api/auth/sign-in/email", {
        headers: { "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" },
        data: { email: ADMIN.email, password: ADMIN.password },
      });
      expect(res.status()).toBe(403);
      expect(await res.json()).toMatchObject({ code: "CROSS_SITE_NAVIGATION_LOGIN_BLOCKED" });
      expect((await request.get("/api/me")).status()).toBe(401);
    });
  });

  test.describe("cookie-bearing state-changing requests", () => {
    test("sign-out from an untrusted Origin is rejected and the session survives", async ({ request, agent }) => {
      await signInViaApi(request, agent.email, agent.password);

      const res = await request.post("/api/auth/sign-out", { headers: { Origin: EVIL_ORIGIN } });
      expect(res.status()).toBe(403);
      expect(await res.json()).toMatchObject({ code: "INVALID_ORIGIN" });
      expect((await request.get("/api/me")).status()).toBe(200);
    });

    test("sign-out without an Origin is rejected and the session survives", async ({ request, agent }) => {
      await signInViaApi(request, agent.email, agent.password);

      const res = await request.post("/api/auth/sign-out");
      expect(res.status()).toBe(403);
      expect(await res.json()).toMatchObject({ code: "MISSING_OR_NULL_ORIGIN" });
      expect((await request.get("/api/me")).status()).toBe(200);
    });

    test('sign-out with Origin "null" is rejected', async ({ request, agent }) => {
      await signInViaApi(request, agent.email, agent.password);

      const res = await request.post("/api/auth/sign-out", { headers: { Origin: "null" } });
      expect(res.status()).toBe(403);
      expect(await res.json()).toMatchObject({ code: "MISSING_OR_NULL_ORIGIN" });
      expect((await request.get("/api/me")).status()).toBe(200);
    });

    test("sign-out from the trusted Origin ends the session", async ({ request, agent }) => {
      await signInViaApi(request, agent.email, agent.password);

      const res = await request.post("/api/auth/sign-out", { headers: AUTH_HEADERS });
      expect(res.status()).toBe(200);
      expect((await request.get("/api/me")).status()).toBe(401);
    });

    test("update-user from an untrusted Origin is rejected and changes nothing", async ({ request, agent }) => {
      await signInViaApi(request, agent.email, agent.password);

      const res = await request.post("/api/auth/update-user", {
        headers: { Origin: EVIL_ORIGIN },
        data: { name: "Renamed by evil.example" },
      });
      expect(res.status()).toBe(403);
      expect(await res.json()).toMatchObject({ code: "INVALID_ORIGIN" });
      expect((await (await request.get("/api/me")).json()).user.name).toBe(agent.name);
    });

    test("update-user without an Origin is rejected and changes nothing", async ({ request, agent }) => {
      await signInViaApi(request, agent.email, agent.password);

      const res = await request.post("/api/auth/update-user", { data: { name: "Renamed without origin" } });
      expect(res.status()).toBe(403);
      expect(await res.json()).toMatchObject({ code: "MISSING_OR_NULL_ORIGIN" });
      expect((await (await request.get("/api/me")).json()).user.name).toBe(agent.name);
    });

    test("update-user from the trusted Origin works", async ({ request, agent }) => {
      await signInViaApi(request, agent.email, agent.password);
      const name = `Renamed ${Date.now()}`;

      const res = await request.post("/api/auth/update-user", { headers: AUTH_HEADERS, data: { name } });
      expect(res.status()).toBe(200);
      expect((await (await request.get("/api/me")).json()).user.name).toBe(name);
    });
  });
});

test.describe("malformed sign-in requests get a 4xx, not a 500", () => {
  const cases: { name: string; data: string | Record<string, unknown> }[] = [
    { name: "an empty JSON body", data: {} },
    { name: "a missing password", data: { email: ADMIN.email } },
    { name: "a missing email", data: { password: ADMIN.password } },
    { name: "non-string fields", data: { email: 123, password: 456 } },
    { name: "an empty email string", data: { email: "", password: ADMIN.password } },
    { name: "a whitespace-padded email", data: { email: ` ${ADMIN.email} `, password: ADMIN.password } },
    { name: "malformed JSON", data: "{not json" },
  ];

  for (const { name, data } of cases) {
    test(`${name} is rejected`, async ({ request }) => {
      const res = await request.post("/api/auth/sign-in/email", {
        headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
        data,
      });
      expect(res.status(), await res.text()).toBe(400);
      expect((await request.get("/api/me")).status()).toBe(401);
    });
  }

  test("an uppercase email via the API signs in as the lowercase account", async ({ request }) => {
    const res = await signInViaApi(request, ADMIN.email.toUpperCase(), ADMIN.password);
    expect((await res.json()).user.email).toBe(ADMIN.email);
  });

  test("wrong password and unknown email get identical 401 responses", async ({ request, agent }) => {
    const wrong = await request.post("/api/auth/sign-in/email", {
      headers: AUTH_HEADERS,
      data: { email: agent.email, password: "wrong-password" },
    });
    const unknown = await request.post("/api/auth/sign-in/email", {
      headers: AUTH_HEADERS,
      data: { email: uniqueEmail("nobody"), password: "wrong-password" },
    });
    expect(wrong.status()).toBe(401);
    expect(unknown.status()).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
  });
});
