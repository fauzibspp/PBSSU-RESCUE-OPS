import { describe, expect, it } from "vitest";
import { validateIntegrationState } from "../../../scripts/run-integration-tests.js";

const root = "D:\\PBSSU-RESCUE-OPS";
const instance = "012345abcdef";
const databaseName = `pbssu_m01_sprint4a_${instance}`;
const stateFile = `${root}\\.cache\\sprint4a\\${instance}.json`;
const state = {
  scope: "sprint4a",
  instance,
  dockerScope: `sprint4a-${instance}`,
  container: "a".repeat(64),
  name: `pbssu-sprint4a-${instance}`,
  network: `pbssu-sprint4a-${instance}-isolated`,
  databaseName,
  image:
    "postgis/postgis:18-3.7@sha256:440bdd14e3edccfce04d080d8a1a0cbae5763fa16a1c4172bff83530828461de",
  ownerUrl: `postgresql://pbssu_m01_owner:${"a".repeat(40)}@127.0.0.1:55432/${databaseName}`,
  runtimeUrl: `postgresql://pbssu_m01_runtime:${"b".repeat(40)}@127.0.0.1:55432/${databaseName}`,
  identityUrl: `postgresql://pbssu_m01_identity:${"c".repeat(40)}@127.0.0.1:55432/${databaseName}`,
};

describe("integration launcher database safety", () => {
  it("accepts a scoped local Sprint 4-A state", () => {
    expect(() =>
      validateIntegrationState(state, root, stateFile),
    ).not.toThrow();
  });

  it.each([
    ["wrong scope", { ...state, scope: "production" }],
    ["wrong database", { ...state, databaseName: "production" }],
    ["wrong image", { ...state, image: "postgres:latest" }],
    [
      "external host",
      { ...state, ownerUrl: state.ownerUrl.replace("127.0.0.1", "db.example") },
    ],
    [
      "wrong role",
      {
        ...state,
        runtimeUrl: state.runtimeUrl.replace("pbssu_m01_runtime", "postgres"),
      },
    ],
    [
      "wrong password length",
      {
        ...state,
        identityUrl: state.identityUrl.replace("c".repeat(40), "short"),
      },
    ],
  ])("rejects %s", (_label, candidate) => {
    expect(() =>
      validateIntegrationState(candidate, root, stateFile),
    ).toThrow();
  });

  it("rejects state files outside the isolated project cache", () => {
    expect(() =>
      validateIntegrationState(state, root, `${root}\\.env.json`),
    ).toThrow();
  });
});
