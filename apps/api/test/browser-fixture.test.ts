import { describe, expect, it } from "vitest";
import { parseBrowserFixture } from "../../../tests/browser/fixture.js";

const browserAccount = (projectName: string) => ({
  projectName,
  email: `${projectName}@example.invalid`,
  password: "SyntheticBrowserPasswordOnly",
  totpSecret: "JBSWY3DPEHPK3PXP",
});

const fixture = {
  email: "primary@example.invalid",
  password: "SyntheticPrimaryPasswordOnly",
  browserAccounts: [
    browserAccount("desktop-edge"),
    browserAccount("mobile-edge"),
  ],
  enrollEmail: "enroll@example.invalid",
  enrollPassword: "SyntheticEnrollmentPassword",
  mobileEnrollEmail: "mobile-enroll@example.invalid",
  mobileEnrollPassword: "SyntheticMobileEnrollmentPassword",
  totpSecret: "JBSWY3DPEHPK3PXP",
  organizationA: "synthetic-org-a",
  organizationB: "synthetic-org-b",
  incidentA: "synthetic-incident-a",
  incidentB: "synthetic-incident-b",
  roleOrganizations: [
    "ORG_ADMIN",
    "CONTROL_ROOM_OPERATOR",
    "INCIDENT_COMMANDER",
    "FIELD_RESPONDER",
    "READ_ONLY_AUDITOR",
  ].map((roleCode) => ({
    organizationId: `synthetic-${roleCode}`,
    organizationName: `Synthetic ${roleCode}`,
    roleCode,
    roleName: roleCode,
    incidentTitle: `Synthetic incident ${roleCode}`,
  })),
  platformAccounts: [
    {
      projectName: "desktop-edge",
      email: "platform@example.invalid",
      password: "SyntheticPlatformPasswordOnly",
      totpSecret: "JBSWY3DPEHPK3PXP",
    },
  ],
};

describe("synthetic browser fixture validation", () => {
  it("accepts complete synthetic desktop/mobile and role fixtures", () => {
    expect(parseBrowserFixture(fixture)).toEqual(fixture);
  });

  it.each([
    ["missing fixture", null],
    [
      "missing mobile account",
      { ...fixture, browserAccounts: [browserAccount("desktop-edge")] },
    ],
    ["non-synthetic address", { ...fixture, email: "operator@example.com" }],
    ["missing role matrix", { ...fixture, roleOrganizations: [] }],
  ])("rejects %s with a sanitized error", (_description, candidate) => {
    expect(() => parseBrowserFixture(candidate)).toThrow(
      "Synthetic browser fixture is invalid or incomplete",
    );
  });
});
