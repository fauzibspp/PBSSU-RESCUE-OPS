# Sprint 4 Final Acceptance

**Status:** PASS for the authorized local Sprint 4 scope
**Branch:** `feat/sprint-4-assignment-movement`
**Scope freeze:** `124cc37942e5f88124fcbc0013b92064e0bc2b4e`
**Execution date:** 2026-11-08

## Frozen inventory and delivery

The exact Sprint 4 inventory remains three new application tables and four
existing API operations:

- Tables: `incident_personnel`, `incident_vehicles`, `movement_logs`.
- Operations: `getAssignments`, `setAssignments`, `listMovements`,
  `createMovement`.
- Existing bounded behavior: `transitionIncident` enables only explicit
  Operator `OPEN → DISPATCHED` after required resource checks; `updateVehicle`
  rejects `MAINTENANCE`/`RETIRED` while actively assigned.
- No new operation, role, permission, migration, or `change_events` extension
  was added in Sprint 4-B/C/D. Historical migrations 001–007 are unchanged;
  the only added migrations are 008 and 009.

All 75 OpenAPI operation IDs remain unchanged. The database inventory is 29
application tables (the confirmed 26-table baseline plus the three approved
tables) and 54 permission keys (the confirmed 50-key baseline plus the four
approved keys).

## Security and operational evidence

- Migration 009 gives all three new tables tenant `organization_id`, RLS and
  FORCE RLS, tenant policies and tenant-composite references. Runtime privileges
  remain least-privilege; movement rows cannot be updated or deleted, and
  assignment rows can only be explicitly released once.
- Global active responder uniqueness is enforced on canonical `users.id` by
  the partial unique index. The user identity is composite-bound to the tenant
  membership. No cross-tenant precheck is used; conflicts are generic.
- Assignment writes require an active selected-tenant FIELD_RESPONDER
  membership and AVAILABLE same-tenant vehicle, use incident locking and
  `base_version`, preserve released intervals, and write audit atomically.
- Movement actor and receipt time are server-derived. G-04/G-07 tenant and
  assigned scopes are checked; corrections append via `supersedes_id`; notes
  are excluded from the movement response and audit metadata. Arrival records
  do not change lifecycle status.
- DISPATCHED requires an explicit Operator command and locked checks for an
  active eligible responder and AVAILABLE assigned vehicle. It is internal
  state only. Injected audit insertion failure returned an error and left the
  incident version/status, change event count and audit count unchanged.
- `updateVehicle` locks the vehicle row before checking active assignments.
  Real HTTP race coverage confirms assignment and maintenance update cannot
  both commit into an invalid combination.
- ON_SCENE, MONITORING, RETURNING, COMPLETED, CLOSED, post-dispatch release,
  post-dispatch cancellation, emergency breakdown, and automatic resource
  release remain unavailable. No external dispatch, acknowledgement, or
  arrival evidence is represented.

## Actual validation

| Command | Result |
| --- | --- |
| `npm run db:migrate:sprint4a` with `.cache/sprint4a/fb8d8c4f203f.json` | PASS: fresh and repeat-up; migrations 001–009; 29 tables; 54 permissions; PostgreSQL 18.6/PostGIS 3.7.0; RLS/FORCE RLS/tenant policies; runtime movement update/delete denied. |
| `npm run test:integration` | PASS: 6 files, 42 tests, including real Nest HTTP authentication/MFA, assignment and movement routes, tenant/RBAC, Sprint 4-A RLS/global uniqueness, and prior M01/Sprint 2/Sprint 3 regressions. |
| `npm test -- --run` | PASS: 2 files, 19 tests. |
| `npm run typecheck` | PASS. |
| `npm run lint` | PASS. |
| `npm run build` | PASS. |
| `npm run format:check` | PASS. |
| `npm run scope:sprint3a`, `scope:sprint3b`, `scope:sprint3c`, `scope:sprint4a` | PASS: prior frozen scopes preserved; 75 operations and exact Sprint 4 inventory. |
| `git diff --check` | PASS. |

The application-level HTTP tests ran against the isolated synthetic Sprint 4-A
database. No unrelated Docker resources or databases were changed. No dedicated
standards-grade OpenAPI validator was run in the final phase; the contract was
unchanged, and structural operation/permission/scope checks ran successfully.

## Commits

- S4-A: `c4e2aec0f4eb7aa6190bd0449ff68c1c6d9ae662`
- S4-B: `376e117ec373cb5f44c56d2bca532cdf0cbcf935`
- S4-C: `1b7ec2507d8de005079255f258a6f7dd94903b3b`
- S4-D and final acceptance: included in the local commit containing this report.

## Open gates and exclusions

M01-R01 migration recovery remains OPEN. Q-05 retention/disposal, Q-06
infrastructure/recovery ownership, and Q-08 client/device readiness remain
OPEN. Production KMS/key rotation/backup, production logging verification,
Auditor cancellation-reason retrieval, and future post-dispatch resource-release
authority/evidence/transaction policy remain unresolved. No deployment or
production-readiness claim is made.
