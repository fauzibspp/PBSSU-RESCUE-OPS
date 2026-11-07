import { sql } from "kysely";
import type { Database } from "../connection.js";

const permissions: Array<[string, string, string, string, boolean]> = [
  ["login", "CREDENTIAL_ENTRY", "Credential entry", "{}", false],
  ["refreshSession", "SESSION_REFRESH", "Refresh own session", "{}", false],
  ["revokeSession", "IDENTITY_SELF", "Revoke own session", "{}", false],
  ["listMyMemberships", "IDENTITY_SELF", "List own memberships", "{}", false],
  [
    "onboardOrganization",
    "PLATFORM",
    "Onboard organization metadata",
    "{}",
    true,
  ],
  ["listOrganizations", "PLATFORM", "List organization metadata", "{}", true],
  [
    "startMfaEnrollment",
    "BOUND_CHALLENGE",
    "Start bound MFA enrollment",
    "{}",
    false,
  ],
  [
    "confirmMfaEnrollment",
    "BOUND_CHALLENGE",
    "Confirm bound MFA enrollment",
    "{}",
    false,
  ],
  ["verifyMfa", "BOUND_CHALLENGE", "Verify bound MFA challenge", "{}", false],
  [
    "redeemRecoveryCode",
    "BOUND_CHALLENGE",
    "Redeem recovery code",
    "{}",
    false,
  ],
  ["getMfaStatus", "IDENTITY_SELF", "View own MFA status", "{}", false],
  [
    "reauthenticate",
    "IDENTITY_SELF",
    "Reauthenticate own identity",
    "{}",
    false,
  ],
  [
    "rotateRecoveryCodes",
    "IDENTITY_SELF",
    "Rotate own recovery codes",
    "{}",
    false,
  ],
  [
    "startMfaReplacement",
    "IDENTITY_SELF",
    "Start own MFA replacement",
    "{}",
    false,
  ],
  [
    "confirmMfaReplacement",
    "BOUND_CHALLENGE",
    "Confirm bound MFA replacement",
    "{}",
    false,
  ],
  [
    "requestPasswordReset",
    "CREDENTIAL_ENTRY",
    "Request password recovery",
    "{}",
    false,
  ],
  [
    "confirmPasswordReset",
    "ACTION_PROOF",
    "Complete password recovery",
    "{}",
    false,
  ],
  [
    "requestEmailVerification",
    "CREDENTIAL_ENTRY",
    "Request email verification",
    "{}",
    false,
  ],
  [
    "confirmEmailVerification",
    "ACTION_PROOF",
    "Confirm email verification",
    "{}",
    false,
  ],
  ["changePassword", "IDENTITY_SELF", "Change own password", "{}", false],
  [
    "requestEmailChange",
    "IDENTITY_SELF",
    "Request own email change",
    "{}",
    false,
  ],
  [
    "confirmEmailChange",
    "IDENTITY_SELF",
    "Confirm own email change",
    "{}",
    false,
  ],
  ["listSessions", "IDENTITY_SELF", "List own sessions", "{}", false],
  ["revokeOwnedSession", "IDENTITY_SELF", "Revoke own session", "{}", false],
  ["revokeAllSessions", "IDENTITY_SELF", "Revoke own sessions", "{}", false],
  [
    "acceptInvitation",
    "ACTION_PROOF",
    "Accept a bound invitation",
    "{}",
    false,
  ],
  [
    "activateInvitation",
    "BOUND_CHALLENGE",
    "Activate an accepted invitation",
    "{}",
    false,
  ],
  [
    "redeemCredentialHandoff",
    "BOUND_HANDOFF",
    "Redeem one-time credential handoff",
    "{}",
    false,
  ],
  [
    "getOrganization",
    "TENANT",
    "Read selected organization metadata",
    "{TENANT}",
    false,
  ],
  [
    "updateOrganization",
    "TENANT",
    "Update selected organization metadata",
    "{TENANT}",
    true,
  ],
  [
    "inviteMember",
    "TENANT",
    "Create a pending member invitation",
    "{TENANT}",
    true,
  ],
  [
    "revokeInvitation",
    "TENANT",
    "Revoke a pending invitation",
    "{TENANT}",
    true,
  ],
  [
    "listPersonnel",
    "TENANT",
    "List minimized membership records",
    "{TENANT}",
    false,
  ],
  [
    "updatePersonnel",
    "TENANT",
    "Update permitted membership fields",
    "{TENANT}",
    true,
  ],
  [
    "setMembershipRoles",
    "TENANT",
    "Set explicitly delegated role grants",
    "{TENANT}",
    true,
  ],
  [
    "listRoles",
    "TENANT",
    "List selected organization roles",
    "{TENANT}",
    false,
  ],
  ["createRole", "TENANT", "Create a bounded custom role", "{TENANT}", true],
  [
    "listPermissions",
    "TENANT",
    "List delegable permission catalogue",
    "{TENANT}",
    false,
  ],
  [
    "getSettings",
    "TENANT",
    "Read selected organization settings",
    "{TENANT}",
    false,
  ],
  [
    "updateSettings",
    "TENANT",
    "Update selected organization settings",
    "{TENANT}",
    true,
  ],
];

export async function up(database: Database): Promise<void> {
  for (const [code, domain, description, scopes, requiresMfa] of permissions) {
    await sql`
      insert into app.permissions (code,domain,description,valid_scopes,requires_privileged_mfa)
      values (${code},${domain},${description},${scopes === "{}" ? [] : ["TENANT"]},${requiresMfa})
      on conflict (code) do nothing
    `.execute(database);
  }
}

export async function down(database: Database): Promise<void> {
  await sql`delete from app.permissions where code = any(${permissions.map(([code]) => code)})`.execute(
    database,
  );
}
