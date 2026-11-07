import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Migrator } from "kysely/migration";
import { sql } from "kysely";
import {
  connectDatabase,
  tenantTransaction,
} from "../apps/api/src/database/connection.js";
import { migrate } from "../apps/api/src/database/migrate.js";
import * as foundation from "../apps/api/src/database/migrations/001-foundation.js";
import * as permissions from "../apps/api/src/database/migrations/002-permission-catalog.js";

const instancePrefix = process.env.PBSSU_SPRINT2_INSTANCE_PREFIX ?? "sprint2";
if (!/^sprint2(?:f)?$/.test(instancePrefix))
  throw new Error("Invalid Sprint 2 disposable instance prefix");
const stateFile = new URL(
  `../.cache/${instancePrefix}/database.json`,
  import.meta.url,
);

interface State {
  scope: string;
  databaseName: string;
  ownerUrl: string;
}
const state = JSON.parse(readFileSync(stateFile, "utf8")) as State;
if (
  state.scope !== instancePrefix ||
  !state.databaseName.startsWith(`pbssu_m01_${instancePrefix}_`)
)
  throw new Error("Refusing a non-Sprint-2 migration target");

const database = connectDatabase(state.ownerUrl, 1);
try {
  await sql`create schema if not exists migration_meta`.execute(database);
  const baseMigrator = new Migrator({
    db: database,
    migrationTableSchema: "migration_meta",
    provider: {
      getMigrations: async () => ({
        "001-foundation": foundation,
        "002-permission-catalog": permissions,
      }),
    },
  });
  const base = await baseMigrator.migrateToLatest();
  if (base.error) throw new Error("M01 base migrations failed");

  const legacyOrganizationId = randomUUID();
  const actorId = randomUUID();
  await tenantTransaction(
    database,
    legacyOrganizationId,
    actorId,
    async (transaction) => {
      await sql`
        insert into app.organizations (id,slug,name,status)
        values (${legacyOrganizationId},${`sprint2-migration-${legacyOrganizationId.slice(0, 8)}`},'Synthetic migration fixture','ACTIVE')
      `.execute(transaction);
      for (const [code, name] of [
        ["ORGANIZATION_ADMIN", "Synthetic organization administrator"],
        ["CONTROL_ROOM_OPERATOR", "Synthetic control room operator"],
        ["INCIDENT_COMMANDER", "Synthetic incident commander"],
      ]) {
        await sql`
          insert into app.roles (organization_id,code,name)
          values (${legacyOrganizationId},${code},${name})
        `.execute(transaction);
      }
    },
  );

  await migrate(database);
  const result = await sql<{
    tables: string;
    permissions: string;
    migration_names: string[];
    vehicle_rls: boolean;
    vehicle_force_rls: boolean;
  }>`
    select
      (select count(*)::text from information_schema.tables where table_schema='app' and table_type='BASE TABLE') as tables,
      (select count(*)::text from app.permissions) as permissions,
      (select array_agg(name order by name) from migration_meta.kysely_migration) as migration_names,
      (select relrowsecurity from pg_class where oid='app.vehicles'::regclass) as vehicle_rls,
      (select relforcerowsecurity from pg_class where oid='app.vehicles'::regclass) as vehicle_force_rls
  `.execute(database);
  const verified = result.rows[0];
  if (
    verified?.tables !== "23" ||
    verified.permissions !== "43" ||
    JSON.stringify(verified.migration_names) !==
      JSON.stringify([
        "001-foundation",
        "002-permission-catalog",
        "003-vehicles",
      ]) ||
    !verified.vehicle_rls ||
    !verified.vehicle_force_rls
  )
    throw new Error("Sprint 2 migration/schema verification failed");
  const roleGrants = await tenantTransaction(
    database,
    legacyOrganizationId,
    actorId,
    (transaction) =>
      sql<{ role_code: string; permission_code: string }>`
        select r.code as role_code,p.code as permission_code
        from app.roles r join app.role_permissions rp
          on rp.organization_id=r.organization_id and rp.role_id=r.id
        join app.permissions p on p.id=rp.permission_id
        where r.organization_id=${legacyOrganizationId}
        order by r.code,p.code
      `.execute(transaction),
  );
  if (
    JSON.stringify(roleGrants.rows) !==
    JSON.stringify([
      { role_code: "CONTROL_ROOM_OPERATOR", permission_code: "listVehicles" },
      { role_code: "INCIDENT_COMMANDER", permission_code: "listVehicles" },
      { role_code: "ORGANIZATION_ADMIN", permission_code: "createVehicle" },
      { role_code: "ORGANIZATION_ADMIN", permission_code: "listVehicles" },
      { role_code: "ORGANIZATION_ADMIN", permission_code: "updateVehicle" },
    ])
  )
    throw new Error(
      "Existing role template grants were not backfilled exactly",
    );
  process.stdout.write(
    "Sprint 2 migration chain passed: 23 tables, 43 exact catalog keys, migration 003, vehicles RLS/FORCE RLS, and exact backfill of G-10/G-16 template grants.\n",
  );
} catch (error) {
  const cause = error instanceof Error ? error.cause : undefined;
  const detail =
    cause instanceof Error
      ? cause.message
      : error instanceof Error
        ? error.message
        : "unknown error";
  process.stderr.write(
    `Sprint 2 migration or schema verification failed: ${detail}\n`,
  );
  process.exitCode = 1;
} finally {
  await database.destroy();
}
