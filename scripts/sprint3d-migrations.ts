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
    new URL("../.cache/sprint3d/database.json", import.meta.url),
    "utf8",
  ),
) as State;
if (
  state.scope !== "sprint3d" ||
  !/^pbssu_m01_sprint3d_[a-f0-9]{12}$/.test(state.databaseName) ||
  state.image !==
    "postgis/postgis:18-3.7@sha256:440bdd14e3edccfce04d080d8a1a0cbae5763fa16a1c4172bff83530828461de"
)
  throw new Error("Refusing a database outside the unique Sprint 3-D scope");

const owner = connectDatabase(state.ownerUrl, 1);
const runtime = connectDatabase(state.runtimeUrl, 1);

try {
  await migrate(owner);
  await migrate(owner);
  const result = await sql<{
    table_count: string;
    permission_count: string;
    migrations: string[];
    postgis: string;
    server: string;
    rls_count: string;
    forced_rls_count: string;
  }>`
    select
      (select count(*)::text from information_schema.tables
        where table_schema='app' and table_type='BASE TABLE') as table_count,
      (select count(*)::text from app.permissions) as permission_count,
      (select array_agg(name order by name) from migration_meta.kysely_migration) as migrations,
      (select postgis_lib_version()) as postgis,
      (select current_setting('server_version')) as server,
      (select count(*)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='app' and c.relname in ('incidents','incident_locations','change_events')
          and c.relrowsecurity) as rls_count,
      (select count(*)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='app' and c.relname in ('incidents','incident_locations','change_events')
          and c.relforcerowsecurity) as forced_rls_count
  `.execute(owner);
  const verified = result.rows[0];
  if (
    verified?.table_count !== "26" ||
    verified.permission_count !== "50" ||
    !verified.server.startsWith("18.") ||
    (verified.postgis !== "3.7.0" && !verified.postgis.startsWith("3.7.")) ||
    JSON.stringify(verified.migrations) !==
      JSON.stringify([
        "001-foundation",
        "002-permission-catalog",
        "003-vehicles",
        "004-incidents",
        "005-incident-permissions",
        "006-protected-cancellation-audit",
        "007-location-permissions",
      ]) ||
    verified.rls_count !== "3" ||
    verified.forced_rls_count !== "3"
  )
    throw new Error(
      "Sprint 3-D migration inventory or security verification failed",
    );

  const role = await sql<{
    actor: string;
    incidents_update: boolean;
    locations_delete: boolean;
    events_update: boolean;
    events_delete: boolean;
  }>`
    select current_user as actor,
      has_table_privilege(current_user,'app.incidents','update') as incidents_update,
      has_table_privilege(current_user,'app.incident_locations','delete') as locations_delete,
      has_table_privilege(current_user,'app.change_events','update') as events_update,
      has_table_privilege(current_user,'app.change_events','delete') as events_delete
  `.execute(runtime);
  if (
    role.rows[0]?.actor !== "pbssu_m01_runtime" ||
    role.rows[0].incidents_update !== true ||
    role.rows[0].locations_delete !== false ||
    role.rows[0].events_update !== false ||
    role.rows[0].events_delete !== false
  )
    throw new Error("Restricted runtime grants are not as approved");

  const policies = await sql<{
    table_name: string;
    using_expression: string | null;
    check_expression: string | null;
  }>`
    select tablename as table_name,qual as using_expression,with_check as check_expression
    from pg_policies
    where schemaname='app'
      and tablename in ('incidents','incident_locations','change_events')
    order by tablename
  `.execute(owner);
  if (
    policies.rows.length !== 3 ||
    policies.rows.some(
      (policy) =>
        !policy.using_expression?.includes("app.organization_id") ||
        !policy.check_expression?.includes("app.organization_id"),
    )
  )
    throw new Error(
      "Tenant RLS policies do not constrain USING and WITH CHECK",
    );

  process.stdout.write(
    `Sprint 3-D fresh migration chain passed: 26 app tables, 50 permission catalog keys, migrations 001-007 in order, PostgreSQL ${verified.server}, PostGIS ${verified.postgis}, RLS/FORCE RLS and tenant USING/WITH CHECK policies on all three incident tables, runtime event update/delete denied.\n`,
  );
} catch (error) {
  const cause = error instanceof Error ? error.cause : undefined;
  const message =
    cause instanceof Error
      ? cause.message
      : error instanceof Error
        ? error.message
        : "unknown error";
  const databaseError = cause as
    | { code?: string; detail?: string; position?: string; routine?: string }
    | undefined;
  process.stderr.write(
    `Sprint 3-D migration validation failed: ${message}${databaseError?.code ? ` [${databaseError.code}${databaseError.position ? ` at ${databaseError.position}` : ""}]` : ""}\n`,
  );
  process.exitCode = 1;
} finally {
  await runtime.destroy();
  await owner.destroy();
}
