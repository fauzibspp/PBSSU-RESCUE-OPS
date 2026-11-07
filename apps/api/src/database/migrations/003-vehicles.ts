import { sql } from "kysely";
import type { Database } from "../connection.js";

export async function up(database: Database): Promise<void> {
  await sql
    .raw(
      `
    create table app.vehicles (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version integer not null default 1 check (version > 0),
      organization_id uuid not null references app.organizations(id),
      call_sign text not null check (length(btrim(call_sign)) between 1 and 64),
      kind text not null check (length(btrim(kind)) between 1 and 64),
      service_state text not null default 'AVAILABLE'
        check (service_state in ('AVAILABLE','MAINTENANCE','RETIRED')),
      unique (organization_id,id),
      unique (organization_id,call_sign)
    );
    create index vehicles_tenant_state_id_idx
      on app.vehicles (organization_id,service_state,id);
    alter table app.vehicles enable row level security;
    alter table app.vehicles force row level security;
    create policy tenant_scope on app.vehicles
      using (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid)
      with check (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
    grant select,insert,update on app.vehicles to pbssu_m01_runtime;
  `,
    )
    .execute(database);

  for (const [code, description] of [
    ["listVehicles", "List permitted tenant vehicle projections"],
    ["createVehicle", "Register a tenant vehicle"],
    ["updateVehicle", "Update a tenant vehicle service state"],
  ]) {
    await sql`
      insert into app.permissions
        (code,domain,description,valid_scopes,requires_privileged_mfa)
      values (${code},'TENANT',${description},${["TENANT"]},true)
      on conflict (code) do nothing
    `.execute(database);
  }
  await sql
    .raw(
      `create policy sprint2_role_backfill on app.roles for select to pbssu_m01_owner using (true)`,
    )
    .execute(database);
  const grants = await sql<{
    organization_id: string;
    role_id: string;
    permission_id: string;
  }>`
    select r.organization_id,r.id as role_id,p.id as permission_id
    from app.roles r
    join app.permissions p on
      (r.code='ORGANIZATION_ADMIN' and p.code in ('listVehicles','createVehicle','updateVehicle'))
      or (r.code in ('CONTROL_ROOM_OPERATOR','INCIDENT_COMMANDER') and p.code='listVehicles')
  `.execute(database);
  for (const grant of grants.rows) {
    await sql`select set_config('app.organization_id',${grant.organization_id},true)`.execute(
      database,
    );
    await sql`
      insert into app.role_permissions
        (organization_id,role_id,permission_id,resource_scope)
      values (${grant.organization_id},${grant.role_id},${grant.permission_id},'TENANT')
      on conflict (organization_id,role_id,permission_id) do nothing
    `.execute(database);
  }
  await sql
    .raw(`drop policy sprint2_role_backfill on app.roles`)
    .execute(database);
}

export async function down(database: Database): Promise<void> {
  await sql`drop table app.vehicles`.execute(database);
  await sql`delete from app.permissions where code = any(${[
    "listVehicles",
    "createVehicle",
    "updateVehicle",
  ]})`.execute(database);
}
