import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Secret, TOTP } from "otpauth";

test.use({ trace: "off", screenshot: "off", video: "off" });
const fixturePath = resolve(".cache/uf01/browser-fixture.json");

type BrowserFixture = {
  browserAccounts: {
    projectName: string;
    email: string;
    password: string;
    totpSecret: string;
  }[];
  enrollEmail: string;
  enrollPassword: string;
  mobileEnrollEmail: string;
  mobileEnrollPassword: string;
  totpSecret: string;
  organizationA: string;
  organizationB: string;
  incidentA: string;
  incidentB: string;
  roleOrganizations: {
    organizationId: string;
    organizationName: string;
    roleCode: string;
    roleName: string;
    incidentTitle: string;
  }[];
  platformAccounts: {
    projectName: string;
    email: string;
    password: string;
    totpSecret: string;
  }[];
};

test("sign-in page renders accessibly at supported viewport", async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(new URL(request.url()).pathname);
  });

  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(
    page.getByText(
      "Access is based on your active organization membership and permissions.",
    ),
  ).toBeVisible();
  const dimensions = await page.locator("body").evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAttribute("href", "/login");

  await page.screenshot({
    path: `artifacts/browser/${testInfo.project.name}-login.png`,
    fullPage: true,
  });
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    accessibility.violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      targets: nodes.map(({ target }) => target),
      reasons: nodes.flatMap((node) => node.any.map(({ message }) => message)),
    })),
  ).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test("direct protected deep link requires an authenticated session", async ({
  page,
}) => {
  await page.goto("/app/incidents");
  await expect(
    page.getByRole("heading", { name: "Sign in to continue" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Go to sign in" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Go to sign in" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("real WEB login, MFA, tenant switching, incident reads and logout", async ({
  page,
}, testInfo) => {
  test.skip(
    !existsSync(fixturePath),
    "Set PBSSU_TEST_DATABASE_STATE for synthetic HTTP fixture setup",
  );
  const fixture = JSON.parse(
    readFileSync(fixturePath, "utf8"),
  ) as BrowserFixture;
  const browserAccount = fixture.browserAccounts.find(
    (item) => item.projectName === testInfo.project.name,
  );
  expect(browserAccount).toBeTruthy();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const responses: { path: string; status: number }[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(new URL(request.url()).pathname);
  });
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname.replace(
      /\/auth\/credential-handoffs\/[^/]+\/redeem$/,
      "/auth/credential-handoffs/:handoffId/redeem",
    );
    responses.push({ path, status: response.status() });
  });
  await page.goto("/login");
  await page.getByLabel("Email address").fill(browserAccount!.email);
  await page.getByLabel("Password").fill("Synthetic-invalid-password-only");
  const rejectedLogin = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith("/auth/login"),
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  expect((await rejectedLogin).status()).toBe(401);
  await expect(page.getByRole("alert")).toHaveText(
    "We could not sign you in. Check your details and try again.",
  );
  await page.getByLabel("Password").fill(browserAccount!.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Verify your authenticator" }),
  ).toBeVisible();
  const mfaAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    mfaAccessibility.violations.map(({ id, impact }) => ({ id, impact })),
  ).toEqual([]);

  const totp = new TOTP({
    secret: Secret.fromBase32(browserAccount!.totpSecret),
    digits: 6,
    period: 30,
  });
  let invalidCode = "000000";
  while (totp.validate({ token: invalidCode, window: 1 }) !== null)
    invalidCode = String((Number(invalidCode) + 1) % 1_000_000).padStart(
      6,
      "0",
    );
  await page.getByLabel("Authenticator code").fill(invalidCode);
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "We could not verify that code. Check it and try again.",
  );
  await page.getByLabel("Authenticator code").fill(totp.generate());
  await page.getByRole("button", { name: "Verify and continue" }).click();

  const membershipsReady = await expect(
    page.getByRole("heading", { name: "Your organization access" }),
  )
    .toBeVisible({ timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  if (!membershipsReady) {
    const safeAlert = await page
      .getByRole("alert")
      .textContent()
      .catch(() => "");
    const cookies = await page.context().cookies();
    const safeCookies = cookies.map(({ name, secure, httpOnly }) => ({
      name,
      secure,
      httpOnly,
    }));
    const visibleCookieNames = await page.evaluate(() =>
      document.cookie
        .split(";")
        .map((part) => part.trim().split("=")[0])
        .filter(Boolean),
    );
    throw new Error(
      `Membership flow failed: alert=${safeAlert}; responses=${JSON.stringify(responses)}; cookies=${JSON.stringify(safeCookies)}; visible=${JSON.stringify(visibleCookieNames)}; failed=${JSON.stringify(failedRequests)}`,
    );
  }
  await page.getByRole("button", { name: /UF01 Synthetic North/ }).click();
  await expect(
    page.getByRole("heading", { name: "Incidents", exact: true }),
  ).toBeVisible();
  const northIncidentVisible = await expect(
    page.getByRole("button", { name: /UF01 synthetic incident north/ }),
  )
    .toBeVisible({ timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  if (!northIncidentVisible) {
    throw new Error(
      `Synthetic tenant incident missing: responses=${JSON.stringify(responses)}`,
    );
  }
  await expect(page.getByText("UF01 synthetic incident south")).toHaveCount(0);
  await page
    .getByRole("button", { name: /UF01 synthetic incident north/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "UF01 synthetic incident north" }),
  ).toBeVisible();
  await expect(page.getByText("This view is read only.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Dispatch|Assign|Edit|Transition/ }),
  ).toHaveCount(0);
  const authenticatedAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    authenticatedAccessibility.violations.map(({ id, impact }) => ({
      id,
      impact,
    })),
  ).toEqual([]);

  await page.getByLabel("Organization").selectOption(fixture.organizationB);
  await expect(
    page.getByRole("heading", { name: "Your organization access" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /UF01 Synthetic South/ }).click();
  await expect(
    page.getByRole("button", { name: /UF01 synthetic incident south/ }),
  ).toBeVisible();
  await expect(page.getByText("UF01 synthetic incident north")).toHaveCount(0);
  const refreshResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/auth/refresh",
  );
  await page.reload();
  expect((await refreshResponse).status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Your organization access" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /UF01 Synthetic South/ }).click();
  await expect(
    page.getByRole("button", { name: /UF01 synthetic incident south/ }),
  ).toBeVisible();
  const browserStorage = await page.evaluate(() => ({
    localStorageKeys: Object.keys(localStorage),
    sessionStorageKeys: Object.keys(sessionStorage),
  }));
  expect(browserStorage).toEqual({
    localStorageKeys: [],
    sessionStorageKeys: [],
  });
  await page.screenshot({
    path: `artifacts/browser/${testInfo.project.name}-authenticated-incidents.png`,
    fullPage: true,
  });

  for (const roleCase of fixture.roleOrganizations) {
    await page.getByLabel("Organization").selectOption(roleCase.organizationId);
    await expect(
      page.getByRole("heading", { name: "Your organization access" }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: new RegExp(roleCase.organizationName),
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Incidents", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".sidebar-bottom")).toContainText(
      roleCase.roleName,
    );
    await expect(page.getByText("UF01 synthetic incident south")).toHaveCount(
      0,
    );
    if (roleCase.roleCode === "FIELD_RESPONDER") {
      await expect(
        page.getByRole("heading", { name: "No incidents to display" }),
      ).toBeVisible();
      await expect(page.getByText(roleCase.incidentTitle)).toHaveCount(0);
    } else {
      await expect(
        page.getByRole("button", { name: new RegExp(roleCase.incidentTitle) }),
      ).toBeVisible();
    }
  }

  const signOutButton = page.locator(".sidebar-bottom .logout-button");
  await expect(signOutButton).toBeVisible();
  await expect(signOutButton).toBeEnabled();
  const logoutResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/auth/logout",
  );
  await signOutButton.click({ timeout: 8000 });
  expect((await logoutResponse).status()).toBe(204);
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await page.goto("/app/incidents");
  await expect(
    page.getByRole("heading", { name: "Sign in to continue" }),
  ).toBeVisible();

  expect(pageErrors).toEqual([]);
  const expectedDenials = responses.filter(
    (entry) =>
      entry.status === 401 &&
      ["/api/auth/login", "/api/auth/mfa/verify"].includes(entry.path),
  );
  expect(expectedDenials).toHaveLength(2);
  expect(
    failedRequests.filter(
      (path) => path !== "/api/auth/login" && path !== "/api/auth/mfa/verify",
    ),
  ).toEqual([]);
  expect(
    consoleErrors.filter(
      (message) =>
        !message.includes("status of 401 (Unauthorized)") ||
        !message.startsWith("Failed to load resource:"),
    ),
  ).toEqual([]);
  expect(
    responses.some(
      (entry) => entry.path === "/api/incidents" && entry.status === 200,
    ),
  ).toBe(true);
  expect(
    responses.some(
      (entry) =>
        entry.path.startsWith("/api/incidents/") && entry.status === 200,
    ),
  ).toBe(true);
});

test("platform-only privileged identity receives no tenant workspace", async ({
  page,
}, testInfo) => {
  test.skip(
    !existsSync(fixturePath),
    "Set PBSSU_TEST_DATABASE_STATE for synthetic HTTP fixture setup",
  );
  const fixture = JSON.parse(
    readFileSync(fixturePath, "utf8"),
  ) as BrowserFixture;
  const account = fixture.platformAccounts.find(
    (item) => item.projectName === testInfo.project.name,
  );
  expect(account).toBeTruthy();
  const responses: { path: string; status: number }[] = [];
  const errors: string[] = [];
  page.on("response", (response) => {
    responses.push({
      path: new URL(response.url()).pathname,
      status: response.status(),
    });
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  await page.getByLabel("Email address").fill(account!.email);
  await page.getByLabel("Password").fill(account!.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Verify your authenticator" }),
  ).toBeVisible();
  await page.getByLabel("Authenticator code").fill(
    new TOTP({
      secret: Secret.fromBase32(account!.totpSecret),
      digits: 6,
      period: 30,
    }).generate(),
  );
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(
    page.getByRole("heading", { name: "No active organization access" }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  await expect(page.getByText(/UF01 Synthetic (North|South)/)).toHaveCount(0);
  await page.goto("/app/incidents");
  await expect(
    page.getByRole("heading", { name: "No active organization access" }),
  ).toBeVisible();
  expect(
    responses.filter((response) => response.path === "/api/incidents"),
  ).toHaveLength(0);
  expect(
    responses.some(
      (response) =>
        response.path === "/api/me/memberships" && response.status === 200,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);

  // Model browser-side session-cookie expiration without logging or persisting
  // cookie values. Restore them only in memory so the real sign-out path can
  // revoke the synthetic server session afterward.
  const activeCookies = await page.context().cookies();
  expect(
    activeCookies.some(
      ({ name, httpOnly, secure }) =>
        name === "__Host-pbssu_refresh" && httpOnly && secure,
    ),
  ).toBe(true);
  await page.context().clearCookies();
  await page.goto("/app/incidents");
  await expect(
    page.getByRole("heading", { name: "Sign in to continue" }),
  ).toBeVisible();
  expect(
    responses.filter((response) => response.path === "/api/incidents"),
  ).toHaveLength(0);
  await page.context().addCookies(activeCookies);
  await page.goto("/app/incidents");
  await expect(
    page.getByRole("heading", { name: "No active organization access" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect(
    responses.some(
      (response) =>
        response.path === "/api/auth/logout" && response.status === 204,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("tenant Commander first login completes TOTP enrollment", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  test.skip(
    !existsSync(fixturePath),
    "Set PBSSU_TEST_DATABASE_STATE for synthetic HTTP fixture setup",
  );
  const fixture = JSON.parse(
    readFileSync(fixturePath, "utf8"),
  ) as BrowserFixture;
  const enrollmentAccount =
    testInfo.project.name === "desktop-edge"
      ? { email: fixture.enrollEmail, password: fixture.enrollPassword }
      : {
          email: fixture.mobileEnrollEmail,
          password: fixture.mobileEnrollPassword,
        };
  const safeResponses: { path: string; status: number }[] = [];
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname.replace(
      /\/auth\/credential-handoffs\/[^/]+\/redeem$/,
      "/auth/credential-handoffs/:handoffId/redeem",
    );
    safeResponses.push({
      path,
      status: response.status(),
    });
  });
  try {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(enrollmentAccount.email);
    await page.getByLabel("Password").fill(enrollmentAccount.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByRole("heading", { name: "Set up an authenticator" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Prepare setup" }).click();
    const setupKey = await page.locator("#setup-key").innerText();
    const enrollmentAccessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      enrollmentAccessibility.violations.map(({ id, impact }) => ({
        id,
        impact,
      })),
    ).toEqual([]);
    const totp = new TOTP({
      secret: Secret.fromBase32(setupKey.trim()),
      digits: 6,
      period: 30,
    });
    await page.getByLabel("Authenticator code").fill(totp.generate());
    await page.getByRole("button", { name: "Confirm authenticator" }).click();
    await expect(
      page.getByRole("heading", { name: "Verify your authenticator" }),
    ).toBeVisible();
    const remainingStepMs = 30_000 - (Date.now() % 30_000);
    await page.waitForTimeout(remainingStepMs + 1_000);
    await page.getByLabel("Authenticator code").fill(totp.generate());
    await page.getByRole("button", { name: "Verify and continue" }).click();
    await expect(
      page.getByRole("heading", { name: "Your organization access" }),
    ).toBeVisible();
  } catch {
    const safeHeadings = await page
      .getByRole("heading")
      .allTextContents()
      .catch(() => [] as string[]);
    const safePath = new URL(page.url()).pathname;
    await page.goto("about:blank").catch(() => undefined);
    throw new Error(
      `Synthetic privileged MFA enrollment browser flow failed; path=${safePath}; headings=${JSON.stringify(safeHeadings)}; responses=${JSON.stringify(safeResponses)}; setup material was withheld from diagnostics`,
    );
  }
});
