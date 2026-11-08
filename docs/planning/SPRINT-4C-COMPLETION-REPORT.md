# Sprint 4-C Completion Report — Movement Operations

**Assessment:** PASS for Sprint 4-C scope
**Branch:** `feat/sprint-4-assignment-movement`
**Base commit:** `376e117ec373cb5f44c56d2bca532cdf0cbcf935`
**Execution date:** 2026-11-08

## Delivered

- Implemented `listMovements` and `createMovement` at their frozen routes.
- Enforced selected-tenant G-04/G-07 access, MFA for privileged roles,
  assigned-only responder access, tenant/incident/resource relationships, and
  restricted runtime database access.
- Derived actor membership and receipt time on the server. Movement records
  remain immutable; corrections append with `supersedes_id`.
- Added deterministic `(occurred_at, received_at, id)` cursor pagination,
  idempotent same-ID replay, generic conflicting-ID response, and redacted
  response projection that omits note text.
- Kept ARRIVAL as human-reported data; it does not transition the incident.
  Movement mutation and audit insert share a tenant transaction.
- No migration, new table, permission, API operation, incident version change,
  or `change_events` extension was needed.

## Validation

See [Sprint 4-C movement validation](../testing/SPRINT-4C-MOVEMENT-VALIDATION.md).
Focused HTTP tests passed 6/6; full integration passed 42/42 tests across 6
files. Typecheck, lint, build, formatting and the exact frozen scope check
passed. S4-A restricted-role tests in the full suite verify movement RLS and
append-only protection.

## Remaining authorized work and risks

Sprint 4-D remains for explicit OPEN-to-DISPATCHED prerequisite validation and
the `updateVehicle` guard while actively assigned. ON_SCENE, post-dispatch
release/cancellation, emergency breakdown, GPS, agency messaging, client work
and production deployment remain excluded. M01-R01, Q-05, Q-06, Q-08,
production key management/logging, and Auditor cancellation-reason retrieval
remain open. No production readiness is claimed.

**Local commit:** pending the S4-C checkpoint validation and commit operation.
