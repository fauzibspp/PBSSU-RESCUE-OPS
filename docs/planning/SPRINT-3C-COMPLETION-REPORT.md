# Sprint 3-C Completion Report

Status: **PASS for local development acceptance; owner review required**
Date: 2026-11-08
Branch: `feat/sprint-3-incident-backend`
Base commit: `dce2826239b1ac560bd46fc1005a945e3e6e0a18`

## Delivered scope

Implemented the two remaining approved APIs:

1. `listLocations`
2. `createLocation`

Combined with Sprint 3-B, all seven frozen Sprint 3 operations are implemented. The contract remains at 75 operations; the database remains at 26 tables and exactly three incident tables. No historical migration was changed.

Forward-only migration `007-location-permissions` seeds exactly two permission keys: `listLocations` and `createLocation`. It applies G-04 read scopes to Organization Admin, Operator, Commander, Auditor (TENANT) and Field Responder (ASSIGNED); G-05 create scope only to Operator and Commander (TENANT). No Organization Admin create grant, platform operational grant, permission wildcard, or unrelated permission was added. First-admin onboarding uses the same exact role mappings.

Creation validates input and tenant-scoped parent access, requires parent `base_version`, and uses compare-and-swap. Each successful request increments the parent incident version once, inserts an immutable location at logical version 1, appends a `LOCATION_CREATED` event, and writes a redacted audit row in one transaction. Event or audit insertion failure rolls back the entire transaction. Stale versions return `STALE_VERSION`; cancelled/closed parents return `INVALID_TRANSITION`. Listing checks tenant and role scope, is deterministically paginated, and omits description and protected audit metadata.

## Validation summary

- Fresh migrations 001–007: **PASS**, 26 tables, 50 permission keys, PostgreSQL 18.6/PostGIS 3.7.0.
- Incident table RLS and FORCE RLS, tenant policies, and restricted runtime append-only event privileges: **PASS**.
- Unit/contract tests: **16 passed**.
- Integration/regression tests: **29 passed across 4 files**.
- Format, typecheck, lint, build, scope checks, and `git diff --check`: **PASS**.
- Detailed commands, evidence, initial test corrections and limitations: [Sprint 3-C validation](../testing/SPRINT-3C-LOCATION-VALIDATION.md).

## Remaining risks and dependencies

- Location API auth integration is service-level with the established test identity stub; full HTTP-level auth coverage remains outstanding.
- OpenAPI allows `Point.accuracy_m` to be omitted, while the frozen database requires it paired with a non-null point. Sprint 3-C enforces the database constraint and rejects point input without accuracy; this nuance is documented for a future approved contract revision.
- Cancellation-reason retrieval and the Auditor-specific view remain deferred.
- ASSIGNED responder reads fail closed until Sprint 4 assignment data exists.
- M01-R01 remains OPEN. Q-05, Q-06, and Q-08 remain OPEN. No backup/restore, downgrade recovery, KMS, production deployment, or operational readiness is claimed.

## Exclusions

No assignment/dispatch, movement, GPS/media, offline sync, reporting, notification, dashboard, mobile/web UI, or additional API/table work was included. Sprint 4 dependencies remain deferred.

**Recommendation:** Sprint 3 implementation is complete for local development acceptance, subject to owner review of the validation record and the documented accuracy-schema nuance. Do not push, merge, deploy, or start another increment under this report.
