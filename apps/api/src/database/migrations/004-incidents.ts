import { sql } from "kysely";
import type { Database } from "../connection.js";

export async function up(database: Database): Promise<void> {
  await sql
    .raw(
      `
    create extension if not exists postgis;

    create table app.incidents (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references app.organizations(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version integer not null default 1 check (version > 0),
      title text not null check (length(btrim(title)) between 1 and 200),
      category text not null
        check (category in ('FLOOD_MONITORING','FIRE','RESCUE','OTHER')),
      status text not null default 'DRAFT'
        check (status in (
          'DRAFT','OPEN','DISPATCHED','ON_SCENE','MONITORING',
          'RETURNING','COMPLETED','CLOSED','CANCELLED'
        )),
      occurred_at timestamptz not null,
      source_kind text not null check (length(btrim(source_kind)) between 1 and 80),
      source_detail_ciphertext text,
      outcome text check (outcome is null or length(outcome) <= 2000),
      closed_at timestamptz,
      unique (organization_id,id),
      check (
        status <> 'COMPLETED' or
        (outcome is not null and length(btrim(outcome)) > 0)
      )
    );

    create index incidents_tenant_status_occurred_id_idx
      on app.incidents (organization_id,status,occurred_at desc,id);

    create table app.incident_locations (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references app.organizations(id),
      created_at timestamptz not null default now(),
      incident_id uuid not null,
      label text not null check (length(btrim(label)) between 1 and 200),
      point geography(Point,4326),
      accuracy_m numeric check (accuracy_m is null or accuracy_m >= 0),
      description text check (description is null or length(description) <= 1000),
      unique (organization_id,id),
      unique (organization_id,incident_id,id),
      foreign key (organization_id,incident_id)
        references app.incidents (organization_id,id),
      check ((point is null) = (accuracy_m is null))
    );

    create index incident_locations_point_gist_idx
      on app.incident_locations using gist (point);

    create table app.change_events (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references app.organizations(id),
      created_at timestamptz not null default now(),
      change_seq bigint generated always as identity,
      incident_id uuid not null,
      location_id uuid,
      entity_type text not null check (entity_type in ('INCIDENT','INCIDENT_LOCATION')),
      entity_id uuid not null,
      event_kind text not null
        check (event_kind in ('CREATED','UPDATED','TRANSITIONED','LOCATION_CREATED')),
      entity_version integer not null check (entity_version > 0),
      tombstone boolean not null default false check (tombstone = false),
      visibility_scope jsonb not null
        check (jsonb_typeof(visibility_scope) = 'object'),
      occurred_at timestamptz not null default now(),
      unique (organization_id,id),
      unique (organization_id,change_seq),
      foreign key (organization_id,incident_id)
        references app.incidents (organization_id,id),
      foreign key (organization_id,incident_id,location_id)
        references app.incident_locations (organization_id,incident_id,id),
      check (
        (entity_type = 'INCIDENT' and location_id is null
          and entity_id = incident_id
          and event_kind in ('CREATED','UPDATED','TRANSITIONED'))
        or
        (entity_type = 'INCIDENT_LOCATION' and location_id is not null
          and entity_id = location_id and event_kind = 'LOCATION_CREATED')
      )
    );

    alter table app.incidents enable row level security;
    alter table app.incidents force row level security;
    create policy tenant_scope on app.incidents
      using (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid)
      with check (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);

    alter table app.incident_locations enable row level security;
    alter table app.incident_locations force row level security;
    create policy tenant_scope on app.incident_locations
      using (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid)
      with check (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);

    alter table app.change_events enable row level security;
    alter table app.change_events force row level security;
    create policy tenant_scope on app.change_events
      using (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid)
      with check (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);

    revoke all on app.incidents,app.incident_locations,app.change_events from public;
    grant select,insert,update on app.incidents to pbssu_m01_runtime;
    grant select,insert on app.incident_locations to pbssu_m01_runtime;
    grant select,insert on app.change_events to pbssu_m01_runtime;
    revoke update,delete,truncate on app.change_events from pbssu_m01_runtime;
    grant usage,select on sequence app.change_events_change_seq_seq to pbssu_m01_runtime;
  `,
    )
    .execute(database);
}

export async function down(_database: Database): Promise<void> {
  throw new Error(
    "Sprint 3-A incident migration is forward-only; use an approved recovery plan",
  );
}
