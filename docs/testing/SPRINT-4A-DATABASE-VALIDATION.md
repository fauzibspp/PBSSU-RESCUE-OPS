# Sprint 4-A Database Validation

**Status:** PASS for Sprint 4-A database foundation

**Branch:** `feat/sprint-4-assignment-movement`

**Base:** accepted Sprint 4 scope freeze `124cc37942e5f88124fcbc0013b92064e0bc2b4e`

**Execution date:** 2026-11-08

## Scope validated

Migrations `008-sprint4-permissions` and `009-sprint4-assignment-movement` add exactly four existing permission keys and three tenant tables: `incident_personnel`, `incident_vehicles`, and `movement_logs`. No historical migration was changed. Runtime receives SELECT/INSERT for the interval tables and UPDATE of `released_at` only; movement rows are INSERT/SELECT only. Assignment intervals may be explicitly released once; prior rows cannot be deleted or have other fields changed. Movement rows are append-only.

The canonical responder is `users.id`, bound to `(organization_id, membership_id)` by a composite FK. A partial unique index on `user_id WHERE released_at IS NULL` enforces global active uniqueness atomically. Active vehicle assignment has a partial unique index on `vehicle_id WHERE released_at IS NULL`. Cross-tenant conflict normalization at the HTTP boundary remains Sprint 4-B work; direct PostgreSQL reports a unique violation to its caller, and application code must not expose its detail.

## Actual validation evidence

All database checks used a newly created, uniquely labeled, loopback-only PostgreSQL 18.6/PostGIS 3.7.0 container with a tmpfs data directory and non-superuser, `NOBYPASSRLS` owner/runtime/identity roles. The final migration verification used the fresh state `.cache/sprint4a/fb8d8c4f203f.json`. No prior development database, container, volume, network, or local data was reset or removed. A first isolated S4-A test instance was retained after an early privilege-check correction; no cleanup was performed.

| Command | Result |
| --- | --- |
| `npm run db:migrate:sprint4a` (fresh, then repeat-up) | PASS: 29 app tables, 54 permission keys, migrations 001-009 in order; RLS and FORCE RLS on all three new tables; tenant `USING`/`WITH CHECK`; restricted runtime cannot update/delete movement rows and can update only assignment `released_at`. |
| `npx vitest run --config vitest.integration.config.ts apps/api/test/sprint4a-database.integration.test.ts apps/api/test/database.integration.test.ts` | PASS: 17 tests. Covers RLS with missing/selected tenant context, cross-tenant reads and update invisibility, cross-tenant insert rejection, composite tenant/reference rejection, concurrent global user uniqueness, active vehicle uniqueness, one-time assignment release/history, movement append-only enforcement, transaction rollback, migration inventory and catalog mapping. |
| `npx vitest run --config vitest.integration.config.ts apps/api/test/mfa.integration.test.ts` | PASS: 2 tests, including real onboarding path and exact Sprint 4 role-template grant assertions. |
| Full `npm run test:integration` on the fresh S4-A database | PASS: 6 files, 42 tests. |
| `npm test -- --run` | PASS: 2 files, 19 tests. |
| `npm run lint` | PASS. |
| `npm run typecheck` | PASS. |
| `npm run build` | PASS. |
| `npm run format:check` | PASS. |
| `npm run scope:sprint4a` | PASS: 75 unique OpenAPI operations, exact frozen 3-table/4-operation inventory, G-04/G-06/G-07 operation key parity, optional response duty, no request duty. |

The full integration run initially exposed two stale pre-Sprint-4 assertions (26 tables, 50 permissions). They were updated to the new cumulative 29/54 inventory and exact new keys; the complete suite then passed. A first privilege inventory check also assumed table-level UPDATE, which was intentionally narrowed to column-level `released_at` only; the validator now checks the actual column grant and fresh migration tests pass.

## Security and integrity findings

- RLS and FORCE RLS were observed on all three added tables, with tenant predicates in both policy clauses.
- The restricted runtime role has no BYPASSRLS and no table DELETE on assignment/movement tables.
- A simultaneous assignment race from two organizations for the same canonical user produced exactly one committed active assignment; the losing transaction left no second row. RLS showed no record to the other tenant.
- The database unique violation carries internal PostgreSQL details. HTTP error normalization is mandatory before Sprint 4-B acceptance; this phase has no assignment API to test that response.
- Assignment release timestamp can be set once. Other assignment columns are not writable by runtime. Physical deletion is denied.
- Movement UPDATE/DELETE are denied to runtime, and the immutability trigger also rejected an owner-role mutation in a tenant transaction.
- Composite FKs rejected mismatched incident, membership, vehicle-assignment and location relationships.
- Nullable duty was observed as NULL with no inferred/default value in created assignment rows. API request remains unchanged.
- Migrations 008 and 009 are forward-only. No down migration, backup/restore, or recovery test was attempted; M01-R01 remains OPEN.

## Limitations and remaining gates

This validates the Sprint 4-A schema and database authorization layer only. Assignment and movement HTTP operations, active membership eligibility checks, status/availability checks, generic HTTP conflict responses, assignment CAS/audit semantics, movement replay/correction behavior, DISPATCHED prerequisites and `updateVehicle` race serialization are not implemented or tested yet. They belong to Sprint 4-B through 4-D. No production readiness, KMS/logging assurance, retention policy or deployment recovery is claimed. M01-R01, Q-05, Q-06, Q-08, production key management, production logging validation and the deferred Auditor cancellation-reason view remain open.
