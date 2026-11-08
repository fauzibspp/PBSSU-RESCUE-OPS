import { sql } from "kysely";
import type { Database } from "../connection.js";

export async function up(database: Database): Promise<void> {
  await sql
    .raw(
      `
    create table app.incident_personnel (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      organization_id uuid not null references app.organizations(id),
      incident_id uuid not null,
      membership_id uuid not null,
      user_id uuid not null references app.users(id),
      duty text check (duty is null or length(duty) between 1 and 100),
      assigned_at timestamptz not null default now(),
      released_at timestamptz,
      unique (organization_id,id),
      unique (organization_id,incident_id,id),
      foreign key (organization_id,incident_id)
        references app.incidents (organization_id,id),
      foreign key (organization_id,membership_id)
        references app.memberships (organization_id,id),
      foreign key (organization_id,user_id,membership_id)
        references app.memberships (organization_id,user_id,id),
      check (released_at is null or released_at >= assigned_at)
    );
    create unique index incident_personnel_one_active_user_idx
      on app.incident_personnel (user_id) where released_at is null;
    create index incident_personnel_tenant_incident_idx
      on app.incident_personnel (organization_id,incident_id,assigned_at,id);

    create function app.release_assignment_interval_once() returns trigger
      language plpgsql
      set search_path = pg_catalog
      as $$ begin
        if old.released_at is not null
          or new.released_at is null
          or (to_jsonb(new) - 'released_at') is distinct from (to_jsonb(old) - 'released_at') then
          raise exception 'Assignment history is immutable';
        end if;
        return new;
      end $$;
    revoke all on function app.release_assignment_interval_once() from public;
    create trigger incident_personnel_release_once
      before update on app.incident_personnel
      for each row execute function app.release_assignment_interval_once();

    create table app.incident_vehicles (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      organization_id uuid not null references app.organizations(id),
      incident_id uuid not null,
      vehicle_id uuid not null,
      assigned_at timestamptz not null default now(),
      released_at timestamptz,
      unique (organization_id,id),
      unique (organization_id,incident_id,id),
      foreign key (organization_id,incident_id)
        references app.incidents (organization_id,id),
      foreign key (organization_id,vehicle_id)
        references app.vehicles (organization_id,id),
      check (released_at is null or released_at >= assigned_at)
    );
    create unique index incident_vehicles_one_active_vehicle_idx
      on app.incident_vehicles (vehicle_id) where released_at is null;
    create index incident_vehicles_tenant_incident_idx
      on app.incident_vehicles (organization_id,incident_id,assigned_at,id);
    create trigger incident_vehicles_release_once
      before update on app.incident_vehicles
      for each row execute function app.release_assignment_interval_once();

    create table app.movement_logs (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      version integer not null default 1 check (version = 1),
      organization_id uuid not null references app.organizations(id),
      incident_id uuid not null,
      incident_vehicle_id uuid not null,
      location_id uuid,
      kind text not null check (kind in ('DEPARTURE','ARRIVAL','RETURN','OTHER')),
      occurred_at timestamptz not null,
      received_at timestamptz not null default now(),
      actor_membership_id uuid not null,
      supersedes_id uuid,
      note text check (note is null or length(note) between 1 and 1000),
      unique (organization_id,id),
      unique (organization_id,incident_id,id),
      foreign key (organization_id,incident_id)
        references app.incidents (organization_id,id),
      foreign key (organization_id,incident_id,incident_vehicle_id)
        references app.incident_vehicles (organization_id,incident_id,id),
      foreign key (organization_id,incident_id,location_id)
        references app.incident_locations (organization_id,incident_id,id),
      foreign key (organization_id,actor_membership_id)
        references app.memberships (organization_id,id),
      foreign key (organization_id,incident_id,supersedes_id)
        references app.movement_logs (organization_id,incident_id,id)
    );
    create index movement_logs_tenant_incident_order_idx
      on app.movement_logs (organization_id,incident_id,occurred_at,received_at,id);
    create index movement_logs_supersedes_idx
      on app.movement_logs (organization_id,incident_id,supersedes_id)
      where supersedes_id is not null;

    alter table app.incident_personnel enable row level security;
    alter table app.incident_personnel force row level security;
    create policy tenant_scope on app.incident_personnel
      using (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid)
      with check (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);

    alter table app.incident_vehicles enable row level security;
    alter table app.incident_vehicles force row level security;
    create policy tenant_scope on app.incident_vehicles
      using (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid)
      with check (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);

    alter table app.movement_logs enable row level security;
    alter table app.movement_logs force row level security;
    create policy tenant_scope on app.movement_logs
      using (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid)
      with check (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);

    create function app.reject_movement_change() returns trigger
      language plpgsql as $$ begin raise exception 'Immutable movement record'; end $$;
    create trigger movement_logs_immutable
      before update or delete on app.movement_logs
      for each row execute function app.reject_movement_change();

    revoke all on app.incident_personnel,app.incident_vehicles,app.movement_logs
      from public,pbssu_m01_runtime,pbssu_m01_identity;
    grant select,insert on app.incident_personnel,app.incident_vehicles
      to pbssu_m01_runtime;
    grant update (released_at) on app.incident_personnel,app.incident_vehicles
      to pbssu_m01_runtime;
    grant select,insert on app.movement_logs to pbssu_m01_runtime;
  `,
    )
    .execute(database);
}

export async function down(_database: Database): Promise<void> {
  throw new Error(
    "Sprint 4 assignment and movement migration is forward-only; use an approved recovery plan",
  );
}
