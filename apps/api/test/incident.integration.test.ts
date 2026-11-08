import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { Pool } from "pg";
import {
  connectDatabase,
  tenantTransaction,
} from "../src/database/connection.js";
import { IncidentService } from "../src/incidents/incident.service.js";
import type { IdentityService } from "../src/identity/identity.service.js";

interface State {
  ownerUrl: string;
  runtimeUrl: string;
  identityUrl: string;
  databaseName: string;
}
const state = JSON.parse(
  readFileSync(
    process.env.PBSSU_TEST_DATABASE_STATE ??
      new URL("../../../.cache/sprint3b/database.json", import.meta.url),
    "utf8",
  ),
) as State;
process.env.NODE_ENV = "test";
process.env.HOST = "127.0.0.1";
process.env.PORT = "3301";
process.env.MAIL_MODE = "mock";
process.env.TRUSTED_WEB_ORIGIN = "http://127.0.0.1:5173";
process.env.DATABASE_URL = state.runtimeUrl;
process.env.IDENTITY_DATABASE_URL = state.identityUrl;

const org = randomUUID(),
  foreignOrg = randomUUID(),
  userCommander = randomUUID(),
  userOperator = randomUUID(),
  userOther = randomUUID(),
  userResponder = randomUUID();
const membershipCommander = randomUUID(),
  membershipOperator = randomUUID(),
  membershipOther = randomUUID(),
  roleCommander = randomUUID(),
  roleOperator = randomUUID(),
  roleOther = randomUUID(),
  membershipResponder = randomUUID(),
  roleResponder = randomUUID();
const owner = connectDatabase(state.ownerUrl, 2);
const runtime = connectDatabase(state.runtimeUrl, 2);
const ownerPool = new Pool({ connectionString: state.ownerUrl, max: 1 });
const actorTokens = new Map([
  ["commander", userCommander],
  ["operator", userOperator],
  ["other", userOther],
  ["responder", userResponder],
]);
const identityStub = {
  authenticateAccessToken: async (token: string) => ({
    userId: actorTokens.get(token) ?? userOther,
    assurance: "MFA" as const,
  }),
} as unknown as IdentityService;
const service = new IncidentService(identityStub);

beforeAll(async () => {
  await ownerPool.query(
    "insert into app.users(id,email_normalized,email_ciphertext,email_verified_at,status) values ($1,$2,'synthetic',now(),'ACTIVE'),($3,$4,'synthetic',now(),'ACTIVE'),($5,$6,'synthetic',now(),'ACTIVE'),($7,$8,'synthetic',now(),'ACTIVE')",
    [
      userCommander,
      `${userCommander}@example.invalid`,
      userOperator,
      `${userOperator}@example.invalid`,
      userOther,
      `${userOther}@example.invalid`,
      userResponder,
      `${userResponder}@example.invalid`,
    ],
  );
  await ownerPool.query(
    `insert into app.platform_grants(user_id,permission_id)
     select $1,id from app.permissions where code='onboardOrganization'`,
    [userOther],
  );
  await tenantTransaction(owner, org, userCommander, async (tx) => {
    await sql`insert into app.organizations(id,slug,name,status) values(${org},${`incident-${org}`},'Synthetic Incident Tenant','ACTIVE')`.execute(
      tx,
    );
    await sql`insert into app.memberships(id,organization_id,user_id,display_name,status,activated_at) values(${membershipCommander},${org},${userCommander},'Synthetic Commander','ACTIVE',now()),(${membershipOperator},${org},${userOperator},'Synthetic Operator','ACTIVE',now())`.execute(
      tx,
    );
    await sql`insert into app.roles(id,organization_id,code,name) values(${roleCommander},${org},'INCIDENT_COMMANDER','Synthetic Commander'),(${roleOperator},${org},'CONTROL_ROOM_OPERATOR','Synthetic Operator')`.execute(
      tx,
    );
    await sql`insert into app.membership_roles(organization_id,membership_id,role_id) values(${org},${membershipCommander},${roleCommander}),(${org},${membershipOperator},${roleOperator})`.execute(
      tx,
    );
    await sql`insert into app.memberships(id,organization_id,user_id,display_name,status,activated_at)
      values(${membershipResponder},${org},${userResponder},'Synthetic Responder','ACTIVE',now())`.execute(
      tx,
    );
    await sql`insert into app.roles(id,organization_id,code,name)
      values(${roleResponder},${org},'FIELD_RESPONDER','Synthetic Responder')`.execute(
      tx,
    );
    await sql`insert into app.membership_roles(organization_id,membership_id,role_id)
      values(${org},${membershipResponder},${roleResponder})`.execute(tx);
    for (const [role, codes] of [
      [
        roleCommander,
        [
          "listIncidents",
          "getIncident",
          "createIncident",
          "updateIncident",
          "transitionIncident",
          "listLocations",
          "createLocation",
        ],
      ],
      [
        roleOperator,
        [
          "listIncidents",
          "getIncident",
          "createIncident",
          "updateIncident",
          "transitionIncident",
          "listLocations",
          "createLocation",
        ],
      ],
    ] as const) {
      const grants = await sql<{
        id: string;
        code: string;
      }>`select id,code from app.permissions where code=any(${codes})`.execute(
        tx,
      );
      expect(grants.rows).toHaveLength(7);
      for (const grant of grants.rows)
        await sql`insert into app.role_permissions(organization_id,role_id,permission_id,resource_scope) values(${org},${role},${grant.id},'TENANT')`.execute(
          tx,
        );
    }
    const locationPermissions = await sql<{ id: string; code: string }>`
      select id,code from app.permissions where code in ('listLocations','createLocation')
    `.execute(tx);
    expect(locationPermissions.rows).toHaveLength(2);
    const responderRead = locationPermissions.rows.find(
      (permission) => permission.code === "listLocations",
    )!;
    await sql`insert into app.role_permissions(organization_id,role_id,permission_id,resource_scope)
      values(${org},${roleResponder},${responderRead.id},'ASSIGNED')`.execute(
      tx,
    );
  });
  await tenantTransaction(owner, foreignOrg, userOther, async (tx) => {
    await sql`insert into app.organizations(id,slug,name,status) values(${foreignOrg},${`foreign-${foreignOrg}`},'Synthetic Foreign Tenant','ACTIVE')`.execute(
      tx,
    );
    await sql`insert into app.memberships(id,organization_id,user_id,display_name,status,activated_at) values(${membershipOther},${foreignOrg},${userOther},'Synthetic Foreign Commander','ACTIVE',now())`.execute(
      tx,
    );
    await sql`insert into app.roles(id,organization_id,code,name) values(${roleOther},${foreignOrg},'INCIDENT_COMMANDER','Synthetic Foreign Commander')`.execute(
      tx,
    );
    await sql`insert into app.membership_roles(organization_id,membership_id,role_id) values(${foreignOrg},${membershipOther},${roleOther})`.execute(
      tx,
    );
    const grants = await sql<{
      id: string;
    }>`select id from app.permissions where code in ('listIncidents','getIncident','createIncident','updateIncident','transitionIncident','listLocations','createLocation')`.execute(
      tx,
    );
    for (const grant of grants.rows)
      await sql`insert into app.role_permissions(organization_id,role_id,permission_id,resource_scope) values(${foreignOrg},${roleOther},${grant.id},'TENANT')`.execute(
        tx,
      );
  });
});

afterAll(async () => {
  // Keep synthetic audit evidence intact; the entire database is disposable.
  await ownerPool.end();
  await service.onModuleDestroy();
  await runtime.destroy();
  await owner.destroy();
});

describe("Sprint 3-B incident operations (restricted PostgreSQL role)", () => {
  it("creates, lists, reads and updates incidents with tenant RBAC and versioning", async () => {
    const created = (await service.createIncident("commander", org, {
      title: "Synthetic flood watch",
      category: "FLOOD_MONITORING",
      occurred_at: "2026-11-05T08:00:00Z",
      source_kind: "TEST",
    })) as { id: string; status: string; version: number };
    expect(created.status).toBe("DRAFT");
    expect(created.version).toBe(1);
    const listed = (await service.listIncidents("commander", org)) as {
      items: Array<{ id: string }>;
      next_cursor: string | null;
    };
    expect(listed.items.some((item) => item.id === created.id)).toBe(true);
    expect(listed).not.toHaveProperty("cancellation_reason");
    expect(
      await service.getIncident("commander", org, created.id),
    ).not.toHaveProperty("cancellation_reason");
    const updated = (await service.updateIncident(
      "commander",
      org,
      created.id,
      { base_version: 1, title: "Synthetic flood monitoring" },
    )) as { version: number };
    expect(updated.version).toBe(2);
    await expect(
      service.updateIncident("commander", org, created.id, {
        base_version: 1,
        title: "Stale write",
      }),
    ).rejects.toMatchObject({
      response: { code: "STALE_VERSION", current_version: 2 },
    });
    const opened = (await service.transitionIncident(
      "commander",
      org,
      created.id,
      { base_version: 2, target: "OPEN", reason: "Synthetic opening command" },
    )) as { status: string; version: number };
    expect(opened).toMatchObject({ status: "OPEN", version: 3 });
  });

  it("allows Commander cancellation only and stores only encrypted audit metadata", async () => {
    const created = (await service.createIncident("commander", org, {
      title: "Synthetic cancellation probe",
      category: "OTHER",
      occurred_at: "2026-11-05T08:00:00Z",
      source_kind: "TEST",
    })) as { id: string; version: number };
    const phrase = "Synthetic cancellation reason, no personal data";
    const cancelled = (await service.transitionIncident(
      "commander",
      org,
      created.id,
      { base_version: created.version, target: "CANCELLED", reason: phrase },
    )) as { status: string; version: number };
    expect(cancelled).toMatchObject({
      status: "CANCELLED",
      version: created.version + 1,
    });
    expect(
      await service.getIncident("commander", org, created.id),
    ).not.toHaveProperty("cancellation_reason");
    const metadata = await tenantTransaction(
      runtime,
      org,
      userCommander,
      (tx) =>
        sql<{
          metadata: Record<string, unknown>;
        }>`select metadata from app.audit_logs where organization_id=${org} and resource_id=${created.id} and action='transitionIncident'`.execute(
          tx,
        ),
    );
    const text = JSON.stringify(metadata.rows[0]?.metadata);
    expect(text).not.toContain(phrase);
    expect(metadata.rows[0]?.metadata).toHaveProperty(
      "cancellation_reason.algorithm",
      "A256GCM",
    );
    expect(metadata.rows[0]?.metadata).toHaveProperty(
      "cancellation_reason.version",
      1,
    );
  });

  it("rolls back the command and event when encryption key loading fails", async () => {
    const created = (await service.createIncident("commander", org, {
      title: "Synthetic crypto failure probe",
      category: "OTHER",
      occurred_at: "2026-11-05T08:00:00Z",
      source_kind: "TEST",
    })) as { id: string; version: number };
    execFileSync(
      "node",
      ["--import", "tsx", "scripts/test-sprint3b-encryption-failure.ts"],
      {
        env: {
          ...process.env,
          PBSSU_TEST_ORG: org,
          PBSSU_TEST_ACTOR: userCommander,
          PBSSU_TEST_INCIDENT: created.id,
          PBSSU_TEST_VERSION: String(created.version),
          PBSSU_IDENTITY_DATABASE_URL: state.identityUrl,
          PBSSU_MISSING_KEY_FILE: resolve(
            ".cache/sprint3b2/no-such-key-file.json",
          ),
        },
        stdio: "pipe",
      },
    );
    const stateAfter = (await service.getIncident(
      "commander",
      org,
      created.id,
    )) as { status: string; version: number };
    expect(stateAfter).toMatchObject({
      status: "DRAFT",
      version: created.version,
    });
    const evidence = await tenantTransaction(
      runtime,
      org,
      userCommander,
      (tx) =>
        sql<{ events: number; audits: number }>`select
      (select count(*)::int from app.change_events where organization_id=${org} and incident_id=${created.id}) events,
      (select count(*)::int from app.audit_logs where organization_id=${org} and resource_id=${created.id} and action='transitionIncident') audits`.execute(
          tx,
        ),
    );
    expect(evidence.rows[0]).toEqual({ events: 1, audits: 0 });
  });

  it("denies Operator cancellation, cross-tenant access and unavailable transitions without mutation", async () => {
    const foreignIncident = (await service.createIncident("other", foreignOrg, {
      title: "Synthetic foreign tenant probe",
      category: "OTHER",
      occurred_at: "2026-11-05T08:00:00Z",
      source_kind: "TEST",
    })) as { id: string };
    await expect(
      service.getIncident("commander", foreignOrg, foreignIncident.id),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.updateIncident("commander", foreignOrg, foreignIncident.id, {
        base_version: 1,
        title: "Synthetic cross-tenant write",
      }),
    ).rejects.toMatchObject({ status: 403 });
    const created = (await service.createIncident("operator", org, {
      title: "Synthetic operator probe",
      category: "RESCUE",
      occurred_at: "2026-11-05T08:00:00Z",
      source_kind: "TEST",
    })) as { id: string; version: number };
    await expect(
      service.transitionIncident("operator", org, created.id, {
        base_version: created.version,
        target: "CANCELLED",
        reason: "Synthetic denied cancellation",
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.getIncident("other", org, created.id),
    ).rejects.toMatchObject({ status: 403 });
    const opened = (await service.transitionIncident(
      "operator",
      org,
      created.id,
      {
        base_version: created.version,
        target: "OPEN",
        reason: "Synthetic operator ordinary transition",
      },
    )) as { version: number };
    await expect(
      service.transitionIncident("commander", org, created.id, {
        base_version: opened.version,
        target: "DISPATCHED",
        reason: "Synthetic deferred command",
      }),
    ).rejects.toMatchObject({ response: { code: "PREREQUISITE_UNAVAILABLE" } });
    const draft = (await service.createIncident("commander", org, {
      title: "Synthetic invalid edge probe",
      category: "OTHER",
      occurred_at: "2026-11-05T08:00:00Z",
      source_kind: "TEST",
    })) as { id: string; version: number };
    await expect(
      service.transitionIncident("commander", org, draft.id, {
        base_version: draft.version,
        target: "DISPATCHED",
        reason: "Synthetic invalid draft edge",
      }),
    ).rejects.toMatchObject({ response: { code: "INVALID_TRANSITION" } });
    const current = (await service.getIncident(
      "commander",
      org,
      created.id,
    )) as { status: string; version: number };
    expect(current).toMatchObject({
      status: "OPEN",
      version: opened.version,
    });
  });

  it("serializes concurrent updates with one compare-and-swap winner", async () => {
    const created = (await service.createIncident("commander", org, {
      title: "Synthetic concurrency probe",
      category: "OTHER",
      occurred_at: "2026-11-05T08:00:00Z",
      source_kind: "TEST",
    })) as { id: string; version: number };
    const outcomes = await Promise.allSettled([
      service.updateIncident("commander", org, created.id, {
        base_version: 1,
        title: "Synthetic concurrent edit A",
      }),
      service.updateIncident("commander", org, created.id, {
        base_version: 1,
        title: "Synthetic concurrent edit B",
      }),
    ]);
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = outcomes.find((result) => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected")
      expect(rejected.reason).toMatchObject({
        response: { code: "STALE_VERSION", current_version: 2 },
      });
    const final = (await service.getIncident("commander", org, created.id)) as {
      version: number;
    };
    expect(final.version).toBe(2);
  });

  it("rejects arbitrary audit metadata and preserves append-only protection", async () => {
    await expect(
      tenantTransaction(runtime, org, userCommander, (tx) =>
        sql`insert into app.audit_logs(organization_id,actor_user_id,actor_membership_id,action,resource_type,result,correlation_id,metadata) values(${org},${userCommander},${membershipCommander},'unrelated','INCIDENT','SUCCESS',${randomUUID()},${JSON.stringify({ arbitrary: true })}::jsonb)`.execute(
          tx,
        ),
      ),
    ).rejects.toMatchObject({ code: "23514" });
    const row = await tenantTransaction(runtime, org, userCommander, (tx) =>
      sql<{
        id: string;
      }>`select id from app.audit_logs where organization_id=${org} limit 1`.execute(
        tx,
      ),
    );
    if (row.rows[0])
      await expect(
        tenantTransaction(runtime, org, userCommander, (tx) =>
          sql`update app.audit_logs set metadata='{}'::jsonb where id=${row.rows[0]!.id}`.execute(
            tx,
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
    if (row.rows[0])
      await expect(
        tenantTransaction(runtime, org, userCommander, (tx) =>
          sql`delete from app.audit_logs where id=${row.rows[0]!.id}`.execute(
            tx,
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
  });

  it("creates and lists redacted locations with parent CAS and atomic evidence", async () => {
    const incident = (await service.createIncident("commander", org, {
      title: "Synthetic location parent",
      category: "FLOOD_MONITORING",
      occurred_at: "2026-11-05T08:00:00Z",
      source_kind: "TEST",
    })) as { id: string; version: number };
    const created = (await service.createLocation(
      "commander",
      org,
      incident.id,
      {
        base_version: incident.version,
        label: "Synthetic monitoring point",
        point: { longitude: 101.6869, latitude: 3.139, accuracy_m: 8.5 },
        description: "Synthetic internal note omitted from projection",
      },
    )) as Record<string, unknown>;
    expect(created).toMatchObject({
      version: 1,
      organization_id: org,
      incident_id: incident.id,
      label: "Synthetic monitoring point",
      point: { longitude: 101.6869, latitude: 3.139, accuracy_m: 8.5 },
    });
    expect(created).not.toHaveProperty("description");
    const current = (await service.getIncident(
      "commander",
      org,
      incident.id,
    )) as { version: number };
    expect(current.version).toBe(incident.version + 1);
    const page = (await service.listLocations(
      "commander",
      org,
      incident.id,
    )) as { items: Array<Record<string, unknown>>; next_cursor: null };
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ id: created.id, version: 1 });
    expect(page.items[0]).not.toHaveProperty("description");
    const evidence = await tenantTransaction(
      runtime,
      org,
      userCommander,
      (tx) =>
        sql<{
          event_kind: string;
          entity_type: string;
          entity_version: number;
          location_events: number;
          location_audits: number;
          parent_version: number;
        }>`
        select
          (select event_kind from app.change_events
            where organization_id=${org} and location_id=${String(created.id)} and entity_type='INCIDENT_LOCATION') as event_kind,
          (select entity_type from app.change_events
            where organization_id=${org} and location_id=${String(created.id)} and entity_type='INCIDENT_LOCATION') as entity_type,
          (select entity_version from app.change_events
            where organization_id=${org} and location_id=${String(created.id)} and entity_type='INCIDENT_LOCATION') as entity_version,
          (select count(*)::int from app.change_events
            where organization_id=${org} and incident_id=${incident.id}
              and location_id=${String(created.id)} and event_kind='LOCATION_CREATED') as location_events,
          (select count(*)::int from app.audit_logs
            where organization_id=${org} and resource_id=${String(created.id)} and action='createLocation') as location_audits,
          (select version from app.incidents where organization_id=${org} and id=${incident.id}) as parent_version
      `.execute(tx),
    );
    expect(evidence.rows[0]).toEqual({
      event_kind: "LOCATION_CREATED",
      entity_type: "INCIDENT_LOCATION",
      entity_version: 1,
      location_events: 1,
      location_audits: 1,
      parent_version: incident.version + 1,
    });
  });

  it("rejects invalid location fields and stale parent versions without writes", async () => {
    const incident = (await service.createIncident("commander", org, {
      title: "Synthetic validation parent",
      category: "OTHER",
      occurred_at: "2026-11-05T08:00:00Z",
      source_kind: "TEST",
    })) as { id: string; version: number };
    await expect(
      service.createLocation("commander", org, incident.id, {
        base_version: incident.version,
        label: "Invalid coordinate",
        point: { longitude: 181, latitude: 10, accuracy_m: 3 },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.createLocation("commander", org, incident.id, {
        base_version: incident.version,
        label: "Missing accuracy",
        point: { longitude: 101, latitude: 3 },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.createLocation("commander", org, incident.id, {
        base_version: incident.version,
        label: "Stale version",
        description: "Synthetic stale write",
        unexpected: "rejected",
      }),
    ).rejects.toMatchObject({ status: 400 });
    const good = (await service.createLocation("commander", org, incident.id, {
      base_version: incident.version,
      label: "Valid point without coordinates",
    })) as { id: string };
    await expect(
      service.createLocation("commander", org, incident.id, {
        base_version: incident.version,
        label: "Stale location",
      }),
    ).rejects.toMatchObject({
      response: {
        code: "STALE_VERSION",
        current_version: incident.version + 1,
      },
    });
    const listed = (await service.listLocations(
      "commander",
      org,
      incident.id,
    )) as { items: Array<{ id: string }> };
    expect(listed.items.map((item) => item.id)).toEqual([good.id]);
  });

  it("serializes concurrent location creation and keeps incident updates in the same version stream", async () => {
    const incident = (await service.createIncident("commander", org, {
      title: "Synthetic concurrent location parent",
      category: "OTHER",
      occurred_at: "2026-11-05T08:00:00Z",
      source_kind: "TEST",
    })) as { id: string; version: number };
    const results = await Promise.allSettled([
      service.createLocation("commander", org, incident.id, {
        base_version: incident.version,
        label: "Concurrent location A",
      }),
      service.createLocation("commander", org, incident.id, {
        base_version: incident.version,
        label: "Concurrent location B",
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected")
      expect(rejected.reason).toMatchObject({
        response: {
          code: "STALE_VERSION",
          current_version: incident.version + 1,
        },
      });
    const changed = (await service.getIncident(
      "commander",
      org,
      incident.id,
    )) as {
      version: number;
    };
    expect(changed.version).toBe(incident.version + 1);
    const update = (await service.updateIncident(
      "commander",
      org,
      incident.id,
      {
        base_version: changed.version,
        title: "Synthetic updated after location",
      },
    )) as { version: number };
    expect(update.version).toBe(changed.version + 1);
    await expect(
      service.updateIncident("commander", org, incident.id, {
        base_version: incident.version,
        title: "Stale after location",
      }),
    ).rejects.toMatchObject({
      response: { code: "STALE_VERSION", current_version: update.version },
    });
    await expect(
      service.transitionIncident("commander", org, incident.id, {
        base_version: incident.version,
        target: "OPEN",
        reason: "Synthetic stale transition after location updates",
      }),
    ).rejects.toMatchObject({
      response: { code: "STALE_VERSION", current_version: update.version },
    });
  });

  it("paginates locations in deterministic identifier order", async () => {
    const incident = (await service.createIncident("commander", org, {
      title: "Synthetic pagination parent",
      category: "OTHER",
      occurred_at: "2026-11-05T08:00:00Z",
      source_kind: "TEST",
    })) as { id: string; version: number };
    let baseVersion = incident.version;
    for (const label of ["Pagination A", "Pagination B", "Pagination C"]) {
      await service.createLocation("commander", org, incident.id, {
        base_version: baseVersion,
        label,
      });
      baseVersion++;
    }
    const first = (await service.listLocations(
      "commander",
      org,
      incident.id,
      undefined,
      "1",
    )) as { items: Array<{ id: string }>; next_cursor: string | null };
    const second = (await service.listLocations(
      "commander",
      org,
      incident.id,
      first.next_cursor ?? undefined,
      "1",
    )) as { items: Array<{ id: string }>; next_cursor: string | null };
    const third = (await service.listLocations(
      "commander",
      org,
      incident.id,
      second.next_cursor ?? undefined,
      "1",
    )) as { items: Array<{ id: string }>; next_cursor: string | null };
    const pageIds = [
      first.items[0]!.id,
      second.items[0]!.id,
      third.items[0]!.id,
    ];
    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(1);
    expect(third.items).toHaveLength(1);
    expect(third.next_cursor).toBeNull();
    expect(pageIds).toEqual([...pageIds].sort());
    expect(new Set(pageIds).size).toBe(3);
  });

  it("rejects location mutation after cancellation or closure", async () => {
    const cancelled = (await service.createIncident("commander", org, {
      title: "Synthetic cancelled parent",
      category: "OTHER",
      occurred_at: "2026-11-05T08:00:00Z",
      source_kind: "TEST",
    })) as { id: string; version: number };
    const cancelledResult = (await service.transitionIncident(
      "commander",
      org,
      cancelled.id,
      {
        base_version: cancelled.version,
        target: "CANCELLED",
        reason: "Synthetic terminal-state test",
      },
    )) as { version: number };
    await expect(
      service.createLocation("commander", org, cancelled.id, {
        base_version: cancelledResult.version,
        label: "Rejected after cancellation",
      }),
    ).rejects.toMatchObject({ response: { code: "INVALID_TRANSITION" } });

    const closed = (await service.createIncident("commander", org, {
      title: "Synthetic closed parent",
      category: "OTHER",
      occurred_at: "2026-11-05T08:00:00Z",
      source_kind: "TEST",
    })) as { id: string; version: number };
    await tenantTransaction(owner, org, userCommander, (tx) =>
      sql`update app.incidents set status='CLOSED'
        where organization_id=${org} and id=${closed.id}`.execute(tx),
    );
    await expect(
      service.createLocation("commander", org, closed.id, {
        base_version: closed.version,
        label: "Rejected after closure",
      }),
    ).rejects.toMatchObject({ response: { code: "INVALID_TRANSITION" } });
  });

  it("fails closed for responder and cross-tenant location access", async () => {
    const foreignIncident = (await service.createIncident("other", foreignOrg, {
      title: "Synthetic foreign location parent",
      category: "OTHER",
      occurred_at: "2026-11-05T08:00:00Z",
      source_kind: "TEST",
    })) as { id: string; version: number };
    const foreignLocation = (await service.createLocation(
      "other",
      foreignOrg,
      foreignIncident.id,
      {
        base_version: foreignIncident.version,
        label: "Foreign synthetic location",
      },
    )) as { id: string };
    await expect(
      service.listLocations("commander", org, foreignIncident.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.listLocations("other", foreignOrg, foreignIncident.id),
    ).resolves.toMatchObject({ items: [{ id: foreignLocation.id }] });
    await expect(
      service.listLocations("responder", org, foreignIncident.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.createLocation("responder", org, foreignIncident.id, {
        base_version: 1,
        label: "Unauthorized location",
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.listLocations("commander", foreignOrg, foreignIncident.id),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.listLocations("other", org, foreignIncident.id),
    ).rejects.toMatchObject({ status: 403 });
    expect(foreignLocation.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("rolls back location, parent version, event, and audit on event or audit failure", async () => {
    const incident = (await service.createIncident("commander", org, {
      title: "Synthetic rollback parent",
      category: "OTHER",
      occurred_at: "2026-11-05T08:00:00Z",
      source_kind: "TEST",
    })) as { id: string; version: number };
    await ownerPool.query(`
      create or replace function app.sprint3c_test_fail_insert() returns trigger
      language plpgsql as $$ begin raise exception 'synthetic injected failure'; end $$
    `);
    const auditCountBeforeResult = await tenantTransaction(
      runtime,
      org,
      userCommander,
      (tx) =>
        sql<{
          count: string;
        }>`select count(*)::text as count from app.audit_logs
          where organization_id=${org} and action='createLocation'`.execute(tx),
    );
    const auditCountBefore = Number(auditCountBeforeResult.rows[0]?.count);
    try {
      for (const [table, triggerName] of [
        ["change_events", "sprint3c_test_fail_event"],
        ["audit_logs", "sprint3c_test_fail_audit"],
      ] as const) {
        await ownerPool.query(
          table === "audit_logs"
            ? `
              create trigger ${triggerName} before insert on app.audit_logs
              for each row when (new.action = 'createLocation')
              execute function app.sprint3c_test_fail_insert()
            `
            : `
            create trigger ${triggerName} before insert on app.${table}
            for each row execute function app.sprint3c_test_fail_insert()
            `,
        );
        await expect(
          service.createLocation("commander", org, incident.id, {
            base_version: incident.version,
            label: `Injected ${table} failure`,
          }),
        ).rejects.toThrow();
        await ownerPool.query(`drop trigger ${triggerName} on app.${table}`);
        const check = await tenantTransaction(
          runtime,
          org,
          userCommander,
          (tx) =>
            sql<{
              version: number;
              locations: number;
              events: number;
              audits: number;
            }>`
            select
              (select version from app.incidents where organization_id=${org} and id=${incident.id}) as version,
              (select count(*)::int from app.incident_locations where organization_id=${org} and incident_id=${incident.id}) as locations,
              (select count(*)::int from app.change_events where organization_id=${org} and incident_id=${incident.id} and event_kind='LOCATION_CREATED') as events,
              (select count(*)::int from app.audit_logs where organization_id=${org} and action='createLocation') as audits
          `.execute(tx),
        );
        expect(check.rows[0]).toEqual({
          version: incident.version,
          locations: 0,
          events: 0,
          audits: auditCountBefore,
        });
      }
    } finally {
      await ownerPool.query(
        "drop trigger if exists sprint3c_test_fail_event on app.change_events",
      );
      await ownerPool.query(
        "drop trigger if exists sprint3c_test_fail_audit on app.audit_logs",
      );
      await ownerPool.query(
        "drop function if exists app.sprint3c_test_fail_insert()",
      );
    }
  });
});
