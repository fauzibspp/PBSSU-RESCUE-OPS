export type BrowserFixture = {
  email: string;
  password: string;
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

const invalidFixtureMessage =
  "Synthetic browser fixture is invalid or incomplete";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSyntheticEmail(value: unknown): value is string {
  return typeof value === "string" && value.endsWith("@example.invalid");
}

function isBrowserAccount(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.projectName === "string" &&
    isSyntheticEmail(value.email) &&
    typeof value.password === "string" &&
    value.password.length >= 16 &&
    typeof value.totpSecret === "string" &&
    value.totpSecret.length >= 16
  );
}

export function parseBrowserFixture(value: unknown): BrowserFixture {
  if (!isRecord(value)) throw new Error(invalidFixtureMessage);

  const browserAccounts = value.browserAccounts;
  const roleOrganizations = value.roleOrganizations;
  const platformAccounts = value.platformAccounts;
  const requiredStrings = [
    value.password,
    value.enrollPassword,
    value.mobileEnrollPassword,
    value.totpSecret,
  ];
  if (
    !isSyntheticEmail(value.email) ||
    !requiredStrings.every(
      (item) => typeof item === "string" && item.length >= 16,
    ) ||
    ![
      value.organizationA,
      value.organizationB,
      value.incidentA,
      value.incidentB,
    ].every((item) => typeof item === "string" && item.length > 0) ||
    !isSyntheticEmail(value.enrollEmail) ||
    !isSyntheticEmail(value.mobileEnrollEmail) ||
    !Array.isArray(browserAccounts) ||
    !Array.isArray(roleOrganizations) ||
    !Array.isArray(platformAccounts) ||
    !["desktop-edge", "mobile-edge"].every((projectName) =>
      browserAccounts.some(
        (account) =>
          isBrowserAccount(account) && account.projectName === projectName,
      ),
    ) ||
    platformAccounts.length === 0 ||
    platformAccounts.some(
      (account) =>
        !isBrowserAccount(account) ||
        !["desktop-edge", "mobile-edge"].includes(account.projectName),
    ) ||
    roleOrganizations.length < 5 ||
    roleOrganizations.some(
      (role) =>
        !isRecord(role) ||
        ![
          role.organizationId,
          role.organizationName,
          role.roleCode,
          role.roleName,
          role.incidentTitle,
        ].every((field) => typeof field === "string" && field.length > 0),
    )
  ) {
    throw new Error(invalidFixtureMessage);
  }

  return value as unknown as BrowserFixture;
}
