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
            delete from app.vehicles
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

  it("creates the M01 and Sprint 2 tables and forces RLS on tenant tables", async () => {
    const counts = await owner.executeQuery(
      sql<{ count: string }>`
        select count(*)::text as count
        from information_schema.tables
        where table_schema = 'app' and table_type = 'BASE TABLE'
      `.compile(owner),
    );
    expect(counts.rows[0]?.count).toBe("23");

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
            'organization_invitations', 'invitation_roles', 'vehicles'
          )
      `.compile(owner),
    );
    expect(policies.rows).toHaveLength(10);
    expect(
      policies.rows.every((row) => row.row_security && row.force_row_security),
    ).toBe(true);
  });

  it("migrates the exact approved permission keys without wildcard grants", async () => {
    const result = await owner.executeQuery(
      sql<{ code: string }>`select code from app.permissions`.compile(owner),
    );
    const codes = new Set(result.rows.map((row) => row.code));
    const expectedCodes = new Set([
      ...approvedScope.operations,
      ...sprint2Scope.operations,
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
