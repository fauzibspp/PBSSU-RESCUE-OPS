# Sprint 4-C Movement API Validation

**Status:** PASS for the bounded Sprint 4-C movement operations
**Branch:** `feat/sprint-4-assignment-movement`
**Base:** Sprint 4-B commit `376e117ec373cb5f44c56d2bca532cdf0cbcf935`
**Execution date:** 2026-11-08

## Scope and controls

Implemented only the frozen `listMovements` and `createMovement` operations.
The endpoints use G-04/G-07 exact permission checks, selected-tenant
transactions and the restricted runtime role. Field Responders use ASSIGNED
scope and must have an active incident personnel interval. Actor membership and
`received_at` are server-derived. Client `occurred_at` is accepted only as UTC
with a `Z` suffix. Arrival records never change incident lifecycle state.

Movement records use `movement_logs` only, which is RLS/FORCE RLS protected and
append-only for the runtime role. The projection excludes the optional note,
and the audit payload remains empty. Corrections append a new record linked by
`supersedes_id`. Same-ID semantic replay from the same membership returns the
existing representation; reuse with changed content returns a generic conflict.
No incident version increment, `change_events` extension, table, permission or
operation was added.

## Executed checks

| Command | Result |
| --- | --- |
| `npm run test:integration -- apps/api/test/incident.http.integration.test.ts` | PASS: 1 file, 6 tests; real Nest HTTP and auth path covers commander movement create/list, assigned Field Responder create/list, no-auth and cross-tenant denial, server actor, receipt time, note redaction, exact replay, conflicting replay, supersedes lineage, stable cursor page, and ARRIVAL without lifecycle mutation. |
| `npm run test:integration` | PASS: 6 files, 42 tests, including restricted-role RLS, immutable movement-table behavior, transaction tests, and prior milestone regressions. |
| `npm run typecheck` | PASS. |
| `npm run lint` | PASS. |
| `npm run build` | PASS. |
| `npm run format` | PASS. |
| `npm run scope:sprint4a` | PASS: exact 75-operation contract and frozen 3-table/4-operation scope. |

The HTTP suite ran against the existing isolated synthetic S4-A database state
`.cache/sprint4a/fb8d8c4f203f.json`; no migrations or Docker resources were
modified. S4-A database integration tests verify restricted-role append-only
movement UPDATE/DELETE denial and RLS. Those database tests were included in
the full integration suite.

## Remaining gates

This phase does not implement lifecycle `DISPATCHED` prerequisites or the
vehicle `updateVehicle` active-assignment guard; those are Sprint 4-D. No
ON_SCENE, emergency breakdown, post-dispatch release, automatic dispatch,
arrival verification, GPS, or external agency acknowledgement is implemented.
No production logging, key-management, retention, backup/recovery, deployment,
or client readiness is claimed. M01-R01, Q-05, Q-06, Q-08 and the deferred
Auditor cancellation-reason view remain open.
