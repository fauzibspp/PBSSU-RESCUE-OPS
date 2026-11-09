import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { Secret, TOTP } from "otpauth";

test.use({ trace: "off", screenshot: "off", video: "off" });
const fixturePath = resolve(".cache/uf01/browser-fixture.json");

type BrowserFixture = {
  email: string;
  password: string;
  enrollEmail: string;
  enrollPassword: string;
  totpSecret: string;
  organizationA: string;
  organizationB: string;
  incidentA: string;
  incidentB: string;
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
  await page.getByLabel("Email address").fill(fixture.email);
  await page.getByLabel("Password").fill("Synthetic-invalid-password-only");
  const rejectedLogin = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith("/auth/login"),
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  expect((await rejectedLogin).status()).toBe(401);
  await expect(page.getByRole("alert")).toHaveText(
    "We could not sign you in. Check your details and try again.",
  );
  await page.getByLabel("Password").fill(fixture.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Verify your authenticator" }),
  ).toBeVisible();

  const totp = new TOTP({
    secret: Secret.fromBase32(fixture.totpSecret),
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

  await page.getByLabel("Organization").selectOption(fixture.organizationB);
  await expect(
    page.getByRole("heading", { name: "Your organization access" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /UF01 Synthetic South/ }).click();
  await expect(
    page.getByRole("button", { name: /UF01 synthetic incident south/ }),
  ).toBeVisible();
  await expect(page.getByText("UF01 synthetic incident north")).toHaveCount(0);
  await page.screenshot({
    path: `artifacts/browser/${testInfo.project.name}-authenticated-incidents.png`,
    fullPage: true,
  });

  if (testInfo.project.name === "desktop-edge") {
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
  }

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

test("tenant Commander first login completes TOTP enrollment", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-edge",
    "The synthetic enrollment account is one-time and is exercised once per run",
  );
  test.skip(
    !existsSync(fixturePath),
    "Set PBSSU_TEST_DATABASE_STATE for synthetic HTTP fixture setup",
  );
  const fixture = JSON.parse(
    readFileSync(fixturePath, "utf8"),
  ) as BrowserFixture;
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
    await page.getByLabel("Email address").fill(fixture.enrollEmail);
    await page.getByLabel("Password").fill(fixture.enrollPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByRole("heading", { name: "Set up an authenticator" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Prepare setup" }).click();
    const setupKey = await page.locator("#setup-key").innerText();
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
