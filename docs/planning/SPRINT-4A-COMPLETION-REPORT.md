# Sprint 4-A Completion Report — Database Foundation

**Assessment:** PASS for Sprint 4-A; proceed to Sprint 4-B under the frozen scope.

**Branch:** `feat/sprint-4-assignment-movement`

**Base commit:** `124cc37942e5f88124fcbc0013b92064e0bc2b4e`

**Implementation:** local, uncommitted at report preparation; no push or merge.

## Delivered

- Added forward-only migration `008-sprint4-permissions` with only the four already-contracted keys: `getAssignments`, `setAssignments`, `listMovements`, `createMovement` and exact approved role/scope backfill.
- Added forward-only migration `009-sprint4-assignment-movement` with exactly `incident_personnel`, `incident_vehicles`, and `movement_logs`.
- Added fresh local Sprint 4-A database setup, migration inventory verification, restricted-role integration tests, and a 75-operation/scope parity check.
- Updated organization onboarding to seed the same four approved permissions into the six Q-01 templates without granting platform operational access or Admin/Auditor write authority.
- Updated Sprint 4 cumulative table/permission regression expectations and exact onboarding grant assertions.

## Database controls

All three tables have tenant `organization_id`, tenant RLS and FORCE RLS, tenant `USING`/`WITH CHECK`, and composite same-tenant references. The active responder index is globally unique over canonical `user_id` for rows with `released_at IS NULL`; membership/user identity is bound by a composite FK. Active vehicle assignment has the corresponding partial unique index. Runtime can set only `released_at` on assignment rows, once; it cannot mutate other interval data or delete history. Movement records are append-only with INSERT/SELECT grants, a trigger, and tenant-consistent incident/resource/location/actor/correction references.

## Actual checks

- Fresh 001-009 migration and repeat-up: PASS; 29 app tables, 54 permission keys, all three new tables RLS/FORCE RLS enabled, tenant policy verified, movement update/delete denied, assignment update limited to release timestamp.
- Focused database and M01 regression tests: 17 passed; onboarding/MFA integration: 2 passed; full integration suite: 6 files / 42 tests passed.
- Unit/contract: 2 files / 19 tests passed.
- Lint, typecheck, build, format check and Sprint 4 exact scope check: PASS.
- Details and known initial assertion corrections are in [SPRINT-4A-DATABASE-VALIDATION.md](../testing/SPRINT-4A-DATABASE-VALIDATION.md).

## Not implemented in Sprint 4-A

No assignments or movement APIs, incident transition integration, vehicle state guard, dispatch, arrival verification, ON_SCENE, post-DISPATCHED release/cancellation, GPS/media/offline sync, or client functionality was implemented. The database-level unique error still requires generic normalization in the Sprint 4-B API. Active membership and vehicle availability eligibility are command-level checks for that phase.

## Open risks and gates

- M01-R01 migration recovery: OPEN; migrations 008-009 are forward-only and no backup/restore or downgrade recovery is claimed.
- Q-05 retention/disposal, Q-06 infrastructure/recovery ownership, Q-08 client/device readiness: OPEN.
- Production cryptographic key management and production logging validation: OPEN.
- Auditor cancellation-reason view remains deferred.
- Sprint 4-C/D behavior is not covered by Sprint 4-A evidence.

## Next authorized phase

Sprint 4-B may implement only `getAssignments` and `setAssignments`, exact G-04/G-06 permissions, active membership and vehicle eligibility, pre-DISPATCHED release/replacement with retained history, global uniqueness conflict normalization, incident version consistency, and required audit/event behavior. No other endpoint, table, permission, or operational workflow is authorized by this scope.
