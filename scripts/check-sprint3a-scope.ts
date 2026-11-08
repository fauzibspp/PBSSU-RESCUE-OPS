import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL("docs/planning/SPRINT-3-SCOPE.v1.json", root), "utf8"),
) as { new_tables: string[]; new_api_operations: string[] };
const migration = readFileSync(
  new URL("apps/api/src/database/migrations/004-incidents.ts", root),
  "utf8",
);
const openApi = JSON.parse(
  readFileSync(new URL("docs/api/openapi.json", root), "utf8"),
) as { paths: Record<string, Record<string, { operationId: string }>> };
const baseline = JSON.parse(
  execFileSync(
    "git",
    ["show", "50233f511813d45837d237e260a0fb9d8a61d609:docs/api/openapi.json"],
    { encoding: "utf8" },
  ),
) as { paths: Record<string, Record<string, { operationId: string }>> };
const collect = (contract: typeof openApi) =>
  Object.values(contract.paths)
    .flatMap((methods) => Object.values(methods))
    .map((operation) => operation.operationId)
    .sort();
const createdTables = [
  ...migration.matchAll(/create table app\.([a-z_]+)/gi),
].map((match) => match[1]);
assert.deepEqual(manifest.new_tables, [
  "incidents",
  "incident_locations",
  "change_events",
]);
assert.deepEqual(createdTables, manifest.new_tables);
assert.equal(manifest.new_api_operations.length, 7);
assert.deepEqual(collect(openApi), collect(baseline));
assert(
  manifest.new_api_operations.every((operation) =>
    collect(openApi).includes(operation),
  ),
  "all seven frozen Sprint 3 operations remain in the contract",
);
assert.equal(
  /insert\s+into\s+app\.permissions/i.test(migration),
  false,
  "Sprint 3-A must not add permission keys",
);
process.stdout.write(
  "Sprint 3-A scope: exactly 3 tables; 75 API operation IDs unchanged; no permission seed.\n",
);
