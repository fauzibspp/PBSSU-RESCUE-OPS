# Sprint 3-E MFA Remediation Validation

Date: 2026-11-08
Branch: `feat/sprint-3-incident-backend`
Base: Sprint 3-D commit `9fd2a4b6bdb26a61ca0370ee7d9e85e648acbcf0`

## Root cause and fix under test

`IdentityService.login()` previously queried `memberships`, `membership_roles`, and `role_permissions` through the identity connection without setting `app.actor_user_id` or `app.organization_id`. FORCE RLS therefore hid tenant role rows. The fixture in `incident.http.integration.test.ts` also attached the `listOrganizations` platform grant, so the tested Commander reached MFA through a separate platform grant and did not expose the tenant-only failure.

The identity role has the existing `own_membership_metadata` RLS policy in migration 001: it can select memberships for the trusted `app.actor_user_id`. `IdentityService.requiresPrivilegedMfaInTransaction()` now uses that policy to discover only the authenticated subject's active membership tenant IDs, establishes each trusted tenant context in turn, and checks the existing permission catalog for `requires_privileged_mfa`. It checks platform grants independently. Missing query results and database errors fail closed; the client cannot submit actor, role, or tenant authority into this lookup.

The helper restores prior transaction-local actor and tenant settings, so invitation flows can reuse it without changing their surrounding transaction context. Standalone checks use one checked-out identity connection in an explicit transaction. Login, recent-MFA checks, and invitation acceptance/activation use the same lookup. No security-definer function, role, permission, migration, table, or API operation was added.

## HTTP identities and outcomes

All identities and records below were synthetic and created in the isolated local Sprint 3-D test database. Requests ran through the Nest application, actual password verification, MFA challenge/TOTP verification, handoff redemption, JWT/session checks, selected-tenant authorization, and restricted runtime database connection. No test authenticator or guard override was used.

| Identity | Grants | Actual result |
| --- | --- | --- |
| Tenant-only Incident Commander | Active Commander membership; no platform grant | Password login returned `MFA_VERIFY`; valid TOTP and handoff succeeded; existing HTTP incident route tests passed. |
| Tenant-only Control Room Operator | Active Operator membership; no platform grant | Password login returned `MFA_VERIFY`; valid TOTP/handoff succeeded; incident listing in the authorized tenant succeeded. |
| Multi-tenant Operator | Operator in tenant A; membership without operational grants in tenant B | MFA was required due to tenant A; post-MFA incident read in tenant B was denied. |
| Ordinary Field Responder | Responder membership; no platform grant | Password-only handoff was issued; incident creation was denied with HTTP 403. |
| Platform-only administrator | MFA-protected platform grant; no tenant membership | MFA was required; an expired challenge was rejected; after valid TOTP, tenant incident read remained denied. |
| Privilege-discovery failure probe | Tenant-only Commander; identity role temporarily denied membership SELECT | HTTP login failed with a generic 500; no tenant/database details or email were returned, and session/challenge/handoff counts did not change. The SELECT grant was restored in `finally`. |

The tenant-only Commander and Operator fixtures do not contain any platform grant. The only platform grant used in this suite belongs to the separate platform-only identity.

## Executed validation

| Command | Result |
| --- | --- |
| `$env:PBSSU_IDENTITY_KEY_FILE=Join-Path $env:LOCALAPPDATA 'PBSSU-RESCUE-OPS\sprint3b-identity-keys.json'; $env:PBSSU_TEST_DATABASE_STATE=(Resolve-Path '.cache/sprint3d/database.json').Path; npm run test:integration -- --run apps/api/test/incident.http.integration.test.ts` | PASS: 1 file, 6 tests, including the real HTTP privilege-query failure injection. |
| Same environment; `npm run test:integration` | PASS: 5 files, 36 tests, including identity/MFA, restricted-role RLS, incident/location, audit and regression coverage. |
| `npm test` | PASS: 2 files, 17 unit/contract tests. |
| `npm run format` | PASS; formatted the two changed TypeScript files. |
| `npm run format:check` | PASS. |
| `npm run lint` | PASS. |
| `npm run typecheck` | PASS. |
| `npm run build` | PASS. |
| `git diff --check` | PASS. |

The tests used the existing `.cache/sprint3d/database.json` isolated local test resource and local development encryption key; no migration was introduced or rerun. The development key remains outside the repository. No production key management property is implied.

## Evidence limits and remaining risks

- The HTTP suite verifies challenge purpose, successful TOTP flows, expired challenge rejection, assurance-gated access and tenant isolation. Existing MFA integration coverage exercises successful TOTP proof and handoff. Production identity-provider, deployment, logging, and key-management behavior were not tested.
- The failure test temporarily revokes `SELECT` on `app.memberships` from the identity role in the isolated test database to force a privilege-discovery query error. It verifies a generic failure and no session/challenge/handoff mutation, then restores the grant in `finally`. The test does not emulate production database outages or observability infrastructure.
- The suite does not claim a formal security audit or production readiness.
- Sprint 3 scope remains seven incident/location operations and three incident tables. No API, permission, role, table, or migration inventory changed.
- Existing M01-R01, Q-05, Q-06 and Q-08 remain open. Auditor cancellation-reason retrieval and Sprint 4 assignment evidence remain deferred.
