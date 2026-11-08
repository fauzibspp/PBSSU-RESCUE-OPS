# Sprint 4-B Assignment API Validation

**Status:** PASS for the bounded Sprint 4-B assignment operations
**Branch:** `feat/sprint-4-assignment-movement`
**Base:** Sprint 4-A commit `c4e2aec0f4eb7aa6190bd0449ff68c1c6d9ae662`
**Execution date:** 2026-11-08

## Scope

Implemented `getAssignments` (`GET /incidents/{incidentId}/assignments`) and
`setAssignments` (`PUT /incidents/{incidentId}/assignments`) using the frozen
OpenAPI schemas and existing G-04/G-06 permission keys. No tables, migrations,
permissions, or operations were added. `AssignmentInput` remains unchanged and
contains no duty field. Assignment changes use the existing tenant transaction,
restricted runtime role, RLS, incident version, and audit log. The approved
Sprint 4 design does not extend `change_events` for assignments.

Responders must be active members of the selected organization and hold the
explicit `FIELD_RESPONDER` role. Vehicles must be selected-tenant `AVAILABLE`
vehicles. No availability or duty state is inferred. Database uniqueness
constraints arbitrate active responder and vehicle conflicts; the application
does not pre-query other tenants. PostgreSQL uniqueness and reference conflicts
are mapped to a stable generic `409 CONFLICT` without conflicting resource
identifiers.

## Executed checks

| Command | Result |
| --- | --- |
| `npm run test:integration -- apps/api/test/incident.http.integration.test.ts` | PASS: 1 file, 6 tests; real Nest HTTP, JWT/session/MFA, selected-tenant RBAC and restricted runtime database. Covers assignment read/write, Operator write, Admin write denial, responder assigned-only concealment, release/re-add history, no-op version stability, same-incident concurrent replacement (`200` plus stale-version `409`), generic uniqueness conflict and conflict-field redaction. |
| `npm run test:integration` | PASS: 6 files, 42 tests, including Sprint 4-A RLS/global uniqueness and M01/Sprint 2/Sprint 3 regression suites. |
| `npm test -- --run` | PASS: 2 files, 19 tests. |
| `npm run typecheck` | PASS. |
| `npm run lint` | PASS. |
| `npm run build` | PASS. |
| `npm run format` | PASS; formatted the changed TypeScript files. |
| `npm run scope:sprint4a` | PASS: 75 OpenAPI operations and exact frozen three-table/four-existing-operation inventory; permission parity and no duty in `AssignmentInput`. |
| `git diff --check` | PASS. |

The integration suite used the existing isolated synthetic Sprint 4-A database
state `.cache/sprint4a/fb8d8c4f203f.json`. No Docker resource or migration was
changed for Sprint 4-B. The full integration suite independently exercises the
database-enforced global active-user uniqueness race across organizations; the
HTTP test verifies generic conflict normalization and does not disclose the
already-assigned user's or incident's identifier.

## Behavior and limits

- Complete assignment sets are accepted only for DRAFT/OPEN incidents and use
  `base_version` under an incident row lock. Changed sets increment the version
  once; identical sets are no-ops.
- Empty arrays explicitly release active intervals before DISPATCHED. Released
  rows remain in the response/history; re-addition creates new interval IDs.
- The mutation and audit write share one transaction. Any SQL/audit failure
  rolls back the assignment and version mutation.
- Sprint 4-B does not implement movement operations, DISPATCHED transition
  prerequisites, vehicle-state update guards, post-dispatch release, or
  `change_events` assignment events. Those remain later authorized gates.
- The existing HTTP fixture performs one concurrent same-incident replacement
  race. Cross-organization simultaneous uniqueness is verified by the S4-A
  restricted-role database test, while HTTP verifies generic conflict mapping.
- Production logging, KMS/key rotation, database recovery, retention, deployment
  ownership, and client readiness are not established by this milestone.

M01-R01, Q-05, Q-06, Q-08, production key management/logging, and the deferred
Auditor cancellation-reason view remain open.
