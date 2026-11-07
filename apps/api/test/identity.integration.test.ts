import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import * as argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { IdentityService } from "../src/identity/identity.service.js";

interface DevelopmentDatabaseState {
  ownerUrl: string;
  runtimeUrl: string;
  identityUrl: string;
  databaseName: string;
  container: string;
  image: string;
}

const state = JSON.parse(
  readFileSync(
    process.env.PBSSU_TEST_DATABASE_STATE ??
      new URL("../../../.cache/m01/database.json", import.meta.url),
    "utf8",
  ),
) as DevelopmentDatabaseState;
const userId = randomUUID();
const email = `${userId}@example.invalid`;
const password = `Synthetic!${randomBytes(24).toString("base64url")}`;
const replacementPassword = `Synthetic!${randomBytes(24).toString("base64url")}`;
const binding = randomBytes(32).toString("base64url");
const factorId = randomUUID();
const recoveryCodeHash = randomBytes(32).toString("hex");
const owner = new Pool({ connectionString: state.ownerUrl, max: 1 });
let identity: IdentityService;

describe("M01 identity session lifecycle", () => {
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
       values ($1,$2,'synthetic-ciphertext',now(),'ACTIVE')`,
      [userId, email],
    );
    await owner.query(
      "insert into app.password_credentials (user_id,password_hash) values($1,$2)",
      [userId, passwordHash],
    );
    await owner.query(
      `insert into app.mfa_credentials (id,user_id,seed_ciphertext,encryption_key_ref,state,confirmed_at)
       values($1,$2,'synthetic-encrypted-seed','local-test-key','ACTIVE',now())`,
      [factorId, userId],
    );
    await owner.query(
      "insert into app.recovery_codes (user_id,mfa_credential_id,code_hash) values($1,$2,$3)",
      [userId, factorId, recoveryCodeHash],
    );
    identity = new IdentityService();
  }, 30_000);

  afterAll(async () => {
    await owner.query("delete from app.credential_handoffs where user_id=$1", [
      userId,
    ]);
    await owner.query(
      "delete from app.identity_delivery_jobs where user_id=$1",
      [userId],
    );
    await owner.query(
      "delete from app.account_action_tokens where user_id=$1",
      [userId],
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
    await owner.query("delete from app.password_credentials where user_id=$1", [
      userId,
    ]);
    await owner.query(
      "update app.users set status='DISABLED',authentication_version=authentication_version+1 where id=$1",
      [userId],
    );
    await identity.onModuleDestroy();
    await owner.end();
  });

  it("keeps generic login metadata secret-free and releases credentials once by binding", async () => {
    const result = await identity.login({
      login: email,
      password,
      client_kind: "MOBILE",
      client_binding: binding,
    });
    expect(result.authentication_state).toBe("SESSION_HANDOFF_REQUIRED");
    expect(JSON.stringify(result)).not.toMatch(
      /access_token|refresh_token|password_hash/,
    );
    const handoff = result.handoff as { handoff_id: string; purpose: string };
    expect(handoff.purpose).toBe("SESSION");

    const response = {
      cookie: () => undefined,
      clearCookie: () => undefined,
      setHeader: () => undefined,
    };
    await expect(
      identity.redeemCredentialHandoff(
        handoff.handoff_id,
        { purpose: "SESSION" },
        randomBytes(32).toString("base64url"),
        {},
        undefined,
        undefined,
        response,
      ),
    ).rejects.toThrow();

    const material = await identity.redeemCredentialHandoff(
      handoff.handoff_id,
      { purpose: "SESSION" },
      binding,
      {},
      undefined,
      undefined,
      response,
    );
    expect(material).toMatchObject({ kind: "MOBILE_SESSION" });
    const delivered = material as {
      access_token: string;
      refresh_token: string;
      session_id: string;
    };
    expect(
      await identity.authenticateAccessToken(delivered.access_token),
    ).toMatchObject({
      userId,
      sessionId: delivered.session_id,
      assurance: "PASSWORD",
    });
    await expect(
      identity.redeemCredentialHandoff(
        handoff.handoff_id,
        { purpose: "SESSION" },
        binding,
        {},
        undefined,
        undefined,
        response,
      ),
    ).rejects.toThrow();
  });

  it("rotates refresh credentials and revokes the family on reuse", async () => {
    const login = await identity.login({
      login: email,
      password,
      client_kind: "MOBILE",
      client_binding: binding,
    });
    const firstHandoff = login.handoff as { handoff_id: string };
    const response = {
      cookie: () => undefined,
      clearCookie: () => undefined,
      setHeader: () => undefined,
    };
    const firstMaterial = await identity.redeemCredentialHandoff(
      firstHandoff.handoff_id,
      { purpose: "SESSION" },
      binding,
      {},
      undefined,
      undefined,
      response,
    );
    const firstRefresh = (firstMaterial as { refresh_token: string })
      .refresh_token;
    const nextSession = await identity.refreshSession(firstRefresh, "MOBILE");
    expect(nextSession.authentication_state).toBe("SESSION_HANDOFF_REQUIRED");
    expect(JSON.stringify(nextSession)).not.toContain("refresh_token");

    await expect(
      identity.refreshSession(firstRefresh, "MOBILE"),
    ).rejects.toThrow();
    const stateRow = await owner.query<{ status: string }>(
      "select status from app.sessions where id=$1",
      [(nextSession as { session_id: string }).session_id],
    );
    expect(stateRow.rows[0]?.status).toBe("REVOKED");
  });

  it("keeps recovery non-enumerating, one-time, and separate from MFA recovery", async () => {
    const unknown = await identity.requestPasswordReset({
      email: `nobody-${randomUUID()}@example.invalid`,
    });
    const known = await identity.requestPasswordReset({ email });
    expect(unknown.status).toBe("REQUEST_ACCEPTED");
    expect(known.status).toBe("REQUEST_ACCEPTED");

    const message = identity
      .takeMockMessagesForTests()
      .find((item) => item.purpose === "RESET_PASSWORD");
    expect(message?.recipient).toBe(email);
    expect(message?.token).toBeDefined();
    expect(JSON.stringify(known)).not.toContain(
      message?.token ?? "never-match",
    );

    const action = await owner.query<{
      token_hash: string;
      encrypted_envelope: string;
    }>(
      `select a.token_hash,j.encrypted_envelope
       from app.account_action_tokens a
       join app.identity_delivery_jobs j on j.account_action_token_id=a.id
       where a.user_id=$1 and a.purpose='RESET_PASSWORD'`,
      [userId],
    );
    expect(action.rows[0]?.token_hash).not.toBe(message?.token);
    expect(action.rows[0]?.encrypted_envelope).not.toContain(
      message?.token ?? "never-match",
    );

    await identity.confirmPasswordReset({
      token: message?.token,
      new_password: replacementPassword,
    });
    await expect(
      identity.confirmPasswordReset({
        token: message?.token,
        new_password: `Synthetic!${randomBytes(24).toString("base64url")}`,
      }),
    ).rejects.toThrow();
    await expect(
      identity.login({
        login: email,
        password,
        client_kind: "MOBILE",
        client_binding: binding,
      }),
    ).rejects.toThrow();
    expect(
      await identity.login({
        login: email,
        password: replacementPassword,
        client_kind: "MOBILE",
        client_binding: binding,
      }),
    ).toMatchObject({ authentication_state: "SESSION_HANDOFF_REQUIRED" });

    const factor = await owner.query<{ state: string }>(
      "select state from app.mfa_credentials where id=$1",
      [factorId],
    );
    const recovery = await owner.query<{ count: string }>(
      `select count(*)::text as count from app.recovery_codes
       where user_id=$1 and used_at is null and revoked_at is null`,
      [userId],
    );
    expect(factor.rows[0]?.state).toBe("ACTIVE");
    expect(recovery.rows[0]?.count).toBe("1");
  });
});
