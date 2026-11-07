import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const root = new URL("../", import.meta.url);
const scope = JSON.parse(
  readFileSync(new URL("docs/planning/SPRINT-2-SCOPE.json", root), "utf8"),
) as { tables: string[]; operations: string[]; permissions: string[] };
const contract = JSON.parse(
  readFileSync(new URL("docs/api/openapi.json", root), "utf8"),
) as {
  paths: Record<string, Record<string, { operationId: string }>>;
};
const openApiIds = new Set(
  Object.values(contract.paths).flatMap((path) =>
    Object.values(path).map((operation) => operation.operationId),
  ),
);
assert.deepEqual(scope.tables, ["vehicles"]);
assert.deepEqual(scope.operations, [
  "listVehicles",
  "createVehicle",
  "updateVehicle",
]);
assert.deepEqual(scope.permissions, scope.operations);
assert(scope.operations.every((operation) => openApiIds.has(operation)));
process.stdout.write(
  "Sprint 2 scope: 1 table / 3 operations / 3 exact permission keys\n",
);
