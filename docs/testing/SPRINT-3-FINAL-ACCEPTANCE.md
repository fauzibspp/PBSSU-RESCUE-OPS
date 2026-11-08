# Sprint 3-D Final Acceptance and Contract Validation

Date: 2026-11-08
Branch: `feat/sprint-3-incident-backend`
Base: accepted Sprint 3-C commit `a0d94bbd112a82008b62a81a0feccb4ca991de62`

## Contract clarification

The Project Owner approved preserving the database invariant:

```text
(point IS NULL) = (accuracy_m IS NULL)
```

The OpenAPI `LocationInput` schema now uses JSON Schema 2020-12 `if`/`then`: when `point` is present, `accuracy_m` is required within it. Both are omitted together when no coordinate is supplied. Explicit nulls are invalid. Coordinate ranges and nonnegative accuracy bounds remain unchanged. No value is fabricated. The shared `Point` component, future Observation consumers, `Location` response fields, database constraint, migrations, endpoint inventory and operation IDs remain unchanged.

## Scope and implementation

No application behavior, table, migration, permission, role grant or API operation was added or changed. The seven existing Sprint 3 operations remain:

`listIncidents`, `createIncident`, `getIncident`, `updateIncident`, `transitionIncident`, `listLocations`, `createLocation`.

The database remains at 26 application tables, including the three approved Sprint 3 tables. Migrations remain exactly 001–007; the fresh database contained 50 permission keys.

## Validation evidence

| Check | Command / evidence | Result |
| --- | --- | --- |
| Fresh database and migration recovery/no-op | `npm run db:sprint3d`; `npm run db:migrate:sprint3d` (the script invokes migration twice) | PASS: fresh migrations 001–007, second invocation no-op, 26 tables, 50 permissions, PostgreSQL 18.6, PostGIS 3.7.0; RLS/FORCE RLS, tenant policies, runtime append-only privileges verified. |
| JSON Schema / references | `npm test` via Ajv 8 `Ajv2020`, OpenAPI component compilation, local `$ref` resolver, and LocationInput cases | PASS: 17 unit/contract tests. This is component-schema and structural validation, not full OpenAPI document standards validation. No dedicated OpenAPI linter/validator was installed in the existing toolchain. |
| HTTP authentication and routes | `npm run test:integration -- --run apps/api/test/incident.http.integration.test.ts` | PASS: 2 HTTP integration tests exercise actual Nest controllers, JWT/session validation, Argon2 password login, TOTP verification, one-time credential handoff, selected tenant, restricted runtime database role, all seven routes, unauthenticated/invalid/expired credentials, forged tenant, role denial/read-only/fail-closed behavior, Commander cancellation, stale conflict, coordinate validation and reason redaction. |
| Restricted-role database integration and regressions | `npm run test:integration` | PASS on final suite: 32 tests across 5 files. Covers RLS/FORCE RLS, tenant and composite-reference isolation, migration inventory, event/audit append-only and rollback, encrypted cancellation metadata, CAS races, cursor pagination, role grants and M01/Sprint 2 regressions. |
| Added transaction races | Included in `incident.integration.test.ts` | PASS: concurrent incident update/update; transition/update; location/location; location/update; and location/cancellation races each leave one winning mutation, a single version increment and matching event/audit evidence. |
| Format | `npm run format:check` | PASS. |
| Lint | `npm run lint` | PASS. |
| Typecheck | `npm run typecheck` | PASS. |
| Build | `npm run build` | PASS. |
| Scope | `npm run scope:sprint3a`; `npm run scope:sprint3b`; `npm run scope:sprint3c`; `node --import tsx scripts/check-sprint2-scope.ts` | PASS: 75 OpenAPI operation IDs, exact seven Sprint 3 operations, three Sprint 3 tables, unchanged Sprint 2 inventory. |
| Whitespace | `git diff --check` | PASS at final review. |

Integration tests used an isolated `sprint3d` loopback-only, tmpfs database and synthetic identities/data. The earlier Sprint 3-C container/database was not modified. The HTTP Commander followed the real password/TOTP/handoff flow. Synthetic role selection in the HTTP fixture changed the membership role under tenant-scoped owner setup so requests traversed the real runtime authorization path for Operator, Organization Admin, Auditor and Responder cases. No test guard or authenticator was substituted.

## Review limits and remaining risks

- No full OpenAPI 3.1 document validator was available; component schemas compiled with Ajv 2020-12 and local references, structure and operation/permission/scope parity were checked.
- HTTP tests verify response redaction. Generic logging/telemetry behavior was source-reviewed, not measured against production observability. No production logging or deployment configuration is claimed.
- Development encryption keys remain local synthetic-test keys. Production KMS, rotation, backup/restore and disaster recovery are not verified.
- M01-R01 migration recovery, Q-05 retention/disposal, Q-06 deployment/recovery ownership, and Q-08 web/mobile readiness remain OPEN.
- Auditor cancellation-reason view remains deferred. Sprint 4 assignment and movement evidence remains deferred.
- No production deployment, real outbound messaging, operational data, dispatch, assignment, GPS/media, offline sync, reporting, or client implementation was performed.

## Acceptance status

**CONDITIONAL PASS for local Sprint 3 technical acceptance.** Implemented contract and database behavior passed the available checks. Full standards validation and production/operations gates remain outstanding. This report does not authorize Sprint 4, production use, push, or merge.
