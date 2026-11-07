import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const scope = JSON.parse(
  readFileSync(new URL("docs/planning/SPRINT-3-SCOPE.v1.json", root), "utf8"),
) as { new_tables: string[]; new_api_operations: string[] };
const openApi = JSON.parse(
  readFileSync(new URL("docs/api/openapi.json", root), "utf8"),
) as { paths: Record<string, Record<string, { operationId: string }>> };
const frozen = JSON.parse(
  execFileSync(
    "git",
    ["show", "50233f511813d45837d237e260a0fb9d8a61d609:docs/api/openapi.json"],
    { encoding: "utf8" },
  ),
) as typeof openApi;
const operations = (contract: typeof openApi) =>
  Object.values(contract.paths)
    .flatMap((path) => Object.values(path).map((op) => op.operationId))
    .sort();
const expectedPermissions = [
  "createIncident",
  "getIncident",
  "listIncidents",
  "transitionIncident",
  "updateIncident",
];
const permissionMigration = readFileSync(
  new URL("apps/api/src/database/migrations/005-incident-permissions.ts", root),
  "utf8",
);
const auditMigration = readFileSync(
  new URL(
    "apps/api/src/database/migrations/006-protected-cancellation-audit.ts",
    root,
  ),
  "utf8",
);
const controller = readFileSync(
  new URL("apps/api/src/incidents/incident.controller.ts", root),
  "utf8",
);
assert.deepEqual(scope.new_tables, [
  "incidents",
  "incident_locations",
  "change_events",
]);
assert.deepEqual(
  operations(openApi),
  operations(frozen),
  "frozen API operation inventory changed",
);
assert.equal(scope.new_api_operations.length, 7);
assert.deepEqual(
  expectedPermissions.sort(),
  [
    ...permissionMigration.matchAll(
      /\["(listIncidents|createIncident|getIncident|updateIncident|transitionIncident)"/g,
    ),
  ]
    .map((m) => m[1])
    .sort(),
);
assert.equal(
  (controller.match(/@(?:Get|Post|Patch)\("\/incidents/g) ?? []).length,
  5,
);
assert.match(auditMigration, /A256GCM/);
assert.match(auditMigration, /audit_logs_metadata_check/);
assert.doesNotMatch(auditMigration, /create\s+table/i);
process.stdout.write(
  "Sprint 3-B scope: 5 permission keys, 5 incident operations, no API/table expansion, frozen 75-operation contract unchanged.\n",
);
