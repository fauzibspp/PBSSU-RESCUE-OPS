# Sprint 2 Backend Delta

**Authorization:** Project-owner Sprint 2 backend authorization in this conversation, following M01 commit `fe5cbec0d2947bc0b8c0f87856e4f7e4f4fbf5b7`.
**Branch:** `feat/sprint-2-vehicle-backend`
**Scope source:** [`SPRINT-2-SCOPE.json`](../planning/SPRINT-2-SCOPE.json)

## Implemented boundary

- One new tenant-owned `app.vehicles` table.
- `listVehicles`, `createVehicle`, `updateVehicle` only.
- New forward migration `003-vehicles`; M01 migrations 001 and 002 remain unchanged.
- Reuses M01 authentication, selected-tenant context, RLS, explicit permission checking, transactions and audit log.
- Adds exact permission catalogue keys `listVehicles`, `createVehicle`, `updateVehicle`.
- G-10 grants all three operations to the Organization Admin template. G-16 grants only `listVehicles` to Control Room Operator and Incident Commander templates. The migration backfills existing templates and new onboarding seeds the same grants. Platform-only and other roles receive no implicit vehicle access.
- Permission checks require the approved privileged MFA assurance. Runtime queries use a checked-out transaction with transaction-local tenant context.

## Schema and data minimization

The physical vehicle table follows the OpenAPI fields and the approved database invariants: UUID id, UTC timestamps, positive row version, organization FK, tenant-unique call sign, kind, enumerated service state, `UNIQUE (organization_id,id)` and a tenant-leading index. RLS and FORCE RLS are enabled. The runtime role receives only select/insert/update privileges.

No registration identifier is stored or returned: the OpenAPI vehicle request and response schemas do not expose it, and the logical dictionary marks encrypted registration data optional. The table has no vehicle child relation in this bounded delta, so no cross-entity composite FK is applicable; the composite `(organization_id,id)` key is present for future tenant-safe references. Organization ownership uses the FK to `organizations(id)`.

Migration 003 temporarily adds a migration-owner-only `SELECT` policy to `roles` while it discovers existing standard templates. It then sets the transaction-local organization context separately for each grant insert, so the existing `role_permissions` RLS policy remains the write boundary. The temporary policy is dropped in the same migration transaction. The runtime role has no RLS bypass. Failure rolls back the migration transaction. Existing M01-R01 `down` protections are unchanged; no downgrade was attempted or claimed.

## Local commands

Create a new unique loopback-only PostgreSQL/PostGIS test instance:

```powershell
node --import tsx scripts/sprint2-database.ts
node --import tsx scripts/sprint2-migrate.ts
$env:PBSSU_IDENTITY_KEY_FILE='.cache/sprint2/identity-keys.json'
npm run db:generate-local-identity-keys
$env:PBSSU_TEST_DATABASE_STATE=(Resolve-Path '.cache/sprint2/database.json').Path
npm run test:integration
```

The database script refuses reuse of a Sprint 2 namespace, pins the approved local image, writes generated credentials only to ignored `.cache/sprint2`, uses tmpfs and binds the database to loopback. Do not point the test-state environment variable at the M01 development state. The migration verification applies the M01 foundation migrations followed by 003, seeds a synthetic set of pre-existing role templates before 003, and verifies the exact upgrade backfill. It does not run `down`.

## Explicit exclusions

No web/mobile shell, incident workflows, assignment/dispatch, GPS, offline sync, media, reporting, cloud/provider integration or deployment. Q-02 remains a gate for operational lifecycle and assignment rules. M01-R01 remains an unresolved production-like migration-recovery gate.
