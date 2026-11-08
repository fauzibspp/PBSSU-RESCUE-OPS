import { sql } from "kysely";
import type { Database } from "../connection.js";

const permissionRows = [
  ["listIncidents", "{TENANT,ASSIGNED}", false],
  ["getIncident", "{TENANT,ASSIGNED}", false],
  ["createIncident", "{TENANT}", true],
  ["updateIncident", "{TENANT}", true],
  ["transitionIncident", "{TENANT}", true],
] as const;

export async function up(database: Database): Promise<void> {
  for (const [code, scopes, mfa] of permissionRows) {
    await sql`
      insert into app.permissions
        (code,domain,description,valid_scopes,requires_privileged_mfa)
      values (
        ${code},'TENANT',${`Approved incident operation ${code}`},
        ${scopes === "{TENANT}" ? ["TENANT"] : ["TENANT", "ASSIGNED"]},${mfa}
      ) on conflict (code) do nothing
    `.execute(database);
    const found = await sql<{
      domain: string;
      valid_scopes: string[];
      requires_privileged_mfa: boolean;
    }>`select domain,valid_scopes,requires_privileged_mfa from app.permissions where code=${code}`.execute(
      database,
    );
    const row = found.rows[0];
    const expected =
      scopes === "{TENANT}" ? ["TENANT"] : ["TENANT", "ASSIGNED"];
    if (
      !row ||
      row.domain !== "TENANT" ||
      row.requires_privileged_mfa !== mfa ||
      expected.some((scope) => !row.valid_scopes.includes(scope)) ||
      expected.length !== row.valid_scopes.length
    ) {
      throw new Error(`Existing incident permission ${code} is incompatible`);
    }
  }

  await sql
    .raw(
      `create policy sprint3_permission_backfill on app.roles for select to pbssu_m01_owner using (true)`,
    )
    .execute(database);
  const grants = await sql<{
    organization_id: string;
    role_id: string;
    role_code: string;
    permission_id: string;
    permission_code: string;
    resource_scope: "TENANT" | "ASSIGNED";
  }>`
    select r.organization_id,r.id role_id,r.code role_code,p.id permission_id,p.code permission_code,
      case when r.code='FIELD_RESPONDER' then 'ASSIGNED' else 'TENANT' end resource_scope
    from app.roles r cross join app.permissions p
    where
      (p.code in ('listIncidents','getIncident') and r.code in ('ORGANIZATION_ADMIN','CONTROL_ROOM_OPERATOR','INCIDENT_COMMANDER','FIELD_RESPONDER','READ_ONLY_AUDITOR'))
      or (p.code in ('createIncident','updateIncident') and r.code in ('CONTROL_ROOM_OPERATOR','INCIDENT_COMMANDER'))
      or (p.code='transitionIncident' and r.code in ('CONTROL_ROOM_OPERATOR','INCIDENT_COMMANDER'))
    order by r.organization_id,r.id,p.code
  `.execute(database);

  for (const grant of grants.rows) {
    const valid = await sql<{ allowed: boolean }>`
      select ${grant.resource_scope} = any(valid_scopes) as allowed
      from app.permissions where id=${grant.permission_id}
    `.execute(database);
    if (!valid.rows[0]?.allowed) {
      throw new Error(
        `Scope incompatible for incident permission ${grant.permission_code}`,
      );
    }
    await sql`select set_config('app.organization_id',${grant.organization_id},true)`.execute(
      database,
    );
    const existing = await sql<{ resource_scope: string }>`
      select resource_scope from app.role_permissions
      where organization_id=${grant.organization_id} and role_id=${grant.role_id} and permission_id=${grant.permission_id}
    `.execute(database);
    if (
      existing.rows[0] &&
      existing.rows[0].resource_scope !== grant.resource_scope
    ) {
      throw new Error(
        `Existing ${grant.permission_code} grant has an incompatible scope`,
      );
    }
    await sql`
      insert into app.role_permissions (organization_id,role_id,permission_id,resource_scope)
      values (${grant.organization_id},${grant.role_id},${grant.permission_id},${grant.resource_scope})
      on conflict (organization_id,role_id,permission_id) do nothing
    `.execute(database);
  }
  await sql
    .raw(`drop policy sprint3_permission_backfill on app.roles`)
    .execute(database);
}

export async function down(_database: Database): Promise<void> {
  throw new Error("Incident permission catalog migration is forward-only");
}
