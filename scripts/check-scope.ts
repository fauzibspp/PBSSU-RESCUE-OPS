import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const root = new URL("../", import.meta.url);
const scope = JSON.parse(
  readFileSync(new URL("docs/planning/M01-SCOPE.json", root), "utf8"),
) as {
  baseline: string;
  tables: string[];
  operations: string[];
};
const contract = JSON.parse(
  readFileSync(new URL("docs/api/openapi.json", root), "utf8"),
) as {
  paths: Record<string, Record<string, { operationId: string }>>;
};
assert.equal(scope.tables.length, 22);
assert.equal(new Set(scope.tables).size, 22);
assert.equal(scope.operations.length, 40);
assert.equal(new Set(scope.operations).size, 40);
const operations = new Set(
  Object.values(contract.paths).flatMap((methods) =>
    Object.values(methods).map((operation) => operation.operationId),
  ),
);
assert(scope.operations.every((operation) => operations.has(operation)));
assert(scope.tables.includes("credential_handoffs"));
assert(scope.operations.includes("redeemCredentialHandoff"));
process.stdout.write("M01 scope: 22 tables / 40 approved operations\n");
