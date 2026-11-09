import { randomBytes, randomUUID, createCipheriv } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import * as argon2 from "argon2";
import { Pool } from "pg";
import { Secret } from "otpauth";
import { loadLocalSecrets } from "../../apps/api/src/identity/local-secrets.js";

const fixturePath = resolve(".cache/uf01/browser-fixture.json");
const expectedImage =
  "postgis/postgis:18-3.7@sha256:440bdd14e3edccfce04d080d8a1a0cbae5763fa16a1c4172bff83530828461de";

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
  if (!statePath) return;
  const projectRoot = resolve(".");
  const resolvedState = resolve(statePath);
  const cacheRoot = resolve(projectRoot, ".cache", "sprint4a") + sep;
  if (!resolvedState.startsWith(cacheRoot))
    throw new Error(
      "Refusing browser fixtures outside isolated Sprint 4-A state",
    );
  const state = JSON.parse(
    await (await import("node:fs/promises")).readFile(resolvedState, "utf8"),
  ) as Record<string, string>;
  if (
    state.scope !== "sprint4a" ||
    state.image !== expectedImage ||
    !/^pbssu_m01_sprint4a_[a-f0-9]{12}$/.test(state.databaseName ?? "")
  ) {
    throw new Error(
      "Browser fixtures require the isolated synthetic Sprint 4-A database",
    );
  }
  const ownerUrl = new URL(state.ownerUrl ?? "");
  if (
    ownerUrl.protocol !== "postgresql:" ||
    ownerUrl.hostname !== "127.0.0.1" ||
    decodeURIComponent(ownerUrl.username) !== "pbssu_m01_owner" ||
    ownerUrl.pathname !== `/${state.databaseName}`
  ) {
    throw new Error(
      "Refusing browser fixture database outside the isolated local test boundary",
    );
  }

  const userId = randomUUID();
  const orgA = randomUUID();
  const orgB = randomUUID();
  const memberA = randomUUID();
  const memberB = randomUUID();
  const roleA = randomUUID();
  const roleB = randomUUID();
  const incidentA = randomUUID();
  const incidentB = randomUUID();
  const enrollUserId = randomUUID();
  const enrollOrganizationId = randomUUID();
  const enrollMembershipId = randomUUID();
  const enrollRoleId = randomUUID();
  const email = `uf01-${userId}@example.invalid`;
  const password = `Synthetic!${randomBytes(24).toString("base64url")}`;
  const enrollEmail = `uf01-enroll-${enrollUserId}@example.invalid`;
  const enrollPassword = `Synthetic!${randomBytes(24).toString("base64url")}`;
  const totp = new Secret({ size: 20 });
  const passwordHash = await argon2.hash(password, {
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
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  mkdirSync(dirname(fixturePath), { recursive: true });
  writeFileSync(
    fixturePath,
    JSON.stringify({
      email,
      password,
      enrollEmail,
      enrollPassword,
      totpSecret: totp.base32,
      organizationA: orgA,
      organizationB: orgB,
      incidentA,
      incidentB,
    }),
    { mode: 0o600 },
  );
}
