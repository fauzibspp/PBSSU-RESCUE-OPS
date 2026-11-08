import { expect, test } from "@playwright/test";

test("preview clearly distinguishes developer tooling from operational UI", async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => failedRequests.push(request.url()));

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A clear view of what is running." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Operational UI is not implemented" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toBeVisible();

  const dimensions = await page.locator("body").evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAttribute("href", "#main");

  await page.screenshot({
    path: `artifacts/browser/${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test("local API diagnostic displays reachable and unavailable states", async ({
  page,
}) => {
  let reachable = true;
  await page.route("**/__dev/api-status", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        reachable,
        detail: reachable
          ? "A local listener accepts connections on the API port. No application health endpoint is defined."
          : "No local listener is accepting connections on the API port.",
      }),
    }),
  );

  await page.goto("/");
  await expect(page.getByText("Local listener detected")).toBeVisible();
  reachable = false;
  await page.reload();
  await expect(page.getByText("No local listener detected")).toBeVisible();
});
