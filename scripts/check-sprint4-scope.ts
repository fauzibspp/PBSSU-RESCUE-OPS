import { readFileSync } from "node:fs";

interface OpenApiOperation {
  operationId?: string;
  "x-permission"?: string;
}
interface Scope {
  inventory: {
    new_tables: { name: string; status: string }[];
    candidate_operations: {
      operationId: string;
      permissionKey: string;
      group: string;
    }[];
  };
  counts: {
    newTables: number;
    existingOperations: number;
    newOperationIds: number;
  };
  scope_freeze: { status: string };
}

const openapi = JSON.parse(readFileSync("docs/api/openapi.json", "utf8")) as {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: { schemas: Record<string, Record<string, unknown>> };
};
const scope = JSON.parse(
  readFileSync("docs/planning/SPRINT-4-SCOPE.v1.json", "utf8"),
) as Scope;
const operations = Object.values(openapi.paths).flatMap((path) =>
  Object.values(path).filter(
    (value) => value && typeof value === "object" && "operationId" in value,
  ),
);
const ids = operations.map((operation) => operation.operationId);
const sprint4 = [
  ["getAssignments", "getAssignments", "G-04"],
  ["setAssignments", "setAssignments", "G-06"],
  ["listMovements", "listMovements", "G-04"],
  ["createMovement", "createMovement", "G-07"],
] as const;
const tableNames = ["incident_personnel", "incident_vehicles", "movement_logs"];

if (ids.length !== 75 || new Set(ids).size !== 75)
  throw new Error("OpenAPI operation inventory must contain 75 unique IDs");
if (
  JSON.stringify(scope.inventory.new_tables.map((table) => table.name)) !==
    JSON.stringify(tableNames) ||
  scope.inventory.new_tables.some((table) => table.status !== "FROZEN") ||
  scope.counts.newTables !== 3 ||
  scope.counts.existingOperations !== 4 ||
  scope.counts.newOperationIds !== 0 ||
  scope.scope_freeze.status !== "FROZEN"
)
  throw new Error("Sprint 4 frozen table inventory/counts are inconsistent");
if (
  JSON.stringify(
    scope.inventory.candidate_operations.map(
      (operation) => operation.operationId,
    ),
  ) !== JSON.stringify(sprint4.map(([id]) => id))
)
  throw new Error(
    "Sprint 4 operation manifest differs from approved inventory",
  );
for (const [operationId, permissionKey, group] of sprint4) {
  const operation = operations.find((item) => item.operationId === operationId);
  const frozen = scope.inventory.candidate_operations.find(
    (item) => item.operationId === operationId,
  );
  if (
    !operation ||
    operation["x-permission"] !== permissionKey ||
    frozen?.permissionKey !== permissionKey ||
    frozen.group !== group
  )
    throw new Error(
      `Sprint 4 operation/permission parity failed for ${operationId}`,
    );
}
const assignmentInput = openapi.components.schemas.AssignmentInput;
if (
  assignmentInput?.properties &&
  typeof assignmentInput.properties === "object" &&
  "duty" in assignmentInput.properties
)
  throw new Error("AssignmentInput must remain free of duty");
const personnelAssignment = openapi.components.schemas.PersonnelAssignment;
if (
  !Array.isArray(personnelAssignment?.required) ||
  personnelAssignment.required.includes("duty")
)
  throw new Error("PersonnelAssignment.duty must remain optional");

process.stdout.write(
  "Sprint 4 scope PASS: 75 unique OpenAPI operations; exact frozen 3-table/4-existing-operation scope; G-04/G-06/G-07 key parity; optional output duty and no request duty.\n",
);
