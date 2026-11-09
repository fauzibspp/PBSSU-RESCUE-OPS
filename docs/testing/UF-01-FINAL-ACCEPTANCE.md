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

| Check                                                                              | Result                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test -- --run`                                                                | PASS, 30 tests / 3 files                                                                                                                                                                                                                                                         |
| `npm test -- --run apps/api/test/contract.test.ts`                                 | PASS, 12 tests / 1 file; includes local schema compilation and UF-01 contract/scope checks                                                                                                                                                                                       |
| `PBSSU_TEST_DATABASE_STATE=.cache/sprint4a/database.json npm run test:integration` | PASS, 44 tests / 6 files; read-only preflight confirmed isolated Sprint 4-A database inventory before tests                                                                                                                                                                      |
| `npm run scope:sprint3a`                                                           | PASS; frozen inventory and 75 operation IDs                                                                                                                                                                                                                                      |
| `npm run scope:sprint3b`                                                           | PASS; seven Sprint 3 operations and exact permission parity                                                                                                                                                                                                                      |
| `npm run scope:sprint3c`                                                           | PASS; frozen Sprint 3 inventory and 75 operation IDs                                                                                                                                                                                                                             |
| `npm run scope:sprint4a`                                                           | PASS; exact Sprint 4 scope and 75 operations                                                                                                                                                                                                                                     |
| `npm run lint`                                                                     | PASS                                                                                                                                                                                                                                                                             |
| `npm run typecheck`                                                                | PASS, API and web                                                                                                                                                                                                                                                                |
| `npm run build` / `npm run build:web`                                              | PASS                                                                                                                                                                                                                                                                             |
| Targeted Prettier check for changed files                                          | PASS                                                                                                                                                                                                                                                                             |
| `npm run format:check`                                                             | PASS; all configured files pass Prettier                                                                                                                                                                                                                                         |
| Headed Edge browser suite, desktop plus Pixel 7 emulation                          | PASS, 10 passed / 0 skipped. Covered valid/invalid login and MFA, enrollment, refresh, tenant switching, six-role presentation/access checks, platform-only denial, read-only incident views, browser-cookie expiry recovery, logout, accessibility, and desktop/mobile layouts. |
| `npx --yes @redocly/cli@1.34.5 lint docs/api/openapi.json --format stylish`        | PASS standards-aware OpenAPI validation; one non-blocking `info-license` warning (the Info object has no license field)                                                                                                                                                          |
| `git diff --check`                                                                 | PASS                                                                                                                                                                                                                                                                             |

The final browser run used a compiled NestJS API on loopback port 3383, Vite on
loopback port 5200, Microsoft Edge desktop and Pixel 7 emulation, and the
guarded synthetic Sprint 4-A database. The API startup was checked with the
real unauthenticated `/incidents` application response (401), not TCP
reachability alone. The exact trusted web origin matched the browser origin.
Earlier failed attempts used a mismatched trusted origin and returned 403 at
the handoff boundary; after correcting only the local test server origin, all
10 selected browser tests passed. That first run was a test-environment
configuration failure, not a security bypass or code workaround.

Browser screenshots are synthetic-only and ignored by Git under
`artifacts/browser/`. Playwright automatic traces, screenshots and video were
disabled for credential flows. The one-time MFA setup test did not capture a
screenshot or trace; failure diagnostics redact the setup material and
handoff identifier.

## HTTP and authorization evidence

- Actual Nest HTTP integration tests covered originless same-origin GETs with
  CSRF double-submit and `Sec-Fetch-Site` protections, trusted/malformed
  Referer, null/untrusted Origin, missing/contradictory Fetch Metadata,
  unsupported methods, missing/invalid CSRF, revoked/expired authentication,
  no-store responses, and cross-site denial. Originless access is limited to
  safe GETs and is accepted only with a session-bound cookie authentication
  path and matching CSRF cookie/header; supplied Origin or Referer must match
  the configured origin, and supplied Fetch Metadata must be `same-origin`.
  Fetch Metadata/Referer are defense-in-depth signals, not standalone proof.
- Existing integration coverage includes tenant-only privileged MFA,
  membership projection, cross-tenant denial, role/RLS behavior and incident
  read authorization. The browser fixture uses synthetic tenant Commander
  accounts only and cannot grant authority; the API remains authoritative.
- Browser tests exercised generic invalid-password and invalid-TOTP messages,
  valid TOTP, session cookie handoff, membership selection, switching between
  two synthetic tenants, absence of the previous tenant's incident, read-only
  detail, refresh after reload, cleared-cookie expiry recovery, logout followed
  by protected-route denial, and the five approved tenant role templates plus
  a platform-only identity. Field Responder's assigned-only list remains empty
  without assignment evidence. Organization Admin receives no incident write
  capability; role checks are also enforced by API permissions, not navigation.
- The browser test suite collected only sanitized paths/statuses for network
  assertions. It did not collect bodies, credential values, cookie values,
  TOTP codes, or session tokens.

## Visual and accessibility review

Headed Edge screenshots were inspected for the desktop and Pixel 7 emulated
layouts. Login and incident pages rendered without observed horizontal
overflow; organization selection, role summary, incident status and read-only
detail were legible at both sizes. Mobile navigation wraps as a compact
organization selector/navigation section and exposes a visible sign-out
control. Axe-core WCAG 2.1 A/AA automated checks passed on login, MFA,
enrollment and authenticated incident views. Keyboard focus was exercised on
the sign-in page. Authenticated role navigation was checked for Organization
Admin, Control Room Operator, Incident Commander, Field Responder, and
Read-Only Auditor; platform-only access was denied.

Screenshots: `artifacts/browser/desktop-edge-login.png`,
`artifacts/browser/mobile-edge-login.png`,
`artifacts/browser/desktop-edge-authenticated-incidents.png`, and
`artifacts/browser/mobile-edge-authenticated-incidents.png`. They contain
synthetic records only. Playwright traces and video remain disabled for
credential-bearing flows. No failed browser trace was produced in the final
run. Browser console/page errors and unexpected failed requests were zero.

Manual screen-reader review was NOT EXECUTED because no screen-reader tool was
available. Browser cookie-loss recovery was tested by clearing the cookie jar
in memory; true server-side expiry and revocation are covered by the real HTTP
integration suite, not simulated by browser timers. Mobile logout was exercised
in the mobile browser project. Automated axe checks do not replace manual
assistive-technology review.

## Contract and implementation limits

- OpenAPI references/components pass the existing Ajv JSON Schema 2020-12
  contract tests. Redocly CLI 1.34.5 also validated OpenAPI 3.1 with one
  non-blocking missing `info.license` warning.
- `npm run format:check` passed; there is no current nine-file formatting
  failure in this run.
- Production KMS/key rotation, production logging behavior, deployment and
  recovery ownership remain unverified.
- M01-R01, Q-05, Q-06 and Q-08 remain open. Auditor cancellation-reason
  retrieval remains deferred. Assignment-dependent Field Responder access
  remains fail-closed pending the approved backend evidence path.
- The UI is a read-only operational review surface and must not be represented
  as an emergency dispatch system.
