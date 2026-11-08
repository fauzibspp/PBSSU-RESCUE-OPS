import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";

const root = new URL("../../../", import.meta.url);
const normalizedFingerprint = (source: string) =>
  createHash("sha256").update(source.replaceAll("\r\n", "\n")).digest("hex");
const matchesApprovedFingerprint = (source: string, expected: string) =>
  normalizedFingerprint(source) === expected;
const scope = JSON.parse(
  readFileSync(new URL("docs/planning/M01-SCOPE.json", root), "utf8"),
) as {
  tables: string[];
  operations: string[];
};
const sprint2Scope = JSON.parse(
  readFileSync(new URL("docs/planning/SPRINT-2-SCOPE.json", root), "utf8"),
) as {
  tables: string[];
  operations: string[];
  permissions: string[];
  approved_documentation_delta: Record<string, string>;
};
const uf01Scope = JSON.parse(
  readFileSync(new URL("docs/planning/UF-01-SCOPE.v1.json", root), "utf8"),
) as {
  status: string;
  product_ui_implementation_authorized: boolean;
  contract_baseline: {
    operation_count: number;
    new_operations: string[];
    new_permissions: string[];
    new_database_entities: string[];
  };
  increments: Array<{
    routes: string[];
    existing_operations: string[];
  }>;
};
const contract = JSON.parse(
  readFileSync(new URL("docs/api/openapi.json", root), "utf8"),
) as {
  components: { schemas: Record<string, object> };
  paths: Record<
    string,
    Record<
      string,
      {
        operationId: string;
        "x-authorization-domain": string;
        "x-permission": string;
        responses?: Record<
          string,
          {
            content?: Record<string, { schema?: { $ref?: string } }>;
          }
        >;
      }
    >
  >;
};
const freeze = JSON.parse(
  readFileSync(new URL("docs/planning/FOUNDATION-FREEZE.json", root), "utf8"),
) as {
  files: Record<string, string>;
};
const contractDelta = JSON.parse(
  readFileSync(new URL("docs/testing/M01-CONTRACT-DELTA.json", root), "utf8"),
) as { files: Record<string, string> };
const sprint3ContractDelta = JSON.parse(
  readFileSync(
    new URL("docs/testing/SPRINT-3-CONTRACT-DELTA.json", root),
    "utf8",
  ),
) as { files: Record<string, string> };
const sprint3DocumentationDelta = JSON.parse(
  readFileSync(
    new URL("docs/testing/SPRINT-3-DOCUMENTATION-DELTA.json", root),
    "utf8",
  ),
) as { files: Record<string, string> };
const sprint3BDocumentationDelta = JSON.parse(
  readFileSync(
    new URL(
      "../../../docs/testing/SPRINT-3B-DOCUMENTATION-DELTA.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as { files: Record<string, string> };
const sprint3CDocumentationDelta = JSON.parse(
  readFileSync(
    new URL(
      "../../../docs/testing/SPRINT-3C-DOCUMENTATION-DELTA.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as { files: Record<string, string> };
const sprint3DContractDelta = JSON.parse(
  readFileSync(
    new URL(
      "../../../docs/testing/SPRINT-3D-CONTRACT-DELTA.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as { files: Record<string, string> };
const sprint4ContractDelta = JSON.parse(
  readFileSync(
    new URL("docs/testing/SPRINT-4-CONTRACT-DELTA.json", root),
    "utf8",
  ),
) as { files: Record<string, string> };
const uf01ContractDelta = JSON.parse(
  readFileSync(new URL("docs/testing/UF-01-CONTRACT-DELTA.json", root), "utf8"),
) as { files: Record<string, string> };
const controllerSources = [
  readFileSync(
    new URL("apps/api/src/identity/identity.controller.ts", root),
    "utf8",
  ),
  readFileSync(
    new URL("apps/api/src/organizations/organization.controller.ts", root),
    "utf8",
  ),
  readFileSync(
    new URL("apps/api/src/vehicles/vehicle.controller.ts", root),
    "utf8",
  ),
];

function collectRefs(value: unknown, refs: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, refs);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "$ref" && typeof item === "string") refs.push(item);
      else collectRefs(item, refs);
    }
  }
  return refs;
}

function resolvePointer(document: unknown, reference: string): boolean {
  if (!reference.startsWith("#/")) return false;
  return (
    reference
      .slice(2)
      .split("/")
      .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
      .reduce<unknown>((current, part) => {
        if (!current || typeof current !== "object") return undefined;
        return (current as Record<string, unknown>)[part];
      }, document) !== undefined
  );
}

describe("approved M01 contract boundary", () => {
  it("has precisely the authorized foundation inventory", () => {
    expect(scope.tables).toHaveLength(22);
    expect(new Set(scope.tables).size).toBe(22);
    expect(scope.operations).toHaveLength(40);
    expect(new Set(scope.operations).size).toBe(40);
    const operations = Object.values(contract.paths).flatMap(Object.values);
    expect(
      scope.operations.every((key) =>
        operations.some((operation) => operation.operationId === key),
      ),
    ).toBe(true);
    const authorized = operations.filter((operation) =>
      scope.operations.includes(operation.operationId),
    );
    expect(
      authorized.filter(
        (operation) => operation["x-authorization-domain"] === "TENANT",
      ),
    ).toHaveLength(12);
    expect(
      authorized.filter(
        (operation) => operation["x-authorization-domain"] === "PLATFORM",
      ),
    ).toHaveLength(2);
    expect(
      authorized.every(
        (operation) => operation["x-permission"] === operation.operationId,
      ),
    ).toBe(true);
    expect(scope.tables).not.toContain("incidents");
  });

  it("maps only the approved Sprint 2 vehicle delta to OpenAPI and handlers", () => {
    expect(sprint2Scope.tables).toEqual(["vehicles"]);
    expect(sprint2Scope.operations).toEqual([
      "listVehicles",
      "createVehicle",
      "updateVehicle",
    ]);
    expect(sprint2Scope.permissions).toEqual(sprint2Scope.operations);
    const operations = Object.values(contract.paths).flatMap(Object.values);
    for (const operationId of sprint2Scope.operations) {
      expect(
        operations.some(
          (operation) =>
            operation.operationId === operationId &&
            operation["x-permission"] === operationId &&
            operation["x-authorization-domain"] === "TENANT",
        ),
        operationId,
      ).toBe(true);
      expect(
        controllerSources.some((source) =>
          new RegExp(`\\b${operationId}\\s*\\(`).test(source),
        ),
      ).toBe(true);
    }
  });

  it("preserves the frozen UF-01 route and existing-operation inventory", () => {
    expect(uf01Scope.status).toBe("FROZEN");
    expect(uf01Scope.product_ui_implementation_authorized).toBe(true);
    expect(uf01Scope.contract_baseline.operation_count).toBe(75);
    expect(uf01Scope.contract_baseline.new_operations).toEqual([]);
    expect(uf01Scope.contract_baseline.new_permissions).toEqual([]);
    expect(uf01Scope.contract_baseline.new_database_entities).toEqual([]);
    const routes = uf01Scope.increments.flatMap(
      (increment) => increment.routes,
    );
    expect(routes).toEqual([
      "/login",
      "/mfa",
      "/mfa/enroll",
      "/app",
      "/app/organizations",
      "/app/incidents",
      "/app/incidents/:incidentId",
    ]);
    const operations = uf01Scope.increments.flatMap(
      (increment) => increment.existing_operations,
    );
    expect(operations).toHaveLength(10);
    expect(new Set(operations).size).toBe(10);
    const documented = Object.values(contract.paths).flatMap(Object.values);
    expect(
      operations.every((operationId) =>
        documented.some((operation) => operation.operationId === operationId),
      ),
    ).toBe(true);
  });

  it("preserves all approved baseline fingerprints", () => {
    for (const [path, expected] of Object.entries(freeze.files)) {
      const source = readFileSync(new URL(path, root), "utf8").replaceAll(
        "\r\n",
        "\n",
      );
      const actual = normalizedFingerprint(source);
      if (path in uf01ContractDelta.files) {
        expect(
          uf01ContractDelta.files[path],
          `${path} authorized UF-01 response-contract reconciliation`,
        ).toBe(actual);
      } else if (path in sprint4ContractDelta.files) {
        expect(
          sprint4ContractDelta.files[path],
          `${path} authorized Sprint 4 contract clarification`,
        ).toBe(actual);
      } else if (path in sprint3DContractDelta.files) {
        expect(
          sprint3DContractDelta.files[path],
          `${path} authorized Sprint 3-D contract clarification`,
        ).toBe(actual);
      } else if (path in sprint3ContractDelta.files) {
        expect(
          sprint3ContractDelta.files[path],
          `${path} approved Sprint 3 contract freeze`,
        ).toBe(actual);
      } else if (path in sprint3CDocumentationDelta.files) {
        expect(
          sprint3CDocumentationDelta.files[path],
          `${path} authorized Sprint 3-C documentation delta`,
        ).toBe(actual);
      } else if (path in sprint3BDocumentationDelta.files) {
        expect(
          sprint3BDocumentationDelta.files[path],
          `${path} authorized Sprint 3-B documentation delta`,
        ).toBe(actual);
      } else if (path in sprint3DocumentationDelta.files) {
        expect(
          sprint3DocumentationDelta.files[path],
          `${path} approved Sprint 3 documentation delta`,
        ).toBe(actual);
      } else if (path in contractDelta.files) {
        expect(contractDelta.files[path], `${path} approved M01 delta`).toBe(
          actual,
        );
      } else if (path in sprint2Scope.approved_documentation_delta) {
        expect(
          sprint2Scope.approved_documentation_delta[path],
          `${path} authorized Sprint 2 planning delta`,
        ).toBe(actual);
      } else {
        expect(matchesApprovedFingerprint(source, expected), path).toBe(true);
      }
    }
  });

  it("rejects a changed synthetic file under the baseline fingerprint guard", () => {
    const approvedFixture =
      "# Synthetic agent rules\r\nNever bypass tenant isolation.\r\n";
    const expected = normalizedFingerprint(approvedFixture);
    expect(matchesApprovedFingerprint(approvedFixture, expected)).toBe(true);
    expect(
      matchesApprovedFingerprint(
        approvedFixture.replace("Never bypass", "Always bypass"),
        expected,
      ),
    ).toBe(false);
  });

  it("resolves every OpenAPI reference and maps every scoped operation to a controller", () => {
    const references = collectRefs(contract);
    expect(references.length).toBeGreaterThan(0);
    expect(
      references.every((reference) => resolvePointer(contract, reference)),
    ).toBe(true);
    for (const operationId of scope.operations) {
      expect(
        controllerSources.some((source) =>
          new RegExp(`\\b${operationId}\\s*\\(`).test(source),
        ),
        operationId,
      ).toBe(true);
    }
  });

  it("compiles every OpenAPI 3.1 component schema as JSON Schema 2020-12", () => {
    const validator = new Ajv2020({ strict: false, validateFormats: false });
    validator.addSchema({
      ...contract,
      $id: "https://pbssu.invalid/openapi.json",
    });
    for (const name of Object.keys(contract.components.schemas)) {
      expect(() =>
        validator.compile({
          $ref: `https://pbssu.invalid/openapi.json#/components/schemas/${name}`,
        }),
      ).not.toThrow();
    }
  });

  it("keeps Sprint 4 duty optional and nullable without adding it to assignment input", () => {
    const validator = new Ajv2020({ strict: false, validateFormats: false });
    validator.addSchema({
      ...contract,
      $id: "https://pbssu.invalid/openapi.json",
    });
    const personnel = validator.compile({
      $ref: "https://pbssu.invalid/openapi.json#/components/schemas/PersonnelAssignment",
    });
    const input = validator.compile({
      $ref: "https://pbssu.invalid/openapi.json#/components/schemas/AssignmentInput",
    });
    const base = {
      id: "11111111-1111-4111-8111-111111111111",
      membership_id: "22222222-2222-4222-8222-222222222222",
      assigned_at: "2026-11-08T00:00:00Z",
    };
    expect(personnel(base)).toBe(true);
    expect(personnel({ ...base, duty: null })).toBe(true);
    expect(personnel({ ...base, duty: "Responder" })).toBe(true);
    expect(personnel({ ...base, duty: "" })).toBe(false);
    expect(personnel({ ...base, duty: 3 })).toBe(false);
    expect(
      input({ base_version: 1, membership_ids: [], vehicle_ids: [] }),
    ).toBe(true);
    expect(
      input({
        base_version: 1,
        membership_ids: [],
        vehicle_ids: [],
        duty: "x",
      }),
    ).toBe(false);
  });

  it("pairs LocationInput point and accuracy without changing shared Point semantics", () => {
    const validator = new Ajv2020({ strict: false, validateFormats: false });
    validator.addSchema({
      ...contract,
      $id: "https://pbssu.invalid/openapi.json",
    });
    const locationInput = validator.compile({
      $ref: "https://pbssu.invalid/openapi.json#/components/schemas/LocationInput",
    });
    const location = validator.compile({
      $ref: "https://pbssu.invalid/openapi.json#/components/schemas/Location",
    });
    const observationInput = validator.compile({
      $ref: "https://pbssu.invalid/openapi.json#/components/schemas/ObservationInput",
    });
    const base = { base_version: 1, label: "Synthetic point" };

    expect(locationInput(base)).toBe(true);
    expect(
      locationInput({
        ...base,
        point: { longitude: 101.68, latitude: 3.14, accuracy_m: 8.5 },
      }),
    ).toBe(true);
    expect(
      locationInput({
        ...base,
        point: { longitude: 101.68, latitude: 3.14 },
      }),
    ).toBe(false);
    expect(locationInput({ ...base, accuracy_m: 8.5 })).toBe(false);
    expect(locationInput({ ...base, point: null })).toBe(false);
    expect(
      locationInput({
        ...base,
        point: { longitude: 101.68, latitude: 3.14, accuracy_m: null },
      }),
    ).toBe(false);
    expect(
      locationInput({
        ...base,
        point: { longitude: 181, latitude: 3.14, accuracy_m: 8.5 },
      }),
    ).toBe(false);
    expect(
      locationInput({
        ...base,
        point: { longitude: 101.68, latitude: -91, accuracy_m: 8.5 },
      }),
    ).toBe(false);
    expect(
      locationInput({
        ...base,
        point: { longitude: 101.68, latitude: 3.14, accuracy_m: -0.1 },
      }),
    ).toBe(false);

    const responseBase = {
      id: "11111111-1111-4111-8111-111111111111",
      version: 1,
      created_at: "2026-11-08T00:00:00Z",
      organization_id: "22222222-2222-4222-8222-222222222222",
      incident_id: "33333333-3333-4333-8333-333333333333",
      label: "Synthetic point",
    };
    expect(location(responseBase)).toBe(true);
    expect(
      location({
        ...responseBase,
        point: { longitude: 101.68, latitude: 3.14, accuracy_m: 8.5 },
      }),
    ).toBe(true);
    expect(
      observationInput({
        id: "44444444-4444-4444-8444-444444444444",
        location_id: "55555555-5555-4555-8555-555555555555",
        observation: "Synthetic observation",
        risk: "LOW",
        occurred_at: "2026-11-08T00:00:00Z",
        point: { longitude: 101.68, latitude: 3.14 },
      }),
    ).toBe(true);
  });

  it("accepts closed handoff metadata and rejects generic credential injection", () => {
    const validator = new Ajv2020({ strict: false, validateFormats: false });
    const check = validator.compile({
      $ref: "#/components/schemas/GenericAccepted",
      components: contract.components,
    });
    const metadata = {
      status: "REQUEST_ACCEPTED",
      correlation_id: "11111111-1111-4111-8111-111111111111",
    };
    expect(check(metadata)).toBe(true);
    expect(
      check({ ...metadata, refresh_token: "SYNTHETIC_NOT_A_CREDENTIAL" }),
    ).toBe(false);
  });

  it("documents the exact metadata-only MFA enrollment and replacement responses", () => {
    const validator = new Ajv2020({ strict: false, validateFormats: false });
    validator.addSchema({
      ...contract,
      $id: "https://pbssu.invalid/openapi.json",
    });
    const enrollment = validator.compile({
      $ref: "https://pbssu.invalid/openapi.json#/components/schemas/MfaEnrollment",
    });
    const replacement = validator.compile({
      $ref: "https://pbssu.invalid/openapi.json#/components/schemas/MfaReplacement",
    });
    const uuid = "11111111-1111-4111-8111-111111111111";
    const handoff = {
      handoff_id: "22222222-2222-4222-8222-222222222222",
      purpose: "TOTP_SETUP",
      expires_at: "2026-11-08T00:05:00Z",
    };
    expect(
      enrollment({
        enrollment_id: uuid,
        handoff,
        authentication_state: "CHALLENGE_REQUIRED",
      }),
    ).toBe(true);
    expect(
      enrollment({
        enrollment_id: uuid,
        handoff,
        authentication_state: "CHALLENGE_REQUIRED",
        secret: "SYNTHETIC_FORBIDDEN",
      }),
    ).toBe(false);
    expect(
      enrollment({
        enrollment_id: uuid,
        authentication_state: "CHALLENGE_REQUIRED",
      }),
    ).toBe(false);
    expect(
      replacement({
        challenge_id: uuid,
        purpose: "FACTOR_REPLACE",
        expires_at: "2026-11-08T00:05:00Z",
        attempts_remaining: 5,
        authentication_state: "CHALLENGE_REQUIRED",
        next_action: "CONFIRM_REPLACEMENT",
        enrollment_id: uuid,
        handoff,
      }),
    ).toBe(true);
    expect(
      replacement({
        challenge_id: uuid,
        purpose: "FACTOR_REPLACE",
        expires_at: "2026-11-08T00:05:00Z",
        attempts_remaining: 5,
        authentication_state: "CHALLENGE_REQUIRED",
        next_action: "VERIFY_MFA",
        enrollment_id: uuid,
        handoff,
      }),
    ).toBe(false);
    expect(
      contract.paths["/auth/mfa/enrollments"]?.post?.responses?.["202"]
        ?.content?.["application/json"]?.schema?.$ref,
    ).toBe("#/components/schemas/MfaEnrollment");
    expect(
      contract.paths["/auth/mfa/replacement"]?.post?.responses?.["202"]
        ?.content?.["application/json"]?.schema?.$ref,
    ).toBe("#/components/schemas/MfaReplacement");
  });

  it("documents self-membership responses without changing administrative membership schemas", () => {
    const validator = new Ajv2020({ strict: false, validateFormats: false });
    validator.addSchema({
      ...contract,
      $id: "https://pbssu.invalid/openapi.json",
    });
    const page = validator.compile({
      $ref: "https://pbssu.invalid/openapi.json#/components/schemas/MyMembershipPage",
    });
    const uuid = "11111111-1111-4111-8111-111111111111";
    const membership = {
      membership_id: uuid,
      organization_id: "22222222-2222-4222-8222-222222222222",
      organization_name: "Synthetic Rescue Unit",
      organization_slug: "synthetic-rescue-unit",
      organization_status: "ACTIVE",
      display_name: "Synthetic Member",
      status: "ACTIVE",
      availability: "AVAILABLE",
      roles: [{ code: "INCIDENT_COMMANDER", name: "Incident Commander" }],
    };
    expect(page({ items: [membership], next_cursor: null })).toBe(true);
    expect(
      page({
        items: [
          Object.fromEntries(
            Object.entries(membership).filter(([key]) => key !== "roles"),
          ),
        ],
        next_cursor: null,
      }),
    ).toBe(false);
    expect(
      page({
        items: [
          { ...membership, roles: [{ code: "invalid role", name: "x" }] },
        ],
        next_cursor: null,
      }),
    ).toBe(false);
    expect(
      page({
        items: [
          {
            ...membership,
            roles: [{ code: "CUSTOM_AID", name: "Local role" }],
          },
        ],
        next_cursor: null,
      }),
    ).toBe(true);
    expect(
      page({ items: [{ ...membership, role_ids: [uuid] }], next_cursor: null }),
    ).toBe(false);
    expect(
      validator.compile({
        $ref: "https://pbssu.invalid/openapi.json#/components/schemas/Membership",
      })({
        id: uuid,
        version: 1,
        created_at: "2026-11-08T00:00:00Z",
        organization_id: membership.organization_id,
        user_id: "33333333-3333-4333-8333-333333333333",
        display_name: "Synthetic Member",
        status: "ACTIVE",
        availability: "AVAILABLE",
        role_ids: [],
      }),
    ).toBe(true);
    expect(
      contract.paths["/me/memberships"]?.get?.responses?.["200"]?.content?.[
        "application/json"
      ]?.schema?.$ref,
    ).toBe("#/components/schemas/MyMembershipPage");
  });
});
