# UF-01 Final Acceptance Evidence

**Status: CONDITIONAL PASS for local development.** The approved three UI
increments are implemented on `feat/uf-01-secure-web-foundation`. Core API,
database, security, build and headed-browser checks passed. Limitations listed
below remain open; this is not production readiness or deployment approval.

## Frozen scope

- Seven routes: `/login`, `/mfa`, `/mfa/enroll`, `/app`,
  `/app/organizations`, `/app/incidents`, and `/app/incidents/:incidentId`.
- Ten existing operations only: `login`, `verifyMfa`, `startMfaEnrollment`,
  `confirmMfaEnrollment`, `redeemCredentialHandoff`, `refreshSession`,
  `revokeSession`, `listMyMemberships`, `listIncidents`, `getIncident`.
- No new backend operation, permission, role, database entity, or migration.
- Incident views are read-only; no assignment, vehicle, movement, dispatch,
  lifecycle mutation, GPS, media, notification, offline, or reporting controls.

The response schemas and role-code projection are detailed in the
[contract reconciliation](../api/UF-01-CONTRACT-RECONCILIATION.md). The MFA
enrollment handoff remains purpose-bound and one-time. Setup material is shown
only on the enrollment page and held in page memory; access and refresh tokens
remain in secure server cookies. The client stores no credential/token in
local or session storage. Organization changes clear incident state and
tenant-bound requests are guarded against stale responses.

## Executed checks

| Check                                                                              | Result                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test -- --run`                                                                | PASS, 30 tests / 3 files                                                                                                                                                                                                                                                                          |
| `npm test -- --run apps/api/test/contract.test.ts`                                 | PASS, 12 tests / 1 file; includes local schema compilation and UF-01 contract/scope checks                                                                                                                                                                                                        |
| `PBSSU_TEST_DATABASE_STATE=.cache/sprint4a/database.json npm run test:integration` | PASS, 44 tests / 6 files; read-only preflight confirmed isolated Sprint 4-A database inventory before tests                                                                                                                                                                                       |
| `npm run scope:sprint3a`                                                           | PASS; frozen inventory and 75 operation IDs                                                                                                                                                                                                                                                       |
| `npm run scope:sprint3b`                                                           | PASS; seven Sprint 3 operations and exact permission parity                                                                                                                                                                                                                                       |
| `npm run scope:sprint3c`                                                           | PASS; frozen Sprint 3 inventory and 75 operation IDs                                                                                                                                                                                                                                              |
| `npm run scope:sprint4a`                                                           | PASS; exact Sprint 4 scope and 75 operations                                                                                                                                                                                                                                                      |
| `npm run lint`                                                                     | PASS                                                                                                                                                                                                                                                                                              |
| `npm run typecheck`                                                                | PASS, API and web                                                                                                                                                                                                                                                                                 |
| `npm run build` / `npm run build:web`                                              | PASS                                                                                                                                                                                                                                                                                              |
| Targeted Prettier check for changed files                                          | PASS                                                                                                                                                                                                                                                                                              |
| `npm run format:check`                                                             | FAIL on nine existing, untouched files; no unrelated files were reformatted                                                                                                                                                                                                                       |
| Headed Edge browser suite, desktop plus Pixel 7 emulation                          | PASS, 7 passed / 1 skipped. Covered login rendering, unauthenticated deep-link denial, real WEB login/MFA/tenant switch/read-only incident list and logout on desktop; mobile covered login, deep link, tenant switch and read-only incidents. One-time MFA enrollment test runs on desktop only. |
| Headed Edge privileged MFA enrollment test                                         | PASS, 1 test. Synthetic tenant Commander completed login challenge, setup handoff redemption, TOTP confirmation, second-factor verification and session establishment.                                                                                                                            |
| `git diff --check`                                                                 | PASS                                                                                                                                                                                                                                                                                              |

The browser runs used the existing compiled NestJS API on loopback port 3359,
Vite on loopback port 5199, and the guarded synthetic Sprint 4-A database. The
browser command exited 0 and reported all selected tests passed. On Windows,
Playwright's nested npm web-server wrapper did not terminate Vite cleanly on
its own; the test-owned Vite process was stopped by its exact PID after the
test results appeared. No other process or Docker resource was stopped.

Browser screenshots are synthetic-only and ignored by Git under
`artifacts/browser/`. Playwright automatic traces, screenshots and video were
disabled for credential flows. The one-time MFA setup test did not capture a
screenshot or trace; failure diagnostics redact the setup material and
handoff identifier.

## HTTP and authorization evidence

- Actual Nest HTTP integration tests covered originless same-origin GETs with
  CSRF double-submit and `Sec-Fetch-Site` protections, plus cross-site denial.
- Existing integration coverage includes tenant-only privileged MFA,
  membership projection, cross-tenant denial, role/RLS behavior and incident
  read authorization. The browser fixture uses synthetic tenant Commander
  accounts only and cannot grant authority; the API remains authoritative.
- Browser tests exercised generic invalid-password and invalid-TOTP messages,
  valid TOTP, session cookie handoff, membership selection, switching between
  two synthetic tenants, absence of the previous tenant's incident, read-only
  detail, and desktop logout followed by protected-route denial.
- The browser test suite collected only sanitized paths/statuses for network
  assertions. It did not collect bodies, credential values, cookie values,
  TOTP codes, or session tokens.

## Visual and accessibility review

Headed Edge screenshots were inspected for the desktop and Pixel 7 emulated
layouts. Login and incident pages rendered without observed horizontal
overflow; organization selection, role summary, incident status and read-only
detail were legible at both sizes. Mobile navigation wraps as a compact
organization selector/navigation section and exposes a visible sign-out
control. Keyboard focus was exercised on the sign-in page.

No axe/WCAG audit or full manual screen-reader review was run. Keyboard review
is limited to the tested login focus path. Browser-level session-expiry,
Auditor/Organization Admin/Field Responder denial permutations, and mobile
logout interaction were not independently exercised in this UI suite; backend
tests remain the authority for API access.

## Contract and implementation limits

- OpenAPI references/components are checked by the existing Ajv JSON Schema
  2020-12 contract tests. No dedicated OpenAPI 3.1 standards linter is
  installed, so full OAS conformance is not claimed.
- Production KMS/key rotation, production logging behavior, deployment and
  recovery ownership remain unverified.
- M01-R01, Q-05, Q-06 and Q-08 remain open. Auditor cancellation-reason
  retrieval remains deferred. Assignment-dependent Field Responder access
  remains fail-closed pending the approved backend evidence path.
- The UI is a read-only operational review surface and must not be represented
  as an emergency dispatch system.
