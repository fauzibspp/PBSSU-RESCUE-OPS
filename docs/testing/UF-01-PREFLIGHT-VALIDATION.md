# UF-01 Contract Recovery and Preflight Validation

**Result: PASS — frozen implementation scope is clear for UF-01A/B/C.** The
Project Owner authorized the bounded contract reconciliation and local UI
implementation on 2026-11-08. No new operation, permission, role, or database
entity was introduced.

## Baseline

- Branch: `feat/uf-01-secure-web-foundation`
- Pre-reconciliation HEAD: `357bedad9ef81933ecf57300a6cf4c92dac29f28`
- Base: verified `origin/main` `6d7249b15aae43804feaf9bc0befaa4011f5d6a0`
- Sprint 4 commit is included in `origin/main`; PR #4 is merged.
- The two unrelated root attachments remain untracked and untouched.
- Local visual workflow prerequisite commits are in branch ancestry.

## Reconciled responses

### MFA enrollment

`MfaEnrollment` now matches `IdentityService.startMfaEnrollment()`:

- `enrollment_id`
- `handoff` containing the UUID handle, `TOTP_SETUP` purpose, and expiry
- `authentication_state: CHALLENGE_REQUIRED`

No secret, seed, URI, QR, recovery value, or session token is present in this
generic response. The dedicated one-time, client-bound handoff endpoint alone
releases synthetic TOTP setup material under its approved vendor content type.
`startMfaReplacement` has a separate schema describing its additional
challenge metadata. The shared administrative Membership contract remains
unchanged; the self-membership operation has dedicated schemas matching its
actual projection.

The OpenAPI-documented 200/202 status codes are now returned for the relevant
auth operations. The earlier HTTP run caught absent no-store headers on
enrollment; the controller now sends the documented `Cache-Control: no-store`
and `Pragma: no-cache` headers. MFA and membership semantics are detailed in
the [reconciliation record](../api/UF-01-CONTRACT-RECONCILIATION.md).

### Membership and navigation

`GET /me/memberships` now documents the actual self-service fields:
`membership_id`, organization id/name/slug/status, display name, membership
status, availability, and role summaries (`code`, `name`). Existing role-code
syntax and the five Q-01 tenant templates are preserved. Known template codes
may shape navigation display only; custom/unknown codes produce no operational
navigation. The API remains the sole authorization authority. Platform
Super Admin has no implicit tenant membership or incident access.

## Actual checks

| Command/check                                                                             | Result                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test -- --run apps/api/test/contract.test.ts`                                        | PASS, 12 tests; all component schemas compiled; positive/negative MFA and membership examples; administrative Membership schema unchanged; exact frozen UF-01 scope check                                                                                   |
| `npm run test:integration` with `PBSSU_TEST_DATABASE_STATE=.cache/sprint4a/database.json` | PASS, 6 files / 43 tests on the guarded loopback-only Sprint 4-A synthetic database; includes actual Nest HTTP membership response, tenant-only Commander login/enrollment/handoff/confirmation, other auth, tenant/RBAC, and incident/location regressions |
| `npm run scope:sprint3a`                                                                  | PASS: frozen Sprint 3-A table and 75-operation invariants                                                                                                                                                                                                   |
| `npm run scope:sprint3b`                                                                  | PASS: seven Sprint 3 operations, exact incident/location permissions and no expansion                                                                                                                                                                       |
| `npm run scope:sprint3c`                                                                  | PASS: frozen Sprint 3-C inventory and 75 OpenAPI operations                                                                                                                                                                                                 |
| `npm run scope:sprint4a`                                                                  | PASS: 75 unique operations; exact Sprint 4 inventory and permission parity                                                                                                                                                                                  |
| `npm test -- --run`                                                                       | PASS, 30 tests across three files after authorized fingerprint-delta reconciliation; includes the frozen seven-route/ten-operation UF-01 inventory                                                                                                          |
| `npm run typecheck`                                                                       | PASS (API and web; no diagnostics)                                                                                                                                                                                                                          |
| `npm run lint`, `npm run build`, `npm run build:web`                                      | PASS after controller status/cache correction                                                                                                                                                                                                               |
| Targeted `npx prettier --check` on changed source, contract and document files            | PASS                                                                                                                                                                                                                                                        |
| `npm run format:check` (whole repository)                                                 | Reports 15 existing unmodified files as unformatted. No unrelated files were reformatted; every UF-01 changed file passes the targeted check.                                                                                                               |
| Relative link check, JSON parse, `git diff --check`                                       | PASS                                                                                                                                                                                                                                                        |
| Dedicated OpenAPI linter                                                                  | Not installed (`npm ls @redocly/cli @apidevtools/swagger-parser swagger-cli --depth=0` reports empty). Ajv 2020-12 compiles every component schema and local references resolve; full OAS 3.1 lint is not claimed.                                          |

The first full integration attempt passed 42/43; the only failure was the
missing no-store header assertion. After the controller correction, the repeat
passed 43/43. No test authentication bypass or database reset was used. The
database preflight ran read-only; tests used synthetic UUID identities and
records in the existing isolated test database.

OpenAPI component/reference compilation is standards-aware JSON Schema 2020-12
structural validation through Ajv. No dedicated OpenAPI 3.1 linter was present
or executed, so full OpenAPI standard conformance is not claimed.

## Scope gate

The approved exact scope remains seven browser routes and ten existing API
operations in [`UF-01-SCOPE.v1.json`](../planning/UF-01-SCOPE.v1.json): login,
MFA, session lifecycle, self-membership/organization selection, role-aware
navigation, and read-only incident list/detail. Zero backend operation IDs,
permissions, roles, or database entities are added. No incident/resource
mutation or dispatch interface is included.

The scope is frozen for implementation. UI behavior, browser cookie/CSRF
integration, screenshots, accessibility, and product Playwright cases are not
yet run; those are UF-01A/B/C implementation acceptance gates.
