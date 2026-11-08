# Sprint 4-B Completion Report — Assignment Operations

**Assessment:** PASS for Sprint 4-B scope
**Branch:** `feat/sprint-4-assignment-movement`
**Base commit:** `c4e2aec0f4eb7aa6190bd0449ff68c1c6d9ae662`
**Execution date:** 2026-11-08

## Delivered

- Implemented the two frozen operations: `getAssignments` and `setAssignments`.
- Added authenticated NestJS controller and service integration using the
  existing tenant transaction, exact permission checks, restricted runtime
  database role, and selected-tenant RLS context.
- Assignment eligibility requires an active membership with an explicit
  `FIELD_RESPONDER` role. Vehicles must be in the selected tenant and
  `AVAILABLE`.
- Replacement is limited to DRAFT/OPEN incidents. Incident row locking and
  `base_version` checks serialize replacement; changed commands increment the
  version exactly once, while identical sets leave it unchanged.
- Explicit release preserves assignment intervals; re-addition creates new
  interval IDs. Post-DISPATCHED changes remain denied.
- Database unique conflicts are returned as generic `409 CONFLICT`; no
  cross-tenant lookup is used and conflicting identity/resource IDs are not
  exposed.
- Assignment writes and audit records are atomic. No new migration, table,
  permission, API operation, or `change_events` extension was needed.
- Added real HTTP integration coverage for read/write roles, responder scope,
  release/re-add, no-op behavior, concurrency, and generic conflict redaction.

## Validation

See [Sprint 4-B assignment validation](../testing/SPRINT-4B-ASSIGNMENT-VALIDATION.md)
for exact commands and results. The focused HTTP suite passed 6/6 tests; the
full integration suite passed 42/42 tests across 6 files; unit/contract tests
passed 19/19. Typecheck, lint, build, formatting, frozen scope check, and
`git diff --check` passed.

The 29-table/54-permission migration inventory, FORCE RLS and cross-tenant
uniqueness evidence come from the already accepted Sprint 4-A fresh/repeat
migration and restricted-role tests. Sprint 4-B did not rerun migrations or
alter database resources.

## Remaining phases and gates

Sprint 4-C movement operations and Sprint 4-D DISPATCHED prerequisites and the
`updateVehicle` active-assignment guard remain authorized but not completed in
this checkpoint. No external dispatch, arrival verification, ON_SCENE,
post-dispatch release, terminal automatic release, breakdown workflow, client,
or production deployment is implemented.

M01-R01 remains OPEN. Q-05, Q-06, Q-08, production key management and logging,
and Auditor cancellation-reason retrieval remain OPEN/deferred. No production
readiness claim is made.

**Local commit:** pending the S4-B checkpoint validation and commit operation.
