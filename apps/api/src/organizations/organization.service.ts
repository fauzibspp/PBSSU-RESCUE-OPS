import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from "@nestjs/common";
import { sql } from "kysely";
import { connectDatabase, tenantTransaction } from "../database/connection.js";
import { loadEnvironment } from "../config.js";
import { IdentityService } from "../identity/identity.service.js";

const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const delegated = new Set([
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

function uuid(value: unknown): string {
  if (typeof value !== "string" || !idPattern.test(value))
    throw new BadRequestException("Invalid request");
  return value;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BadRequestException("Invalid request");
  return value as Record<string, unknown>;
}

@Injectable()
export class OrganizationService implements OnModuleDestroy {
  private readonly database = connectDatabase(
    loadEnvironment(process.env).DATABASE_URL,
  );

  constructor(private readonly identity: IdentityService) {}

  async onModuleDestroy(): Promise<void> {
    await this.database.destroy();
  }

  private async withTenant<T>(
    token: string,
    organizationValue: string,
    permission: string,
    run: (
      tx: import("../database/connection.js").DatabaseTransaction,
      membershipId: string,
      userId: string,
    ) => Promise<T>,
  ): Promise<T> {
    const organizationId = uuid(organizationValue);
    const actor = await this.identity.authenticateAccessToken(token);
    return tenantTransaction(
      this.database,
      organizationId,
      actor.userId,
      async (tx) => {
        const access = await sql<{
          membership_id: string;
          org_status: string;
          requires_privileged_mfa: boolean;
        }>`
        select m.id as membership_id,o.status as org_status,p.requires_privileged_mfa
        from app.memberships m join app.organizations o on o.id=m.organization_id
        join app.membership_roles mr on mr.organization_id=m.organization_id and mr.membership_id=m.id
        join app.role_permissions rp on rp.organization_id=mr.organization_id and rp.role_id=mr.role_id
        join app.permissions p on p.id=rp.permission_id
        where m.organization_id=${organizationId} and m.user_id=${actor.userId}
          and m.status='ACTIVE' and o.status='ACTIVE' and p.code=${permission}
        limit 1
      `.execute(tx);
        const grant = access.rows[0];
        if (!grant) throw new ForbiddenException("Access denied");
        if (grant.requires_privileged_mfa && actor.assurance !== "MFA")
          throw new ForbiddenException("Additional authentication required");
        return run(tx, grant.membership_id, actor.userId);
      },
    );
  }

  private async audit(
    tx: import("../database/connection.js").DatabaseTransaction,
    org: string,
    actor: string,
    membership: string,
    action: string,
    resourceId?: string,
  ): Promise<void> {
    await sql`insert into app.audit_logs (organization_id,actor_user_id,actor_membership_id,action,resource_type,resource_id,result,correlation_id,metadata)
      values (${org},${actor},${membership},${action},'FOUNDATION',${resourceId ?? null},'SUCCESS',gen_random_uuid(),'{}'::jsonb)`.execute(
      tx,
    );
  }

  async getOrganization(token: string, org: string) {
    return this.withTenant(token, org, "getOrganization", async (tx) => {
      const result =
        await sql`select id,version,created_at,name,slug,status from app.organizations where id=${org}`.execute(
          tx,
        );
      if (!result.rows[0])
        throw new NotFoundException("Organization unavailable");
      return result.rows[0];
    });
  }

  async updateOrganization(token: string, org: string, input: unknown) {
    const body = object(input);
    const base = Number(body.base_version);
    const name = typeof body.name === "string" ? body.name : "";
    if (
      !Number.isInteger(base) ||
      base < 1 ||
      !name.trim() ||
      name.length > 200 ||
      Object.keys(body).some((key) => !["base_version", "name"].includes(key))
    )
      throw new BadRequestException("Invalid request");
    return this.withTenant(
      token,
      org,
      "updateOrganization",
      async (tx, membership, actor) => {
        const updated =
          await sql`update app.organizations set name=${name.trim()},version=version+1,updated_at=now() where id=${org} and version=${base} and status='ACTIVE' returning id,version,created_at,name,slug,status`.execute(
            tx,
          );
        if (!updated.rows[0])
          throw new ConflictException("Organization update unavailable");
        await this.audit(tx, org, actor, membership, "updateOrganization", org);
        return updated.rows[0];
      },
    );
  }

  async listPersonnel(
    token: string,
    org: string,
    cursor?: string,
    limitValue?: string,
  ) {
    const limit = limitValue === undefined ? 50 : Number(limitValue);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200)
      throw new BadRequestException("Invalid request");
    const after = cursor
      ? uuid(Buffer.from(cursor, "base64url").toString())
      : null;
    return this.withTenant(token, org, "listPersonnel", async (tx) => {
      const rows =
        await sql`select id,version,created_at,organization_id,user_id,display_name,status,availability
        from app.memberships where organization_id=${org} and (${after}::uuid is null or id>${after}::uuid)
        order by id limit ${limit + 1}`.execute(tx);
      const page = rows.rows.slice(0, limit) as Array<Record<string, unknown>>;
      const ids = page.map((row) => String(row.id));
      const grants = ids.length
        ? await sql<{
            membership_id: string;
            role_id: string;
          }>`select membership_id,role_id from app.membership_roles where organization_id=${org} and membership_id=any(${ids})`.execute(
            tx,
          )
        : { rows: [] };
      const items = page.map((row) => ({
        ...row,
        role_ids: grants.rows
          .filter((grant) => grant.membership_id === row.id)
          .map((grant) => grant.role_id),
      }));
      const next =
        rows.rows.length > limit
          ? Buffer.from(String(page.at(-1)?.id)).toString("base64url")
          : null;
      return { items, next_cursor: next };
    });
  }

  async updatePersonnel(
    token: string,
    org: string,
    membershipValue: string,
    input: unknown,
  ) {
    const membershipId = uuid(membershipValue);
    const body = object(input);
    const allowed = ["base_version", "display_name", "status", "availability"];
    if (
      Object.keys(body).some((key) => !allowed.includes(key)) ||
      !Number.isInteger(body.base_version) ||
      (body.display_name !== undefined &&
        (typeof body.display_name !== "string" ||
          !body.display_name.trim() ||
          body.display_name.length > 200)) ||
      (body.status !== undefined && body.status !== "INACTIVE") ||
      (body.availability !== undefined &&
        !["AVAILABLE", "UNAVAILABLE"].includes(String(body.availability)))
    )
      throw new BadRequestException("Invalid request");
    return this.withTenant(
      token,
      org,
      "updatePersonnel",
      async (tx, actorMembership, actor) => {
        const target = await sql<{
          user_id: string;
          status: string;
        }>`select user_id,status from app.memberships where id=${membershipId} and organization_id=${org} for update`.execute(
          tx,
        );
        if (!target.rows[0])
          throw new NotFoundException("Membership unavailable");
        if (target.rows[0].user_id === actor)
          throw new ForbiddenException("Self-administration denied");
        if (body.status === "INACTIVE" && target.rows[0].status === "ACTIVE") {
          const admin = await sql<{ value: boolean }>`select exists(
            select 1 from app.membership_roles mr join app.role_permissions rp on rp.organization_id=mr.organization_id and rp.role_id=mr.role_id
            join app.permissions p on p.id=rp.permission_id where mr.organization_id=${org} and mr.membership_id=${membershipId} and p.code='updateOrganization'
          ) as value`.execute(tx);
          if (admin.rows[0]?.value) {
            const active = await sql<{
              count: number;
            }>`select count(distinct m.id)::int as count from app.memberships m
              join app.membership_roles mr on mr.organization_id=m.organization_id and mr.membership_id=m.id
              join app.role_permissions rp on rp.organization_id=mr.organization_id and rp.role_id=mr.role_id
              join app.permissions p on p.id=rp.permission_id where m.organization_id=${org} and m.status='ACTIVE' and p.code='updateOrganization'`.execute(
              tx,
            );
            if ((active.rows[0]?.count ?? 0) <= 1)
              throw new ConflictException(
                "Last active administrator cannot be deactivated",
              );
          }
        }
        const result = await sql`update app.memberships set
        display_name=coalesce(${body.display_name ?? null},display_name),
        status=case when ${body.status ?? null}='INACTIVE' then 'INACTIVE' else status end,
        availability=coalesce(${body.availability ?? null},availability),version=version+1,updated_at=now()
        where id=${membershipId} and organization_id=${org} and version=${Number(body.base_version)} returning id,version,created_at,organization_id,user_id,display_name,status,availability`.execute(
          tx,
        );
        if (!result.rows[0])
          throw new ConflictException("Membership update unavailable");
        await this.audit(
          tx,
          org,
          actor,
          actorMembership,
          "updatePersonnel",
          membershipId,
        );
        const roles = await sql<{
          role_id: string;
        }>`select role_id from app.membership_roles where organization_id=${org} and membership_id=${membershipId}`.execute(
          tx,
        );
        return {
          ...result.rows[0],
          role_ids: roles.rows.map((role) => role.role_id),
        };
      },
    );
  }

  async setMembershipRoles(
    token: string,
    org: string,
    membershipValue: string,
    input: unknown,
  ) {
    const membershipId = uuid(membershipValue);
    const body = object(input);
    if (
      !Number.isInteger(body.base_version) ||
      !Array.isArray(body.role_ids) ||
      body.role_ids.length > 20 ||
      new Set(body.role_ids).size !== body.role_ids.length
    )
      throw new BadRequestException("Invalid request");
    const roleIds = body.role_ids.map(uuid);
    return this.withTenant(
      token,
      org,
      "setMembershipRoles",
      async (tx, actorMembership, actor) => {
        const target = await sql<{
          user_id: string;
          status: string;
          version: number;
        }>`select user_id,status,version from app.memberships where id=${membershipId} and organization_id=${org} for update`.execute(
          tx,
        );
        if (!target.rows[0])
          throw new NotFoundException("Membership unavailable");
        if (
          target.rows[0].user_id === actor ||
          target.rows[0].status !== "ACTIVE" ||
          target.rows[0].version !== body.base_version
        )
          throw new ForbiddenException("Role change unavailable");
        const desired = roleIds.length
          ? await sql<{
              id: string;
              delegable: boolean;
              locked_template: boolean;
            }>`select id,delegable,locked_template from app.roles where organization_id=${org} and id=any(${roleIds})`.execute(
              tx,
            )
          : { rows: [] };
        if (
          desired.rows.length !== roleIds.length ||
          desired.rows.some((role) => !role.delegable)
        )
          throw new ForbiddenException("Role delegation denied");
        const catalog = roleIds.length
          ? await sql<{
              role_id: string;
              code: string;
              requires_privileged_mfa: boolean;
            }>`select rp.role_id,p.code,p.requires_privileged_mfa from app.role_permissions rp join app.permissions p on p.id=rp.permission_id where rp.organization_id=${org} and rp.role_id=any(${roleIds})`.execute(
              tx,
            )
          : { rows: [] };
        if (catalog.rows.some((row) => !delegated.has(row.code)))
          throw new ForbiddenException("Role delegation denied");
        const actorGrant =
          await sql`select 1 from app.membership_roles mr join app.role_permissions rp on rp.organization_id=mr.organization_id and rp.role_id=mr.role_id join app.permissions p on p.id=rp.permission_id where mr.organization_id=${org} and mr.membership_id=${actorMembership} and p.code='setMembershipRoles'`.execute(
            tx,
          );
        if (!actorGrant.rows.length)
          throw new ForbiddenException("Role delegation denied");
        if (catalog.rows.some((row) => row.requires_privileged_mfa)) {
          const self = await this.identity.authenticateAccessToken(token);
          if (self.assurance !== "MFA")
            throw new ForbiddenException("Additional authentication required");
        }
        const oldAdmin =
          await sql`select exists(select 1 from app.membership_roles mr join app.role_permissions rp on rp.organization_id=mr.organization_id and rp.role_id=mr.role_id join app.permissions p on p.id=rp.permission_id where mr.organization_id=${org} and mr.membership_id=${membershipId} and p.code='updateOrganization') as admin`.execute(
            tx,
          );
        if (
          (oldAdmin.rows[0] as { admin: boolean }).admin &&
          !catalog.rows.some((row) => row.code === "updateOrganization")
        ) {
          const count =
            await sql`select count(distinct m.id)::int as n from app.memberships m join app.membership_roles mr on mr.organization_id=m.organization_id and mr.membership_id=m.id join app.role_permissions rp on rp.organization_id=mr.organization_id and rp.role_id=mr.role_id join app.permissions p on p.id=rp.permission_id where m.organization_id=${org} and m.status='ACTIVE' and p.code='updateOrganization'`.execute(
              tx,
            );
          if (Number((count.rows[0] as { n: number }).n) <= 1)
            throw new ConflictException(
              "Last active administrator cannot be removed",
            );
        }
        await sql`delete from app.membership_roles where organization_id=${org} and membership_id=${membershipId}`.execute(
          tx,
        );
        for (const roleId of roleIds)
          await sql`insert into app.membership_roles (organization_id,membership_id,role_id) values (${org},${membershipId},${roleId})`.execute(
            tx,
          );
        const updated = await sql<{
          id: string;
          version: number;
          created_at: Date;
          organization_id: string;
          user_id: string;
          display_name: string;
          status: string;
          availability: string;
        }>`update app.memberships set version=version+1,updated_at=now() where id=${membershipId} and organization_id=${org} returning id,version,created_at,organization_id,user_id,display_name,status,availability`.execute(
          tx,
        );
        await this.audit(
          tx,
          org,
          actor,
          actorMembership,
          "setMembershipRoles",
          membershipId,
        );
        return { ...updated.rows[0], role_ids: roleIds };
      },
    );
  }

  async listRoles(token: string, org: string) {
    return this.withTenant(token, org, "listRoles", async (tx) => {
      const rows = await sql<{
        id: string;
        version: number;
        created_at: Date;
        organization_id: string;
        code: string;
        name: string;
      }>`select id,version,created_at,organization_id,code,name from app.roles where organization_id=${org} order by code`.execute(
        tx,
      );
      const ids = rows.rows.map((row) => row.id);
      const grants = ids.length
        ? await sql<{
            role_id: string;
            permission_id: string;
            resource_scope: string;
          }>`select rp.role_id,rp.permission_id,rp.resource_scope from app.role_permissions rp where rp.organization_id=${org} and rp.role_id=any(${ids})`.execute(
            tx,
          )
        : { rows: [] };
      return {
        items: rows.rows.map((row) => ({
          ...row,
          grants: grants.rows
            .filter((grant) => grant.role_id === row.id)
            .map((grant) => ({
              permission_id: grant.permission_id,
              resource_scope: grant.resource_scope,
            })),
        })),
        next_cursor: null,
      };
    });
  }

  async createRole(token: string, org: string, input: unknown) {
    const body = object(input);
    const code = body.code;
    const name = body.name;
    const grants = body.grants;
    if (
      typeof code !== "string" ||
      !/^[A-Z0-9_-]{1,64}$/.test(code) ||
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 200 ||
      !Array.isArray(grants) ||
      grants.length > 100
    )
      throw new BadRequestException("Invalid request");
    const parsed = grants.map((item) => {
      const grant = object(item);
      return {
        permissionId: uuid(grant.permission_id),
        scope: grant.resource_scope,
      };
    });
    if (
      new Set(parsed.map((x) => x.permissionId)).size !== parsed.length ||
      parsed.some((x) => !["TENANT", "ASSIGNED"].includes(String(x.scope)))
    )
      throw new BadRequestException("Invalid request");
    return this.withTenant(
      token,
      org,
      "createRole",
      async (tx, actorMembership, actor) => {
        if (String(code).startsWith("SYSTEM_"))
          throw new ForbiddenException("Reserved role code");
        const permissionIds = parsed.map((x) => x.permissionId);
        const catalog = permissionIds.length
          ? await sql<{
              id: string;
              code: string;
              valid_scopes: string[];
              requires_privileged_mfa: boolean;
            }>`select id,code,valid_scopes,requires_privileged_mfa from app.permissions where id=any(${permissionIds}) and domain='TENANT'`.execute(
              tx,
            )
          : { rows: [] };
        if (
          catalog.rows.length !== parsed.length ||
          catalog.rows.some((p) => !delegated.has(p.code)) ||
          parsed.some(
            (grant) =>
              !catalog.rows
                .find((p) => p.id === grant.permissionId)
                ?.valid_scopes.includes(String(grant.scope)),
          )
        )
          throw new ForbiddenException("Permission delegation denied");
        const result = await sql<{
          id: string;
          version: number;
          created_at: Date;
          organization_id: string;
          code: string;
          name: string;
        }>`insert into app.roles (organization_id,code,name,delegable,locked_template) values (${org},${code},${name.trim()},true,false) returning id,version,created_at,organization_id,code,name`.execute(
          tx,
        );
        for (const grant of parsed)
          await sql`insert into app.role_permissions (organization_id,role_id,permission_id,resource_scope) values (${org},${result.rows[0]!.id},${grant.permissionId},${grant.scope})`.execute(
            tx,
          );
        await this.audit(
          tx,
          org,
          actor,
          actorMembership,
          "createRole",
          String(result.rows[0]!.id),
        );
        return {
          ...result.rows[0],
          grants: parsed.map((grant) => ({
            permission_id: grant.permissionId,
            resource_scope: grant.scope,
          })),
        };
      },
    );
  }

  async listPermissions(token: string, org: string) {
    return this.withTenant(token, org, "listPermissions", async (tx) => {
      const result =
        await sql`select id,code,description,valid_scopes as allowed_scopes from app.permissions where domain='TENANT' and code=any(${[...delegated]}) order by code`.execute(
          tx,
        );
      return { items: result.rows, next_cursor: null };
    });
  }

  async getSettings(token: string, org: string) {
    return this.withTenant(token, org, "getSettings", async (tx) => {
      const result =
        await sql`select id,version,created_at,organization_id,key as primary_language,value as primary_language_value from app.organization_settings where organization_id=${org} and key='primary_language'`.execute(
          tx,
        );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (!row) throw new NotFoundException("Settings unavailable");
      return {
        id: row.id,
        version: row.version,
        created_at: row.created_at,
        organization_id: row.organization_id,
        primary_language: row.primary_language_value,
      };
    });
  }

  async updateSettings(token: string, org: string, input: unknown) {
    const body = object(input);
    if (
      !Number.isInteger(body.base_version) ||
      !["ms", "en"].includes(String(body.primary_language)) ||
      Object.keys(body).some(
        (key) => !["base_version", "primary_language"].includes(key),
      )
    )
      throw new BadRequestException("Invalid request");
    return this.withTenant(
      token,
      org,
      "updateSettings",
      async (tx, membership, actor) => {
        const updated = await sql<{
          id: string;
          version: number;
          created_at: Date;
          organization_id: string;
          value: string;
        }>`update app.organization_settings set value=${body.primary_language as string},version=version+1,updated_at=now() where organization_id=${org} and key='primary_language' and version=${Number(body.base_version)} returning id,version,created_at,organization_id,value`.execute(
          tx,
        );
        if (!updated.rows[0])
          throw new ConflictException("Settings update unavailable");
        await this.audit(
          tx,
          org,
          actor,
          membership,
          "updateSettings",
          String(updated.rows[0].id),
        );
        const row = updated.rows[0] as Record<string, unknown>;
        return {
          id: row.id,
          version: row.version,
          created_at: row.created_at,
          organization_id: row.organization_id,
          primary_language: row.value,
        };
      },
    );
  }
}
