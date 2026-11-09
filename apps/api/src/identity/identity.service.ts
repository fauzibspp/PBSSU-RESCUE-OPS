import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  Injectable,
  OnModuleDestroy,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { SignJWT, compactVerify, jwtVerify } from "jose";
import * as argon2 from "argon2";
import { Secret, TOTP } from "otpauth";
import { Pool, type PoolClient } from "pg";
import { loadEnvironment } from "../config.js";
import { loadLocalSecrets } from "./local-secrets.js";

interface IdentityRow {
  id: string;
  email_normalized: string;
  email_verified_at: Date | null;
  status: string;
  authentication_version: number;
  password_hash: string;
}

interface ChallengeRow {
  id: string;
  user_id: string;
  session_id: string | null;
  invitation_organization_id: string | null;
  invitation_id: string | null;
  purpose: string;
  state: string;
  client_kind: "WEB" | "MOBILE";
  client_binding_hash: string;
  authentication_version: number;
  attempts: number;
  max_attempts: number;
  expires_at: Date;
  password_verified_at: Date | null;
  mfa_verified_at: Date | null;
}

interface HandoffRow {
  id: string;
  user_id: string;
  session_id: string | null;
  challenge_id: string | null;
  mfa_credential_id: string | null;
  purpose: string;
  client_kind: "WEB" | "MOBILE";
  client_binding_hash: string;
  authentication_version: number;
  encrypted_material: string | null;
  state: string;
  expires_at: Date;
}

interface MockMessage {
  recipient: string;
  purpose: string;
  token: string;
  expiresAt: number;
}

export interface AuthenticatedIdentity {
  userId: string;
  sessionId: string;
  assurance: "PASSWORD" | "MFA";
  authTime: number;
  mfaVerifiedAt: number | null;
}

export interface CookieSink {
  cookie(name: string, value: string, options: Record<string, unknown>): void;
  clearCookie(name: string, options: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function encrypt(value: unknown): string {
  const { encryptionKey } = loadLocalSecrets();
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [nonce, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString("base64url"))
    .join(".");
}

function decrypt<T>(value: string): T {
  const parts = value.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted handoff material");
  }
  const { encryptionKey } = loadLocalSecrets();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    Buffer.from(parts[0] ?? "", "base64url"),
  );
  decipher.setAuthTag(Buffer.from(parts[1] ?? "", "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(parts[2] ?? "", "base64url")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as T;
}

function safeIdentifier(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new BadRequestException("Invalid request");
  }
  return value;
}

function safePassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 15 || value.length > 128) {
    throw new BadRequestException("Invalid request");
  }
  return value;
}

function emailAddress(value: unknown): string {
  if (typeof value !== "string" || value.length > 254) {
    throw new BadRequestException("Invalid request");
  }
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@example\.invalid$/.test(normalized)) {
    throw new BadRequestException("Invalid local synthetic recipient");
  }
  return normalized;
}

@Injectable()
export class IdentityService implements OnModuleDestroy {
  private readonly pool: Pool;
  private readonly environment = loadEnvironment(process.env);
  private readonly loginAttempts = new Map<
    string,
    { count: number; start: number }
  >();
  private readonly mockMailbox: MockMessage[] = [];

  constructor() {
    this.pool = new Pool({
      connectionString: this.environment.IDENTITY_DATABASE_URL,
      max: 8,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 1000,
      application_name: "pbssu_m01_identity",
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async requirePlatformPermission(
    token: string,
    permissionCode: string,
  ): Promise<AuthenticatedIdentity> {
    const actor = await this.authenticateAccessToken(token);
    const result = await this.pool.query<{ requires_privileged_mfa: boolean }>(
      `select p.requires_privileged_mfa from app.platform_grants g
       join app.permissions p on p.id=g.permission_id
       where g.user_id=$1 and g.state='ACTIVE' and p.code=$2`,
      [actor.userId, permissionCode],
    );
    const grant = result.rows[0];
    if (
      !grant ||
      (grant.requires_privileged_mfa && actor.assurance !== "MFA")
    ) {
      throw new ForbiddenException("Access denied");
    }
    return actor;
  }

  async listOrganizations(
    token: string,
    cursor?: string,
    limitValue?: string,
  ): Promise<Record<string, unknown>> {
    await this.requirePlatformPermission(token, "listOrganizations");
    const limit = limitValue === undefined ? 50 : Number(limitValue);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200)
      throw new BadRequestException("Invalid request");
    let after: string | null = null;
    if (cursor) {
      try {
        after = Buffer.from(cursor, "base64url").toString("utf8");
      } catch {
        throw new BadRequestException("Invalid request");
      }
      if (!/^[0-9a-f-]{36}$/i.test(after))
        throw new BadRequestException("Invalid request");
    }
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      await connection.query(
        "select set_config('app.platform_metadata','true',true)",
      );
      const rows = await connection.query(
        `select id,version,created_at,name,slug,status from app.organizations
         where ($1::uuid is null or id>$1::uuid) order by id limit $2`,
        [after, limit + 1],
      );
      await connection.query("commit");
      const items = rows.rows.slice(0, limit);
      return {
        items,
        next_cursor:
          rows.rows.length > limit
            ? Buffer.from(String(items.at(-1)?.id)).toString("base64url")
            : null,
      };
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  async onboardOrganization(
    token: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const actor = await this.requirePlatformPermission(
      token,
      "onboardOrganization",
    );
    const name = typeof input.name === "string" ? input.name.trim() : "";
    const slug = typeof input.slug === "string" ? input.slug : "";
    const email =
      typeof input.initial_admin_email === "string"
        ? input.initial_admin_email.trim().toLowerCase()
        : "";
    const displayName =
      typeof input.initial_admin_display_name === "string"
        ? input.initial_admin_display_name.trim()
        : "";
    if (
      Object.keys(input).some(
        (key) =>
          ![
            "name",
            "slug",
            "initial_admin_email",
            "initial_admin_display_name",
          ].includes(key),
      ) ||
      !name ||
      name.length > 200 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      slug.length > 64 ||
      !/^[^\s@]+@example\.invalid$/.test(email) ||
      !displayName ||
      displayName.length > 200
    )
      throw new BadRequestException("Invalid local onboarding request");
    const permissionCodes = [
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
      "listIncidents",
      "getIncident",
      "listVehicles",
      "createVehicle",
      "updateVehicle",
    ];
    const orgId = randomUUID();
    const invitationId = randomUUID();
    const actionId = randomUUID();
    const rawToken = randomBytes(32).toString("base64url");
    const expires = new Date(Date.now() + 60 * 60_000);
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      await connection.query(
        "select set_config('app.organization_id',$1,true),set_config('app.actor_user_id',$2,true)",
        [orgId, actor.userId],
      );
      const platformGrant = await connection.query<{ id: string }>(
        `select g.id from app.platform_grants g join app.permissions p on p.id=g.permission_id
         where g.user_id=$1 and g.state='ACTIVE' and p.code='onboardOrganization' for share`,
        [actor.userId],
      );
      if (!platformGrant.rows[0]) throw new ForbiddenException("Access denied");
      await connection.query(
        "insert into app.organizations (id,slug,name,status) values($1,$2,$3,'ONBOARDING')",
        [orgId, slug, name],
      );
      const templates = [
        ["ORGANIZATION_ADMIN", "Organization Admin", false, true],
        ["CONTROL_ROOM_OPERATOR", "Control Room Operator", true, true],
        ["INCIDENT_COMMANDER", "Incident Commander", true, true],
        ["FIELD_RESPONDER", "Field Responder", true, false],
        ["READ_ONLY_AUDITOR", "Read-Only Auditor", true, true],
      ] as const;
      const templateIds = new Map<string, string>();
      for (const [code, roleName, delegable, locked] of templates) {
        const id = randomUUID();
        templateIds.set(code, id);
        await connection.query(
          "insert into app.roles (id,organization_id,code,name,delegable,locked_template) values($1,$2,$3,$4,$5,$6)",
          [id, orgId, code, roleName, delegable, locked],
        );
      }
      const adminRoleId = templateIds.get("ORGANIZATION_ADMIN");
      if (!adminRoleId)
        throw new Error("Organization administrator template missing");
      const grants = await connection.query<{
        id: string;
        code: string;
        valid_scopes: string[];
      }>(
        "select id,code,valid_scopes from app.permissions where code=any($1::text[]) and domain='TENANT'",
        [permissionCodes],
      );
      if (grants.rows.length !== permissionCodes.length)
        throw new Error("Permission catalogue incomplete");
      for (const grant of grants.rows) {
        if (!grant.valid_scopes.includes("TENANT"))
          throw new Error("Invalid administrator permission scope");
        await connection.query(
          "insert into app.role_permissions (organization_id,role_id,permission_id,resource_scope) values($1,$2,$3,'TENANT')",
          [orgId, adminRoleId, grant.id],
        );
      }
      const vehicleReadGrant = grants.rows.find(
        (grant) => grant.code === "listVehicles",
      );
      if (!vehicleReadGrant?.valid_scopes.includes("TENANT"))
        throw new Error("Vehicle roster permission missing");
      for (const roleCode of ["CONTROL_ROOM_OPERATOR", "INCIDENT_COMMANDER"]) {
        const roleId = templateIds.get(roleCode);
        if (!roleId) throw new Error("Approved operational role missing");
        await connection.query(
          "insert into app.role_permissions (organization_id,role_id,permission_id,resource_scope) values($1,$2,$3,'TENANT')",
          [orgId, roleId, vehicleReadGrant.id],
        );
      }
      const incidentGrants = await connection.query<{
        id: string;
        code: string;
        valid_scopes: string[];
      }>(
        "select id,code,valid_scopes from app.permissions where code=any($1::text[]) and domain='TENANT'",
        [
          [
            "listIncidents",
            "getIncident",
            "createIncident",
            "updateIncident",
            "transitionIncident",
          ],
        ],
      );
      if (incidentGrants.rows.length !== 5)
        throw new Error("Incident permission catalogue incomplete");
      for (const roleCode of ["CONTROL_ROOM_OPERATOR", "INCIDENT_COMMANDER"]) {
        const roleId = templateIds.get(roleCode);
        if (!roleId) throw new Error("Approved operational role missing");
        for (const grant of incidentGrants.rows) {
          if (!grant.valid_scopes.includes("TENANT"))
            throw new Error("Invalid incident permission scope");
          await connection.query(
            "insert into app.role_permissions (organization_id,role_id,permission_id,resource_scope) values($1,$2,$3,'TENANT')",
            [orgId, roleId, grant.id],
          );
        }
      }
      for (const [roleCode, scope] of [
        ["FIELD_RESPONDER", "ASSIGNED"],
        ["READ_ONLY_AUDITOR", "TENANT"],
      ] as const) {
        const roleId = templateIds.get(roleCode);
        if (!roleId) throw new Error("Approved read role missing");
        for (const code of ["listIncidents", "getIncident"]) {
          const grant = incidentGrants.rows.find((item) => item.code === code);
          if (!grant?.valid_scopes.includes(scope))
            throw new Error("Invalid incident read scope");
          await connection.query(
            "insert into app.role_permissions (organization_id,role_id,permission_id,resource_scope) values($1,$2,$3,$4)",
            [orgId, roleId, grant.id, scope],
          );
        }
      }
      const locationGrants = await connection.query<{
        id: string;
        code: string;
        valid_scopes: string[];
      }>(
        "select id,code,valid_scopes from app.permissions where code=any($1::text[]) and domain='TENANT'",
        [["listLocations", "createLocation"]],
      );
      if (locationGrants.rows.length !== 2)
        throw new Error("Location permission catalogue incomplete");
      for (const roleCode of ["CONTROL_ROOM_OPERATOR", "INCIDENT_COMMANDER"]) {
        const roleId = templateIds.get(roleCode);
        if (!roleId) throw new Error("Approved location role missing");
        for (const grant of locationGrants.rows) {
          if (!grant.valid_scopes.includes("TENANT"))
            throw new Error("Invalid location permission scope");
          await connection.query(
            "insert into app.role_permissions (organization_id,role_id,permission_id,resource_scope) values($1,$2,$3,'TENANT')",
            [orgId, roleId, grant.id],
          );
        }
      }
      const locationRead = locationGrants.rows.find(
        (grant) => grant.code === "listLocations",
      );
      if (!locationRead?.valid_scopes.includes("ASSIGNED"))
        throw new Error("Responder location read scope missing");
      for (const [roleCode, scope] of [
        ["ORGANIZATION_ADMIN", "TENANT"],
        ["FIELD_RESPONDER", "ASSIGNED"],
        ["READ_ONLY_AUDITOR", "TENANT"],
      ] as const) {
        const roleId = templateIds.get(roleCode);
        if (!roleId) throw new Error("Approved location read role missing");
        await connection.query(
          "insert into app.role_permissions (organization_id,role_id,permission_id,resource_scope) values($1,$2,$3,$4)",
          [orgId, roleId, locationRead.id, scope],
        );
      }
      const sprint4Grants = await connection.query<{
        id: string;
        code: string;
        valid_scopes: string[];
      }>(
        "select id,code,valid_scopes from app.permissions where code=any($1::text[]) and domain='TENANT'",
        [
          [
            "getAssignments",
            "setAssignments",
            "listMovements",
            "createMovement",
          ],
        ],
      );
      if (sprint4Grants.rows.length !== 4)
        throw new Error("Sprint 4 permission catalogue incomplete");
      const sprint4RoleGrants: ReadonlyArray<
        readonly [string, string, "TENANT" | "ASSIGNED"]
      > = [
        ...(
          [
            "ORGANIZATION_ADMIN",
            "CONTROL_ROOM_OPERATOR",
            "INCIDENT_COMMANDER",
            "READ_ONLY_AUDITOR",
          ] as const
        ).flatMap((role) =>
          (["getAssignments", "listMovements"] as const).map(
            (permission) => [role, permission, "TENANT"] as const,
          ),
        ),
        ["FIELD_RESPONDER", "getAssignments", "ASSIGNED"],
        ["FIELD_RESPONDER", "listMovements", "ASSIGNED"],
        ["CONTROL_ROOM_OPERATOR", "setAssignments", "TENANT"],
        ["INCIDENT_COMMANDER", "setAssignments", "TENANT"],
        ["CONTROL_ROOM_OPERATOR", "createMovement", "TENANT"],
        ["INCIDENT_COMMANDER", "createMovement", "TENANT"],
        ["FIELD_RESPONDER", "createMovement", "ASSIGNED"],
      ];
      for (const [roleCode, permissionCode, scope] of sprint4RoleGrants) {
        const roleId = templateIds.get(roleCode);
        const permission = sprint4Grants.rows.find(
          (grant) => grant.code === permissionCode,
        );
        if (!roleId || !permission?.valid_scopes.includes(scope))
          throw new Error(`Invalid Sprint 4 grant ${permissionCode}`);
        await connection.query(
          "insert into app.role_permissions (organization_id,role_id,permission_id,resource_scope) values($1,$2,$3,$4)",
          [orgId, roleId, permission.id, scope],
        );
      }
      const settingsId = randomUUID();
      await connection.query(
        "insert into app.organization_settings (id,organization_id,key,value) values($1,$2,'primary_language','ms')",
        [settingsId, orgId],
      );
      await connection.query(
        `insert into app.organization_invitations
         (id,organization_id,kind,target_email_ciphertext,target_email_digest,display_name,platform_grant_id,expires_at)
         values($1,$2,'FIRST_ADMIN',$3,$4,$5,$6,$7)`,
        [
          invitationId,
          orgId,
          encrypt({ email }),
          digest(email),
          displayName,
          platformGrant.rows[0].id,
          expires,
        ],
      );
      await connection.query(
        "insert into app.invitation_roles (organization_id,invitation_id,role_id) values($1,$2,$3)",
        [orgId, invitationId, adminRoleId],
      );
      await connection.query(
        `insert into app.account_action_tokens (id,subject_email_digest,purpose,token_hash,invitation_organization_id,invitation_id,expires_at)
         values($1,$2,'INVITATION',$3,$4,$5,$6)`,
        [
          actionId,
          digest(email),
          digest(rawToken),
          orgId,
          invitationId,
          expires,
        ],
      );
      await connection.query(
        `insert into app.identity_delivery_jobs (account_action_token_id,purpose,state,encrypted_envelope,key_ref,expires_at,purge_at)
         values($1,'INVITATION','PENDING',$2,$3,$4,$4)`,
        [
          actionId,
          encrypt({ recipient: email, token: rawToken }),
          loadLocalSecrets().keyId,
          expires,
        ],
      );
      await connection.query(
        `insert into app.identity_audit_logs (actor_user_id,subject_user_id,action_code,result_code,reason_code,resource_type,resource_id,correlation_id)
         values($1,null,'ORGANIZATION_ONBOARD','SUCCESS','INVITATION_QUEUED','ORGANIZATION',$2,$3)`,
        [actor.userId, orgId, randomUUID()],
      );
      await connection.query("commit");
      this.queueMockMessage({
        recipient: email,
        purpose: "INVITATION",
        token: rawToken,
        expiresAt: expires.getTime(),
      });
      return {
        organization: {
          id: orgId,
          version: 1,
          created_at: new Date().toISOString(),
          name,
          slug,
          status: "ONBOARDING",
        },
        invitation: {
          id: invitationId,
          version: 1,
          created_at: new Date().toISOString(),
          organization_id: orgId,
          status: "PENDING",
          kind: "FIRST_ADMIN",
          expires_at: expires.toISOString(),
        },
      };
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      if ((error as { code?: string }).code === "23505")
        throw new ConflictException("Organization onboarding unavailable");
      throw error;
    } finally {
      connection.release();
    }
  }

  async inviteMember(
    token: string,
    organizationValue: unknown,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const organizationId = safeIdentifier(organizationValue);
    const actor = await this.authenticateAccessToken(token);
    const email = emailAddress(input.email);
    const displayName =
      typeof input.display_name === "string" ? input.display_name.trim() : "";
    if (
      !displayName ||
      displayName.length > 200 ||
      !Array.isArray(input.role_ids) ||
      input.role_ids.length < 1 ||
      input.role_ids.length > 20 ||
      new Set(input.role_ids).size !== input.role_ids.length ||
      Object.keys(input).some(
        (key) => !["email", "display_name", "role_ids"].includes(key),
      )
    )
      throw new BadRequestException("Invalid invitation request");
    const roleIds = input.role_ids.map(safeIdentifier);
    const invitationId = randomUUID();
    const actionId = randomUUID();
    const rawToken = randomBytes(32).toString("base64url");
    const expires = new Date(Date.now() + 60 * 60_000);
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      await connection.query(
        "select set_config('app.organization_id',$1,true),set_config('app.actor_user_id',$2,true)",
        [organizationId, actor.userId],
      );
      const authority = await connection.query<{
        membership_id: string;
        requires_privileged_mfa: boolean;
      }>(
        `select m.id as membership_id,p.requires_privileged_mfa from app.memberships m
         join app.membership_roles mr on mr.organization_id=m.organization_id and mr.membership_id=m.id
         join app.role_permissions rp on rp.organization_id=mr.organization_id and rp.role_id=mr.role_id
         join app.permissions p on p.id=rp.permission_id join app.organizations o on o.id=m.organization_id
         where m.organization_id=$1 and m.user_id=$2 and m.status='ACTIVE' and o.status='ACTIVE' and p.code='inviteMember' limit 1`,
        [organizationId, actor.userId],
      );
      if (
        !authority.rows[0] ||
        (authority.rows[0].requires_privileged_mfa && actor.assurance !== "MFA")
      )
        throw new ForbiddenException("Invitation denied");
      const roles = await connection.query<{
        id: string;
        code: string;
        delegable: boolean;
      }>(
        "select id,code,delegable from app.roles where organization_id=$1 and id=any($2::uuid[]) for share",
        [organizationId, roleIds],
      );
      if (
        roles.rows.length !== roleIds.length ||
        roles.rows.some(
          (role) => !role.delegable || role.code === "ORGANIZATION_ADMIN",
        )
      )
        throw new ForbiddenException("Invitation role delegation denied");
      const targetGrants = await connection.query<{ code: string }>(
        "select distinct p.code from app.role_permissions rp join app.permissions p on p.id=rp.permission_id where rp.organization_id=$1 and rp.role_id=any($2::uuid[])",
        [organizationId, roleIds],
      );
      const allowed = new Set([
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
      ]);
      if (targetGrants.rows.some((grant) => !allowed.has(grant.code)))
        throw new ForbiddenException("Invitation role delegation denied");
      const existing = await connection.query(
        "select 1 from app.organization_invitations where organization_id=$1 and target_email_digest=$2 and status in ('PENDING','ACCEPTED','AWAITING_MFA')",
        [organizationId, digest(email)],
      );
      if (existing.rowCount)
        throw new ConflictException("Invitation unavailable");
      await connection.query(
        "insert into app.organization_invitations (id,organization_id,kind,target_email_ciphertext,target_email_digest,display_name,inviter_membership_id,expires_at) values($1,$2,'MEMBER',$3,$4,$5,$6,$7)",
        [
          invitationId,
          organizationId,
          encrypt({ email }),
          digest(email),
          displayName,
          authority.rows[0]!.membership_id,
          expires,
        ],
      );
      for (const roleId of roleIds)
        await connection.query(
          "insert into app.invitation_roles (organization_id,invitation_id,role_id) values($1,$2,$3)",
          [organizationId, invitationId, roleId],
        );
      await connection.query(
        "insert into app.account_action_tokens (id,subject_email_digest,purpose,token_hash,invitation_organization_id,invitation_id,expires_at) values($1,$2,'INVITATION',$3,$4,$5,$6)",
        [
          actionId,
          digest(email),
          digest(rawToken),
          organizationId,
          invitationId,
          expires,
        ],
      );
      await connection.query(
        "insert into app.identity_delivery_jobs (account_action_token_id,purpose,state,encrypted_envelope,key_ref,expires_at,purge_at) values($1,'INVITATION','PENDING',$2,$3,$4,$4)",
        [
          actionId,
          encrypt({ recipient: email, token: rawToken }),
          loadLocalSecrets().keyId,
          expires,
        ],
      );
      await connection.query(
        "insert into app.identity_audit_logs (actor_user_id,subject_user_id,action_code,result_code,reason_code,resource_type,resource_id,correlation_id) values($1,null,'MEMBER_INVITE','SUCCESS','PENDING_INVITATION','INVITATION',$2,$3)",
        [actor.userId, invitationId, randomUUID()],
      );
      await connection.query("commit");
      this.queueMockMessage({
        recipient: email,
        purpose: "INVITATION",
        token: rawToken,
        expiresAt: expires.getTime(),
      });
      return {
        id: invitationId,
        version: 1,
        created_at: new Date().toISOString(),
        organization_id: organizationId,
        status: "PENDING",
        kind: "MEMBER",
        expires_at: expires.toISOString(),
      };
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      if ((error as { code?: string }).code === "23505")
        throw new ConflictException("Invitation unavailable");
      throw error;
    } finally {
      connection.release();
    }
  }

  async revokeInvitation(
    token: string,
    organizationValue: unknown,
    invitationValue: unknown,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const organizationId = safeIdentifier(organizationValue);
    const invitationId = safeIdentifier(invitationValue);
    const actor = await this.authenticateAccessToken(token);
    if (
      !Number.isInteger(input.base_version) ||
      Object.keys(input).some((key) => key !== "base_version")
    )
      throw new BadRequestException("Invalid request");
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      await connection.query(
        "select set_config('app.organization_id',$1,true),set_config('app.actor_user_id',$2,true)",
        [organizationId, actor.userId],
      );
      const authority = await connection.query<{
        requires_privileged_mfa: boolean;
      }>(
        `select p.requires_privileged_mfa from app.memberships m join app.membership_roles mr on mr.organization_id=m.organization_id and mr.membership_id=m.id join app.role_permissions rp on rp.organization_id=mr.organization_id and rp.role_id=mr.role_id join app.permissions p on p.id=rp.permission_id join app.organizations o on o.id=m.organization_id where m.organization_id=$1 and m.user_id=$2 and m.status='ACTIVE' and o.status='ACTIVE' and p.code='revokeInvitation' limit 1`,
        [organizationId, actor.userId],
      );
      if (
        !authority.rows[0] ||
        (authority.rows[0].requires_privileged_mfa && actor.assurance !== "MFA")
      )
        throw new ForbiddenException("Invitation revocation denied");
      const updated = await connection.query(
        "update app.organization_invitations set status='REVOKED',version=version+1,updated_at=now() where id=$1 and organization_id=$2 and version=$3 and status in ('PENDING','ACCEPTED','AWAITING_MFA') returning id,version,created_at,organization_id,status,kind,expires_at",
        [invitationId, organizationId, input.base_version],
      );
      if (!updated.rows[0])
        throw new ConflictException("Invitation revocation unavailable");
      await connection.query(
        "update app.account_action_tokens set revoked_at=now() where invitation_id=$1 and invitation_organization_id=$2 and consumed_at is null",
        [invitationId, organizationId],
      );
      await connection.query(
        "update app.identity_delivery_jobs set state='EXPIRED',encrypted_envelope=null,purge_at=now() where account_action_token_id in (select id from app.account_action_tokens where invitation_id=$1 and invitation_organization_id=$2)",
        [invitationId, organizationId],
      );
      await connection.query(
        "update app.memberships set status='INACTIVE',availability='UNAVAILABLE',version=version+1,updated_at=now() where organization_id=$1 and user_id=(select bound_user_id from app.organization_invitations where id=$2) and status='PENDING_ACTIVATION'",
        [organizationId, invitationId],
      );
      await connection.query(
        "insert into app.identity_audit_logs (actor_user_id,subject_user_id,action_code,result_code,reason_code,resource_type,resource_id,correlation_id) values($1,null,'INVITATION_REVOKE','SUCCESS','INVITER_REQUEST','INVITATION',$2,$3)",
        [actor.userId, invitationId, randomUUID()],
      );
      await connection.query("commit");
      return updated.rows[0] as Record<string, unknown>;
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  private throttle(key: string): void {
    const now = Date.now();
    if (this.loginAttempts.size > 4096) {
      for (const [currentKey, currentValue] of this.loginAttempts) {
        if (now - currentValue.start > 60_000) {
          this.loginAttempts.delete(currentKey);
        }
        if (this.loginAttempts.size <= 2048) {
          break;
        }
      }
      if (this.loginAttempts.size > 4096) {
        throw new ForbiddenException("Authentication temporarily unavailable");
      }
    }
    const current = this.loginAttempts.get(key);
    if (!current || now - current.start > 60_000) {
      this.loginAttempts.set(key, { count: 1, start: now });
      return;
    }
    if (current.count >= 8) {
      throw new ForbiddenException("Authentication temporarily unavailable");
    }
    current.count += 1;
  }

  takeMockMessagesForTests(): MockMessage[] {
    if (this.environment.NODE_ENV !== "test") {
      throw new ForbiddenException("Mock mailbox unavailable");
    }
    return this.mockMailbox.splice(0, this.mockMailbox.length);
  }

  private queueMockMessage(message: MockMessage): void {
    if (!message.recipient.endsWith("@example.invalid")) {
      throw new ForbiddenException("Mock delivery recipient rejected");
    }
    const now = Date.now();
    for (let index = this.mockMailbox.length - 1; index >= 0; index -= 1) {
      if ((this.mockMailbox[index]?.expiresAt ?? 0) <= now) {
        this.mockMailbox.splice(index, 1);
      }
    }
    if (this.mockMailbox.length >= 100) {
      throw new ForbiddenException("Mock mailbox capacity reached");
    }
    this.mockMailbox.push(message);
  }

  async acceptInvitation(
    body: Record<string, unknown>,
    accessToken?: string,
  ): Promise<Record<string, unknown>> {
    if (
      typeof body.token !== "string" ||
      body.token.length < 32 ||
      body.token.length > 512 ||
      typeof body.client_binding !== "string" ||
      Buffer.from(body.client_binding, "base64url").length < 32 ||
      !["WEB", "MOBILE"].includes(String(body.client_kind))
    ) {
      throw new BadRequestException("Invalid request");
    }
    const actor = accessToken
      ? await this.authenticateAccessToken(accessToken)
      : undefined;
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      const actionResult = await connection.query<{
        id: string;
        user_id: string | null;
        subject_email_digest: string;
        authentication_version: number | null;
        invitation_organization_id: string;
        invitation_id: string;
      }>(
        `select id,user_id,subject_email_digest,authentication_version,invitation_organization_id,invitation_id
         from app.account_action_tokens
         where token_hash=$1 and purpose='INVITATION' and consumed_at is null
           and revoked_at is null and expires_at>now() for update`,
        [digest(body.token)],
      );
      const action = actionResult.rows[0];
      if (!action) {
        throw new UnauthorizedException("Invitation unavailable");
      }
      await connection.query(
        "select set_config('app.organization_id',$1,true),set_config('app.actor_user_id',$2,true)",
        [
          action.invitation_organization_id,
          action.user_id ?? actor?.userId ?? randomUUID(),
        ],
      );
      const invitationResult = await connection.query<{
        id: string;
        organization_id: string;
        kind: "FIRST_ADMIN" | "MEMBER";
        target_email_ciphertext: string;
        target_email_digest: string;
        display_name: string;
        bound_user_id: string | null;
        status: string;
        expires_at: Date;
        organization_status: string;
      }>(
        `select i.id,i.organization_id,i.kind,i.target_email_ciphertext,i.target_email_digest,
                i.display_name,i.bound_user_id,i.status,i.expires_at,o.status as organization_status
         from app.organization_invitations i join app.organizations o on o.id=i.organization_id
         where i.id=$1 and i.organization_id=$2 for update of i,o`,
        [action.invitation_id, action.invitation_organization_id],
      );
      const invitation = invitationResult.rows[0];
      if (
        !invitation ||
        invitation.status !== "PENDING" ||
        invitation.expires_at <= new Date() ||
        invitation.target_email_digest !== action.subject_email_digest
      ) {
        throw new UnauthorizedException("Invitation unavailable");
      }
      const email = decrypt<{ email: string }>(
        invitation.target_email_ciphertext,
      ).email;
      if (
        !/^[^\s@]+@example\.invalid$/.test(email) ||
        digest(email) !== invitation.target_email_digest
      ) {
        throw new UnauthorizedException("Invitation unavailable");
      }
      if (
        (invitation.kind === "FIRST_ADMIN" &&
          invitation.organization_status !== "ONBOARDING") ||
        (invitation.kind === "MEMBER" &&
          invitation.organization_status !== "ACTIVE")
      ) {
        throw new UnauthorizedException("Invitation unavailable");
      }
      const existingResult = await connection.query<IdentityRow>(
        `select u.id,u.email_normalized,u.email_verified_at,u.status,u.authentication_version,c.password_hash
         from app.users u join app.password_credentials c on c.user_id=u.id
         where u.email_normalized=$1 for update of u,c`,
        [email],
      );
      const existing = existingResult.rows[0];
      let userId: string;
      let authenticationVersion: number;
      if (existing) {
        if (
          !actor ||
          actor.userId !== existing.id ||
          body.new_password !== undefined ||
          (action.user_id !== null && action.user_id !== existing.id) ||
          existing.status !== "ACTIVE" ||
          Math.floor(Date.now() / 1000) - actor.authTime > 300
        ) {
          throw new UnauthorizedException("Invitation unavailable");
        }
        const currentSession = await connection.query<{
          client_kind: string;
          client_binding_hash: string;
          status: string;
        }>(
          "select client_kind,client_binding_hash,status from app.sessions where id=$1 and user_id=$2 for update",
          [actor.sessionId, existing.id],
        );
        if (
          currentSession.rows[0]?.status !== "ACTIVE" ||
          currentSession.rows[0]?.client_kind !== body.client_kind ||
          currentSession.rows[0]?.client_binding_hash !==
            digest(body.client_binding)
        ) {
          throw new UnauthorizedException("Invitation unavailable");
        }
        userId = existing.id;
        authenticationVersion = existing.authentication_version;
        await connection.query(
          "update app.users set email_verified_at=coalesce(email_verified_at,now()) where id=$1",
          [userId],
        );
      } else {
        if (actor || action.user_id !== null) {
          throw new UnauthorizedException("Invitation unavailable");
        }
        const password = safePassword(body.new_password);
        const passwordHash = await argon2.hash(password, {
          type: argon2.argon2id,
          memoryCost: 65_536,
          timeCost: 3,
          parallelism: 1,
        });
        userId = randomUUID();
        authenticationVersion = 1;
        await connection.query(
          `insert into app.users (id,email_normalized,email_ciphertext,email_verified_at,status)
           values($1,$2,$3,now(),'ACTIVE')`,
          [userId, email, encrypt({ email })],
        );
        await connection.query(
          "insert into app.password_credentials (user_id,password_hash) values($1,$2)",
          [userId, passwordHash],
        );
      }
      if (action.user_id !== null && action.user_id !== userId) {
        throw new UnauthorizedException("Invitation unavailable");
      }
      const membership = await connection.query<{ id: string; status: string }>(
        "select id,status from app.memberships where organization_id=$1 and user_id=$2 for update",
        [invitation.organization_id, userId],
      );
      if (membership.rows[0]?.status === "ACTIVE") {
        throw new ConflictException("Invitation unavailable");
      }
      let membershipId = membership.rows[0]?.id;
      if (membershipId) {
        await connection.query(
          "delete from app.membership_roles where organization_id=$1 and membership_id=$2",
          [invitation.organization_id, membershipId],
        );
        await connection.query(
          `update app.memberships set status='PENDING_ACTIVATION',activated_at=null,
           display_name=$1,updated_at=now(),version=version+1 where id=$2`,
          [invitation.display_name, membershipId],
        );
      } else {
        membershipId = randomUUID();
        await connection.query(
          `insert into app.memberships (id,organization_id,user_id,display_name,status)
           values($1,$2,$3,$4,'PENDING_ACTIVATION')`,
          [
            membershipId,
            invitation.organization_id,
            userId,
            invitation.display_name,
          ],
        );
      }
      const grantRequirement = await connection.query<{
        required: boolean;
        role_count: string;
      }>(
        `select exists(
           select 1 from app.invitation_roles ir
           join app.role_permissions rp on rp.organization_id=ir.organization_id and rp.role_id=ir.role_id
           join app.permissions p on p.id=rp.permission_id
           where ir.organization_id=$1 and ir.invitation_id=$2 and p.requires_privileged_mfa=true
         ) as required,
         (select count(*)::text from app.invitation_roles where organization_id=$1 and invitation_id=$2) as role_count`,
        [invitation.organization_id, invitation.id],
      );
      if (grantRequirement.rows[0]?.role_count === "0") {
        throw new UnauthorizedException("Invitation unavailable");
      }
      const currentPrivilege = await this.requiresPrivilegedMfaInTransaction(
        connection,
        userId,
      );
      const requiredMfa =
        invitation.kind === "FIRST_ADMIN" ||
        grantRequirement.rows[0]?.required === true ||
        currentPrivilege;
      const activeFactor = await connection.query(
        "select 1 from app.mfa_credentials where user_id=$1 and state='ACTIVE'",
        [userId],
      );
      const purpose = requiredMfa
        ? activeFactor.rowCount
          ? "MFA_VERIFY"
          : "MFA_ENROLL"
        : "INVITATION_ACTIVATE";
      const challengeId = randomUUID();
      const challengeExpiry = new Date(Date.now() + 5 * 60_000);
      const sessionId = actor?.sessionId ?? null;
      const sessionBinding = actor
        ? (
            await connection.query<{ client_binding_hash: string }>(
              "select client_binding_hash from app.sessions where id=$1 and user_id=$2",
              [actor.sessionId, userId],
            )
          ).rows[0]?.client_binding_hash
        : digest(body.client_binding);
      if (!sessionBinding) {
        throw new UnauthorizedException("Invitation unavailable");
      }
      await connection.query(
        `insert into app.auth_challenges
         (id,user_id,session_id,invitation_organization_id,invitation_id,purpose,client_kind,client_binding_hash,state,authentication_version,password_verified_at,mfa_verified_at,expires_at)
         values($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',$9,$10,$11,$12)`,
        [
          challengeId,
          userId,
          sessionId,
          invitation.organization_id,
          invitation.id,
          purpose,
          body.client_kind,
          sessionBinding,
          authenticationVersion,
          new Date(),
          actor?.mfaVerifiedAt ? new Date(actor.mfaVerifiedAt * 1000) : null,
          challengeExpiry,
        ],
      );
      const nextStatus = requiredMfa ? "AWAITING_MFA" : "ACCEPTED";
      await connection.query(
        `update app.organization_invitations
         set bound_user_id=$1,status=$2,accepted_at=now(),version=version+1,updated_at=now()
         where id=$3 and organization_id=$4`,
        [userId, nextStatus, invitation.id, invitation.organization_id],
      );
      await connection.query(
        "update app.account_action_tokens set consumed_at=now() where id=$1",
        [action.id],
      );
      await connection.query(
        "update app.identity_delivery_jobs set state='EXPIRED',encrypted_envelope=null,purge_at=now() where account_action_token_id=$1",
        [action.id],
      );
      await connection.query(
        `insert into app.identity_audit_logs
         (actor_user_id,subject_user_id,action_code,result_code,reason_code,resource_type,resource_id,correlation_id)
         values($1,$2,'INVITATION_ACCEPT','SUCCESS','RECIPIENT_PROOF','INVITATION',$3,$4)`,
        [actor?.userId ?? userId, userId, invitation.id, randomUUID()],
      );
      await connection.query("commit");
      return {
        invitation_id: invitation.id,
        status: nextStatus,
        challenge: {
          challenge_id: challengeId,
          expires_at: challengeExpiry.toISOString(),
          next_action:
            purpose === "MFA_ENROLL"
              ? "ENROLL_MFA"
              : purpose === "MFA_VERIFY"
                ? "VERIFY_MFA"
                : "COMPLETE_INVITATION",
          authentication_state: "CHALLENGE_REQUIRED",
        },
      };
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  async activateInvitation(
    body: Record<string, unknown>,
    binding: string,
  ): Promise<Record<string, unknown>> {
    const challengeId = safeIdentifier(body.challenge_id);
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      const challengeResult = await connection.query<ChallengeRow>(
        `select * from app.auth_challenges where id=$1 for update`,
        [challengeId],
      );
      const challenge = challengeResult.rows[0];
      if (
        !challenge ||
        challenge.state !== "PENDING" ||
        challenge.purpose !== "INVITATION_ACTIVATE" ||
        challenge.expires_at <= new Date() ||
        challenge.client_binding_hash !== digest(binding) ||
        !challenge.invitation_id ||
        !challenge.invitation_organization_id ||
        challenge.attempts >= challenge.max_attempts
      ) {
        throw new UnauthorizedException("Invitation activation unavailable");
      }
      if (challenge.session_id) {
        const session = await connection.query(
          `select 1 from app.sessions where id=$1 and user_id=$2 and status='ACTIVE'
           and authentication_version=$3 and idle_expires_at>now() and absolute_expires_at>now()
           for update`,
          [
            challenge.session_id,
            challenge.user_id,
            challenge.authentication_version,
          ],
        );
        if (session.rowCount !== 1) {
          throw new UnauthorizedException("Invitation activation unavailable");
        }
      }
      await connection.query(
        "select set_config('app.organization_id',$1,true),set_config('app.actor_user_id',$2,true)",
        [challenge.invitation_organization_id, challenge.user_id],
      );
      const result = await connection.query<{
        id: string;
        kind: "FIRST_ADMIN" | "MEMBER";
        status: string;
        bound_user_id: string;
        inviter_membership_id: string | null;
        platform_grant_id: string | null;
        expires_at: Date;
        organization_status: string;
      }>(
        `select i.id,i.kind,i.status,i.bound_user_id,i.inviter_membership_id,i.platform_grant_id,
                i.expires_at,o.status as organization_status
         from app.organization_invitations i join app.organizations o on o.id=i.organization_id
         where i.id=$1 and i.organization_id=$2 for update of i,o`,
        [challenge.invitation_id, challenge.invitation_organization_id],
      );
      const invitation = result.rows[0];
      const membership = await connection.query<{
        id: string;
        status: string;
      }>(
        "select id,status from app.memberships where organization_id=$1 and user_id=$2 for update",
        [challenge.invitation_organization_id, challenge.user_id],
      );
      const roles = await connection.query<{
        id: string;
        code: string;
        delegable: boolean;
        locked_template: boolean;
      }>(
        `select r.id,r.code,r.delegable,r.locked_template
         from app.invitation_roles ir join app.roles r
           on r.id=ir.role_id and r.organization_id=ir.organization_id
         where ir.organization_id=$1 and ir.invitation_id=$2 for update of r`,
        [challenge.invitation_organization_id, challenge.invitation_id],
      );
      const user = await connection.query<{
        status: string;
        email_verified_at: Date | null;
        authentication_version: number;
      }>(
        "select status,email_verified_at,authentication_version from app.users where id=$1 for update",
        [challenge.user_id],
      );
      if (
        !invitation ||
        invitation.bound_user_id !== challenge.user_id ||
        !["ACCEPTED", "AWAITING_MFA"].includes(invitation.status) ||
        invitation.expires_at <= new Date() ||
        !membership.rows[0] ||
        membership.rows[0].status !== "PENDING_ACTIVATION" ||
        user.rows[0]?.status !== "ACTIVE" ||
        !user.rows[0].email_verified_at ||
        user.rows[0].authentication_version !==
          challenge.authentication_version ||
        roles.rows.length === 0
      ) {
        throw new UnauthorizedException("Invitation activation unavailable");
      }
      if (
        (invitation.kind === "FIRST_ADMIN" &&
          invitation.organization_status !== "ONBOARDING") ||
        (invitation.kind === "MEMBER" &&
          invitation.organization_status !== "ACTIVE")
      ) {
        throw new UnauthorizedException("Invitation activation unavailable");
      }
      const required =
        invitation.kind === "FIRST_ADMIN" ||
        roles.rows.some((role) => !role.delegable);
      const privilegedPermission = await connection.query<{
        required: boolean;
      }>(
        `select exists(
           select 1 from app.invitation_roles ir
           join app.role_permissions rp on rp.organization_id=ir.organization_id and rp.role_id=ir.role_id
           join app.permissions p on p.id=rp.permission_id
           where ir.organization_id=$1 and ir.invitation_id=$2 and p.requires_privileged_mfa=true
         ) as required`,
        [challenge.invitation_organization_id, challenge.invitation_id],
      );
      const currentPrivilege = await this.requiresPrivilegedMfaInTransaction(
        connection,
        challenge.user_id,
      );
      const mfaRequired =
        required ||
        privilegedPermission.rows[0]?.required === true ||
        currentPrivilege;
      if (
        mfaRequired &&
        (challenge.mfa_verified_at === null ||
          Math.floor(Date.now() / 1000) -
            Math.floor(challenge.mfa_verified_at.getTime() / 1000) >
            300)
      ) {
        throw new ForbiddenException(
          "Required multi-factor verification missing",
        );
      }
      if (invitation.kind === "FIRST_ADMIN") {
        if (
          roles.rows.length !== 1 ||
          roles.rows[0]?.code !== "ORGANIZATION_ADMIN" ||
          !roles.rows[0]?.locked_template ||
          !invitation.platform_grant_id
        ) {
          throw new ForbiddenException("First administrator grant rejected");
        }
        const grant = await connection.query(
          `select 1 from app.platform_grants g
           join app.permissions p on p.id=g.permission_id
           where g.id=$1 and g.state='ACTIVE' and p.code='onboardOrganization'`,
          [invitation.platform_grant_id],
        );
        if (grant.rowCount !== 1) {
          throw new ForbiddenException("First administrator grant rejected");
        }
      } else {
        if (
          !invitation.inviter_membership_id ||
          roles.rows.some((role) => !role.delegable)
        ) {
          throw new ForbiddenException("Invitation delegation rejected");
        }
        const inviter = await connection.query(
          `select 1 from app.memberships m
           join app.membership_roles mr on mr.organization_id=m.organization_id and mr.membership_id=m.id
           join app.role_permissions rp on rp.organization_id=mr.organization_id and rp.role_id=mr.role_id
           join app.permissions p on p.id=rp.permission_id
           where m.id=$1 and m.organization_id=$2 and m.status='ACTIVE' and p.code='inviteMember'`,
          [
            invitation.inviter_membership_id,
            challenge.invitation_organization_id,
          ],
        );
        if (inviter.rowCount !== 1) {
          throw new ForbiddenException("Invitation delegation rejected");
        }
      }
      const membershipId = membership.rows[0].id;
      await connection.query(
        "update app.memberships set status='ACTIVE',activated_at=now(),updated_at=now(),version=version+1 where id=$1 and organization_id=$2",
        [membershipId, challenge.invitation_organization_id],
      );
      await connection.query(
        `insert into app.membership_roles (organization_id,membership_id,role_id)
         select organization_id,$1,role_id from app.invitation_roles
         where organization_id=$2 and invitation_id=$3`,
        [
          membershipId,
          challenge.invitation_organization_id,
          challenge.invitation_id,
        ],
      );
      if (invitation.kind === "FIRST_ADMIN") {
        await connection.query(
          "update app.organizations set status='ACTIVE',activated_at=now(),updated_at=now(),version=version+1 where id=$1 and status='ONBOARDING'",
          [challenge.invitation_organization_id],
        );
      }
      await connection.query(
        "update app.organization_invitations set status='ACTIVATED',activated_at=now(),updated_at=now(),version=version+1 where id=$1 and organization_id=$2",
        [challenge.invitation_id, challenge.invitation_organization_id],
      );
      await connection.query(
        "update app.auth_challenges set state='CONSUMED',consumed_at=now() where id=$1",
        [challengeId],
      );
      await connection.query(
        `insert into app.identity_audit_logs
         (actor_user_id,subject_user_id,action_code,result_code,reason_code,resource_type,resource_id,correlation_id)
         values($1,$1,'INVITATION_ACTIVATE','SUCCESS','EXPLICIT_PROOF','MEMBERSHIP',$2,$3)`,
        [challenge.user_id, membershipId, randomUUID()],
      );
      const session = await this.createAuthenticatedSessionHandoff(
        connection,
        {
          id: challenge.user_id,
          authentication_version: challenge.authentication_version,
        },
        challenge,
        challenge.mfa_verified_at ?? new Date(),
        challenge.mfa_verified_at ? "MFA" : "PASSWORD",
      );
      await connection.query("commit");
      return {
        invitation_id: invitation.id,
        membership_id: membershipId,
        organization_status: "ACTIVE",
        membership_status: "ACTIVE",
        handoff: session.handoff,
      };
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  private async createAccountAction(
    user: { id: string; email: string; authenticationVersion: number },
    purpose: "RESET_PASSWORD" | "VERIFY_EMAIL",
  ): Promise<void> {
    const token = randomBytes(32).toString("base64url");
    const tokenId = randomUUID();
    const now = new Date();
    const expires = new Date(
      now.getTime() + (purpose === "RESET_PASSWORD" ? 15 : 30) * 60_000,
    );
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      await connection.query(
        `insert into app.account_action_tokens
         (id,user_id,subject_email_digest,purpose,token_hash,authentication_version,expires_at)
         values($1,$2,$3,$4,$5,$6,$7)`,
        [
          tokenId,
          user.id,
          digest(user.email),
          purpose,
          digest(token),
          user.authenticationVersion,
          expires,
        ],
      );
      await connection.query(
        `insert into app.identity_delivery_jobs
         (user_id,account_action_token_id,purpose,state,encrypted_envelope,key_ref,expires_at,purge_at)
         values($1,$2,$3,'PENDING',$4,$5,$6,$6)`,
        [
          user.id,
          tokenId,
          purpose,
          encrypt({ recipient: user.email, token }),
          loadLocalSecrets().keyId,
          expires,
        ],
      );
      await connection.query("commit");
      this.queueMockMessage({
        recipient: user.email,
        purpose,
        token,
        expiresAt: expires.getTime(),
      });
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  async requestPasswordReset(
    body: Record<string, unknown>,
  ): Promise<Record<string, string>> {
    const email = emailAddress(body.email);
    this.throttle(digest(email));
    const result = await this.pool.query<{
      id: string;
      email_normalized: string;
      authentication_version: number;
      status: string;
    }>(
      "select id,email_normalized,authentication_version,status from app.users where email_normalized=$1",
      [email],
    );
    const user = result.rows[0];
    if (user?.status === "ACTIVE") {
      await this.createAccountAction(
        {
          id: user.id,
          email: user.email_normalized,
          authenticationVersion: user.authentication_version,
        },
        "RESET_PASSWORD",
      );
    }
    return { status: "REQUEST_ACCEPTED", correlation_id: randomUUID() };
  }

  async confirmPasswordReset(
    body: Record<string, unknown>,
  ): Promise<Record<string, string>> {
    if (
      typeof body.token !== "string" ||
      body.token.length < 32 ||
      body.token.length > 512
    ) {
      throw new BadRequestException("Invalid request");
    }
    const password = safePassword(body.new_password);
    const newHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
    });
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      const result = await connection.query<{
        id: string;
        user_id: string;
        authentication_version: number;
        current_version: number;
      }>(
        `select a.id,a.user_id,a.authentication_version,u.authentication_version as current_version
         from app.account_action_tokens a join app.users u on u.id=a.user_id
         where a.token_hash=$1 and a.purpose='RESET_PASSWORD' and a.consumed_at is null
           and a.revoked_at is null and a.expires_at>now() and u.status='ACTIVE'
         for update of a,u`,
        [digest(body.token)],
      );
      const action = result.rows[0];
      if (!action || action.authentication_version !== action.current_version) {
        throw new UnauthorizedException("Account action unavailable");
      }
      const credential = await connection.query(
        "update app.password_credentials set password_hash=$1,changed_at=now(),rehash_at=now(),version=version+1 where user_id=$2",
        [newHash, action.user_id],
      );
      if (credential.rowCount !== 1) {
        throw new UnauthorizedException("Account action unavailable");
      }
      await connection.query(
        "update app.account_action_tokens set consumed_at=now() where id=$1",
        [action.id],
      );
      await connection.query(
        "update app.account_action_tokens set revoked_at=now() where user_id=$1 and id<>$2 and consumed_at is null and revoked_at is null",
        [action.user_id, action.id],
      );
      await connection.query(
        `update app.identity_delivery_jobs set state='EXPIRED',encrypted_envelope=null,purge_at=now()
         where account_action_token_id in (
           select id from app.account_action_tokens where user_id=$1 and (id=$2 or revoked_at is not null)
         )`,
        [action.user_id, action.id],
      );
      await connection.query(
        "update app.users set authentication_version=authentication_version+1,updated_at=now(),version=version+1 where id=$1",
        [action.user_id],
      );
      await connection.query(
        "update app.sessions set status='REVOKED',revoked_at=now() where user_id=$1 and status in ('ACTIVE','PENDING_DELIVERY')",
        [action.user_id],
      );
      await connection.query(
        "update app.session_refresh_tokens set state='REVOKED',revoked_at=now() where user_id=$1 and state in ('ACTIVE','CONSUMED')",
        [action.user_id],
      );
      await connection.query(
        "update app.auth_challenges set state='REVOKED' where user_id=$1 and state='PENDING'",
        [action.user_id],
      );
      await connection.query(
        "update app.credential_handoffs set state='REVOKED',encrypted_material=null where user_id=$1 and state='READY'",
        [action.user_id],
      );
      await connection.query(
        `insert into app.identity_audit_logs
         (subject_user_id,action_code,result_code,reason_code,resource_type,resource_id,correlation_id)
         values($1,'PASSWORD_RESET','SUCCESS','TOKEN_CONSUMED','ACCOUNT',$1,$2)`,
        [action.user_id, randomUUID()],
      );
      await connection.query("commit");
      return { status: "REQUEST_ACCEPTED", correlation_id: randomUUID() };
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  async requestEmailVerification(
    body: Record<string, unknown>,
  ): Promise<Record<string, string>> {
    const email = emailAddress(body.email);
    this.throttle(digest(email));
    const result = await this.pool.query<{
      id: string;
      email_normalized: string;
      authentication_version: number;
      email_verified_at: Date | null;
      status: string;
    }>(
      "select id,email_normalized,authentication_version,email_verified_at,status from app.users where email_normalized=$1",
      [email],
    );
    const user = result.rows[0];
    if (user && !user.email_verified_at && user.status !== "DISABLED") {
      await this.createAccountAction(
        {
          id: user.id,
          email: user.email_normalized,
          authenticationVersion: user.authentication_version,
        },
        "VERIFY_EMAIL",
      );
    }
    return { status: "REQUEST_ACCEPTED", correlation_id: randomUUID() };
  }

  async confirmEmailVerification(
    body: Record<string, unknown>,
  ): Promise<Record<string, string>> {
    if (
      typeof body.token !== "string" ||
      body.token.length < 32 ||
      body.token.length > 512
    ) {
      throw new BadRequestException("Invalid request");
    }
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      const result = await connection.query<{
        id: string;
        user_id: string;
        authentication_version: number;
        current_version: number;
      }>(
        `select a.id,a.user_id,a.authentication_version,u.authentication_version as current_version
         from app.account_action_tokens a join app.users u on u.id=a.user_id
         where a.token_hash=$1 and a.purpose='VERIFY_EMAIL' and a.consumed_at is null
           and a.revoked_at is null and a.expires_at>now() and u.status<>'DISABLED'
         for update of a,u`,
        [digest(body.token)],
      );
      const action = result.rows[0];
      if (!action || action.authentication_version !== action.current_version) {
        throw new UnauthorizedException("Account action unavailable");
      }
      await connection.query(
        "update app.users set email_verified_at=now(),updated_at=now(),version=version+1 where id=$1",
        [action.user_id],
      );
      await connection.query(
        "update app.account_action_tokens set consumed_at=now() where id=$1",
        [action.id],
      );
      await connection.query(
        "update app.identity_delivery_jobs set state='EXPIRED',encrypted_envelope=null,purge_at=now() where account_action_token_id=$1",
        [action.id],
      );
      await connection.query(
        `insert into app.identity_audit_logs
         (subject_user_id,action_code,result_code,reason_code,resource_type,resource_id,correlation_id)
         values($1,'EMAIL_VERIFY','SUCCESS','TOKEN_CONSUMED','ACCOUNT',$1,$2)`,
        [action.user_id, randomUUID()],
      );
      await connection.query("commit");
      return { status: "REQUEST_ACCEPTED", correlation_id: randomUUID() };
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  private async requiresPrivilegedMfaInTransaction(
    connection: PoolClient,
    userId: string,
  ): Promise<boolean> {
    const previous = await connection.query<{
      organization_id: string | null;
      actor_user_id: string | null;
    }>(
      `select nullif(current_setting('app.organization_id',true),'') as organization_id,
              nullif(current_setting('app.actor_user_id',true),'') as actor_user_id`,
    );
    const previousOrganizationId = previous.rows[0]?.organization_id ?? "";
    const previousActorUserId = previous.rows[0]?.actor_user_id ?? "";

    try {
      // The identity role may see membership metadata only for this verified
      // subject. Tenant IDs are derived from those rows, never from the client.
      await connection.query("select set_config('app.actor_user_id',$1,true)", [
        userId,
      ]);
      const platformGrant = await connection.query<{ required: boolean }>(
        `select exists(
           select 1 from app.platform_grants g
           join app.permissions p on p.id=g.permission_id
           where g.user_id=$1 and g.state='ACTIVE' and p.requires_privileged_mfa=true
         ) as required`,
        [userId],
      );
      if (platformGrant.rows[0]?.required !== false) {
        // Missing result rows are an error-shaped condition, never proof of
        // an unprivileged identity.
        if (platformGrant.rows[0]?.required === true) return true;
        throw new Error("Privilege lookup returned no result");
      }

      const memberships = await connection.query<{
        organization_id: string;
      }>(
        `select organization_id from app.memberships
         where user_id=$1 and status='ACTIVE'
         order by organization_id`,
        [userId],
      );
      for (const membership of memberships.rows) {
        await connection.query(
          "select set_config('app.organization_id',$1,true)",
          [membership.organization_id],
        );
        const tenantGrant = await connection.query<{ required: boolean }>(
          `select exists(
             select 1 from app.memberships m
             join app.membership_roles mr
               on mr.organization_id=m.organization_id and mr.membership_id=m.id
             join app.role_permissions rp
               on rp.organization_id=mr.organization_id and rp.role_id=mr.role_id
             join app.permissions p on p.id=rp.permission_id
             where m.user_id=$1 and m.organization_id=$2 and m.status='ACTIVE'
               and p.requires_privileged_mfa=true
           ) as required`,
          [userId, membership.organization_id],
        );
        if (tenantGrant.rows[0]?.required === true) return true;
        if (tenantGrant.rows[0]?.required !== false) {
          throw new Error("Tenant privilege lookup returned no result");
        }
      }
      return false;
    } finally {
      // Callers may be in a larger invitation transaction. Restore its prior
      // tenant and subject context before returning to that operation.
      await connection.query(
        `select set_config('app.organization_id',$1,true),
                set_config('app.actor_user_id',$2,true)`,
        [previousOrganizationId, previousActorUserId],
      );
    }
  }

  private async requiresPrivilegedMfa(userId: string): Promise<boolean> {
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      const required = await this.requiresPrivilegedMfaInTransaction(
        connection,
        userId,
      );
      await connection.query("commit");
      return required;
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  private async requireRecentMfa(actor: AuthenticatedIdentity): Promise<void> {
    if (!(await this.requiresPrivilegedMfa(actor.userId))) {
      return;
    }
    if (
      actor.assurance !== "MFA" ||
      actor.mfaVerifiedAt === null ||
      Math.floor(Date.now() / 1000) - actor.mfaVerifiedAt > 300
    ) {
      throw new ForbiddenException("Recent multi-factor verification required");
    }
  }

  async getMfaStatus(token: string): Promise<Record<string, unknown>> {
    const actor = await this.authenticateAccessToken(token);
    const [factor, codes, required] = await Promise.all([
      this.pool.query(
        "select 1 from app.mfa_credentials where user_id=$1 and state='ACTIVE'",
        [actor.userId],
      ),
      this.pool.query<{ count: string }>(
        "select count(*)::text as count from app.recovery_codes where user_id=$1 and used_at is null and revoked_at is null",
        [actor.userId],
      ),
      this.requiresPrivilegedMfa(actor.userId),
    ]);
    return {
      enrolled: factor.rowCount === 1,
      recovery_codes_remaining: Number(codes.rows[0]?.count ?? 0),
      required,
    };
  }

  async listMyMemberships(
    token: string,
    cursorValue: string | undefined,
    limitValue: string | undefined,
  ): Promise<Record<string, unknown>> {
    const actor = await this.authenticateAccessToken(token);
    const limit = limitValue === undefined ? 50 : Number(limitValue);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new BadRequestException("Invalid request");
    }
    let cursor: { createdAt: string; id: string } | undefined;
    if (cursorValue !== undefined) {
      try {
        const parsed = JSON.parse(
          Buffer.from(cursorValue, "base64url").toString("utf8"),
        ) as Record<string, unknown>;
        if (
          typeof parsed.createdAt !== "string" ||
          typeof parsed.id !== "string"
        ) {
          throw new Error("Invalid cursor");
        }
        cursor = { createdAt: parsed.createdAt, id: safeIdentifier(parsed.id) };
      } catch {
        throw new BadRequestException("Invalid request");
      }
    }
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      await connection.query("select set_config('app.actor_user_id',$1,true)", [
        actor.userId,
      ]);
      const memberships = await connection.query<{
        id: string;
        organization_id: string;
        display_name: string;
        status: string;
        availability: string;
        created_at: Date;
      }>(
        `select id,organization_id,display_name,status,availability,created_at
         from app.memberships
         where user_id=$1 and ($2::timestamptz is null or (created_at,id)<($2::timestamptz,$3::uuid))
         order by created_at desc,id desc limit $4`,
        [
          actor.userId,
          cursor?.createdAt ?? null,
          cursor?.id ?? null,
          limit + 1,
        ],
      );
      const page = memberships.rows.slice(0, limit);
      const items: Record<string, unknown>[] = [];
      for (const membership of page) {
        await connection.query(
          "select set_config('app.organization_id',$1,true)",
          [membership.organization_id],
        );
        const organization = await connection.query<{
          name: string;
          slug: string;
          status: string;
        }>("select name,slug,status from app.organizations where id=$1", [
          membership.organization_id,
        ]);
        const roles = await connection.query<{ code: string; name: string }>(
          `select r.code,r.name from app.membership_roles mr
           join app.roles r on r.organization_id=mr.organization_id and r.id=mr.role_id
           where mr.organization_id=$1 and mr.membership_id=$2 order by r.code`,
          [membership.organization_id, membership.id],
        );
        if (!organization.rows[0]) {
          throw new UnauthorizedException("Membership unavailable");
        }
        items.push({
          membership_id: membership.id,
          organization_id: membership.organization_id,
          organization_name: organization.rows[0].name,
          organization_slug: organization.rows[0].slug,
          organization_status: organization.rows[0].status,
          display_name: membership.display_name,
          status: membership.status,
          availability: membership.availability,
          roles: roles.rows,
        });
      }
      await connection.query("commit");
      const hasMore = memberships.rows.length > limit;
      const last = page.at(-1);
      return {
        items,
        next_cursor:
          hasMore && last
            ? Buffer.from(
                JSON.stringify({
                  createdAt: last.created_at.toISOString(),
                  id: last.id,
                }),
              ).toString("base64url")
            : null,
      };
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  async changePassword(
    token: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, string>> {
    if (typeof body.current_password !== "string") {
      throw new BadRequestException("Invalid request");
    }
    const replacement = safePassword(body.new_password);
    const actor = await this.authenticateAccessToken(token);
    await this.requireRecentMfa(actor);
    const credentials = await this.pool.query<{ password_hash: string }>(
      "select password_hash from app.password_credentials where user_id=$1",
      [actor.userId],
    );
    if (
      !credentials.rows[0] ||
      !(await argon2.verify(
        credentials.rows[0].password_hash,
        body.current_password,
      ))
    ) {
      throw new UnauthorizedException("Account change unavailable");
    }
    const passwordHash = await argon2.hash(replacement, {
      type: argon2.argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
    });
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      await connection.query(
        "select id from app.users where id=$1 for update",
        [actor.userId],
      );
      await connection.query(
        "update app.password_credentials set password_hash=$1,changed_at=now(),rehash_at=now(),version=version+1 where user_id=$2",
        [passwordHash, actor.userId],
      );
      await connection.query(
        "update app.users set authentication_version=authentication_version+1,updated_at=now(),version=version+1 where id=$1",
        [actor.userId],
      );
      await connection.query(
        "update app.sessions set status='REVOKED',revoked_at=now() where user_id=$1 and status in ('ACTIVE','PENDING_DELIVERY')",
        [actor.userId],
      );
      await connection.query(
        "update app.session_refresh_tokens set state='REVOKED',revoked_at=now() where user_id=$1 and state in ('ACTIVE','CONSUMED')",
        [actor.userId],
      );
      await connection.query(
        "update app.auth_challenges set state='REVOKED' where user_id=$1 and state='PENDING'",
        [actor.userId],
      );
      await connection.query(
        "update app.credential_handoffs set state='REVOKED',encrypted_material=null where user_id=$1 and state='READY'",
        [actor.userId],
      );
      await connection.query(
        `insert into app.identity_audit_logs
         (actor_user_id,subject_user_id,action_code,result_code,reason_code,resource_type,resource_id,correlation_id)
         values($1,$1,'PASSWORD_CHANGE','SUCCESS','CREDENTIAL_ROTATED','ACCOUNT',$1,$2)`,
        [actor.userId, randomUUID()],
      );
      await connection.query("commit");
      return { status: "REQUEST_ACCEPTED", correlation_id: randomUUID() };
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  async requestEmailChange(
    token: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, string>> {
    const actor = await this.authenticateAccessToken(token);
    await this.requireRecentMfa(actor);
    if (typeof body.current_password !== "string") {
      throw new BadRequestException("Invalid request");
    }
    const newEmail = emailAddress(body.new_email);
    const credentials = await this.pool.query<{ password_hash: string }>(
      "select password_hash from app.password_credentials where user_id=$1",
      [actor.userId],
    );
    if (
      !credentials.rows[0] ||
      !(await argon2.verify(
        credentials.rows[0].password_hash,
        body.current_password,
      ))
    ) {
      throw new UnauthorizedException("Account change unavailable");
    }
    const existing = await this.pool.query(
      "select 1 from app.users where email_normalized=$1 and id<>$2",
      [newEmail, actor.userId],
    );
    if (existing.rowCount) {
      throw new ConflictException("Account change unavailable");
    }
    const tokenValue = randomBytes(32).toString("base64url");
    const actionId = randomUUID();
    const expires = new Date(Date.now() + 30 * 60_000);
    const user = await this.pool.query<{ authentication_version: number }>(
      "select authentication_version from app.users where id=$1",
      [actor.userId],
    );
    const version = user.rows[0]?.authentication_version;
    if (version === undefined) {
      throw new UnauthorizedException("Account change unavailable");
    }
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      await connection.query(
        `insert into app.account_action_tokens
         (id,user_id,subject_email_digest,purpose,token_hash,authentication_version,target_email_ciphertext,expires_at)
         values($1,$2,$3,'CHANGE_EMAIL',$4,$5,$6,$7)`,
        [
          actionId,
          actor.userId,
          digest(newEmail),
          digest(tokenValue),
          version,
          encrypt({ email: newEmail }),
          expires,
        ],
      );
      await connection.query(
        `insert into app.identity_delivery_jobs
         (user_id,account_action_token_id,purpose,state,encrypted_envelope,key_ref,expires_at,purge_at)
         values($1,$2,'CHANGE_EMAIL','PENDING',$3,$4,$5,$5)`,
        [
          actor.userId,
          actionId,
          encrypt({ recipient: newEmail, token: tokenValue }),
          loadLocalSecrets().keyId,
          expires,
        ],
      );
      await connection.query("commit");
      this.queueMockMessage({
        recipient: newEmail,
        purpose: "CHANGE_EMAIL",
        token: tokenValue,
        expiresAt: expires.getTime(),
      });
      return { status: "REQUEST_ACCEPTED", correlation_id: randomUUID() };
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  async confirmEmailChange(
    accessToken: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, string>> {
    const actor = await this.authenticateAccessToken(accessToken);
    await this.requireRecentMfa(actor);
    if (
      typeof body.token !== "string" ||
      body.token.length < 32 ||
      body.token.length > 512
    ) {
      throw new BadRequestException("Invalid request");
    }
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      const result = await connection.query<{
        id: string;
        user_id: string;
        target_email_ciphertext: string;
        authentication_version: number;
        current_version: number;
      }>(
        `select a.id,a.user_id,a.target_email_ciphertext,a.authentication_version,
                u.authentication_version as current_version
         from app.account_action_tokens a join app.users u on u.id=a.user_id
         where a.token_hash=$1 and a.purpose='CHANGE_EMAIL' and a.user_id=$2
           and a.consumed_at is null and a.revoked_at is null and a.expires_at>now()
         for update of a,u`,
        [digest(body.token), actor.userId],
      );
      const action = result.rows[0];
      if (!action || action.authentication_version !== action.current_version) {
        throw new UnauthorizedException("Account change unavailable");
      }
      const email = decrypt<{ email: string }>(
        action.target_email_ciphertext,
      ).email;
      if (!/^[^\s@]+@example\.invalid$/.test(email)) {
        throw new UnauthorizedException("Account change unavailable");
      }
      await connection.query(
        "update app.users set email_normalized=$1,email_ciphertext=$2,email_verified_at=now(),authentication_version=authentication_version+1,updated_at=now(),version=version+1 where id=$3",
        [email, encrypt({ email }), actor.userId],
      );
      await connection.query(
        "update app.account_action_tokens set consumed_at=now() where id=$1",
        [action.id],
      );
      await connection.query(
        "update app.account_action_tokens set revoked_at=now() where user_id=$1 and id<>$2 and consumed_at is null and revoked_at is null",
        [actor.userId, action.id],
      );
      await connection.query(
        "update app.identity_delivery_jobs set state='EXPIRED',encrypted_envelope=null,purge_at=now() where user_id=$1",
        [actor.userId],
      );
      await connection.query(
        "update app.sessions set status='REVOKED',revoked_at=now() where user_id=$1 and status in ('ACTIVE','PENDING_DELIVERY')",
        [actor.userId],
      );
      await connection.query(
        "update app.session_refresh_tokens set state='REVOKED',revoked_at=now() where user_id=$1 and state in ('ACTIVE','CONSUMED')",
        [actor.userId],
      );
      await connection.query(
        "update app.credential_handoffs set state='REVOKED',encrypted_material=null where user_id=$1 and state='READY'",
        [actor.userId],
      );
      await connection.query(
        `insert into app.identity_audit_logs
         (actor_user_id,subject_user_id,action_code,result_code,reason_code,resource_type,resource_id,correlation_id)
         values($1,$1,'EMAIL_CHANGE','SUCCESS','TOKEN_CONSUMED','ACCOUNT',$1,$2)`,
        [actor.userId, randomUUID()],
      );
      await connection.query("commit");
      return { status: "REQUEST_ACCEPTED", correlation_id: randomUUID() };
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  private async accessToken(
    userId: string,
    sessionId: string,
    assurance: "PASSWORD" | "MFA",
    authTime: number,
    mfaVerifiedAt?: number,
  ): Promise<string> {
    const { accessPrivateKey, keyId } = loadLocalSecrets();
    const claims: Record<string, unknown> = {
      sid: sessionId,
      assurance,
      auth_time: authTime,
      ...(mfaVerifiedAt ? { mfa_verified_at: mfaVerifiedAt } : {}),
    };
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "EdDSA", kid: keyId, typ: "JWT" })
      .setIssuer("pbssu-rescue-ops-local")
      .setAudience("pbssu-rescue-ops-api")
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime("5m")
      .setJti(randomUUID())
      .sign(accessPrivateKey);
  }

  async authenticateAccessToken(
    token: string,
    binding?: string,
  ): Promise<AuthenticatedIdentity> {
    const { accessPublicKey, keyId } = loadLocalSecrets();
    try {
      const verified = await jwtVerify(token, accessPublicKey, {
        algorithms: ["EdDSA"],
        issuer: "pbssu-rescue-ops-local",
        audience: "pbssu-rescue-ops-api",
        clockTolerance: 2,
      });
      if (
        verified.protectedHeader.kid !== keyId ||
        typeof verified.payload.sub !== "string" ||
        typeof verified.payload.sid !== "string" ||
        !["PASSWORD", "MFA"].includes(String(verified.payload.assurance)) ||
        typeof verified.payload.auth_time !== "number"
      ) {
        throw new Error("Invalid access claims");
      }
      const session = await this.pool.query<{
        state: string;
        user_status: string;
        session_version: number;
        user_version: number;
        idle_expires_at: Date;
        absolute_expires_at: Date;
        client_kind: "WEB" | "MOBILE";
        client_binding_hash: string;
        mfa_verified_at: Date | null;
        auth_time: Date;
      }>(
        `select s.status as state,u.status as user_status,
                s.authentication_version as session_version,u.authentication_version as user_version,
                s.mfa_verified_at,s.auth_time,s.idle_expires_at,s.absolute_expires_at,
                s.client_kind,s.client_binding_hash
         from app.sessions s join app.users u on u.id=s.user_id
         where s.id=$1 and s.user_id=$2`,
        [verified.payload.sid, verified.payload.sub],
      );
      const row = session.rows[0];
      if (
        !row ||
        row.state !== "ACTIVE" ||
        row.user_status !== "ACTIVE" ||
        row.session_version !== row.user_version ||
        row.idle_expires_at <= new Date() ||
        row.absolute_expires_at <= new Date() ||
        (binding !== undefined &&
          (row.client_kind !== "WEB" ||
            row.client_binding_hash !== digest(binding))) ||
        Math.floor(row.auth_time.getTime() / 1000) !==
          verified.payload.auth_time
      ) {
        throw new Error("Session revoked");
      }
      return {
        userId: verified.payload.sub,
        sessionId: verified.payload.sid,
        assurance: verified.payload.assurance as "PASSWORD" | "MFA",
        authTime: verified.payload.auth_time,
        mfaVerifiedAt: row.mfa_verified_at
          ? Math.floor(row.mfa_verified_at.getTime() / 1000)
          : null,
      };
    } catch {
      throw new UnauthorizedException("Authentication required");
    }
  }

  async refreshSession(
    token: string,
    clientKind: "WEB" | "MOBILE",
    binding?: string,
  ): Promise<Record<string, unknown>> {
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      const current = await connection.query<{
        id: string;
        user_id: string;
        session_id: string;
        state: string;
        expires_at: Date;
        session_state: string;
        client_kind: "WEB" | "MOBILE";
        client_binding_hash: string;
        authentication_version: number;
        user_version: number;
        assurance: "PASSWORD" | "MFA";
        auth_time: Date;
        mfa_verified_at: Date | null;
        absolute_expires_at: Date;
      }>(
        `select t.id,t.user_id,t.session_id,t.state,t.expires_at,
                s.status as session_state,s.client_kind,s.client_binding_hash,
                s.authentication_version,u.authentication_version as user_version,
                s.assurance,s.auth_time,s.mfa_verified_at,s.absolute_expires_at
         from app.session_refresh_tokens t
         join app.sessions s on s.id=t.session_id and s.user_id=t.user_id
         join app.users u on u.id=t.user_id
         where t.token_hash=$1 for update of t,s,u`,
        [digest(token)],
      );
      const row = current.rows[0];
      if (
        !row ||
        row.client_kind !== clientKind ||
        (binding !== undefined && row.client_binding_hash !== digest(binding))
      ) {
        throw new UnauthorizedException("Session refresh unavailable");
      }
      if (row.state !== "ACTIVE") {
        await connection.query(
          "update app.sessions set status='REVOKED',revoked_at=now() where id=$1 and status='ACTIVE'",
          [row.session_id],
        );
        await connection.query(
          "update app.session_refresh_tokens set state='REVOKED',revoked_at=now() where session_id=$1 and state='ACTIVE'",
          [row.session_id],
        );
        await connection.query("commit");
        throw new UnauthorizedException("Session refresh unavailable");
      }
      if (
        row.session_state !== "ACTIVE" ||
        row.expires_at <= new Date() ||
        row.absolute_expires_at <= new Date() ||
        row.authentication_version !== row.user_version
      ) {
        await connection.query(
          "update app.sessions set status='REVOKED',revoked_at=now() where id=$1 and status='ACTIVE'",
          [row.session_id],
        );
        await connection.query("commit");
        throw new UnauthorizedException("Session refresh unavailable");
      }
      await connection.query(
        "update app.session_refresh_tokens set state='CONSUMED',consumed_at=now() where id=$1 and state='ACTIVE'",
        [row.id],
      );
      const now = new Date();
      const maximumIdle =
        row.assurance === "MFA"
          ? 8 * 3_600_000
          : clientKind === "WEB"
            ? 12 * 3_600_000
            : 7 * 86_400_000;
      const idle = new Date(
        Math.min(
          now.getTime() + maximumIdle,
          row.absolute_expires_at.getTime(),
        ),
      );
      const refreshToken = randomBytes(32).toString("base64url");
      await connection.query(
        `insert into app.session_refresh_tokens (user_id,session_id,parent_id,token_hash,state,issued_at,expires_at)
         values($1,$2,$3,$4,'ACTIVE',$5,$6)`,
        [row.user_id, row.session_id, row.id, digest(refreshToken), now, idle],
      );
      await connection.query(
        "update app.sessions set idle_expires_at=$1,last_seen_at=$2 where id=$3",
        [idle, now, row.session_id],
      );
      const accessToken = await this.accessToken(
        row.user_id,
        row.session_id,
        row.assurance,
        Math.floor(row.auth_time.getTime() / 1000),
        row.mfa_verified_at
          ? Math.floor(row.mfa_verified_at.getTime() / 1000)
          : undefined,
      );
      const handoffId = randomUUID();
      const handoffExpires = new Date(now.getTime() + 60_000);
      await connection.query(
        `insert into app.credential_handoffs
         (id,user_id,session_id,purpose,client_kind,client_binding_hash,authentication_version,encrypted_material,key_ref,state,expires_at)
         values($1,$2,$3,'SESSION',$4,$5,$6,$7,$8,'READY',$9)`,
        [
          handoffId,
          row.user_id,
          row.session_id,
          clientKind,
          row.client_binding_hash,
          row.authentication_version,
          encrypt({
            kind: "MOBILE_SESSION",
            access_token: accessToken,
            refresh_token: refreshToken,
            session_id: row.session_id,
          }),
          loadLocalSecrets().keyId,
          handoffExpires,
        ],
      );
      await connection.query("commit");
      return {
        session_id: row.session_id,
        expires_at: idle.toISOString(),
        absolute_expires_at: row.absolute_expires_at.toISOString(),
        assurance: row.assurance,
        authentication_state: "SESSION_HANDOFF_REQUIRED",
        handoff: {
          handoff_id: handoffId,
          purpose: "SESSION",
          expires_at: handoffExpires.toISOString(),
        },
      };
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  async revokeSession(
    refreshToken: string | undefined,
    accessToken: string | undefined,
    binding?: string,
  ): Promise<void> {
    let userId: string | undefined;
    let sessionId: string | undefined;
    if (refreshToken) {
      const token = await this.pool.query<{
        user_id: string;
        session_id: string;
      }>(
        "select user_id,session_id from app.session_refresh_tokens where token_hash=$1",
        [digest(refreshToken)],
      );
      userId = token.rows[0]?.user_id;
      sessionId = token.rows[0]?.session_id;
    }
    if (!sessionId && accessToken) {
      try {
        const { accessPublicKey, keyId } = loadLocalSecrets();
        const verified = await compactVerify(accessToken, accessPublicKey, {
          algorithms: ["EdDSA"],
        });
        const claims = JSON.parse(
          Buffer.from(verified.payload).toString("utf8"),
        ) as Record<string, unknown>;
        const header = verified.protectedHeader;
        if (
          header.kid !== keyId ||
          claims.iss !== "pbssu-rescue-ops-local" ||
          claims.aud !== "pbssu-rescue-ops-api" ||
          typeof claims.sub !== "string" ||
          typeof claims.sid !== "string" ||
          typeof claims.exp !== "number"
        ) {
          throw new Error("Invalid signed access proof");
        }
        userId = claims.sub;
        sessionId = claims.sid;
      } catch {
        throw new UnauthorizedException("Session revocation unavailable");
      }
    }
    if (!sessionId || !userId) {
      throw new UnauthorizedException("Session revocation unavailable");
    }
    if (binding !== undefined) {
      const session = await this.pool.query<{
        client_kind: string;
        client_binding_hash: string;
      }>(
        "select client_kind,client_binding_hash from app.sessions where id=$1 and user_id=$2",
        [sessionId, userId],
      );
      if (
        session.rows[0]?.client_kind !== "WEB" ||
        session.rows[0]?.client_binding_hash !== digest(binding)
      ) {
        throw new UnauthorizedException("Session revocation unavailable");
      }
    }
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      const result = await connection.query(
        "select id from app.sessions where id=$1 and user_id=$2 for update",
        [sessionId, userId],
      );
      if (result.rowCount !== 1) {
        throw new UnauthorizedException("Session revocation unavailable");
      }
      await connection.query(
        "update app.sessions set status='REVOKED',revoked_at=now() where id=$1 and status in ('ACTIVE','PENDING_DELIVERY')",
        [sessionId],
      );
      await connection.query(
        "update app.session_refresh_tokens set state='REVOKED',revoked_at=now() where session_id=$1 and state in ('ACTIVE','CONSUMED')",
        [sessionId],
      );
      await connection.query(
        "update app.credential_handoffs set state='REVOKED',encrypted_material=null where session_id=$1 and state='READY'",
        [sessionId],
      );
      await connection.query("commit");
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  async listSessions(token: string): Promise<Record<string, unknown>> {
    const actor = await this.authenticateAccessToken(token);
    const sessions = await this.pool.query<{
      id: string;
      client_kind: string;
      status: string;
      assurance: string;
      auth_time: Date;
      last_seen_at: Date;
      idle_expires_at: Date;
      absolute_expires_at: Date;
    }>(
      `select id,client_kind,status,assurance,auth_time,last_seen_at,idle_expires_at,absolute_expires_at
       from app.sessions where user_id=$1 order by created_at desc limit 50`,
      [actor.userId],
    );
    return {
      items: sessions.rows.map((session) => ({
        session_id: session.id,
        client_kind: session.client_kind,
        status: session.status,
        assurance: session.assurance,
        auth_time: session.auth_time.toISOString(),
        last_seen_at: session.last_seen_at.toISOString(),
        expires_at: session.idle_expires_at.toISOString(),
        absolute_expires_at: session.absolute_expires_at.toISOString(),
      })),
    };
  }

  async revokeOwnedSession(token: string, sessionId: string): Promise<void> {
    const actor = await this.authenticateAccessToken(token);
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      const session = await connection.query(
        "select id from app.sessions where id=$1 and user_id=$2 for update",
        [sessionId, actor.userId],
      );
      if (session.rowCount !== 1) {
        throw new NotFoundException("Session not found");
      }
      await connection.query(
        "update app.sessions set status='REVOKED',revoked_at=now() where id=$1 and user_id=$2 and status in ('ACTIVE','PENDING_DELIVERY')",
        [sessionId, actor.userId],
      );
      await connection.query(
        "update app.session_refresh_tokens set state='REVOKED',revoked_at=now() where session_id=$1 and user_id=$2 and state in ('ACTIVE','CONSUMED')",
        [sessionId, actor.userId],
      );
      await connection.query(
        "update app.credential_handoffs set state='REVOKED',encrypted_material=null where session_id=$1 and user_id=$2 and state='READY'",
        [sessionId, actor.userId],
      );
      await connection.query("commit");
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  async revokeAllSessions(token: string): Promise<void> {
    const actor = await this.authenticateAccessToken(token);
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      await connection.query(
        "update app.sessions set status='REVOKED',revoked_at=now() where user_id=$1 and status in ('ACTIVE','PENDING_DELIVERY')",
        [actor.userId],
      );
      await connection.query(
        "update app.session_refresh_tokens set state='REVOKED',revoked_at=now() where user_id=$1 and state in ('ACTIVE','CONSUMED')",
        [actor.userId],
      );
      await connection.query(
        "update app.credential_handoffs set state='REVOKED',encrypted_material=null where user_id=$1 and state='READY'",
        [actor.userId],
      );
      await connection.query("commit");
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  private async createSessionHandoff(
    userId: string,
    authVersion: number,
    clientKind: "WEB" | "MOBILE",
    bindingHash: string,
    assurance: "PASSWORD" | "MFA",
    mfaVerifiedAt?: Date,
  ): Promise<Record<string, unknown>> {
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      const sessionId = randomUUID();
      const now = new Date();
      const absolute = new Date(
        now.getTime() + (clientKind === "WEB" ? 7 : 30) * 86_400_000,
      );
      const idle = new Date(
        Math.min(
          now.getTime() + (clientKind === "WEB" ? 12 : 24) * 3_600_000,
          absolute.getTime(),
        ),
      );
      await connection.query(
        `insert into app.sessions
         (id,user_id,client_kind,status,client_binding_hash,auth_time,mfa_verified_at,assurance,authentication_version,idle_expires_at,absolute_expires_at)
         values($1,$2,$3,'PENDING_DELIVERY',$4,$5,$6,$7,$8,$9,$10)`,
        [
          sessionId,
          userId,
          clientKind,
          bindingHash,
          now,
          mfaVerifiedAt ?? null,
          assurance,
          authVersion,
          idle,
          absolute,
        ],
      );
      const refreshToken = randomBytes(32).toString("base64url");
      const refreshId = randomUUID();
      await connection.query(
        `insert into app.session_refresh_tokens
         (id,user_id,session_id,token_hash,state,issued_at,expires_at)
         values($1,$2,$3,$4,'ACTIVE',$5,$6)`,
        [refreshId, userId, sessionId, digest(refreshToken), now, idle],
      );
      const accessToken = await this.accessToken(
        userId,
        sessionId,
        assurance,
        Math.floor(now.getTime() / 1000),
        mfaVerifiedAt ? Math.floor(mfaVerifiedAt.getTime() / 1000) : undefined,
      );
      const handoffId = randomUUID();
      const handoffExpires = new Date(now.getTime() + 60_000);
      await connection.query(
        `insert into app.credential_handoffs
         (id,user_id,session_id,purpose,client_kind,client_binding_hash,authentication_version,encrypted_material,key_ref,state,expires_at)
         values($1,$2,$3,'SESSION',$4,$5,$6,$7,$8,'READY',$9)`,
        [
          handoffId,
          userId,
          sessionId,
          clientKind,
          bindingHash,
          authVersion,
          encrypt({
            kind: "MOBILE_SESSION",
            access_token: accessToken,
            refresh_token: refreshToken,
            session_id: sessionId,
          }),
          loadLocalSecrets().keyId,
          handoffExpires,
        ],
      );
      await connection.query("commit");
      return {
        session_id: sessionId,
        expires_at: idle.toISOString(),
        absolute_expires_at: absolute.toISOString(),
        assurance,
        authentication_state: "SESSION_HANDOFF_REQUIRED",
        handoff: {
          handoff_id: handoffId,
          purpose: "SESSION",
          expires_at: handoffExpires.toISOString(),
        },
      };
    } catch {
      await connection.query("rollback");
      throw new UnauthorizedException("Authentication failed");
    } finally {
      connection.release();
    }
  }

  async login(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (
      typeof body.login !== "string" ||
      typeof body.password !== "string" ||
      body.password.length < 1 ||
      body.password.length > 1024 ||
      !["WEB", "MOBILE"].includes(String(body.client_kind)) ||
      typeof body.client_binding !== "string" ||
      Buffer.from(body.client_binding, "base64url").length < 32
    ) {
      throw new BadRequestException("Invalid request");
    }
    const normalized = body.login.trim().toLowerCase();
    if (!/^[^\s@]+@example\.invalid$/.test(normalized)) {
      throw new UnauthorizedException("Invalid credentials");
    }
    this.throttle(digest(normalized));
    const result = await this.pool.query<IdentityRow>(
      `select u.id,u.email_normalized,u.email_verified_at,u.status,u.authentication_version,c.password_hash
       from app.users u join app.password_credentials c on c.user_id=u.id
       where u.email_normalized=$1`,
      [normalized],
    );
    const identity = result.rows[0];
    if (
      !identity ||
      identity.status !== "ACTIVE" ||
      !identity.email_verified_at ||
      !(await argon2.verify(identity.password_hash, body.password))
    ) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const bindingHash = digest(body.client_binding);
    const privileged = await this.requiresPrivilegedMfa(identity.id);
    const activeFactor = await this.pool.query<{ id: string }>(
      "select id from app.mfa_credentials where user_id=$1 and state='ACTIVE' limit 1",
      [identity.id],
    );
    if (privileged && !activeFactor.rows[0]) {
      return this.createChallenge(
        identity,
        "MFA_ENROLL",
        String(body.client_kind),
        bindingHash,
        true,
      );
    }
    if (privileged && activeFactor.rows[0]) {
      return this.createChallenge(
        identity,
        "MFA_VERIFY",
        String(body.client_kind),
        bindingHash,
        true,
      );
    }
    return this.createSessionHandoff(
      identity.id,
      identity.authentication_version,
      body.client_kind as "WEB" | "MOBILE",
      bindingHash,
      "PASSWORD",
    );
  }

  private async createChallenge(
    identity: IdentityRow,
    purpose: string,
    clientKind: string,
    bindingHash: string,
    passwordVerified: boolean,
    sessionId?: string,
    invitation?: { organizationId: string; invitationId: string },
  ): Promise<Record<string, unknown>> {
    const id = randomUUID();
    const expires = new Date(Date.now() + 5 * 60_000);
    await this.pool.query(
      `insert into app.auth_challenges
       (id,user_id,session_id,invitation_organization_id,invitation_id,purpose,client_kind,client_binding_hash,state,authentication_version,password_verified_at,expires_at)
       values($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',$9,$10,$11)`,
      [
        id,
        identity.id,
        sessionId ?? null,
        invitation?.organizationId ?? null,
        invitation?.invitationId ?? null,
        purpose,
        clientKind,
        bindingHash,
        identity.authentication_version,
        passwordVerified ? new Date() : null,
        expires,
      ],
    );
    return {
      challenge_id: id,
      purpose,
      expires_at: expires.toISOString(),
      attempts_remaining: 5,
      authentication_state: "CHALLENGE_REQUIRED",
      next_action:
        purpose === "MFA_ENROLL"
          ? "ENROLL_MFA"
          : purpose === "INVITATION_ACTIVATE"
            ? "COMPLETE_INVITATION"
            : purpose === "FACTOR_REPLACE"
              ? "CONFIRM_REPLACEMENT"
              : "VERIFY_MFA",
    };
  }

  async reauthenticate(
    token: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const actor = await this.authenticateAccessToken(token);
    if (
      typeof body.current_password !== "string" ||
      typeof body.client_binding !== "string" ||
      Buffer.from(body.client_binding, "base64url").length < 32
    ) {
      throw new BadRequestException("Invalid request");
    }
    const session = await this.pool.query<{
      client_kind: "WEB" | "MOBILE";
      client_binding_hash: string;
      authentication_version: number;
      status: string;
    }>(
      "select client_kind,client_binding_hash,authentication_version,status from app.sessions where id=$1 and user_id=$2",
      [actor.sessionId, actor.userId],
    );
    const currentSession = session.rows[0];
    if (
      !currentSession ||
      currentSession.status !== "ACTIVE" ||
      currentSession.client_binding_hash !== digest(body.client_binding)
    ) {
      throw new UnauthorizedException("Authentication required");
    }
    const credential = await this.pool.query<IdentityRow>(
      `select u.id,u.email_normalized,u.email_verified_at,u.status,u.authentication_version,c.password_hash
       from app.users u join app.password_credentials c on c.user_id=u.id where u.id=$1`,
      [actor.userId],
    );
    const identity = credential.rows[0];
    if (
      !identity ||
      identity.status !== "ACTIVE" ||
      !(await argon2.verify(identity.password_hash, body.current_password))
    ) {
      throw new UnauthorizedException("Authentication failed");
    }
    const privileged = await this.requiresPrivilegedMfa(actor.userId);
    const factor = await this.pool.query(
      "select 1 from app.mfa_credentials where user_id=$1 and state='ACTIVE'",
      [actor.userId],
    );
    if (privileged && factor.rowCount === 1) {
      return this.createChallenge(
        identity,
        "MFA_VERIFY",
        currentSession.client_kind,
        currentSession.client_binding_hash,
        true,
        actor.sessionId,
      );
    }
    if (privileged) {
      return this.createChallenge(
        identity,
        "MFA_ENROLL",
        currentSession.client_kind,
        currentSession.client_binding_hash,
        true,
        actor.sessionId,
      );
    }
    return this.createSessionHandoff(
      identity.id,
      identity.authentication_version,
      currentSession.client_kind,
      currentSession.client_binding_hash,
      "PASSWORD",
    );
  }

  async startMfaReplacement(
    token: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const actor = await this.authenticateAccessToken(token);
    await this.requireRecentMfa(actor);
    if (
      typeof body.current_password !== "string" ||
      typeof body.client_binding !== "string"
    ) {
      throw new BadRequestException("Invalid request");
    }
    const credentials = await this.pool.query<IdentityRow>(
      `select u.id,u.email_normalized,u.email_verified_at,u.status,u.authentication_version,c.password_hash
       from app.users u join app.password_credentials c on c.user_id=u.id where u.id=$1`,
      [actor.userId],
    );
    const identity = credentials.rows[0];
    if (
      !identity ||
      identity.status !== "ACTIVE" ||
      !(await argon2.verify(identity.password_hash, body.current_password))
    ) {
      throw new UnauthorizedException("Authentication failed");
    }
    const session = await this.pool.query<{
      client_kind: "WEB" | "MOBILE";
      client_binding_hash: string;
      status: string;
    }>(
      "select client_kind,client_binding_hash,status from app.sessions where id=$1 and user_id=$2",
      [actor.sessionId, actor.userId],
    );
    const current = session.rows[0];
    if (
      !current ||
      current.status !== "ACTIVE" ||
      current.client_binding_hash !== digest(body.client_binding)
    ) {
      throw new UnauthorizedException("Authentication required");
    }
    const factor = await this.pool.query(
      "select 1 from app.mfa_credentials where user_id=$1 and state='ACTIVE'",
      [actor.userId],
    );
    if (factor.rowCount !== 1) {
      throw new ForbiddenException(
        "An active factor is required for replacement",
      );
    }
    const challenge = await this.createChallenge(
      identity,
      "FACTOR_REPLACE",
      current.client_kind,
      current.client_binding_hash,
      true,
      actor.sessionId,
    );
    const enrollment = await this.startMfaEnrollment(
      { challenge_id: challenge.challenge_id },
      body.client_binding,
    );
    return { ...challenge, ...enrollment, next_action: "CONFIRM_REPLACEMENT" };
  }

  async rotateRecoveryCodes(
    token: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const actor = await this.authenticateAccessToken(token);
    await this.requireRecentMfa(actor);
    if (typeof body.current_password !== "string") {
      throw new BadRequestException("Invalid request");
    }
    const credential = await this.pool.query<{ password_hash: string }>(
      "select password_hash from app.password_credentials where user_id=$1",
      [actor.userId],
    );
    if (
      !credential.rows[0] ||
      !(await argon2.verify(
        credential.rows[0].password_hash,
        body.current_password,
      ))
    ) {
      throw new UnauthorizedException("Authentication failed");
    }
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      const session = await connection.query<{
        client_kind: "WEB" | "MOBILE";
        client_binding_hash: string;
        authentication_version: number;
      }>(
        "select client_kind,client_binding_hash,authentication_version from app.sessions where id=$1 and user_id=$2 and status='ACTIVE' for update",
        [actor.sessionId, actor.userId],
      );
      const factor = await connection.query<{ id: string }>(
        "select id from app.mfa_credentials where user_id=$1 and state='ACTIVE' for update",
        [actor.userId],
      );
      const currentSession = session.rows[0];
      const currentFactor = factor.rows[0];
      if (!currentSession || !currentFactor) {
        throw new UnauthorizedException("MFA recovery unavailable");
      }
      await connection.query(
        "update app.recovery_codes set revoked_at=now() where mfa_credential_id=$1 and used_at is null and revoked_at is null",
        [currentFactor.id],
      );
      await connection.query(
        "update app.credential_handoffs set state='REVOKED',encrypted_material=null where mfa_credential_id=$1 and purpose='RECOVERY_CODES' and state='READY'",
        [currentFactor.id],
      );
      const codes = Array.from({ length: 10 }, () =>
        randomBytes(16).toString("base64url"),
      );
      for (const code of codes) {
        await connection.query(
          "insert into app.recovery_codes (user_id,mfa_credential_id,code_hash) values($1,$2,$3)",
          [actor.userId, currentFactor.id, digest(code)],
        );
      }
      const handoffId = randomUUID();
      const expires = new Date(Date.now() + 5 * 60_000);
      await connection.query(
        `insert into app.credential_handoffs
         (id,user_id,session_id,mfa_credential_id,purpose,client_kind,client_binding_hash,authentication_version,encrypted_material,key_ref,state,expires_at)
         values($1,$2,$3,$4,'RECOVERY_CODES',$5,$6,$7,$8,$9,'READY',$10)`,
        [
          handoffId,
          actor.userId,
          actor.sessionId,
          currentFactor.id,
          currentSession.client_kind,
          currentSession.client_binding_hash,
          currentSession.authentication_version,
          encrypt({ kind: "RECOVERY_CODES", codes }),
          loadLocalSecrets().keyId,
          expires,
        ],
      );
      await connection.query(
        `insert into app.identity_audit_logs
         (actor_user_id,subject_user_id,action_code,result_code,reason_code,resource_type,resource_id,correlation_id)
         values($1,$1,'RECOVERY_CODE_ROTATION','SUCCESS','CODES_REPLACED','MFA_FACTOR',$2,$3)`,
        [actor.userId, currentFactor.id, randomUUID()],
      );
      await connection.query("commit");
      return {
        status: "REQUEST_ACCEPTED",
        correlation_id: randomUUID(),
        handoff: {
          handoff_id: handoffId,
          purpose: "RECOVERY_CODES",
          expires_at: expires.toISOString(),
        },
      };
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  private async createAuthenticatedSessionHandoff(
    connection: PoolClient,
    identity: Pick<IdentityRow, "id" | "authentication_version">,
    challenge: ChallengeRow,
    acceptedAt: Date,
    assurance: "PASSWORD" | "MFA" = "MFA",
  ): Promise<Record<string, unknown>> {
    const sessionId = randomUUID();
    const now = new Date();
    const absolute = new Date(
      now.getTime() +
        (assurance === "MFA"
          ? 24
          : challenge.client_kind === "WEB"
            ? 168
            : 720) *
          60 *
          60_000,
    );
    const idle = new Date(
      now.getTime() +
        (assurance === "MFA" ? 8 : challenge.client_kind === "WEB" ? 12 : 168) *
          60 *
          60_000,
    );
    await connection.query(
      `insert into app.sessions
       (id,user_id,client_kind,status,client_binding_hash,auth_time,mfa_verified_at,assurance,authentication_version,idle_expires_at,absolute_expires_at)
       values($1,$2,$3,'PENDING_DELIVERY',$4,$5,$6,$7,$8,$9,$10)`,
      [
        sessionId,
        identity.id,
        challenge.client_kind,
        challenge.client_binding_hash,
        now,
        assurance === "MFA" ? acceptedAt : null,
        assurance,
        identity.authentication_version,
        idle,
        absolute,
      ],
    );
    const refreshToken = randomBytes(32).toString("base64url");
    await connection.query(
      `insert into app.session_refresh_tokens (user_id,session_id,token_hash,state,issued_at,expires_at)
       values($1,$2,$3,'ACTIVE',$4,$5)`,
      [identity.id, sessionId, digest(refreshToken), now, idle],
    );
    const accessToken = await this.accessToken(
      identity.id,
      sessionId,
      assurance,
      Math.floor(now.getTime() / 1000),
      assurance === "MFA" ? Math.floor(acceptedAt.getTime() / 1000) : undefined,
    );
    const handoffId = randomUUID();
    const handoffExpires = new Date(now.getTime() + 60_000);
    await connection.query(
      `insert into app.credential_handoffs
       (id,user_id,session_id,purpose,client_kind,client_binding_hash,authentication_version,encrypted_material,key_ref,state,expires_at)
       values($1,$2,$3,'SESSION',$4,$5,$6,$7,$8,'READY',$9)`,
      [
        handoffId,
        identity.id,
        sessionId,
        challenge.client_kind,
        challenge.client_binding_hash,
        identity.authentication_version,
        encrypt({
          kind: "MOBILE_SESSION",
          access_token: accessToken,
          refresh_token: refreshToken,
          session_id: sessionId,
        }),
        loadLocalSecrets().keyId,
        handoffExpires,
      ],
    );
    return {
      session_id: sessionId,
      expires_at: idle.toISOString(),
      absolute_expires_at: absolute.toISOString(),
      assurance,
      authentication_state: "SESSION_HANDOFF_REQUIRED",
      handoff: {
        handoff_id: handoffId,
        purpose: "SESSION",
        expires_at: handoffExpires.toISOString(),
      },
    };
  }

  async verifyMfa(
    body: Record<string, unknown>,
    binding: string,
  ): Promise<Record<string, unknown>> {
    const challengeId = safeIdentifier(body.challenge_id);
    if (typeof body.code !== "string" || !/^\d{6}$/.test(body.code)) {
      throw new BadRequestException("Invalid request");
    }
    const bindingHash = digest(binding);
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      const challengeResult = await connection.query<ChallengeRow>(
        `select * from app.auth_challenges where id=$1 for update`,
        [challengeId],
      );
      const challenge = challengeResult.rows[0];
      if (
        !challenge ||
        challenge.state !== "PENDING" ||
        challenge.purpose !== "MFA_VERIFY" ||
        challenge.expires_at <= new Date() ||
        challenge.client_binding_hash !== bindingHash ||
        challenge.authentication_version < 1 ||
        challenge.attempts >= challenge.max_attempts
      ) {
        await connection.query("rollback");
        throw new UnauthorizedException("Authentication challenge invalid");
      }
      if (challenge.session_id) {
        const session = await connection.query(
          `select 1 from app.sessions
           where id=$1 and user_id=$2 and status='ACTIVE'
             and authentication_version=$3 and absolute_expires_at>now() and idle_expires_at>now()
           for update`,
          [
            challenge.session_id,
            challenge.user_id,
            challenge.authentication_version,
          ],
        );
        if (session.rowCount !== 1) {
          throw new UnauthorizedException("Authentication challenge invalid");
        }
      }
      const factorResult = await connection.query<{
        id: string;
        seed_ciphertext: string;
        last_accepted_step: string | null;
      }>(
        "select id,seed_ciphertext,last_accepted_step from app.mfa_credentials where user_id=$1 and state='ACTIVE' for update",
        [challenge.user_id],
      );
      const factor = factorResult.rows[0];
      if (!factor) {
        await connection.query("rollback");
        throw new UnauthorizedException("Authentication challenge invalid");
      }
      const seed = decrypt<{ secret: string }>(factor.seed_ciphertext).secret;
      const totp = new TOTP({
        secret: Secret.fromBase32(seed),
        digits: 6,
        period: 30,
      });
      const delta = totp.validate({ token: body.code, window: 1 });
      const currentStep = Math.floor(Date.now() / 30_000) + (delta ?? 0);
      if (
        delta === null ||
        (factor.last_accepted_step &&
          currentStep <= Number(factor.last_accepted_step))
      ) {
        await connection.query(
          `update app.auth_challenges set attempts=attempts+1,
           state=case when attempts+1>=max_attempts then 'LOCKED' else state end where id=$1`,
          [challengeId],
        );
        await connection.query("commit");
        throw new UnauthorizedException("Authentication challenge invalid");
      }
      const acceptedAt = new Date();
      await connection.query(
        "update app.mfa_credentials set last_accepted_step=$1 where id=$2",
        [currentStep, factor.id],
      );
      await connection.query(
        "update app.auth_challenges set state='CONSUMED',consumed_at=now(),mfa_verified_at=now() where id=$1",
        [challengeId],
      );
      const identityResult = await connection.query<IdentityRow>(
        `select u.id,u.email_normalized,u.email_verified_at,u.status,u.authentication_version,c.password_hash
         from app.users u join app.password_credentials c on c.user_id=u.id where u.id=$1`,
        [challenge.user_id],
      );
      const identity = identityResult.rows[0];
      if (
        !identity ||
        identity.status !== "ACTIVE" ||
        identity.authentication_version !== challenge.authentication_version
      ) {
        await connection.query("rollback");
        throw new UnauthorizedException("Authentication challenge invalid");
      }
      if (challenge.invitation_id && challenge.invitation_organization_id) {
        await connection.query(
          "select set_config('app.organization_id',$1,true),set_config('app.actor_user_id',$2,true)",
          [challenge.invitation_organization_id, identity.id],
        );
        const invitation = await connection.query(
          `select 1 from app.organization_invitations
           where id=$1 and organization_id=$2 and bound_user_id=$3
             and status='AWAITING_MFA' and expires_at>now() for update`,
          [
            challenge.invitation_id,
            challenge.invitation_organization_id,
            identity.id,
          ],
        );
        if (invitation.rowCount !== 1) {
          throw new UnauthorizedException("Authentication challenge invalid");
        }
        const activationChallengeId = randomUUID();
        const activationExpires = new Date(Date.now() + 5 * 60_000);
        await connection.query(
          `insert into app.auth_challenges
           (id,user_id,session_id,invitation_organization_id,invitation_id,purpose,client_kind,client_binding_hash,state,authentication_version,password_verified_at,mfa_verified_at,expires_at)
           values($1,$2,$3,$4,$5,'INVITATION_ACTIVATE',$6,$7,'PENDING',$8,$9,$10,$11)`,
          [
            activationChallengeId,
            identity.id,
            challenge.session_id,
            challenge.invitation_organization_id,
            challenge.invitation_id,
            challenge.client_kind,
            challenge.client_binding_hash,
            identity.authentication_version,
            challenge.password_verified_at,
            acceptedAt,
            activationExpires,
          ],
        );
        await connection.query("commit");
        return {
          challenge_id: activationChallengeId,
          expires_at: activationExpires.toISOString(),
          next_action: "COMPLETE_INVITATION",
          authentication_state: "CHALLENGE_REQUIRED",
        };
      }
      const sessionResult = await this.createAuthenticatedSessionHandoff(
        connection,
        identity,
        challenge,
        acceptedAt,
      );
      await connection.query("commit");
      return sessionResult;
    } catch (error) {
      if (connection) await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  async redeemRecoveryCode(
    body: Record<string, unknown>,
    binding: string,
  ): Promise<Record<string, unknown>> {
    const challengeId = safeIdentifier(body.challenge_id);
    if (
      typeof body.recovery_code !== "string" ||
      body.recovery_code.length < 20 ||
      body.recovery_code.length > 256
    ) {
      throw new BadRequestException("Invalid request");
    }
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      const challengeResult = await connection.query<ChallengeRow>(
        "select * from app.auth_challenges where id=$1 for update",
        [challengeId],
      );
      const challenge = challengeResult.rows[0];
      if (
        !challenge ||
        challenge.state !== "PENDING" ||
        challenge.purpose !== "MFA_VERIFY" ||
        challenge.expires_at <= new Date() ||
        challenge.client_binding_hash !== digest(binding) ||
        challenge.attempts >= challenge.max_attempts
      ) {
        throw new UnauthorizedException("Authentication challenge invalid");
      }
      const code = await connection.query<{
        id: string;
        mfa_credential_id: string;
      }>(
        `select r.id,r.mfa_credential_id from app.recovery_codes r
         join app.mfa_credentials f on f.id=r.mfa_credential_id and f.user_id=r.user_id
         where r.user_id=$1 and r.code_hash=$2 and r.used_at is null and r.revoked_at is null
           and f.state='ACTIVE' for update of r,f`,
        [challenge.user_id, digest(body.recovery_code)],
      );
      const recovery = code.rows[0];
      if (!recovery) {
        await connection.query(
          `update app.auth_challenges set attempts=attempts+1,
           state=case when attempts+1>=max_attempts then 'LOCKED' else state end where id=$1`,
          [challengeId],
        );
        await connection.query("commit");
        throw new UnauthorizedException("Authentication challenge invalid");
      }
      const identity = await connection.query<{
        id: string;
        status: string;
        authentication_version: number;
      }>(
        "select id,status,authentication_version from app.users where id=$1 for update",
        [challenge.user_id],
      );
      const user = identity.rows[0];
      if (
        !user ||
        user.status !== "ACTIVE" ||
        user.authentication_version !== challenge.authentication_version
      ) {
        throw new UnauthorizedException("Authentication challenge invalid");
      }
      const acceptedAt = new Date();
      await connection.query(
        "update app.recovery_codes set used_at=now() where id=$1",
        [recovery.id],
      );
      await connection.query(
        "update app.auth_challenges set state='CONSUMED',consumed_at=now(),mfa_verified_at=now() where id=$1",
        [challengeId],
      );
      await connection.query(
        `insert into app.identity_audit_logs
         (subject_user_id,action_code,result_code,reason_code,resource_type,resource_id,correlation_id)
         values($1,'RECOVERY_CODE','SUCCESS','SINGLE_USE_CODE','MFA_FACTOR',$2,$3)`,
        [user.id, recovery.mfa_credential_id, randomUUID()],
      );
      const session = await this.createAuthenticatedSessionHandoff(
        connection,
        user,
        challenge,
        acceptedAt,
      );
      await connection.query("commit");
      return session;
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  async startMfaEnrollment(
    body: Record<string, unknown>,
    binding: string,
  ): Promise<Record<string, unknown>> {
    const challengeId = safeIdentifier(body.challenge_id);
    const result = await this.pool.query<ChallengeRow>(
      `select * from app.auth_challenges where id=$1 and state='PENDING' and purpose in ('MFA_ENROLL','FACTOR_REPLACE') and expires_at>now() and client_binding_hash=$2`,
      [challengeId, digest(binding)],
    );
    const challenge = result.rows[0];
    if (!challenge || !challenge.password_verified_at) {
      throw new UnauthorizedException("Authentication challenge invalid");
    }
    const enrollmentId = randomUUID();
    const secret = new Secret({ size: 20 });
    const seedCiphertext = encrypt({ secret: secret.base32 });
    await this.pool.query(
      `insert into app.mfa_credentials (id,user_id,seed_ciphertext,encryption_key_ref,state)
       values($1,$2,$3,$4,'PENDING')`,
      [
        enrollmentId,
        challenge.user_id,
        seedCiphertext,
        loadLocalSecrets().keyId,
      ],
    );
    const handoffId = randomUUID();
    const expires = new Date(Date.now() + 5 * 60_000);
    const totp = new TOTP({
      issuer: "PBSSU Rescue Ops",
      label: challenge.user_id,
      secret,
      digits: 6,
      period: 30,
    });
    await this.pool.query(
      `insert into app.credential_handoffs
       (id,user_id,mfa_credential_id,challenge_id,purpose,client_kind,client_binding_hash,authentication_version,encrypted_material,key_ref,state,expires_at)
       values($1,$2,$3,$4,'TOTP_SETUP',$5,$6,$7,$8,$9,'READY',$10)`,
      [
        handoffId,
        challenge.user_id,
        enrollmentId,
        challengeId,
        challenge.client_kind,
        challenge.client_binding_hash,
        challenge.authentication_version,
        encrypt({
          kind: "TOTP_SETUP",
          enrollment_id: enrollmentId,
          secret: secret.base32,
          otpauth_uri: totp.toString(),
          expires_at: expires.toISOString(),
        }),
        loadLocalSecrets().keyId,
        expires,
      ],
    );
    return {
      enrollment_id: enrollmentId,
      handoff: {
        handoff_id: handoffId,
        purpose: "TOTP_SETUP",
        expires_at: expires.toISOString(),
      },
      authentication_state: "CHALLENGE_REQUIRED",
    };
  }

  async confirmMfaEnrollment(
    body: Record<string, unknown>,
    binding: string,
    expectedPurpose: "MFA_ENROLL" | "FACTOR_REPLACE" = "MFA_ENROLL",
  ): Promise<Record<string, unknown>> {
    const challengeId = safeIdentifier(body.challenge_id);
    const enrollmentId = safeIdentifier(body.enrollment_id);
    if (typeof body.code !== "string" || !/^\d{6}$/.test(body.code)) {
      throw new BadRequestException("Invalid request");
    }
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      const result = await connection.query<{
        user_id: string;
        seed_ciphertext: string;
        enrollment_state: string;
        client_kind: "WEB" | "MOBILE";
        session_id: string | null;
        client_binding_hash: string;
        authentication_version: number;
        password_verified_at: Date;
        purpose: string;
        invitation_organization_id: string | null;
        invitation_id: string | null;
      }>(
        `select c.user_id,c.seed_ciphertext,c.state as enrollment_state,
                a.client_kind,a.session_id,a.client_binding_hash,a.authentication_version,a.password_verified_at,a.purpose,
                a.invitation_organization_id,a.invitation_id
         from app.mfa_credentials c join app.auth_challenges a on a.user_id=c.user_id
         where c.id=$1 and a.id=$2 and a.purpose in ('MFA_ENROLL','FACTOR_REPLACE') and a.state='PENDING'
           and a.client_binding_hash=$3 and a.expires_at>now() and c.state='PENDING'
         for update of c,a`,
        [enrollmentId, challengeId, digest(binding)],
      );
      const enrollment = result.rows[0];
      if (!enrollment || enrollment.purpose !== expectedPurpose) {
        await connection.query("rollback");
        throw new UnauthorizedException("Authentication challenge invalid");
      }
      if (enrollment.session_id) {
        const session = await connection.query(
          `select 1 from app.sessions where id=$1 and user_id=$2 and status='ACTIVE'
           and authentication_version=$3 and idle_expires_at>now() and absolute_expires_at>now()
           for update`,
          [
            enrollment.session_id,
            enrollment.user_id,
            enrollment.authentication_version,
          ],
        );
        if (session.rowCount !== 1) {
          throw new UnauthorizedException("Authentication challenge invalid");
        }
      }
      const seed = decrypt<{ secret: string }>(
        enrollment.seed_ciphertext,
      ).secret;
      const totp = new TOTP({
        secret: Secret.fromBase32(seed),
        digits: 6,
        period: 30,
      });
      const delta = totp.validate({ token: body.code, window: 1 });
      const acceptedStep = Math.floor(Date.now() / 30_000) + (delta ?? 0);
      if (delta === null) {
        await connection.query(
          `update app.auth_challenges set attempts=attempts+1,
           state=case when attempts+1>=max_attempts then 'LOCKED' else state end where id=$1`,
          [challengeId],
        );
        await connection.query("commit");
        throw new UnauthorizedException("Authentication challenge invalid");
      }
      if (enrollment.purpose === "FACTOR_REPLACE") {
        const retired = await connection.query<{ id: string }>(
          `update app.mfa_credentials set state='RETIRED',retired_at=now()
           where user_id=$1 and state='ACTIVE' returning id`,
          [enrollment.user_id],
        );
        const retiredId = retired.rows[0]?.id;
        if (retired.rowCount !== 1 || !retiredId) {
          throw new UnauthorizedException("Authentication challenge invalid");
        }
        await connection.query(
          "update app.recovery_codes set revoked_at=now() where mfa_credential_id=$1 and used_at is null and revoked_at is null",
          [retiredId],
        );
      }
      await connection.query(
        `update app.mfa_credentials set state='ACTIVE',confirmed_at=now(),last_accepted_step=$1 where id=$2`,
        [acceptedStep, enrollmentId],
      );
      await connection.query(
        "update app.auth_challenges set state='CONSUMED',consumed_at=now(),mfa_verified_at=now() where id=$1",
        [challengeId],
      );
      const codes = Array.from({ length: 10 }, () =>
        randomBytes(16).toString("base64url"),
      );
      for (const code of codes) {
        await connection.query(
          "insert into app.recovery_codes (user_id,mfa_credential_id,code_hash) values($1,$2,$3)",
          [enrollment.user_id, enrollmentId, digest(code)],
        );
      }
      const handoffId = randomUUID();
      const expires = new Date(Date.now() + 5 * 60_000);
      await connection.query(
        `insert into app.credential_handoffs
         (id,user_id,mfa_credential_id,purpose,client_kind,client_binding_hash,authentication_version,encrypted_material,key_ref,state,expires_at)
         select $1,$2,$3,'RECOVERY_CODES',a.client_kind,a.client_binding_hash,a.authentication_version,$4,$5,'READY',$6
         from app.auth_challenges a where a.id=$7`,
        [
          handoffId,
          enrollment.user_id,
          enrollmentId,
          encrypt({ kind: "RECOVERY_CODES", codes }),
          loadLocalSecrets().keyId,
          expires,
          challengeId,
        ],
      );
      if (enrollment.purpose === "FACTOR_REPLACE") {
        await connection.query(
          "update app.sessions set status='REVOKED',revoked_at=now() where user_id=$1 and status in ('ACTIVE','PENDING_DELIVERY')",
          [enrollment.user_id],
        );
        await connection.query(
          "update app.session_refresh_tokens set state='REVOKED',revoked_at=now() where user_id=$1 and state in ('ACTIVE','CONSUMED')",
          [enrollment.user_id],
        );
        await connection.query(
          "update app.auth_challenges set state='REVOKED' where user_id=$1 and id<>$2 and state='PENDING'",
          [enrollment.user_id, challengeId],
        );
        const newVersion = await connection.query<{
          authentication_version: number;
        }>(
          "update app.users set authentication_version=authentication_version+1,updated_at=now(),version=version+1 where id=$1 returning authentication_version",
          [enrollment.user_id],
        );
        await connection.query(
          "update app.credential_handoffs set state='REVOKED',encrypted_material=null where user_id=$1 and state='READY' and id<>$2",
          [enrollment.user_id, handoffId],
        );
        await connection.query(
          "update app.credential_handoffs set authentication_version=$1 where id=$2",
          [newVersion.rows[0]?.authentication_version, handoffId],
        );
        await connection.query(
          `insert into app.identity_audit_logs
           (actor_user_id,subject_user_id,action_code,result_code,reason_code,resource_type,resource_id,correlation_id)
           values($1,$1,'MFA_REPLACEMENT','SUCCESS','NEW_FACTOR_CONFIRMED','MFA_FACTOR',$2,$3)`,
          [enrollment.user_id, enrollmentId, randomUUID()],
        );
        await connection.query("commit");
        return {
          status: "REQUEST_ACCEPTED",
          correlation_id: randomUUID(),
          handoff: {
            handoff_id: handoffId,
            purpose: "RECOVERY_CODES",
            expires_at: expires.toISOString(),
          },
        };
      }
      const nextChallengeId = randomUUID();
      const nextChallengeExpires = new Date(Date.now() + 5 * 60_000);
      await connection.query(
        `insert into app.auth_challenges
         (id,user_id,session_id,invitation_organization_id,invitation_id,purpose,client_kind,client_binding_hash,state,authentication_version,password_verified_at,expires_at)
         values($1,$2,$3,$4,$5,'MFA_VERIFY',$6,$7,'PENDING',$8,$9,$10)`,
        [
          nextChallengeId,
          enrollment.user_id,
          enrollment.session_id,
          enrollment.invitation_organization_id,
          enrollment.invitation_id,
          enrollment.client_kind,
          enrollment.client_binding_hash,
          enrollment.authentication_version,
          enrollment.password_verified_at,
          nextChallengeExpires,
        ],
      );
      await connection.query("commit");
      return {
        challenge_id: nextChallengeId,
        expires_at: nextChallengeExpires.toISOString(),
        next_action: "VERIFY_MFA",
        authentication_state: "CHALLENGE_REQUIRED",
        recovery_handoff: {
          handoff_id: handoffId,
          purpose: "RECOVERY_CODES",
          expires_at: expires.toISOString(),
        },
      };
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  async redeemCredentialHandoff(
    handoffIdValue: string,
    body: Record<string, unknown>,
    binding: string,
    cookies: Record<string, string | undefined>,
    csrf: string | undefined,
    origin: string | undefined,
    response: CookieSink,
  ): Promise<Record<string, unknown> | null> {
    const handoffId = safeIdentifier(handoffIdValue);
    if (
      !["SESSION", "TOTP_SETUP", "RECOVERY_CODES"].includes(
        String(body.purpose),
      )
    ) {
      throw new BadRequestException("Invalid request");
    }
    const connection = await this.pool.connect();
    try {
      await connection.query("begin");
      const result = await connection.query<HandoffRow>(
        "select * from app.credential_handoffs where id=$1 for update",
        [handoffId],
      );
      const handoff = result.rows[0];
      if (
        !handoff ||
        handoff.state !== "READY" ||
        handoff.expires_at <= new Date() ||
        handoff.purpose !== body.purpose ||
        handoff.client_binding_hash !== digest(binding) ||
        !handoff.encrypted_material
      ) {
        await connection.query("rollback");
        throw new UnauthorizedException("Credential handoff unavailable");
      }
      if (handoff.client_kind === "WEB") {
        const cookieBinding = cookies["__Host-pbssu_binding"];
        if (
          origin !== this.environment.TRUSTED_WEB_ORIGIN ||
          (cookieBinding !== undefined &&
            (digest(cookieBinding) !== handoff.client_binding_hash ||
              !csrf ||
              csrf !== cookies["__Host-pbssu_csrf"]))
        ) {
          await connection.query("rollback");
          throw new ForbiddenException("Credential handoff unavailable");
        }
      }
      const currentUser = await connection.query<{
        status: string;
        authentication_version: number;
      }>(
        "select status,authentication_version from app.users where id=$1 for update",
        [handoff.user_id],
      );
      if (
        currentUser.rows[0]?.status !== "ACTIVE" ||
        currentUser.rows[0]?.authentication_version !==
          handoff.authentication_version
      ) {
        await connection.query("rollback");
        throw new UnauthorizedException("Credential handoff unavailable");
      }
      if (handoff.purpose === "SESSION") {
        const session = await connection.query<{
          status: string;
          authentication_version: number;
          user_version: number;
          client_kind: "WEB" | "MOBILE";
          client_binding_hash: string;
          idle_expires_at: Date;
          absolute_expires_at: Date;
        }>(
          `select s.status,s.authentication_version,u.authentication_version as user_version,
                  s.client_kind,s.client_binding_hash,s.idle_expires_at,s.absolute_expires_at
           from app.sessions s join app.users u on u.id=s.user_id
           where s.id=$1 and s.user_id=$2 for update of s,u`,
          [handoff.session_id, handoff.user_id],
        );
        if (
          !session.rows[0] ||
          !["PENDING_DELIVERY", "ACTIVE"].includes(session.rows[0].status) ||
          session.rows[0].authentication_version !==
            handoff.authentication_version ||
          session.rows[0].user_version !== handoff.authentication_version ||
          session.rows[0].client_kind !== handoff.client_kind ||
          session.rows[0].client_binding_hash !== handoff.client_binding_hash ||
          session.rows[0].idle_expires_at <= new Date() ||
          session.rows[0].absolute_expires_at <= new Date()
        ) {
          await connection.query("rollback");
          throw new UnauthorizedException("Credential handoff unavailable");
        }
        const material = decrypt<Record<string, string>>(
          handoff.encrypted_material,
        );
        await connection.query(
          "update app.sessions set status='ACTIVE' where id=$1",
          [handoff.session_id],
        );
        await connection.query(
          "update app.credential_handoffs set state='CONSUMED',consumed_at=now(),encrypted_material=null where id=$1",
          [handoffId],
        );
        await connection.query("commit");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Pragma", "no-cache");
        if (handoff.client_kind === "WEB") {
          const csrfValue = randomBytes(32).toString("base64url");
          response.cookie("__Host-pbssu_access", material.access_token ?? "", {
            secure: true,
            httpOnly: true,
            sameSite: "strict",
            path: "/",
            maxAge: 5 * 60_000,
          });
          response.cookie(
            "__Host-pbssu_refresh",
            material.refresh_token ?? "",
            {
              secure: true,
              httpOnly: true,
              sameSite: "strict",
              path: "/",
              maxAge: Math.max(
                0,
                session.rows[0].idle_expires_at.getTime() - Date.now(),
              ),
            },
          );
          response.cookie("__Host-pbssu_binding", binding, {
            secure: true,
            httpOnly: true,
            sameSite: "strict",
            path: "/",
            maxAge: Math.max(
              0,
              session.rows[0].absolute_expires_at.getTime() - Date.now(),
            ),
          });
          response.cookie("__Host-pbssu_csrf", csrfValue, {
            secure: true,
            httpOnly: false,
            sameSite: "strict",
            path: "/",
            maxAge: Math.max(
              0,
              session.rows[0].absolute_expires_at.getTime() - Date.now(),
            ),
          });
          return null;
        }
        return material;
      }
      if (handoff.purpose === "TOTP_SETUP") {
        const setupProof = await connection.query(
          `select 1 from app.auth_challenges a
           join app.mfa_credentials f on f.user_id=a.user_id
           where a.id=$1 and a.user_id=$2 and a.client_binding_hash=$3
             and a.authentication_version=$4 and a.state='PENDING'
             and a.purpose in ('MFA_ENROLL','FACTOR_REPLACE')
             and a.password_verified_at is not null and a.expires_at>now()
             and f.id=$5 and f.state='PENDING'`,
          [
            handoff.challenge_id,
            handoff.user_id,
            handoff.client_binding_hash,
            handoff.authentication_version,
            handoff.mfa_credential_id,
          ],
        );
        if (setupProof.rowCount !== 1) {
          await connection.query("rollback");
          throw new UnauthorizedException("Credential handoff unavailable");
        }
      }
      if (handoff.purpose === "RECOVERY_CODES") {
        const factor = await connection.query(
          `select 1 from app.mfa_credentials
           where id=$1 and user_id=$2 and state='ACTIVE' and confirmed_at is not null`,
          [handoff.mfa_credential_id, handoff.user_id],
        );
        if (factor.rowCount !== 1) {
          await connection.query("rollback");
          throw new UnauthorizedException("Credential handoff unavailable");
        }
      }
      const material = decrypt<Record<string, unknown>>(
        handoff.encrypted_material,
      );
      await connection.query(
        "update app.credential_handoffs set state='CONSUMED',consumed_at=now(),encrypted_material=null where id=$1",
        [handoffId],
      );
      await connection.query("commit");
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Pragma", "no-cache");
      return material;
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }
}
