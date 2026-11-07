import { readFileSync } from "node:fs";
import { sql } from "kysely";
import {
  connectDatabase,
  tenantTransaction,
} from "../apps/api/src/database/connection.js";
import { IncidentService } from "../apps/api/src/incidents/incident.service.js";
import type { IdentityService } from "../apps/api/src/identity/identity.service.js";

const state = JSON.parse(
  readFileSync(process.env.PBSSU_TEST_DATABASE_STATE!, "utf8"),
) as { runtimeUrl: string };
process.env.DATABASE_URL = state.runtimeUrl;
process.env.IDENTITY_DATABASE_URL = process.env.PBSSU_IDENTITY_DATABASE_URL;
process.env.PBSSU_IDENTITY_KEY_FILE = process.env.PBSSU_MISSING_KEY_FILE;
const org = process.env.PBSSU_TEST_ORG!;
const actor = process.env.PBSSU_TEST_ACTOR!;
const incident = process.env.PBSSU_TEST_INCIDENT!;
const identity = {
  authenticateAccessToken: async () => ({
    userId: actor,
    assurance: "MFA" as const,
  }),
} as unknown as IdentityService;
const service = new IncidentService(identity);
let rejected = false;
try {
  await service.transitionIncident("test", org, incident, {
    base_version: Number(process.env.PBSSU_TEST_VERSION),
    target: "CANCELLED",
    reason: "Synthetic encryption failure rollback probe",
  });
} catch {
  rejected = true;
}
const db = connectDatabase(state.runtimeUrl, 1);
try {
  const result = await tenantTransaction(db, org, actor, (tx) =>
    sql<{
      status: string;
      version: number;
      event_count: number;
      audit_count: number;
    }>`
    select i.status,i.version,
      (select count(*)::int from app.change_events e where e.organization_id=${org} and e.incident_id=${incident}) event_count,
      (select count(*)::int from app.audit_logs a where a.organization_id=${org} and a.resource_id=${incident} and a.action='transitionIncident') audit_count
    from app.incidents i where i.organization_id=${org} and i.id=${incident}
  `.execute(tx),
  );
  const row = result.rows[0];
  if (
    !rejected ||
    !row ||
    row.status !== "DRAFT" ||
    row.version !== Number(process.env.PBSSU_TEST_VERSION) ||
    row.event_count !== 1 ||
    row.audit_count !== 0
  ) {
    process.stderr.write("Encryption failure rollback verification failed\n");
    process.exitCode = 1;
  } else {
    process.stdout.write(
      "Encryption failure rolled back incident mutation, event and audit writes\n",
    );
  }
} finally {
  await service.onModuleDestroy();
  await db.destroy();
}
