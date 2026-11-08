import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL("docs/planning/SPRINT-3-SCOPE.v1.json", root), "utf8"),
) as { new_tables: string[]; new_api_operations: string[] };
const contract = JSON.parse(
  readFileSync(new URL("docs/api/openapi.json", root), "utf8"),
) as { paths: Record<string, Record<string, { operationId?: string }>> };
const operations = Object.values(contract.paths).flatMap((path) =>
  Object.values(path).flatMap((operation) =>
    operation.operationId ? [operation.operationId] : [],
  ),
);
const controller = readFileSync(
  new URL("apps/api/src/incidents/incident.controller.ts", root),
  "utf8",
);
const migration = readFileSync(
  new URL("apps/api/src/database/migrations/007-location-permissions.ts", root),
  "utf8",
);
const databaseMigration = readFileSync(
  new URL("apps/api/src/database/migrations/004-incidents.ts", root),
  "utf8",
);
const expectedSprint3 = [
  "listIncidents",
  "createIncident",
  "getIncident",
  "updateIncident",
  "transitionIncident",
  "listLocations",
  "createLocation",
];
const newLocationPermissions = ["listLocations", "createLocation"];
const tables = ["incidents", "incident_locations", "change_events"];
if (
  new Set(manifest.new_tables).size !== 3 ||
  JSON.stringify([...manifest.new_tables].sort()) !==
    JSON.stringify([...tables].sort()) ||
  new Set(manifest.new_api_operations).size !== 7 ||
  JSON.stringify([...manifest.new_api_operations].sort()) !==
    JSON.stringify([...expectedSprint3].sort()) ||
  operations.length !== 75 ||
  new Set(operations).size !== 75 ||
  newLocationPermissions.some(
    (permission) => !operations.includes(permission),
  ) ||
  !controller.includes("listLocations(") ||
  !controller.includes("createLocation(") ||
  !migration.includes('"listLocations"') ||
  !migration.includes('"createLocation"') ||
  /create\s+table/i.test(migration) ||
  !databaseMigration.includes("create table app.incident_locations") ||
  !databaseMigration.includes("create table app.change_events")
) {
  throw new Error("Sprint 3-C scope or frozen contract inventory mismatch");
}
process.stdout.write(
  "Sprint 3-C scope passed: frozen 3-table/7-operation Sprint 3 inventory; 75 OpenAPI operation IDs; only listLocations/createLocation added in 3-C, with no table DDL.\n",
);
