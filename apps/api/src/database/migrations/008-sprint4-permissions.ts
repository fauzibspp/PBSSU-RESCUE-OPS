import { sql } from "kysely";
import type { Database } from "../connection.js";

const permissionRows = [
  ["getAssignments", ["TENANT", "ASSIGNED"], false],
  ["setAssignments", ["TENANT"], true],
  ["listMovements", ["TENANT", "ASSIGNED"], false],
  ["createMovement", ["TENANT", "ASSIGNED"], false],
] as const;

const expectedRoles: Record<string, Record<string, "TENANT" | "ASSIGNED">> = {
  getAssignments: {
    ORGANIZATION_ADMIN: "TENANT",
    CONTROL_ROOM_OPERATOR: "TENANT",
    INCIDENT_COMMANDER: "TENANT",
    READ_ONLY_AUDITOR: "TENANT",
    FIELD_RESPONDER: "ASSIGNED",
  },
  setAssignments: {
    CONTROL_ROOM_OPERATOR: "TENANT",
    INCIDENT_COMMANDER: "TENANT",
  },
  listMovements: {
    ORGANIZATION_ADMIN: "TENANT",
    CONTROL_ROOM_OPERATOR: "TENANT",
    INCIDENT_COMMANDER: "TENANT",
    READ_ONLY_AUDITOR: "TENANT",
    FIELD_RESPONDER: "ASSIGNED",
  },
  createMovement: {
    CONTROL_ROOM_OPERATOR: "TENANT",
    INCIDENT_COMMANDER: "TENANT",
    FIELD_RESPONDER: "ASSIGNED",
  },
};

export async function up(database: Database): Promise<void> {
  for (const [code, scopes, requiresMfa] of permissionRows) {
    await sql`
      insert into app.permissions
        (code,domain,description,valid_scopes,requires_privileged_mfa)
      values (
        ${code},'TENANT',${`Approved Sprint 4 operation ${code}`},
        ${scopes},${requiresMfa}
      ) on conflict (code) do nothing
    `.execute(database);

    const found = await sql<{
      domain: string;
      valid_scopes: string[];
      requires_privileged_mfa: boolean;
    }>`select domain,valid_scopes,requires_privileged_mfa
       from app.permissions where code=${code}`.execute(database);
    const row = found.rows[0];
    if (
      !row ||
      row.domain !== "TENANT" ||
      row.requires_privileged_mfa !== requiresMfa ||
      row.valid_scopes.length !== scopes.length ||
      scopes.some((scope) => !row.valid_scopes.includes(scope))
    ) {
      throw new Error(`Existing Sprint 4 permission ${code} is incompatible`);
    }
  }

  await sql
    .raw(
      "create policy sprint4_permission_backfill on app.roles for select to pbssu_m01_owner using (true)",
    )
    .execute(database);

  const roles = await sql<{
    organization_id: string;
    role_id: string;
    role_code: string;
  }>`select organization_id,id as role_id,code as role_code
     from app.roles order by organization_id,id`.execute(database);

  for (const role of roles.rows) {
    await sql`select set_config('app.organization_id',${role.organization_id},true)`.execute(
      database,
    );
    for (const [permissionCode, grants] of Object.entries(expectedRoles)) {
      const scope = grants[role.role_code];
      if (!scope) continue;

      const permission = await sql<{
        id: string;
        valid_scopes: string[];
      }>`select id,valid_scopes from app.permissions where code=${permissionCode}`.execute(
        database,
      );
      const row = permission.rows[0];
      if (!row || !row.valid_scopes.includes(scope)) {
        throw new Error(`Invalid Sprint 4 scope for ${permissionCode}`);
      }

      const existing = await sql<{ resource_scope: string }>`
        select resource_scope from app.role_permissions
        where organization_id=${role.organization_id}
          and role_id=${role.role_id} and permission_id=${row.id}
      `.execute(database);
      if (existing.rows[0] && existing.rows[0].resource_scope !== scope) {
        throw new Error(`Existing ${permissionCode} grant is incompatible`);
      }
      await sql`
        insert into app.role_permissions
          (organization_id,role_id,permission_id,resource_scope)
        values (${role.organization_id},${role.role_id},${row.id},${scope})
        on conflict (organization_id,role_id,permission_id) do nothing
      `.execute(database);
    }
  }

  for (const role of roles.rows) {
    await sql`select set_config('app.organization_id',${role.organization_id},true)`.execute(
      database,
    );
    const actual = await sql<{
      role_code: string;
      permission_code: string;
      resource_scope: string;
    }>`select r.code as role_code,p.code as permission_code,rp.resource_scope
       from app.role_permissions rp
       join app.roles r on r.organization_id=rp.organization_id and r.id=rp.role_id
       join app.permissions p on p.id=rp.permission_id
       where rp.organization_id=${role.organization_id}
         and rp.role_id=${role.role_id}
         and p.code=any(${Object.keys(expectedRoles)})`.execute(database);
    for (const grant of actual.rows) {
      if (
        expectedRoles[grant.permission_code]?.[grant.role_code] !==
        grant.resource_scope
      ) {
        throw new Error(
          `Unexpected Sprint 4 grant for ${grant.permission_code}`,
        );
      }
    }
  }

  await sql
    .raw("drop policy sprint4_permission_backfill on app.roles")
    .execute(database);
}

export async function down(_database: Database): Promise<void> {
  throw new Error("Sprint 4 permission catalog migration is forward-only");
}
