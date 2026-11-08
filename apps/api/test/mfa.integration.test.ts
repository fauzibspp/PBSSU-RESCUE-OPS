import {
  createCipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { readFileSync } from "node:fs";
import * as argon2 from "argon2";
import { Pool } from "pg";
import { Secret, TOTP } from "otpauth";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IdentityService } from "../src/identity/identity.service.js";
import { loadLocalSecrets } from "../src/identity/local-secrets.js";
import { OrganizationService } from "../src/organizations/organization.service.js";
import { VehicleService } from "../src/vehicles/vehicle.service.js";

interface DevelopmentDatabaseState {
  ownerUrl: string;
  runtimeUrl: string;
  identityUrl: string;
}

const state = JSON.parse(
  readFileSync(
    process.env.PBSSU_TEST_DATABASE_STATE ??
      new URL("../../../.cache/m01/database.json", import.meta.url),
    "utf8",
  ),
) as DevelopmentDatabaseState;
const userId = randomUUID();
const permissionId = randomUUID();
const grantId = randomUUID();
const email = `${userId}@example.invalid`;
let onboardPermissionId: string = randomUUID();
const onboardGrantId = randomUUID();
const organizationId = randomUUID();
const roleId = randomUUID();
const invitationId = randomUUID();
const actionTokenId = randomUUID();
const invitationToken = randomBytes(32).toString("base64url");
const invitationDigest = createHash("sha256").update(email).digest("base64url");
const password = `Synthetic!${randomBytes(24).toString("base64url")}`;
const binding = randomBytes(32).toString("base64url");
const owner = new Pool({ connectionString: state.ownerUrl, max: 1 });
let identity: IdentityService;
let organizationService: OrganizationService | undefined;
let vehicleService: VehicleService | undefined;
let mfaSecret = "";
let recoveryCodes: string[] = [];
let accessToken = "";
let memberInvitationId: string | undefined;
let firstAdminOrganizationId: string | undefined;
let firstAdminInvitationId: string | undefined;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function encrypt(value: unknown): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    loadLocalSecrets().encryptionKey,
    nonce,
  );
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [nonce, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString("base64url"))
    .join(".");
}

describe("M01 privileged MFA lifecycle", () => {
  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "3301";
    process.env.MAIL_MODE = "mock";
    process.env.TRUSTED_WEB_ORIGIN = "http://127.0.0.1:5173";
    process.env.DATABASE_URL = state.runtimeUrl;
    process.env.IDENTITY_DATABASE_URL = state.identityUrl;
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
    });
    await owner.query(
      `insert into app.users (id,email_normalized,email_ciphertext,email_verified_at,status)
       values($1,$2,'synthetic-ciphertext',now(),'ACTIVE')`,
      [userId, email],
    );
    await owner.query(
      "insert into app.password_credentials (user_id,password_hash) values($1,$2)",
      [userId, passwordHash],
    );
    await owner.query(
      `insert into app.permissions (id,code,description,domain,requires_privileged_mfa)
       values($1,$2,'Synthetic MFA test capability','PLATFORM',true)`,
      [permissionId, `mfa-test-${userId}`],
    );
    await owner.query(
      "insert into app.platform_grants (id,user_id,permission_id,state) values($1,$2,$3,'ACTIVE')",
      [grantId, userId, permissionId],
    );
    await owner.query(
      `insert into app.permissions (id,code,description,domain,requires_privileged_mfa)
       values($1,'onboardOrganization','Synthetic onboarding grant','PLATFORM',true)
       on conflict(code) do nothing`,
      [onboardPermissionId],
    );
    onboardPermissionId = (
      await owner.query<{ id: string }>(
        "select id from app.permissions where code='onboardOrganization'",
      )
    ).rows[0]!.id;
    await owner.query(
      "insert into app.platform_grants (id,user_id,permission_id,state) values($1,$2,$3,'ACTIVE')",
      [onboardGrantId, userId, onboardPermissionId],
    );
    await owner.query("select set_config('app.organization_id',$1,false)", [
      organizationId,
    ]);
    await owner.query(
      "insert into app.organizations (id,slug,name,status) values($1,$2,'Synthetic onboarding organization','ONBOARDING')",
      [organizationId, `synthetic-${userId}`],
    );
    await owner.query(
      `insert into app.roles (id,organization_id,code,name,delegable,locked_template)
       values($1,$2,'ORGANIZATION_ADMIN','Synthetic organization administrator',false,true)`,
      [roleId, organizationId],
    );
    await owner.query(
      `insert into app.role_permissions (organization_id,role_id,permission_id,resource_scope)
       select $1,$2,id,'TENANT' from app.permissions
       where code=any($3::text[]) and domain='TENANT'`,
      [
        organizationId,
        roleId,
        [
          "getOrganization",
          "updateOrganization",
          "inviteMember",
          "revokeInvitation",
          "listPersonnel",
          "updatePersonnel",
          "setMembershipRoles",
          "listRoles",
          "createRole",
          "listPermissions",
          "getSettings",
          "updateSettings",
          "listVehicles",
          "createVehicle",
          "updateVehicle",
        ],
      ],
    );
    await owner.query(
      `insert into app.organization_invitations
       (id,organization_id,kind,target_email_ciphertext,target_email_digest,display_name,platform_grant_id,expires_at)
       values($1,$2,'FIRST_ADMIN',$3,$4,'Synthetic first administrator',$5,now()+interval '15 minutes')`,
      [
        invitationId,
        organizationId,
        encrypt({ email }),
        invitationDigest,
        onboardGrantId,
      ],
    );
    await owner.query(
      "insert into app.invitation_roles (organization_id,invitation_id,role_id) values($1,$2,$3)",
      [organizationId, invitationId, roleId],
    );
    await owner.query(
      `insert into app.account_action_tokens
       (id,subject_email_digest,purpose,token_hash,invitation_organization_id,invitation_id,expires_at)
       values($1,$2,'INVITATION',$3,$4,$5,now()+interval '15 minutes')`,
      [
        actionTokenId,
        invitationDigest,
        digest(invitationToken),
        organizationId,
        invitationId,
      ],
    );
    identity = new IdentityService();
  }, 30_000);

  afterAll(async () => {
    await owner.query("select set_config('app.organization_id',$1,false)", [
      organizationId,
    ]);
    await owner.query("delete from app.credential_handoffs where user_id=$1", [
      userId,
    ]);
    await owner.query("delete from app.account_action_tokens where id=$1", [
      actionTokenId,
    ]);
    if (memberInvitationId) {
      await owner.query(
        "delete from app.identity_delivery_jobs where account_action_token_id in (select id from app.account_action_tokens where invitation_id=$1)",
        [memberInvitationId],
      );
      await owner.query(
        "delete from app.account_action_tokens where invitation_id=$1",
        [memberInvitationId],
      );
      await owner.query(
        "delete from app.invitation_roles where invitation_id=$1 and organization_id=$2",
        [memberInvitationId, organizationId],
      );
      await owner.query(
        "delete from app.organization_invitations where id=$1 and organization_id=$2",
        [memberInvitationId, organizationId],
      );
    }
    if (firstAdminOrganizationId && firstAdminInvitationId) {
      await owner.query("select set_config('app.organization_id',$1,false)", [
        firstAdminOrganizationId,
      ]);
      await owner.query(
        "delete from app.identity_delivery_jobs where account_action_token_id in (select id from app.account_action_tokens where invitation_id=$1)",
        [firstAdminInvitationId],
      );
      await owner.query(
        "delete from app.account_action_tokens where invitation_id=$1",
        [firstAdminInvitationId],
      );
      await owner.query(
        "delete from app.invitation_roles where organization_id=$1",
        [firstAdminOrganizationId],
      );
      await owner.query(
        "delete from app.organization_invitations where id=$1",
        [firstAdminInvitationId],
      );
      await owner.query(
        "delete from app.role_permissions where organization_id=$1",
        [firstAdminOrganizationId],
      );
      await owner.query("delete from app.roles where organization_id=$1", [
        firstAdminOrganizationId,
      ]);
      await owner.query(
        "delete from app.organization_settings where organization_id=$1",
        [firstAdminOrganizationId],
      );
      await owner.query("delete from app.organizations where id=$1", [
        firstAdminOrganizationId,
      ]);
      await owner.query("select set_config('app.organization_id',$1,false)", [
        organizationId,
      ]);
    }
    await owner.query(
      "delete from app.membership_roles where organization_id=$1",
      [organizationId],
    );
    await owner.query(
      "delete from app.role_permissions where organization_id=$1",
      [organizationId],
    );
    await owner.query(
      "update app.memberships set status='INACTIVE',availability='UNAVAILABLE',updated_at=now(),version=version+1 where organization_id=$1",
      [organizationId],
    );
    await owner.query("delete from app.auth_challenges where user_id=$1", [
      userId,
    ]);
    await owner.query(
      "delete from app.invitation_roles where organization_id=$1",
      [organizationId],
    );
    await owner.query("delete from app.organization_invitations where id=$1", [
      invitationId,
    ]);
    await owner.query("delete from app.roles where organization_id=$1", [
      organizationId,
    ]);
    await owner.query(
      "delete from app.organization_settings where organization_id=$1",
      [organizationId],
    );
    await owner.query(
      "delete from app.session_refresh_tokens where user_id=$1 and parent_id is not null",
      [userId],
    );
    await owner.query(
      "delete from app.session_refresh_tokens where user_id=$1",
      [userId],
    );
    await owner.query("delete from app.sessions where user_id=$1", [userId]);
    await owner.query("delete from app.recovery_codes where user_id=$1", [
      userId,
    ]);
    await owner.query("delete from app.mfa_credentials where user_id=$1", [
      userId,
    ]);
    await owner.query("delete from app.platform_grants where id=$1", [grantId]);
    await owner.query("delete from app.platform_grants where id=$1", [
      onboardGrantId,
    ]);
    await owner.query("delete from app.permissions where id=$1", [
      permissionId,
    ]);
    await owner.query("delete from app.password_credentials where user_id=$1", [
      userId,
    ]);
    await owner
      .query("delete from app.users where id=$1", [userId])
      .catch(async () => {
        await owner.query(
          "update app.users set status='DISABLED' where id=$1",
          [userId],
        );
      });
    await identity?.onModuleDestroy();
    await organizationService?.onModuleDestroy();
    await vehicleService?.onModuleDestroy();
    await owner.end();
  });

  it("requires MFA before session issuance and delivers enrollment/recovery material once", async () => {
    const login = await identity.login({
      login: email,
      password,
      client_kind: "MOBILE",
      client_binding: binding,
    });
    expect(login.authentication_state).toBe("CHALLENGE_REQUIRED");
    expect(login.next_action).toBe("ENROLL_MFA");
    expect(login).not.toHaveProperty("session_id");
    expect(login).not.toHaveProperty("handoff");

    const enrollment = await identity.startMfaEnrollment(
      { challenge_id: login.challenge_id },
      binding,
    );
    const setupHandoff = enrollment.handoff as { handoff_id: string };
    const response = {
      cookie: () => undefined,
      clearCookie: () => undefined,
      setHeader: () => undefined,
    };
    const setup = await identity.redeemCredentialHandoff(
      setupHandoff.handoff_id,
      { purpose: "TOTP_SETUP" },
      binding,
      {},
      undefined,
      undefined,
      response,
    );
    const setupMaterial = setup as { enrollment_id: string; secret: string };
    expect(setupMaterial.secret).toBeDefined();
    mfaSecret = setupMaterial.secret;
    const totp = new TOTP({ secret: Secret.fromBase32(setupMaterial.secret) });
    const confirmation = await identity.confirmMfaEnrollment(
      {
        challenge_id: login.challenge_id,
        enrollment_id: setupMaterial.enrollment_id,
        code: totp.generate(),
      },
      binding,
    );
    expect(confirmation.next_action).toBe("VERIFY_MFA");
    expect(JSON.stringify(confirmation)).not.toContain("recovery_codes");

    const recovery = confirmation.recovery_handoff as { handoff_id: string };
    const recoveryMaterial = await identity.redeemCredentialHandoff(
      recovery.handoff_id,
      { purpose: "RECOVERY_CODES" },
      binding,
      {},
      undefined,
      undefined,
      response,
    );
    recoveryCodes = (recoveryMaterial as { codes: string[] }).codes;
    expect(recoveryCodes).toHaveLength(10);
    await expect(
      identity.redeemCredentialHandoff(
        recovery.handoff_id,
        { purpose: "RECOVERY_CODES" },
        binding,
        {},
        undefined,
        undefined,
        response,
      ),
    ).rejects.toThrow();
    const stored = await owner.query<{ code_hash: string }>(
      "select code_hash from app.recovery_codes where user_id=$1",
      [userId],
    );
    expect(stored.rows.map((row) => row.code_hash)).not.toContain(
      recoveryCodes[0],
    );
  });

  it("issues a session handoff only after a fresh valid TOTP proof", async () => {
    const previousStep = Math.floor(Date.now() / 30_000);
    const delay = 30_000 - (Date.now() % 30_000) + 100;
    await new Promise((resolve) => setTimeout(resolve, delay));
    expect(Math.floor(Date.now() / 30_000)).toBeGreaterThan(previousStep);

    const login = await identity.login({
      login: email,
      password,
      client_kind: "MOBILE",
      client_binding: binding,
    });
    expect(login.next_action).toBe("VERIFY_MFA");
    const totp = new TOTP({ secret: Secret.fromBase32(mfaSecret) });
    const code = totp.generate();
    const session = await identity.verifyMfa(
      { challenge_id: login.challenge_id, code },
      binding,
    );
    expect(session.authentication_state).toBe("SESSION_HANDOFF_REQUIRED");
    expect(JSON.stringify(session)).not.toMatch(/access_token|refresh_token/);
    const handoff = session.handoff as { handoff_id: string };
    const material = await identity.redeemCredentialHandoff(
      handoff.handoff_id,
      { purpose: "SESSION" },
      binding,
      {},
      undefined,
      undefined,
      {
        cookie: () => undefined,
        clearCookie: () => undefined,
        setHeader: () => undefined,
      },
    );
    const sessionMaterial = material as {
      access_token: string;
      refresh_token: string;
    };
    accessToken = sessionMaterial.access_token;
    expect(await identity.authenticateAccessToken(accessToken)).toMatchObject({
      userId,
      assurance: "MFA",
    });
    await expect(
      identity.verifyMfa({ challenge_id: login.challenge_id, code }, binding),
    ).rejects.toThrow();

    organizationService = new OrganizationService(identity);
    vehicleService = new VehicleService(identity);
    await expect(
      organizationService.getOrganization(accessToken, organizationId),
    ).rejects.toThrow();

    const accepted = await identity.acceptInvitation(
      {
        token: invitationToken,
        client_kind: "MOBILE",
        client_binding: binding,
      },
      accessToken,
    );
    const invitationChallenge = accepted.challenge as { challenge_id: string };
    expect(accepted.status).toBe("AWAITING_MFA");
    await expect(
      identity.acceptInvitation(
        {
          token: invitationToken,
          client_kind: "MOBILE",
          client_binding: binding,
        },
        accessToken,
      ),
    ).rejects.toThrow();
    await owner.query("select set_config('app.organization_id',$1,false)", [
      organizationId,
    ]);
    expect(
      (
        await owner.query("select status from app.organizations where id=$1", [
          organizationId,
        ])
      ).rows[0]?.status,
    ).toBe("ONBOARDING");
    expect(
      (
        await owner.query(
          "select status from app.memberships where organization_id=$1",
          [organizationId],
        )
      ).rows[0]?.status,
    ).toBe("PENDING_ACTIVATION");
    await expect(
      identity.activateInvitation(
        { challenge_id: invitationChallenge.challenge_id },
        binding,
      ),
    ).rejects.toThrow();

    const priorStep = Math.floor(Date.now() / 30_000);
    await new Promise((resolve) =>
      setTimeout(resolve, 30_000 - (Date.now() % 30_000) + 100),
    );
    expect(Math.floor(Date.now() / 30_000)).toBeGreaterThan(priorStep);
    const invitationProof = await identity.verifyMfa(
      {
        challenge_id: invitationChallenge.challenge_id,
        code: totp.generate(),
      },
      binding,
    );
    const activationChallenge = invitationProof as { challenge_id: string };
    expect(invitationProof.next_action).toBe("COMPLETE_INVITATION");
    const activated = await identity.activateInvitation(
      { challenge_id: activationChallenge.challenge_id },
      binding,
    );
    expect(activated.organization_status).toBe("ACTIVE");
    expect(activated.membership_status).toBe("ACTIVE");
    expect(activated).toHaveProperty("handoff.handoff_id");
    await owner.query("select set_config('app.organization_id',$1,false)", [
      organizationId,
    ]);
    const activationState = await owner.query(
      `select o.status as organization_status,m.status as membership_status
       from app.organizations o join app.memberships m on m.organization_id=o.id where o.id=$1`,
      [organizationId],
    );
    expect(activationState.rows[0]).toEqual({
      organization_status: "ACTIVE",
      membership_status: "ACTIVE",
    });

    const selectedOrganization = await organizationService.getOrganization(
      accessToken,
      organizationId,
    );
    expect(selectedOrganization).toMatchObject({
      id: organizationId,
      status: "ACTIVE",
    });
    const createdVehicle = await vehicleService.createVehicle(
      accessToken,
      organizationId,
      { call_sign: "  RESCUE-01 ", kind: "Pumper" },
    );
    expect(createdVehicle).toMatchObject({
      organization_id: organizationId,
      call_sign: "RESCUE-01",
      kind: "Pumper",
      service_state: "AVAILABLE",
    });
    expect(Object.keys(createdVehicle).sort()).toEqual(
      [
        "id",
        "version",
        "created_at",
        "organization_id",
        "call_sign",
        "kind",
        "service_state",
      ].sort(),
    );
    const vehiclePage = await vehicleService.listVehicles(
      accessToken,
      organizationId,
    );
    expect(vehiclePage.items).toHaveLength(1);
    expect(vehiclePage.items[0]?.id).toBe(createdVehicle.id);
    const updatedVehicle = await vehicleService.updateVehicle(
      accessToken,
      organizationId,
      createdVehicle.id,
      { base_version: 1, service_state: "MAINTENANCE" },
    );
    expect(updatedVehicle).toMatchObject({
      version: 2,
      service_state: "MAINTENANCE",
    });
    await expect(
      vehicleService.createVehicle(accessToken, organizationId, {
        call_sign: "   ",
        kind: "Pumper",
      }),
    ).rejects.toThrow();
    await expect(
      vehicleService.createVehicle(accessToken, organizationId, {
        call_sign: "RESCUE-01",
        kind: "Pumper",
        organization_id: randomUUID(),
      }),
    ).rejects.toThrow();
    await expect(
      vehicleService.createVehicle(accessToken, organizationId, {
        call_sign: "RESCUE-01",
        kind: "Pumper",
      }),
    ).rejects.toThrow();
    await expect(
      vehicleService.updateVehicle(
        accessToken,
        organizationId,
        createdVehicle.id,
        {
          base_version: 1,
          service_state: "AVAILABLE",
        },
      ),
    ).rejects.toThrow();
    const roster = await organizationService.listPersonnel(
      accessToken,
      organizationId,
    );
    const rosterItems = roster.items as Array<Record<string, unknown>>;
    expect(rosterItems).toHaveLength(1);
    expect(rosterItems[0]).toMatchObject({
      user_id: userId,
      status: "ACTIVE",
    });
    const membershipId = String(rosterItems[0]!.id);
    await owner.query("select set_config('app.organization_id',$1,false)", [
      organizationId,
    ]);
    for (const roleCode of [
      `NO_VEHICLE_${userId.slice(0, 8)}`,
      "FIELD_RESPONDER",
      "READ_ONLY_AUDITOR",
    ]) {
      const unauthorizedRoleId = randomUUID();
      await owner.query(
        "insert into app.roles (id,organization_id,code,name) values($1,$2,$3,$4)",
        [unauthorizedRoleId, organizationId, roleCode, `${roleCode} fixture`],
      );
      await owner.query(
        "delete from app.membership_roles where organization_id=$1 and membership_id=$2",
        [organizationId, membershipId],
      );
      await owner.query(
        "insert into app.membership_roles (organization_id,membership_id,role_id) values($1,$2,$3)",
        [organizationId, membershipId, unauthorizedRoleId],
      );
      await expect(
        vehicleService.listVehicles(accessToken, organizationId),
        `${roleCode} with platform grants has no implicit tenant read`,
      ).rejects.toThrow();
      await expect(
        vehicleService.createVehicle(accessToken, organizationId, {
          call_sign: `DENIED-${roleCode.slice(0, 8)}`,
          kind: "Synthetic",
        }),
        `${roleCode} has no vehicle administration grant`,
      ).rejects.toThrow();
      await owner.query(
        "delete from app.membership_roles where organization_id=$1 and membership_id=$2",
        [organizationId, membershipId],
      );
      await owner.query("delete from app.roles where id=$1", [
        unauthorizedRoleId,
      ]);
    }
    await owner.query(
      "insert into app.membership_roles (organization_id,membership_id,role_id) values($1,$2,$3)",
      [organizationId, membershipId, roleId],
    );
    await expect(
      vehicleService.listVehicles(accessToken, randomUUID()),
    ).rejects.toThrow();
    await expect(
      organizationService.setMembershipRoles(
        accessToken,
        organizationId,
        String(rosterItems[0]!.id),
        { base_version: Number(rosterItems[0]!.version), role_ids: [] },
      ),
    ).rejects.toThrow();
    const permissionPage = await organizationService.listPermissions(
      accessToken,
      organizationId,
    );
    const permissions = permissionPage.items as Array<Record<string, unknown>>;
    const listPersonnelGrant = permissions.find(
      (item) => item.code === "listPersonnel",
    );
    expect(listPersonnelGrant).toBeDefined();
    const customRole = await organizationService.createRole(
      accessToken,
      organizationId,
      {
        code: `TEST_${userId.slice(0, 8).toUpperCase()}`,
        name: "Synthetic delegated role",
        grants: [
          {
            permission_id: String(listPersonnelGrant!.id),
            resource_scope: "TENANT",
          },
        ],
      },
    );
    expect(customRole).toHaveProperty("grants", [
      {
        permission_id: String(listPersonnelGrant!.id),
        resource_scope: "TENANT",
      },
    ]);
    const secondOrganizationId = randomUUID();
    await owner.query("select set_config('app.organization_id',$1,false)", [
      secondOrganizationId,
    ]);
    await owner.query(
      "insert into app.organizations (id,slug,name,status,activated_at) values($1,$2,'Synthetic foreign tenant','ACTIVE',now())",
      [secondOrganizationId, `synthetic-foreign-${userId}`],
    );
    await expect(
      organizationService.getOrganization(accessToken, secondOrganizationId),
    ).rejects.toThrow();
    await owner.query("select set_config('app.organization_id',$1,false)", [
      secondOrganizationId,
    ]);
    await owner.query("delete from app.organizations where id=$1", [
      secondOrganizationId,
    ]);

    const invitation = await identity.inviteMember(
      accessToken,
      organizationId,
      {
        email: `invite-${userId}@example.invalid`,
        display_name: "Synthetic invitee",
        role_ids: [String((customRole as Record<string, unknown>).id)],
      },
    );
    memberInvitationId = String(invitation.id);
    expect(JSON.stringify(invitation)).not.toMatch(
      /token|secret|ciphertext|password/i,
    );
    const revoked = await identity.revokeInvitation(
      accessToken,
      organizationId,
      memberInvitationId,
      { base_version: 1 },
    );
    expect(revoked.status).toBe("REVOKED");

    const onboarding = await identity.onboardOrganization(accessToken, {
      name: "Synthetic onboarding tenant",
      slug: `m01-onboard-${userId.slice(0, 8)}`,
      initial_admin_email: email,
      initial_admin_display_name: "Synthetic first administrator",
    });
    const pendingOrganization = onboarding.organization as Record<
      string,
      unknown
    >;
    const pendingInvitation = onboarding.invitation as Record<string, unknown>;
    firstAdminOrganizationId = String(pendingOrganization.id);
    firstAdminInvitationId = String(pendingInvitation.id);
    expect(pendingOrganization.status).toBe("ONBOARDING");
    expect(pendingInvitation.status).toBe("PENDING");
    expect(JSON.stringify(onboarding)).not.toMatch(
      /token|secret|ciphertext|password/i,
    );
    await owner.query("select set_config('app.organization_id',$1,false)", [
      firstAdminOrganizationId,
    ]);
    const onboardingState = await owner.query(
      `select o.status as organization_status,i.status as invitation_status,
       (select count(*)::int from app.memberships m where m.organization_id=o.id) as membership_count
       from app.organizations o join app.organization_invitations i on i.organization_id=o.id where o.id=$1`,
      [firstAdminOrganizationId],
    );
    expect(onboardingState.rows[0]).toEqual({
      organization_status: "ONBOARDING",
      invitation_status: "PENDING",
      membership_count: 0,
    });
    const vehicleTemplateGrants = await owner.query<{
      role_code: string;
      permission_code: string;
    }>(
      `select r.code as role_code,p.code as permission_code
       from app.roles r join app.role_permissions rp
         on rp.organization_id=r.organization_id and rp.role_id=r.id
       join app.permissions p on p.id=rp.permission_id
       where r.organization_id=$1 and p.code=any($2::text[])
       order by r.code,p.code`,
      [
        firstAdminOrganizationId,
        ["listVehicles", "createVehicle", "updateVehicle"],
      ],
    );
    expect(vehicleTemplateGrants.rows).toEqual([
      { role_code: "CONTROL_ROOM_OPERATOR", permission_code: "listVehicles" },
      { role_code: "INCIDENT_COMMANDER", permission_code: "listVehicles" },
      { role_code: "ORGANIZATION_ADMIN", permission_code: "createVehicle" },
      { role_code: "ORGANIZATION_ADMIN", permission_code: "listVehicles" },
      { role_code: "ORGANIZATION_ADMIN", permission_code: "updateVehicle" },
    ]);
    const incidentTemplateGrants = await owner.query<{
      role_code: string;
      permission_code: string;
      resource_scope: string;
    }>(
      `select r.code role_code,p.code permission_code,rp.resource_scope
       from app.roles r join app.role_permissions rp
         on rp.organization_id=r.organization_id and rp.role_id=r.id
       join app.permissions p on p.id=rp.permission_id
       where r.organization_id=$1 and p.code=any($2::text[])
       order by r.code,p.code`,
      [
        firstAdminOrganizationId,
        [
          "listIncidents",
          "getIncident",
          "createIncident",
          "updateIncident",
          "transitionIncident",
          "listLocations",
          "createLocation",
        ],
      ],
    );
    expect(incidentTemplateGrants.rows).toEqual([
      {
        role_code: "CONTROL_ROOM_OPERATOR",
        permission_code: "createIncident",
        resource_scope: "TENANT",
      },
      {
        role_code: "CONTROL_ROOM_OPERATOR",
        permission_code: "createLocation",
        resource_scope: "TENANT",
      },
      {
        role_code: "CONTROL_ROOM_OPERATOR",
        permission_code: "getIncident",
        resource_scope: "TENANT",
      },
      {
        role_code: "CONTROL_ROOM_OPERATOR",
        permission_code: "listIncidents",
        resource_scope: "TENANT",
      },
      {
        role_code: "CONTROL_ROOM_OPERATOR",
        permission_code: "listLocations",
        resource_scope: "TENANT",
      },
      {
        role_code: "CONTROL_ROOM_OPERATOR",
        permission_code: "transitionIncident",
        resource_scope: "TENANT",
      },
      {
        role_code: "CONTROL_ROOM_OPERATOR",
        permission_code: "updateIncident",
        resource_scope: "TENANT",
      },
      {
        role_code: "FIELD_RESPONDER",
        permission_code: "getIncident",
        resource_scope: "ASSIGNED",
      },
      {
        role_code: "FIELD_RESPONDER",
        permission_code: "listIncidents",
        resource_scope: "ASSIGNED",
      },
      {
        role_code: "FIELD_RESPONDER",
        permission_code: "listLocations",
        resource_scope: "ASSIGNED",
      },
      {
        role_code: "INCIDENT_COMMANDER",
        permission_code: "createIncident",
        resource_scope: "TENANT",
      },
      {
        role_code: "INCIDENT_COMMANDER",
        permission_code: "createLocation",
        resource_scope: "TENANT",
      },
      {
        role_code: "INCIDENT_COMMANDER",
        permission_code: "getIncident",
        resource_scope: "TENANT",
      },
      {
        role_code: "INCIDENT_COMMANDER",
        permission_code: "listIncidents",
        resource_scope: "TENANT",
      },
      {
        role_code: "INCIDENT_COMMANDER",
        permission_code: "listLocations",
        resource_scope: "TENANT",
      },
      {
        role_code: "INCIDENT_COMMANDER",
        permission_code: "transitionIncident",
        resource_scope: "TENANT",
      },
      {
        role_code: "INCIDENT_COMMANDER",
        permission_code: "updateIncident",
        resource_scope: "TENANT",
      },
      {
        role_code: "ORGANIZATION_ADMIN",
        permission_code: "getIncident",
        resource_scope: "TENANT",
      },
      {
        role_code: "ORGANIZATION_ADMIN",
        permission_code: "listIncidents",
        resource_scope: "TENANT",
      },
      {
        role_code: "ORGANIZATION_ADMIN",
        permission_code: "listLocations",
        resource_scope: "TENANT",
      },
      {
        role_code: "READ_ONLY_AUDITOR",
        permission_code: "getIncident",
        resource_scope: "TENANT",
      },
      {
        role_code: "READ_ONLY_AUDITOR",
        permission_code: "listIncidents",
        resource_scope: "TENANT",
      },
      {
        role_code: "READ_ONLY_AUDITOR",
        permission_code: "listLocations",
        resource_scope: "TENANT",
      },
    ]);
    await owner.query("select set_config('app.organization_id',$1,false)", [
      organizationId,
    ]);
    await owner.query(
      "update app.memberships set status='INACTIVE',availability='UNAVAILABLE',version=version+1 where organization_id=$1 and user_id=$2",
      [organizationId, userId],
    );
    await expect(
      organizationService.getOrganization(accessToken, organizationId),
    ).rejects.toThrow();
  });
});
