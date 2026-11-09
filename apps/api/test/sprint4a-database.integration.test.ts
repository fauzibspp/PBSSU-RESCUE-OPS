import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

interface State {
  scope: string;
  ownerUrl: string;
  runtimeUrl: string;
}

const state = JSON.parse(
  readFileSync(
    process.env.PBSSU_TEST_DATABASE_STATE ??
      new URL("../../../.cache/sprint4a/database.json", import.meta.url),
    "utf8",
  ),
) as State;
if (state.scope !== "sprint4a")
  throw new Error("Invalid Sprint 4-A test scope");

const owner = new Pool({ connectionString: state.ownerUrl, max: 2 });
const runtime = new Pool({ connectionString: state.runtimeUrl, max: 4 });
const orgA: string = randomUUID();
const orgB: string = randomUUID();
const userA = randomUUID();
const actorB = randomUUID();
const memberA = randomUUID();
const memberB = randomUUID();
const actorMemberB = randomUUID();
const incidentA = randomUUID();
const incidentB = randomUUID();
const locationA = randomUUID();
const vehicleA = randomUUID();
const vehicleB = randomUUID();
const assignmentA = randomUUID();
const assignmentB = randomUUID();
const vehicleAssignmentA = randomUUID();
const vehicleAssignmentB = randomUUID();
const movementB = randomUUID();
let activeResponderAssignmentId: string = assignmentA;
let activeResponderOrganizationId = orgA;
let activeResponderActorId = userA;

async function inTenant<T>(
  pool: Pool,
  organizationId: string,
  actorId: string,
  action: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "select set_config('app.organization_id',$1,true),set_config('app.actor_user_id',$2,true)",
      [organizationId, actorId],
    );
    const result = await action(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

describe("Sprint 4-A PostgreSQL tenant assignments and movement integrity", () => {
  beforeAll(async () => {
    await owner.query(
      `insert into app.users(id,email_normalized,email_ciphertext,email_verified_at,status)
       values ($1,$2,'synthetic-ciphertext',now(),'ACTIVE'),
              ($3,$4,'synthetic-ciphertext',now(),'ACTIVE')`,
      [userA, `${userA}@example.invalid`, actorB, `${actorB}@example.invalid`],
    );
    for (const [org, suffix] of [
      [orgA, "s4a-alpha"],
      [orgB, "s4a-bravo"],
    ] as const) {
      await inTenant(owner, org, userA, async (client) => {
        await client.query(
          "insert into app.organizations(id,slug,name,status) values($1,$2,$3,'ACTIVE')",
          [org, `${suffix}-${org.slice(0, 8)}`, `Synthetic ${suffix}`],
        );
      });
    }
    await inTenant(owner, orgA, userA, async (client) => {
      await client.query(
        `insert into app.memberships(id,organization_id,user_id,display_name,status,activated_at)
         values($1,$2,$3,'Synthetic responder A','ACTIVE',now())`,
        [memberA, orgA, userA],
      );
      await client.query(
        `insert into app.incidents(id,organization_id,title,category,occurred_at,source_kind)
         values($1,$2,'Synthetic incident A','FLOOD_MONITORING',now(),'TEST')`,
        [incidentA, orgA],
      );
      await client.query(
        `insert into app.incident_locations(id,organization_id,incident_id,label)
         values($1,$2,$3,'Synthetic location A')`,
        [locationA, orgA, incidentA],
      );
      await client.query(
        `insert into app.vehicles(id,organization_id,call_sign,kind)
         values($1,$2,'S4A-A','RESCUE')`,
        [vehicleA, orgA],
      );
    });
    await inTenant(owner, orgB, userA, async (client) => {
      await client.query(
        `insert into app.memberships(id,organization_id,user_id,display_name,status,activated_at)
         values($1,$2,$3,'Synthetic responder B','ACTIVE',now()),
               ($4,$2,$5,'Synthetic actor B','ACTIVE',now())`,
        [memberB, orgB, userA, actorMemberB, actorB],
      );
      await client.query(
        `insert into app.incidents(id,organization_id,title,category,occurred_at,source_kind)
         values($1,$2,'Synthetic incident B','FLOOD_MONITORING',now(),'TEST')`,
        [incidentB, orgB],
      );
      await client.query(
        `insert into app.vehicles(id,organization_id,call_sign,kind)
         values($1,$2,'S4A-B','RESCUE')`,
        [vehicleB, orgB],
      );
      await client.query(
        `insert into app.incident_personnel(id,organization_id,incident_id,membership_id,user_id)
         values($1,$2,$3,$4,$5)`,
        [assignmentB, orgB, incidentB, actorMemberB, actorB],
      );
      await client.query(
        `insert into app.incident_vehicles(id,organization_id,incident_id,vehicle_id)
         values($1,$2,$3,$4)`,
        [vehicleAssignmentB, orgB, incidentB, vehicleB],
      );
      await client.query(
        `insert into app.movement_logs(id,organization_id,incident_id,incident_vehicle_id,kind,occurred_at,actor_membership_id)
         values($1,$2,$3,$4,'DEPARTURE',now(),$5)`,
        [movementB, orgB, incidentB, vehicleAssignmentB, actorMemberB],
      );
    });
  });

  afterAll(async () => {
    await runtime.end();
    await owner.end();
  });

  it("enforces RLS for absent and selected tenant context", async () => {
    const noContext = await runtime.query(
      "select id from app.incident_personnel",
    );
    expect(noContext.rows).toHaveLength(0);
    const tenantAReads = await inTenant(
      runtime,
      orgA,
      userA,
      async (client) => {
        const incident = await client.query(
          "select id from app.incidents where id=$1",
          [incidentB],
        );
        const assignment = await client.query(
          "select id from app.incident_personnel where id=$1",
          [assignmentB],
        );
        const vehicle = await client.query(
          "select id from app.incident_vehicles where id=$1",
          [vehicleAssignmentB],
        );
        const movement = await client.query(
          "select id from app.movement_logs where id=$1",
          [movementB],
        );
        const attemptedUpdate = await client.query(
          "update app.incident_personnel set released_at=now() where id=$1",
          [assignmentB],
        );
        return { incident, assignment, vehicle, movement, attemptedUpdate };
      },
    );
    expect(tenantAReads.incident.rows).toHaveLength(0);
    expect(tenantAReads.assignment.rows).toHaveLength(0);
    expect(tenantAReads.vehicle.rows).toHaveLength(0);
    expect(tenantAReads.movement.rows).toHaveLength(0);
    expect(tenantAReads.attemptedUpdate.rowCount).toBe(0);
    await expect(
      inTenant(runtime, orgB, actorB, (client) =>
        client.query(
          `insert into app.incident_personnel(organization_id,incident_id,membership_id,user_id)
           values($1,$2,$3,$4)`,
          [orgA, incidentA, memberA, userA],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("rejects tenant-mismatched composite references", async () => {
    await expect(
      inTenant(runtime, orgB, actorB, (client) =>
        client.query(
          `insert into app.incident_personnel(organization_id,incident_id,membership_id,user_id)
           values($1,$2,$3,$4)`,
          [orgB, incidentA, memberB, userA],
        ),
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      inTenant(runtime, orgB, actorB, (client) =>
        client.query(
          `insert into app.incident_vehicles(organization_id,incident_id,vehicle_id)
           values($1,$2,$3)`,
          [orgB, incidentB, vehicleA],
        ),
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      inTenant(runtime, orgB, actorB, (client) =>
        client.query(
          `insert into app.movement_logs(organization_id,incident_id,incident_vehicle_id,location_id,kind,occurred_at,actor_membership_id)
           values($1,$2,$3,$4,'ARRIVAL',now(),$5)`,
          [orgB, incidentB, vehicleAssignmentB, locationA, actorMemberB],
        ),
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      inTenant(runtime, orgB, actorB, (client) =>
        client.query(
          `insert into app.incident_personnel(organization_id,incident_id,membership_id,user_id)
           values($1,$2,$3,$4)`,
          [orgB, incidentB, memberA, userA],
        ),
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("enforces globally unique active canonical users under concurrent tenant writes", async () => {
    const attempts = [
      [orgA, userA, incidentA, memberA, assignmentA],
      [orgB, actorB, incidentB, memberB, randomUUID()],
    ] as const;
    const results = await Promise.allSettled(
      attempts.map(([org, actor, incident, membership, id]) =>
        inTenant(runtime, org, actor, (client) =>
          client.query(
            `insert into app.incident_personnel(id,organization_id,incident_id,membership_id,user_id)
             values($1,$2,$3,$4,$5)`,
            [id, org, incident, membership, userA],
          ),
        ),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected")
      expect(rejected.reason).toMatchObject({ code: "23505" });

    const visibleA = await inTenant(runtime, orgA, userA, (client) =>
      client.query(
        "select id from app.incident_personnel where user_id=$1 and released_at is null",
        [userA],
      ),
    );
    const visibleB = await inTenant(runtime, orgB, actorB, (client) =>
      client.query(
        "select id from app.incident_personnel where user_id=$1 and released_at is null",
        [userA],
      ),
    );
    expect(visibleA.rows.length + visibleB.rows.length).toBe(1);
    expect(visibleA.rows.length).toBeLessThanOrEqual(1);
    expect(visibleB.rows.length).toBeLessThanOrEqual(1);
    if (visibleB.rows.length === 1) {
      activeResponderAssignmentId = visibleB.rows[0].id as string;
      activeResponderOrganizationId = orgB;
      activeResponderActorId = actorB;
    }
  });

  it("enforces vehicle uniqueness, one-time release, and retained history", async () => {
    await inTenant(runtime, orgA, userA, (client) =>
      client.query(
        `insert into app.incident_vehicles(id,organization_id,incident_id,vehicle_id)
         values($1,$2,$3,$4)`,
        [vehicleAssignmentA, orgA, incidentA, vehicleA],
      ),
    );
    await expect(
      inTenant(runtime, orgA, userA, (client) =>
        client.query(
          `insert into app.incident_vehicles(organization_id,incident_id,vehicle_id)
           values($1,$2,$3)`,
          [orgA, incidentA, vehicleA],
        ),
      ),
    ).rejects.toMatchObject({ code: "23505" });

    const release = await inTenant(
      runtime,
      activeResponderOrganizationId,
      activeResponderActorId,
      (client) =>
        client.query(
          `update app.incident_personnel set released_at=now()
         where id=$1 and released_at is null`,
          [activeResponderAssignmentId],
        ),
    );
    expect(release.rowCount).toBe(1);
    await expect(
      inTenant(
        runtime,
        activeResponderOrganizationId,
        activeResponderActorId,
        (client) =>
          client.query(
            "update app.incident_personnel set duty='invented' where id=$1",
            [activeResponderAssignmentId],
          ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      inTenant(
        runtime,
        activeResponderOrganizationId,
        activeResponderActorId,
        (client) =>
          client.query(
            "update app.incident_personnel set released_at=now() where id=$1",
            [activeResponderAssignmentId],
          ),
      ),
    ).rejects.toMatchObject({ code: "P0001" });
    const historical = await inTenant(
      runtime,
      activeResponderOrganizationId,
      activeResponderActorId,
      (client) =>
        client.query(
          "select released_at,duty from app.incident_personnel where id=$1",
          [activeResponderAssignmentId],
        ),
    );
    expect(historical.rows[0]?.released_at).not.toBeNull();
    expect(historical.rows[0]?.duty).toBeNull();
  });

  it("keeps movement rows append-only for the restricted runtime role", async () => {
    const movement = randomUUID();
    await inTenant(runtime, orgA, userA, async (client) => {
      await client.query(
        `insert into app.movement_logs(id,organization_id,incident_id,incident_vehicle_id,kind,occurred_at,actor_membership_id)
         values($1,$2,$3,$4,'DEPARTURE',now(),$5)`,
        [movement, orgA, incidentA, vehicleAssignmentA, memberA],
      );
    });
    await expect(
      inTenant(runtime, orgA, userA, (client) =>
        client.query(
          "update app.movement_logs set note='changed' where id=$1",
          [movement],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      inTenant(runtime, orgA, userA, (client) =>
        client.query("delete from app.movement_logs where id=$1", [movement]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      inTenant(owner, orgA, userA, (client) =>
        client.query(
          "update app.movement_logs set note='changed' where id=$1",
          [movement],
        ),
      ),
    ).rejects.toMatchObject({ code: "P0001" });
  });

  it("rolls back a failed assignment transaction without partial rows", async () => {
    const id = randomUUID();
    await expect(
      inTenant(runtime, orgA, userA, async (client) => {
        await client.query(
          `insert into app.incident_personnel(id,organization_id,incident_id,membership_id,user_id)
           values($1,$2,$3,$4,$5)`,
          [id, orgA, incidentA, memberA, userA],
        );
        throw new Error("synthetic transaction failure");
      }),
    ).rejects.toThrow("synthetic transaction failure");
    const result = await inTenant(runtime, orgA, userA, (client) =>
      client.query("select id from app.incident_personnel where id=$1", [id]),
    );
    expect(result.rows).toHaveLength(0);
  });
});
