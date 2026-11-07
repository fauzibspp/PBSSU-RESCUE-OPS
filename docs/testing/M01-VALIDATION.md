# M01 backend foundation validation

Date: 2026-11-07
Branch: `feat/m01-backend-foundation`
Approved baseline: `40b0479b1c8dd5c80e744339253335434b63f6db`
Authorized scope: 22 foundation tables and 40 API operations from `docs/planning/M01-SCOPE.json`.

## M01-A — Passed

- Observed Node.js 24.16.0, npm 12.2.2, and Docker 29.7.2. Registry package metadata and peer/engine requirements were checked before installation.
- Pinned NestJS 12.4.0, Kysely 0.29.8, pg 8.23.1, TypeScript 6.0.3, and the other exact versions in the manifests/lockfile. TypeScript 6.0.3 satisfies the selected Nest tooling's `<6.1` peer constraint.
- Pinned `postgis/postgis:18-3.7` index digest `sha256:440bdd14e3edccfce04d080d8a1a0cbae5763fa16a1c4172bff83530828461de`; linux/amd64 manifest `sha256:bb82120a7afff79dd3708e5473e4584275ac883eb4115750972f0f017f895892`.
- `npm audit --json --fetch-retries=0 --fetch-timeout=20000` reported zero vulnerabilities after replacing the vulnerable development-only ESLint chain with Oxlint. No advisory was suppressed and no security control was disabled.
- Lint, type checking, format checking, build, unit/contract tests, and the 22/40 scope check passed. npm's install-script policy remained enabled; installed Argon2 native binding loaded and was exercised by tests.

## M01-B — Passed

- Created a uniquely labeled local PostgreSQL 18.6/PostGIS 3.7 container on a dedicated bridge with a loopback-only published port and tmpfs database storage. An initial failed M01-only container/network was removed after the user's cleanup authorization. The unrelated Docker project was not changed.
- Applied migrations with `pbssu_m01_owner`; created exactly 22 domain tables in schema `app`, plus migration bookkeeping in `migration_meta`. The later additive migration seeds the approved permission catalogue and creates no additional table.
- The restricted runtime role has no migration-owner credentials. Tenant work uses a checked-out transaction with transaction-local organization and actor GUCs. All nine tenant tables use RLS and `FORCE ROW LEVEL SECURITY`; composite tenant foreign keys are present.
- The database integration checks verified PostgreSQL/PostGIS versions, table count, forced RLS, runtime privileges, no-context reads, tenant A/B isolation, cross-tenant write denial, composite-FK rejection, pooled connection cleanup after commit/rollback, and concurrent tenant contexts.
- `npm run db:check-recovery` passed against an empty schema and restored all 22 tables. This was an empty-development-schema check; it does not validate backups or production recovery.

## M01-C — Passed

- Implemented Argon2id password authentication, bounded login throttling, privileged TOTP enrollment/verification, hashed recovery codes, refresh rotation and family revocation, self-session revocation, password/email recovery flows, invitation acceptance/activation, and session-bound one-time credential handoffs.
- Session, TOTP setup, and recovery-code material are not returned in generic operation responses. The dedicated handoff route has a one-time purpose/client-bound response path; WEB sessions use secure HttpOnly cookies with CSRF and binding checks. Mock delivery is test-only/local and rejects non-synthetic recipients.
- Integration evidence covered MFA-before-session, one-time recovery material, replay denial, session handoff, TOTP-gated first-admin activation, single-use invitation proof, non-enumerating password recovery, refresh rotation/reuse revocation, and recovery preserving MFA.
- No real mail provider, production credential delivery, or production key custody is enabled or claimed.

## M01-D — Passed

- Implemented platform onboarding/listing plus selected-tenant organization, membership, role, permission, invitation, and settings operations. All 40 scoped operation IDs map to controller methods; tenant operations derive actor identity from the verified session and organization from the untrusted `X-Organization-Id` selector, then require active membership and an exact permission key inside a transaction-scoped RLS context.
- Added a migration-managed catalogue of exactly the 40 approved permission keys. No wildcard permission is seeded. Onboarding creates the five tenant role templates; the separate platform capability remains an explicit grant and does not imply tenant access.
- Role creation and assignment enforce the delegable permission catalogue, scopes, no self-role changes, no assigning the locked Organization Admin template, privileged MFA requirements, and last-active-admin protection. Membership deactivation cannot remove the final administrator.
- Onboarding and invitations create pending records only. The first administrator has no membership or operational grants before verified acceptance, MFA, and explicit activation. Mock delivery material is encrypted at rest and never appears in the generic response or audit data.
- Integration evidence covers platform-only denial of tenant access, selected-tenant reads, custom-role delegation, self-role-change denial, foreign-tenant denial, inactive-membership denial, first-admin activation gating, member invitation/revocation, and onboarding without active membership.

## M01-E — Passed with limitations

Executed successfully after the implementation changes:

| Command/check | Result |
| --- | --- |
| `npm run format:check` | Passed |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| `npm test` | 2 files, 15 tests passed |
| `npm run test:integration` | 3 files, 11 tests passed against the disposable PostgreSQL/PostGIS database |
| `node --import tsx scripts/check-scope.ts` | Passed: 22 tables / 40 operations |
| OpenAPI reference resolution and JSON Schema 2020-12 compilation | All component references resolved; all component schemas compiled |
| Controller/contract check | All 40 scoped operation IDs map to controller methods; permission keys match operation IDs |
| Local HTTP startup smoke | API listened on `127.0.0.1:3301`; malformed JSON object body returned 400 with `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`; process was stopped |

## M01-F — Final verification (2026-11-07)

The final database verification used a newly created `pbssu-m01-f-*` container and `pbssu-m01-f-*-isolated` network, with a unique database name prefixed `pbssu_m01_f_`. It used the pinned PostGIS image, loopback-only published port, 1 GiB tmpfs storage and its own ignored `.cache/m01-f/database.json` and signing/encryption keys. The existing M01 development container, network, state and database were not modified.

Executed commands and results:

| Command/check | Result |
| --- | --- |
| `node --import tsx scripts/m01-f-database.ts` | Passed; new isolated M01-F database created, PostgreSQL 18.6/PostGIS 3.7 verified; credentials withheld |
| `node --import tsx scripts/m01-f-migrations.ts` | Passed full up for `001-foundation` then `002-permission-catalog`; verified migration order, exactly 22 app tables, 40 permission rows, nine RLS-enabled tenant tables, and transaction rollback |
| `npm run format:check` | Passed |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 2 files, 15 tests passed |
| `$env:PBSSU_IDENTITY_KEY_FILE='.cache/m01-f/identity-keys.json'; npm run db:generate-local-identity-keys; $env:PBSSU_TEST_DATABASE_STATE=(Resolve-Path '.cache/m01-f/database.json').Path; npm run test:integration` | 3 files, 11 tests passed against M01-F; existing M01 DB not targeted |
| `npm run build` | Passed |
| `node --import tsx scripts/check-scope.ts` | Passed: 22 tables / 40 approved operations |
| OpenAPI contract tests in `npm test` | Passed with the unit suite; contract reference/schema and operation-to-controller checks passed |
| `git diff --check` | Passed; Git emitted only the existing LF-to-CRLF working-copy notice for `docs/api/openapi.json` |

Migration recovery result: the existing guarded `down` operation was attempted on the fresh M01-F database and safely refused because migration `002-permission-catalog` seeds rows in `app.permissions`; the guard requires every app table to be empty before rollback. The schema remained intact and the 22-table/40-key/order/RLS checks passed again after refusal. A full up/down/up cycle is therefore **not verified**. No guard was bypassed and no protected audit data was removed. The current migrations have no separately verified end-to-end downgrade path for the migration-seeded catalogue; resolving that requires a reviewed migration/recovery design change.

## Limitations and remaining risks

- The full up/down/up migration cycle remains unverified as described above. Production-like migration recovery remains a gate until the rollback policy is revised and tested without weakening protections.
- Integration runs use synthetic `example.invalid` users and tenants only. Immutable audit records intentionally retain some inactive synthetic users and tenant metadata in the disposable database; no real operational or personal data is present.
- The HTTP smoke test did not exercise a real-user onboarding or outbound provider. The mock mailbox is not exposed as an API endpoint; its synthetic delivery access is restricted to the test harness.
- Local signing/encryption keys live in ignored development state. Windows ACL behavior, external key management, production rate limiting, TLS termination, provider delivery, and production deployment security were not tested.
- No incident, dispatch, reporting, mobile, web dashboard, GPS/media, cloud, or production integration workflows were implemented or tested.

## Safety and scope

No public service bind, real identity, real outbound message, production credential, cloud resource, deployment or push was performed. Only M01-labeled disposable local database resources were modified. The API remains loopback-bound, production mode is rejected, and mail mode is fixed to the controlled mock adapter. The authorized local baseline commit, if created after all gates, is recorded in the completion report and final handoff.
