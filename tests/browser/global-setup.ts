import { randomBytes, randomUUID, createCipheriv } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import * as argon2 from "argon2";
import { Pool } from "pg";
import { Secret } from "otpauth";
import { loadLocalSecrets } from "../../apps/api/src/identity/local-secrets.js";
import { validateIntegrationState } from "../../scripts/run-integration-tests.js";

const fixturePath = resolve(".cache/uf01/browser-fixture.json");
const expectedImage =
  "postgis/postgis:18-3.7@sha256:440bdd14e3edccfce04d080d8a1a0cbae5763fa16a1c4172bff83530828461de";

function cleanupFixture(): void {
  try {
    if (existsSync(fixturePath)) unlinkSync(fixturePath);
  } catch {
    // Best effort only. The normal Playwright teardown reports cleanup errors.
  }
}

function protectFixtureFile(): void {
  if (process.platform === "win32") {
    const username = process.env.USERNAME;
    const domain = process.env.USERDOMAIN;
    if (!username)
      throw new Error("Could not protect synthetic browser fixture");
    const account = domain ? `${domain}\\${username}` : username;
    const result = spawnSync(
      "icacls",
      [
        fixturePath,
        "/inheritance:r",
        "/grant:r",
        `${account}:(F)`,
        "SYSTEM:(F)",
      ],
      { stdio: "ignore", windowsHide: true },
    );
    if (result.error || result.status !== 0) {
      throw new Error("Could not protect synthetic browser fixture");
    }
    return;
  }
  chmodSync(fixturePath, 0o600);
}

function encryptSeed(secret: string): string {
  const { encryptionKey } = loadLocalSecrets();
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify({ secret }), "utf8"),
    cipher.final(),
  ]);
  return [nonce, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}

export default async function globalSetup(): Promise<void> {
  const statePath = process.env.PBSSU_TEST_DATABASE_STATE;
  if (!statePath) {
    if (
      process.env.CI === "true" ||
      process.env.PBSSU_BROWSER_ACCEPTANCE_REQUIRED === "1"
    ) {
      throw new Error(
        "Required browser acceptance needs PBSSU_TEST_DATABASE_STATE",
      );
    }
    return;
  }
  const projectRoot = resolve(".");
  const resolvedState = resolve(statePath);
  const cacheRoot = resolve(projectRoot, ".cache", "sprint4a") + sep;
  if (!resolvedState.startsWith(cacheRoot))
    throw new Error(
      "Refusing browser fixtures outside isolated Sprint 4-A state",
    );
  let state: Record<string, string>;
  try {
    state = JSON.parse(
      await (await import("node:fs/promises")).readFile(resolvedState, "utf8"),
    ) as Record<string, string>;
    validateIntegrationState(state, projectRoot, resolvedState);
  } catch {
    throw new Error(
      "Browser acceptance requires a valid isolated synthetic Sprint 4-A database state",
    );
  }
  if (state.image !== expectedImage) {
    throw new Error(
      "Browser acceptance requires the pinned isolated synthetic database image",
    );
  }

  const userId = randomUUID();
  const mobileBrowserUserId = randomUUID();
  const orgA = randomUUID();
  const orgB = randomUUID();
  const memberA = randomUUID();
  const memberB = randomUUID();
  const roleA = randomUUID();
  const roleB = randomUUID();
  const incidentA = randomUUID();
  const incidentB = randomUUID();
  const roleOrganizations: {
    organizationId: string;
    organizationName: string;
    roleCode: string;
    roleName: string;
    incidentTitle: string;
  }[] = [];
  const platformAccounts: {
    projectName: string;
    email: string;
    password: string;
    totpSecret: string;
  }[] = [];
  const enrollUserId = randomUUID();
  const mobileEnrollUserId = randomUUID();
  const enrollOrganizationId = randomUUID();
  const enrollMembershipId = randomUUID();
  const enrollRoleId = randomUUID();
  const email = `uf01-${userId}@example.invalid`;
  const password = `Synthetic!${randomBytes(24).toString("base64url")}`;
  const mobileBrowserEmail = `uf01-mobile-${mobileBrowserUserId}@example.invalid`;
  const mobileBrowserPassword = `Synthetic!${randomBytes(24).toString("base64url")}`;
  const enrollEmail = `uf01-enroll-${enrollUserId}@example.invalid`;
  const mobileEnrollEmail = `uf01-enroll-mobile-${mobileEnrollUserId}@example.invalid`;
  const enrollPassword = `Synthetic!${randomBytes(24).toString("base64url")}`;
  const mobileEnrollPassword = `Synthetic!${randomBytes(24).toString("base64url")}`;
  const totp = new Secret({ size: 20 });
  const mobileBrowserTotp = new Secret({ size: 20 });
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  });
  const mobileBrowserPasswordHash = await argon2.hash(mobileBrowserPassword, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  });
  const enrollPasswordHash = await argon2.hash(enrollPassword, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  });
  const mobileEnrollPasswordHash = await argon2.hash(mobileEnrollPassword, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  });
  const pool = new Pool({
    connectionString: state.ownerUrl,
    max: 1,
    application_name: "pbssu-uf01-synthetic-browser-setup",
  });
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into app.users(id,email_normalized,email_ciphertext,email_verified_at,status)
       values($1,$2,'synthetic-uf01-browser',now(),'ACTIVE')`,
      [userId, email],
    );
    await client.query(
      "insert into app.password_credentials(user_id,password_hash) values($1,$2)",
      [userId, passwordHash],
    );
    await client.query(
      `insert into app.mfa_credentials(id,user_id,seed_ciphertext,encryption_key_ref,state,confirmed_at)
       values($1,$2,$3,$4,'ACTIVE',now())`,
      [
        randomUUID(),
        userId,
        encryptSeed(totp.base32),
        loadLocalSecrets().keyId,
      ],
    );
    await client.query(
      `insert into app.users(id,email_normalized,email_ciphertext,email_verified_at,status)
       values($1,$2,'synthetic-uf01-mobile-browser',now(),'ACTIVE')`,
      [mobileBrowserUserId, mobileBrowserEmail],
    );
    await client.query(
      "insert into app.password_credentials(user_id,password_hash) values($1,$2)",
      [mobileBrowserUserId, mobileBrowserPasswordHash],
    );
    await client.query(
      `insert into app.mfa_credentials(id,user_id,seed_ciphertext,encryption_key_ref,state,confirmed_at)
       values($1,$2,$3,$4,'ACTIVE',now())`,
      [
        randomUUID(),
        mobileBrowserUserId,
        encryptSeed(mobileBrowserTotp.base32),
        loadLocalSecrets().keyId,
      ],
    );
    for (const [org, member, role, slug, name, incident, title] of [
      [
        orgA,
        memberA,
        roleA,
        `uf01-${orgA}`,
        "UF01 Synthetic North",
        incidentA,
        "UF01 synthetic incident north",
      ],
      [
        orgB,
        memberB,
        roleB,
        `uf01-${orgB}`,
        "UF01 Synthetic South",
        incidentB,
        "UF01 synthetic incident south",
      ],
    ] as const) {
      await client.query(
        "select set_config('app.organization_id',$1,true),set_config('app.actor_user_id',$2,true)",
        [org, userId],
      );
      await client.query(
        `insert into app.organizations(id,slug,name,status,activated_at)
         values($1,$2,$3,'ACTIVE',now())`,
        [org, slug, name],
      );
      await client.query(
        `insert into app.memberships(id,organization_id,user_id,display_name,status,activated_at)
         values($1,$2,$3,'Synthetic UF01 Commander','ACTIVE',now())`,
        [member, org, userId],
      );
      await client.query(
        `insert into app.roles(id,organization_id,code,name,delegable,locked_template)
         values($1,$2,'INCIDENT_COMMANDER','Synthetic Incident Commander',false,true)`,
        [role, org],
      );
      await client.query(
        `insert into app.membership_roles(organization_id,membership_id,role_id)
         values($1,$2,$3)`,
        [org, member, role],
      );
      const grants = await client.query(
        `insert into app.role_permissions(organization_id,role_id,permission_id,resource_scope)
         select $1,$2,id,'TENANT' from app.permissions
         where code=any($3::text[]) and domain='TENANT'`,
        [
          org,
          role,
          [
            "listIncidents",
            "getIncident",
            "createIncident",
            "updateIncident",
            "transitionIncident",
          ],
        ],
      );
      if (grants.rowCount !== 5)
        throw new Error(
          "Approved incident read permissions were not available",
        );
      await client.query(
        `insert into app.incidents(id,organization_id,title,category,status,occurred_at,source_kind)
         values($1,$2,$3,'FLOOD_MONITORING','OPEN',now(),'SYNTHETIC_UF01_TEST')`,
        [incident, org, title],
      );
    }
    const roleCases = [
      ["ORGANIZATION_ADMIN", "Organization Admin", "UF01 Browser Admin"],
      [
        "CONTROL_ROOM_OPERATOR",
        "Control Room Operator",
        "UF01 Browser Operator",
      ],
      ["INCIDENT_COMMANDER", "Incident Commander", "UF01 Browser Commander"],
      ["READ_ONLY_AUDITOR", "Read-Only Auditor", "UF01 Browser Auditor"],
      ["FIELD_RESPONDER", "Field Responder", "UF01 Browser Responder"],
    ] as const;
    for (const [roleCode, roleName, organizationName] of roleCases) {
      const organizationId = randomUUID();
      const membershipId = randomUUID();
      const roleId = randomUUID();
      const incidentId = randomUUID();
      const incidentTitle = `UF01 synthetic ${roleCode.toLowerCase()} incident`;
      await client.query(
        "select set_config('app.organization_id',$1,true),set_config('app.actor_user_id',$2,true)",
        [organizationId, userId],
      );
      await client.query(
        `insert into app.organizations(id,slug,name,status,activated_at)
         values($1,$2,$3,'ACTIVE',now())`,
        [organizationId, `uf01-${organizationId}`, organizationName],
      );
      await client.query(
        `insert into app.memberships(id,organization_id,user_id,display_name,status,activated_at)
         values($1,$2,$3,$4,'ACTIVE',now())`,
        [membershipId, organizationId, userId, `Synthetic ${roleName}`],
      );
      await client.query(
        `insert into app.roles(id,organization_id,code,name,delegable,locked_template)
         values($1,$2,$3,$4,false,true)`,
        [roleId, organizationId, roleCode, roleName],
      );
      await client.query(
        `insert into app.membership_roles(organization_id,membership_id,role_id)
         values($1,$2,$3)`,
        [organizationId, membershipId, roleId],
      );
      const scope = roleCode === "FIELD_RESPONDER" ? "ASSIGNED" : "TENANT";
      const roleGrants = await client.query(
        `insert into app.role_permissions(organization_id,role_id,permission_id,resource_scope)
         select $1,$2,id,$4 from app.permissions
         where code=any($3::text[]) and domain='TENANT'`,
        [organizationId, roleId, ["listIncidents", "getIncident"], scope],
      );
      if (roleGrants.rowCount !== 2)
        throw new Error(`Approved G-04 grants missing for ${roleCode}`);
      await client.query(
        `insert into app.incidents(id,organization_id,title,category,status,occurred_at,source_kind)
         values($1,$2,$3,'FLOOD_MONITORING','OPEN',now(),'SYNTHETIC_UF01_ROLE_TEST')`,
        [incidentId, organizationId, incidentTitle],
      );
      roleOrganizations.push({
        organizationId,
        organizationName,
        roleCode,
        roleName,
        incidentTitle,
      });
    }
    const browserMemberships = [
      {
        organizationId: orgA,
        roleId: roleA,
        roleCode: "INCIDENT_COMMANDER",
        organizationName: "UF01 Synthetic North",
      },
      {
        organizationId: orgB,
        roleId: roleB,
        roleCode: "INCIDENT_COMMANDER",
        organizationName: "UF01 Synthetic South",
      },
      ...roleOrganizations.map((entry) => ({
        organizationId: entry.organizationId,
        roleId: "",
        roleCode: entry.roleCode,
        organizationName: entry.organizationName,
      })),
    ];
    for (const entry of browserMemberships) {
      await client.query(
        "select set_config('app.organization_id',$1,true),set_config('app.actor_user_id',$2,true)",
        [entry.organizationId, mobileBrowserUserId],
      );
      await client.query(
        `insert into app.memberships(id,organization_id,user_id,display_name,status,activated_at)
         values($1,$2,$3,$4,'ACTIVE',now())`,
        [
          randomUUID(),
          entry.organizationId,
          mobileBrowserUserId,
          `Synthetic Mobile ${entry.roleCode}`,
        ],
      );
      const roleId =
        entry.roleId ||
        (
          await client.query<{ id: string }>(
            "select id from app.roles where organization_id=$1 and code=$2",
            [entry.organizationId, entry.roleCode],
          )
        ).rows[0]?.id;
      if (!roleId) throw new Error("Approved mobile browser role is missing");
      const membershipId = (
        await client.query<{ id: string }>(
          "select id from app.memberships where organization_id=$1 and user_id=$2",
          [entry.organizationId, mobileBrowserUserId],
        )
      ).rows[0]?.id;
      if (!membershipId)
        throw new Error("Synthetic mobile browser membership missing");
      await client.query(
        `insert into app.membership_roles(organization_id,membership_id,role_id)
         values($1,$2,$3)`,
        [entry.organizationId, membershipId, roleId],
      );
    }
    await client.query(
      `insert into app.users(id,email_normalized,email_ciphertext,email_verified_at,status)
       values($1,$2,'synthetic-uf01-enrollment-browser',now(),'ACTIVE')`,
      [enrollUserId, enrollEmail],
    );
    await client.query(
      "insert into app.password_credentials(user_id,password_hash) values($1,$2)",
      [enrollUserId, enrollPasswordHash],
    );
    await client.query(
      "select set_config('app.organization_id',$1,true),set_config('app.actor_user_id',$2,true)",
      [enrollOrganizationId, enrollUserId],
    );
    await client.query(
      `insert into app.organizations(id,slug,name,status,activated_at)
       values($1,$2,'UF01 Synthetic Enrollment','ACTIVE',now())`,
      [enrollOrganizationId, `uf01-enroll-${enrollOrganizationId}`],
    );
    await client.query(
      `insert into app.memberships(id,organization_id,user_id,display_name,status,activated_at)
       values($1,$2,$3,'Synthetic Enrollment Commander','ACTIVE',now())`,
      [enrollMembershipId, enrollOrganizationId, enrollUserId],
    );
    await client.query(
      `insert into app.roles(id,organization_id,code,name,delegable,locked_template)
       values($1,$2,'INCIDENT_COMMANDER','Synthetic Enrollment Commander',false,true)`,
      [enrollRoleId, enrollOrganizationId],
    );
    await client.query(
      `insert into app.membership_roles(organization_id,membership_id,role_id)
       values($1,$2,$3)`,
      [enrollOrganizationId, enrollMembershipId, enrollRoleId],
    );
    const enrollmentGrants = await client.query(
      `insert into app.role_permissions(organization_id,role_id,permission_id,resource_scope)
       select $1,$2,id,'TENANT' from app.permissions
       where code=any($3::text[]) and domain='TENANT'`,
      [
        enrollOrganizationId,
        enrollRoleId,
        [
          "listIncidents",
          "getIncident",
          "createIncident",
          "updateIncident",
          "transitionIncident",
        ],
      ],
    );
    if (enrollmentGrants.rowCount !== 5)
      throw new Error("Approved incident permissions were not available");
    await client.query(
      `insert into app.users(id,email_normalized,email_ciphertext,email_verified_at,status)
       values($1,$2,'synthetic-uf01-mobile-enrollment-browser',now(),'ACTIVE')`,
      [mobileEnrollUserId, mobileEnrollEmail],
    );
    await client.query(
      "insert into app.password_credentials(user_id,password_hash) values($1,$2)",
      [mobileEnrollUserId, mobileEnrollPasswordHash],
    );
    const mobileEnrollOrganizationId = randomUUID();
    const mobileEnrollMembershipId = randomUUID();
    const mobileEnrollRoleId = randomUUID();
    await client.query(
      "select set_config('app.organization_id',$1,true),set_config('app.actor_user_id',$2,true)",
      [mobileEnrollOrganizationId, mobileEnrollUserId],
    );
    await client.query(
      `insert into app.organizations(id,slug,name,status,activated_at)
       values($1,$2,'UF01 Synthetic Mobile Enrollment','ACTIVE',now())`,
      [
        mobileEnrollOrganizationId,
        `uf01-mobile-enroll-${mobileEnrollOrganizationId}`,
      ],
    );
    await client.query(
      `insert into app.memberships(id,organization_id,user_id,display_name,status,activated_at)
       values($1,$2,$3,'Synthetic Mobile Enrollment Commander','ACTIVE',now())`,
      [
        mobileEnrollMembershipId,
        mobileEnrollOrganizationId,
        mobileEnrollUserId,
      ],
    );
    await client.query(
      `insert into app.roles(id,organization_id,code,name,delegable,locked_template)
       values($1,$2,'INCIDENT_COMMANDER','Synthetic Mobile Enrollment Commander',false,true)`,
      [mobileEnrollRoleId, mobileEnrollOrganizationId],
    );
    await client.query(
      `insert into app.membership_roles(organization_id,membership_id,role_id)
       values($1,$2,$3)`,
      [
        mobileEnrollOrganizationId,
        mobileEnrollMembershipId,
        mobileEnrollRoleId,
      ],
    );
    const mobileEnrollmentGrants = await client.query(
      `insert into app.role_permissions(organization_id,role_id,permission_id,resource_scope)
       select $1,$2,id,'TENANT' from app.permissions
       where code=any($3::text[]) and domain='TENANT'`,
      [
        mobileEnrollOrganizationId,
        mobileEnrollRoleId,
        [
          "listIncidents",
          "getIncident",
          "createIncident",
          "updateIncident",
          "transitionIncident",
        ],
      ],
    );
    if (mobileEnrollmentGrants.rowCount !== 5)
      throw new Error("Approved mobile enrollment permissions unavailable");
    for (const projectName of ["desktop-edge", "mobile-edge"]) {
      const platformUserId = randomUUID();
      const platformEmail = `uf01-platform-${projectName}-${platformUserId}@example.invalid`;
      const platformPassword = `Synthetic!${randomBytes(24).toString("base64url")}`;
      const platformTotp = new Secret({ size: 20 });
      const platformPasswordHash = await argon2.hash(platformPassword, {
        type: argon2.argon2id,
        memoryCost: 65_536,
        timeCost: 3,
        parallelism: 1,
      });
      await client.query(
        `insert into app.users(id,email_normalized,email_ciphertext,email_verified_at,status)
         values($1,$2,'synthetic-uf01-platform-only-browser',now(),'ACTIVE')`,
        [platformUserId, platformEmail],
      );
      await client.query(
        "insert into app.password_credentials(user_id,password_hash) values($1,$2)",
        [platformUserId, platformPasswordHash],
      );
      await client.query(
        `insert into app.mfa_credentials(id,user_id,seed_ciphertext,encryption_key_ref,state,confirmed_at)
         values($1,$2,$3,$4,'ACTIVE',now())`,
        [
          randomUUID(),
          platformUserId,
          encryptSeed(platformTotp.base32),
          loadLocalSecrets().keyId,
        ],
      );
      const platformGrant = await client.query(
        `insert into app.platform_grants(id,user_id,permission_id,state)
         select $1,$2,id,'ACTIVE' from app.permissions
         where domain='PLATFORM' and requires_privileged_mfa=true
         order by code limit 1`,
        [randomUUID(), platformUserId],
      );
      if (platformGrant.rowCount !== 1)
        throw new Error(
          "No approved MFA-protected platform grant is available",
        );
      platformAccounts.push({
        projectName,
        email: platformEmail,
        password: platformPassword,
        totpSecret: platformTotp.base32,
      });
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  mkdirSync(dirname(fixturePath), { recursive: true });
  if (existsSync(fixturePath)) {
    throw new Error(
      "A previous synthetic browser fixture remains; remove it only after confirming it is test-generated",
    );
  }
  try {
    writeFileSync(
      fixturePath,
      JSON.stringify({
        email,
        password,
        browserAccounts: [
          {
            projectName: "desktop-edge",
            email,
            password,
            totpSecret: totp.base32,
          },
          {
            projectName: "mobile-edge",
            email: mobileBrowserEmail,
            password: mobileBrowserPassword,
            totpSecret: mobileBrowserTotp.base32,
          },
        ],
        enrollEmail,
        enrollPassword,
        mobileEnrollEmail,
        mobileEnrollPassword,
        totpSecret: totp.base32,
        organizationA: orgA,
        organizationB: orgB,
        incidentA,
        incidentB,
        roleOrganizations,
        platformAccounts,
      }),
      { mode: 0o600, flag: "wx" },
    );
    protectFixtureFile();
    process.once("exit", cleanupFixture);
    process.once("SIGINT", () => {
      cleanupFixture();
      process.exit(130);
    });
    process.once("SIGTERM", () => {
      cleanupFixture();
      process.exit(143);
    });
  } catch {
    cleanupFixture();
    throw new Error("Could not safely create synthetic browser fixture");
  }
}
