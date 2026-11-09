import { describe, expect, it } from "vitest";
import { validatePlaywrightSummary } from "../../../scripts/check-browser-results.js";

const passing = {
  stats: { expected: 6, skipped: 0, unexpected: 0, flaky: 0 },
};

describe("required browser-result gate", () => {
  it("accepts the required complete result count", () => {
    expect(validatePlaywrightSummary(passing, 6)).toBeUndefined();
  });

  it("rejects a missing or reduced result count", () => {
    expect(
      validatePlaywrightSummary(
        { stats: { ...passing.stats, expected: 5 } },
        6,
      ),
    ).toContain("expected>=6");
  });

  it("rejects skipped required scenarios", () => {
    expect(
      validatePlaywrightSummary({ stats: { ...passing.stats, skipped: 1 } }, 6),
    ).toContain("skipped=0");
  });

  it("rejects unexpected and flaky scenarios", () => {
    expect(
      validatePlaywrightSummary(
        { stats: { ...passing.stats, unexpected: 1, flaky: 1 } },
        6,
      ),
    ).toContain("unexpected=0, flaky=0");
  });

  it("rejects malformed summaries and invalid minimum counts", () => {
    expect(validatePlaywrightSummary(null, 6)).toContain(
      "received expected=missing",
    );
    expect(validatePlaywrightSummary(passing, 0)).toContain(
      "positive minimum count",
    );
  });
});
