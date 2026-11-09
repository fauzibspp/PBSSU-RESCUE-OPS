import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface PlaywrightSummary {
  stats?: {
    expected?: number;
    skipped?: number;
    unexpected?: number;
    flaky?: number;
  };
}

export function validatePlaywrightSummary(
  report: unknown,
  minimumExpected: number,
): string | undefined {
  if (!Number.isSafeInteger(minimumExpected) || minimumExpected < 1) {
    return "Browser result gate requires a positive minimum count.";
  }
  const stats =
    report && typeof report === "object" && "stats" in report
      ? (report as PlaywrightSummary).stats
      : undefined;
  if (
    !stats ||
    !Number.isSafeInteger(stats.expected) ||
    !Number.isSafeInteger(stats.skipped) ||
    !Number.isSafeInteger(stats.unexpected) ||
    !Number.isSafeInteger(stats.flaky) ||
    stats.expected! < minimumExpected ||
    stats.skipped !== 0 ||
    stats.unexpected !== 0 ||
    stats.flaky !== 0
  ) {
    return `Browser result gate failed: expected>=${minimumExpected}, skipped=0, unexpected=0, flaky=0; received expected=${stats?.expected ?? "missing"}, skipped=${stats?.skipped ?? "missing"}, unexpected=${stats?.unexpected ?? "missing"}, flaky=${stats?.flaky ?? "missing"}.`;
  }
  return undefined;
}

function main(): void {
  const minimumExpected = Number(process.argv[2] ?? "0");
  const reportPath = resolve("test-results/playwright-results.json");
  let report: unknown;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8")) as unknown;
  } catch {
    process.stderr.write(
      "Required Playwright result summary is missing or invalid.\n",
    );
    process.exitCode = 2;
    return;
  }

  const error = validatePlaywrightSummary(report, minimumExpected);
  if (error) {
    process.stderr.write(`${error}\n`);
    process.exitCode = error.startsWith("Browser result gate requires") ? 2 : 1;
    return;
  }
  const expected = (report as PlaywrightSummary).stats?.expected;
  process.stdout.write(
    `Required browser acceptance passed: ${expected} expected, zero skipped/unexpected/flaky.\n`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
