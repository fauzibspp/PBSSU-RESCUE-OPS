import { readFileSync } from "node:fs";
import { sql } from "kysely";
import { connectDatabase } from "../apps/api/src/database/connection.js";
import { migrate } from "../apps/api/src/database/migrate.js";

interface State {
  scope: string;
  databaseName: string;
  image: string;
  ownerUrl: string;
  runtimeUrl: string;
}

const state = JSON.parse(
  readFileSync(
    process.env.PBSSU_TEST_DATABASE_STATE ??
      new URL("../.cache/sprint4a/database.json", import.meta.url),
    "utf8",
  ),
) as State;
if (
  state.scope !== "sprint4a" ||
  !/^pbssu_m01_sprint4a_[a-f0-9]{12}$/.test(state.databaseName) ||
  state.image !==
    "postgis/postgis:18-3.7@sha256:440bdd14e3edccfce04d080d8a1a0cbae5763fa16a1c4172bff83530828461de"
)
  throw new Error("Refusing a database outside the unique Sprint 4-A scope");

const owner = connectDatabase(state.ownerUrl, 1);
const runtime = connectDatabase(state.runtimeUrl, 1);
const expectedMigrations = [
  "001-foundation",
  "002-permission-catalog",
  "003-vehicles",
  "004-incidents",
  "005-incident-permissions",
  "006-protected-cancellation-audit",
  "007-location-permissions",
  "008-sprint4-permissions",
  "009-sprint4-assignment-movement",
];
const sprint4Tables = [
  "incident_personnel",
  "incident_vehicles",
  "movement_logs",
];

try {
  await migrate(owner);
  await migrate(owner);
  const inventory = await sql<{
    table_count: string;
    permission_count: string;
    migrations: string[];
    server: string;
    postgis: string;
    rls: string[];
    force_rls: string[];
  }>`
    select
      (select count(*)::text from information_schema.tables where table_schema='app' and table_type='BASE TABLE') as table_count,
      (select count(*)::text from app.permissions) as permission_count,
      (select array_agg(name order by name) from migration_meta.kysely_migration) as migrations,
      current_setting('server_version') as server,
      postgis_lib_version() as postgis,
      (select array_agg(c.relname::text order by c.relname::text) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app' and c.relname=any(${sprint4Tables}) and c.relrowsecurity) as rls,
      (select array_agg(c.relname::text order by c.relname::text) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app' and c.relname=any(${sprint4Tables}) and c.relforcerowsecurity) as force_rls
  `.execute(owner);
  const row = inventory.rows[0];
  if (
    row?.table_count !== "29" ||
    row.permission_count !== "54" ||
    JSON.stringify(row.migrations) !== JSON.stringify(expectedMigrations) ||
    JSON.stringify(row.rls) !== JSON.stringify(sprint4Tables) ||
    JSON.stringify(row.force_rls) !== JSON.stringify(sprint4Tables) ||
    !row.server.startsWith("18.") ||
    !row.postgis.startsWith("3.7.")
  )
    throw new Error(
      `Fresh/repeat migration inventory mismatch: ${JSON.stringify(row)}`,
    );

  const policy = await sql<{ count: string }>`
    select count(*)::text as count from pg_policies
    where schemaname='app' and tablename=any(${sprint4Tables})
      and qual like '%app.organization_id%' and with_check like '%app.organization_id%'
  `.execute(owner);
  if (policy.rows[0]?.count !== "3")
    throw new Error("Tenant USING/WITH CHECK policy inventory mismatch");

  const permissions = await sql<{
    code: string;
    valid_scopes: string[];
    requires_privileged_mfa: boolean;
  }>`select code,valid_scopes,requires_privileged_mfa from app.permissions
     where code=any(${["getAssignments", "setAssignments", "listMovements", "createMovement"]})
     order by code`.execute(owner);
  if (
    permissions.rows.length !== 4 ||
    permissions.rows.some((permission) => permission.valid_scopes.length === 0)
  )
    throw new Error("Sprint 4 permission catalog inventory mismatch");

  const runtimePrivileges = await sql<{
    actor: string;
    personnel_update: boolean;
    personnel_release_update: boolean;
    personnel_delete: boolean;
    vehicles_update: boolean;
    vehicle_release_update: boolean;
    vehicles_delete: boolean;
    movements_update: boolean;
    movements_delete: boolean;
  }>`
    select current_user as actor,
      has_table_privilege(current_user,'app.incident_personnel','update') as personnel_update,
      has_column_privilege(current_user,'app.incident_personnel','released_at','update') as personnel_release_update,
      has_table_privilege(current_user,'app.incident_personnel','delete') as personnel_delete,
      has_table_privilege(current_user,'app.incident_vehicles','update') as vehicles_update,
      has_column_privilege(current_user,'app.incident_vehicles','released_at','update') as vehicle_release_update,
      has_table_privilege(current_user,'app.incident_vehicles','delete') as vehicles_delete,
      has_table_privilege(current_user,'app.movement_logs','update') as movements_update,
      has_table_privilege(current_user,'app.movement_logs','delete') as movements_delete
  `.execute(runtime);
  const grants = runtimePrivileges.rows[0];
  if (
    grants?.actor !== "pbssu_m01_runtime" ||
    grants.personnel_update ||
    !grants.personnel_release_update ||
    grants.personnel_delete ||
    grants.vehicles_update ||
    !grants.vehicle_release_update ||
    grants.vehicles_delete ||
    grants.movements_update ||
    grants.movements_delete
  )
    throw new Error("Restricted runtime privilege verification failed");

  process.stdout.write(
    `Sprint 4-A migrations PASS: fresh and repeat-up; 29 tables; 54 permissions; migrations 001-009; PostgreSQL ${row.server}, PostGIS ${row.postgis}; RLS/FORCE RLS and tenant policies on all three new tables; movement update/delete denied to runtime.\n`,
  );
} catch (error) {
  const cause = error instanceof Error ? error.cause : undefined;
  const message =
    cause instanceof Error
      ? cause.message
      : error instanceof Error
        ? error.message
        : "unknown error";
  process.stderr.write(`Sprint 4-A migration validation failed: ${message}\n`);
  process.exitCode = 1;
} finally {
  await runtime.destroy();
  await owner.destroy();
}
