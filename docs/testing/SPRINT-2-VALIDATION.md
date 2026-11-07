# Sprint 2 Backend Validation

**Branch:** `feat/sprint-2-vehicle-backend`
**Baseline:** `fe5cbec0d2947bc0b8c0f87856e4f7e4f4fbf5b7`
**Scope:** one new `vehicles` table, three API operations, and three exact permission keys.

## Executed checks

| Check | Command / evidence | Result |
| --- | --- | --- |
| Formatting | `npm run format:check` | Passed; all matched files use Prettier style. |
| Lint | `npm run lint` | Passed with `--deny-warnings`. |
| Type checking | `npm run typecheck` | Passed. |
| Build | `npm run build` | Passed. |
| Unit and contract tests | `npm test` | Passed: 2 files, 16 tests. Includes OpenAPI operation/schema mapping, M01 freeze fingerprints and the bounded Sprint 2 inventory. |
| M01 scope | `node --import tsx scripts/check-scope.ts` | Passed: 22 tables / 40 approved operations. |
| Sprint 2 scope | `node --import tsx scripts/check-sprint2-scope.ts` | Passed: one table / three operations / three exact permission keys. |
| Migration chain | `node --import tsx scripts/sprint2-migrate.ts` | Passed on a newly created isolated test database: migrations 001, 002, 003; 23 tables; 43 permission keys; vehicle RLS and FORCE RLS; exact G-10/G-16 template grants. |
| Integration tests | `npm run test:integration` with `.cache/sprint2f/database.json` and generated local identity keys | Passed: 3 files, 11 tests. Covered tenant isolation, missing context, pooled connection reuse, invalid/extra fields, duplicate call sign, stale version, MFA-required successful service flow, and unauthorized/cross-tenant denial. Explicitly tested denied vehicle reads and writes for a platform-granted identity with no vehicle tenant grant, Field Responder and Read-Only Auditor role assignments. |

The final acceptance run used a newly created `sprint2f`-labeled container/network and a synthetic test dataset. It was isolated from the earlier Sprint 2, M01 development and M01-F resources. Generated credentials and identity key material were kept in ignored local cache files and were not included in this report. The original Sprint 2 test namespace was left untouched.

## Migration and recovery evidence

Migration 003 applied after the unchanged M01 migrations on a fresh empty database. Verification confirmed the resulting table count, permission catalogue, migration order, tenant RLS/FORCE RLS, and both existing-template backfill and new-onboarding grants. Integration tests confirmed a reused pooled connection does not retain the prior transaction's tenant context.

Migration 003 creates exactly one table. The checked role matrix grants `createVehicle`, `listVehicles` and `updateVehicle` to Organization Admin; only `listVehicles` to Control Room Operator and Incident Commander; and no vehicle keys to Field Responder or Read-Only Auditor. Platform permissions do not supply vehicle tenant access; the platform-granted test identity was denied vehicle read and write while holding only a tenant role without vehicle permissions.

No `down` migration or rollback was attempted. M01-R01 remains open as a production-like recovery gate. This run does not establish backup/restore recovery, migration failure recovery in a persistent environment, or downgrade safety. Existing rollback guards were not changed or bypassed.

## Scope and security limits

The unchanged OpenAPI contract already defined the three vehicle operations and schemas; contract tests map those operations to the controller and exact permission keys. The implementation does not add registration or other private vehicle fields. No external email, production credential issuance, deployment, or live integration was exercised. These checks do not constitute a penetration test or prove production security. Q-02 remains unresolved for incident and assignment lifecycle rules and is outside this increment.

An initial integration run exposed a test teardown ordering issue because a synthetic vehicle referenced its organization. The teardown was corrected to remove the vehicle before its organization; subsequent clean runs passed. A final format check initially flagged the parameterized Sprint 2 verification scripts; they were formatted and the repeated format check passed. No production or existing development data was affected.
