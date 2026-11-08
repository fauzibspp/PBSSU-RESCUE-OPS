# Sprint 3-C Location API Validation

Date: 2026-11-08
Branch: `feat/sprint-3-incident-backend`
Base: Sprint 3-B commit `dce2826239b1ac560bd46fc1005a945e3e6e0a18`

## Scope

Implemented exactly the two remaining frozen operations: `listLocations` and `createLocation`. The complete Sprint 3 API inventory remains exactly seven operations and the OpenAPI document remains the frozen 75-operation contract. No table was added; the application database remains at 26 tables. New migration `007-location-permissions` adds exactly two approved tenant permission keys and grants.

G-04 `listLocations` grants: Organization Admin, Control Room Operator, Incident Commander, and Read-Only Auditor at `TENANT`; Field Responder at `ASSIGNED`. G-05 `createLocation` grants only Control Room Operator and Incident Commander at `TENANT`. Organization Admin has no create grant. Platform Super Admin has no tenant operational grant. New-organization onboarding seeds these same mappings. Responder reads fail closed until Sprint 4 assignment evidence exists.

## Implementation and integrity

`createLocation` validates allowlisted fields, label/description bounds, UUIDs, finite longitude/latitude ranges, nonnegative accuracy, and parent `base_version`. A point requires `accuracy_m` because the frozen physical schema requires point and accuracy to be paired. The immutable location response uses logical `version: 1`, as specified by the data dictionary. Parent incident compare-and-swap increments its version exactly once; the same tenant transaction inserts one location, one `LOCATION_CREATED` event (entity version 1), and one redacted audit row. Any failure rolls back all writes. CANCELLED and CLOSED incidents reject location creation with `INVALID_TRANSITION`.

`listLocations` checks exact permission and tenant scope, verifies the parent incident within the tenant, orders by location UUID, and uses an opaque UUID cursor. The projection omits description and audit metadata; it never infers arrival, movement, assignment, or dispatch state. Cross-tenant/missing parent IDs are concealed as not found. No cancellation reason is decrypted or returned.

Migration 007 is forward-only, seeds only `listLocations` and `createLocation`, validates existing permission metadata and grant scopes, refuses incompatible grants, and does not overwrite existing mappings. Historical migrations 001–006 are unchanged. It creates no tables and changes no RLS policy or runtime privilege.

## Commands and actual results

| Command | Result |
| --- | --- |
| `npm run db:sprint3c` | PASS: created uniquely labeled loopback-only disposable database on tmpfs; credentials withheld. |
| `npm run db:migrate:sprint3c` | PASS: fresh migrations 001–007; 26 app tables; 50 permission keys; PostgreSQL 18.6, PostGIS 3.7.0; RLS and FORCE RLS on all 3 incident tables; runtime event UPDATE/DELETE denied. |
| `$env:PBSSU_TEST_DATABASE_STATE=(Resolve-Path '.cache/sprint3c/database.json').Path; $env:PBSSU_IDENTITY_KEY_FILE=Join-Path $env:LOCALAPPDATA 'PBSSU-RESCUE-OPS\sprint3b-identity-keys.json'; npm run test:integration` | PASS: 29 tests across 4 integration files, using the restricted runtime role where applicable. |
| `npm run format:check` | PASS. |
| `npm run typecheck` | PASS. |
| `npm run lint` | PASS. |
| `npm run build` | PASS. |
| `npm test` | PASS: 16 tests across 2 files. |
| `npm run scope:sprint3b`; `npm run scope:sprint3c`; `npm run scope:sprint3a`; `node --import tsx scripts/check-sprint2-scope.ts` | PASS: cumulative Sprint 3-B/C seven-operation scope, Sprint 3-C three-table/seven-operation manifest and 75-operation OpenAPI, Sprint 3-A and Sprint 2 inventories. |
| `git diff --check` | PASS. |

The integration suite verifies exact location role grants and onboarding parity, valid coordinate persistence, invalid coordinates and fields, list/read permissions, tenant concealment, responder/platform denial, parent version increments, stale create conflict without mutation, same-version concurrent creates with one winner, deterministic cursor pagination, incident update and transition stale-version behavior after location creation, terminal-state guards, immutable event/audit append behavior, and transaction rollback after injected event and audit insertion failures. Existing database tests also verify the 26-table inventory, RLS/FORCE RLS, cross-tenant reads/writes and composite references.

The first integration attempt exposed test expectation defects (tenant-specific role rows were compared as if they shared one tenant, and one valid foreign-tenant member was incorrectly expected to be denied) plus an audit rollback count that lacked tenant context. The test fixtures/assertions were corrected and the complete integration suite rerun successfully. No security assertions were weakened.

## Limitations and remaining gates

- Incident/location authorization integration tests call the service with the established test identity stub; the separate M01 identity/session tests run, but full HTTP-level authentication tests remain outstanding.
- Frozen OpenAPI `Point.accuracy_m` is optional while the frozen table constraint pairs non-null point and accuracy. The service enforces the physical constraint by requiring accuracy when a point is provided; resolve this contract nuance in a future approved contract revision if desired.
- Cancellation reason retrieval, including the Auditor-specific view, remains deferred.
- Field Responder assignment-scoped filtering cannot show assigned locations until Sprint 4 assignment evidence exists; current behavior fails closed.
- M01-R01 migration recovery remains OPEN. Q-05 retention/disposal, Q-06 deployment/recovery ownership, and Q-08 web/mobile readiness remain OPEN.
- Existing local key management remains synthetic-development-only. This milestone makes no KMS, backup/restore, production deployment, or operational-use claim.

No dispatch, assignment, movement, GPS capture, media, offline synchronization, reporting, notification, or client UI functionality was implemented.
