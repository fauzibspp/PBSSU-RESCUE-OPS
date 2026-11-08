import { randomBytes, randomUUID, createCipheriv } from "node:crypto";
import { readFileSync } from "node:fs";
import * as argon2 from "argon2";
import { NestFactory } from "@nestjs/core";
import { Pool } from "pg";
import { Secret, TOTP } from "otpauth";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { loadLocalSecrets } from "../src/identity/local-secrets.js";

const state = JSON.parse(
  readFileSync(process.env.PBSSU_TEST_DATABASE_STATE!, "utf8"),
) as { ownerUrl: string; runtimeUrl: string; identityUrl: string };
process.env.NODE_ENV = "test";
process.env.HOST = "127.0.0.1";
process.env.PORT = "3301";
process.env.MAIL_MODE = "mock";
process.env.TRUSTED_WEB_ORIGIN = "http://127.0.0.1:5173";
process.env.DATABASE_URL = state.runtimeUrl;
process.env.IDENTITY_DATABASE_URL = state.identityUrl;

const owner = new Pool({ connectionString: state.ownerUrl, max: 2 });
const userId = randomUUID();
const organizationId = randomUUID();
const secondOrganizationId = randomUUID();
const membershipId = randomUUID();
const operatorUserId = randomUUID();
const operatorMembershipId = randomUUID();
const ordinaryUserId = randomUUID();
const ordinaryMembershipId = randomUUID();
const secondResponderUserId = randomUUID();
const secondResponderMembershipId = randomUUID();
const assignmentVehicleId = randomUUID();
const conflictVehicleId = randomUUID();
const platformUserId = randomUUID();
const roleId = randomUUID();
const roleIds = {
  INCIDENT_COMMANDER: roleId,
  CONTROL_ROOM_OPERATOR: randomUUID(),
  ORGANIZATION_ADMIN: randomUUID(),
  READ_ONLY_AUDITOR: randomUUID(),
  FIELD_RESPONDER: randomUUID(),
};
const email = `${userId}@example.invalid`;
const operatorEmail = `${operatorUserId}@example.invalid`;
const ordinaryEmail = `${ordinaryUserId}@example.invalid`;
const platformEmail = `${platformUserId}@example.invalid`;
const password = `Synthetic!${randomBytes(24).toString("base64url")}`;
const operatorPassword = `Synthetic!${randomBytes(24).toString("base64url")}`;
const ordinaryPassword = `Synthetic!${randomBytes(24).toString("base64url")}`;
const platformPassword = `Synthetic!${randomBytes(24).toString("base64url")}`;
const binding = randomBytes(32).toString("base64url");
const operatorBinding = randomBytes(32).toString("base64url");
const ordinaryBinding = randomBytes(32).toString("base64url");
const platformBinding = randomBytes(32).toString("base64url");
const totpSecret = new Secret({ size: 20 });
const operatorTotpSecret = new Secret({ size: 20 });
const platformTotpSecret = new Secret({ size: 20 });
let app: Awaited<ReturnType<typeof NestFactory.create>>;
let baseUrl: string;
let authorization: string;
let sessionId: string;

async function selectRole(code: keyof typeof roleIds): Promise<void> {
  const client = await owner.connect();
  try {
    await client.query("begin");
    await client.query(
      "select set_config('app.organization_id',$1,true),set_config('app.actor_user_id',$2,true)",
      [organizationId, userId],
    );
    await client.query(
      "delete from app.membership_roles where organization_id=$1 and membership_id=$2",
      [organizationId, membershipId],
    );
    await client.query(
      "insert into app.membership_roles(organization_id,membership_id,role_id) values($1,$2,$3)",
      [organizationId, membershipId, roleIds[code]],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function encryptSeed(secret: string): string {
  const { encryptionKey } = loadLocalSecrets();
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce);
  const body = Buffer.concat([
    cipher.update(JSON.stringify({ secret }), "utf8"),
    cipher.final(),
  ]);
  return [nonce, cipher.getAuthTag(), body]
    .map((part) => part.toString("base64url"))
    .join(".");
}

describe("Sprint 3 real HTTP authentication and routes", () => {
  beforeAll(async () => {
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
    });
    const factorId = randomUUID();
    await owner.query(
      `insert into app.users(id,email_normalized,email_ciphertext,email_verified_at,status)
       values($1,$2,'synthetic-http-test',now(),'ACTIVE')`,
      [userId, email],
    );
    await owner.query(
      "insert into app.password_credentials(user_id,password_hash) values($1,$2)",
      [userId, passwordHash],
    );
    await owner.query(
      `insert into app.mfa_credentials(id,user_id,seed_ciphertext,encryption_key_ref,state,confirmed_at)
       values($1,$2,$3,$4,'ACTIVE',now())`,
      [
        factorId,
        userId,
        encryptSeed(totpSecret.base32),
        loadLocalSecrets().keyId,
      ],
    );
    for (const [id, address, secret] of [
      [ordinaryUserId, ordinaryEmail, null],
      [platformUserId, platformEmail, platformTotpSecret.base32],
    ] as const) {
      const hash = await argon2.hash(
        id === ordinaryUserId ? ordinaryPassword : platformPassword,
        {
          type: argon2.argon2id,
          memoryCost: 65_536,
          timeCost: 3,
          parallelism: 1,
        },
      );
      await owner.query(
        `insert into app.users(id,email_normalized,email_ciphertext,email_verified_at,status)
         values($1,$2,'synthetic-http-identity',now(),'ACTIVE')`,
        [id, address],
      );
      await owner.query(
        "insert into app.password_credentials(user_id,password_hash) values($1,$2)",
        [id, hash],
      );
      if (secret) {
        await owner.query(
          `insert into app.mfa_credentials(id,user_id,seed_ciphertext,encryption_key_ref,state,confirmed_at)
           values($1,$2,$3,$4,'ACTIVE',now())`,
          [randomUUID(), id, encryptSeed(secret), loadLocalSecrets().keyId],
        );
      }
    }
    const operatorHash = await argon2.hash(operatorPassword, {
      type: argon2.argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
    });
    await owner.query(
      `insert into app.users(id,email_normalized,email_ciphertext,email_verified_at,status)
       values($1,$2,'synthetic-http-operator',now(),'ACTIVE')`,
      [operatorUserId, operatorEmail],
    );
    await owner.query(
      "insert into app.password_credentials(user_id,password_hash) values($1,$2)",
      [operatorUserId, operatorHash],
    );
    await owner.query(
      `insert into app.mfa_credentials(id,user_id,seed_ciphertext,encryption_key_ref,state,confirmed_at)
       values($1,$2,$3,$4,'ACTIVE',now())`,
      [
        randomUUID(),
        operatorUserId,
        encryptSeed(operatorTotpSecret.base32),
        loadLocalSecrets().keyId,
      ],
    );
    const setup = await owner.connect();
    try {
      await setup.query("begin");
      await setup.query(
        "select set_config('app.organization_id',$1,true),set_config('app.actor_user_id',$2,true)",
        [organizationId, userId],
      );
      await setup.query(
        `insert into app.organizations(id,slug,name,status)
         values($1,$2,'Synthetic HTTP Tenant','ACTIVE')`,
        [organizationId, `http-${organizationId}`],
      );
      await setup.query(
        `insert into app.memberships(id,organization_id,user_id,display_name,status,activated_at)
         values($1,$2,$3,'Synthetic HTTP Commander','ACTIVE',now())`,
        [membershipId, organizationId, userId],
      );
      await setup.query(
        `insert into app.roles(id,organization_id,code,name) values
         ($1,$2,'INCIDENT_COMMANDER','Synthetic HTTP Commander'),
         ($3,$2,'CONTROL_ROOM_OPERATOR','Synthetic HTTP Operator'),
         ($4,$2,'ORGANIZATION_ADMIN','Synthetic HTTP Administrator'),
         ($5,$2,'READ_ONLY_AUDITOR','Synthetic HTTP Auditor'),
         ($6,$2,'FIELD_RESPONDER','Synthetic HTTP Responder')`,
        [
          roleId,
          organizationId,
          roleIds.CONTROL_ROOM_OPERATOR,
          roleIds.ORGANIZATION_ADMIN,
          roleIds.READ_ONLY_AUDITOR,
          roleIds.FIELD_RESPONDER,
        ],
      );
      await setup.query(
        `insert into app.memberships(id,organization_id,user_id,display_name,status,activated_at)
         values($1,$2,$3,'Synthetic HTTP Operator','ACTIVE',now())`,
        [operatorMembershipId, organizationId, operatorUserId],
      );
      await setup.query(
        `insert into app.memberships(id,organization_id,user_id,display_name,status,activated_at)
         values($1,$2,$3,'Synthetic HTTP Responder','ACTIVE',now())`,
        [ordinaryMembershipId, organizationId, ordinaryUserId],
      );
      await setup.query(
        `insert into app.users(id,email_normalized,email_ciphertext,email_verified_at,status)
         values($1,$2,'synthetic-http-assignment-only',now(),'ACTIVE')`,
        [secondResponderUserId, `${secondResponderUserId}@example.invalid`],
      );
      await setup.query(
        `insert into app.memberships(id,organization_id,user_id,display_name,status,activated_at)
         values($1,$2,$3,'Synthetic HTTP Responder Two','ACTIVE',now())`,
        [secondResponderMembershipId, organizationId, secondResponderUserId],
      );
      await setup.query(
        `insert into app.vehicles(id,organization_id,call_sign,kind,service_state)
         values($1,$2,'SYNTHETIC-ASSIGN-1','Rescue','AVAILABLE'),
               ($3,$2,'SYNTHETIC-ASSIGN-2','Rescue','AVAILABLE')`,
        [assignmentVehicleId, organizationId, conflictVehicleId],
      );
      await setup.query(
        `insert into app.membership_roles(organization_id,membership_id,role_id)
         values($1,$2,$3),($1,$4,$5),($1,$6,$7)`,
        [
          organizationId,
          membershipId,
          roleId,
          operatorMembershipId,
          roleIds.CONTROL_ROOM_OPERATOR,
          ordinaryMembershipId,
          roleIds.FIELD_RESPONDER,
        ],
      );
      await setup.query(
        `insert into app.membership_roles(organization_id,membership_id,role_id)
         values($1,$2,$3)`,
        [organizationId, secondResponderMembershipId, roleIds.FIELD_RESPONDER],
      );
      await setup.query("select set_config('app.organization_id',$1,true)", [
        secondOrganizationId,
      ]);
      await setup.query(
        `insert into app.organizations(id,slug,name,status)
         values($1,$2,'Synthetic Secondary Tenant','ACTIVE')`,
        [secondOrganizationId, `http-${secondOrganizationId}`],
      );
      await setup.query(
        `insert into app.memberships(id,organization_id,user_id,display_name,status,activated_at)
         values($1,$2,$3,'Synthetic Operator Responder','ACTIVE',now())`,
        [randomUUID(), secondOrganizationId, operatorUserId],
      );
      const platformGrant = await setup.query(
        `insert into app.platform_grants(id,user_id,permission_id,state)
         select $1,$2,id,'ACTIVE' from app.permissions
         where domain='PLATFORM' and requires_privileged_mfa=true
         order by code limit 1`,
        [randomUUID(), platformUserId],
      );
      if (platformGrant.rowCount !== 1) {
        throw new Error(
          "No MFA-protected platform permission exists for fixture",
        );
      }
      await setup.query("select set_config('app.organization_id',$1,true)", [
        organizationId,
      ]);
      const grants: Array<[keyof typeof roleIds, string[], string]> = [
        [
          "CONTROL_ROOM_OPERATOR",
          [
            "listIncidents",
            "getIncident",
            "createIncident",
            "updateIncident",
            "transitionIncident",
            "listLocations",
            "createLocation",
            "getAssignments",
            "setAssignments",
          ],
          "TENANT",
        ],
        [
          "ORGANIZATION_ADMIN",
          ["listIncidents", "getIncident", "listLocations", "getAssignments"],
          "TENANT",
        ],
        [
          "READ_ONLY_AUDITOR",
          ["listIncidents", "getIncident", "listLocations", "getAssignments"],
          "TENANT",
        ],
        [
          "FIELD_RESPONDER",
          ["listIncidents", "getIncident", "listLocations", "getAssignments"],
          "ASSIGNED",
        ],
      ];
      for (const [role, permissions, scope] of grants) {
        await setup.query(
          `insert into app.role_permissions(organization_id,role_id,permission_id,resource_scope)
           select $1,$2,id,$4 from app.permissions where code=any($3::text[])`,
          [organizationId, roleIds[role], permissions, scope],
        );
      }
      await setup.query(
        `insert into app.role_permissions(organization_id,role_id,permission_id,resource_scope)
         select $1,$2,id,'TENANT' from app.permissions
         where code=any($3::text[])`,
        [
          organizationId,
          roleId,
          [
            "listIncidents",
            "getIncident",
            "createIncident",
            "updateIncident",
            "transitionIncident",
            "listLocations",
            "createLocation",
            "getAssignments",
            "setAssignments",
          ],
        ],
      );
      await setup.query("commit");
    } catch (error) {
      await setup.query("rollback");
      throw error;
    } finally {
      setup.release();
    }

    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;

    const login = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        login: email,
        password,
        client_kind: "MOBILE",
        client_binding: binding,
      }),
    });
    expect(login.status).toBe(201);
    const loginBody = (await login.json()) as Record<string, unknown>;
    expect(
      loginBody.challenge_id,
      JSON.stringify({
        authentication_state: loginBody.authentication_state,
        next_action: loginBody.next_action,
        purpose: loginBody.purpose,
      }),
    ).toBeDefined();
    const challenge = loginBody as { challenge_id: string };
    expect(loginBody.purpose).toBe("MFA_VERIFY");
    const totp = new TOTP({ secret: totpSecret, digits: 6, period: 30 });
    const verified = await fetch(`${baseUrl}/auth/mfa/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-challenge-binding": binding,
      },
      body: JSON.stringify({
        challenge_id: challenge.challenge_id,
        code: totp.generate(),
      }),
    });
    expect(verified.status, await verified.clone().text()).toBe(201);
    const handoff = (await verified.json()) as {
      handoff: { handoff_id: string };
    };
    const redeemed = await fetch(
      `${baseUrl}/auth/credential-handoffs/${handoff.handoff.handoff_id}/redeem`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-auth-challenge-binding": binding,
        },
        body: JSON.stringify({ purpose: "SESSION" }),
      },
    );
    expect(redeemed.status).toBe(200);
    const material = (await redeemed.json()) as {
      access_token: string;
      session_id: string;
    };
    sessionId = material.session_id;
    authorization = `Bearer ${material.access_token}`;
  }, 90_000);

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  it("rejects missing, invalid, and tenantless authentication before data access", async () => {
    const missing = await fetch(`${baseUrl}/incidents`);
    expect(missing.status).toBe(401);
    const invalid = await fetch(`${baseUrl}/incidents`, {
      headers: {
        authorization: "Bearer not-a-valid-token",
        "x-organization-id": organizationId,
      },
    });
    expect(invalid.status).toBe(401);
    const forgedTenant = await fetch(`${baseUrl}/incidents`, {
      headers: {
        authorization,
        "x-organization-id": randomUUID(),
      },
    });
    expect([403, 404]).toContain(forgedTenant.status);
    const { accessPrivateKey, keyId } = loadLocalSecrets();
    const now = Math.floor(Date.now() / 1000);
    const expiredToken = await new SignJWT({
      sid: sessionId,
      assurance: "MFA",
      auth_time: now - 600,
      mfa_verified_at: now - 600,
    })
      .setProtectedHeader({ alg: "EdDSA", kid: keyId, typ: "JWT" })
      .setIssuer("pbssu-rescue-ops-local")
      .setAudience("pbssu-rescue-ops-api")
      .setSubject(userId)
      .setIssuedAt(now - 600)
      .setExpirationTime(now - 1)
      .setJti(randomUUID())
      .sign(accessPrivateKey);
    const expired = await fetch(`${baseUrl}/incidents`, {
      headers: {
        authorization: `Bearer ${expiredToken}`,
        "x-organization-id": organizationId,
      },
    });
    expect(expired.status).toBe(401);
    const noTenant = await fetch(`${baseUrl}/incidents`, {
      headers: { authorization },
    });
    expect([400, 404]).toContain(noTenant.status);
  });

  it("requires MFA for a tenant-only Operator and preserves per-tenant authorization", async () => {
    const login = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        login: operatorEmail,
        password: operatorPassword,
        client_kind: "MOBILE",
        client_binding: operatorBinding,
      }),
    });
    expect(login.status).toBe(201);
    const challenge = (await login.json()) as {
      challenge_id: string;
      purpose: string;
      authentication_state: string;
    };
    expect(challenge.purpose).toBe("MFA_VERIFY");
    expect(challenge.authentication_state).not.toBe("SESSION_HANDOFF_REQUIRED");

    const verified = await fetch(`${baseUrl}/auth/mfa/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-challenge-binding": operatorBinding,
      },
      body: JSON.stringify({
        challenge_id: challenge.challenge_id,
        code: new TOTP({
          secret: operatorTotpSecret,
          digits: 6,
          period: 30,
        }).generate(),
      }),
    });
    expect(verified.status, await verified.clone().text()).toBe(201);
    const handoff = (await verified.json()) as {
      handoff: { handoff_id: string };
    };
    const redeemed = await fetch(
      `${baseUrl}/auth/credential-handoffs/${handoff.handoff.handoff_id}/redeem`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-auth-challenge-binding": operatorBinding,
        },
        body: JSON.stringify({ purpose: "SESSION" }),
      },
    );
    expect(redeemed.status).toBe(200);
    const session = (await redeemed.json()) as { access_token: string };
    const tenantHeaders = {
      authorization: `Bearer ${session.access_token}`,
      "x-organization-id": organizationId,
    };
    expect(
      (await fetch(`${baseUrl}/incidents`, { headers: tenantHeaders })).status,
    ).toBe(200);

    // The same user is only an ordinary responder in the second organization.
    // MFA satisfies identity assurance but does not transfer tenant grants.
    const otherTenant = await fetch(`${baseUrl}/incidents`, {
      headers: { ...tenantHeaders, "x-organization-id": secondOrganizationId },
    });
    expect([403, 404]).toContain(otherTenant.status);
  });

  it("allows password-only assurance for an ordinary member but denies privileged writes", async () => {
    const login = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        login: ordinaryEmail,
        password: ordinaryPassword,
        client_kind: "MOBILE",
        client_binding: ordinaryBinding,
      }),
    });
    expect(login.status).toBe(201);
    const result = (await login.json()) as {
      authentication_state: string;
      handoff: { handoff_id: string };
    };
    expect(result.authentication_state).toBe("SESSION_HANDOFF_REQUIRED");
    const redeemed = await fetch(
      `${baseUrl}/auth/credential-handoffs/${result.handoff.handoff_id}/redeem`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-auth-challenge-binding": ordinaryBinding,
        },
        body: JSON.stringify({ purpose: "SESSION" }),
      },
    );
    expect(redeemed.status).toBe(200);
    const session = (await redeemed.json()) as { access_token: string };
    const denied = await fetch(`${baseUrl}/incidents`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.access_token}`,
        "x-organization-id": organizationId,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Synthetic unauthorized write",
        category: "OTHER",
        occurred_at: "2026-11-05T08:00:00Z",
        source_kind: "TEST",
      }),
    });
    expect(denied.status).toBe(403);
  });

  it("requires MFA for a platform-only identity without granting tenant incident access", async () => {
    const login = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        login: platformEmail,
        password: platformPassword,
        client_kind: "MOBILE",
        client_binding: platformBinding,
      }),
    });
    expect(login.status).toBe(201);
    const challenge = (await login.json()) as {
      challenge_id: string;
      purpose: string;
    };
    expect(challenge.purpose).toBe("MFA_VERIFY");
    const expired = await owner.query(
      "update app.auth_challenges set expires_at=now()-interval '1 minute' where id=$1",
      [challenge.challenge_id],
    );
    expect(expired.rowCount).toBe(1);
    const expiredVerification = await fetch(`${baseUrl}/auth/mfa/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-challenge-binding": platformBinding,
      },
      body: JSON.stringify({
        challenge_id: challenge.challenge_id,
        code: new TOTP({
          secret: platformTotpSecret,
          digits: 6,
          period: 30,
        }).generate(),
      }),
    });
    expect([400, 401, 403]).toContain(expiredVerification.status);

    const freshLogin = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        login: platformEmail,
        password: platformPassword,
        client_kind: "MOBILE",
        client_binding: platformBinding,
      }),
    });
    const freshChallenge = (await freshLogin.json()) as {
      challenge_id: string;
    };
    const verified = await fetch(`${baseUrl}/auth/mfa/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-challenge-binding": platformBinding,
      },
      body: JSON.stringify({
        challenge_id: freshChallenge.challenge_id,
        code: new TOTP({
          secret: platformTotpSecret,
          digits: 6,
          period: 30,
        }).generate(),
      }),
    });
    expect(verified.status).toBe(201);
    const handoff = (await verified.json()) as {
      handoff: { handoff_id: string };
    };
    const redeemed = await fetch(
      `${baseUrl}/auth/credential-handoffs/${handoff.handoff.handoff_id}/redeem`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-auth-challenge-binding": platformBinding,
        },
        body: JSON.stringify({ purpose: "SESSION" }),
      },
    );
    expect(redeemed.status).toBe(200);
    const session = (await redeemed.json()) as { access_token: string };
    const tenantRead = await fetch(`${baseUrl}/incidents`, {
      headers: {
        authorization: `Bearer ${session.access_token}`,
        "x-organization-id": organizationId,
      },
    });
    expect([403, 404]).toContain(tenantRead.status);
  });

  it("fails closed without a session when RLS-backed privilege discovery fails", async () => {
    const before = await owner.query<{
      sessions: number;
      challenges: number;
      handoffs: number;
    }>(
      `select
         (select count(*)::int from app.sessions where user_id=$1) sessions,
         (select count(*)::int from app.auth_challenges where user_id=$1) challenges,
         (select count(*)::int from app.credential_handoffs where user_id=$1) handoffs`,
      [userId],
    );
    await owner.query(
      "revoke select on app.memberships from pbssu_m01_identity",
    );
    try {
      const response = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          login: email,
          password,
          client_kind: "MOBILE",
          client_binding: binding,
        }),
      });
      expect(response.status).toBe(500);
      const body = await response.text();
      expect(body).not.toMatch(
        /permission denied|memberships|tenant|role|privilege/i,
      );
      expect(body).not.toContain(email);
    } finally {
      await owner.query(
        "grant select on app.memberships to pbssu_m01_identity",
      );
    }
    const after = await owner.query<{
      sessions: number;
      challenges: number;
      handoffs: number;
    }>(
      `select
         (select count(*)::int from app.sessions where user_id=$1) sessions,
         (select count(*)::int from app.auth_challenges where user_id=$1) challenges,
         (select count(*)::int from app.credential_handoffs where user_id=$1) handoffs`,
      [userId],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it("executes all seven approved routes through real JWT, session, MFA, tenant, RBAC, and restricted DB paths", async () => {
    const headers = {
      authorization,
      "x-organization-id": organizationId,
      "content-type": "application/json",
    };
    const createdResponse = await fetch(`${baseUrl}/incidents`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Synthetic HTTP flood monitoring",
        category: "FLOOD_MONITORING",
        occurred_at: "2026-11-05T08:00:00Z",
        source_kind: "TEST",
      }),
    });
    expect(createdResponse.status).toBe(201);
    const incident = (await createdResponse.json()) as {
      id: string;
      version: number;
    };

    const listed = await fetch(`${baseUrl}/incidents`, { headers });
    expect(listed.status).toBe(200);
    expect(JSON.stringify(await listed.json())).toContain(incident.id);
    const got = await fetch(`${baseUrl}/incidents/${incident.id}`, { headers });
    expect(got.status).toBe(200);
    const updated = await fetch(`${baseUrl}/incidents/${incident.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        base_version: incident.version,
        title: "Synthetic HTTP update",
      }),
    });
    expect(updated.status).toBe(200);
    const current = (await updated.json()) as { version: number };
    const opened = await fetch(
      `${baseUrl}/incidents/${incident.id}/transitions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          base_version: current.version,
          target: "OPEN",
          reason: "Synthetic HTTP opening",
        }),
      },
    );
    expect(opened.status).toBe(200);
    const openIncident = (await opened.json()) as { version: number };

    const assignmentPath = `${baseUrl}/incidents/${incident.id}/assignments`;
    const assignmentBody = {
      base_version: openIncident.version,
      membership_ids: [ordinaryMembershipId],
      vehicle_ids: [assignmentVehicleId],
    };
    const assigned = await fetch(assignmentPath, {
      method: "PUT",
      headers,
      body: JSON.stringify(assignmentBody),
    });
    expect(assigned.status, await assigned.clone().text()).toBe(200);
    const assignedBody = (await assigned.json()) as {
      version: number;
      personnel: Array<{ membership_id: string; released_at?: string }>;
      vehicles: Array<{ vehicle_id: string; released_at?: string }>;
    };
    expect(assignedBody.version).toBe(openIncident.version + 1);
    expect(assignedBody.personnel).toMatchObject([
      { membership_id: ordinaryMembershipId },
    ]);
    expect(assignedBody.vehicles).toMatchObject([
      { vehicle_id: assignmentVehicleId },
    ]);
    const assignmentsRead = await fetch(assignmentPath, { headers });
    expect(assignmentsRead.status).toBe(200);
    expect(await assignmentsRead.json()).toMatchObject({
      incident_id: incident.id,
      version: openIncident.version + 1,
    });

    const identical = await fetch(assignmentPath, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        ...assignmentBody,
        base_version: assignedBody.version,
      }),
    });
    expect(identical.status).toBe(200);
    expect((await identical.json()).version).toBe(assignedBody.version);

    const conflictIncidentResponse = await fetch(`${baseUrl}/incidents`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Synthetic uniqueness conflict",
        category: "OTHER",
        occurred_at: "2026-11-05T08:00:00Z",
        source_kind: "TEST",
      }),
    });
    expect(conflictIncidentResponse.status).toBe(201);
    const conflictIncident = (await conflictIncidentResponse.json()) as {
      id: string;
      version: number;
    };
    const uniquenessConflict = await fetch(
      `${baseUrl}/incidents/${conflictIncident.id}/assignments`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          base_version: conflictIncident.version,
          membership_ids: [ordinaryMembershipId],
          vehicle_ids: [conflictVehicleId],
        }),
      },
    );
    expect(uniquenessConflict.status).toBe(409);
    const conflictText = await uniquenessConflict.text();
    expect(conflictText).toContain('"code":"CONFLICT"');
    expect(conflictText).not.toContain(ordinaryUserId);
    expect(conflictText).not.toContain(incident.id);
    expect(conflictText).not.toContain(assignmentVehicleId);

    await selectRole("ORGANIZATION_ADMIN");
    expect((await fetch(assignmentPath, { headers })).status).toBe(200);
    const adminAssignmentWrite = await fetch(assignmentPath, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        ...assignmentBody,
        base_version: assignedBody.version,
      }),
    });
    expect(adminAssignmentWrite.status).toBe(403);
    await selectRole("FIELD_RESPONDER");
    expect((await fetch(assignmentPath, { headers })).status).toBe(404);
    const responderAssignmentWrite = await fetch(assignmentPath, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        ...assignmentBody,
        base_version: assignedBody.version,
      }),
    });
    expect(responderAssignmentWrite.status).toBe(403);
    await selectRole("INCIDENT_COMMANDER");

    const released = await fetch(assignmentPath, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        base_version: assignedBody.version,
        membership_ids: [],
        vehicle_ids: [],
      }),
    });
    expect(released.status).toBe(200);
    const releasedBody = (await released.json()) as {
      version: number;
      personnel: Array<{ released_at?: string }>;
      vehicles: Array<{ released_at?: string }>;
    };
    expect(releasedBody.version).toBe(assignedBody.version + 1);
    expect(releasedBody.personnel[0]?.released_at).toBeTruthy();
    expect(releasedBody.vehicles[0]?.released_at).toBeTruthy();
    const readded = await fetch(assignmentPath, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        ...assignmentBody,
        base_version: releasedBody.version,
      }),
    });
    expect(readded.status).toBe(200);
    const readdedBody = (await readded.json()) as {
      version: number;
      personnel: Array<{ id: string; released_at?: string }>;
      vehicles: Array<{ id: string; released_at?: string }>;
    };
    expect(readdedBody.version).toBe(releasedBody.version + 1);
    expect(readdedBody.personnel).toHaveLength(2);
    expect(readdedBody.vehicles).toHaveLength(2);
    expect(readdedBody.personnel[0]?.id).not.toBe(readdedBody.personnel[1]?.id);
    expect(readdedBody.vehicles[0]?.id).not.toBe(readdedBody.vehicles[1]?.id);
    let assignmentVersion = readdedBody.version;
    const concurrentCommands = await Promise.all([
      fetch(assignmentPath, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          base_version: assignmentVersion,
          membership_ids: [],
          vehicle_ids: [assignmentVehicleId],
        }),
      }),
      fetch(assignmentPath, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          base_version: assignmentVersion,
          membership_ids: [secondResponderMembershipId],
          vehicle_ids: [],
        }),
      }),
    ]);
    const concurrentResults = await Promise.all(
      concurrentCommands.map(async (response) => ({
        status: response.status,
        body: await response.json(),
      })),
    );
    expect(concurrentResults.map(({ status }) => status).sort()).toEqual([
      200, 409,
    ]);
    expect(
      concurrentResults.find(({ status }) => status === 409)?.body,
    ).toMatchObject({ code: "STALE_VERSION" });
    assignmentVersion += 1;

    await selectRole("CONTROL_ROOM_OPERATOR");
    const operatorRead = await fetch(assignmentPath, { headers });
    expect(operatorRead.status).toBe(200);
    const operatorAssignments = (await operatorRead.json()) as {
      version: number;
      personnel: Array<{ membership_id: string; released_at?: string }>;
      vehicles: Array<{ vehicle_id: string; released_at?: string }>;
    };
    const operatorNoop = await fetch(assignmentPath, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        base_version: operatorAssignments.version,
        membership_ids: operatorAssignments.personnel
          .filter((assignment) => !assignment.released_at)
          .map((assignment) => assignment.membership_id),
        vehicle_ids: operatorAssignments.vehicles
          .filter((assignment) => !assignment.released_at)
          .map((assignment) => assignment.vehicle_id),
      }),
    });
    expect(operatorNoop.status).toBe(200);
    await selectRole("INCIDENT_COMMANDER");

    const missingAccuracy = await fetch(
      `${baseUrl}/incidents/${incident.id}/locations`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          base_version: assignmentVersion,
          label: "Synthetic invalid point",
          point: { longitude: 101.68, latitude: 3.14 },
        }),
      },
    );
    expect(missingAccuracy.status).toBe(400);
    const location = await fetch(
      `${baseUrl}/incidents/${incident.id}/locations`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          base_version: assignmentVersion,
          label: "Synthetic HTTP location",
          point: {
            longitude: 101.68,
            latitude: 3.14,
            accuracy_m: 8.5,
          },
        }),
      },
    );
    expect(location.status).toBe(201);
    const listedLocations = await fetch(
      `${baseUrl}/incidents/${incident.id}/locations`,
      { headers },
    );
    expect(listedLocations.status).toBe(200);
    expect(JSON.stringify(await listedLocations.json())).toContain(
      "Synthetic HTTP location",
    );

    const stale = await fetch(`${baseUrl}/incidents/${incident.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        base_version: incident.version,
        title: "Stale synthetic update",
      }),
    });
    expect(stale.status).toBe(409);
    expect(JSON.stringify(await stale.json())).toContain("STALE_VERSION");

    await selectRole("CONTROL_ROOM_OPERATOR");
    const operatorCancel = await fetch(
      `${baseUrl}/incidents/${incident.id}/transitions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          base_version: assignmentVersion + 1,
          target: "CANCELLED",
          reason: "Synthetic operator denial probe",
        }),
      },
    );
    expect(operatorCancel.status).toBe(403);
    await selectRole("INCIDENT_COMMANDER");

    const cancellationReason = "Synthetic restricted cancellation reason";
    const cancelled = await fetch(
      `${baseUrl}/incidents/${incident.id}/transitions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          base_version: assignmentVersion + 1,
          target: "CANCELLED",
          reason: cancellationReason,
        }),
      },
    );
    expect(cancelled.status).toBe(200);
    expect(await cancelled.text()).not.toContain(cancellationReason);
    const cancelledRead = await fetch(`${baseUrl}/incidents/${incident.id}`, {
      headers,
    });
    expect(cancelledRead.status).toBe(200);
    expect(await cancelledRead.text()).not.toContain(cancellationReason);

    await selectRole("ORGANIZATION_ADMIN");
    const adminWrite = await fetch(`${baseUrl}/incidents`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Synthetic unauthorized write",
        category: "OTHER",
        occurred_at: "2026-11-05T08:00:00Z",
        source_kind: "TEST",
      }),
    });
    expect(adminWrite.status).toBe(403);

    await selectRole("READ_ONLY_AUDITOR");
    const auditorRead = await fetch(`${baseUrl}/incidents/${incident.id}`, {
      headers,
    });
    expect(auditorRead.status).toBe(200);
    expect(await auditorRead.text()).not.toContain(cancellationReason);

    await selectRole("FIELD_RESPONDER");
    const responderList = await fetch(`${baseUrl}/incidents`, { headers });
    expect(responderList.status).toBe(200);
    expect(await responderList.text()).toContain('"items":[]');
    const responderGet = await fetch(`${baseUrl}/incidents/${incident.id}`, {
      headers,
    });
    expect(responderGet.status).toBe(404);
    const responderCreate = await fetch(`${baseUrl}/incidents`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Synthetic responder denied write",
        category: "OTHER",
        occurred_at: "2026-11-05T08:00:00Z",
        source_kind: "TEST",
      }),
    });
    expect(responderCreate.status).toBe(403);
  });
});
