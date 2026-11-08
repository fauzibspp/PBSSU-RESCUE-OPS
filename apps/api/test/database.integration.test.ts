import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { Pool } from "pg";
import {
  connectDatabase,
  tenantTransaction,
  type Database,
} from "../src/database/connection.js";
import * as incidentPermissions from "../src/database/migrations/005-incident-permissions.js";
import * as locationPermissions from "../src/database/migrations/007-location-permissions.js";

interface DevelopmentDatabaseState {
  ownerUrl: string;
  runtimeUrl: string;
  databaseName: string;
  container: string;
  image: string;
}

const state = JSON.parse(
  readFileSync(
    process.env.PBSSU_TEST_DATABASE_STATE ??
      new URL("../../../.cache/m01/database.json", import.meta.url),
    "utf8",
  ),
) as DevelopmentDatabaseState;
const approvedScope = JSON.parse(
  readFileSync(
    new URL("../../../docs/planning/M01-SCOPE.json", import.meta.url),
    "utf8",
  ),
) as { operations: string[] };
const sprint2Scope = JSON.parse(
  readFileSync(
    new URL("../../../docs/planning/SPRINT-2-SCOPE.json", import.meta.url),
    "utf8",
  ),
) as { operations: string[] };
const owner = connectDatabase(state.ownerUrl, 2);
const runtime = connectDatabase(state.runtimeUrl, 1);
const runtimePool = new Pool({
  connectionString: state.runtimeUrl,
  max: 1,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 1000,
});
const tenantA = randomUUID();
const tenantB = randomUUID();
const userA = randomUUID();
const userB = randomUUID();
const roleA = randomUUID();
const roleB = randomUUID();
const membershipA = randomUUID();
const membershipB = randomUUID();
const incidentA = randomUUID();
const incidentB = randomUUID();
const locationA = randomUUID();
const locationB = randomUUID();
const eventA = randomUUID();
const eventB = randomUUID();

async function createTenant(
  database: Database,
  organizationId: string,
  userId: string,
  roleId: string,
  membershipId: string,
  suffix: string,
): Promise<void> {
  await tenantTransaction(
    database,
    organizationId,
    userId,
    async (transaction) => {
      await sql`
      insert into app.organizations (id, slug, name)
      values (${organizationId}::uuid, ${`m01-${suffix}`}, ${`M01 Synthetic ${suffix}`})
    `.execute(transaction);
      await sql`
      insert into app.memberships (id, organization_id, user_id, display_name)
      values (${membershipId}::uuid, ${organizationId}::uuid, ${userId}::uuid, ${`Synthetic ${suffix}`})
    `.execute(transaction);
      await sql`
      insert into app.roles (id, organization_id, code, name)
      values (${roleId}::uuid, ${organizationId}::uuid, 'M01_TEST', 'Synthetic test role')
    `.execute(transaction);
    },
  );
}

describe("M01 PostgreSQL foundation", () => {
  beforeAll(async () => {
    const versions = await owner.executeQuery(
      sql<{ server: string; postgis: string }>`
        select current_setting('server_version') as server, postgis_lib_version() as postgis
      `.compile(owner),
    );
    expect(versions.rows[0]?.server).toMatch(/^18\./);
    expect(versions.rows[0]?.postgis).toMatch(/^3\.7\./);

    const ownerPool = new Pool({ connectionString: state.ownerUrl, max: 1 });
    await ownerPool.query(
      `insert into app.users (id, email_normalized, email_ciphertext, email_verified_at, status)
       values ($1, $2, 'synthetic-ciphertext', now(), 'ACTIVE'),
              ($3, $4, 'synthetic-ciphertext', now(), 'ACTIVE')`,
      [userA, `${userA}@example.invalid`, userB, `${userB}@example.invalid`],
    );
    await ownerPool.end();
    await createTenant(owner, tenantA, userA, roleA, membershipA, "alpha");
    await createTenant(owner, tenantB, userB, roleB, membershipB, "bravo");
    for (const [organizationId, userId, incidentId, locationId, eventId] of [
      [tenantA, userA, incidentA, locationA, eventA],
      [tenantB, userB, incidentB, locationB, eventB],
    ] satisfies [string, string, string, string, string][]) {
      await tenantTransaction(owner, organizationId, userId, async (trx) => {
        await sql`
          insert into app.incidents
            (id,organization_id,title,category,occurred_at,source_kind)
          values (${incidentId},${organizationId},'Synthetic incident','FIRE',now(),'TEST')
        `.execute(trx);
        await sql`
          insert into app.incident_locations
            (id,organization_id,incident_id,label)
          values (${locationId},${organizationId},${incidentId},'Synthetic location')
        `.execute(trx);
        await sql`
          insert into app.change_events
            (id,organization_id,incident_id,location_id,entity_type,entity_id,
             event_kind,entity_version,visibility_scope)
          values (${eventId},${organizationId},${incidentId},${locationId},
                  'INCIDENT_LOCATION',${locationId},'LOCATION_CREATED',1,'{}'::jsonb)
        `.execute(trx);
      });
    }
  });

  afterAll(async () => {
    for (const [organizationId, userId] of [
      [tenantA, userA],
      [tenantB, userB],
    ] satisfies [string, string][]) {
      await tenantTransaction(
        owner,
        organizationId,
        userId,
        async (transaction) => {
          await sql`
            delete from app.change_events
            where organization_id = ${organizationId}::uuid
          `.execute(transaction);
          await sql`
            delete from app.incident_locations
            where organization_id = ${organizationId}::uuid
          `.execute(transaction);
          await sql`
            delete from app.incidents
            where organization_id = ${organizationId}::uuid
          `.execute(transaction);
          await sql`
            delete from app.vehicles
            where organization_id = ${organizationId}::uuid
          `.execute(transaction);
          await sql`
            delete from app.role_permissions
            where organization_id = ${organizationId}::uuid
          `.execute(transaction);
          await sql`
          delete from app.memberships
          where organization_id = ${organizationId}::uuid
        `.execute(transaction);
          await sql`
          delete from app.roles where organization_id = ${organizationId}::uuid
        `.execute(transaction);
          await sql`
          delete from app.organizations where id = ${organizationId}::uuid
        `.execute(transaction);
        },
      );
    }
    const ownerPool = new Pool({ connectionString: state.ownerUrl, max: 1 });
    await ownerPool.query("delete from app.users where id = any($1::uuid[])", [
      [userA, userB],
    ]);
    await ownerPool.end();
    await runtimePool.end();
    await owner.destroy();
    await runtime.destroy();
  });

  it("creates the 26-table migration chain and forces RLS on tenant tables", async () => {
    const counts = await owner.executeQuery(
      sql<{ count: string }>`
        select count(*)::text as count
        from information_schema.tables
        where table_schema = 'app' and table_type = 'BASE TABLE'
      `.compile(owner),
    );
    expect(counts.rows[0]?.count).toBe("26");

    const policies = await owner.executeQuery(
      sql<{
        table_name: string;
        row_security: boolean;
        force_row_security: boolean;
      }>`
        select relation.relname as table_name,
               relation.relrowsecurity as row_security,
               relation.relforcerowsecurity as force_row_security
        from pg_class as relation
        join pg_namespace as namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'app'
          and relation.relname in (
            'organizations', 'memberships', 'roles', 'role_permissions',
            'membership_roles', 'audit_logs', 'organization_settings',
            'organization_invitations', 'invitation_roles', 'vehicles',
            'incidents', 'incident_locations', 'change_events'
          )
      `.compile(owner),
    );
    expect(policies.rows).toHaveLength(13);
    expect(
      policies.rows.every((row) => row.row_security && row.force_row_security),
    ).toBe(true);
    const migrations = await owner.executeQuery(
      sql<{ names: string[] }>`
        select array_agg(name order by name) as names
        from migration_meta.kysely_migration
      `.compile(owner),
    );
    expect(migrations.rows[0]?.names).toEqual([
      "001-foundation",
      "002-permission-catalog",
      "003-vehicles",
      "004-incidents",
      "005-incident-permissions",
      "006-protected-cancellation-audit",
      "007-location-permissions",
    ]);
    expect(new Set(policies.rows.map((row) => row.table_name))).toEqual(
      new Set([
        "organizations",
        "memberships",
        "roles",
        "role_permissions",
        "membership_roles",
        "audit_logs",
        "organization_settings",
        "organization_invitations",
        "invitation_roles",
        "vehicles",
        "incidents",
        "incident_locations",
        "change_events",
      ]),
    );
  });

  it("migrates the exact approved permission keys without wildcard grants", async () => {
    const result = await owner.executeQuery(
      sql<{ code: string }>`select code from app.permissions`.compile(owner),
    );
    const codes = new Set(result.rows.map((row) => row.code));
    const expectedCodes = new Set([
      ...approvedScope.operations,
      ...sprint2Scope.operations,
      "listIncidents",
      "createIncident",
      "getIncident",
      "updateIncident",
      "transitionIncident",
      "listLocations",
      "createLocation",
    ]);
    expect(codes.size).toBe(expectedCodes.size);
    expect([...expectedCodes].every((code) => codes.has(code))).toBe(true);
    expect(
      approvedScope.operations.every((operation) => codes.has(operation)),
    ).toBe(true);
    expect(
      sprint2Scope.operations.every((operation) => codes.has(operation)),
    ).toBe(true);
    expect([...codes].some((code) => code === "*" || code.endsWith(".*"))).toBe(
      false,
    );
  });

  it("backfills only the approved incident role grants and scopes", async () => {
    for (const [organizationId, userId, roleId, code] of [
      [tenantA, userA, roleA, "INCIDENT_COMMANDER"],
      [tenantB, userB, roleB, "CONTROL_ROOM_OPERATOR"],
    ] as const) {
      await tenantTransaction(owner, organizationId, userId, (tx) =>
        sql`update app.roles set code=${code} where organization_id=${organizationId} and id=${roleId}`.execute(
          tx,
        ),
      );
    }
    const responder = randomUUID(),
      auditor = randomUUID(),
      admin = randomUUID();
    await tenantTransaction(owner, tenantA, userA, async (tx) => {
      for (const [roleId, code] of [
        [responder, "FIELD_RESPONDER"],
        [auditor, "READ_ONLY_AUDITOR"],
        [admin, "ORGANIZATION_ADMIN"],
      ] as const) {
        await sql`insert into app.roles(id,organization_id,code,name) values(${roleId},${tenantA},${code},${code})`.execute(
          tx,
        );
      }
    });
    await owner.transaction().execute((tx) => incidentPermissions.up(tx));
    await owner.transaction().execute((tx) => locationPermissions.up(tx));
    const alpha = await tenantTransaction(owner, tenantA, userA, (tx) =>
      sql<{
        role_code: string;
        permission_code: string;
        resource_scope: string;
      }>`
        select r.code role_code,p.code permission_code,rp.resource_scope
        from app.role_permissions rp join app.roles r on r.organization_id=rp.organization_id and r.id=rp.role_id
        join app.permissions p on p.id=rp.permission_id
        where rp.organization_id=${tenantA}
          and p.code in ('listIncidents','getIncident','createIncident','updateIncident','transitionIncident')
        order by r.code,p.code
      `.execute(tx),
    );
    const bravo = await tenantTransaction(owner, tenantB, userB, (tx) =>
      sql<{
        role_code: string;
        permission_code: string;
        resource_scope: string;
      }>`
        select r.code role_code,p.code permission_code,rp.resource_scope
        from app.role_permissions rp join app.roles r on r.organization_id=rp.organization_id and r.id=rp.role_id
        join app.permissions p on p.id=rp.permission_id
        where rp.organization_id=${tenantB}
          and p.code in ('listIncidents','getIncident','createIncident','updateIncident','transitionIncident')
        order by r.code,p.code
      `.execute(tx),
    );
    const rows = [...alpha.rows, ...bravo.rows];
    expect(rows).toHaveLength(16);
    expect(
      rows
        .filter((row) => row.role_code === "FIELD_RESPONDER")
        .every(
          (row) =>
            row.resource_scope === "ASSIGNED" &&
            ["listIncidents", "getIncident"].includes(row.permission_code),
        ),
    ).toBe(true);
    expect(
      rows
        .filter((row) => row.role_code === "ORGANIZATION_ADMIN")
        .map((row) => row.permission_code)
        .sort(),
    ).toEqual(["getIncident", "listIncidents"]);
    expect(
      rows
        .filter((row) => row.role_code === "READ_ONLY_AUDITOR")
        .map((row) => row.permission_code)
        .sort(),
    ).toEqual(["getIncident", "listIncidents"]);
    expect(rows.some((row) => row.role_code === "PLATFORM_SUPER_ADMIN")).toBe(
      false,
    );
    const locationRows = await tenantTransaction(owner, tenantA, userA, (tx) =>
      sql<{
        role_code: string;
        permission_code: string;
        resource_scope: string;
      }>`
        select r.code role_code,p.code permission_code,rp.resource_scope
        from app.role_permissions rp join app.roles r on r.organization_id=rp.organization_id and r.id=rp.role_id
        join app.permissions p on p.id=rp.permission_id
        where rp.organization_id=${tenantA} and p.code in ('listLocations','createLocation')
        order by r.code,p.code
      `.execute(tx),
    );
    expect(locationRows.rows).toEqual([
      {
        role_code: "FIELD_RESPONDER",
        permission_code: "listLocations",
        resource_scope: "ASSIGNED",
      },
      {
        role_code: "INCIDENT_COMMANDER",
        permission_code: "createLocation",
        resource_scope: "TENANT",
      },
      {
        role_code: "INCIDENT_COMMANDER",
        permission_code: "listLocations",
        resource_scope: "TENANT",
      },
      {
        role_code: "ORGANIZATION_ADMIN",
        permission_code: "listLocations",
        resource_scope: "TENANT",
      },
      {
        role_code: "READ_ONLY_AUDITOR",
        permission_code: "listLocations",
        resource_scope: "TENANT",
      },
    ]);
    const operatorLocationRows = await tenantTransaction(
      owner,
      tenantB,
      userB,
      (tx) =>
        sql<{
          role_code: string;
          permission_code: string;
          resource_scope: string;
        }>`
          select r.code role_code,p.code permission_code,rp.resource_scope
          from app.role_permissions rp join app.roles r on r.organization_id=rp.organization_id and r.id=rp.role_id
          join app.permissions p on p.id=rp.permission_id
          where rp.organization_id=${tenantB} and p.code in ('listLocations','createLocation')
          order by r.code,p.code
        `.execute(tx),
    );
    expect(operatorLocationRows.rows).toEqual([
      {
        role_code: "CONTROL_ROOM_OPERATOR",
        permission_code: "createLocation",
        resource_scope: "TENANT",
      },
      {
        role_code: "CONTROL_ROOM_OPERATOR",
        permission_code: "listLocations",
        resource_scope: "TENANT",
      },
    ]);
    expect(
      rows
        .filter((row) => row.role_code === "CONTROL_ROOM_OPERATOR")
        .map((row) => row.permission_code)
        .sort(),
    ).toEqual([
      "createIncident",
      "getIncident",
      "listIncidents",
      "transitionIncident",
      "updateIncident",
    ]);
    expect(
      rows
        .filter((row) => row.role_code === "INCIDENT_COMMANDER")
        .map((row) => row.permission_code)
        .sort(),
    ).toEqual([
      "createIncident",
      "getIncident",
      "listIncidents",
      "transitionIncident",
      "updateIncident",
    ]);
  });

  it("restricts runtime privileges and hides tenant rows without context", async () => {
    const privileges = await runtime.executeQuery(
      sql<{
        can_read: boolean;
        can_update_users: boolean;
        can_delete_roles: boolean;
      }>`
        select has_table_privilege(current_user, 'app.memberships', 'select') as can_read,
               has_table_privilege(current_user, 'app.users', 'update') as can_update_users,
               has_table_privilege(current_user, 'app.roles', 'delete') as can_delete_roles
      `.compile(runtime),
    );
    expect(privileges.rows[0]).toEqual({
      can_read: true,
      can_update_users: false,
      can_delete_roles: false,
    });

    const absentContext = await runtimePool.query(
      "select count(*)::text as count from app.memberships",
    );
    expect(absentContext.rows[0].count).toBe("0");
    const newTablePrivileges = await runtime.executeQuery(
      sql<{
        incidents_select: boolean;
        incidents_insert: boolean;
        incidents_delete: boolean;
        locations_select: boolean;
        locations_insert: boolean;
        locations_update: boolean;
        locations_delete: boolean;
        events_select: boolean;
        events_update: boolean;
        events_insert: boolean;
        events_delete: boolean;
      }>`
        select
          has_table_privilege(current_user,'app.incidents','select') as incidents_select,
          has_table_privilege(current_user,'app.incidents','insert') as incidents_insert,
          has_table_privilege(current_user,'app.incidents','delete') as incidents_delete,
          has_table_privilege(current_user,'app.incident_locations','select') as locations_select,
          has_table_privilege(current_user,'app.incident_locations','insert') as locations_insert,
          has_table_privilege(current_user,'app.incident_locations','update') as locations_update,
          has_table_privilege(current_user,'app.incident_locations','delete') as locations_delete,
          has_table_privilege(current_user,'app.change_events','select') as events_select,
          has_table_privilege(current_user,'app.change_events','insert') as events_insert,
          has_table_privilege(current_user,'app.change_events','update') as events_update,
          has_table_privilege(current_user,'app.change_events','delete') as events_delete
      `.compile(runtime),
    );
    expect(newTablePrivileges.rows[0]).toEqual({
      incidents_select: true,
      incidents_insert: true,
      incidents_delete: false,
      locations_select: true,
      locations_insert: true,
      locations_update: false,
      locations_delete: false,
      events_select: true,
      events_insert: true,
      events_update: false,
      events_delete: false,
    });
    const absentNewRows = await runtime.executeQuery(
      sql<{ incidents: string; locations: string; events: string }>`
        select (select count(*)::text from app.incidents) as incidents,
               (select count(*)::text from app.incident_locations) as locations,
               (select count(*)::text from app.change_events) as events
      `.compile(runtime),
    );
    expect(absentNewRows.rows[0]).toEqual({
      incidents: "0",
      locations: "0",
      events: "0",
    });
  });

  it("isolates incidents, locations, and events across tenant transactions", async () => {
    const alpha = await tenantTransaction(
      runtime,
      tenantA,
      userA,
      async (trx) =>
        sql<{ incidents: string[]; locations: string[]; events: string[] }>`
          select
            (select array_agg(id::text) from app.incidents) as incidents,
            (select array_agg(id::text) from app.incident_locations) as locations,
            (select array_agg(id::text) from app.change_events) as events
        `.execute(trx),
    );
    expect(alpha.rows[0]).toEqual({
      incidents: [incidentA],
      locations: [locationA],
      events: [eventA],
    });
    const bravo = await tenantTransaction(
      runtime,
      tenantB,
      userB,
      async (trx) =>
        sql<{ incidents: string[]; locations: string[]; events: string[] }>`
          select
            (select array_agg(id::text) from app.incidents) as incidents,
            (select array_agg(id::text) from app.incident_locations) as locations,
            (select array_agg(id::text) from app.change_events) as events
        `.execute(trx),
    );
    expect(bravo.rows[0]).toEqual({
      incidents: [incidentB],
      locations: [locationB],
      events: [eventB],
    });

    const hiddenUpdate = await tenantTransaction(
      runtime,
      tenantA,
      userA,
      async (trx) =>
        sql<{ id: string }>`
          update app.incidents set title='Synthetic unauthorized update'
          where id=${incidentB} returning id
        `.execute(trx),
    );
    expect(hiddenUpdate.rows).toHaveLength(0);
    await expect(
      tenantTransaction(runtime, tenantA, userA, (trx) =>
        sql`
          insert into app.incidents
            (organization_id,title,category,occurred_at,source_kind)
          values (${tenantB},'Synthetic cross-tenant','FIRE',now(),'TEST')
        `.execute(trx),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      tenantTransaction(runtime, tenantA, userA, (trx) =>
        sql`
          insert into app.incident_locations (organization_id,incident_id,label)
          values (${tenantA},${incidentB},'Cross-tenant parent')
        `.execute(trx),
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      tenantTransaction(runtime, tenantA, userA, (trx) =>
        sql`
          insert into app.change_events
            (organization_id,incident_id,entity_type,entity_id,event_kind,
             entity_version,visibility_scope)
          values (${tenantA},${incidentB},'INCIDENT',${incidentB},'CREATED',1,'{}'::jsonb)
        `.execute(trx),
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      tenantTransaction(runtime, tenantA, userA, (trx) =>
        sql`
          insert into app.change_events
            (organization_id,incident_id,location_id,entity_type,entity_id,
             event_kind,entity_version,visibility_scope)
          values (${tenantA},${incidentA},${locationB},'INCIDENT_LOCATION',
                  ${locationB},'LOCATION_CREATED',1,'{}'::jsonb)
        `.execute(trx),
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("keeps change events append-only for the restricted runtime role", async () => {
    await expect(
      tenantTransaction(runtime, tenantA, userA, (trx) =>
        sql`update app.change_events set tombstone=true where id=${eventA}`.execute(
          trx,
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      tenantTransaction(runtime, tenantA, userA, (trx) =>
        sql`delete from app.change_events where id=${eventA}`.execute(trx),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("enforces incident state, version, and completed-outcome constraints", async () => {
    await expect(
      tenantTransaction(owner, tenantA, userA, (trx) =>
        sql`
          insert into app.incidents
            (organization_id,title,category,status,occurred_at,source_kind)
          values (${tenantA},'Invalid state','FIRE','DISPATCHING',now(),'TEST')
        `.execute(trx),
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      tenantTransaction(owner, tenantA, userA, (trx) =>
        sql`
          insert into app.incidents
            (organization_id,title,category,occurred_at,source_kind,version)
          values (${tenantA},'Invalid version','FIRE',now(),'TEST',0)
        `.execute(trx),
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      tenantTransaction(owner, tenantA, userA, (trx) =>
        sql`
          insert into app.incidents
            (organization_id,title,category,status,occurred_at,source_kind)
          values (${tenantA},'Missing outcome','FIRE','COMPLETED',now(),'TEST')
        `.execute(trx),
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      tenantTransaction(owner, tenantA, userA, (trx) =>
        sql`
          insert into app.change_events
            (organization_id,incident_id,entity_type,entity_id,event_kind,
             entity_version,visibility_scope)
          values (${tenantA},${incidentA},'INCIDENT',${incidentA},'CREATED',0,'{}'::jsonb)
        `.execute(trx),
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      tenantTransaction(owner, tenantA, userA, (trx) =>
        sql`
          insert into app.change_events
            (organization_id,incident_id,entity_type,entity_id,event_kind,
             entity_version,tombstone,visibility_scope)
          values (${tenantA},${incidentA},'INCIDENT',${incidentA},'CREATED',1,true,'{}'::jsonb)
        `.execute(trx),
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      tenantTransaction(owner, tenantA, userA, (trx) =>
        sql`
          insert into app.incident_locations
            (organization_id,incident_id,label,accuracy_m)
          values (${tenantA},${incidentA},'Unpaired accuracy',1)
        `.execute(trx),
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rolls back incident writes when the surrounding transaction fails", async () => {
    const rolledBackIncident = randomUUID();
    await expect(
      tenantTransaction(owner, tenantA, userA, async (trx) => {
        await sql`
          insert into app.incidents
            (id,organization_id,title,category,occurred_at,source_kind)
          values (${rolledBackIncident},${tenantA},'Rollback probe','FIRE',now(),'TEST')
        `.execute(trx);
        throw new Error("synthetic incident transaction rollback");
      }),
    ).rejects.toThrow("synthetic incident transaction rollback");
    const absent = await tenantTransaction(owner, tenantA, userA, (trx) =>
      sql`select id from app.incidents where id=${rolledBackIncident}`.execute(
        trx,
      ),
    );
    expect(absent.rows).toHaveLength(0);
  });

  it("isolates tenant reads and rejects cross-tenant writes and composite references", async () => {
    const alpha = await tenantTransaction(
      runtime,
      tenantA,
      userA,
      async (transaction) =>
        sql<{ id: string }>`select id from app.memberships`.execute(
          transaction,
        ),
    );
    expect(alpha.rows.map((row) => row.id)).toEqual([membershipA]);

    const bravo = await tenantTransaction(
      runtime,
      tenantB,
      userB,
      async (transaction) =>
        sql<{ id: string }>`select id from app.memberships`.execute(
          transaction,
        ),
    );
    expect(bravo.rows.map((row) => row.id)).toEqual([membershipB]);

    await expect(
      tenantTransaction(runtime, tenantA, userA, async (transaction) =>
        sql`
          insert into app.memberships (organization_id, user_id, display_name)
          values (${tenantB}::uuid, ${userA}::uuid, 'Synthetic cross-tenant write')
        `.execute(transaction),
      ),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(
      tenantTransaction(runtime, tenantA, userA, async (transaction) =>
        sql`
          insert into app.role_permissions (organization_id, role_id, permission_id, resource_scope)
          values (${tenantA}::uuid, ${roleB}::uuid, gen_random_uuid(), 'TENANT')
        `.execute(transaction),
      ),
    ).rejects.toMatchObject({ code: "23503" });

    const missingOrganization = randomUUID();
    await expect(
      tenantTransaction(
        owner,
        missingOrganization,
        userA,
        async (transaction) =>
          sql`
          insert into app.vehicles (organization_id,call_sign,kind)
          values (${missingOrganization}::uuid,'ORPHAN','Test')
        `.execute(transaction),
      ),
    ).rejects.toMatchObject({ code: "23503" });
    const compositeUnique = await owner.executeQuery(
      sql<{ exists: boolean }>`
        select exists (
          select 1 from pg_constraint c
          join pg_class t on t.oid=c.conrelid
          join pg_namespace n on n.oid=t.relnamespace
          where n.nspname='app' and t.relname='vehicles' and c.contype='u'
            and pg_get_constraintdef(c.oid)='UNIQUE (organization_id, id)'
        ) as exists
      `.compile(owner),
    );
    expect(compositeUnique.rows[0]?.exists).toBe(true);
  });

  it("clears transaction-local tenant context on pooled connection reuse", async () => {
    const scoped = await tenantTransaction(
      runtime,
      tenantA,
      userA,
      async (transaction) => {
        await sql`
          insert into app.vehicles (organization_id,call_sign,kind)
          values (${tenantA},${`POOL-${randomUUID().slice(0, 8)}`},'Test')
        `.execute(transaction);
        return sql<{ setting: string; backend_pid: number }>`
          select current_setting('app.organization_id') as setting,
                 pg_backend_pid() as backend_pid
        `.execute(transaction);
      },
    );
    expect(scoped.rows[0]?.setting).toBe(tenantA);

    const afterCommit = await sql<{
      setting: string | null;
      backend_pid: number;
      visible_vehicles: string;
    }>`select nullif(current_setting('app.organization_id',true),'') as setting,
            pg_backend_pid() as backend_pid,
            (select count(*)::text from app.vehicles) as visible_vehicles`.execute(
      runtime,
    );
    expect(afterCommit.rows[0]?.backend_pid).toBe(scoped.rows[0]?.backend_pid);
    expect(afterCommit.rows[0]?.setting).toBeNull();
    expect(afterCommit.rows[0]?.visible_vehicles).toBe("0");

    await expect(
      tenantTransaction(runtime, tenantA, userA, async () => {
        throw new Error("synthetic rollback probe");
      }),
    ).rejects.toThrow("synthetic rollback probe");
    const afterRollback = await sql<{
      setting: string | null;
      visible_memberships: string;
      visible_vehicles: string;
    }>`select nullif(current_setting('app.organization_id',true),'') as setting,
            (select count(*)::text from app.memberships) as visible_memberships,
            (select count(*)::text from app.vehicles) as visible_vehicles`.execute(
      runtime,
    );
    expect(afterRollback.rows[0]).toEqual({
      setting: null,
      visible_memberships: "0",
      visible_vehicles: "0",
    });
  });

  it("keeps concurrent tenant transaction contexts isolated", async () => {
    const [alpha, bravo] = await Promise.all([
      tenantTransaction(runtime, tenantA, userA, async (transaction) => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return sql<{ id: string }>`select id from app.memberships`.execute(
          transaction,
        );
      }),
      tenantTransaction(runtime, tenantB, userB, async (transaction) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return sql<{ id: string }>`select id from app.memberships`.execute(
          transaction,
        );
      }),
    ]);
    expect(alpha.rows.map((row) => row.id)).toEqual([membershipA]);
    expect(bravo.rows.map((row) => row.id)).toEqual([membershipB]);
  });
});
